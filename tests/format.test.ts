import { describe, expect, it } from 'vitest';
import { formatAge, formatDuration, formatPrice, formatUsd, sanitizeSymbolList } from '../src/lib/format';

describe('format utilities', () => {
  it('formats money and price ranges', () => {
    expect(formatUsd(1_250_000)).toBe('$1.25M');
    expect(formatUsd(1_234, 'full')).toContain('1.234');
    expect(formatPrice(0.00123456)).toBe('0.0012346');
  });

  it('formats relative and duration times', () => {
    expect(formatAge(1_000, false, 31_000)).toBe('30sn');
    expect(formatAge(1_000, false, 121_000)).toBe('2dk');
    expect(formatDuration(3_661)).toBe('01:01:01');
  });

  it('normalizes symbol lists', () => {
    expect(sanitizeSymbolList(' btc, ETH,btc ,, ')).toEqual(['BTC', 'ETH']);
  });
});
