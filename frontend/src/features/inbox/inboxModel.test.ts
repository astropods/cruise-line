import { describe, it, expect } from 'bun:test';
import type { PrSummary } from '../../api';
import { filterInbox, matchesSearch, parseInboxTab, rowDetail, tabCounts } from './inboxModel';

const pr = (overrides: Partial<PrSummary>): PrSummary => ({
  owner: 'astropods', repo: 'cruise-line', number: 1, status: 'complete', prState: 'open',
  headSha: 'abc', updatedAt: '2026-10-20T00:00:00Z', title: 'Fix things', author: 'cpatty',
  verdict: 'approve', findingCount: 2, severityCounts: { critical: 0, high: 0, medium: 1, low: 1, info: 0 },
  authorAvatarUrl: null, headRef: null, baseRef: null, additions: null, deletions: null,
  changedFiles: null, mergedAt: null,
  ...overrides,
});

describe('parseInboxTab', () => {
  it('defaults to needs attention', () => {
    expect(parseInboxTab(null)).toBe('attention');
    expect(parseInboxTab('bogus')).toBe('attention');
    expect(parseInboxTab('done')).toBe('done');
  });
});

describe('matchesSearch', () => {
  it('matches title, author, and repo#number', () => {
    const p = pr({ number: 316, title: 'Let owners pick the model' });
    expect(matchesSearch(p, 'OWNERS')).toBe(true);
    expect(matchesSearch(p, '@cpat')).toBe(true);
    expect(matchesSearch(p, 'cruise-line#316')).toBe(true);
    expect(matchesSearch(p, 'cruise-line #316')).toBe(true);
    expect(matchesSearch(p, 'webhook')).toBe(false);
    expect(matchesSearch(p, '   ')).toBe(true);
  });
});

describe('filterInbox and tabCounts', () => {
  const prs = [
    pr({ number: 1, verdict: 'request_changes' }),
    pr({ number: 2 }),
    pr({ number: 3, prState: 'merged' }),
    pr({ number: 4, status: 'none', verdict: null, findingCount: null, severityCounts: null }),
  ];

  it('puts each PR in its tabs', () => {
    expect(filterInbox(prs, 'attention', '').map((p) => p.number)).toEqual([1, 4]);
    expect(filterInbox(prs, 'open', '').map((p) => p.number)).toEqual([1, 2, 4]);
    expect(filterInbox(prs, 'done', '').map((p) => p.number)).toEqual([3]);
    expect(tabCounts(prs)).toEqual({ attention: 2, open: 3, done: 1 });
  });

  it('applies search within the tab', () => {
    expect(filterInbox(prs, 'open', '#2').map((p) => p.number)).toEqual([2]);
  });
});

describe('rowDetail', () => {
  it('picks the line under the title', () => {
    expect(rowDetail(pr({ status: 'running' })).kind).toBe('running');
    expect(rowDetail(pr({ prState: 'merged', status: 'failed' }))).toEqual({ kind: 'state', state: 'merged' });
    expect(rowDetail(pr({ status: 'failed' })).kind).toBe('failed');
    expect(rowDetail(pr({ status: 'none', verdict: null })).kind).toBe('start');
    expect(rowDetail(pr({ severityCounts: { critical: 1, high: 1, medium: 0, low: 0, info: 0 }, findingCount: 5 })))
      .toEqual({ kind: 'verdict', blocking: 2, findings: 5 });
  });
});
