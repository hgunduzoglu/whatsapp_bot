import { Injectable } from '@nestjs/common';
import { MonetaryLedgerType } from '@prisma/client';
import { MonetaryLedgerService } from '../monetary-ledger/monetary-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductDebtsService } from '../product-debts/product-debts.service';
import { ProductPaymentsService } from '../product-payments/product-payments.service';
import { PromissoryNotesService } from '../promissory-notes/promissory-notes.service';
import { SeedlingsService } from '../seedlings/seedlings.service';

export type TransactionKind =
  | 'MONETARY_ENTRY'
  | 'PRODUCT_PURCHASE'
  | 'PRODUCT_PAYMENT'
  | 'SEEDLING_ORDER'
  | 'PROMISSORY_NOTE';

export interface RecentTransaction {
  kind: TransactionKind;
  id: string;
  createdAt: Date;
  businessDate: Date | null;
  customerLabel: string | null;
  amountKurus: number | null;
  monetaryType: MonetaryLedgerType | null;
  /** Short content summary, e.g. product list or plant/payee name. */
  detail: string | null;
}

const label = (customer: { baseName: string; identifier: string | null }): string =>
  customer.identifier ? `${customer.baseName} - ${customer.identifier}` : customer.baseName;

/**
 * Cross-entity view of recent critical operations, used by the bot's
 * undo/delete menu. Void/delete is delegated to the owning service so all
 * consistency rules (quantity restore, payment guards) apply.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: MonetaryLedgerService,
    private readonly productDebts: ProductDebtsService,
    private readonly productPayments: ProductPaymentsService,
    private readonly seedlings: SeedlingsService,
    private readonly notes: PromissoryNotesService,
  ) {}

  async recentTransactions(limit = 5): Promise<RecentTransaction[]> {
    const activeFilter = { isVoided: false, deletedAt: null } as const;

    const [entries, purchases, payments, orders, notes] = await Promise.all([
      this.prisma.monetaryLedgerEntry.findMany({
        where: activeFilter,
        include: { customer: { select: { baseName: true, identifier: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.productPurchase.findMany({
        where: activeFilter,
        include: {
          customer: { select: { baseName: true, identifier: true } },
          items: { where: { deletedAt: null } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.productPayment.findMany({
        where: activeFilter,
        include: { customer: { select: { baseName: true, identifier: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.seedlingOrder.findMany({
        where: activeFilter,
        include: { customer: { select: { baseName: true, identifier: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.promissoryNote.findMany({
        where: activeFilter,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const transactions: RecentTransaction[] = [
      ...entries.map(
        (entry): RecentTransaction => ({
          kind: 'MONETARY_ENTRY',
          id: entry.id,
          createdAt: entry.createdAt,
          businessDate: entry.businessDate,
          customerLabel: label(entry.customer),
          amountKurus: entry.amountKurus,
          monetaryType: entry.type,
          detail: entry.description,
        }),
      ),
      ...purchases.map(
        (purchase): RecentTransaction => ({
          kind: 'PRODUCT_PURCHASE',
          id: purchase.id,
          createdAt: purchase.createdAt,
          businessDate: purchase.businessDate,
          customerLabel: label(purchase.customer),
          amountKurus: null,
          monetaryType: null,
          detail: purchase.items.map((item) => item.productName).join(', '),
        }),
      ),
      ...payments.map(
        (payment): RecentTransaction => ({
          kind: 'PRODUCT_PAYMENT',
          id: payment.id,
          createdAt: payment.createdAt,
          businessDate: payment.businessDate,
          customerLabel: label(payment.customer),
          amountKurus: payment.totalAmountKurus,
          monetaryType: null,
          detail: null,
        }),
      ),
      ...orders.map(
        (order): RecentTransaction => ({
          kind: 'SEEDLING_ORDER',
          id: order.id,
          createdAt: order.createdAt,
          businessDate: order.requestedPickupDate,
          customerLabel: label(order.customer),
          amountKurus: null,
          monetaryType: null,
          detail: order.plantName,
        }),
      ),
      ...notes.map(
        (note): RecentTransaction => ({
          kind: 'PROMISSORY_NOTE',
          id: note.id,
          createdAt: note.createdAt,
          businessDate: note.dueDate,
          customerLabel: null,
          amountKurus: note.amountKurus,
          monetaryType: null,
          detail: note.payeeName,
        }),
      ),
    ];

    return transactions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async lastTransaction(): Promise<RecentTransaction | null> {
    const [latest] = await this.recentTransactions(1);
    return latest ?? null;
  }

  /** Voids (undoes) a transaction through its owning service. */
  async voidTransaction(
    kind: TransactionKind,
    id: string,
    reason: string | null,
    actorPhone?: string | null,
  ): Promise<void> {
    switch (kind) {
      case 'MONETARY_ENTRY':
        await this.ledger.voidEntry(id, reason, actorPhone);
        return;
      case 'PRODUCT_PURCHASE':
        await this.productDebts.voidPurchase(id, reason, actorPhone);
        return;
      case 'PRODUCT_PAYMENT':
        await this.productPayments.voidPayment(id, reason, actorPhone);
        return;
      case 'SEEDLING_ORDER':
        await this.seedlings.voidOrder(id, reason, actorPhone);
        return;
      case 'PROMISSORY_NOTE':
        await this.notes.voidNote(id, reason, actorPhone);
        return;
    }
  }

  /** Soft-deletes a transaction. A reason is mandatory. */
  async deleteTransaction(
    kind: TransactionKind,
    id: string,
    reason: string,
    actorPhone?: string | null,
  ): Promise<void> {
    switch (kind) {
      case 'MONETARY_ENTRY':
        await this.ledger.softDeleteEntry(id, reason, actorPhone);
        return;
      case 'PRODUCT_PURCHASE':
        await this.productDebts.softDeletePurchase(id, reason, actorPhone);
        return;
      case 'PRODUCT_PAYMENT':
        await this.productPayments.softDeletePayment(id, reason, actorPhone);
        return;
      case 'SEEDLING_ORDER':
        await this.seedlings.softDeleteOrder(id, reason, actorPhone);
        return;
      case 'PROMISSORY_NOTE':
        await this.notes.softDeleteNote(id, reason, actorPhone);
        return;
    }
  }
}
