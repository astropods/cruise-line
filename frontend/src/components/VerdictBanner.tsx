import type { Verdict } from '../api';
import { Md } from './Md';

interface VerdictBannerProps {
  verdict: Verdict;
  rationale: string;
  findingCounts: { critical: number; high: number; medium: number; low: number; info: number };
}

const verdictConfig: Record<Verdict, { label: string; icon: string; border: string; bg: string; accent: string }> = {
  approve: {
    label: 'Looks good to merge',
    icon: 'M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z',
    border: 'border-green-500/30',
    bg: 'bg-green-500/5',
    accent: 'text-green-400',
  },
  request_changes: {
    label: 'Changes requested',
    icon: 'M5.75 1a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-4.5Zm.75 3V2.5h3V4h-3Zm-2.874-.467a.75.75 0 0 0-.752-1.298A7.502 7.502 0 0 0 .5 8c0 4.136 3.364 7.5 7.5 7.5s7.5-3.364 7.5-7.5a7.502 7.502 0 0 0-2.374-5.765.75.75 0 0 0-.752 1.298A6.002 6.002 0 0 1 14 8 6 6 0 1 1 3.626 3.533Z',
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    accent: 'text-red-400',
  },
  needs_discussion: {
    label: 'Needs discussion',
    icon: 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    accent: 'text-yellow-400',
  },
};

export function VerdictBanner({ verdict, rationale, findingCounts }: VerdictBannerProps) {
  const v = verdictConfig[verdict] ?? verdictConfig.needs_discussion;

  const countParts: string[] = [];
  if (findingCounts.critical > 0) countParts.push(`${findingCounts.critical} critical`);
  if (findingCounts.high > 0) countParts.push(`${findingCounts.high} high`);
  if (findingCounts.medium > 0) countParts.push(`${findingCounts.medium} medium`);
  if (findingCounts.low > 0) countParts.push(`${findingCounts.low} low`);
  if (findingCounts.info > 0) countParts.push(`${findingCounts.info} info`);

  return (
    <div className={`rounded-lg border ${v.border} ${v.bg} p-5 mb-12`}>
      <div className="flex items-center gap-2.5 mb-3">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" className={v.accent}>
          <path d={v.icon} />
        </svg>
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
