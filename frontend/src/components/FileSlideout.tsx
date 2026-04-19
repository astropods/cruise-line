import { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseDiff, Diff, Hunk, tokenize, markEdits } from 'react-diff-view';
import refractor from 'refractor';
import { useSlideout } from '../contexts/SlideoutContext';
import type { FileContent } from '../api';
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

interface FileSlideoutProps {
  files: Record<string, FileContent>;
}

export function FileSlideout({ files }: FileSlideoutProps) {
  const { activeSlideout, closeFile } = useSlideout();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!activeSlideout) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFile();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeSlideout, closeFile]);

  const fileContent = activeSlideout ? files[activeSlideout.file] : undefined;

  return (
    <AnimatePresence>
      {activeSlideout && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeFile}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-50 bg-[var(--bg-primary)] border-l border-[var(--border)] flex flex-col"
            style={{ width: 'clamp(600px, 70vw, 1200px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
              <span className="text-sm font-mono text-[var(--text-primary)]">
                {activeSlideout.file}
              </span>
              <button
                onClick={closeFile}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>

            {/* File content */}
            <div className="flex-1 overflow-auto">
              {fileContent?.patch ? (
                <SlideoutDiffView fileContent={fileContent} />
              ) : fileContent?.after ? (
                <SlideoutCodeView fileContent={fileContent} />
              ) : (
                <div className="p-8 text-center text-[var(--text-secondary)]">
                  File content not available
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SlideoutDiffView({ fileContent }: { fileContent: FileContent }) {
  const parsed = useMemo(() => {
    try {
      return parseDiff(fileContent.patch!, { nearbySequences: 'zip' })[0] ?? null;
    } catch {
      return null;
    }
  }, [fileContent.patch]);

  const tokens = useMemo(() => {
    if (!parsed?.hunks?.length) return undefined;
    const lang = REFRACTOR_LANG_MAP[fileContent.language] ?? fileContent.language;
    const hasLang = lang ? refractor.registered(lang) : false;
    try {
      return hasLang
        ? tokenize(parsed.hunks, {
            highlight: true as const,
            refractor,
            language: lang!,
            enhancers: [markEdits(parsed.hunks, { type: 'block' })],
          })
        : tokenize(parsed.hunks, {
            enhancers: [markEdits(parsed.hunks, { type: 'block' })],
          });
    } catch {
      return undefined;
    }
  }, [parsed, fileContent.language]);

  if (!parsed) return null;

  return (
    <div className="cruise-diff-wrapper">
      <Diff
        viewType="unified"
        diffType={parsed.type}
        hunks={parsed.hunks}
        tokens={tokens}
        gutterType="default"
      >
        {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </div>
  );
}

function SlideoutCodeView({ fileContent }: { fileContent: FileContent }) {
  // Simple non-highlighted fallback for the slideout
  const lines = (fileContent.after ?? '').split('\n');

  return (
    <pre className="text-[13px] leading-[1.5] font-mono m-0 bg-[var(--bg-secondary)]">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-[var(--text-secondary)]/40" style={{ lineHeight: '1.5em' }}>
            {i + 1}
          </span>
          <span className="flex-1 px-4 whitespace-pre-wrap break-all text-[var(--text-primary)]">
            {line}
          </span>
        </div>
      ))}
    </pre>
  );
}
