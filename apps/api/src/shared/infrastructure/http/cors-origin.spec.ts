import { describe, expect, it } from 'vitest';
import { parseCorsOrigin } from '@/shared/infrastructure/http/cors-origin';

describe('parseCorsOrigin', () => {
  it('returns undefined when the env is missing or blank', () => {
    expect(parseCorsOrigin(undefined)).toBeUndefined();
    expect(parseCorsOrigin('')).toBeUndefined();
    expect(parseCorsOrigin('   ')).toBeUndefined();
  });

  it('returns a single origin as a list', () => {
    expect(parseCorsOrigin('http://localhost:3000')).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('splits a comma-separated list and trims entries', () => {
    expect(
      parseCorsOrigin(' http://localhost:3000 , https://app.example.com '),
    ).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });
});
