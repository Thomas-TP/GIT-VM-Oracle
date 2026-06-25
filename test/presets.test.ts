import { describe, it, expect } from 'vitest';
import { PERF, STORAGE, isValidPerf, isValidStorage, isValidOs, estimateMonthlyUsd, STORAGE_USD_GB_MONTH } from '../src/presets';

describe('preset validators', () => {
  it('accepts known ids and rejects unknown', () => {
    expect(isValidPerf('eco')).toBe(true);
    expect(isValidPerf('nope')).toBe(false);
    expect(isValidStorage('s50')).toBe(true);
    expect(isValidOs('ubuntu2404')).toBe(true);
    expect(isValidOs('windows')).toBe(false);
  });
});

describe('cost estimate', () => {
  it('sums compute + storage for the month', () => {
    const c = estimateMonthlyUsd('eco', 's50');
    expect(c).toBeCloseTo(PERF.eco.hourlyUsd * 730 + STORAGE.s50.sizeGb * STORAGE_USD_GB_MONTH, 4);
  });
  it('returns 0 for invalid composition', () => {
    expect(estimateMonthlyUsd('bad', 'bad')).toBe(0);
  });
});
