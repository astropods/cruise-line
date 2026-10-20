export interface PrMetadata {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  installationId: number;
  /** PR description body (markdown). May be empty. */
  body?: string;
  authorAvatarUrl: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  state: 'open' | 'closed' | 'merged';
  mergedAt: string | null;
  closedAt: string | null;
}
