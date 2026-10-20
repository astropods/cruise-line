import { useFileContent } from './useFileContent';
import { normalizePath } from './resolvePath';
import { InlineDiff } from './InlineDiff';
import { InlineCode } from './InlineCode';
import { InlineSuggestion } from './InlineSuggestion';
import { FilePill } from './FilePill';

interface LazyFileEmbedProps {
  type: 'diff' | 'code' | 'suggestion';
  file: string;
  lines?: [number, number];
  /** Only used for suggestion type */
  suggestion?: string;
}

/**
 * An embed for a file the review didn't collect, fetched on demand. Used by
 * RichContent as a fallback.
 */
export function LazyFileEmbed({ type, file, lines, suggestion }: LazyFileEmbedProps) {
  const { data: fileContent, isPending, isError } = useFileContent(normalizePath(file));

  if (isPending) {
    return (
      <div className="my-4 rounded-lg border border-line overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-raised border-b border-line">
          <span className="text-xs font-mono text-fg-muted">{file}</span>
        </div>
        <div className="px-4 py-6 bg-surface text-center text-xs text-fg-muted">
          Loading file...
        </div>
      </div>
    );
  }

  if (isError || !fileContent) {
    return <div className="my-2"><FilePill file={file} /></div>;
  }

  if (type === 'diff') {
    return <InlineDiff file={file} lines={lines} fileContent={fileContent} />;
  }

  if (type === 'suggestion') {
    return <InlineSuggestion file={file} lines={lines} suggestion={suggestion ?? ''} fileContent={fileContent} />;
  }

  return <InlineCode file={file} lines={lines} fileContent={fileContent} />;
}
