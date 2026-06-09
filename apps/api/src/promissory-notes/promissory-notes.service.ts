import { Injectable } from '@nestjs/common';
import { Prisma, PromissoryNote, PromissoryNoteStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AlreadyVoidedError, EntityNotFoundError } from '../common/errors';
import { businessDateAfterDays, todayBusinessDate } from '../common/utils/date.util';
import { normalizeName } from '../common/utils/normalize.util';
import { PrismaService } from '../prisma/prisma.service';

export interface CreatePromissoryNoteInput {
  payeeName: string;
  amountKurus: number;
  dueDate: Date;
  note?: string | null;
  actorPhone?: string | null;
}

const ACTIVE_NOTE_FILTER: Prisma.PromissoryNoteWhereInput = {
  isVoided: false,
  deletedAt: null,
};

/**
 * Promissory notes are the OWNER's own debts to suppliers — not customer
 * debts. They never appear in any customer balance.
 */
@Injectable()
export class PromissoryNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreatePromissoryNoteInput): Promise<PromissoryNote> {
    const payeeName = input.payeeName.trim().replace(/\s+/g, ' ');

    const note = await this.prisma.promissoryNote.create({
      data: {
        payeeName,
        normalizedPayeeName: normalizeName(payeeName),
        amountKurus: input.amountKurus,
        dueDate: input.dueDate,
        note: input.note?.trim() || null,
      },
    });

    await this.audit.record({
      action: 'PROMISSORY_NOTE_CREATED',
      entityType: 'PromissoryNote',
      entityId: note.id,
      actorPhone: input.actorPhone,
      newValue: {
        payeeName,
        amountKurus: input.amountKurus,
        dueDate: input.dueDate.toISOString(),
      },
    });

    return note;
  }

  async getById(id: string): Promise<PromissoryNote> {
    const note = await this.prisma.promissoryNote.findFirst({
      where: { id, deletedAt: null },
    });
    if (!note) {
      throw new EntityNotFoundError('PromissoryNote', id);
    }
    return note;
  }

  /** All unpaid notes, due-date order. */
  async listPending(): Promise<PromissoryNote[]> {
    return this.prisma.promissoryNote.findMany({
      where: { ...ACTIVE_NOTE_FILTER, status: PromissoryNoteStatus.PENDING },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Unpaid notes due within the next `days` days. */
  async listUpcoming(days: number): Promise<PromissoryNote[]> {
    return this.prisma.promissoryNote.findMany({
      where: {
        ...ACTIVE_NOTE_FILTER,
        status: PromissoryNoteStatus.PENDING,
        dueDate: { gte: todayBusinessDate(), lte: businessDateAfterDays(days) },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async listPaid(limit = 20): Promise<PromissoryNote[]> {
    return this.prisma.promissoryNote.findMany({
      where: { ...ACTIVE_NOTE_FILTER, status: PromissoryNoteStatus.PAID },
      orderBy: { paidAt: 'desc' },
      take: limit,
    });
  }

  async notesCreatedInRange(from: Date, to: Date): Promise<PromissoryNote[]> {
    const toInstant = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.promissoryNote.findMany({
      where: { ...ACTIVE_NOTE_FILTER, createdAt: { gte: from, lt: toInstant } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markPaid(id: string, actorPhone?: string | null): Promise<PromissoryNote> {
    const note = await this.getById(id);

    const updated = await this.prisma.promissoryNote.update({
      where: { id },
      data: { status: PromissoryNoteStatus.PAID, paidAt: new Date() },
    });

    await this.audit.record({
      action: 'PROMISSORY_NOTE_PAID',
      entityType: 'PromissoryNote',
      entityId: id,
      actorPhone,
      oldValue: { status: note.status },
      newValue: { status: PromissoryNoteStatus.PAID },
    });

    return updated;
  }

  async voidNote(id: string, reason: string | null, actorPhone?: string | null): Promise<void> {
    const note = await this.getById(id);
    if (note.isVoided) {
      throw new AlreadyVoidedError('PromissoryNote', id);
    }

    await this.prisma.promissoryNote.update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidReason: reason,
        status: PromissoryNoteStatus.VOIDED,
      },
    });

    await this.audit.record({
      action: 'PROMISSORY_NOTE_VOIDED',
      entityType: 'PromissoryNote',
      entityId: id,
      actorPhone,
      reason,
    });
  }

  async softDeleteNote(id: string, reason: string, actorPhone?: string | null): Promise<void> {
    await this.getById(id);
    await this.prisma.promissoryNote.update({
      where: { id },
      data: { deletedAt: new Date(), voidReason: reason },
    });

    await this.audit.record({
      action: 'PROMISSORY_NOTE_DELETED',
      entityType: 'PromissoryNote',
      entityId: id,
      actorPhone,
      reason,
    });
  }
}
