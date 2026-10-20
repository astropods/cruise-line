import { describe, it, expect } from 'bun:test';
import { barState, inboxTabs, needsAttention, reviewStatusView, type PrStatusInput } from './prStatus';

const pr = (overrides: Partial<PrStatusInput>): PrStatusInput => ({
  status: 'complete',
  prState: 'open',
  verdict: 'approve',
  ...overrides,
});

describe('reviewStatusView', () => {
  it('shows a running review before anything else', () => {
    expect(reviewStatusView(pr({ status: 'running', prState: 'merged' })).icon).toBe('running');
    expect(reviewStatusView(pr({ status: 'pending' })).label).toBe('Reviewing');
  });

  it('shows merged and closed over a failed run', () => {
    expect(reviewStatusView(pr({ status: 'failed', prState: 'merged' })).tone).toBe('done');
    expect(reviewStatusView(pr({ status: 'failed', prState: 'closed' })).icon).toBe('closed');
    expect(reviewStatusView(pr({ status: 'failed' })).tone).toBe('danger');
  });

  it('shows not reviewed when no review ever ran', () => {
    expect(reviewStatusView(pr({ status: 'none', verdict: null })).label).toBe('Not reviewed');
  });

  it('falls back to the verdict', () => {
    expect(reviewStatusView(pr({ verdict: 'request_changes' })).label).toBe('Changes requested');
    expect(reviewStatusView(pr({ verdict: 'approve' })).tone).toBe('success');
  });
});

describe('needsAttention', () => {
  it('flags open PRs that are running, failed, or never reviewed', () => {
    expect(needsAttention(pr({ status: 'running' }))).toBe(true);
    expect(needsAttention(pr({ status: 'failed' }))).toBe(true);
    expect(needsAttention(pr({ status: 'none', verdict: null }))).toBe(true);
  });

  it('flags requested changes and blocking findings', () => {
    expect(needsAttention(pr({ verdict: 'request_changes' }))).toBe(true);
    expect(needsAttention(pr({ severityCounts: { high: 1 } }))).toBe(true);
  });

  it('skips approved PRs with nothing blocking', () => {
    expect(needsAttention(pr({ severityCounts: { medium: 2, info: 1 } }))).toBe(false);
  });

  it('never flags merged or closed PRs', () => {
    expect(needsAttention(pr({ prState: 'merged', verdict: 'request_changes' }))).toBe(false);
    expect(needsAttention(pr({ prState: 'closed', status: 'failed' }))).toBe(false);
  });

  it('treats untracked PRs as open', () => {
    expect(needsAttention(pr({ prState: null, verdict: 'request_changes' }))).toBe(true);
  });
});

describe('inboxTabs', () => {
  it('lists attention PRs under All open too', () => {
    expect(inboxTabs(pr({ verdict: 'request_changes' }))).toEqual(['attention', 'open']);
    expect(inboxTabs(pr({}))).toEqual(['open']);
    expect(inboxTabs(pr({ prState: 'merged' }))).toEqual(['done']);
  });
});

describe('barState', () => {
  it('picks the state worth a pill', () => {
    expect(barState({ ...pr({ status: 'running' }), isStale: true })).toBe('reviewing');
    expect(barState({ ...pr({ prState: 'merged' }), isStale: true })).toBe('merged');
    expect(barState({ ...pr({ status: 'failed' }), isStale: false })).toBe('failed');
    expect(barState({ ...pr({}), isStale: true })).toBe('stale');
    expect(barState({ ...pr({}), isStale: false })).toBeNull();
  });
});
