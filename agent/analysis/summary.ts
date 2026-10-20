import type { Severity, Walkthrough } from './types.js';

export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export type SeverityCounts = Record<Severity, number>;

/** What the inbox and the PR comment need from a review, stored next to the full data */
export interface ReviewSummary {
  verdict: Walkthrough['verdict'];
  title: string;
  author: string;
  severityCounts: SeverityCounts;
}

/** Every severity, zero when a review had none of it */
export function severityCounts(raw: Partial<Record<string, number>> | null | undefined): SeverityCounts {
  return Object.fromEntries(SEVERITIES.map((s) => [s, Number(raw?.[s] ?? 0)])) as SeverityCounts;
}

export function countFindings(findings: ReadonlyArray<{ severity: string }>): SeverityCounts {
  const counts = severityCounts(null);
  for (const f of findings) if (f.severity in counts) counts[f.severity as Severity]++;
  return counts;
}

export function summarizeReview(data: Walkthrough): ReviewSummary {
  return {
    verdict: data.verdict,
    title: data.pr?.title ?? '',
    author: data.pr?.author ?? '',
    severityCounts: countFindings(data.findings ?? []),
  };
}
