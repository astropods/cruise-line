import type { Verdict } from '../api/types';
import type { PrState, RunStatus } from '../api/prs';
import { blockingCount, type SeverityCounts } from './severity';
import type { Tone } from './tone';

/**
 * The one place that decides how a PR's state looks. The inbox row, the
 * PR bar, and the verdict card all read from here.
 */

/** Icon keys; ui/StatusIcon renders each */
export type StatusIcon =
  | 'running'
  | 'failed'
  | 'not-reviewed'
  | 'approved'
  | 'changes'
  | 'discussion'
  | 'merged'
  | 'closed';

export interface StatusView {
  tone: Tone;
  icon: StatusIcon;
  label: string;
}

export interface PrStatusInput {
  status: RunStatus;
  /** Null for PRs reviewed before PR tracking existed; treated as open */
  prState: PrState | null;
  verdict: Verdict | null;
  severityCounts?: Partial<SeverityCounts>;
}

const VERDICTS: Record<Verdict, StatusView> = {
  approve: { tone: 'success', icon: 'approved', label: 'Looks good' },
  request_changes: { tone: 'danger', icon: 'changes', label: 'Changes requested' },
  needs_discussion: { tone: 'warning', icon: 'discussion', label: 'Needs discussion' },
};

export function verdictView(verdict: Verdict): StatusView {
  return VERDICTS[verdict] ?? VERDICTS.needs_discussion;
}

export function isRunning(status: RunStatus): boolean {
  return status === 'pending' || status === 'running';
}

export function isOpen(pr: Pick<PrStatusInput, 'prState'>): boolean {
  return pr.prState === 'open' || pr.prState === null;
}

/**
 * The status a PR shows in a list: a running review first, then merged or
 * closed, then a failed run, then the verdict.
 */
export function reviewStatusView(pr: PrStatusInput): StatusView {
  if (isRunning(pr.status)) return { tone: 'accent', icon: 'running', label: 'Reviewing' };
  if (pr.prState === 'merged') return { tone: 'done', icon: 'merged', label: 'Merged' };
  if (pr.prState === 'closed') return { tone: 'neutral', icon: 'closed', label: 'Closed' };
  if (pr.status === 'failed') return { tone: 'danger', icon: 'failed', label: 'Review failed' };
  if (pr.status === 'none' || !pr.verdict) {
    return { tone: 'neutral', icon: 'not-reviewed', label: 'Not reviewed' };
  }
  return verdictView(pr.verdict);
}

/**
 * Open PRs that need a person to act: a review is running, failed, or was
 * never run, or the last review requested changes or found something
 * blocking. Merged and closed PRs never count; there's no record of
 * whether their findings were dealt with.
 */
export function needsAttention(pr: PrStatusInput): boolean {
  if (!isOpen(pr)) return false;
  if (pr.status !== 'complete') return true;
  if (pr.verdict === 'request_changes') return true;
  return blockingCount(pr.severityCounts ?? {}) > 0;
}

export type InboxTab = 'attention' | 'open' | 'done';

/** Which inbox tabs list this PR. "All open" includes everything open. */
export function inboxTabs(pr: PrStatusInput): InboxTab[] {
  if (!isOpen(pr)) return ['done'];
  return needsAttention(pr) ? ['attention', 'open'] : ['open'];
}

export type BarState = 'reviewing' | 'failed' | 'stale' | 'merged' | 'closed';

/**
 * The state pill in the PR bar, or null when there's nothing to say beyond
 * the review itself.
 */
export function barState(pr: PrStatusInput & { isStale: boolean }): BarState | null {
  if (isRunning(pr.status)) return 'reviewing';
  if (pr.prState === 'merged') return 'merged';
  if (pr.prState === 'closed') return 'closed';
  if (pr.status === 'failed') return 'failed';
  if (pr.isStale) return 'stale';
  return null;
}
