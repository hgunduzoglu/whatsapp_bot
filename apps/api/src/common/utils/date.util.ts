import { DateTime } from 'luxon';

/**
 * Business dates follow the Istanbul calendar regardless of server timezone.
 *
 * Convention: a "business date" is stored as a UTC-midnight Date whose
 * year/month/day equal the Istanbul calendar date. This keeps date-only
 * semantics unambiguous (read UTC parts to display, compare directly).
 */
export const BUSINESS_TIMEZONE = 'Europe/Istanbul';

export function nowInIstanbul(): DateTime {
  return DateTime.now().setZone(BUSINESS_TIMEZONE);
}

/** Today's business date (UTC-midnight Date for the Istanbul calendar day). */
export function todayBusinessDate(): Date {
  const now = nowInIstanbul();
  return new Date(Date.UTC(now.year, now.month - 1, now.day));
}

/** Business date `days` days after today (Istanbul calendar). */
export function businessDateAfterDays(days: number): Date {
  const target = nowInIstanbul().plus({ days });
  return new Date(Date.UTC(target.year, target.month - 1, target.day));
}

/** Formats a business date as dd.MM.yyyy. */
export function formatBusinessDate(date: Date): string {
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

/**
 * Builds a business date from manually entered day/month/year.
 * Returns null for impossible dates (e.g. 31.02.2026) or out-of-range years.
 */
export function buildManualDate(day: number, month: number, year: number): Date | null {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return null;
  }
  const dt = DateTime.utc(year, month, day);
  if (!dt.isValid || dt.day !== day || dt.month !== month) {
    return null;
  }
  return dt.toJSDate();
}

/** Parses a single positive integer (used for day/month/year prompts). */
export function parseIntegerInput(raw: string): number | null {
  const input = raw.trim();
  if (!/^\d{1,4}$/.test(input)) {
    return null;
  }
  return Number(input);
}

export function isBeforeToday(businessDate: Date): boolean {
  return businessDate.getTime() < todayBusinessDate().getTime();
}

/** Whole days from today (Istanbul) until the given business date. */
export function daysUntil(businessDate: Date): number {
  const today = todayBusinessDate();
  return Math.round((businessDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * The instant at which a reminder should fire: `daysBefore` days before the
 * business date, at `hour` o'clock Istanbul wall time.
 */
export function reminderInstant(businessDate: Date, daysBefore: number, hour: number): Date {
  const target = DateTime.fromObject(
    {
      year: businessDate.getUTCFullYear(),
      month: businessDate.getUTCMonth() + 1,
      day: businessDate.getUTCDate(),
      hour,
    },
    { zone: BUSINESS_TIMEZONE },
  ).minus({ days: daysBefore });
  return target.toJSDate();
}

/** Pickup/due date quick options offered by the bot, in days from today. */
export const DATE_OPTION_DAYS = [10, 14, 20, 30, 45] as const;
