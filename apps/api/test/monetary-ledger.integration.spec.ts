import { CustomersService } from '../src/customers/customers.service';
import { MonetaryLedgerService } from '../src/monetary-ledger/monetary-ledger.service';
import { createTestApp, resetDatabase, TestApp } from './test-app';

describe('Monetary ledger (integration)', () => {
  let testApp: TestApp;
  let customers: CustomersService;
  let ledger: MonetaryLedgerService;
  let customerId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    customers = testApp.app.get(CustomersService);
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

  it('computes the balance from debts and payments', async () => {
    await ledger.addDebt({ customerId, amountKurus: 230_000 });
    await ledger.addDebt({ customerId, amountKurus: 100_000 });
    await ledger.addPayment({ customerId, amountKurus: 50_000 });

    expect(await ledger.balance(customerId)).toBe(280_000);
  });

  it('allows overpayment resulting in a negative balance', async () => {
    await ledger.addDebt({ customerId, amountKurus: 50_000 });
    await ledger.addPayment({ customerId, amountKurus: 100_000 });

    expect(await ledger.balance(customerId)).toBe(-50_000);
  });

  it('voiding an entry restores the balance', async () => {
    const debt = await ledger.addDebt({ customerId, amountKurus: 230_000 });
    expect(await ledger.balance(customerId)).toBe(230_000);

    await ledger.voidEntry(debt.id, 'wrong amount');
    expect(await ledger.balance(customerId)).toBe(0);
  });

  it('soft-deleted entries do not count towards the balance', async () => {
    const debt = await ledger.addDebt({ customerId, amountKurus: 100_000 });
    await ledger.softDeleteEntry(debt.id, 'entered by mistake');
    expect(await ledger.balance(customerId)).toBe(0);
  });

  it('adjustments move the balance in both directions', async () => {
    await ledger.addDebt({ customerId, amountKurus: 100_000 });
    await ledger.addAdjustment('INCREASE', { customerId, amountKurus: 20_000 });
    await ledger.addAdjustment('DECREASE', { customerId, amountKurus: 50_000 });

    expect(await ledger.balance(customerId)).toBe(70_000);
  });

  it('writes audit log entries for critical operations', async () => {
    const debt = await ledger.addDebt({ customerId, amountKurus: 100_000, actorPhone: '905' });
    await ledger.voidEntry(debt.id, 'test', '905');

    const logs = await testApp.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    const actions = logs.map((log) => log.action);
    expect(actions).toContain('MONETARY_DEBT_CREATED');
    expect(actions).toContain('MONETARY_ENTRY_VOIDED');
  });
});
