/**
 * Name normalization used for searching and duplicate detection.
 *
 * Rules:
 *  - trim and collapse whitespace
 *  - lowercase with Turkish locale
 *  - fold Turkish diacritics so "Çelik" and "celik" match
 *  - digits are preserved (Arabic chat alphabet names like "Mehmet 7asan")
 *  - letters, digits, spaces, hyphens and apostrophes are kept
 */

const TURKISH_FOLD_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

export function normalizeName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  const lowered = collapsed.toLocaleLowerCase('tr-TR');
  let folded = '';
  for (const char of lowered) {
    folded += TURKISH_FOLD_MAP[char] ?? char;
  }
  // Strip any remaining combining marks (e.g. typed accents)
  return folded.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const NAME_FORMAT = /^[\p{L}\p{N}\s'-]+$/u;

/** Validates a customer/payee/product/plant name typed by the user. */
export function isValidName(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 120 && NAME_FORMAT.test(trimmed);
}

/** Builds the display label: "Mehmet Ali" or "Mehmet Ali - Karadere". */
export function customerLabel(baseName: string, identifier?: string | null): string {
  return identifier && identifier.trim().length > 0 ? `${baseName} - ${identifier}` : baseName;
}
