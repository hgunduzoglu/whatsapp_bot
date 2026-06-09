import { customerLabel, isValidName, normalizeName } from './normalize.util';

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Mehmet   7asan  ')).toBe('mehmet 7asan');
  });

  it('lowercases with Turkish rules', () => {
    expect(normalizeName('İBRAHİM')).toBe('ibrahim');
    expect(normalizeName('ISPARTA')).toBe('isparta');
  });

  it('folds Turkish diacritics for search compatibility', () => {
    expect(normalizeName('Çelik Gündüz')).toBe('celik gunduz');
    expect(normalizeName('Şükrü')).toBe('sukru');
  });

  it('keeps digits used in Arabic chat alphabet names', () => {
    expect(normalizeName('Mu7ammed 3ali')).toBe('mu7ammed 3ali');
  });

  it('keeps hyphens and apostrophes', () => {
    expect(normalizeName("Ali-Veli O'zdemir")).toBe("ali-veli o'zdemir");
  });
});

describe('isValidName', () => {
  it.each(['Mehmet Ali', 'Mehmet 7asan', "O'Brien", 'Ali-Veli', 'Ayşe'])(
    'accepts %s',
    (name) => {
      expect(isValidName(name)).toBe(true);
    },
  );

  it.each(['', '   ', 'a@b', 'x'.repeat(121), 'isim!?'])('rejects %p', (name) => {
    expect(isValidName(name)).toBe(false);
  });
});

describe('customerLabel', () => {
  it('uses only the base name when there is no identifier', () => {
    expect(customerLabel('Mehmet Ali', null)).toBe('Mehmet Ali');
    expect(customerLabel('Mehmet Ali', '')).toBe('Mehmet Ali');
  });

  it('appends the identifier when present', () => {
    expect(customerLabel('Mehmet Ali', 'Karadere')).toBe('Mehmet Ali - Karadere');
  });
});
