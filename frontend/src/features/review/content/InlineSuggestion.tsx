import { useMemo, useCallback } from 'react';
import { PencilSimpleLine, ChatText } from '@phosphor-icons/react';
import type { FileContent } from '../../../api';
import { useSlideout } from './SlideoutContext';
import { CodeLine, useHighlightedLines } from './useHighlightedLines';
import { useCommentsContext } from '../../comments/CommentsContext';

interface InlineSuggestionProps {
  file: string;
  lines?: [number, number];
  /** The suggested replacement code */
  suggestion: string;
  fileContent: FileContent | undefined;
}

export function InlineSuggestion({ file, lines, suggestion, fileContent }: InlineSuggestionProps) {
  const { openFile, githubFileUrl } = useSlideout();
  const { setActiveCommentLine } = useCommentsContext();

  const content = fileContent?.after ?? '';
  const language = fileContent?.language ?? 'text';
  const canComment = !!lines;

  const allLines = useMemo(() => content.split('\n'), [content]);
  const startLine = lines ? lines[0] : 1;
  const endLine = lines ? Math.min(lines[1], allLines.length) : allLines.length;
  const oldLines = allLines.slice(startLine - 1, endLine);
  const newLines = useMemo(() => suggestion.split('\n'), [suggestion]);

  const highlightedOld = useHighlightedLines(oldLines, language);
  const highlightedNew = useHighlightedLines(newLines, language);

  const handleCommentSuggestion = useCallback(() => {
    if (!lines) return;
    openFile(file, lines);
    // Format as a GitHub suggestion comment
    const prefill = `\uD83D\uDEA2 \`\`\`suggestion\n${suggestion}\n\`\`\``;
    setTimeout(() => {
      setActiveCommentLine({
        path: file,
        line: startLine,
        side: 'RIGHT',
        prefill,
      });
    }, 300);
  }, [file, lines, startLine, suggestion, openFile, setActiveCommentLine]);

  if (!content && !suggestion) return null;

  return (
    <div className="my-4 rounded-lg border border-accent/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-accent/5 border-b border-accent/20">
        <div className="flex items-center gap-2">
          <PencilSimpleLine size={14} className="text-accent" />
          <span className="text-xs font-medium text-accent">Suggested change</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={githubFileUrl(file)} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-fg-muted hover:text-accent transition-colors">
            {file}
            {lines && <span className="opacity-50 ml-2">L{lines[0]}–{lines[1]}</span>}
          </a>
          {canComment && (
            <button
              onClick={handleCommentSuggestion}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-fg-muted hover:text-accent hover:bg-accent/10 transition-colors"
              title="Post this suggestion as a GitHub review comment"
            >
              <ChatText size={12} />
              Comment
            </button>
          )}
          <button
            onClick={() => openFile(file, lines)}
            className="text-xs text-accent hover:underline"
          >
            View file
          </button>
        </div>
      </div>

      {/* Before/after diff */}
      <div className="max-h-[500px] overflow-auto bg-surface">
        <pre className="text-[13px] leading-[1.5] font-mono m-0">
          {/* Old lines (deletions) */}
          {highlightedOld.map((tokens, i) => (
            <div key={`old-${i}`} className="flex bg-danger/10">
              <span className="select-none w-8 flex-shrink-0 text-center text-xs text-danger-fg/60" style={{ lineHeight: '1.5em' }}>
                -
              </span>
              <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-fg-muted/40" style={{ lineHeight: '1.5em' }}>
                {startLine + i}
              </span>
              <CodeLine tokens={tokens} />
            </div>
          ))}
          {/* New lines (additions) */}
          {highlightedNew.map((tokens, i) => (
            <div key={`new-${i}`} className="flex bg-success/10">
              <span className="select-none w-8 flex-shrink-0 text-center text-xs text-success/60" style={{ lineHeight: '1.5em' }}>
                +
              </span>
              <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-fg-muted/40" style={{ lineHeight: '1.5em' }}>
                {startLine + i}
              </span>
              <CodeLine tokens={tokens} />
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
