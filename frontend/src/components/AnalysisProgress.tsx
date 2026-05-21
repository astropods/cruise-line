import { useEffect, useRef, useState } from 'react';
import {
  Anchor, FileText, MagnifyingGlass, FolderOpen, Terminal,
  PencilSimpleLine, CircleNotch, WarningCircle, ArrowsClockwise, SignOut,
} from '@phosphor-icons/react';
import { logout } from '../api';
import type { ProgressEntry } from '../api';
import type { Icon } from '@phosphor-icons/react';

interface AnalysisProgressProps {
  owner: string;
  repo: string;
  pr: string;
  status: string;
  progress: ProgressEntry[];
  githubUrl: string;
  /** ISO timestamp from when the analysis was created on the server */
  startedAt: string | null;
  error?: string | null;
  onRetry?: () => void;
}

const TOOL_ICON: Record<string, Icon> = {
  Read: FileText,
  Grep: MagnifyingGlass,
  Glob: FolderOpen,
  Bash: Terminal,
  Edit: PencilSimpleLine,
  Write: FileText,
};

function getToolIcon(text: string): Icon | null {
  for (const [name, icon] of Object.entries(TOOL_ICON)) {
    if (text.startsWith(`${name}:`) || text.startsWith(name)) return icon;
  }
  return null;
}

function cleanToolText(text: string): string {
  // Strip tool name prefix and repo clone path
  return text
    .replace(/^(?:Read|Grep|Glob|Bash|Edit|Write):\s*/, '')
    .replace(/^\/.*?\.cruise-data\/repos\/[^/]+\/[^/]+\/\d+\//, '')
    .replace(/^\/.*?\/repos\/[^/]+\/[^/]+\//, '');
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function AnalysisProgress({ owner, repo, pr, status, progress, githubUrl, startedAt, error, onRetry }: AnalysisProgressProps) {
  const isFailed = status === 'failed';
  const feedRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed timer based on server start time
  useEffect(() => {
    const baseTime = startedAt ? new Date(startedAt).getTime() : Date.now();
    setElapsed(Math.max(0, Math.floor((Date.now() - baseTime) / 1000)));
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - baseTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [progress.length]);

  const prUrl = `${githubUrl}/${owner}/${repo}/pull/${pr}`;

  // Get the latest status message
  const latestStatus = [...progress].reverse().find((e) => e.type === 'status');
  const statusText = status === 'none' || status === 'pending'
    ? 'Starting analysis...'
    : latestStatus?.text ?? 'Analyzing pull request...';

  // All progress entries for the activity feed
  const activity = progress;

  return (
    <div className="flex items-center justify-center h-screen p-8">
      <div className="w-full max-w-md">
        {/* PR info */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent)]/10 mb-4">
            <Anchor size={24} weight="duotone" className="text-[var(--accent)]" />
          </div>
          <h1 className="text-lg font-semibold text-[var(--text-bright)] mb-1">
            Analyzing PR
          </h1>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            {owner}/{repo}#{pr}
          </a>
        </div>

        {/* Status + spinner / error */}
        {isFailed ? (
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="flex items-center gap-2 text-red-400">
              <WarningCircle size={18} weight="bold" />
              <span className="text-sm font-medium">Analysis failed</span>
            </div>
            {error && (
              <p className="text-xs text-[var(--text-secondary)] text-center max-w-sm">{error}</p>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors mt-1"
              >
                <ArrowsClockwise size={14} />
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <CircleNotch size={16} weight="bold" className="text-[var(--accent)] animate-spin" />
            <span className="text-sm text-[var(--text-secondary)]">{statusText}</span>
          </div>
        )}

        {/* Activity feed */}
        {activity.length > 0 && (
          <div
            ref={feedRef}
            className="max-h-48 overflow-y-auto rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] p-3 mb-6"
          >
            {activity.map((entry, i) => {
              const ToolIcon = entry.type === 'tool' ? getToolIcon(entry.text) : null;
              const text = entry.type === 'tool' ? cleanToolText(entry.text) : entry.text;
              const isLatest = i === activity.length - 1;
              const isStatus = entry.type === 'status';

              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 py-1 text-xs transition-opacity ${
                    isLatest ? 'opacity-100' : 'opacity-40'
                  } ${isStatus ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] font-mono'}`}
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
        )}

        {/* Elapsed time */}
        {!isFailed && (
          <div className="text-center text-xs text-[var(--text-secondary)]/40">
            {formatElapsed(elapsed)}
          </div>
        )}

        {/* Logout */}
        <div className="text-center mt-6">
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]/50 hover:text-[var(--text-secondary)] transition-colors"
          >
            <SignOut size={12} />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
