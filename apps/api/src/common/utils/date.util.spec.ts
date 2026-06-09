import { DateTime } from 'luxon';
import {
  buildManualDate,
  businessDateAfterDays,
  daysUntil,
  formatBusinessDate,
  isBeforeToday,
  parseIntegerInput,
  reminderInstant,
  todayBusinessDate,
} from './date.util';

describe('todayBusinessDate', () => {
  it('returns a UTC-midnight date', () => {
    const today = todayBusinessDate();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
  });

  it('matches the Istanbul calendar day even late at night', () => {
    // 23:30 Istanbul on 22.03.2026 is 20:30 UTC; the business date must be the 22nd
    const lateNight = DateTime.fromISO('2026-03-22T23:30:00', { zone: 'Europe/Istanbul' });
    jest.useFakeTimers().setSystemTime(lateNight.toJSDate());

    const today = todayBusinessDate();
    expect(formatBusinessDate(today)).toBe('22.03.2026');

    jest.useRealTimers();
  });
});

describe('buildManualDate', () => {
  it('builds valid dates', () => {
    const date = buildManualDate(22, 3, 2026);
    expect(date).not.toBeNull();
    expect(formatBusinessDate(date as Date)).toBe('22.03.2026');
  });

  it.each([
    [31, 2, 2026], // February has no 31st
    [0, 1, 2026],
    [1, 13, 2026],
    [1, 1, 1999], // out of supported range
    [1, 1, 3000],
  ])('rejects impossible date %d.%d.%d', (day, month, year) => {
    expect(buildManualDate(day, month, year)).toBeNull();
  });
});

describe('parseIntegerInput', () => {
  it('parses plain integers', () => {
    expect(parseIntegerInput(' 22 ')).toBe(22);
    expect(parseIntegerInput('03')).toBe(3);
  });

  it.each(['', 'abc', '-1', '1,5', '12345'])('rejects %p', (input) => {
    expect(parseIntegerInput(input)).toBeNull();
  });
});

describe('date arithmetic', () => {
  beforeEach(() => {
    jest
      .useFakeTimers()
      .setSystemTime(
        DateTime.fromISO('2026-03-22T10:00:00', { zone: 'Europe/Istanbul' }).toJSDate(),
      );
  });

  afterEach(() => jest.useRealTimers());

  it('computes future business dates', () => {
    expect(formatBusinessDate(businessDateAfterDays(10))).toBe('01.04.2026');
  });

  it('detects past dates', () => {
    expect(isBeforeToday(buildManualDate(21, 3, 2026) as Date)).toBe(true);
    expect(isBeforeToday(buildManualDate(22, 3, 2026) as Date)).toBe(false);
  });

  it('counts days until a business date', () => {
    expect(daysUntil(buildManualDate(25, 3, 2026) as Date)).toBe(3);
    expect(daysUntil(buildManualDate(22, 3, 2026) as Date)).toBe(0);
  });

  it('schedules reminders at the configured Istanbul hour', () => {
    const dueDate = buildManualDate(30, 4, 2026) as Date;
    const instant = reminderInstant(dueDate, 3, 9);
    const istanbul = DateTime.fromJSDate(instant).setZone('Europe/Istanbul');
    expect(istanbul.toFormat('dd.MM.yyyy HH:mm')).toBe('27.04.2026 09:00');
  });
});
