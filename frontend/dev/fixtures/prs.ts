/**
 * The PRs the mock API starts with, one per UI state worth looking at.
 * Plain data so tests and the mock server can share it.
 */
export interface PrFixture {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  headRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  /** null mimics a PR reviewed before Cruise Line tracked PRs */
  state: 'open' | 'closed' | 'merged' | null;
  /** When the webhook last touched it */
  trackedAgoMinutes: number;
  mergedAgoMinutes?: number;
  review?: {
    ageMinutes: number;
    /** 'mixed' has a high finding; 'clean' approves with only low and info */
    findings: 'mixed' | 'clean';
    /** Reviewed an older commit. `commits` null means GitHub couldn't compare. */
    stale?: { commits: number | null };
  };
  /** A rerun already in flight when the mock starts */
  runningForSeconds?: number;
  /** Every run fails */
  alwaysFail?: boolean;
}

export const PR_FIXTURES: PrFixture[] = [
  {
    owner: 'demo', repo: 'app', number: 101, title: 'Add retry backoff to webhook delivery', author: 'octocat',
    headRef: 'feat/webhook-retries', additions: 64, deletions: 9, changedFiles: 3, state: 'open', trackedAgoMinutes: 90,
    review: { ageMinutes: 42, findings: 'mixed' },
  },
  {
    owner: 'demo', repo: 'app', number: 102, title: 'Migrate settings page to the new form library', author: 'hubot',
    headRef: 'refactor/settings-forms', additions: 412, deletions: 298, changedFiles: 11, state: 'open', trackedAgoMinutes: 20,
  },
  {
    owner: 'demo', repo: 'app', number: 103, title: 'Cache installation tokens across requests', author: 'monalisa',
    headRef: 'perf/token-cache', additions: 48, deletions: 12, changedFiles: 2, state: 'open', trackedAgoMinutes: 200,
    review: { ageMinutes: 180, findings: 'mixed' }, alwaysFail: true,
  },
  {
    owner: 'demo', repo: 'app', number: 104, title: 'Experimental: stream diffs to the viewer', author: 'octocat',
    headRef: 'spike/stream-diffs', additions: 233, deletions: 4, changedFiles: 5, state: 'open', trackedAgoMinutes: 300,
    alwaysFail: true,
  },
  {
    owner: 'demo', repo: 'web', number: 205, title: 'Dark mode color tokens', author: 'hubot',
    headRef: 'feat/dark-tokens', additions: 120, deletions: 66, changedFiles: 7, state: null, trackedAgoMinutes: 0,
    review: { ageMinutes: 60 * 26, findings: 'mixed', stale: { commits: 2 } },
  },
  {
    owner: 'demo', repo: 'web', number: 206, title: 'Rate-limit the generate endpoint', author: 'monalisa',
    headRef: 'feat/generate-rate-limit', additions: 87, deletions: 3, changedFiles: 4, state: 'open', trackedAgoMinutes: 400,
    review: { ageMinutes: 60 * 5, findings: 'mixed' }, runningForSeconds: 60,
  },
  {
    owner: 'demo', repo: 'app', number: 107, title: 'Bump dependencies for October', author: 'dependabot',
    headRef: 'dependabot/npm/october', additions: 31, deletions: 31, changedFiles: 2, state: 'open', trackedAgoMinutes: 5,
  },
  {
    owner: 'demo', repo: 'web', number: 208, title: 'Fix flaky webhook test', author: 'octocat',
    headRef: 'fix/flaky-webhook-test', additions: 14, deletions: 22, changedFiles: 1, state: 'merged',
    trackedAgoMinutes: 60 * 30, mergedAgoMinutes: 60 * 30,
    review: { ageMinutes: 60 * 50, findings: 'clean' },
  },
  {
    owner: 'demo', repo: 'app', number: 109, title: 'WIP: try a different diff renderer', author: 'hubot',
    headRef: 'wip/diff-renderer', additions: 508, deletions: 140, changedFiles: 9, state: 'closed', trackedAgoMinutes: 60 * 72,
  },
  {
    owner: 'demo', repo: 'app', number: 110, title: 'Tighten log redaction for tokens', author: 'monalisa',
    headRef: 'security/log-redaction', additions: 22, deletions: 6, changedFiles: 2, state: 'open', trackedAgoMinutes: 120,
    review: { ageMinutes: 110, findings: 'clean' },
  },
  {
    owner: 'demo', repo: 'web', number: 211, title: 'Rewrite the diff viewer scroll sync', author: 'octocat',
    headRef: 'feat/scroll-sync', additions: 190, deletions: 75, changedFiles: 6, state: 'open', trackedAgoMinutes: 30,
    review: { ageMinutes: 60 * 3, findings: 'mixed', stale: { commits: null } },
  },
];
