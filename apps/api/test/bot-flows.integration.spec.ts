import { BotRouterService } from '../src/bot/bot-router.service';
import { TEXTS } from '../src/bot/texts';
import { CustomersService } from '../src/customers/customers.service';
import { MonetaryLedgerService } from '../src/monetary-ledger/monetary-ledger.service';
import { createTestApp, resetDatabase, TestApp } from './test-app';

const PHONE = '905000000001';

describe('Bot conversations (integration)', () => {
  let testApp: TestApp;
  let router: BotRouterService;
  let customers: CustomersService;
  let ledger: MonetaryLedgerService;
  let messageCounter = 0;

  const send = async (text: string): Promise<string> => {
    messageCounter += 1;
    const replies = await router.handleMessage({
      messageId: `m${messageCounter}`,
      from: PHONE,
      text,
    });
    return replies.join('\n---\n');
  };

  beforeAll(async () => {
    testApp = await createTestApp();
    router = testApp.app.get(BotRouterService);
    customers = testApp.app.get(CustomersService);
    ledger = testApp.app.get(MonetaryLedgerService);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  it('walks through customer creation and monetary debt entry', async () => {
    expect(await send('merhaba')).toContain('Ana Menü');

    expect(await send('1')).toContain('Müşteri İşlemleri');
    expect(await send('1')).toContain(TEXTS.askCustomerName);
    expect(await send('Mehmet Ali')).toContain(TEXTS.askCustomerPhone);
    expect(await send('0')).toContain(TEXTS.askCustomerNote);
    expect(await send('0')).toContain('Müşteri kaydedilecek');

    const afterConfirm = await send('1');
    expect(afterConfirm).toContain('Müşteri kaydedildi: Mehmet Ali');
    expect(afterConfirm).toContain('Seçili müşteri: Mehmet Ali');

    // Add a 2.300 TL debt
    expect(await send('2')).toContain(TEXTS.askDebtAmount);
    expect(await send('2.300')).toContain(TEXTS.askDescription);
    const confirm = await send('alışveriş');
    expect(confirm).toContain('2.300 TL borç eklenecek');
    expect(await send('1')).toContain(TEXTS.debtSaved);

    const [customer] = await customers.search('mehmet');
    expect(await ledger.balance(customer.id)).toBe(230_000);

    // Debt overview shows the new balance
    const overview = await send('1');
    expect(overview).toContain('Parasal bakiye');
    expect(overview).toContain('2.300 TL');
  });

  it('asks for an identifier when the name already exists', async () => {
    await customers.create({ baseName: 'Mehmet Ali' });

    await send('merhaba');
    await send('1'); // customer menu
    await send('1'); // add customer
    const duplicateReply = await send('Mehmet Ali');
    expect(duplicateReply).toContain('Bu isimde bir müşteri zaten var');
    expect(duplicateReply).toContain(TEXTS.askIdentifier);

    expect(await send('Karadere')).toContain(TEXTS.askCustomerPhone);
    await send('0');
    await send('0');
    const saved = await send('1');
    expect(saved).toContain('Mehmet Ali - Karadere');
  });

  it('rejects invalid money input and re-asks', async () => {
    await customers.create({ baseName: 'Ayşe Yılmaz' });

    await send('merhaba');
    await send('1');
    await send('2'); // pick customer
    await send('ayşe'); // search
    await send('1'); // pick from list
    await send('2'); // add monetary debt
    // "10.5" is ambiguous in strict Turkish format and must be rejected
    expect(await send('10.5')).toContain('Geçersiz tutar');
    expect(await send('10,50')).toContain(TEXTS.askDescription);
  });

  it('warns about overpayment before confirming', async () => {
    const customer = await customers.create({ baseName: 'Hasan Demir' });
    await ledger.addDebt({ customerId: customer.id, amountKurus: 50_000 }); // 500 TL

    await send('merhaba');
    await send('1');
    await send('2');
    await send('hasan');
    await send('1');
    await send('4'); // monetary payment
    await send('1.000'); // 1.000 TL > 500 TL debt
    const confirm = await send('0');
    expect(confirm).toContain('Bu ödeme mevcut borçtan fazla');
    expect(confirm).toContain('-500 TL');

    await send('1');
    expect(await ledger.balance(customer.id)).toBe(-50_000);
  });

  it('records a product debt through the bot and settles part of it', async () => {
    await customers.create({ baseName: 'Mehmet Ali' });

    await send('merhaba');
    await send('1');
    await send('2');
    await send('mehmet');
    await send('1');

    // Product debt: 3 x X ilacı (adet)
    expect(await send('3')).toContain('Ürün türü seçiniz');
    expect(await send('1')).toContain(TEXTS.askFirstProductName);
    expect(await send('X ilacı')).toContain('X ilacı için miktar giriniz');
    expect(await send('3')).toContain('Birim seçiniz');
    const added = await send('1');
    expect(added).toContain('Eklendi:');
    expect(added).toContain('X ilacı - 3 adet');

    await send('bitti');
    await send('0'); // note
    await send('2'); // no estimated value; confirm screen is shown
    const saved = await send('1');
    expect(saved).toContain(TEXTS.productDebtSaved);

    // Settle 1 piece for 2.000 TL
    const pickList = await send('5');
    expect(pickList).toContain('X ilacı');
    await send('1'); // pick item
    await send('1'); // quantity
    await send('2.000'); // accounting value
    await send('2'); // no more products
    const paymentConfirm = await send('1');
    expect(paymentConfirm).toContain(TEXTS.productPaymentSaved);

    const item = await testApp.prisma.productPurchaseItem.findFirstOrThrow();
    expect(item.remainingQuantity.toNumber()).toBe(2);

    // Monetary balance is untouched by product payments
    const [customer] = await customers.search('mehmet');
    expect(await ledger.balance(customer.id)).toBe(0);
  });

  it('creates a promissory note through the bot', async () => {
    await send('merhaba');
    await send('2'); // Senetlerim
    await send('1'); // Senet ekle
    await send('Tedarikçi X');
    await send('25.000');
    expect(await send('4')).toContain(TEXTS.askDescription); // 30 days option
    const confirm = await send('Nisan senedi');
    expect(confirm).toContain('Alacaklı: Tedarikçi X');
    expect(confirm).toContain('25.000 TL');
    expect(await send('1')).toContain(TEXTS.noteSaved);

    const notes = await testApp.prisma.promissoryNote.findMany();
    expect(notes).toHaveLength(1);
    expect(notes[0].amountKurus).toBe(2_500_000);

    const reminders = await testApp.prisma.reminder.findMany();
    expect(reminders).toHaveLength(2);
  });

  it('undoes the last transaction from the correction menu', async () => {
    const customer = await customers.create({ baseName: 'Mehmet Ali' });
    await ledger.addDebt({ customerId: customer.id, amountKurus: 230_000 });

    await send('merhaba');
    await send('4'); // corrections
    const undoPrompt = await send('2');
    expect(undoPrompt).toContain('2.300 TL');
    expect(await send('1')).toContain(TEXTS.undoDone);

    expect(await ledger.balance(customer.id)).toBe(0);
  });
});
