import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductCategory,
  ProductPurchase,
  ProductPurchaseItem,
  ProductPurchaseStatus,
  QuantityUnit,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  AlreadyVoidedError,
  EntityNotFoundError,
  HasActivePaymentsError,
} from '../common/errors';
import { todayBusinessDate } from '../common/utils/date.util';
import { normalizeName } from '../common/utils/normalize.util';
import { PrismaService } from '../prisma/prisma.service';

export interface PurchaseItemInput {
  productName: string;
  category: ProductCategory;
  quantity: number;
  unit: QuantityUnit;
}

export interface CreatePurchaseInput {
  customerId: string;
  items: PurchaseItemInput[];
  note?: string | null;
  estimatedAmountKurus?: number | null;
  businessDate?: Date;
  actorPhone?: string | null;
}

export type PurchaseWithItems = ProductPurchase & { items: ProductPurchaseItem[] };
export type OpenPurchaseItem = ProductPurchaseItem & {
  productPurchase: Pick<ProductPurchase, 'id' | 'businessDate'>;
};

/** Purchases that still count: not voided, not deleted. */
const ACTIVE_PURCHASE_FILTER: Prisma.ProductPurchaseWhereInput = {
  isVoided: false,
  deletedAt: null,
};

@Injectable()
export class ProductDebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records a shopping entry with one or more product line items.
   * The optional estimated amount is informational only and never touches
   * the monetary ledger.
   */
  async createPurchase(input: CreatePurchaseInput): Promise<PurchaseWithItems> {
    const purchase = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productPurchase.create({
        data: {
          customerId: input.customerId,
          businessDate: input.businessDate ?? todayBusinessDate(),
          note: input.note?.trim() || null,
          estimatedAmountKurus: input.estimatedAmountKurus ?? null,
        },
      });

      for (const item of input.items) {
        const name = item.productName.trim().replace(/\s+/g, ' ');
        const normalized = normalizeName(name);

        // Maintain the product catalog as a side effect of data entry
        const product = await tx.product.upsert({
          where: { normalizedName_category: { normalizedName: normalized, category: item.category } },
          create: {
            name,
            normalizedName: normalized,
            category: item.category,
            defaultUnit: item.unit,
          },
          update: {},
        });

        await tx.productPurchaseItem.create({
          data: {
            productPurchaseId: created.id,
            productId: product.id,
            productName: name,
            normalizedProductName: normalized,
            category: item.category,
            quantity: new Prisma.Decimal(item.quantity),
            remainingQuantity: new Prisma.Decimal(item.quantity),
            unit: item.unit,
          },
        });
      }

      await this.audit.record(
        {
          action: 'PRODUCT_PURCHASE_CREATED',
          entityType: 'ProductPurchase',
          entityId: created.id,
          actorPhone: input.actorPhone,
          newValue: {
            customerId: input.customerId,
            items: input.items.map((item) => ({
              productName: item.productName,
              quantity: item.quantity,
              unit: item.unit,
            })),
            estimatedAmountKurus: input.estimatedAmountKurus ?? null,
          },
        },
        tx,
      );

      return tx.productPurchase.findUniqueOrThrow({
        where: { id: created.id },
        include: { items: true },
      });
    });

    return purchase;
  }

  /** Open line items (remaining quantity > 0) for a customer, oldest first. */
  async openItemsForCustomer(customerId: string): Promise<OpenPurchaseItem[]> {
    return this.prisma.productPurchaseItem.findMany({
      where: {
        deletedAt: null,
        remainingQuantity: { gt: 0 },
        productPurchase: { customerId, ...ACTIVE_PURCHASE_FILTER },
      },
      include: { productPurchase: { select: { id: true, businessDate: true } } },
      orderBy: [{ productPurchase: { businessDate: 'asc' } }, { createdAt: 'asc' }],
    });
  }

  /** All active purchases of a customer with their items, for statements. */
  async purchasesForCustomer(
    customerId: string,
    range?: { from?: Date; to?: Date },
  ): Promise<PurchaseWithItems[]> {
    return this.prisma.productPurchase.findMany({
      where: {
        customerId,
        ...ACTIVE_PURCHASE_FILTER,
        businessDate: { gte: range?.from, lte: range?.to },
      },
      include: { items: { where: { deletedAt: null } } },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async purchasesInRange(from: Date, to: Date): Promise<
    (PurchaseWithItems & { customer: { baseName: string; identifier: string | null } })[]
  > {
    return this.prisma.productPurchase.findMany({
      where: { ...ACTIVE_PURCHASE_FILTER, businessDate: { gte: from, lte: to } },
      include: {
        items: { where: { deletedAt: null } },
        customer: { select: { baseName: true, identifier: true } },
      },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Open items across all customers, grouped for the open-debts report. */
  async allOpenItems(): Promise<
    (OpenPurchaseItem & {
      productPurchase: {
        id: string;
        businessDate: Date;
        customer: { baseName: string; identifier: string | null };
      };
    })[]
  > {
    return this.prisma.productPurchaseItem.findMany({
      where: {
        deletedAt: null,
        remainingQuantity: { gt: 0 },
        productPurchase: ACTIVE_PURCHASE_FILTER,
      },
      include: {
        productPurchase: {
          select: {
            id: true,
            businessDate: true,
            customer: { select: { baseName: true, identifier: true } },
          },
        },
      },
      orderBy: [{ productPurchase: { businessDate: 'asc' } }, { createdAt: 'asc' }],
    });
  }

  async getPurchaseById(id: string): Promise<PurchaseWithItems> {
    const purchase = await this.prisma.productPurchase.findFirst({
      where: { id, deletedAt: null },
      include: { items: { where: { deletedAt: null } } },
    });
    if (!purchase) {
      throw new EntityNotFoundError('ProductPurchase', id);
    }
    return purchase;
  }

  /**
   * Voids a purchase. Refused while any of its items has active payments —
   * those payments must be voided first, otherwise the books would show
   * payments against a debt that no longer exists.
   */
  async voidPurchase(id: string, reason: string | null, actorPhone?: string | null): Promise<void> {
    const purchase = await this.getPurchaseById(id);
    if (purchase.isVoided) {
      throw new AlreadyVoidedError('ProductPurchase', id);
    }

    const activePayments = await this.prisma.productPaymentItem.count({
      where: {
        deletedAt: null,
        productPurchaseItem: { productPurchaseId: id },
        productPayment: { isVoided: false, deletedAt: null },
      },
    });
    if (activePayments > 0) {
      throw new HasActivePaymentsError('ProductPurchase', id);
    }

    await this.prisma.productPurchase.update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidReason: reason,
        status: ProductPurchaseStatus.VOIDED,
      },
    });

    await this.audit.record({
      action: 'PRODUCT_PURCHASE_VOIDED',
      entityType: 'ProductPurchase',
      entityId: id,
      actorPhone,
      reason,
    });
  }

  /** Soft-deletes a purchase. Reason is mandatory; same payment guard as void. */
  async softDeletePurchase(id: string, reason: string, actorPhone?: string | null): Promise<void> {
    const purchase = await this.getPurchaseById(id);

    const activePayments = await this.prisma.productPaymentItem.count({
      where: {
        deletedAt: null,
        productPurchaseItem: { productPurchaseId: id },
        productPayment: { isVoided: false, deletedAt: null },
      },
    });
    if (!purchase.isVoided && activePayments > 0) {
      throw new HasActivePaymentsError('ProductPurchase', id);
    }

    await this.prisma.productPurchase.update({
      where: { id },
      data: { deletedAt: new Date(), voidReason: reason },
    });

    await this.audit.record({
      action: 'PRODUCT_PURCHASE_DELETED',
      entityType: 'ProductPurchase',
      entityId: id,
      actorPhone,
      reason,
    });
  }

  /**
   * Recomputes the OPEN / PARTIALLY_PAID / PAID status of a purchase from its
   * items. Runs inside the caller's transaction.
   */
  async recomputeStatus(purchaseId: string, tx: Prisma.TransactionClient): Promise<void> {
    const items = await tx.productPurchaseItem.findMany({
      where: { productPurchaseId: purchaseId, deletedAt: null },
      select: { quantity: true, remainingQuantity: true },
    });
    if (items.length === 0) {
      return;
    }

    const allOpen = items.every((item) => item.remainingQuantity.equals(item.quantity));
    const allPaid = items.every((item) => item.remainingQuantity.isZero());
    const status = allPaid
      ? ProductPurchaseStatus.PAID
      : allOpen
        ? ProductPurchaseStatus.OPEN
        : ProductPurchaseStatus.PARTIALLY_PAID;

    await tx.productPurchase.updateMany({
      where: { id: purchaseId, isVoided: false },
      data: { status },
    });
  }
}
