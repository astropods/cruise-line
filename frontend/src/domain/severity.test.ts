import { describe, it, expect } from 'bun:test';
import {
  blockingCount,
  countBySeverity,
  severityLabel,
  sortBySeverity,
  summarizeCounts,
} from './severity';

describe('severity', () => {
  it('labels info findings as notes', () => {
    expect(severityLabel('info')).toBe('Note');
  });

  it('counts findings by severity', () => {
    const counts = countBySeverity([{ severity: 'high' }, { severity: 'info' }, { severity: 'high' }]);
    expect(counts).toEqual({ critical: 0, high: 2, medium: 0, low: 0, info: 1 });
  });

  it('counts critical and high as blocking', () => {
    expect(blockingCount({ critical: 1, high: 2, medium: 5 })).toBe(3);
    expect(blockingCount({})).toBe(0);
  });

  it('summarizes most severe first and skips zeros', () => {
    expect(summarizeCounts({ info: 1, high: 1, medium: 2, low: 0 })).toBe('1 high · 2 medium · 1 note');
    expect(summarizeCounts({})).toBe('');
  });

  it('sorts most severe first and keeps ties in order', () => {
    const sorted = sortBySeverity([
      { severity: 'low' as const, id: 'a' },
      { severity: 'critical' as const, id: 'b' },
      { severity: 'low' as const, id: 'c' },
    ]);
    expect(sorted.map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });
});
