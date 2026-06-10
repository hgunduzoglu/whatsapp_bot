import { Injectable } from '@nestjs/common';
import {
  buildManualDate,
  businessDateAfterDays,
  DATE_OPTION_DAYS,
  formatBusinessDate,
  isBeforeToday,
  parseIntegerInput,
  todayBusinessDate,
} from '../../common/utils/date.util';
import {
  formatKurus,
  formatQuantity,
  parseMoneyInput,
  parseQuantityInput,
} from '../../common/utils/money.util';
import { isValidName, normalizeName } from '../../common/utils/normalize.util';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS } from '../texts';

/**
 * Guided practice mode. Mirrors the real flows screen by screen with the
 * same validators, but NEVER calls a domain service: everything entered
 * lives in the session's temporary data and is wiped when the tutorial
 * ends, is cancelled, or times out.
 */

const UNIT_BY_OPTION: Record<string, string> = {
  '1': 'adet',
  '2': 'kg',
  '3': 'gram',
  '4': 'litre',
  '5': 'ml',
  '6': 'çuval',
  '7': 'paket',
};

const CATEGORY_BY_OPTION: Record<string, string> = {
  '1': 'İlaç',
  '2': 'Gübre',
  '3': 'Diğer',
};

interface TutorialItem {
  name: string;
  quantity: number;
  unitLabel: string;
  remaining: number;
}

interface TutorialAllocation {
  name: string;
  quantity: number;
  unitLabel: string;
  valueKurus: number | null;
}

interface TutorialData {
  step: number;
  customerName?: string;
  debtKurus?: number;
  debtDescription?: string | null;
  paymentKurus?: number;
  categoryLabel?: string;
  items: TutorialItem[];
  pendingItemName?: string;
  pendingQuantity?: number;
  allocations: TutorialAllocation[];
  payItemIndex?: number;
  payQuantity?: number;
  plantName?: string;
  seedGiven?: boolean;
  seedPlantName?: string;
  seedUnitLabel?: string;
  seedAmount?: number;
  pickupDay?: number;
  pickupMonth?: number;
  pickupDateLabel?: string;
  orderNote?: string | null;
  seedlingPlant?: string;
  seedlingUnitKurus?: number;
  seedlingCount?: number;
  payeeName?: string;
  noteKurus?: number;
  noteDateLabel?: string;
  noteDescription?: string | null;
}

// Step numbers of the script, in order
const S = {
  INTRO: 0,
  CUST_NAME: 1,
  CUST_CONFIRM: 2,
  DEBT_AMOUNT: 3,
  DEBT_DESC: 4,
  DEBT_CONFIRM: 5,
  PAY_AMOUNT: 6,
  PAY_CONFIRM: 7,
  PROD_CATEGORY: 8,
  PROD_ITEM_NAME: 9,
  PROD_QTY: 10,
  PROD_UNIT: 11,
  PROD_CONFIRM: 12,
  PRODPAY_PICK: 13,
  PRODPAY_QTY: 14,
  PRODPAY_VALUE: 15,
  PRODPAY_MORE: 16,
  PRODPAY_CONFIRM: 17,
  SEED_PLANT: 18,
  SEED_GIVEN: 19,
  SEED_PLANT_NAME: 20,
  SEED_UNIT: 21,
  SEED_AMOUNT: 22,
  SEED_DATE: 23,
  SEED_DAY: 24,
  SEED_MONTH: 25,
  SEED_YEAR: 26,
  SEED_NOTE: 27,
  SEED_CONFIRM: 28,
  SDEBT_PLANT: 29,
  SDEBT_PRICE: 30,
  SDEBT_COUNT: 31,
  SDEBT_CONFIRM: 32,
  NOTE_PAYEE: 33,
  NOTE_AMOUNT: 34,
  NOTE_DATE: 35,
  NOTE_DESC: 36,
  NOTE_CONFIRM: 37,
  WRAP_UP: 38,
} as const;

