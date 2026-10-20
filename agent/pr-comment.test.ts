import { describe, expect, it } from 'bun:test';
import { buildCommentBody, commentStateFor, COMMENT_MARKER } from './github/pr-comment.js';
import { countFindings, severityCounts } from './analysis/summary.js';

const data = {
  verdict: 'request_changes',
  verdictRationale: 'One blocking issue.',
  findings: [{ severity: 'high' }, { severity: 'low' }, { severity: 'low' }],
} as any;

describe('commentStateFor', () => {
  it('is ready with no review', () => {
    expect(commentStateFor(null, 'abc')).toEqual({ status: 'ready' });
  });

  it('is complete for a finished review of the current head', () => {
    const state = commentStateFor({ status: 'complete', head_sha: 'abc', data }, 'abc');
    expect(state.status).toBe('complete');
  });

  it('is stale for a finished review of an older commit, even one that just finished', () => {
    const state = commentStateFor({ status: 'complete', head_sha: 'old', data }, 'new');
    expect(state.status).toBe('stale');
  });

  it('is running while pending or running, and failed after a failure', () => {
    expect(commentStateFor({ status: 'pending', head_sha: 'a', data: null }, 'a')).toEqual({ status: 'running' });
    expect(commentStateFor({ status: 'running', head_sha: 'a', data: null }, 'a')).toEqual({ status: 'running' });
    expect(commentStateFor({ status: 'failed', head_sha: 'a', data }, 'a')).toEqual({ status: 'failed' });
  });
});

describe('buildCommentBody', () => {
  const url = 'https://cl.example/o/r/pull/1';

  it('lists finding counts by severity', () => {
    const body = buildCommentBody(commentStateFor({ status: 'complete', head_sha: 'a', data }, 'a'), url);
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain('Changes requested');
    expect(body).toContain('**3 findings:** 1 high · 2 low');
    expect(body).toContain('View full analysis');
    expect(body).not.toContain('Stale');
  });

  it('marks a stale review and offers a rerun', () => {
    const body = buildCommentBody(commentStateFor({ status: 'complete', head_sha: 'a', data }, 'b'), url);
    expect(body).toContain('**Stale**');
    expect(body).toContain('Re-run analysis');
  });

  it('says so when there are no findings', () => {
    const body = buildCommentBody(
      commentStateFor({ status: 'complete', head_sha: 'a', data: { ...data, findings: [] } }, 'a'),
      url,
    );
    expect(body).toContain('No findings.');
  });
});

describe('severity counts', () => {
  it('fills in every severity', () => {
    expect(severityCounts({ high: '2' } as any)).toEqual({ critical: 0, high: 2, medium: 0, low: 0, info: 0 });
  });

  it('ignores unknown severities', () => {
    expect(countFindings([{ severity: 'critical' }, { severity: 'nope' }])).toEqual({ critical: 1, high: 0, medium: 0, low: 0, info: 0 });
  });
});
