/** Formats integer kurus as "1.250,50 TL" (decimals omitted when zero). */
export function formatKurus(kurus: number): string {
  const sign = kurus < 0 ? '-' : '';
  const absolute = Math.abs(kurus);
  const liras = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const grouped = liras.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = remainder === 0 ? '' : `,${remainder.toString().padStart(2, '0')}`;
  return `${sign}${grouped}${decimals} TL`;
}

const PLAIN_FORMAT = /^\d+(,\d{1,2})?$/;
const GROUPED_FORMAT = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/;

/**
 * Strict Turkish money parsing, identical to the bot's rules:
 * dot = thousands, comma = decimals. Returns kurus or null.
 */
export function parseMoneyInput(raw: string): number | null {
  const input = raw.trim().replace(/\s*(tl|₺)$/i, '').trim();
  if (!PLAIN_FORMAT.test(input) && !GROUPED_FORMAT.test(input)) {
    return null;
  }
  const [wholePart, decimalPart] = input.split(',');
  const whole = Number(wholePart.replace(/\./g, ''));
  const kurus = whole * 100 + Number((decimalPart ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(kurus) || kurus <= 0) {
    return null;
  }
  return kurus;
}

/** "2026-03-22T..." -> "22.03.2026" (UTC parts: business date convention). */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

/** Local timestamp for audit rows. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}

/** Decimal quantity string from the API ("2.500") -> "2,5". */
export function formatQuantity(value: string | number): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return numeric.toFixed(3).replace(/\.?0+$/, '').replace('.', ',');
}

export const UNIT_LABELS: Record<string, string> = {
  PIECE: 'adet',
  KG: 'kg',
  GRAM: 'gram',
  LITER: 'litre',
  ML: 'ml',
  SACK: 'çuval',
  PACKAGE: 'paket',
};

export const CATEGORY_LABELS: Record<string, string> = {
  MEDICINE: 'İlaç',
  FERTILIZER: 'Gübre',
  OTHER: 'Diğer',
};

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  DEBT: 'Borç',
  PAYMENT: 'Ödeme',
  ADJUSTMENT_INCREASE: 'Düzeltme (+)',
  ADJUSTMENT_DECREASE: 'Düzeltme (-)',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Bekliyor',
  REMINDED: 'Hatırlatıldı',
  DELIVERED: 'Teslim edildi',
  CANCELLED: 'İptal',
  VOIDED: 'Geri alındı',
};
