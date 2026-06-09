import { Injectable } from '@nestjs/common';
import {
  MonetaryLedgerEntry,
  MonetaryLedgerSource,
  Prisma,
  SeedlingOrder,
  SeedlingOrderStatus,
  SeedUnit,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AlreadyVoidedError, EntityNotFoundError } from '../common/errors';
import { businessDateAfterDays, todayBusinessDate } from '../common/utils/date.util';
import { normalizeName } from '../common/utils/normalize.util';
import { MonetaryLedgerService } from '../monetary-ledger/monetary-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';

export interface CreateSeedlingOrderInput {
  customerId: string;
  plantName: string;
  seedGiven: boolean;
  seedPlantName?: string | null;
  seedAmount?: number | null;
  seedUnit?: SeedUnit | null;
  requestedPickupDate: Date;
  note?: string | null;
  actorPhone?: string | null;
}

export interface CreateSeedlingDebtInput {
  customerId: string;
  relatedOrderId?: string | null;
  plantName: string;
  unitPriceKurus: number;
  seedlingCount: number;
  description: string;
  actorPhone?: string | null;
}

const ACTIVE_ORDER_FILTER: Prisma.SeedlingOrderWhereInput = {
  isVoided: false,
  deletedAt: null,
};

const OPEN_STATUSES: SeedlingOrderStatus[] = [
  SeedlingOrderStatus.PENDING,
  SeedlingOrderStatus.REMINDED,
];

@Injectable()
export class SeedlingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly monetaryLedger: MonetaryLedgerService,
    private readonly reminders: RemindersService,
  ) {}

  /**
   * Creates a seedling order. Orders never create debt by themselves;
   * the debt is recorded separately (usually at delivery time).
   */
  async createOrder(input: CreateSeedlingOrderInput): Promise<SeedlingOrder> {
    const plantName = input.plantName.trim().replace(/\s+/g, ' ');

    const order = await this.prisma.seedlingOrder.create({
      data: {
        customerId: input.customerId,
        plantName,
        normalizedPlantName: normalizeName(plantName),
        seedGiven: input.seedGiven,
        seedPlantName: input.seedGiven ? (input.seedPlantName?.trim() ?? null) : null,
        seedAmount:
          input.seedGiven && input.seedAmount != null
            ? new Prisma.Decimal(input.seedAmount)
            : null,
        seedUnit: input.seedGiven ? (input.seedUnit ?? null) : null,
        requestedPickupDate: input.requestedPickupDate,
        note: input.note?.trim() || null,
      },
    });

    await this.audit.record({
      action: 'SEEDLING_ORDER_CREATED',
      entityType: 'SeedlingOrder',
      entityId: order.id,
      actorPhone: input.actorPhone,
      newValue: {
        customerId: input.customerId,
        plantName,
        seedGiven: input.seedGiven,
        requestedPickupDate: input.requestedPickupDate.toISOString(),
      },
    });

    // 3 days before the requested pickup date
    await this.reminders.scheduleForSeedlingOrder(order);

    return order;
  }

  /**
   * Records seedling debt as a MONETARY debt:
   * total = unit price x seedling count.
   */
  async createSeedlingDebt(input: CreateSeedlingDebtInput): Promise<MonetaryLedgerEntry> {
    const totalKurus = input.unitPriceKurus * input.seedlingCount;

    return this.monetaryLedger.addDebt({
      customerId: input.customerId,
      amountKurus: totalKurus,
      description: input.description,
      source: MonetaryLedgerSource.SEEDLING_DEBT,
      relatedSeedlingOrderId: input.relatedOrderId ?? null,
      actorPhone: input.actorPhone,
    });
  }

  async getById(id: string): Promise<SeedlingOrder> {
    const order = await this.prisma.seedlingOrder.findFirst({
      where: { id, deletedAt: null },
    });
    if (!order) {
      throw new EntityNotFoundError('SeedlingOrder', id);
    }
    return order;
  }

  /** Open (pending/reminded) orders of a customer, soonest pickup first. */
  async openOrdersForCustomer(customerId: string): Promise<SeedlingOrder[]> {
    return this.prisma.seedlingOrder.findMany({
      where: { customerId, ...ACTIVE_ORDER_FILTER, status: { in: OPEN_STATUSES } },
      orderBy: { requestedPickupDate: 'asc' },
    });
  }

  async ordersForCustomer(
    customerId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<SeedlingOrder[]> {
    return this.prisma.seedlingOrder.findMany({
      where: {
        customerId,
        ...ACTIVE_ORDER_FILTER,
        createdAt: range ? { gte: range.from, lte: range.to } : undefined,
      },
      orderBy: { requestedPickupDate: 'asc' },
    });
  }

  /** Open orders with pickup date within the next `days` days. */
  async upcomingOrders(days: number): Promise<
    (SeedlingOrder & { customer: { baseName: string; identifier: string | null } })[]
  > {
    return this.prisma.seedlingOrder.findMany({
      where: {
        ...ACTIVE_ORDER_FILTER,
        status: { in: OPEN_STATUSES },
        requestedPickupDate: { gte: todayBusinessDate(), lte: businessDateAfterDays(days) },
      },
      include: { customer: { select: { baseName: true, identifier: true } } },
      orderBy: { requestedPickupDate: 'asc' },
    });
  }

  async ordersCreatedInRange(from: Date, to: Date): Promise<
    (SeedlingOrder & { customer: { baseName: string; identifier: string | null } })[]
  > {
    const fromInstant = from;
    const toInstant = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.seedlingOrder.findMany({
      where: { ...ACTIVE_ORDER_FILTER, createdAt: { gte: fromInstant, lt: toInstant } },
      include: { customer: { select: { baseName: true, identifier: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markStatus(
    id: string,
    status: SeedlingOrderStatus,
    actorPhone?: string | null,
  ): Promise<SeedlingOrder> {
    const order = await this.getById(id);
    const updated = await this.prisma.seedlingOrder.update({
      where: { id },
      data: { status },
    });

    await this.audit.record({
      action: `SEEDLING_ORDER_${status}`,
      entityType: 'SeedlingOrder',
      entityId: id,
      actorPhone,
      oldValue: { status: order.status },
      newValue: { status },
    });

    if (status === SeedlingOrderStatus.DELIVERED || status === SeedlingOrderStatus.CANCELLED) {
      await this.reminders.cancelForTarget(id);
    }

    return updated;
  }

  async voidOrder(id: string, reason: string | null, actorPhone?: string | null): Promise<void> {
    const order = await this.getById(id);
    if (order.isVoided) {
      throw new AlreadyVoidedError('SeedlingOrder', id);
    }

    await this.prisma.seedlingOrder.update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidReason: reason,
        status: SeedlingOrderStatus.VOIDED,
      },
    });

    await this.audit.record({
      action: 'SEEDLING_ORDER_VOIDED',
      entityType: 'SeedlingOrder',
      entityId: id,
      actorPhone,
      reason,
    });

    await this.reminders.cancelForTarget(id);
  }

  async softDeleteOrder(id: string, reason: string, actorPhone?: string | null): Promise<void> {
    await this.getById(id);
    await this.prisma.seedlingOrder.update({
      where: { id },
      data: { deletedAt: new Date(), voidReason: reason },
    });

    await this.audit.record({
      action: 'SEEDLING_ORDER_DELETED',
      entityType: 'SeedlingOrder',
      entityId: id,
      actorPhone,
      reason,
    });

    await this.reminders.cancelForTarget(id);
  }
}
