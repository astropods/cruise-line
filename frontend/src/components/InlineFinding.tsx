import { useState, useCallback } from 'react';
import {
  WarningOctagon, WarningCircle, Warning, ArrowDown, Lightbulb,
  Bug, ShieldCheck, Wrench, Lightning, PaintBrush,
  Copy, Check,
  type Icon,
} from '@phosphor-icons/react';
import { RichContent } from './RichContent';
import type { FileContent, Severity, FindingCategory } from '../api';

interface InlineFindingProps {
  title: string;
  severity: string;
  category: string;
  body: string;
  fixPrompt?: string;
  files: Record<string, FileContent>;
}

const severityConfig: Record<string, { label: string; icon: Icon; color: string; bg: string; border: string }> = {
  critical: { label: 'Critical', icon: WarningOctagon, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  high: { label: 'High', icon: WarningCircle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  medium: { label: 'Medium', icon: Warning, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  low: { label: 'Low', icon: ArrowDown, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  info: { label: 'Info', icon: Lightbulb, color: 'text-[var(--text-secondary)]', bg: 'bg-[var(--text-secondary)]/5', border: 'border-[var(--text-secondary)]/20' },
};

const categoryConfig: Record<string, { label: string; icon: Icon }> = {
  correctness: { label: 'Correctness', icon: Bug },
  security: { label: 'Security', icon: ShieldCheck },
  maintainability: { label: 'Maintainability', icon: Wrench },
  performance: { label: 'Performance', icon: Lightning },
  style: { label: 'Style', icon: PaintBrush },
};

export function InlineFinding({ title, severity, category, body, fixPrompt, files }: InlineFindingProps) {
  const sev = severityConfig[severity] ?? severityConfig.info;
  const cat = categoryConfig[category] ?? categoryConfig.correctness;
  const [copied, setCopied] = useState(false);

  const SevIcon = sev.icon;
  const CatIcon = cat.icon;

  const handleCopyFixPrompt = useCallback(() => {
    if (!fixPrompt) return;
    navigator.clipboard.writeText(fixPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [fixPrompt]);

  return (
    <div className="my-4 rounded-lg border border-[var(--border)] overflow-hidden">
      {/* Finding header */}
      <div className="px-4 py-3 bg-[var(--bg-tertiary)]/50 border-b border-[var(--border)]">
        <div className="font-semibold text-sm text-[var(--text-bright)] mb-2">
          {title}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${sev.color} ${sev.bg} ${sev.border}`}>
            <SevIcon size={12} weight="bold" />
            {sev.label}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">
            <CatIcon size={12} />
            {cat.label}
          </span>
          {fixPrompt && (
            <button
              onClick={handleCopyFixPrompt}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors ml-auto"
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
        </div>
      </div>
      {/* Finding body — recursively parsed for nested directives */}
      <div className="px-4 py-3">
        <RichContent content={body} files={files} className="cruise-chat-markdown" />
      </div>
    </div>
  );
}
