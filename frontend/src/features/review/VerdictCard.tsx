import type { Verdict } from '../../api';
import { Md } from '../../components/Md';
import { verdictView } from '../../domain/prStatus';
import { summarizeCounts, type SeverityCounts } from '../../domain/severity';
import { cx } from '../../lib/cx';
import { StatusIcon, TONE_CLASSES } from '../../ui';

interface VerdictCardProps {
  verdict: Verdict;
  rationale: string;
  counts: SeverityCounts;
}

export function VerdictCard({ verdict, rationale, counts }: VerdictCardProps) {
  const view = verdictView(verdict);
  const tone = TONE_CLASSES[view.tone];
  const summary = summarizeCounts(counts);

  return (
    <section aria-label="Verdict" className={cx('flex flex-col gap-2.5 rounded-lg border p-5', tone.border, tone.soft)}>
      <div className="flex items-center gap-2">
        <StatusIcon icon={view.icon} tone={view.tone} size={18} />
        <h2 className={cx('text-base font-semibold', tone.fg)}>{verdict === 'approve' ? 'Looks good to merge' : view.label}</h2>
      </div>
      <div className="cruise-markdown text-sm text-fg">
        <Md>{rationale}</Md>
      </div>
      {summary && <p className="text-xs text-fg-muted">{summary}</p>}
    </section>
  );
}
