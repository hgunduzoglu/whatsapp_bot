/** WhatsApp text messages are limited to 4096 characters. */
export const WHATSAPP_MAX_MESSAGE_LENGTH = 4000;

/**
 * Splits a long message into chunks that fit WhatsApp's limit,
 * breaking on line boundaries whenever possible.
 */
export function chunkMessage(text: string, maxLength = WHATSAPP_MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    // A single line longer than the limit is hard-split
    if (line.length > maxLength) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += maxLength) {
        const piece = line.slice(i, i + maxLength);
        if (piece.length === maxLength) {
          chunks.push(piece);
        } else {
          current = piece;
        }
      }
      continue;
    }

    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (candidate.length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current);
  }
  return chunks;
}
