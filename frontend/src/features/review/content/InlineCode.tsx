import { useMemo } from 'react';
import type { FileContent } from '../../../api';
import { useSlideout } from './SlideoutContext';
import { CodeLine, useHighlightedLines } from './useHighlightedLines';

interface InlineCodeProps {
  file: string;
  lines?: [number, number];
  fileContent: FileContent | undefined;
}

export function InlineCode({ file, lines, fileContent }: InlineCodeProps) {
  const { openFile, githubFileUrl } = useSlideout();

  const content = fileContent?.after ?? '';
  const language = fileContent?.language ?? 'text';

  // Extract the relevant line range
  const allLines = useMemo(() => content.split('\n'), [content]);
  const startLine = lines ? lines[0] : 1;
  const endLine = lines ? Math.min(lines[1], allLines.length) : allLines.length;
  const visibleLines = allLines.slice(startLine - 1, endLine);

  const highlighted = useHighlightedLines(visibleLines, language);

  if (!content) return null;

  return (
    <div className="my-4 rounded-lg border border-line overflow-hidden">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2 bg-raised border-b border-line">
        <a href={githubFileUrl(file)} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-fg-muted hover:text-accent transition-colors">
          {file}
          {lines && <span className="opacity-50 ml-2">L{lines[0]}–{lines[1]}</span>}
        </a>
        <button
          onClick={() => openFile(file, lines)}
          className="text-xs text-accent hover:underline"
        >
          View full file
        </button>
      </div>

      {/* Code content */}
      <div className="max-h-[500px] overflow-auto bg-surface">
        <pre className="text-[13px] leading-[1.5] font-mono m-0">
          {highlighted.map((tokens, i) => (
            <div key={i} className="flex">
              <span className="select-none w-12 flex-shrink-0 text-right pr-4 text-xs text-fg-muted/50" style={{ lineHeight: '1.5em' }}>
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
