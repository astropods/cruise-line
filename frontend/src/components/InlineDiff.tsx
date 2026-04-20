import { useMemo, useCallback } from 'react';
import { parseDiff, Diff, Hunk, tokenize, markEdits } from 'react-diff-view';
import refractor from 'refractor';
import { ChatText } from '@phosphor-icons/react';
import type { FileContent } from '../api';
import { useSlideout } from '../contexts/SlideoutContext';
import { useCommentsContext } from '../contexts/CommentsContext';
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

interface InlineDiffProps {
  file: string;
  lines?: [number, number];
  fileContent: FileContent | undefined;
}

export function InlineDiff({ file, lines, fileContent }: InlineDiffProps) {
  const { openFile, githubFileUrl } = useSlideout();
  const { setActiveCommentLine } = useCommentsContext();
  const canComment = !!lines;

  const handleComment = useCallback(() => {
    if (!lines) return;
    openFile(file, lines);
    setTimeout(() => {
      setActiveCommentLine({ path: file, line: lines[0], side: 'RIGHT' });
    }, 300);
  }, [file, lines, openFile, setActiveCommentLine]);

  const parsed = useMemo(() => {
    if (!fileContent?.patch) return null;
    try {
      const files = parseDiff(fileContent.patch, { nearbySequences: 'zip' });
      return files[0] ?? null;
    } catch {
      return null;
    }
  }, [fileContent?.patch]);

  const tokens = useMemo(() => {
    if (!parsed?.hunks?.length) return undefined;
    const lang = REFRACTOR_LANG_MAP[fileContent?.language ?? ''] ?? fileContent?.language;
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
  }, [parsed, fileContent?.language]);

  if (!parsed) return null;

  // Filter hunks to only show the specified line range if provided
  const hunks = lines
    ? parsed.hunks.filter((h: any) => {
        const hunkEnd = h.newStart + h.newLines;
        return h.newStart <= lines[1] && hunkEnd >= lines[0];
      })
    : parsed.hunks;

  if (hunks.length === 0) return null;

  return (
    <div className="my-4 rounded-lg border border-[var(--border)] overflow-hidden">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
        <a href={githubFileUrl(file)} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
          {file}
          {lines && <span className="opacity-50 ml-2">L{lines[0]}–{lines[1]}</span>}
        </a>
        <div className="flex items-center gap-2">
          {canComment && (
            <button
              onClick={handleComment}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
              title="Comment on this code"
            >
              <ChatText size={12} />
              Comment
            </button>
          )}
          <button
            onClick={() => openFile(file, lines)}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View full file
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="cruise-diff-wrapper max-h-[500px] overflow-auto">
        <Diff
          viewType="unified"
          diffType={parsed.type}
          hunks={hunks}
          tokens={tokens}
          gutterType="default"
        >
          {(hs) => hs.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
        </Diff>
      </div>
    </div>
  );
}
