import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Step, FileContent } from '../api';

interface CodePanelProps {
  step: Step;
  stepKey: string;
  fileContent: FileContent | undefined;
}

const LINE_HEIGHT = 19.5; // 13px font * 1.5 line-height

export function CodePanel({ step, stepKey, fileContent }: CodePanelProps) {
  const [highlightedLines, setHighlightedLines] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFileRef = useRef<string>('');
  const prevStepKeyRef = useRef<string>('');

  const isSameFile = prevFileRef.current === step.file;

  // Pick the right version of the file to display
  const sourceCode = useMemo(() => {
    if (!fileContent) return '';
    if (step.changeType === 'deleted') return fileContent.before ?? '';
    return fileContent.after ?? fileContent.before ?? '';
  }, [fileContent, step.changeType]);

  const lines = useMemo(() => sourceCode.split('\n'), [sourceCode]);
  const language = fileContent?.language ?? step.language ?? 'text';

  const focusStart = Math.max(1, step.focusStart);
  const focusEnd = Math.min(lines.length, step.focusEnd);

  // Scroll to focus region
  const scrollToFocus = useCallback((smooth: boolean) => {
    const container = containerRef.current;
    if (!container) return;

    const headerHeight = 36; // sticky header covers this much of the viewport
    const padding = 24; // breathing room above focus start
    const visibleHeight = container.clientHeight - headerHeight;
    const focusHeight = (focusEnd - focusStart + 1) * LINE_HEIGHT;
    const focusLineOffset = (focusStart - 1) * LINE_HEIGHT;

    // If focus fits in visible area, center it vertically below the header.
    // Otherwise, align the top of the focus just below the header with padding.
    const targetScroll = focusHeight < visibleHeight - padding * 2
      ? focusLineOffset - headerHeight - (visibleHeight - focusHeight) / 2
      : focusLineOffset - headerHeight - padding;

    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: smooth ? 'smooth' : 'instant',
    });
  }, [focusStart, focusEnd]);

  // Highlight with Shiki
  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!sourceCode) {
        setHighlightedLines([]);
        return;
      }

      const { codeToTokens } = await import('shiki');

      try {
        const result = await codeToTokens(sourceCode, {
          lang: language as any,
          theme: 'github-dark',
        });

        if (cancelled) return;

        const htmlLines = result.tokens.map((lineTokens) => {
          return lineTokens
            .map((token) => {
              const style = token.color ? ` style="color:${token.color}"` : '';
              const escaped = token.content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              return `<span${style}>${escaped}</span>`;
            })
            .join('');
        });

        if (!cancelled) setHighlightedLines(htmlLines);
      } catch {
        if (!cancelled) {
          setHighlightedLines(
            lines.map((line) =>
              `<span>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
            ),
          );
        }
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [sourceCode, language]);

  // Handle scroll on step change
  useEffect(() => {
    if (prevStepKeyRef.current === stepKey) return;
    const wasSameFile = prevFileRef.current === step.file;
    prevFileRef.current = step.file;
    prevStepKeyRef.current = stepKey;

    if (wasSameFile) {
      // Same file: smooth scroll to new focus
      scrollToFocus(true);
    }
    // Different file: handled by onAnimationComplete below
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

      {/* Full file with focus region */}
      <AnimatePresence mode="wait">
        <motion.div
          key={isSameFile ? step.file : stepKey}
          initial={isSameFile ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={isSameFile ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => {
            // After fade-in for a new file, jump to the focus area instantly
            if (!isSameFile) {
              scrollToFocus(false);
            }
          }}
        >
          <pre className="text-[13px] leading-[1.5] font-mono m-0">
            {(highlightedLines.length > 0 ? highlightedLines : lines).map((lineHtml, i) => {
              const lineNum = i + 1;
              const inFocus = lineNum >= focusStart && lineNum <= focusEnd;

              return (
                <div
                  key={i}
                  className="flex"
                  style={{
                    opacity: inFocus ? 1 : 0.35,
                    background: inFocus ? 'rgba(88,166,255,0.08)' : 'transparent',
                    transition: 'opacity 0.3s ease, background 0.3s ease',
                  }}
                >
                  {/* Line number */}
                  <span
                    className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs"
                    style={{
                      lineHeight: '1.5em',
                      color: inFocus ? 'var(--text-secondary)' : 'rgba(139,148,158,0.3)',
                      transition: 'color 0.3s ease',
                    }}
                  >
                    {lineNum}
                  </span>
                  {/* Code */}
                  <span
                    className="flex-1 px-4 whitespace-pre-wrap break-all"
                    dangerouslySetInnerHTML={{
                      __html: highlightedLines.length > 0 ? lineHtml : (lineHtml as string),
                    }}
                  />
                </div>
              );
            })}
          </pre>
        </motion.div>
      </AnimatePresence>
    </div>
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
