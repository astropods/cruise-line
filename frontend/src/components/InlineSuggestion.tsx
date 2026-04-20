import { useEffect, useState, useMemo } from 'react';
import type { FileContent } from '../api';
import { useSlideout } from '../contexts/SlideoutContext';

interface InlineSuggestionProps {
  file: string;
  lines?: [number, number];
  /** The suggested replacement code */
  suggestion: string;
  fileContent: FileContent | undefined;
}

export function InlineSuggestion({ file, lines, suggestion, fileContent }: InlineSuggestionProps) {
  const { openFile, githubFileUrl } = useSlideout();
  const [highlightedOld, setHighlightedOld] = useState<string[]>([]);
  const [highlightedNew, setHighlightedNew] = useState<string[]>([]);

  const content = fileContent?.after ?? '';
  const language = fileContent?.language ?? 'text';

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

  if (!content && !suggestion) return null;

  return (
    <div className="my-4 rounded-lg border border-[var(--accent)]/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--accent)]/5 border-b border-[var(--accent)]/20">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--accent)]">
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>
          </svg>
          <span className="text-xs font-medium text-[var(--accent)]">Suggested change</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={githubFileUrl(file)} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
            {file}
            {lines && <span className="opacity-50 ml-2">L{lines[0]}–{lines[1]}</span>}
          </a>
          <button
            onClick={() => openFile(file, lines)}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View full file
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
