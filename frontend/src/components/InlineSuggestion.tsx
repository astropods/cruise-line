import { useEffect, useState, useMemo, useCallback } from 'react';
import { PencilSimpleLine, ChatText } from '@phosphor-icons/react';
import type { FileContent } from '../api';
import { useSlideout } from '../contexts/SlideoutContext';
import { useCommentsContext } from '../contexts/CommentsContext';

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
  const [highlightedOld, setHighlightedOld] = useState<string[]>([]);
  const [highlightedNew, setHighlightedNew] = useState<string[]>([]);

  const content = fileContent?.after ?? '';
  const language = fileContent?.language ?? 'text';
  const canComment = !!lines;

  const allLines = useMemo(() => content.split('\n'), [content]);
  const startLine = lines ? lines[0] : 1;
  const endLine = lines ? Math.min(lines[1], allLines.length) : allLines.length;
  const oldLines = allLines.slice(startLine - 1, endLine);
  const newLines = useMemo(() => suggestion.split('\n'), [suggestion]);

  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      const { codeToTokens } = await import('shiki');
      const renderTokens = (tokens: any) =>
        tokens.map((lineTokens: any[]) =>
          lineTokens.map((token: any) => {
            const style = token.color ? ` style="color:${token.color}"` : '';
            const escaped = token.content
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<span${style}>${escaped}</span>`;
          }).join('')
        );

      try {
        const [oldResult, newResult] = await Promise.all([
          codeToTokens(oldLines.join('\n'), { lang: language as any, theme: 'github-dark' }),
          codeToTokens(newLines.join('\n'), { lang: language as any, theme: 'github-dark' }),
        ]);
        if (cancelled) return;
        setHighlightedOld(renderTokens(oldResult.tokens));
        setHighlightedNew(renderTokens(newResult.tokens));
      } catch {
        if (!cancelled) {
          const escape = (l: string) =>
            `<span>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
          setHighlightedOld(oldLines.map(escape));
          setHighlightedNew(newLines.map(escape));
        }
      }
    }
    highlight();
    return () => { cancelled = true; };
  }, [oldLines.join('\n'), newLines.join('\n'), language]);

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
    <div className="my-4 rounded-lg border border-[var(--accent)]/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--accent)]/5 border-b border-[var(--accent)]/20">
        <div className="flex items-center gap-2">
          <PencilSimpleLine size={14} className="text-[var(--accent)]" />
          <span className="text-xs font-medium text-[var(--accent)]">Suggested change</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={githubFileUrl(file)} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            {file}
            {lines && <span className="opacity-50 ml-2">L{lines[0]}–{lines[1]}</span>}
          </a>
          {canComment && (
            <button
              onClick={handleCommentSuggestion}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
              title="Post this suggestion as a GitHub review comment"
            >
              <ChatText size={12} />
              Comment
            </button>
          )}
          <button
            onClick={() => openFile(file, lines)}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View file
          </button>
        </div>
      </div>

      {/* Before/after diff */}
      <div className="max-h-[500px] overflow-auto bg-[var(--bg-secondary)]">
        <pre className="text-[13px] leading-[1.5] font-mono m-0">
          {/* Old lines (deletions) */}
          {(highlightedOld.length > 0 ? highlightedOld : oldLines).map((lineHtml, i) => (
            <div key={`old-${i}`} className="flex" style={{ background: 'rgba(248, 81, 73, 0.10)' }}>
              <span className="select-none w-8 flex-shrink-0 text-center text-xs text-red-400/60" style={{ lineHeight: '1.5em' }}>
                -
              </span>
              <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-[var(--text-secondary)]/40" style={{ lineHeight: '1.5em' }}>
                {startLine + i}
              </span>
              <span
                className="flex-1 px-4 whitespace-pre-wrap break-all"
                dangerouslySetInnerHTML={{ __html: typeof lineHtml === 'string' ? lineHtml : '' }}
              />
            </div>
          ))}
          {/* New lines (additions) */}
          {(highlightedNew.length > 0 ? highlightedNew : newLines).map((lineHtml, i) => (
            <div key={`new-${i}`} className="flex" style={{ background: 'rgba(46, 160, 67, 0.12)' }}>
              <span className="select-none w-8 flex-shrink-0 text-center text-xs text-green-400/60" style={{ lineHeight: '1.5em' }}>
                +
              </span>
              <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-[var(--text-secondary)]/40" style={{ lineHeight: '1.5em' }}>
                {startLine + i}
              </span>
              <span
                className="flex-1 px-4 whitespace-pre-wrap break-all"
                dangerouslySetInnerHTML={{ __html: typeof lineHtml === 'string' ? lineHtml : '' }}
              />
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
