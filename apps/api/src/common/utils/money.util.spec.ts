import {
  formatKurus,
  formatQuantity,
  parseMoneyInput,
  parseQuantityInput,
} from './money.util';

describe('parseMoneyInput', () => {
  it.each([
    ['1000', 100_000],
    ['1.000', 100_000],
    ['1000,50', 100_050],
    ['1.000,50', 100_050],
    ['1.500', 150_000],
    ['2300', 230_000],
    ['10,5', 1_050],
    ['0,50', 50],
    ['1.250.000', 125_000_000],
    ['25000 TL', 2_500_000],
    [' 100 ', 10_000],
  ])('parses %s into %d kurus', (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '10.5', // ambiguous: dot must group exactly three digits
    '1.50',
    '1,234', // comma allows at most two decimals
    '-100',
    '0',
    '0,00',
    '1..000',
    '1.000.0',
    '10,5,5',
    '1.0000',
  ])('rejects invalid input %s', (input) => {
    expect(parseMoneyInput(input)).toBeNull();
  });

  it('rejects amounts above the sanity bound', () => {
    expect(parseMoneyInput('999.999.999.999')).toBeNull();
  });
});

describe('formatKurus', () => {
  it.each([
    [230_000, '2.300 TL'],
    [5_000_000, '50.000 TL'],
    [125_050, '1.250,50 TL'],
    [50, '0,50 TL'],
    [100, '1 TL'],
    [-50_000, '-500 TL'],
    [105, '1,05 TL'],
  ])('formats %d kurus as %s', (kurus, expected) => {
    expect(formatKurus(kurus)).toBe(expected);
  });
});

describe('parseQuantityInput', () => {
  it.each([
    ['3', 3],
    ['2,5', 2.5],
    ['0,25', 0.25],
    [' 12 ', 12],
  ])('parses %s into %d', (input, expected) => {
    expect(parseQuantityInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '-3', '0', '2.5', '1,2345'])('rejects %s', (input) => {
    expect(parseQuantityInput(input)).toBeNull();
  });
});

describe('formatQuantity', () => {
  it.each([
    [3, '3'],
    [2.5, '2,5'],
    ['1.250', '1,25'],
    [0.125, '0,125'],
  ])('formats %p as %s', (input, expected) => {
    expect(formatQuantity(input)).toBe(expected);
  });
});
