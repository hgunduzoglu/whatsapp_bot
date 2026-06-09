import { MonetaryLedgerSource, ReminderStatus, ReminderType } from '@prisma/client';
import { businessDateAfterDays } from '../src/common/utils/date.util';
import { CustomersService } from '../src/customers/customers.service';
import { MonetaryLedgerService } from '../src/monetary-ledger/monetary-ledger.service';
import { PromissoryNotesService } from '../src/promissory-notes/promissory-notes.service';
import { SeedlingsService } from '../src/seedlings/seedlings.service';
import { createTestApp, resetDatabase, TestApp } from './test-app';

describe('Seedlings and promissory notes (integration)', () => {
  let testApp: TestApp;
  let customers: CustomersService;
  let seedlings: SeedlingsService;
  let notes: PromissoryNotesService;
  let ledger: MonetaryLedgerService;
  let customerId: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    customers = testApp.app.get(CustomersService);
    seedlings = testApp.app.get(SeedlingsService);
    notes = testApp.app.get(PromissoryNotesService);
    ledger = testApp.app.get(MonetaryLedgerService);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    const customer = await customers.create({ baseName: 'Ali Kaya' });
    customerId = customer.id;
  });

  it('a seedling order does not create any debt', async () => {
    await seedlings.createOrder({
      customerId,
      plantName: 'domates',
      seedGiven: false,
      requestedPickupDate: businessDateAfterDays(10),
    });

    expect(await ledger.balance(customerId)).toBe(0);
  });

  it('schedules a pickup reminder 3 days before delivery', async () => {
    const order = await seedlings.createOrder({
      customerId,
      plantName: 'domates',
      seedGiven: false,
      requestedPickupDate: businessDateAfterDays(10),
    });

    const reminders = await testApp.prisma.reminder.findMany({
      where: { targetEntityId: order.id },
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].type).toBe(ReminderType.SEEDLING_PICKUP_3_DAYS);
    expect(reminders[0].status).toBe(ReminderStatus.PENDING);
  });

  it('seedling debt is recorded as monetary debt: unit price x count', async () => {
    await seedlings.createSeedlingDebt({
      customerId,
      plantName: 'Domates',
      unitPriceKurus: 500, // 5 TL
      seedlingCount: 120,
      description: 'Domates fidesi 120 x 5 TL',
    });

    expect(await ledger.balance(customerId)).toBe(60_000); // 600 TL

    const entries = await ledger.entriesForCustomer(customerId);
    expect(entries[0].source).toBe(MonetaryLedgerSource.SEEDLING_DEBT);
  });

  it('voiding an order cancels its reminders', async () => {
    const order = await seedlings.createOrder({
      customerId,
      plantName: 'biber',
      seedGiven: false,
      requestedPickupDate: businessDateAfterDays(20),
    });

    await seedlings.voidOrder(order.id, 'cancelled by customer');

    const reminders = await testApp.prisma.reminder.findMany({
      where: { targetEntityId: order.id },
    });
    expect(reminders.every((reminder) => reminder.status === ReminderStatus.CANCELLED)).toBe(true);
  });

  it('a note schedules reminders 3 days and 1 day before the due date', async () => {
    const note = await notes.create({
      payeeName: 'Tedarikçi X',
      amountKurus: 2_500_000,
      dueDate: businessDateAfterDays(30),
    });

    const reminders = await testApp.prisma.reminder.findMany({
      where: { targetEntityId: note.id },
      orderBy: { scheduledFor: 'asc' },
    });
    expect(reminders.map((reminder) => reminder.type)).toEqual([
      ReminderType.PROMISSORY_NOTE_3_DAYS,
      ReminderType.PROMISSORY_NOTE_1_DAY,
    ]);
  });

  it('skips reminders whose moment has already passed', async () => {
    const note = await notes.create({
      payeeName: 'Tedarikçi Y',
      amountKurus: 1_000_000,
      // Due in 2 days: the 3-days-before moment is already in the past
      dueDate: businessDateAfterDays(2),
    });

    const reminders = await testApp.prisma.reminder.findMany({
      where: { targetEntityId: note.id },
    });
    expect(reminders.map((reminder) => reminder.type)).toEqual([
      ReminderType.PROMISSORY_NOTE_1_DAY,
    ]);
  });

  it('marking a note paid cancels its reminders', async () => {
    const note = await notes.create({
      payeeName: 'Tedarikçi X',
      amountKurus: 2_500_000,
      dueDate: businessDateAfterDays(30),
    });

    await notes.markPaid(note.id);

    const updated = await notes.getById(note.id);
    expect(updated.status).toBe('PAID');
    expect(updated.paidAt).not.toBeNull();

    const reminders = await testApp.prisma.reminder.findMany({
      where: { targetEntityId: note.id },
    });
    expect(reminders.every((reminder) => reminder.status === ReminderStatus.CANCELLED)).toBe(true);
  });
});
