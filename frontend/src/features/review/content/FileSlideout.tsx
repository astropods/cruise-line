import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Diff, Hunk, computeNewLineNumber, getChangeKey } from 'react-diff-view';
import { useSlideout } from './SlideoutContext';
import { useCommentsContext } from '../../comments/CommentsContext';
import { InlineComment } from '../../comments/InlineComment';
import { CommentInput } from '../../comments/CommentInput';
import { resolveFilePath } from './resolvePath';
import type { FileContent } from '../../../api';
import { useFileContent } from './useFileContent';
import { useParsedDiff } from './useParsedDiff';
import { useMediaQuery, useViewportWidth, WIDE_SCREEN } from '../../../lib/useMediaQuery';
import { useShellPanel } from '../../../shell/ShellContext';


interface FileSlideoutProps {
  files: Record<string, FileContent>;
}

const DEFAULT_WIDTH = 700;
const MIN_WIDTH = 350;
const MAX_WIDTH = 1200;
// The review beside the panel stays at least this wide
const MIN_CONTENT_WIDTH = 360;

export function FileSlideout({ files }: FileSlideoutProps) {
  const { activeSlideout, openFile, closeFile, githubFileUrl } = useSlideout();
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const wide = useMediaQuery(WIDE_SCREEN);
  const viewportWidth = useViewportWidth();
  // The dragged width, shrunk to leave room for the review on smaller windows
  const fitWidth = Math.max(MIN_WIDTH, Math.min(panelWidth, viewportWidth - MIN_CONTENT_WIDTH));
  useShellPanel(!!activeSlideout);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (!activeSlideout) return;
    function handleKey(e: KeyboardEvent) {
      // A comment box, menu, or popover inside handled it already
      if (e.key === 'Escape' && !e.defaultPrevented) closeFile();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeSlideout, closeFile]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = fitWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX; // dragging left = wider
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - MIN_CONTENT_WIDTH, startWidth.current + delta));
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
  }, [fitWidth]);

  // Resolve the file path against known files, and fetch it if the review didn't collect it
  const knownPaths = useMemo(() => Object.keys(files), [files]);
  const resolvedFile = activeSlideout ? resolveFilePath(activeSlideout.file, knownPaths) : '';
  const staticContent = activeSlideout ? files[resolvedFile] : undefined;
  const lazy = useFileContent(activeSlideout && !staticContent ? resolvedFile || activeSlideout.file : null);
  const lazyLoading = lazy.isFetching;
  const lazyContent = lazy.data;

  const fileContent = staticContent ?? lazyContent ?? undefined;

  return (
    <AnimatePresence>
      {activeSlideout && (
        <motion.div
          role="dialog"
          aria-label={`File ${activeSlideout.file}`}
          // Wide screens: a resizable column beside the review. Narrow: the whole screen.
          {...(wide
            ? { initial: { width: 0 }, animate: { width: fitWidth }, exit: { width: 0 } }
            : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } })}
          transition={isDragging.current ? { duration: 0 } : { type: 'spring', damping: 35, stiffness: 250 }}
          className={wide
            ? 'relative h-full flex-shrink-0 overflow-hidden border-l border-line bg-canvas'
            : 'fixed inset-0 z-50 overflow-hidden bg-canvas'}
        >
          {wide && (
            <div
              onMouseDown={onDragStart}
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-accent/30 active:bg-accent/50 transition-colors"
            />
          )}

          <div className="h-full flex flex-col" style={{ width: wide ? fitWidth : '100%' }}>
            {/* Header with file picker */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-line flex-shrink-0 gap-2">
              <FilePickerDropdown
                currentFile={activeSlideout.file}
                allFiles={Object.keys(files)}
                onSelect={(file) => openFile(file)}
              />
              <a
                href={githubFileUrl(activeSlideout.file)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-raised text-fg-muted hover:text-accent transition-colors flex-shrink-0"
                title="View on GitHub"
                aria-label="View on GitHub"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5H4.56l6.22 6.22a.75.75 0 1 1-1.06 1.06L3.5 4.56v2.69a.75.75 0 0 1-1.5 0v-3.5A1.75 1.75 0 0 1 3.75 2Zm6.5 0h2A1.75 1.75 0 0 1 14 3.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-2a.75.75 0 0 1 1.5 0v2c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25h-2a.75.75 0 0 1 0-1.5Z"/>
                </svg>
              </a>
              <button
                onClick={closeFile}
                aria-label="Close file"
                title="Close file"
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-raised text-fg-muted transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              </button>
            </div>

            {/* File content — key includes lines to force remount when focus changes */}
            <div className="flex-1 overflow-auto" id="slideout-scroll-container">
              <SlideoutContent
                key={`${activeSlideout.file}-${activeSlideout.lines?.join('-') ?? 'all'}`}
                filePath={activeSlideout.file}
                fileContent={fileContent}
                focusLines={activeSlideout.lines}
                loading={lazyLoading && !staticContent}
              />
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

function SlideoutContent({ filePath, fileContent, focusLines, loading }: { filePath: string; fileContent: FileContent | undefined; focusLines?: [number, number]; loading?: boolean }) {
  const isInDiff = !!fileContent?.patch;

  if (loading) {
    return (
      <div className="p-8 text-center text-fg-muted">
        Loading file...
      </div>
    );
  }

  return (
    <>
      {fileContent && !isInDiff && (
        <div className="flex items-center gap-2 px-4 py-2 bg-fg-muted/5 border-b border-line text-xs text-fg-muted">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 opacity-60">
            <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>
          </svg>
          This file is not part of the pull request diff — shown for context only
        </div>
      )}
      {fileContent?.patch ? (
        <SlideoutDiffView filePath={filePath} fileContent={fileContent} focusLines={focusLines} />
      ) : fileContent?.after ? (
        <SlideoutCodeView filePath={filePath} fileContent={fileContent} focusLines={focusLines} />
      ) : (
        <div className="p-8 text-center text-fg-muted">
          File content not available
        </div>
      )}
    </>
  );
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
        className="flex items-center gap-2 min-w-0 w-full text-left px-2 py-1 -mx-2 -my-1 rounded hover:bg-raised transition-colors"
      >
        <span className="text-sm font-mono text-fg truncate">
          {currentFile}
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--color-fg-muted)" className="flex-shrink-0">
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 max-w-[min(22rem,90vw)] max-h-[50vh] overflow-y-auto overflow-x-hidden rounded-lg bg-surface border border-line shadow-xl z-30 py-1">
            {sorted.map((file) => (
              <button
                key={file}
                onClick={() => { onSelect(file); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${
                  file === currentFile
                    ? 'text-accent bg-accent/5'
                    : 'text-fg-muted hover:text-fg hover:bg-raised'
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

function SlideoutDiffView({ filePath, fileContent, focusLines }: { filePath: string; fileContent: FileContent; focusLines?: [number, number] }) {
  const { getCommentsForLine, addComment, activeCommentLine, setActiveCommentLine, userAvatarUrl, fetchError } = useCommentsContext();
  const { parsed, tokens } = useParsedDiff(fileContent.patch, fileContent.language);

  // Scroll to and highlight focus lines after render
  useEffect(() => {
    if (!focusLines || !parsed) return;
    const timer = setTimeout(() => {
      const container = document.getElementById('slideout-scroll-container');
      if (!container) return;

      // Match by react-diff-view's own change keys. A context line's key uses
      // its old line number, so the new-side range has to be mapped first.
      const focusKeys = new Set<string>();
      for (const hunk of parsed.hunks) {
        for (const change of hunk.changes) {
          if (change.type === 'delete') continue;
          const newLine = computeNewLineNumber(change);
          if (newLine >= focusLines[0] && newLine <= focusLines[1]) focusKeys.add(getChangeKey(change));
        }
      }
      // Rows from the last focus range stay highlighted otherwise
      container.querySelectorAll('.slideout-focus-row').forEach((row) => row.classList.remove('slideout-focus-row'));
      container.querySelectorAll<HTMLElement>('td[data-change-key]').forEach((cell) => {
        if (focusKeys.has(cell.dataset.changeKey ?? '')) cell.closest('tr')?.classList.add('slideout-focus-row');
      });

      scrollRowsIntoView(container, container.querySelectorAll<HTMLElement>('.slideout-focus-row'));
    }, 200);
    return () => clearTimeout(timer);
  }, [focusLines, parsed]);

  // Build widgets map: inject comments and comment input below relevant lines
  const widgets = useMemo(() => {
    if (!parsed) return {};
    const w: Record<string, React.ReactElement> = {};

    for (const hunk of parsed.hunks) {
      for (const change of hunk.changes) {
        // Determine the change key (same format react-diff-view uses internally)
        let changeKey: string;
        let lineNum: number;
        let side: 'LEFT' | 'RIGHT';

        if (change.type === 'insert') {
          changeKey = `I${change.lineNumber}`;
          lineNum = change.lineNumber;
          side = 'RIGHT';
        } else if (change.type === 'delete') {
          changeKey = `D${change.lineNumber}`;
          lineNum = change.lineNumber;
          side = 'LEFT';
        } else {
          changeKey = `N${change.oldLineNumber}`;
          lineNum = change.newLineNumber;
          side = 'RIGHT';
        }

        const lineComments = getCommentsForLine(filePath, lineNum, side);
        const isActiveInput = activeCommentLine?.path === filePath && activeCommentLine?.line === lineNum
          && (activeCommentLine.side ?? 'RIGHT') === side;

        // Separate top-level comments from replies
        const topLevel = lineComments.filter((c) => !c.inReplyToId);
        const repliesMap = new Map<number, typeof lineComments>();
        for (const c of lineComments) {
          if (c.inReplyToId) {
            const arr = repliesMap.get(c.inReplyToId) ?? [];
            arr.push(c);
            repliesMap.set(c.inReplyToId, arr);
          }
        }

        if (topLevel.length > 0 || isActiveInput) {
          w[changeKey] = (
            <div>
              {topLevel.map((c) => (
                <InlineComment key={c.id} comment={c} replies={repliesMap.get(c.id)} />
              ))}
              {isActiveInput && (
                <CommentInput
                  // A new prefill (another finding on the same line) starts a fresh box
                  key={activeCommentLine?.prefill ?? ''}
                  userAvatarUrl={userAvatarUrl}
                  prefill={activeCommentLine?.prefill}
                  onSubmit={async (body) => {
                    await addComment(filePath, lineNum, side, body);
                    setActiveCommentLine(null);
                  }}
                  onCancel={() => setActiveCommentLine(null)}
                />
              )}
            </div>
          );
        }
      }
    }
    return w;
  }, [parsed, filePath, getCommentsForLine, activeCommentLine, addComment, setActiveCommentLine, userAvatarUrl]);

  // Gutter click handler — open comment input on the clicked line
  const handleGutterClick = useCallback(({ change }: any) => {
    if (!change) return;
    let lineNum: number;
    let side: 'LEFT' | 'RIGHT';
    if (change.type === 'insert') {
      lineNum = change.lineNumber;
      side = 'RIGHT';
    } else if (change.type === 'delete') {
      lineNum = change.lineNumber;
      side = 'LEFT';
    } else {
      lineNum = change.newLineNumber;
      side = 'RIGHT';
    }
    setActiveCommentLine({ path: filePath, line: lineNum, side });
  }, [filePath, setActiveCommentLine]);

  if (!parsed) return null;

  return (
    <div className="cruise-diff-wrapper cruise-commentable-diff min-w-fit">
      {fetchError && (
        <p role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger-fg">
          Couldn't load this PR's comments, so existing ones aren't shown. {fetchError}
        </p>
      )}
      <Diff
        viewType="unified"
        diffType={parsed.type}
        hunks={parsed.hunks}
        tokens={tokens}
        widgets={widgets}
        gutterType="default"
        gutterEvents={{ onClick: handleGutterClick }}
      >
        {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
      </Diff>
    </div>
  );
}

/** Center the rows in the scroll container, or align their top when they don't fit */
function scrollRowsIntoView(container: HTMLElement, rows: NodeListOf<HTMLElement>) {
  if (rows.length === 0) return;
  const containerRect = container.getBoundingClientRect();
  const firstRect = rows[0].getBoundingClientRect();
  const lastRect = rows[rows.length - 1].getBoundingClientRect();

  const focusTop = firstRect.top - containerRect.top + container.scrollTop;
  const focusHeight = lastRect.bottom - firstRect.top;
  const viewHeight = container.clientHeight;
  const padding = 24;
  const top = focusHeight < viewHeight - padding * 2
    ? focusTop - (viewHeight - focusHeight) / 2
    : focusTop - padding;

  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function SlideoutCodeView({ filePath, fileContent, focusLines }: { filePath: string; fileContent: FileContent; focusLines?: [number, number] }) {
  const lines = (fileContent.after ?? '').split('\n');
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusRef.current || !focusLines) return;
    const container = document.getElementById('slideout-scroll-container');
    if (!container) return;

    scrollRowsIntoView(container, container.querySelectorAll<HTMLElement>('[data-slideout-focus]'));
  }, [focusLines]);

  return (
    <div className="text-[13px] leading-[1.5] font-mono m-0 bg-surface min-w-fit">
      {lines.map((line, i) => {
        const lineNum = i + 1;
        const inFocus = focusLines && lineNum >= focusLines[0] && lineNum <= focusLines[1];
        const isFirst = focusLines && lineNum === focusLines[0];

        return (
          <div
            key={i}
            ref={isFirst ? focusRef : undefined}
            className={inFocus ? 'flex bg-accent/5 shadow-[inset_3px_0_0_var(--color-accent)]' : 'flex'}
            data-slideout-focus={inFocus ? true : undefined}
          >
            <span
              className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-fg-muted/40"
              style={{ lineHeight: '1.5em' }}
            >
              {lineNum}
            </span>
            <span className="flex-1 px-4 whitespace-pre text-fg">
              {line}
            </span>
          </div>
        );
      })}
    </div>
  );
}
