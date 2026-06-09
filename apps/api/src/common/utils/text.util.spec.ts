import { chunkMessage } from './text.util';

describe('chunkMessage', () => {
  it('returns short messages untouched', () => {
    expect(chunkMessage('merhaba')).toEqual(['merhaba']);
  });

  it('splits long messages on line boundaries', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `satır ${i} `.repeat(10));
    const text = lines.join('\n');
    const chunks = chunkMessage(text, 500);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
    // No content is lost (joining back yields the original line set)
    expect(chunks.join('\n')).toBe(text);
  });

  it('hard-splits single lines longer than the limit', () => {
    const text = 'a'.repeat(1200);
    const chunks = chunkMessage(text, 500);
    expect(chunks).toEqual(['a'.repeat(500), 'a'.repeat(500), 'a'.repeat(200)]);
  });
});
