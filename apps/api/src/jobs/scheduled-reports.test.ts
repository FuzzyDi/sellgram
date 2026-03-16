import { describe, it, expect } from 'vitest';
import { calcNextRunAt } from './scheduled-reports.js';

describe('calcNextRunAt', () => {
  const base = new Date('2026-03-16T10:00:00.000Z'); // Monday 10:00 UTC

  it('DAILY → next day at 08:00 UTC', () => {
    const next = calcNextRunAt('DAILY', base);
    expect(next.toISOString()).toBe('2026-03-17T08:00:00.000Z');
  });

  it('WEEKLY → 7 days later at 08:00 UTC', () => {
    const next = calcNextRunAt('WEEKLY', base);
    expect(next.toISOString()).toBe('2026-03-23T08:00:00.000Z');
  });

  it('MONTHLY → next month same date at 08:00 UTC', () => {
    const next = calcNextRunAt('MONTHLY', base);
    expect(next.toISOString()).toBe('2026-04-16T08:00:00.000Z');
  });

  it('uses current time when no base provided', () => {
    const next = calcNextRunAt('DAILY');
    expect(next.getUTCHours()).toBe(8);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCSeconds()).toBe(0);
  });
});
