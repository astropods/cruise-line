import { useState } from 'react';
import { CircleNotch, WarningCircle, CaretDown, ArrowsClockwise, X } from '@phosphor-icons/react';
import type { ProgressEntry } from '../api';
import { ActivityFeed, formatElapsed, progressStatusText, useElapsed } from './AnalysisProgress';

interface ReviewRunBannerProps {
  status: 'pending' | 'running' | 'failed';
  /** A previous review is on screen under the banner (vs. the PR's first review) */
  hasPrevious: boolean;
  /** When set, a failed first review links back to the full progress view */
  onShowProgress?: () => void;
  progress: ProgressEntry[];
  startedAt: string | null;
  error: string | null;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Sits above an existing review while a new one runs (or after one fails),
 * or above chat while the first review runs. The page underneath stays
 * usable; the new review replaces it on completion.
 */
export function ReviewRunBanner({ status, hasPrevious, onShowProgress, progress, startedAt, error, onRetry, onDismiss }: ReviewRunBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const elapsed = useElapsed(startedAt);

  if (status === 'failed') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-red-900/20 border-b border-red-700/50 text-sm">
        <WarningCircle size={16} weight="bold" className="flex-shrink-0 text-red-400" />
        <span className="min-w-0 flex-1 truncate text-red-300">
          {hasPrevious ? 'The new review failed' : 'The review failed'}
          {error ? `: ${error}` : '.'}
          {hasPrevious && ' Showing the previous review.'}
        </span>
        {onShowProgress && (
          <button
            onClick={onShowProgress}
            className="flex-shrink-0 text-xs text-red-300/80 hover:text-red-300 underline-offset-2 hover:underline"
          >
            Details
          </button>
        )}
        <button
          onClick={onRetry}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border border-red-600 text-red-300 hover:bg-red-900/30 transition-colors"
        >
          <ArrowsClockwise size={12} />
          Try again
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 p-1 rounded text-red-300/70 hover:text-red-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--accent)]/30 bg-[var(--accent)]/5 text-sm">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-2 text-left"
      >
        <CircleNotch size={14} weight="bold" className="flex-shrink-0 text-[var(--accent)] animate-spin" />
        <span className="flex-shrink-0 text-[var(--text-primary)]">
          {hasPrevious ? 'Running a new review' : 'Running the first review'}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
          {progressStatusText(status, progress)}
        </span>
        <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-secondary)]/60">
          {formatElapsed(elapsed)}
        </span>
        <CaretDown
          size={12}
          className={`flex-shrink-0 text-[var(--text-secondary)] transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          {progress.length > 0 ? (
            <ActivityFeed progress={progress} />
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">No activity yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
