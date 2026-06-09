import { ProductCategory, ProductPurchaseStatus, QuantityUnit } from '@prisma/client';
import { ExcessiveQuantityError, HasActivePaymentsError } from '../src/common/errors';
import { CustomersService } from '../src/customers/customers.service';
import { MonetaryLedgerService } from '../src/monetary-ledger/monetary-ledger.service';
import { ProductDebtsService } from '../src/product-debts/product-debts.service';
import { ProductPaymentsService } from '../src/product-payments/product-payments.service';
import { createTestApp, resetDatabase, TestApp } from './test-app';

describe('Product debts and payments (integration)', () => {
  let testApp: TestApp;
  let customers: CustomersService;
  let productDebts: ProductDebtsService;
  let productPayments: ProductPaymentsService;
  let ledger: MonetaryLedgerService;
  let customerId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    customers = testApp.app.get(CustomersService);
    productDebts = testApp.app.get(ProductDebtsService);
    productPayments = testApp.app.get(ProductPaymentsService);
    ledger = testApp.app.get(MonetaryLedgerService);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    const customer = await customers.create({ baseName: 'Mehmet Ali' });
    customerId = customer.id;
  });

  async function createPurchase() {
    return productDebts.createPurchase({
      customerId,
      items: [
        {
          productName: 'X ilacı',
          category: ProductCategory.MEDICINE,
          quantity: 3,
          unit: QuantityUnit.PIECE,
        },
        {
          productName: 'Y gübresi',
          category: ProductCategory.FERTILIZER,
          quantity: 5,
          unit: QuantityUnit.SACK,
        },
      ],
    });
  }

  it('creates a multi-item purchase with full remaining quantities', async () => {
    const purchase = await createPurchase();
    expect(purchase.items).toHaveLength(2);
    expect(purchase.items[0].remainingQuantity.toNumber()).toBe(3);
    expect(purchase.status).toBe(ProductPurchaseStatus.OPEN);
  });

  it('the estimated amount never touches the monetary balance', async () => {
    await productDebts.createPurchase({
      customerId,
      items: [
        {
          productName: 'X ilacı',
          category: ProductCategory.MEDICINE,
          quantity: 1,
          unit: QuantityUnit.PIECE,
        },
      ],
      estimatedAmountKurus: 500_000,
    });

    expect(await ledger.balance(customerId)).toBe(0);
  });

  it('partial payment reduces remaining quantity and sets PARTIALLY_PAID', async () => {
    const purchase = await createPurchase();
    const item = purchase.items[0];

    await productPayments.createPayment({
      customerId,
      allocations: [{ productPurchaseItemId: item.id, paidQuantity: 1, amountKurus: 200_000 }],
    });

    const updatedItem = await testApp.prisma.productPurchaseItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(updatedItem.remainingQuantity.toNumber()).toBe(2);

    const updatedPurchase = await productDebts.getPurchaseById(purchase.id);
    expect(updatedPurchase.status).toBe(ProductPurchaseStatus.PARTIALLY_PAID);
  });

  it('product payments never touch the monetary balance', async () => {
    await ledger.addDebt({ customerId, amountKurus: 5_000_000 });
    const purchase = await createPurchase();

    await productPayments.createPayment({
      customerId,
      allocations: [
        { productPurchaseItemId: purchase.items[0].id, paidQuantity: 3, amountKurus: 10_000_000 },
      ],
    });

    // 50.000 TL debt stays exactly as it was
    expect(await ledger.balance(customerId)).toBe(5_000_000);
  });

  it('rejects settling more than the open quantity', async () => {
    const purchase = await createPurchase();

    await expect(
      productPayments.createPayment({
        customerId,
        allocations: [{ productPurchaseItemId: purchase.items[0].id, paidQuantity: 4 }],
      }),
    ).rejects.toBeInstanceOf(ExcessiveQuantityError);

    // The failed transaction must not have changed anything
    const item = await testApp.prisma.productPurchaseItem.findUniqueOrThrow({
      where: { id: purchase.items[0].id },
    });
    expect(item.remainingQuantity.toNumber()).toBe(3);
  });

  it('fully paid purchases become PAID', async () => {
    const purchase = await createPurchase();
    await productPayments.createPayment({
      customerId,
      allocations: [
        { productPurchaseItemId: purchase.items[0].id, paidQuantity: 3 },
        { productPurchaseItemId: purchase.items[1].id, paidQuantity: 5 },
      ],
    });

    const updated = await productDebts.getPurchaseById(purchase.id);
    expect(updated.status).toBe(ProductPurchaseStatus.PAID);
  });

  it('voiding a payment restores the remaining quantities', async () => {
    const purchase = await createPurchase();
    const payment = await productPayments.createPayment({
      customerId,
      allocations: [{ productPurchaseItemId: purchase.items[0].id, paidQuantity: 2 }],
    });

    await productPayments.voidPayment(payment.id, 'wrong entry');

    const item = await testApp.prisma.productPurchaseItem.findUniqueOrThrow({
      where: { id: purchase.items[0].id },
    });
    expect(item.remainingQuantity.toNumber()).toBe(3);

    const updatedPurchase = await productDebts.getPurchaseById(purchase.id);
    expect(updatedPurchase.status).toBe(ProductPurchaseStatus.OPEN);
  });

  it('refuses to void a purchase that has active payments', async () => {
    const purchase = await createPurchase();
    await productPayments.createPayment({
      customerId,
      allocations: [{ productPurchaseItemId: purchase.items[0].id, paidQuantity: 1 }],
    });

    await expect(productDebts.voidPurchase(purchase.id, 'mistake')).rejects.toBeInstanceOf(
      HasActivePaymentsError,
    );
  });

  it('allows voiding a purchase after its payments are voided', async () => {
    const purchase = await createPurchase();
    const payment = await productPayments.createPayment({
      customerId,
      allocations: [{ productPurchaseItemId: purchase.items[0].id, paidQuantity: 1 }],
    });

    await productPayments.voidPayment(payment.id, null);
    await productDebts.voidPurchase(purchase.id, 'no longer needed');

    const updated = await testApp.prisma.productPurchase.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    expect(updated.isVoided).toBe(true);
    expect(updated.status).toBe(ProductPurchaseStatus.VOIDED);
  });
});
