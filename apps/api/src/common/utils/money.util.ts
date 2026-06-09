/**
 * All monetary values are stored as integer kurus (1 TL = 100 kurus).
 * Floating point is never used for money.
 *
 * Input follows strict Turkish number formatting:
 *   - dot is ALWAYS a thousands separator: "1.500" -> 1500 TL
 *   - comma is ALWAYS the decimal separator: "10,5" -> 10.50 TL
 *   - "10.5" is rejected (ambiguous, dot must group exactly 3 digits)
 */

const PLAIN_FORMAT = /^\d+(,\d{1,2})?$/;
const GROUPED_FORMAT = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/;

/** Upper sanity bound to catch obvious typos: 100 million TL. */
export const MAX_AMOUNT_KURUS = 100_000_000 * 100;

/**
 * Parses a user-typed amount into kurus.
 * Returns null when the input is not a valid, positive Turkish-formatted amount.
 */
export function parseMoneyInput(raw: string): number | null {
  const input = raw.trim().replace(/\s*(tl|₺)$/i, '').trim();
  if (!PLAIN_FORMAT.test(input) && !GROUPED_FORMAT.test(input)) {
    return null;
  }

  const [wholePart, decimalPart] = input.split(',');
  const whole = Number(wholePart.replace(/\./g, ''));
  const kurusDigits = (decimalPart ?? '').padEnd(2, '0');
  const kurus = whole * 100 + Number(kurusDigits || '0');

  if (!Number.isSafeInteger(kurus) || kurus <= 0 || kurus > MAX_AMOUNT_KURUS) {
    return null;
  }
  return kurus;
}

/**
 * Formats kurus for display, e.g. 230000 -> "2.300 TL", 125050 -> "1.250,50 TL".
 * Decimals are omitted when the amount is a whole number of liras.
 */
export function formatKurus(kurus: number): string {
  const sign = kurus < 0 ? '-' : '';
  const absolute = Math.abs(kurus);
  const liras = Math.floor(absolute / 100);
  const remainder = absolute % 100;

  const grouped = liras.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = remainder === 0 ? '' : `,${remainder.toString().padStart(2, '0')}`;
  return `${sign}${grouped}${decimals} TL`;
}

const QUANTITY_FORMAT = /^\d+(,\d{1,3})?$/;
const MAX_QUANTITY = 1_000_000;

/**
 * Parses a user-typed quantity (e.g. "3", "2,5") into a number with at most
 * three decimal places. Returns null for invalid or non-positive input.
 */
export function parseQuantityInput(raw: string): number | null {
  const input = raw.trim();
  if (!QUANTITY_FORMAT.test(input)) {
    return null;
  }
  const value = Number(input.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) {
    return null;
  }
  return value;
}

/** Formats a quantity for display: 2.5 -> "2,5", 3 -> "3". */
export function formatQuantity(value: number | string): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  // Up to 3 decimals, trailing zeros removed
  const fixed = numeric.toFixed(3).replace(/\.?0+$/, '');
  return fixed.replace('.', ',');
}
