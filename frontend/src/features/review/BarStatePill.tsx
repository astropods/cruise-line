import type { ReactNode } from 'react';
import { ArrowsClockwise, GitMerge, GitPullRequest, XCircle } from '@phosphor-icons/react';
import type { ProgressEntry } from '../../api';
import { ActivityFeed } from './AnalysisProgress';
import type { BarState } from '../../domain/prStatus';
import { cx } from '../../lib/cx';
import { formatAgoPhrase, formatElapsed } from '../../lib/time';
import { useElapsed } from '../../lib/useNow';
import { Button, Popover, Spinner, TONE_CLASSES, type Tone } from '../../ui';

interface BarStatePillProps {
  state: BarState;
  startedAt: string | null;
  progress: ProgressEntry[];
  error: string | null;
  commitsSinceReview: number | null;
  mergedAt: string | null;
  onRerun: () => void;
}

/** The pill beside the view switcher: reviewing, failed, new commits, merged, or closed */
export function BarStatePill(props: BarStatePillProps) {
  switch (props.state) {
    case 'reviewing':
      return <ReviewingPill startedAt={props.startedAt} progress={props.progress} />;
    case 'failed':
      return <FailedPill error={props.error} onRerun={props.onRerun} />;
    case 'stale':
      return (
        <Shell tone="warning" className="pr-1">
          {props.commitsSinceReview == null
            ? 'New commits'
            : `${props.commitsSinceReview} new ${props.commitsSinceReview === 1 ? 'commit' : 'commits'}`}
          <InnerButton tone="warning" onClick={props.onRerun}>Rerun</InnerButton>
        </Shell>
      );
    case 'merged':
      return (
        <Shell tone="done">
          <GitMerge size={13} weight="bold" aria-hidden="true" />
          {props.mergedAt ? `Merged ${formatAgoPhrase(props.mergedAt)}` : 'Merged'}
        </Shell>
      );
    case 'closed':
      return (
        <Shell tone="neutral">
          <GitPullRequest size={13} weight="bold" aria-hidden="true" />
          Closed
        </Shell>
      );
  }
}

function ReviewingPill({ startedAt, progress }: { startedAt: string | null; progress: ProgressEntry[] }) {
  const elapsed = useElapsed(startedAt);
  return (
    <Popover
      panelClassName="w-80"
      trigger={(props) => (
        <button type="button" {...props} className={cx(shellClass('accent'), 'hover:brightness-125')}>
          <Spinner size={12} />
          Reviewing · <span className="tabular-nums">{formatElapsed(elapsed)}</span>
        </button>
      )}
    >
      <p className="mb-2 text-xs font-medium text-fg-strong">Review in progress</p>
      {progress.length > 0
        ? <ActivityFeed progress={progress} />
        : <p className="text-xs text-fg-muted">Starting up…</p>}
    </Popover>
  );
}

function FailedPill({ error, onRerun }: { error: string | null; onRerun: () => void }) {
  return (
    <Popover
      panelClassName="w-80"
      trigger={(props) => (
        <button type="button" {...props} className={cx(shellClass('danger'), 'hover:brightness-125')}>
          <XCircle size={13} weight="fill" aria-hidden="true" />
          Review failed
        </button>
      )}
    >
      <p className="mb-1 text-xs font-medium text-fg-strong">The last review didn’t finish</p>
      <p className="mb-3 text-xs break-words text-fg-muted">{error ?? 'No error details were recorded.'}</p>
      <Button size="sm" icon={<ArrowsClockwise size={12} />} onClick={onRerun}>Try again</Button>
    </Popover>
  );
}

function shellClass(tone: Tone) {
  const t = TONE_CLASSES[tone];
  return cx(
    'inline-flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
    t.border, t.soft, t.fg,
  );
}

function Shell({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return <span className={cx(shellClass(tone), className)}>{children}</span>;
}

function InnerButton({ tone, onClick, children }: { tone: Tone; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'ml-0.5 h-5 rounded-full px-2 text-[11px] font-semibold text-canvas transition hover:brightness-110',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        tone === 'warning' ? 'bg-warning' : 'bg-accent',
      )}
    >
      {children}
    </button>
  );
}
