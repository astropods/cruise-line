import { useEffect, useRef, useState } from 'react';
import { CircleNotch, WarningCircle, ArrowsClockwise } from '@phosphor-icons/react';
import type { ProgressEntry } from '../../api';
import { formatElapsed } from '../../lib/time';
import { useElapsed } from '../../lib/useNow';
import { Logo } from '../../shell/Logo';
import { toolCallDetail, toolIcon } from '../../lib/toolCalls';

interface AnalysisProgressProps {
  status: string;
  progress: ProgressEntry[];
  /** ISO timestamp from when the analysis started on the server */
  startedAt: string | null;
  error?: string | null;
  onRetry?: () => void;
}

/** The headline for a run in progress: the latest status entry, or a placeholder. */
function progressStatusText(status: string, progress: ProgressEntry[]): string {
  if (status === 'none' || status === 'pending') return 'Starting analysis...';
  const latestStatus = [...progress].reverse().find((e) => e.type === 'status');
  return latestStatus?.text ?? 'Analyzing pull request...';
}

export function ActivityFeed({ progress, className = '' }: { progress: ProgressEntry[]; className?: string }) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress.length]);

  if (progress.length === 0) return null;

  return (
    <div
      ref={feedRef}
      className={`max-h-48 overflow-y-auto rounded-lg bg-surface border border-line p-3 ${className}`}
    >
      {progress.map((entry, i) => {
        // Tool entries read "Read: path/to/file"
        const ToolIcon = entry.type === 'tool' ? toolIcon(entry.text.split(':')[0]) : null;
        const text = entry.type === 'tool' ? toolCallDetail(entry.text) : entry.text;
        const isLatest = i === progress.length - 1;
        const isStatus = entry.type === 'status';

        return (
          <div
            key={i}
            className={`flex items-center gap-2 py-1 text-xs transition-opacity ${
              isLatest ? 'opacity-100' : 'opacity-40'
            } ${isStatus ? 'text-accent' : 'text-fg-muted font-mono'}`}
          >
            {ToolIcon ? (
              <ToolIcon size={12} className="flex-shrink-0" />
            ) : (
              <span className="w-3 flex-shrink-0 text-center">·</span>
            )}
            <span className="truncate">{text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Centered progress display for a PR's first review, shown inside the page chrome. */
export function AnalysisProgress({ status, progress, startedAt, error, onRetry }: AnalysisProgressProps) {
  const isFailed = status === 'failed';
  const elapsed = useElapsed(startedAt);

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo size={48} className="mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-fg-strong mb-1">
            {isFailed ? 'Review failed' : 'Reviewing this PR'}
          </h1>
          {!isFailed && (
            <p className="text-sm text-fg-muted">
              This is the first review for this PR. It usually takes a few minutes.
            </p>
          )}
        </div>

        {/* Status + spinner / error */}
        {isFailed ? (
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="flex items-center gap-2 text-danger-fg">
              <WarningCircle size={18} weight="bold" />
              <span className="text-sm font-medium">Analysis failed</span>
            </div>
            {error && (
              <p className="text-xs text-fg-muted text-center max-w-sm">{error}</p>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-line text-fg-muted hover:text-fg hover:border-accent transition-colors mt-1"
              >
                <ArrowsClockwise size={14} />
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <CircleNotch size={16} weight="bold" className="text-accent animate-spin" />
            <span className="text-sm text-fg-muted">{progressStatusText(status, progress)}</span>
          </div>
        )}

        <ActivityFeed progress={progress} className="mb-6" />

        {/* Elapsed time */}
        {!isFailed && (
          <div className="text-center text-xs text-fg-muted/40">
            {formatElapsed(elapsed)}
          </div>
        )}
      </div>
    </div>
  );
}
