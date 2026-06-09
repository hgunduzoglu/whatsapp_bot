import { Injectable } from '@nestjs/common';
import { Prisma, ProductPayment, ProductPaymentItem, ProductPurchaseItem } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  AlreadyVoidedError,
  EntityNotFoundError,
  ExcessiveQuantityError,
} from '../common/errors';
import { todayBusinessDate } from '../common/utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { ProductDebtsService } from '../product-debts/product-debts.service';

export interface PaymentAllocationInput {
  productPurchaseItemId: string;
  paidQuantity: number;
  /** Accounting value of this allocation in kurus. Informational only. */
  amountKurus?: number | null;
}

export interface CreateProductPaymentInput {
  customerId: string;
  allocations: PaymentAllocationInput[];
  note?: string | null;
  businessDate?: Date;
  actorPhone?: string | null;
}

export type PaymentWithItems = ProductPayment & {
  items: (ProductPaymentItem & { productPurchaseItem: ProductPurchaseItem })[];
};

@Injectable()
export class ProductPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly productDebts: ProductDebtsService,
  ) {}

  /**
   * Settles open product debt items, fully or partially.
   *
   * IMPORTANT: product payments never touch the monetary ledger. The TL value
   * entered by the user is stored for accounting reports only.
   */
  async createPayment(input: CreateProductPaymentInput): Promise<PaymentWithItems> {
    return this.prisma.$transaction(async (tx) => {
      const totalAmountKurus = input.allocations.reduce(
        (sum, allocation) => sum + (allocation.amountKurus ?? 0),
        0,
      );

      const payment = await tx.productPayment.create({
        data: {
          customerId: input.customerId,
          businessDate: input.businessDate ?? todayBusinessDate(),
          totalAmountKurus,
          note: input.note?.trim() || null,
        },
      });

      const touchedPurchaseIds = new Set<string>();

      for (const allocation of input.allocations) {
        const item = await tx.productPurchaseItem.findFirst({
          where: { id: allocation.productPurchaseItemId, deletedAt: null },
        });
        if (!item) {
          throw new EntityNotFoundError('ProductPurchaseItem', allocation.productPurchaseItemId);
        }

        const paid = new Prisma.Decimal(allocation.paidQuantity);

        // Guarded decrement: refuses to settle more than what is open.
        const updated = await tx.productPurchaseItem.updateMany({
          where: { id: item.id, remainingQuantity: { gte: paid } },
          data: { remainingQuantity: { decrement: paid } },
        });
        if (updated.count === 0) {
          throw new ExcessiveQuantityError(
            allocation.paidQuantity,
            item.remainingQuantity.toNumber(),
          );
        }

        await tx.productPaymentItem.create({
          data: {
            productPaymentId: payment.id,
            productPurchaseItemId: item.id,
            paidQuantity: paid,
            amountKurus: allocation.amountKurus ?? null,
          },
        });

        touchedPurchaseIds.add(item.productPurchaseId);
      }

      for (const purchaseId of touchedPurchaseIds) {
        await this.productDebts.recomputeStatus(purchaseId, tx);
      }

      await this.audit.record(
        {
          action: 'PRODUCT_PAYMENT_CREATED',
          entityType: 'ProductPayment',
          entityId: payment.id,
          actorPhone: input.actorPhone,
          newValue: {
            customerId: input.customerId,
            totalAmountKurus,
            allocations: input.allocations.map((a) => ({
              productPurchaseItemId: a.productPurchaseItemId,
              paidQuantity: a.paidQuantity,
              amountKurus: a.amountKurus ?? null,
            })),
          },
        },
        tx,
      );

      return tx.productPayment.findUniqueOrThrow({
        where: { id: payment.id },
        include: { items: { include: { productPurchaseItem: true } } },
      });
    });
  }

  async paymentsForCustomer(
    customerId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<PaymentWithItems[]> {
    return this.prisma.productPayment.findMany({
      where: {
        customerId,
        isVoided: false,
        deletedAt: null,
        businessDate: { gte: range?.from, lte: range?.to },
      },
      include: { items: { include: { productPurchaseItem: true } } },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async paymentsInRange(from: Date, to: Date): Promise<
    (PaymentWithItems & { customer: { baseName: string; identifier: string | null } })[]
  > {
    return this.prisma.productPayment.findMany({
      where: { isVoided: false, deletedAt: null, businessDate: { gte: from, lte: to } },
      include: {
        items: { include: { productPurchaseItem: true } },
        customer: { select: { baseName: true, identifier: true } },
      },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getById(id: string): Promise<PaymentWithItems> {
    const payment = await this.prisma.productPayment.findFirst({
      where: { id, deletedAt: null },
      include: { items: { include: { productPurchaseItem: true } } },
    });
    if (!payment) {
      throw new EntityNotFoundError('ProductPayment', id);
    }
    return payment;
  }

  /**
   * Voids a payment and RESTORES the settled quantities back onto the
   * purchase items, so open amounts stay consistent.
   */
  async voidPayment(id: string, reason: string | null, actorPhone?: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.productPayment.findFirst({
        where: { id, deletedAt: null },
        include: { items: { where: { deletedAt: null } } },
      });
      if (!payment) {
        throw new EntityNotFoundError('ProductPayment', id);
      }
      if (payment.isVoided) {
        throw new AlreadyVoidedError('ProductPayment', id);
      }

      const touchedPurchaseIds = new Set<string>();
      for (const item of payment.items) {
        const purchaseItem = await tx.productPurchaseItem.update({
          where: { id: item.productPurchaseItemId },
          data: { remainingQuantity: { increment: item.paidQuantity } },
        });
        touchedPurchaseIds.add(purchaseItem.productPurchaseId);
      }

      await tx.productPayment.update({
        where: { id },
        data: { isVoided: true, voidedAt: new Date(), voidReason: reason },
      });

      for (const purchaseId of touchedPurchaseIds) {
        await this.productDebts.recomputeStatus(purchaseId, tx);
      }

      await this.audit.record(
        {
          action: 'PRODUCT_PAYMENT_VOIDED',
          entityType: 'ProductPayment',
          entityId: id,
          actorPhone,
          reason,
          oldValue: { totalAmountKurus: payment.totalAmountKurus },
        },
        tx,
      );
    });
  }

  /** Soft-deletes a payment, restoring quantities exactly like a void. */
  async softDeletePayment(id: string, reason: string, actorPhone?: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.productPayment.findFirst({
        where: { id, deletedAt: null },
        include: { items: { where: { deletedAt: null } } },
      });
      if (!payment) {
        throw new EntityNotFoundError('ProductPayment', id);
      }

      // A voided payment already gave its quantities back
      if (!payment.isVoided) {
        const touchedPurchaseIds = new Set<string>();
        for (const item of payment.items) {
          const purchaseItem = await tx.productPurchaseItem.update({
            where: { id: item.productPurchaseItemId },
            data: { remainingQuantity: { increment: item.paidQuantity } },
          });
          touchedPurchaseIds.add(purchaseItem.productPurchaseId);
        }
        for (const purchaseId of touchedPurchaseIds) {
          await this.productDebts.recomputeStatus(purchaseId, tx);
        }
      }

      await tx.productPayment.update({
        where: { id },
        data: { deletedAt: new Date(), voidReason: reason },
      });

      await this.audit.record(
        {
          action: 'PRODUCT_PAYMENT_DELETED',
          entityType: 'ProductPayment',
          entityId: id,
          actorPhone,
          reason,
        },
        tx,
      );
    });
  }
}
