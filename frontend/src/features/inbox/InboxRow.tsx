import { Link } from 'react-router';
import { ArrowsClockwise, Play } from '@phosphor-icons/react';
import type { PrSummary } from '../../api';
import { reviewStatusView, verdictView } from '../../domain/prStatus';
import { cx } from '../../lib/cx';
import { formatAgo, formatElapsed } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import { Avatar, Button, Pill, ProgressBar, StatusIcon } from '../../ui';
import { rowDetail, toStatusInput } from './inboxModel';

interface InboxRowProps {
  pr: PrSummary;
  to: string;
  selected: boolean;
  /** Shared clock for the "12m" ages, so rows don't each run a timer */
  now: number;
  onStart: () => void;
  starting: boolean;
  startError?: string;
}

export function InboxRow({ pr, to, selected, now, onStart, starting, startError }: InboxRowProps) {
  const status = reviewStatusView(toStatusInput(pr));
  const detail = rowDetail(pr);
  const title = pr.title ?? `${pr.repo} #${pr.number}`;

  return (
    <li
      className={cx(
        'relative flex gap-3 border-b border-l-2 border-b-line px-4 py-3.5 transition-colors',
        selected ? 'border-l-accent bg-surface' : 'border-l-transparent hover:bg-surface/60',
      )}
    >
      {/* The whole row opens the PR; buttons inside sit above this link */}
      <Link to={to} aria-current={selected ? 'page' : undefined} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
        <span className="sr-only">{title}, {status.label}</span>
      </Link>

      <div className="flex h-5 w-4 flex-shrink-0 items-center">
        <StatusIcon icon={status.icon} tone={status.tone} label={status.label} />
      </div>

      <div className="flex min-w-0 flex-grow flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-fg-muted">
            {pr.author && <Avatar login={pr.author} src={pr.authorAvatarUrl} size={16} />}
            <span className="truncate">
              {pr.author && `@${pr.author} · `}{pr.repo} #{pr.number}
            </span>
          </div>
          <span className="flex-shrink-0 text-xs leading-5 tabular-nums text-fg-muted">
            {detail.kind === 'running' ? <RunningFor since={pr.updatedAt} /> : formatAgo(pr.updatedAt, now)}
          </span>
        </div>

        <div className={cx('line-clamp-2 text-sm leading-5 text-fg-strong', selected ? 'font-semibold' : 'font-medium')}>
          {title}
        </div>

        <RowDetailLine pr={pr} onStart={onStart} starting={starting} />
        {startError && <div className="relative text-xs text-danger-fg">{startError}</div>}
      </div>
    </li>
  );
}

function RowDetailLine({ pr, onStart, starting }: { pr: PrSummary; onStart: () => void; starting: boolean }) {
  const detail = rowDetail(pr);
  switch (detail.kind) {
    case 'running':
      return <ProgressBar label="Review in progress" className="my-1" />;
    case 'start':
      return (
        <div className="relative z-10 flex">
          <Button size="sm" icon={<Play size={11} weight="fill" />} onClick={onStart} disabled={starting}>
            {starting ? 'Starting…' : 'Start review'}
          </Button>
        </div>
      );
    case 'failed':
      return (
        <div className="relative z-10 flex items-center gap-1.5">
          <Pill tone="danger" shape="tag">Review failed</Pill>
          <Button size="sm" variant="ghost" icon={<ArrowsClockwise size={12} />} onClick={onStart} disabled={starting}>
            Retry
          </Button>
        </div>
      );
    case 'state':
      return (
        <div className="flex">
          {detail.state === 'merged'
            ? <Pill tone="done" shape="tag">Merged</Pill>
            : <Pill tone="neutral" shape="tag">Closed</Pill>}
        </div>
      );
    case 'verdict': {
      const verdict = verdictView(pr.verdict!);
      const lead = pr.verdict === 'request_changes' || detail.blocking === 0
        ? <Pill tone={verdict.tone} shape="tag">{verdict.label}</Pill>
        : <Pill tone="danger" shape="tag">{detail.blocking} blocking</Pill>;
      return (
        <div className="flex flex-wrap gap-1.5">
          {lead}
          {detail.findings > 0 && (
            <Pill tone="neutral" shape="tag">{detail.findings} {detail.findings === 1 ? 'finding' : 'findings'}</Pill>
          )}
        </div>
      );
    }
  }
}

function RunningFor({ since }: { since: string }) {
  const now = useNow(1000);
  return <>{formatElapsed(Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000)))}</>;
}
