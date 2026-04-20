import { CheckCircle, XCircle, ChatCircle, type Icon } from '@phosphor-icons/react';
import type { Verdict } from '../api';
import { Md } from './Md';

interface VerdictBannerProps {
  verdict: Verdict;
  rationale: string;
  findingCounts: { critical: number; high: number; medium: number; low: number; info: number };
}

const verdictConfig: Record<Verdict, { label: string; icon: Icon; border: string; bg: string; accent: string }> = {
  approve: {
    label: 'Looks good to merge',
    icon: CheckCircle,
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
    accent: 'text-green-400',
  },
  request_changes: {
    label: 'Changes requested',
    icon: XCircle,
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    accent: 'text-red-400',
  },
  needs_discussion: {
    label: 'Needs discussion',
    icon: ChatCircle,
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    accent: 'text-yellow-400',
  },
};

export function VerdictBanner({ verdict, rationale, findingCounts }: VerdictBannerProps) {
  const v = verdictConfig[verdict] ?? verdictConfig.needs_discussion;
  const Icon = v.icon;

  const countParts: string[] = [];
  if (findingCounts.critical > 0) countParts.push(`${findingCounts.critical} critical`);
  if (findingCounts.high > 0) countParts.push(`${findingCounts.high} high`);
  if (findingCounts.medium > 0) countParts.push(`${findingCounts.medium} medium`);
  if (findingCounts.low > 0) countParts.push(`${findingCounts.low} low`);
  if (findingCounts.info > 0) countParts.push(`${findingCounts.info} info`);

  return (
    <div className={`rounded-lg border ${v.border} ${v.bg} p-5 mb-12`}>
      <div className="flex items-center gap-2.5 mb-3">
        <Icon size={20} weight="fill" className={v.accent} />
        <span className={`text-lg font-semibold ${v.accent}`}>{v.label}</span>
      </div>
      <div className="cruise-markdown text-sm text-[var(--text-secondary)] mb-3">
        <Md>{rationale}</Md>
      </div>
      {countParts.length > 0 && (
        <div className="text-xs text-[var(--text-secondary)]/70">
          {countParts.join(' \u00B7 ')}
        </div>
      )}
    </div>
  );
}
