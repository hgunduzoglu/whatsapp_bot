import { BotRouterService } from '../src/bot/bot-router.service';
import { TEXTS } from '../src/bot/texts';
import { createTestApp, resetDatabase, TestApp } from './test-app';

const PHONE = '905000000001';

describe('Practice mode (integration)', () => {
  let testApp: TestApp;
  let router: BotRouterService;
  let messageCounter = 0;

  const send = async (text: string): Promise<string> => {
    messageCounter += 1;
    const replies = await router.handleMessage({
      messageId: `t${messageCounter}`,
      from: PHONE,
      text,
    });
    return replies.join('\n---\n');
  };

  beforeAll(async () => {
    testApp = await createTestApp();
    router = testApp.app.get(BotRouterService);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  it('walks through every operation without creating any records', async () => {
    await send('merhaba');

    expect(await send('öğret')).toContain('ÖĞRETİCİ');
    await send('1'); // start

    // 1) Customer: the typed name must be echoed back, not a default
    expect(await send('Deneme Müşterisi')).toContain('İsim: Deneme Müşterisi');
    expect(await send('1')).toContain('Deneme Müşterisi');

    // 2) Monetary debt with the same strict money parsing as the real flow
    expect(await send('10.5')).toContain('Geçersiz tutar');
    await send('2.300');
    await send('deneme borcu');
    const debtConfirm = await send('1');
    expect(debtConfirm).toContain('Kaydedildi');

    // 3) Monetary payment
    await send('1.000');
    expect(await send('1')).toContain('Kaydedildi');

    // 4) Product debt with MULTIPLE items
    await send('1'); // category: İlaç
    await send('X ilacı');
    await send('3');
    expect(await send('1')).toContain('X ilacı - 3 adet');
    await send('Y gübresi');
    await send('5');
    expect(await send('6')).toContain('Y gübresi - 5 çuval');
    const productConfirm = await send('bitti');
    expect(productConfirm).toContain('Kaydedilecek ürün borcu');
    expect(productConfirm).toContain('Deneme Müşterisi');
    await send('1');

    // 5) Product payment: overpay must be rejected just like in real use
    await send('1'); // pick X ilacı
    expect(await send('99')).toContain(TEXTS.excessiveQuantity);
    await send('1');
    await send('2.000');
    await send('2'); // no more items
    expect(await send('1')).toContain('parasal bakiyeyi düşürmez');

    // 6) Seedling order with seed info and quick pickup date
    await send('domates');
    await send('1'); // seed given
    await send('domates');
    await send('1'); // zarf
    await send('2');
    await send('1'); // 10 days
    await send('0'); // no note
    expect(await send('1')).toContain('hatırlatma');

    // 7) Seedling debt: unit price x count
    await send('Domates');
    await send('5');
    expect(await send('120')).toContain('600 TL');
    await send('1');

    // 8) Promissory note
    await send('Tedarikçi X');
    await send('25.000');
    await send('4'); // 30 days
    await send('0');
    const wrap = await send('1');
    expect(wrap).toContain('Tebrikler');
    expect(wrap).toContain('Deneme Müşterisi');

    // Finish: back to the main menu
    expect(await send('1')).toContain('Ana Menü');

    // NOTHING was persisted anywhere
    const [customers, ledger, purchases, payments, orders, notes, reminders] = await Promise.all([
      testApp.prisma.customer.count(),
      testApp.prisma.monetaryLedgerEntry.count(),
      testApp.prisma.productPurchase.count(),
      testApp.prisma.productPayment.count(),
      testApp.prisma.seedlingOrder.count(),
      testApp.prisma.promissoryNote.count(),
      testApp.prisma.reminder.count(),
    ]);
    expect([customers, ledger, purchases, payments, orders, notes, reminders]).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);

    // The session carries no leftover tutorial data either
    const session = await testApp.prisma.botSession.findUnique({
      where: { whatsappPhone: PHONE },
    });
    expect(JSON.stringify(session?.temporaryData)).not.toContain('Deneme Müşterisi');
  });

  it('can be cancelled at any point with the global cancel command', async () => {
    await send('merhaba');
    await send('öğret');
    await send('1');
    await send('Yarıda Kalan');

    const cancelled = await send('iptal');
    expect(cancelled).toContain(TEXTS.operationCancelled);
    expect(cancelled).toContain('Ana Menü');

    expect(await testApp.prisma.customer.count()).toBe(0);
    const session = await testApp.prisma.botSession.findUnique({
      where: { whatsappPhone: PHONE },
    });
    expect(JSON.stringify(session?.temporaryData)).not.toContain('Yarıda Kalan');
  });

  it('is advertised in the help message', async () => {
    await send('merhaba');
    expect(await send('yardım')).toContain('öğret');
  });
});