const T = {
  header: '📚 ÖĞRETİCİ — deneme modu, hiçbir şey kaydedilmez',
  intro: [
    'Bu modda botun tüm işlemlerini birlikte deneyeceğiz:',
    'müşteri ekleme, borç/ödeme, ilaç-gübre borcu ve ödemesi, fidan ve senet.',
    '',
    'Gördüğünüz ekranlar gerçek kullanımla birebir aynıdır;',
    'tek fark, girdiklerinizin kaydedilmemesidir.',
    'İstediğiniz an "iptal" yazarak çıkabilirsiniz.',
    '',
    'Başlamak için 1 yazınız.',
  ].join('\n'),
  section: (no: number, title: string): string => `— Bölüm ${no}/8: ${title} —`,
  confirmHint: 'Denemede kaydedip ilerleyelim: 1 yazınız.',
  savedNote: '✅ (Deneme) Kaydedildi — gerçek kullanımda bu işlem veritabanına yazılırdı.',
  pickFromList: 'Listeden numara seçiniz.',
  manualDateHint:
    'Elle tarih girmeyi fidan adımında denediniz; burada 1-5 arası hızlı seçeneklerden birini seçiniz.',
  wrapUp: (name: string): string =>
    [
      '🎉 Tebrikler, tüm işlemleri denediniz!',
      '',
      'Ayrıca ana menüde şunlar da var:',
      '3) Raporlar — günlük/haftalık özet, toplam alacaklar, müşteri ekstresi',
      '4) Son işlemler / düzeltme — yanlış girilen işlemi geri alma ve silme',
      '',
      `"${name}" dahil bu denemede girdiğiniz hiçbir bilgi kaydedilmedi.`,
      'Tekrar pratik yapmak isterseniz "öğret" yazmanız yeterli.',
      '',
      'Devam etmek için 1 yazınız, ana menüye dönelim.',
    ].join('\n'),
};

@Injectable()
export class TutorialFlow {
  constructor(registry: FlowRegistry) {
    registry.register(BotState.TUTORIAL, {
      prompt: (ctx) => this.prompt(ctx),
      handle: (ctx) => this.handle(ctx),
    });
  }

  private data(ctx: FlowContext): TutorialData {
    const raw = ctx.data.tutorial as Partial<TutorialData> | undefined;
    return { step: 0, items: [], allocations: [], ...raw };
  }

  private today(): string {
    return formatBusinessDate(todayBusinessDate());
  }

  private openItems(t: TutorialData): TutorialItem[] {
    return t.items.filter((item) => item.remaining > 0);
  }

  // ---------------------------------------------------------------------------
  // Prompts: one screen per step, mirroring the real flows
  // ---------------------------------------------------------------------------

