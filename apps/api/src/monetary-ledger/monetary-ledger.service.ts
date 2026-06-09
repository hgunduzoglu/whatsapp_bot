import { Injectable } from '@nestjs/common';
import {
  MonetaryLedgerEntry,
  MonetaryLedgerSource,
  MonetaryLedgerType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AlreadyVoidedError, EntityNotFoundError } from '../common/errors';
import { todayBusinessDate } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';

export interface LedgerEntryInput {
  customerId: string;
  amountKurus: number;
  description?: string | null;
  source?: MonetaryLedgerSource;
  businessDate?: Date;
  actorPhone?: string | null;
  relatedSeedlingOrderId?: string | null;
}

/** Entries that count towards the balance. */
const ACTIVE_FILTER: Prisma.MonetaryLedgerEntryWhereInput = {
  isVoided: false,
  deletedAt: null,
};

const POSITIVE_TYPES: MonetaryLedgerType[] = [
  MonetaryLedgerType.DEBT,
  MonetaryLedgerType.ADJUSTMENT_INCREASE,
];

@Injectable()
export class MonetaryLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async addDebt(input: LedgerEntryInput): Promise<MonetaryLedgerEntry> {
    return this.createEntry(MonetaryLedgerType.DEBT, input);
  }

  async addPayment(input: LedgerEntryInput): Promise<MonetaryLedgerEntry> {
    return this.createEntry(MonetaryLedgerType.PAYMENT, input);
  }

  async addAdjustment(
    direction: 'INCREASE' | 'DECREASE',
    input: LedgerEntryInput,
  ): Promise<MonetaryLedgerEntry> {
    const type =
      direction === 'INCREASE'
        ? MonetaryLedgerType.ADJUSTMENT_INCREASE
        : MonetaryLedgerType.ADJUSTMENT_DECREASE;
    return this.createEntry(type, { ...input, source: MonetaryLedgerSource.CORRECTION });
  }

  private async createEntry(
    type: MonetaryLedgerType,
    input: LedgerEntryInput,
  ): Promise<MonetaryLedgerEntry> {
    const entry = await this.prisma.monetaryLedgerEntry.create({
      data: {
        customerId: input.customerId,
        type,
        source: input.source ?? MonetaryLedgerSource.WHATSAPP,
        amountKurus: input.amountKurus,
        description: input.description?.trim() || null,
        businessDate: input.businessDate ?? todayBusinessDate(),
        createdByPhone: input.actorPhone ?? null,
        relatedSeedlingOrderId: input.relatedSeedlingOrderId ?? null,
      },
    });

    await this.audit.record({
      action: `MONETARY_${type}_CREATED`,
      entityType: 'MonetaryLedgerEntry',
      entityId: entry.id,
      actorPhone: input.actorPhone,
      newValue: {
        customerId: entry.customerId,
        amountKurus: entry.amountKurus,
        type,
        description: entry.description,
      },
    });

    return entry;
  }

  /**
   * Current monetary balance in kurus. Positive means the customer owes money.
   * balance = debts + adjustment increases - payments - adjustment decreases
   */
  async balance(customerId: string): Promise<number> {
    const sums = await this.prisma.monetaryLedgerEntry.groupBy({
      by: ['type'],
      where: { customerId, ...ACTIVE_FILTER },
      _sum: { amountKurus: true },
    });

    return sums.reduce((total, row) => {
      const amount = row._sum.amountKurus ?? 0;
      return POSITIVE_TYPES.includes(row.type) ? total + amount : total - amount;
    }, 0);
  }

  /** Balances for all customers, keyed by customer id. */
  async balancesByCustomer(): Promise<Map<string, number>> {
    const sums = await this.prisma.monetaryLedgerEntry.groupBy({
      by: ['customerId', 'type'],
      where: ACTIVE_FILTER,
      _sum: { amountKurus: true },
    });

    const balances = new Map<string, number>();
    for (const row of sums) {
      const amount = row._sum.amountKurus ?? 0;
      const signed = POSITIVE_TYPES.includes(row.type) ? amount : -amount;
      balances.set(row.customerId, (balances.get(row.customerId) ?? 0) + signed);
    }
    return balances;
  }

  async entriesForCustomer(
    customerId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<MonetaryLedgerEntry[]> {
    return this.prisma.monetaryLedgerEntry.findMany({
      where: {
        customerId,
        ...ACTIVE_FILTER,
        businessDate: { gte: range?.from, lte: range?.to },
      },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async entriesInRange(from: Date, to: Date): Promise<
    (MonetaryLedgerEntry & { customer: { baseName: string; identifier: string | null } })[]
  > {
    return this.prisma.monetaryLedgerEntry.findMany({
      where: { ...ACTIVE_FILTER, businessDate: { gte: from, lte: to } },
      include: { customer: { select: { baseName: true, identifier: true } } },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getById(entryId: string): Promise<MonetaryLedgerEntry> {
    const entry = await this.prisma.monetaryLedgerEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });
    if (!entry) {
      throw new EntityNotFoundError('MonetaryLedgerEntry', entryId);
    }
    return entry;
  }

  /** Marks an entry as voided so it no longer affects the balance. */
  async voidEntry(
    entryId: string,
    reason: string | null,
    actorPhone?: string | null,
  ): Promise<MonetaryLedgerEntry> {
    const entry = await this.getById(entryId);
    if (entry.isVoided) {
      throw new AlreadyVoidedError('MonetaryLedgerEntry', entryId);
    }

    const voided = await this.prisma.monetaryLedgerEntry.update({
      where: { id: entryId },
      data: { isVoided: true, voidedAt: new Date(), voidReason: reason },
    });

    await this.audit.record({
      action: 'MONETARY_ENTRY_VOIDED',
      entityType: 'MonetaryLedgerEntry',
      entityId: entryId,
      actorPhone,
      reason,
      oldValue: { amountKurus: entry.amountKurus, type: entry.type },
    });

    return voided;
  }

  /** Soft-deletes an entry. A reason is mandatory for deletions. */
  async softDeleteEntry(
    entryId: string,
    reason: string,
    actorPhone?: string | null,
  ): Promise<void> {
    const entry = await this.getById(entryId);

    await this.prisma.monetaryLedgerEntry.update({
      where: { id: entryId },
      data: { deletedAt: new Date(), voidReason: reason },
    });

    await this.audit.record({
      action: 'MONETARY_ENTRY_DELETED',
      entityType: 'MonetaryLedgerEntry',
      entityId: entryId,
      actorPhone,
      reason,
      oldValue: { amountKurus: entry.amountKurus, type: entry.type },
    });
  }
}
