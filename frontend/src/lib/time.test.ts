import { describe, it, expect } from 'bun:test';
import { formatAgo, formatAgoPhrase, formatElapsed } from './time';

const NOW = new Date('2026-10-20T12:00:00').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

describe('formatAgo', () => {
  it('rounds down through minutes, hours, and days', () => {
    expect(formatAgo(ago(20_000), NOW)).toBe('now');
    expect(formatAgo(ago(12 * MIN), NOW)).toBe('12m');
    expect(formatAgo(ago(3 * 60 * MIN + 59 * MIN), NOW)).toBe('3h');
    expect(formatAgo(ago(6 * 24 * 60 * MIN), NOW)).toBe('6d');
  });

  it('switches to a date after a week', () => {
    expect(formatAgo(new Date('2026-09-30T09:00:00').toISOString(), NOW)).toBe('Sep 30');
    expect(formatAgo(new Date('2025-12-24T09:00:00').toISOString(), NOW)).toBe('Dec 24, 2025');
  });

  it('treats future timestamps as now', () => {
    expect(formatAgo(ago(-5 * MIN), NOW)).toBe('now');
  });
});

describe('formatElapsed', () => {
  it('shows seconds, then minutes and seconds', () => {
    expect(formatElapsed(42)).toBe('42s');
    expect(formatElapsed(102)).toBe('1m 42s');
  });
});

describe('formatAgoPhrase', () => {
  it('reads as part of a sentence', () => {
    expect(formatAgoPhrase(ago(10_000), NOW)).toBe('just now');
    expect(formatAgoPhrase(ago(12 * MIN), NOW)).toBe('12m ago');
    expect(formatAgoPhrase(ago(30 * 60 * MIN), NOW)).toBe('yesterday');
    expect(formatAgoPhrase(ago(3 * 24 * 60 * MIN), NOW)).toBe('3d ago');
    expect(formatAgoPhrase(new Date('2026-09-30T09:00:00').toISOString(), NOW)).toBe('on Sep 30');
  });
});