  private prompt(ctx: FlowContext): string[] {
    const t = this.data(ctx);
    const name = t.customerName ?? '';

    switch (t.step) {
      case S.INTRO:
        return [[T.header, '', T.intro].join('\n')];
      case S.CUST_NAME:
        return [[T.section(1, 'Müşteri ekleme'), '', TEXTS.askCustomerName].join('\n')];
      case S.CUST_CONFIRM:
        return [
          ['Müşteri kaydedilecek:', '', `İsim: ${name}`, '', TEXTS.confirmOptions].join('\n'),
        ];
      case S.DEBT_AMOUNT:
        return [
          [
            T.section(2, 'Parasal borç'),
            `Şimdi "${name}" müşterisine borç ekleyelim.`,
            '',
            TEXTS.askDebtAmount,
          ].join('\n'),
        ];
      case S.DEBT_DESC:
        return [TEXTS.askDescription];
      case S.DEBT_CONFIRM:
        return [
          TEXTS.debtConfirm(
            name,
            formatKurus(t.debtKurus ?? 0),
            t.debtDescription ?? TEXTS.noDescription,
            this.today(),
          ),
        ];
      case S.PAY_AMOUNT:
        return [
          [
            T.section(3, 'Parasal ödeme'),
            `"${name}" müşterisinden ödeme alalım.`,
            '',
            TEXTS.askPaymentAmount,
          ].join('\n'),
        ];
      case S.PAY_CONFIRM:
        return [
          TEXTS.paymentConfirm(
            name,
            formatKurus(t.paymentKurus ?? 0),
            TEXTS.noDescription,
            this.today(),
          ),
        ];
      case S.PROD_CATEGORY:
        return [
          [
            T.section(4, 'İlaç/Gübre borcu'),
            'Ürün borcu para değil, ürün ve miktar olarak tutulur.',
            'Birden fazla ürünü tek seferde girebilirsiniz.',
            '',
            TEXTS.askProductCategory,
          ].join('\n'),
        ];
      case S.PROD_ITEM_NAME:
        return [t.items.length === 0 ? TEXTS.askFirstProductName : TEXTS.askNextProductName];
      case S.PROD_QTY:
        return [TEXTS.askProductQuantity(t.pendingItemName ?? '')];
      case S.PROD_UNIT:
        return [TEXTS.askProductUnit];
      case S.PROD_CONFIRM:
        return [
          TEXTS.productDebtConfirm(
            name,
            this.today(),
            t.items.map(
              (item, index) =>
                `${index + 1}) ${item.name} - ${formatQuantity(item.quantity)} ${item.unitLabel}`,
            ),
          ),
        ];
      case S.PRODPAY_PICK: {
        const lines = this.openItems(t).map(
          (item, index) =>
            `${index + 1}) ${this.today()} - ${item.name} - ${formatQuantity(item.remaining)} ${item.unitLabel} açık`,
        );
        return [
          [
            T.section(5, 'İlaç/Gübre ürün ödemesi'),
            'Az önce girdiğiniz ürün borcunu kapatalım.',
            '',
            TEXTS.openProductDebts(lines),
          ].join('\n'),
        ];
      }
      case S.PRODPAY_QTY: {
        const item = this.openItems(t)[t.payItemIndex ?? 0];
        return [TEXTS.askPaidQuantity(item?.name ?? '', item?.unitLabel ?? '')];
      }
      case S.PRODPAY_VALUE:
        return [TEXTS.askPaymentValue + '\n(Değer kaydetmemek için 0 yazınız.)'];
      case S.PRODPAY_MORE:
        return [TEXTS.askMoreProducts];
      case S.PRODPAY_CONFIRM: {
        const lines: string[] = [];
        for (const allocation of t.allocations) {
          lines.push(
            `${this.today()} - ${allocation.name}`,
            `Kapatılan miktar: ${formatQuantity(allocation.quantity)} ${allocation.unitLabel}`,
            `Muhasebe değeri: ${allocation.valueKurus != null ? formatKurus(allocation.valueKurus) : '-'}`,
            '',
          );
        }
        lines.pop();
        return [TEXTS.productPaymentConfirm(name, lines)];
      }
      case S.SEED_PLANT:
        return [
          [
            T.section(6, 'Fidan siparişi'),
            'Fidan siparişi borç oluşturmaz; teslim tarihinden 3 gün önce hatırlatma gelir.',
            '',
            TEXTS.askPlantName,
          ].join('\n'),
        ];
      case S.SEED_GIVEN:
        return [TEXTS.askSeedGiven];
      case S.SEED_PLANT_NAME:
        return [TEXTS.askSeedPlantName];
      case S.SEED_UNIT:
        return [TEXTS.askSeedUnit];
      case S.SEED_AMOUNT:
        return [TEXTS.askSeedAmount];
      case S.SEED_DATE:
        return [TEXTS.askPickupDate];
      case S.SEED_DAY:
        return [TEXTS.askDay];
      case S.SEED_MONTH:
        return [TEXTS.askMonth];
      case S.SEED_YEAR:
        return [TEXTS.askYear];
      case S.SEED_NOTE:
        return [TEXTS.askDescription];
      case S.SEED_CONFIRM: {
        const seedInfo = t.seedGiven
          ? TEXTS.seedGivenInfo(
              t.seedPlantName ?? '',
              formatQuantity(t.seedAmount ?? 0),
              t.seedUnitLabel ?? 'zarf',
            )
          : TEXTS.seedNotGiven;
        return [
          TEXTS.seedlingOrderConfirm(
            name,
            t.plantName ?? '',
            seedInfo,
            t.pickupDateLabel ?? '',
            t.orderNote ?? TEXTS.noDescription,
          ),
        ];
      }
      case S.SDEBT_PLANT:
        return [
          [
            T.section(7, 'Fidan borcu'),
            'Fidan borcu parasal borç olarak kaydedilir: adet ücreti × fide sayısı.',
            '',
            TEXTS.askSeedlingDebtPlant,
          ].join('\n'),
        ];
      case S.SDEBT_PRICE:
        return [TEXTS.askSeedlingUnitPrice];
      case S.SDEBT_COUNT:
        return [TEXTS.askSeedlingCount];
      case S.SDEBT_CONFIRM: {
        const total = (t.seedlingUnitKurus ?? 0) * (t.seedlingCount ?? 0);
        return [
          TEXTS.seedlingDebtConfirm(
            name,
            t.seedlingPlant ?? '',
            formatKurus(t.seedlingUnitKurus ?? 0),
            t.seedlingCount ?? 0,
            formatKurus(total),
            this.today(),
          ),
        ];
      }
      case S.NOTE_PAYEE:
        return [
          [
            T.section(8, 'Senetlerim'),
            'Senetler müşteri borcu değildir; sizin ödeyeceğiniz senetlerdir.',
            'Ödeme tarihinden 3 gün ve 1 gün önce hatırlatma gelir.',
            '',
            TEXTS.askPayeeName,
          ].join('\n'),
        ];
      case S.NOTE_AMOUNT:
        return [TEXTS.askNoteAmount];
      case S.NOTE_DATE:
        return [TEXTS.askDueDate];
      case S.NOTE_DESC:
        return [TEXTS.askDescription];
      case S.NOTE_CONFIRM:
        return [
          TEXTS.noteConfirm(
            t.payeeName ?? '',
            formatKurus(t.noteKurus ?? 0),
            t.noteDateLabel ?? '',
            t.noteDescription ?? TEXTS.noDescription,
          ),
        ];
      case S.WRAP_UP:
        return [T.wrapUp(t.customerName ?? 'deneme müşterisi')];
      default:
        return [TEXTS.genericError];
    }
  }

