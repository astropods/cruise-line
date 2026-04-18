import { useEffect, useRef } from 'react';
import type { ProgressEntry } from '../api';

interface GenerateButtonProps {
  onGenerate: () => void;
  status: string;
  progress: ProgressEntry[];
  prTitle?: string;
}

export function GenerateButton({ onGenerate, status, progress, prTitle }: GenerateButtonProps) {
  const isGenerating = status === 'pending' || status === 'running';
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new progress entries arrive
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress.length]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
          Cruise Line
        </h1>
        {prTitle && (
          <p className="text-[var(--text-secondary)] max-w-md">
            {prTitle}
          </p>
        )}
      </div>

      {isGenerating ? (
        <div className="flex flex-col items-center gap-4 w-full max-w-lg">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">
            {status === 'pending' ? 'Queued...' : 'Analyzing pull request...'}
          </p>

          {/* Live progress feed */}
          {progress.length > 0 && (
            <div
              ref={logRef}
              className="w-full max-h-64 overflow-y-auto rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] p-3 space-y-1.5"
            >
              {progress.map((entry, i) => (
                <ProgressLine key={i} entry={entry} isLatest={i === progress.length - 1} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={onGenerate}
          className="px-6 py-3 text-base font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          Generate Walkthrough
        </button>
      )}
    </div>
  );
}

function ProgressLine({ entry, isLatest }: { entry: ProgressEntry; isLatest: boolean }) {
  const icons: Record<string, string> = {
    status: '\u25CB',  // ○
    tool: '\u25B8',    // ▸
    message: '\u25AA',  // ▪
  };

  const colors: Record<string, string> = {
    status: 'text-[var(--accent)]',
    tool: 'text-yellow-400',
    message: 'text-[var(--text-secondary)]',
  };

  return (
    <div className={`flex gap-2 text-xs font-mono leading-relaxed ${isLatest ? 'opacity-100' : 'opacity-60'}`}>
      <span className={`flex-shrink-0 ${colors[entry.type]}`}>
        {icons[entry.type]}
      </span>
      <span className={entry.type === 'tool' ? 'text-yellow-400/80' : 'text-[var(--text-secondary)]'}>
        {entry.text}
      </span>
    </div>
  );
}
