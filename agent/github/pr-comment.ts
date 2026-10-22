/**
 * The Cruise Line comment on each PR: which state it shows, and its text.
 * Pure, so the webhook, the analyzer, and startup recovery agree.
 */
import { SEVERITIES, countFindings, type SeverityCounts } from '../analysis/summary.js';
import type { Walkthrough } from '../analysis/types.js';

export interface AnalysisSummary {
  verdict: Walkthrough['verdict'];
  verdictRationale: string;
  findingCounts: SeverityCounts;
}

export type CommentState =
  | { status: 'ready' }
  | { status: 'running' }
  | { status: 'complete'; summary: AnalysisSummary }
  | { status: 'stale'; summary: AnalysisSummary }
  | { status: 'failed' };

/** Identifies our comment among the PR's comments */
export const COMMENT_MARKER = '<!-- cruise-line-analysis -->';

export function analysisSummary(data: Pick<Walkthrough, 'verdict' | 'verdictRationale' | 'findings'>): AnalysisSummary {
  return {
    verdict: data.verdict,
    verdictRationale: data.verdictRationale,
    findingCounts: countFindings(data.findings ?? []),
  };
}

/**
 * The comment for a PR's latest review row, given the PR's current head.
 * A finished review of an older commit is stale, even if it just finished.
 */
export function commentStateFor(
  latest: { status: string; head_sha: string; data: Walkthrough | null } | null,
  currentHeadSha: string,
): CommentState {
  if (!latest) return { status: 'ready' };
  switch (latest.status) {
    case 'complete':
      if (!latest.data) return { status: 'ready' };
      return latest.head_sha === currentHeadSha
        ? { status: 'complete', summary: analysisSummary(latest.data) }
        : { status: 'stale', summary: analysisSummary(latest.data) };
    case 'running':
    case 'pending':
      return { status: 'running' };
    case 'failed':
      return { status: 'failed' };
    default:
      return { status: 'ready' };
  }
}

const VERDICT_LABELS: Record<string, { emoji: string; label: string }> = {
  approve: { emoji: '✅', label: 'Looks good to merge' },
  request_changes: { emoji: '🚨', label: 'Changes requested' },
  needs_discussion: { emoji: '💬', label: 'Needs discussion' },
};

// Credentials the sandbox can see, in the shapes they're issued in
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bcl_live_[A-Za-z0-9_-]{16,}/g, // Cruise Line CLI tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

// HTML elements that load a URL when GitHub renders the comment
const LOADING_TAGS = /<\/?(?:img|picture|source|video|audio|iframe|object|embed|svg|image|link|meta|base)\b[^>]*>/gi;

/**
 * Model-written text bound for a PR comment, which on a public repo anyone
 * can read. Images and other loading elements go (GitHub fetches them, so a
 * URL can carry data out without anyone clicking), and anything shaped like
 * a credential is redacted. Other angle brackets stay: `Array<string>` is
 * ordinary review text.
 */
export function sanitizeForComment(text: string): string {
  let out = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(LOADING_TAGS, '');
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]');
  return out.trim();
}

function verdictBody(summary: AnalysisSummary, analysisUrl: string, stale: boolean): string {
  const v = VERDICT_LABELS[summary.verdict] ?? VERDICT_LABELS.needs_discussion;
  const counts = SEVERITIES.filter((s) => summary.findingCounts[s] > 0).map((s) => `${summary.findingCounts[s]} ${s}`);
  const total = SEVERITIES.reduce((sum, s) => sum + summary.findingCounts[s], 0);
  const staleNote = stale
    ? `> ⚠️ **Stale** — New commits have been pushed since this analysis was run. Click below to re-analyze.\n\n`
    : '';

  return `${COMMENT_MARKER}
## ${v.emoji} Cruise Line — ${v.label}

${staleNote}${sanitizeForComment(summary.verdictRationale)}

${total > 0 ? `**${total} finding${total === 1 ? '' : 's'}:** ${counts.join(' · ')}` : 'No findings.'}

[→ ${stale ? 'Re-run analysis' : 'View full analysis'}](${analysisUrl})`;
}

export function buildCommentBody(state: CommentState, analysisUrl: string): string {
  switch (state.status) {
    case 'running':
      return `${COMMENT_MARKER}
## ⚓ Cruise Line

Analysis in progress…

[→ View progress](${analysisUrl})`;

    case 'complete':
      return verdictBody(state.summary, analysisUrl, false);

    case 'stale':
      return verdictBody(state.summary, analysisUrl, true);

    case 'failed':
      return `${COMMENT_MARKER}
## ⚠️ Cruise Line — Analysis failed

Something went wrong during the analysis. Click below to retry.

[→ View details](${analysisUrl})`;

    case 'ready':
    default:
      return `${COMMENT_MARKER}
## ⚓ Cruise Line

[→ Click to start Cruise Line analysis](${analysisUrl})`;
  }
}
