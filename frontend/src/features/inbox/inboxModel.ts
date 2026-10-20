import type { PrSummary } from '../../api';
import { inboxTabs, isRunning, type InboxTab, type PrStatusInput } from '../../domain/prStatus';
import { blockingCount } from '../../domain/severity';

export const INBOX_TABS: readonly { value: InboxTab; label: string }[] = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'open', label: 'All open' },
  { value: 'done', label: 'Done' },
];

export function parseInboxTab(value: string | null): InboxTab {
  return value === 'open' || value === 'done' ? value : 'attention';
}

export function toStatusInput(pr: PrSummary): PrStatusInput {
  return {
    status: pr.status,
    prState: pr.prState,
    verdict: pr.verdict,
    severityCounts: pr.severityCounts ?? undefined,
  };
}

export const prKey = (pr: Pick<PrSummary, 'owner' | 'repo' | 'number'>) => `${pr.owner}/${pr.repo}#${pr.number}`;

export function prPath(pr: Pick<PrSummary, 'owner' | 'repo' | 'number'>): string {
  return `/${pr.owner}/${pr.repo}/pull/${pr.number}`;
}

/** Case-insensitive match on title, author, or "owner/repo#123" */
export function matchesSearch(pr: PrSummary, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (!q) return true;
  return [pr.title ?? '', pr.author ?? '', prKey(pr), `${pr.repo} #${pr.number}`]
    .some((field) => field.toLowerCase().includes(q));
}

export function filterInbox(prs: readonly PrSummary[], tab: InboxTab, query: string): PrSummary[] {
  return prs.filter((pr) => inboxTabs(toStatusInput(pr)).includes(tab) && matchesSearch(pr, query));
}

export function tabCounts(prs: readonly PrSummary[]): Record<InboxTab, number> {
  const counts: Record<InboxTab, number> = { attention: 0, open: 0, done: 0 };
  for (const pr of prs) for (const tab of inboxTabs(toStatusInput(pr))) counts[tab]++;
  return counts;
}

/** What a row shows under its title */
export type RowDetail =
  | { kind: 'running' }
  | { kind: 'start' }
  | { kind: 'failed' }
  | { kind: 'state'; state: 'merged' | 'closed' }
  | { kind: 'verdict'; blocking: number; findings: number };

export function rowDetail(pr: PrSummary): RowDetail {
  if (isRunning(pr.status)) return { kind: 'running' };
  if (pr.prState === 'merged' || pr.prState === 'closed') return { kind: 'state', state: pr.prState };
  if (pr.status === 'failed') return { kind: 'failed' };
  if (pr.status === 'none' || !pr.verdict) return { kind: 'start' };
  return {
    kind: 'verdict',
    blocking: blockingCount(pr.severityCounts ?? {}),
    findings: pr.findingCount ?? 0,
  };
}
