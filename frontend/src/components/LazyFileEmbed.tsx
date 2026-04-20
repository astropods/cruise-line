import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { fetchFileContent, type FileContent } from '../api';
import { normalizePath } from '../lib/resolvePath';
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
 * Lazily fetches file content from the API when it's not available
 * in the pre-collected files map. Used by RichContent as a fallback.
 */
export function LazyFileEmbed({ type, file, lines, suggestion }: LazyFileEmbedProps) {
  const { owner, repo, pr } = useParams<{ owner: string; repo: string; pr: string }>();
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!owner || !repo || !pr) {
      setLoading(false);
      setFailed(true);
      return;
    }

    let cancelled = false;
    fetchFileContent(owner, repo, Number(pr), normalizePath(file))
      .then((fc) => {
        if (!cancelled) setFileContent(fc);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [owner, repo, pr, file]);

  if (loading) {
    return (
      <div className="my-4 rounded-lg border border-[var(--border)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border)]">
          <span className="text-xs font-mono text-[var(--text-secondary)]">{file}</span>
        </div>
        <div className="px-4 py-6 bg-[var(--bg-secondary)] text-center text-xs text-[var(--text-secondary)]">
          Loading file...
        </div>
      </div>
    );
  }

  if (failed || !fileContent) {
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
