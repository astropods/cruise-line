import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseDiff, Diff, Hunk, tokenize, markEdits } from 'react-diff-view';
import refractor from 'refractor';
import type { Step, CodeReference, FileContent } from '../api';
import 'react-diff-view/style/index.css';

const REFRACTOR_LANG_MAP: Record<string, string> = {
  typescript: 'typescript', tsx: 'tsx', javascript: 'javascript', jsx: 'jsx',
  python: 'python', ruby: 'ruby', go: 'go', rust: 'rust',
  java: 'java', kotlin: 'kotlin', swift: 'swift', csharp: 'csharp',
  cpp: 'cpp', c: 'c', sql: 'sql', bash: 'bash',
  yaml: 'yaml', json: 'json', toml: 'toml', markdown: 'markdown',
  css: 'css', scss: 'scss', html: 'markup', xml: 'markup',
  graphql: 'graphql', dockerfile: 'docker',
};

interface CodePanelProps {
  step: Step;
  stepKey: string;
  files: Record<string, FileContent>;
}

export function CodePanel({ step, stepKey, files }: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevStepKeyRef = useRef<string>('');
  const prevFilesKey = useRef<string>('');

  // Build a key representing which files are shown
  const filesKey = step.refs.map((r) => r.file).join('|');
  const isSameFiles = prevFilesKey.current === filesKey;

  const scrollToFocus = useCallback((smooth: boolean) => {
    const container = containerRef.current;
    if (!container) return;
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
    }
  }, []);

  useEffect(() => {
    if (prevStepKeyRef.current === stepKey) return;
    const wasSameFiles = prevFilesKey.current === filesKey;
    prevFilesKey.current = filesKey;
    prevStepKeyRef.current = stepKey;

    const timer = setTimeout(() => {
      scrollToFocus(wasSameFiles);
    }, wasSameFiles ? 0 : 50);
    return () => clearTimeout(timer);
  }, [stepKey, filesKey, scrollToFocus]);

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[var(--bg-secondary)]">
      <AnimatePresence mode="wait">
        <motion.div
          key={isSameFiles ? filesKey : stepKey}
          initial={isSameFiles ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={isSameFiles ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          onAnimationComplete={() => {
            if (!isSameFiles) scrollToFocus(false);
          }}
        >
          {step.refs.map((ref, i) => (
            <SingleFileView
              key={`${ref.file}-${i}`}
              ref_={ref}
              fileContent={files[ref.file]}
              isFirst={i === 0}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Renders one file reference — either as a diff or as plain code.
 */
function SingleFileView({ ref_, fileContent, isFirst }: {
  ref_: CodeReference;
  fileContent: FileContent | undefined;
  isFirst: boolean;
}) {
  const hasPatch = !!fileContent?.patch;

  return (
    <div className={!isFirst ? 'mt-2 border-t border-[var(--border)]' : ''}>
      {/* File header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 text-sm bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
        <ChangeTypeBadge type={ref_.changeType} />
        <span className="font-mono text-[var(--text-secondary)]">{ref_.file}</span>
        <span className="text-xs text-[var(--text-secondary)] opacity-50">
          L{ref_.focusStart}–{ref_.focusEnd}
        </span>
      </div>

      {hasPatch ? (
        <DiffFileView
          patch={fileContent!.patch!}
          language={fileContent!.language}
          focusStart={ref_.focusStart}
          focusEnd={ref_.focusEnd}
        />
      ) : (
        <PlainFileView
          content={fileContent?.after ?? ''}
          language={fileContent?.language ?? ref_.language}
          focusStart={ref_.focusStart}
          focusEnd={ref_.focusEnd}
        />
      )}
    </div>
  );
}

function DiffFileView({ patch, language, focusStart, focusEnd }: {
  patch: string;
  language: string;
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

  const file = files[0];

  const tokens = useMemo(() => {
    if (!file?.hunks?.length) return undefined;
    const refractorLang = REFRACTOR_LANG_MAP[language] ?? language;
    const hasLang = refractor.registered(refractorLang);
    try {
      return tokenize(file.hunks, {
        highlight: hasLang,
        refractor: hasLang ? refractor : undefined,
        language: hasLang ? refractorLang : undefined,
        enhancers: [markEdits(file.hunks, { type: 'block' })],
      });
    } catch {
      try {
        return tokenize(file.hunks, {
          enhancers: [markEdits(file.hunks, { type: 'block' })],
        });
      } catch {
        return undefined;
      }
    }
  }, [file, language]);

  if (!file) return null;

  return (
    <div className="cruise-diff-wrapper">
      <Diff
        viewType="unified"
        diffType={file.type}
        hunks={file.hunks}
        tokens={tokens}
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

function DiffHunkWithFocus({ hunk, focusStart, focusEnd }: {
  hunk: any;
  focusStart: number;
  focusEnd: number;
}) {
  const hunkRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    const tbody = hunkRef.current;
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    let foundFocusStart = false;

    rows.forEach((row) => {
      const gutterCells = row.querySelectorAll('td.diff-gutter');
      let lineNum: number | null = null;
      gutterCells.forEach((cell) => {
        const num = parseInt((cell as HTMLElement).dataset.lineNumber ?? '', 10);
        if (!isNaN(num)) lineNum = num;
      });

      const inFocus = lineNum !== null && lineNum >= focusStart && lineNum <= focusEnd;

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

  return <Hunk ref={hunkRef} hunk={hunk} />;
}

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

function ChangeTypeBadge({ type }: { type: CodeReference['changeType'] }) {
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
