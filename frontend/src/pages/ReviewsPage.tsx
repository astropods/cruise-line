import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  CheckCircle, XCircle, ChatCircle, CircleNotch, WarningCircle, MagnifyingGlass, Play, ArrowsClockwise,
  GitMerge, GitPullRequest,
  type Icon,
} from '@phosphor-icons/react';
import type { PrSummary, Verdict } from '../api';
import { usePrList } from '../features/inbox/usePrList';
import { useStartReview } from '../features/review/useStartReview';
import { PageLoading, ErrorState } from '../components/LoadingStates';

const verdictChip: Record<Verdict, { label: string; icon: Icon; className: string }> = {
  approve: { label: 'Approve', icon: CheckCircle, className: 'text-green-400 border-green-500/30 bg-green-500/5' },
  request_changes: { label: 'Changes requested', icon: XCircle, className: 'text-red-400 border-red-500/30 bg-red-500/5' },
  needs_discussion: { label: 'Needs discussion', icon: ChatCircle, className: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5' },
};

type StatusFilter = 'all' | 'not_reviewed' | 'reviewing' | 'reviewed' | 'failed';
type StateFilter = 'open' | 'merged' | 'closed' | 'any';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_reviewed', label: 'Not reviewed' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'failed', label: 'Failed' },
];

function statusGroup(p: PrSummary): Exclude<StatusFilter, 'all'> {
  switch (p.status) {
    case 'none': return 'not_reviewed';
    case 'pending':
    case 'running': return 'reviewing';
    case 'complete': return 'reviewed';
    case 'failed': return 'failed';
  }
}

function matchesState(p: PrSummary, filter: StateFilter): boolean {
  if (filter === 'any') return true;
  // PRs reviewed before tracking began have no known state; treat them as
  // open so they don't vanish from the default view.
  return (p.prState ?? 'open') === filter;
}

