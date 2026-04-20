import { useCallback, useState } from 'react';
import {
  WarningOctagon, WarningCircle, Warning, ArrowDown, Lightbulb,
  Bug, ShieldCheck, Wrench, Lightning, PaintBrush,
  Copy, Check, ChatText, BookmarkSimple,
  type Icon,
} from '@phosphor-icons/react';
import { RichContent } from './RichContent';
import { FilePill } from './FilePill';
import { useSlideout } from '../contexts/SlideoutContext';
import { useCommentsContext } from '../contexts/CommentsContext';
import type { Finding, FileContent, Severity, FindingCategory } from '../api';
import type { RuleRef } from './RichContent';
import { normalizePath } from '../lib/resolvePath';

interface FindingRendererProps {
  finding: Finding;
  files: Record<string, FileContent>;
  index: number;
  onSaveAsRule?: (ruleText: string) => void;
  onRuleClick?: (ruleNumber: number) => void;
  rules?: RuleRef[];
}

const severityConfig: Record<Severity, { label: string; icon: Icon; color: string; bg: string; border: string }> = {
  critical: { label: 'Critical', icon: WarningOctagon, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  high: { label: 'High', icon: WarningCircle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  medium: { label: 'Medium', icon: Warning, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  low: { label: 'Low', icon: ArrowDown, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  info: { label: 'Info', icon: Lightbulb, color: 'text-[var(--text-secondary)]', bg: 'bg-[var(--text-secondary)]/5', border: 'border-[var(--text-secondary)]/20' },
};

const categoryConfig: Record<FindingCategory, { label: string; icon: Icon }> = {
  correctness: { label: 'Correctness', icon: Bug },
  security: { label: 'Security', icon: ShieldCheck },
  maintainability: { label: 'Maintainability', icon: Wrench },
  performance: { label: 'Performance', icon: Lightning },
  style: { label: 'Style', icon: PaintBrush },
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

export function FindingRenderer({ finding, files, index, onSaveAsRule, onRuleClick, rules }: FindingRendererProps) {
  const sev = severityConfig[finding.severity] ?? severityConfig.info;
  const cat = categoryConfig[finding.category] ?? categoryConfig.correctness;
  const { openFile } = useSlideout();
  const { setActiveCommentLine } = useCommentsContext();
  const [copied, setCopied] = useState(false);

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

  const SevIcon = sev.icon;
  const CatIcon = cat.icon;

  return (
    <section
      id={`section-${index}`}
      data-section-index={index}
      className="mb-12"
    >
      {/* Finding header */}
      <div className="mb-6 pb-4 border-b border-[var(--border)]">
        <h2 className="text-[1.4rem] font-semibold text-[var(--text-bright)] tracking-tight leading-tight mb-2">
          {finding.title}
        </h2>
        <div className="flex items-start gap-3">
          {/* Left: metadata — wraps freely */}
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${sev.color} ${sev.bg} ${sev.border}`}>
              <SevIcon size={12} weight="bold" />
              {sev.label}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">
              <CatIcon size={12} />
              {cat.label}
            </span>
            {(() => {
              const seen = new Set<string>();
              const unique = finding.files.filter((f) => {
                const norm = normalizePath(f);
                if (seen.has(norm)) return false;
                seen.add(norm);
                return true;
              });
              return (
                <>
                  {unique.slice(0, 3).map((f) => (
                    <FilePill key={f} file={f} />
                  ))}
                  {unique.length > 3 && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      +{unique.length - 3} more
                    </span>
                  )}
                </>
              );
            })()}
          </div>

          {/* Right: action buttons — single row, never wraps */}
          {(canComment || finding.fixPrompt || onSaveAsRule) && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {finding.fixPrompt && (
                <button
                  onClick={handleCopyFixPrompt}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors whitespace-nowrap"
                  title="Copy a prompt you can paste into Claude Code to fix this issue"
                >
                  {copied ? (
                    <>
                      <Check size={12} weight="bold" className="text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Copy fix prompt
                    </>
                  )}
                </button>
              )}
              {canComment && (
                <button
                  onClick={handlePostAsComment}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors whitespace-nowrap"
                  title="Open comment input on the relevant line, pre-filled with this finding"
                >
                  <ChatText size={12} />
                  Post as comment
                </button>
              )}
              {onSaveAsRule && finding.severity !== 'info' && (
                <button
                  onClick={() => onSaveAsRule(finding.title)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors whitespace-nowrap"
                  title="Save as a review rule for this repo"
                >
                  <BookmarkSimple size={12} />
                  Save as rule
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <RichContent content={finding.body} files={files} onRuleClick={onRuleClick} rules={rules} />
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
