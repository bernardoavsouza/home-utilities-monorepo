import { describe, expect, it } from 'vitest';
import { sanitizeRequestId } from '@/shared/infrastructure/http/request-id.middleware';

describe('sanitizeRequestId', () => {
  it('reuses a trimmed id that looks like an id', () => {
    expect(sanitizeRequestId('  my-trace_1.2  ')).toBe('my-trace_1.2');
  });

  it.each([
    ['missing', undefined],
    ['non-string', 42],
    ['blank', '   '],
    ['too long', 'a'.repeat(129)],
    ['newline injection', 'abc\ndef'],
    ['space inside', 'abc def'],
    ['non-ascii', 'traço-1'],
    ['header separator', 'abc:def'],
  ])('rejects %s', (_label, value) => {
    expect(sanitizeRequestId(value)).toBeUndefined();
  });

  it('accepts an id exactly at the length limit', () => {
    const id = 'a'.repeat(128);
    expect(sanitizeRequestId(id)).toBe(id);
  });
});
