import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
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

const DEFAULT_WIDTH = 700;
const MIN_WIDTH = 350;
const MAX_WIDTH = 1200;

export function FileSlideout({ files }: FileSlideoutProps) {
  const { activeSlideout, openFile, closeFile } = useSlideout();
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (!activeSlideout) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFile();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeSlideout, closeFile]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX; // dragging left = wider
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));
      setPanelWidth(newWidth);
    }

    function onUp() {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  const fileContent = activeSlideout ? files[activeSlideout.file] : undefined;

  return (
    <AnimatePresence>
      {activeSlideout && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: panelWidth }}
          exit={{ width: 0 }}
          transition={isDragging.current ? { duration: 0 } : { type: 'spring', damping: 35, stiffness: 250 }}
          className="flex-shrink-0 h-screen sticky top-0 overflow-hidden border-l border-[var(--border)] bg-[var(--bg-primary)] relative"
        >
          {/* Resize handle */}
          <div
            onMouseDown={onDragStart}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors"
          />

          <div className="h-full flex flex-col" style={{ width: panelWidth }}>
            {/* Header with file picker */}
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex-shrink-0 gap-2">
              <FilePickerDropdown
                currentFile={activeSlideout.file}
                allFiles={Object.keys(files)}
                onSelect={(file) => openFile(file)}
              />
              <button
                onClick={closeFile}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function middleTruncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const keep = maxLen - 3; // room for "..."
  const front = Math.ceil(keep / 2);
  const back = Math.floor(keep / 2);
  return `${str.slice(0, front)}\u2026${str.slice(-back)}`;
}

function FilePickerDropdown({ currentFile, allFiles, onSelect }: {
  currentFile: string;
  allFiles: string[];
  onSelect: (file: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => [...allFiles].sort(), [allFiles]);

  return (
    <div className="relative min-w-0 flex-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 min-w-0 w-full text-left px-2 py-1 -mx-2 -my-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <span className="text-sm font-mono text-[var(--text-primary)] truncate">
          {currentFile}
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--text-secondary)" className="flex-shrink-0">
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 max-w-[min(22rem,90vw)] max-h-[50vh] overflow-y-auto overflow-x-hidden rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] shadow-xl z-30 py-1">
            {sorted.map((file) => (
              <button
                key={file}
                onClick={() => { onSelect(file); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                  file === currentFile
                    ? 'text-[var(--accent)] bg-[var(--accent)]/5'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
                title={file}
              >
                {middleTruncate(file, 45)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
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
    <div className="cruise-diff-wrapper min-w-fit">
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
  const lines = (fileContent.after ?? '').split('\n');

  return (
    <pre className="text-[13px] leading-[1.5] font-mono m-0 bg-[var(--bg-secondary)] min-w-fit">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-[var(--text-secondary)]/40" style={{ lineHeight: '1.5em' }}>
            {i + 1}
          </span>
          <span className="flex-1 px-4 whitespace-pre text-[var(--text-primary)]">
            {line}
          </span>
        </div>
      ))}
    </pre>
  );
}
