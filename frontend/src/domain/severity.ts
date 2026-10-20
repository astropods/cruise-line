import type { Finding, Severity } from '../api/types';
import type { Tone } from './tone';

/** Most to least severe */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Note',
};

const TONES: Record<Severity, Tone> = {
  critical: 'danger',
  high: 'severe',
  medium: 'warning',
  low: 'accent',
  info: 'neutral',
};

export type SeverityCounts = Record<Severity, number>;

export function severityLabel(severity: Severity): string {
  return LABELS[severity];
}

export function severityTone(severity: Severity): Tone {
  return TONES[severity];
}

/** Critical and high findings block a merge */
export function isBlocking(severity: Severity): boolean {
  return severity === 'critical' || severity === 'high';
}

export function countBySeverity(findings: readonly Pick<Finding, 'severity'>[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

export function blockingCount(counts: Partial<SeverityCounts>): number {
  return (counts.critical ?? 0) + (counts.high ?? 0);
}

/** "1 high · 2 medium · 1 note", most severe first, zeros left out */
export function summarizeCounts(counts: Partial<SeverityCounts>): string {
  return SEVERITY_ORDER
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${counts[s]} ${LABELS[s].toLowerCase()}`)
    .join(' · ');
}

/** Most severe first; findings of equal severity keep their order */
export function sortBySeverity<T extends Pick<Finding, 'severity'>>(findings: readonly T[]): T[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}
