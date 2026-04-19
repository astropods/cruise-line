import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseDiff, Diff, Hunk } from 'react-diff-view';
import type { Step, FileContent } from '../api';
import 'react-diff-view/style/index.css';

interface CodePanelProps {
  step: Step;
  stepKey: string;
  fileContent: FileContent | undefined;
}

const LINE_HEIGHT = 20;

export function CodePanel({ step, stepKey, fileContent }: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFileRef = useRef<string>('');
  const prevStepKeyRef = useRef<string>('');

  const isSameFile = prevFileRef.current === step.file;
  const hasPatch = !!fileContent?.patch;

  const focusStart = step.focusStart;
  const focusEnd = step.focusEnd;

  // Scroll logic
  const scrollToFocus = useCallback((smooth: boolean) => {
    const container = containerRef.current;
    if (!container) return;

    // Find the focus target element
    const focusEl = container.querySelector('[data-focus-start]') as HTMLElement | null;
    if (focusEl) {
      const containerRect = container.getBoundingClientRect();
      const focusRect = focusEl.getBoundingClientRect();
      const headerHeight = 36;
      const padding = 24;
      const offset = focusRect.top - containerRect.top + container.scrollTop - headerHeight - padding;

      container.scrollTo({
        top: Math.max(0, offset),
        behavior: smooth ? 'smooth' : 'instant',
      });
      return;
    }
  }, []);

  useEffect(() => {
    if (prevStepKeyRef.current === stepKey) return;
    const wasSameFile = prevFileRef.current === step.file;
    prevFileRef.current = step.file;
    prevStepKeyRef.current = stepKey;

    // Small delay to let react-diff-view render
    const timer = setTimeout(() => {
      scrollToFocus(wasSameFile);
    }, wasSameFile ? 0 : 50);
    return () => clearTimeout(timer);
  }, [stepKey, step.file, scrollToFocus]);

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[var(--bg-secondary)]">
      {/* File path header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 text-sm bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
        <ChangeTypeBadge type={step.changeType} />
        <span className="font-mono text-[var(--text-secondary)]">{step.file}</span>
        <span className="text-xs text-[var(--text-secondary)] opacity-50">
          L{focusStart}–{focusEnd}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={isSameFile ? step.file : stepKey}
          initial={isSameFile ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={isSameFile ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => {
            if (!isSameFile) scrollToFocus(false);
          }}
        >
          {hasPatch ? (
            <DiffFileView
              patch={fileContent!.patch!}
              focusStart={focusStart}
              focusEnd={focusEnd}
            />
          ) : (
            <PlainFileView
              content={fileContent?.after ?? ''}
              language={fileContent?.language ?? 'text'}
              focusStart={focusStart}
              focusEnd={focusEnd}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Renders a file diff using react-diff-view with focus/dim regions.
 */
function DiffFileView({ patch, focusStart, focusEnd }: {
  patch: string;
  focusStart: number;
  focusEnd: number;
}) {
  const files = useMemo(() => {
    try {
      return parseDiff(patch, { nearbySequences: 'zip' });
    } catch {
      return [];
    }
  }, [patch]);

  if (files.length === 0) return null;

  const file = files[0];

  return (
    <div className="cruise-diff-wrapper" style={{
      '--focus-start': focusStart,
      '--focus-end': focusEnd,
    } as React.CSSProperties}>
      <Diff
        viewType="unified"
        diffType={file.type}
        hunks={file.hunks}
        gutterType="default"
      >
        {(hunks) => hunks.map((hunk) => (
          <DiffHunkWithFocus
            key={hunk.content}
            hunk={hunk}
            focusStart={focusStart}
            focusEnd={focusEnd}
          />
        ))}
      </Diff>
    </div>
  );
}

/**
 * Wraps each hunk and applies focus/dim styling per line.
 */
function DiffHunkWithFocus({ hunk, focusStart, focusEnd }: {
  hunk: any;
  focusStart: number;
  focusEnd: number;
}) {
  const hunkRef = useRef<HTMLTableSectionElement>(null);

  // Apply focus/dim after render via DOM manipulation
  // react-diff-view renders as a <table>, so we style the <tr> rows
  useEffect(() => {
    const tbody = hunkRef.current;
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    let foundFocusStart = false;

    rows.forEach((row) => {
      // Get the new-side line number from the gutter cell
      const gutterCells = row.querySelectorAll('td.diff-gutter');
      let lineNum: number | null = null;

      // The last gutter cell in unified view is the new-side line number
      gutterCells.forEach((cell) => {
        const num = parseInt((cell as HTMLElement).dataset.lineNumber ?? '', 10);
        if (!isNaN(num)) lineNum = num;
      });

      // For removed lines, check if they're adjacent to focus
      const isChange = row.classList.contains('diff-line-insert') || row.classList.contains('diff-line-delete');
      const inFocus = lineNum !== null && lineNum >= focusStart && lineNum <= focusEnd;

      // Also include removed lines between focus start and end
      const isDeleteInRange = row.classList.contains('diff-line-delete') && lineNum === null;

      if (inFocus) {
        row.style.opacity = '1';
        if (!foundFocusStart) {
          row.setAttribute('data-focus-start', 'true');
          foundFocusStart = true;
        }
      } else {
        row.style.opacity = '0.3';
        row.style.transition = 'opacity 0.3s ease';
      }
    });
  }, [focusStart, focusEnd, hunk]);

  return (
    <Hunk ref={hunkRef} hunk={hunk} />
  );
}

/**
 * Plain code view for new files and context-only files (no diff).
 */
function PlainFileView({ content, language, focusStart, focusEnd }: {
  content: string;
  language: string;
  focusStart: number;
  focusEnd: number;
}) {
  const [highlightedLines, setHighlightedLines] = useState<string[]>([]);
  const lines = useMemo(() => content.split('\n'), [content]);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!content) return;
      const { codeToTokens } = await import('shiki');

      try {
        const result = await codeToTokens(content, {
          lang: language as any,
          theme: 'github-dark',
        });
        if (cancelled) return;

        setHighlightedLines(result.tokens.map((lineTokens) =>
          lineTokens.map((token) => {
            const style = token.color ? ` style="color:${token.color}"` : '';
            const escaped = token.content
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<span${style}>${escaped}</span>`;
          }).join('')
        ));
      } catch {
        if (!cancelled) {
          setHighlightedLines(lines.map((l) =>
            `<span>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
          ));
        }
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [content, language]);

  return (
    <pre className="text-[13px] leading-[1.5] font-mono m-0">
      {(highlightedLines.length > 0 ? highlightedLines : lines).map((lineHtml, i) => {
        const lineNum = i + 1;
        const inFocus = lineNum >= focusStart && lineNum <= focusEnd;
        const isFirst = lineNum === focusStart;

        return (
          <div
            key={i}
            className="flex"
            data-focus-start={isFirst ? 'true' : undefined}
            style={{
              opacity: inFocus ? 1 : 0.3,
              background: inFocus ? 'rgba(88,166,255,0.04)' : 'transparent',
              transition: 'opacity 0.3s ease, background 0.3s ease',
            }}
          >
            <span
              className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs"
              style={{
                lineHeight: '1.5em',
                color: inFocus ? 'var(--text-secondary)' : 'rgba(139,148,158,0.25)',
              }}
            >
              {lineNum}
            </span>
            <span
              className="flex-1 px-4 whitespace-pre-wrap break-all"
              dangerouslySetInnerHTML={{ __html: lineHtml }}
            />
          </div>
        );
      })}
    </pre>
  );
}

function ChangeTypeBadge({ type }: { type: Step['changeType'] }) {
  const styles: Record<string, string> = {
    added: 'bg-green-900/50 text-green-400 border-green-700',
    modified: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
    deleted: 'bg-red-900/50 text-red-400 border-red-700',
    context: 'bg-blue-900/50 text-blue-400 border-blue-700',
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded border ${styles[type]}`}>
      {type}
    </span>
  );
}
