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
}
