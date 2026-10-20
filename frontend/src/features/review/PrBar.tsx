import { Link } from 'react-router';
import { ArrowSquareOut, ArrowsClockwise, CaretLeft, DotsThree, ListNumbers } from '@phosphor-icons/react';
import type { PrDetails, ProgressEntry } from '../../api';
import type { BarState } from '../../domain/prStatus';
import { Avatar, IconButton, Menu, ProgressBar, SegmentedControl } from '../../ui';
import { BarStatePill } from './BarStatePill';
import { reviewViewSegments, type ReviewView } from './views';

interface PrBarProps {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string | null;
  details: PrDetails | null;
  prUrl: string;
  view: ReviewView;
  onViewChange: (view: ReviewView) => void;
  hasReview: boolean;
  state: BarState | null;
  startedAt: string | null;
  progress: ProgressEntry[];
  error: string | null;
  commitsSinceReview: number | null;
  onRerun: () => void;
  onOpenRules: () => void;
}

/** The compact bar over a PR: who and what, its state, the views, and actions */
export function PrBar(props: PrBarProps) {
  const { details, state } = props;
  const reviewing = state === 'reviewing';

  return (
    <header className="relative flex h-16 flex-shrink-0 items-center gap-3 border-b border-line bg-canvas px-4 md:px-10">
      <Link
        to="/"
        aria-label="Inbox"
        title="Inbox"
        className="-ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-fg-muted hover:bg-raised hover:text-fg md:hidden"
      >
        <CaretLeft size={16} weight="bold" />
      </Link>

      {props.author ? <Avatar login={props.author} src={details?.authorAvatarUrl} size={32} /> : <span className="h-8 w-8 flex-shrink-0 rounded-full bg-raised" />}

      <div className="flex min-w-0 flex-grow flex-col">
        <h1 className="truncate text-[15px] leading-[22px] font-semibold text-fg-strong">{props.title}</h1>
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap text-xs leading-[18px] text-fg-muted">
          {props.author && <span className="flex-shrink-0 text-fg">@{props.author}</span>}
          <span className="hidden flex-shrink-0 sm:inline">{props.repo} #{props.number}</span>
          {details && (
            <>
              <span className="hidden min-w-0 truncate rounded bg-accent-emphasis/20 px-1.5 font-mono text-[11px] text-accent-strong lg:inline">
                {details.headRef}
              </span>
              <span className="hidden flex-shrink-0 gap-1 font-mono text-[11px] lg:flex">
                <span className="text-success">+{details.additions}</span>
                <span className="text-danger">−{details.deletions}</span>
              </span>
              <span className="hidden flex-shrink-0 lg:inline">
                {details.changedFiles} {details.changedFiles === 1 ? 'file' : 'files'}
              </span>
              {details.state === 'open' && (
                <span className="hidden flex-shrink-0 items-center gap-1 text-success xl:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  Open
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {state && (
        <BarStatePill
          state={state}
          startedAt={props.startedAt}
          progress={props.progress}
          error={props.error}
          commitsSinceReview={props.commitsSinceReview}
          mergedAt={details?.mergedAt ?? null}
          onRerun={props.onRerun}
        />
      )}

      <SegmentedControl<ReviewView>
        label="Review view"
        value={props.view}
        onChange={props.onViewChange}
        segments={reviewViewSegments({ hasReview: props.hasReview })}
        className="hidden sm:inline-flex"
      />

      <Menu
        items={[
          { kind: 'external', label: 'Open on GitHub', icon: <ArrowSquareOut size={14} />, href: props.prUrl },
          {
            label: reviewing ? 'Review running…' : 'Rerun review',
            icon: <ArrowsClockwise size={14} />,
            onSelect: props.onRerun,
            disabled: reviewing,
          },
          { label: 'Review rules', icon: <ListNumbers size={14} />, onSelect: props.onOpenRules },
        ]}
        trigger={(menuProps) => (
          <IconButton label="More actions" icon={<DotsThree size={16} weight="bold" />} {...menuProps} />
        )}
      />

      {reviewing && (
        <div className="absolute inset-x-0 -bottom-px">
          <ProgressBar label="Review in progress" className="h-[2px] rounded-none bg-transparent" />
        </div>
      )}
    </header>
  );
}
