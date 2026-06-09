import { Injectable } from '@nestjs/common';
import { Customer, MonetaryLedgerEntry, PromissoryNote, SeedlingOrder } from '@prisma/client';
import { businessDateAfterDays, todayBusinessDate } from '../common/utils/date.util';
import { MonetaryLedgerService } from '../monetary-ledger/monetary-ledger.service';
import {
  OpenPurchaseItem,
  ProductDebtsService,
  PurchaseWithItems,
} from '../product-debts/product-debts.service';
import { PaymentWithItems, ProductPaymentsService } from '../product-payments/product-payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PromissoryNotesService } from '../promissory-notes/promissory-notes.service';
import { SeedlingsService } from '../seedlings/seedlings.service';

type WithCustomer<T> = T & { customer: { baseName: string; identifier: string | null } };

export interface ActivitySummary {
  from: Date;
  to: Date;
  monetaryEntries: WithCustomer<MonetaryLedgerEntry>[];
  productPurchases: WithCustomer<PurchaseWithItems>[];
  productPayments: WithCustomer<PaymentWithItems>[];
  seedlingOrders: WithCustomer<SeedlingOrder>[];
  promissoryNotes: PromissoryNote[];
}

export interface ReceivableLine {
  customer: Customer;
  balanceKurus: number;
}

export interface CustomerStatement {
  customer: Customer;
  balanceKurus: number;
  monetaryEntries: MonetaryLedgerEntry[];
  productPurchases: PurchaseWithItems[];
  productPayments: PaymentWithItems[];
  seedlingOrders: SeedlingOrder[];
  openItems: OpenPurchaseItem[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: MonetaryLedgerService,
    private readonly productDebts: ProductDebtsService,
    private readonly productPayments: ProductPaymentsService,
    private readonly seedlings: SeedlingsService,
    private readonly notes: PromissoryNotesService,
  ) {}

  /** All activity between two business dates (inclusive). */
  async activitySummary(from: Date, to: Date): Promise<ActivitySummary> {
    const [monetaryEntries, productPurchases, productPayments, seedlingOrders, promissoryNotes] =
      await Promise.all([
        this.ledger.entriesInRange(from, to),
        this.productDebts.purchasesInRange(from, to),
        this.productPayments.paymentsInRange(from, to),
        this.seedlings.ordersCreatedInRange(from, to),
        this.notes.notesCreatedInRange(from, to),
      ]);

    return { from, to, monetaryEntries, productPurchases, productPayments, seedlingOrders, promissoryNotes };
  }

  async dailySummary(): Promise<ActivitySummary> {
    const today = todayBusinessDate();
    return this.activitySummary(today, today);
  }

  async weeklySummary(): Promise<ActivitySummary> {
    return this.activitySummary(businessDateAfterDays(-6), todayBusinessDate());
  }

  /** Customers with a positive monetary balance, largest first. */
  async receivables(): Promise<{ total: number; lines: ReceivableLine[] }> {
    const balances = await this.ledger.balancesByCustomer();
    const positiveIds = [...balances.entries()]
      .filter(([, balance]) => balance > 0)
      .map(([customerId]) => customerId);

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: positiveIds }, deletedAt: null },
    });

    const lines = customers
      .map((customer) => ({ customer, balanceKurus: balances.get(customer.id) ?? 0 }))
      .sort((a, b) => b.balanceKurus - a.balanceKurus);

    return {
      total: lines.reduce((sum, line) => sum + line.balanceKurus, 0),
      lines,
    };
  }

  async openProductDebts(): Promise<
    Awaited<ReturnType<ProductDebtsService['allOpenItems']>>
  > {
    return this.productDebts.allOpenItems();
  }

  async upcomingSeedlingDeliveries(days = 30): Promise<
    Awaited<ReturnType<SeedlingsService['upcomingOrders']>>
  > {
    return this.seedlings.upcomingOrders(days);
  }

  async upcomingPromissoryNotes(days = 30): Promise<PromissoryNote[]> {
    return this.notes.listUpcoming(days);
  }

  async customerStatement(
    customerId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<CustomerStatement> {
    const customer = await this.prisma.customer.findFirstOrThrow({
      where: { id: customerId, deletedAt: null },
    });

    const [balanceKurus, monetaryEntries, productPurchases, productPayments, seedlingOrders, openItems] =
      await Promise.all([
        this.ledger.balance(customerId),
        this.ledger.entriesForCustomer(customerId, range),
        this.productDebts.purchasesForCustomer(customerId, range),
        this.productPayments.paymentsForCustomer(customerId, range),
        this.seedlings.ordersForCustomer(customerId, range),
        this.productDebts.openItemsForCustomer(customerId),
      ]);

    return {
      customer,
      balanceKurus,
      monetaryEntries,
      productPurchases,
      productPayments,
      seedlingOrders,
      openItems,
    };
  }
}