  // ---------------------------------------------------------------------------
  // Input handling per step
  // ---------------------------------------------------------------------------

  private async handle(ctx: FlowContext): Promise<FlowResult> {
    const t = this.data(ctx);
    const input = ctx.input;

    const stay = (message: string): FlowResult => ({ replies: [message], reprompt: true });
    const go = (step: number, replies: string[] = []): FlowResult => ({
      replies,
      data: { tutorial: { ...t, step } },
      reprompt: true,
    });

    switch (t.step) {
      case S.INTRO:
        return input === '1' ? go(S.CUST_NAME) : stay(TEXTS.invalidOption);

      case S.CUST_NAME: {
        if (!isValidName(input)) {
          return stay(TEXTS.invalidCustomerName);
        }
        t.customerName = input.trim();
        return go(S.CUST_CONFIRM);
      }
      case S.CUST_CONFIRM:
        return input === '1'
          ? go(S.DEBT_AMOUNT, [`${T.savedNote}\nMüşteri: ${t.customerName}`])
          : stay(T.confirmHint);

      case S.DEBT_AMOUNT: {
        const amount = parseMoneyInput(input);
        if (amount === null) {
          return stay(TEXTS.invalidAmount);
        }
        t.debtKurus = amount;
        return go(S.DEBT_DESC);
      }
      case S.DEBT_DESC: {
        t.debtDescription = input === '0' ? null : input;
        return go(S.DEBT_CONFIRM);
      }
      case S.DEBT_CONFIRM:
        return input === '1' ? go(S.PAY_AMOUNT, [T.savedNote]) : stay(T.confirmHint);

      case S.PAY_AMOUNT: {
        const amount = parseMoneyInput(input);
        if (amount === null) {
          return stay(TEXTS.invalidAmount);
        }
        t.paymentKurus = amount;
        return go(S.PAY_CONFIRM);
      }
      case S.PAY_CONFIRM:
        return input === '1' ? go(S.PROD_CATEGORY, [T.savedNote]) : stay(T.confirmHint);

      case S.PROD_CATEGORY: {
        const label = CATEGORY_BY_OPTION[input];
        if (!label) {
          return stay(TEXTS.invalidOption);
        }
        t.categoryLabel = label;
        return go(S.PROD_ITEM_NAME);
      }
      case S.PROD_ITEM_NAME: {
        if (normalizeName(input) === 'bitti') {
          if (t.items.length === 0) {
            return stay('Önce en az bir ürün giriniz.');
          }
          return go(S.PROD_CONFIRM);
        }
        if (!isValidName(input)) {
          return stay(TEXTS.invalidCustomerName);
        }
        t.pendingItemName = input.trim();
        return go(S.PROD_QTY);
      }
      case S.PROD_QTY: {
        const quantity = parseQuantityInput(input);
        if (quantity === null) {
          return stay(TEXTS.invalidQuantity);
        }
        t.pendingQuantity = quantity;
        return go(S.PROD_UNIT);
      }
      case S.PROD_UNIT: {
        const unitLabel = UNIT_BY_OPTION[input];
        if (!unitLabel) {
          return stay(TEXTS.invalidOption);
        }
        const item: TutorialItem = {
          name: t.pendingItemName ?? '',
          quantity: t.pendingQuantity ?? 0,
          unitLabel,
          remaining: t.pendingQuantity ?? 0,
        };
        t.items = [...t.items, item];
        t.pendingItemName = undefined;
        t.pendingQuantity = undefined;
        return go(S.PROD_ITEM_NAME, [
          TEXTS.productItemAdded(`${item.name} - ${formatQuantity(item.quantity)} ${unitLabel}`),
        ]);
      }
      case S.PROD_CONFIRM:
        return input === '1' ? go(S.PRODPAY_PICK, [T.savedNote]) : stay(T.confirmHint);

      case S.PRODPAY_PICK: {
        const open = this.openItems(t);
        const index = Number(input);
        if (!Number.isInteger(index) || index < 1 || index > open.length) {
          return stay(TEXTS.invalidOption);
        }
        t.payItemIndex = index - 1;
        return go(S.PRODPAY_QTY);
      }
      case S.PRODPAY_QTY: {
        const open = this.openItems(t);
        const item = open[t.payItemIndex ?? 0];
        const quantity = parseQuantityInput(input);
        if (quantity === null) {
          return stay(TEXTS.invalidQuantity);
        }
        if (item && quantity > item.remaining) {
          return stay(TEXTS.excessiveQuantity);
        }
        t.payQuantity = quantity;
        return go(S.PRODPAY_VALUE);
      }
      case S.PRODPAY_VALUE: {
        let valueKurus: number | null = null;
        if (input !== '0') {
          valueKurus = parseMoneyInput(input);
          if (valueKurus === null) {
            return stay(TEXTS.invalidAmount);
          }
        }
        const open = this.openItems(t);
        const item = open[t.payItemIndex ?? 0];
        if (item) {
          // Apply the settlement in memory so remaining amounts behave real
          item.remaining -= t.payQuantity ?? 0;
          t.allocations = [
            ...t.allocations,
            {
              name: item.name,
              quantity: t.payQuantity ?? 0,
              unitLabel: item.unitLabel,
              valueKurus,
            },
          ];
        }
        t.payItemIndex = undefined;
        t.payQuantity = undefined;
        return go(S.PRODPAY_MORE);
      }
      case S.PRODPAY_MORE: {
        if (input === '1') {
          if (this.openItems(t).length === 0) {
            return go(S.PRODPAY_CONFIRM, ['Kapatılacak başka açık ürün kalmadı.']);
          }
          return go(S.PRODPAY_PICK);
        }
        if (input === '2') {
          return go(S.PRODPAY_CONFIRM);
        }
        return stay(TEXTS.invalidOption);
      }
      case S.PRODPAY_CONFIRM:
        return input === '1'
          ? go(S.SEED_PLANT, [
              T.savedNote + '\nDikkat: ürün ödemesi parasal bakiyeyi düşürmez.',
            ])
          : stay(T.confirmHint);

      case S.SEED_PLANT: {
        if (!isValidName(input)) {
          return stay(TEXTS.invalidCustomerName);
        }
        t.plantName = input.trim();
        return go(S.SEED_GIVEN);
      }
      case S.SEED_GIVEN: {
        if (input === '1') {
          t.seedGiven = true;
          return go(S.SEED_PLANT_NAME);
        }
        if (input === '2') {
          t.seedGiven = false;
          return go(S.SEED_DATE);
        }
        return stay(TEXTS.invalidOption);
      }
      case S.SEED_PLANT_NAME: {
        if (!isValidName(input)) {
          return stay(TEXTS.invalidCustomerName);
        }
        t.seedPlantName = input.trim();
        return go(S.SEED_UNIT);
      }
      case S.SEED_UNIT: {
        if (input === '1') {
          t.seedUnitLabel = 'zarf';
        } else if (input === '2') {
          t.seedUnitLabel = 'gram';
        } else {
          return stay(TEXTS.invalidOption);
        }
        return go(S.SEED_AMOUNT);
      }
      case S.SEED_AMOUNT: {
        const amount = parseQuantityInput(input);
        if (amount === null) {
          return stay(TEXTS.invalidQuantity);
        }
        t.seedAmount = amount;
        return go(S.SEED_DATE);
      }
      case S.SEED_DATE: {
        const option = Number(input);
        if (Number.isInteger(option) && option >= 1 && option <= DATE_OPTION_DAYS.length) {
          t.pickupDateLabel = formatBusinessDate(
            businessDateAfterDays(DATE_OPTION_DAYS[option - 1]),
          );
          return go(S.SEED_NOTE);
        }
        if (input === '6') {
          return go(S.SEED_DAY);
        }
        return stay(TEXTS.invalidOption);
      }
      case S.SEED_DAY: {
        const day = parseIntegerInput(input);
        if (day === null || day < 1 || day > 31) {
          return stay(TEXTS.invalidDay);
        }
        t.pickupDay = day;
        return go(S.SEED_MONTH);
      }
      case S.SEED_MONTH: {
        const month = parseIntegerInput(input);
        if (month === null || month < 1 || month > 12) {
          return stay(TEXTS.invalidMonth);
        }
        t.pickupMonth = month;
        return go(S.SEED_YEAR);
      }
      case S.SEED_YEAR: {
        const year = parseIntegerInput(input);
        if (year === null) {
          return stay(TEXTS.invalidYear);
        }
        const date = buildManualDate(t.pickupDay ?? 0, t.pickupMonth ?? 0, year);
        if (date === null) {
          return go(S.SEED_DAY, [TEXTS.invalidDate]);
        }
        if (isBeforeToday(date)) {
          return go(S.SEED_DATE, [TEXTS.pickupDateInPast]);
        }
        t.pickupDateLabel = formatBusinessDate(date);
        return go(S.SEED_NOTE);
      }
      case S.SEED_NOTE: {
        t.orderNote = input === '0' ? null : input;
        return go(S.SEED_CONFIRM);
      }
      case S.SEED_CONFIRM:
        return input === '1'
          ? go(S.SDEBT_PLANT, [
              T.savedNote + '\nGerçek kullanımda teslimden 3 gün önce hatırlatma gelirdi.',
            ])
          : stay(T.confirmHint);

      case S.SDEBT_PLANT: {
        if (!isValidName(input)) {
          return stay(TEXTS.invalidCustomerName);
        }
        t.seedlingPlant = input.trim();
        return go(S.SDEBT_PRICE);
      }
      case S.SDEBT_PRICE: {
        const price = parseMoneyInput(input);
        if (price === null) {
          return stay(TEXTS.invalidAmount);
        }
        t.seedlingUnitKurus = price;
        return go(S.SDEBT_COUNT);
      }
      case S.SDEBT_COUNT: {
        const count = Number(input.trim());
        if (!Number.isInteger(count) || count <= 0 || count > 1_000_000) {
          return stay(TEXTS.invalidCount);
        }
        t.seedlingCount = count;
        return go(S.SDEBT_CONFIRM);
      }
      case S.SDEBT_CONFIRM:
        return input === '1' ? go(S.NOTE_PAYEE, [T.savedNote]) : stay(T.confirmHint);

      case S.NOTE_PAYEE: {
        if (!isValidName(input)) {
          return stay(TEXTS.invalidCustomerName);
        }
        t.payeeName = input.trim();
        return go(S.NOTE_AMOUNT);
      }
      case S.NOTE_AMOUNT: {
        const amount = parseMoneyInput(input);
        if (amount === null) {
          return stay(TEXTS.invalidAmount);
        }
        t.noteKurus = amount;
        return go(S.NOTE_DATE);
      }
      case S.NOTE_DATE: {
        const option = Number(input);
        if (Number.isInteger(option) && option >= 1 && option <= DATE_OPTION_DAYS.length) {
          t.noteDateLabel = formatBusinessDate(
            businessDateAfterDays(DATE_OPTION_DAYS[option - 1]),
          );
          return go(S.NOTE_DESC);
        }
        if (input === '6') {
          return stay(T.manualDateHint);
        }
        return stay(TEXTS.invalidOption);
      }
      case S.NOTE_DESC: {
        t.noteDescription = input === '0' ? null : input;
        return go(S.NOTE_CONFIRM);
      }
      case S.NOTE_CONFIRM:
        return input === '1'
          ? go(S.WRAP_UP, [
              T.savedNote + '\nGerçek kullanımda 3 gün ve 1 gün kala hatırlatma gelirdi.',
            ])
          : stay(T.confirmHint);

      case S.WRAP_UP:
        // Leaving for the main menu wipes all tutorial data automatically
        return { nextState: BotState.MAIN_MENU };

      default:
        return { replies: [TEXTS.genericError], nextState: BotState.MAIN_MENU };
    }
  }
}
