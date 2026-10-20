import { apiFetch } from './client';
import type { FileContent, Severity, Verdict, Walkthrough } from './types';

/** Status of a review run; 'none' when one was never triggered */
export type RunStatus = 'none' | 'pending' | 'running' | 'complete' | 'failed';
export type PrState = 'open' | 'closed' | 'merged';

/** Live PR details from GitHub, shown in the PR bar */
export interface PrDetails {
  title: string;
  author: string;
  authorAvatarUrl: string | null;
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  state: PrState;
  mergedAt: string | null;
}

export interface WalkthroughResponse {
  walkthrough: {
    id: number;
    status: 'pending' | 'running' | 'complete' | 'failed';
    headSha: string;
    error: string | null;
    data: Walkthrough | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  /** Most recent review with content — may be older than `walkthrough` while a rerun is in flight */
  latestReview: {
    id: number;
    headSha: string;
    data: Walkthrough;
    updatedAt: string;
  } | null;
  /** Live PR metadata from GitHub; null if it couldn't be fetched */
  pr: PrDetails | null;
  currentHeadSha: string | null;
  /** Commits since the reviewed head; null when not stale or GitHub couldn't compare */
  commitsSinceReview: number | null;
  githubUrl: string;
}

export interface PrSummary {
  owner: string;
  repo: string;
  number: number;
  status: RunStatus;
  /** Null for PRs reviewed before Cruise Line started tracking PRs */
  prState: PrState | null;
  headSha: string;
  updatedAt: string;
  /** Null only for an untracked PR whose first review hasn't landed */
  title: string | null;
  author: string | null;
  verdict: Verdict | null;
  findingCount: number | null;
  /** Findings in the latest review by severity; null when there's no review */
  severityCounts: Record<Severity, number> | null;
  /** The fields below are null until the PR's details are recorded */
  authorAvatarUrl: string | null;
  headRef: string | null;
  baseRef: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  mergedAt: string | null;
}

export interface ProgressEntry {
  timestamp: number;
  type: 'status' | 'tool' | 'message';
  text: string;
}

export interface StatusResponse {
  walkthroughId?: number;
  status: string;
  headSha?: string;
  error?: string;
  progress?: ProgressEntry[];
}

export function fetchWalkthrough(owner: string, repo: string, pr: number) {
  return apiFetch<WalkthroughResponse>(`/api/walkthroughs/${owner}/${repo}/${pr}`);
}

export function fetchPrSummaries() {
  return apiFetch<{ prs: PrSummary[]; githubUrl: string }>('/api/walkthroughs');
}

export function fetchFileContent(owner: string, repo: string, pr: number, path: string) {
  return apiFetch<FileContent>(`/api/files/${owner}/${repo}/${pr}/content?path=${encodeURIComponent(path)}`);
}

export function generateWalkthrough(owner: string, repo: string, pr: number, force = false) {
  const query = force ? '?force=true' : '';
  return apiFetch<{ walkthroughId: number; status: string }>(
    `/api/walkthroughs/${owner}/${repo}/${pr}/generate${query}`,
    { method: 'POST' },
  );
}

export function fetchStatus(owner: string, repo: string, pr: number) {
  return apiFetch<StatusResponse>(`/api/walkthroughs/${owner}/${repo}/${pr}/status`);
}
