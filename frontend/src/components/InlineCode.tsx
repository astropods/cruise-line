import { useEffect, useState, useMemo } from 'react';
import type { FileContent } from '../api';
import { useSlideout } from '../contexts/SlideoutContext';

interface InlineCodeProps {
  file: string;
  lines?: [number, number];
  fileContent: FileContent | undefined;
}

export function InlineCode({ file, lines, fileContent }: InlineCodeProps) {
  const { openFile, githubFileUrl } = useSlideout();
  const [highlightedLines, setHighlightedLines] = useState<string[]>([]);

  const content = fileContent?.after ?? '';
  const language = fileContent?.language ?? 'text';

  // Extract the relevant line range
  const allLines = useMemo(() => content.split('\n'), [content]);
  const startLine = lines ? lines[0] : 1;
  const endLine = lines ? Math.min(lines[1], allLines.length) : allLines.length;
  const visibleLines = allLines.slice(startLine - 1, endLine);

  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      if (!visibleLines.length) return;
      const code = visibleLines.join('\n');
      const { codeToTokens } = await import('shiki');
      try {
        const result = await codeToTokens(code, {
          lang: language as any,
          theme: 'github-dark',
        });
        if (cancelled) return;
        setHighlightedLines(result.tokens.map((lineTokens) =>
          lineTokens.map((token) => {
            const isValidColor = token.color && /^#[0-9a-fA-F]{3,8}$/.test(token.color);
            const style = isValidColor ? ` style="color:${token.color}"` : '';
            const escaped = token.content
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<span${style}>${escaped}</span>`;
          }).join('')
        ));
      } catch {
        if (!cancelled) {
          setHighlightedLines(visibleLines.map((l) =>
            `<span>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
          ));
        }
      }
    }
    highlight();
    return () => { cancelled = true; };
  }, [visibleLines.join('\n'), language]);

  if (!content) return null;

  return (
    <div className="my-4 rounded-lg border border-[var(--border)] overflow-hidden">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
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

      {/* Code content */}
      <div className="max-h-[500px] overflow-auto bg-[var(--bg-secondary)]">
        <pre className="text-[13px] leading-[1.5] font-mono m-0">
          {(highlightedLines.length > 0 ? highlightedLines : visibleLines).map((lineHtml, i) => (
            <div key={i} className="flex">
              <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-[var(--text-secondary)]/50" style={{ lineHeight: '1.5em' }}>
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
