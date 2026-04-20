import { useCallback, useState } from 'react';
import { RichContent } from './RichContent';
import { FilePill } from './FilePill';
import { useSlideout } from '../contexts/SlideoutContext';
import { useCommentsContext } from '../contexts/CommentsContext';
import type { Finding, FileContent, Severity, FindingCategory } from '../api';

interface FindingRendererProps {
  finding: Finding;
  files: Record<string, FileContent>;
  index: number;
}

const severityConfig: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  high: { label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  medium: { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  low: { label: 'Low', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  info: { label: 'Info', color: 'text-[var(--text-secondary)]', bg: 'bg-[var(--text-secondary)]/5', border: 'border-[var(--text-secondary)]/20' },
};

const categoryLabels: Record<FindingCategory, string> = {
  correctness: 'Correctness',
  security: 'Security',
  maintainability: 'Maintainability',
  performance: 'Performance',
  style: 'Style',
};

/**
 * Extract the first ::diff or ::code directive's file and start line,
 * which is the most specific location to anchor a comment.
 */
function extractCommentTarget(body: string): { file: string; line: number } | null {
  const match = body.match(/::(?:diff|code)\{[^}]*file="([^"]+)"[^}]*lines="(\d+)-\d+"[^}]*\}/);
  if (!match) return null;
  return { file: match[1], line: parseInt(match[2], 10) };
}

export function FindingRenderer({ finding, files, index }: FindingRendererProps) {
  const sev = severityConfig[finding.severity] ?? severityConfig.info;
  const { openFile } = useSlideout();
  const { setActiveCommentLine } = useCommentsContext();
  const [copied, setCopied] = useState(false);

  // Determine if this finding can be posted as a comment
  const commentTarget = extractCommentTarget(finding.body);
  const canComment = commentTarget && files[commentTarget.file]?.patch;

  const handlePostAsComment = useCallback(() => {
    if (!commentTarget || !canComment) return;
    openFile(commentTarget.file, [commentTarget.line, commentTarget.line]);
    const prefill = `**${finding.title}**\n\n${stripDirectives(finding.body)}`;
    setTimeout(() => {
      setActiveCommentLine({
        path: commentTarget.file,
        line: commentTarget.line,
        side: 'RIGHT',
        prefill,
      });
    }, 300);
  }, [commentTarget, canComment, finding, openFile, setActiveCommentLine]);

  const handleCopyFixPrompt = useCallback(() => {
    if (!finding.fixPrompt) return;
    navigator.clipboard.writeText(finding.fixPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [finding.fixPrompt]);

  return (
    <section
      id={`section-${index}`}
      data-section-index={index}
      className="mb-12"
    >
      {/* Finding header */}
      <div className="flex items-start gap-3 mb-6 pb-4 border-b border-[var(--border)]">
        <div className="flex-1 min-w-0">
          <h2 className="text-[1.4rem] font-semibold text-[var(--text-bright)] tracking-tight leading-tight mb-2">
            {finding.title}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${sev.color} ${sev.bg} ${sev.border}`}>
              {sev.label}
            </span>
            <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">
              {categoryLabels[finding.category] ?? finding.category}
            </span>
            {finding.files.length > 0 && (
              <div className="flex items-center gap-1 ml-1">
                {finding.files.slice(0, 3).map((f) => (
                  <FilePill key={f} file={f} />
                ))}
                {finding.files.length > 3 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    +{finding.files.length - 3} more
                  </span>
                )}
              </div>
            )}
            {/* Action buttons — pushed to the right */}
            {(canComment || finding.fixPrompt) && (
              <div className="flex items-center gap-1 ml-auto">
                {finding.fixPrompt && (
                  <button
                    onClick={handleCopyFixPrompt}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                    title="Copy a prompt you can paste into Claude Code to fix this issue"
                  >
                    {copied ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-green-400">
                          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
                        </svg>
                        <span className="text-green-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
                          <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
                        </svg>
                        Copy fix prompt
                      </>
                    )}
                  </button>
                )}
                {canComment && (
                  <button
                    onClick={handlePostAsComment}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                    title="Open comment input on the relevant line, pre-filled with this finding"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.5 0a.25.25 0 0 1 .25-.25h10.5a.25.25 0 0 1 .25.25v7.5a.25.25 0 0 1-.25.25h-4.5a.75.75 0 0 0-.53.22l-2.72 2.72v-2.19a.75.75 0 0 0-.75-.75h-2a.25.25 0 0 1-.25-.25Z"/>
                    </svg>
                    Post as comment
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <RichContent content={finding.body} files={files} />
    </section>
  );
}

/**
 * Strip ::directive{} blocks from markdown, leaving just the prose.
 * Used to create a clean comment body from a finding.
 */
function stripDirectives(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  const directiveRe = /^::(\w+)\{[^}]*\}\s*$/;
  let i = 0;
  while (i < lines.length) {
    const match = directiveRe.exec(lines[i]);
    if (match) {
      const directive = match[1];
      // Skip directives that consume following lines (callout, suggestion)
      if (directive === 'callout' || directive === 'suggestion') {
        i++;
        while (i < lines.length) {
          if (lines[i].trim() === '') {
            let nextNonEmpty = i + 1;
            while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') nextNonEmpty++;
            if (nextNonEmpty >= lines.length || directiveRe.test(lines[nextNonEmpty])) break;
          }
          i++;
        }
      } else {
        i++;
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