const prKey = (p: PrSummary) => `${p.owner}/${p.repo}#${p.number}`;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Every PR Cruise Line has seen or reviewed in repos the viewer can access. */
export function ReviewsPage() {
  const list = usePrList();
  const prs = list.data?.prs ?? null;
  const githubUrl = list.data?.githubUrl ?? 'https://github.com';
  const error = list.error?.message ?? null;
  const start = useStartReview();
  const [startErrors, setStartErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  // Filters live in the URL so they survive opening a PR and coming back.
  const [params, setParams] = useSearchParams();
  const statusFilter = (params.get('status') as StatusFilter | null) ?? 'all';
  const stateFilter = (params.get('state') as StateFilter | null) ?? 'open';
  const repoFilter = params.get('repo') ?? 'all';

  function setParam(key: string, value: string, defaultValue: string) {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value === defaultValue) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }

  function startReview(pr: PrSummary) {
    const key = prKey(pr);
    setStartErrors(({ [key]: _, ...rest }) => rest);
    start.mutate(
      { owner: pr.owner, repo: pr.repo, number: pr.number },
      { onError: (err) => setStartErrors((e) => ({ ...e, [key]: err.message })) },
    );
  }

  const repos = useMemo(
    () => [...new Set((prs ?? []).map((p) => `${p.owner}/${p.repo}`))].sort(),
    [prs],
  );

  // Everything but the status filter, so the chips can show counts.
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (prs ?? []).filter((p) => {
      if (!matchesState(p, stateFilter)) return false;
      if (repoFilter !== 'all' && `${p.owner}/${p.repo}` !== repoFilter) return false;
      if (!q) return true;
      return [p.title ?? '', p.author ?? '', prKey(p)].some((field) => field.toLowerCase().includes(q));
    });
  }, [prs, query, repoFilter, stateFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: baseFiltered.length, not_reviewed: 0, reviewing: 0, reviewed: 0, failed: 0 };
    for (const p of baseFiltered) counts[statusGroup(p)]++;
    return counts;
  }, [baseFiltered]);

  const visible = statusFilter === 'all'
    ? baseFiltered
    : baseFiltered.filter((p) => statusGroup(p) === statusFilter);

  if (error && !prs) return <ErrorState message={error} onRetry={() => list.refetch()} />;
  if (!prs) return <PageLoading />;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-[920px] mx-auto px-8 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="text-base font-semibold text-[var(--text-bright)] hover:text-[var(--accent)] transition-colors">
            Cruise Line
          </Link>
          <span className="text-xs text-[var(--text-secondary)]">
            {prs.length} {prs.length === 1 ? 'pull request' : 'pull requests'}
          </span>
        </div>
      </header>

      <main className="max-w-[920px] mx-auto px-8 py-10">
        <h1 className="text-2xl font-semibold text-[var(--text-bright)] mb-6">Pull requests</h1>

        {prs.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="relative flex-1 min-w-[220px]">
                <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by title, author, or number"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/60 focus:outline-none focus:border-[var(--accent)]"
                />
              </label>
              <select
                value={stateFilter}
                onChange={(e) => setParam('state', e.target.value, 'open')}
                aria-label="PR state"
                className="py-2 px-3 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="open">Open</option>
                <option value="merged">Merged</option>
                <option value="closed">Closed</option>
                <option value="any">Any state</option>
              </select>
              {repos.length > 1 && (
                <select
                  value={repoFilter}
                  onChange={(e) => setParam('repo', e.target.value, 'all')}
                  aria-label="Repository"
                  className="py-2 px-3 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="all">All repositories</option>
                  {repos.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mb-6" role="tablist" aria-label="Review status">
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setParam('status', f.value, 'all')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-bright)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {f.label}
                    <span className="tabular-nums text-[var(--text-secondary)]">{statusCounts[f.value]}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {prs.length === 0 ? (
          <div className="p-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-center text-sm text-[var(--text-secondary)]">
            No pull requests yet. They show up here as soon as one is opened in a connected repository.
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
            Nothing matches these filters.
          </div>
        ) : (
          <ul className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            {visible.map((p) => (
              <li key={prKey(p)}>
                <PrRow
                  pr={p}
                  githubUrl={githubUrl}
                  startError={startErrors[prKey(p)]}
                  onStart={() => startReview(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function PrRow({ pr, githubUrl, startError, onStart }: {
  pr: PrSummary;
  githubUrl: string;
  startError?: string;
  onStart: () => void;
}) {
  const running = pr.status === 'pending' || pr.status === 'running';
  // Reviews need a live branch; don't offer them on closed or merged PRs.
  const canStart = (pr.status === 'none' || pr.status === 'failed') && (pr.prState ?? 'open') === 'open';

  return (
    // The overlay link makes the whole row clickable while the action
    // button stays a separate, non-nested control.
    <div className="relative flex items-center gap-4 px-4 py-3 bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
      <Link
        to={`/${pr.owner}/${pr.repo}/pull/${pr.number}`}
        aria-label={pr.title ?? prKey(pr)}
        className="absolute inset-0"
      />

      {pr.author ? (
        <img
          src={`${githubUrl}/${pr.author}.png?size=64`}
          alt=""
          className="w-8 h-8 rounded-full flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full flex-shrink-0 bg-[var(--bg-tertiary)]" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-medium ${pr.title ? 'text-[var(--text-bright)]' : 'text-[var(--text-secondary)] italic'}`}>
          {pr.title ?? 'Untitled pull request'}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-[var(--text-secondary)]">
          <PrStateIcon state={pr.prState} />
          {pr.owner}/{pr.repo}#{pr.number}
          {pr.author && ` by ${pr.author}`}
          {' · '}
          {timeAgo(pr.updatedAt)}
        </span>
        {startError && <span className="truncate text-xs text-red-400">{startError}</span>}
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        {pr.status === 'none' && (
          <span className="text-xs text-[var(--text-secondary)]">Not reviewed</span>
        )}
        {running && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <CircleNotch size={12} weight="bold" className="animate-spin" />
            Reviewing
          </span>
        )}
        {pr.status === 'failed' && (
          <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
            <WarningCircle size={12} weight="bold" />
            Last run failed
          </span>
        )}
        {pr.findingCount != null && (
          <span className="text-xs tabular-nums text-[var(--text-secondary)]">
            {pr.findingCount} {pr.findingCount === 1 ? 'finding' : 'findings'}
          </span>
        )}
        {pr.verdict && <VerdictChip verdict={pr.verdict} />}
        {canStart && (
          <button
            onClick={onStart}
            className="relative z-10 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--text-bright)] transition-colors"
          >
            {pr.status === 'failed' ? <ArrowsClockwise size={12} /> : <Play size={12} weight="fill" />}
            {pr.status === 'failed' ? 'Retry' : 'Start review'}
          </button>
        )}
      </div>
    </div>
  );
}

function PrStateIcon({ state }: { state: PrSummary['prState'] }) {
  if (state === 'merged') return <GitMerge size={12} weight="bold" className="flex-shrink-0 text-purple-400" aria-label="Merged" />;
  if (state === 'closed') return <GitPullRequest size={12} weight="bold" className="flex-shrink-0 text-red-400" aria-label="Closed" />;
  if (state === 'open') return <GitPullRequest size={12} weight="bold" className="flex-shrink-0 text-green-400" aria-label="Open" />;
  return null;
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const v = verdictChip[verdict] ?? verdictChip.needs_discussion;
  const Icon = v.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${v.className}`}>
      <Icon size={12} weight="fill" />
      {v.label}
    </span>
  );
}
