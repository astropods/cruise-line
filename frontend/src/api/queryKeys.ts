/** Cache keys for TanStack Query. Invalidate by prefix: ['pr', owner, repo, n] covers its status too. */
export const queryKeys = {
  currentUser: ['me'] as const,
  setupStatus: ['setup-status'] as const,
  prList: ['prs'] as const,
  connectedRepos: ['settings', 'repos'] as const,
  repoSettings: (owner: string, repo: string) => ['settings', 'repos', owner, repo] as const,
  modelSettings: ['settings', 'models'] as const,
  knownUsers: ['settings', 'users'] as const,
  pr: (owner: string, repo: string, number: number) => ['pr', owner, repo, number] as const,
  prProgress: (owner: string, repo: string, number: number) => ['pr', owner, repo, number, 'progress'] as const,
  /** Keyed by head too: a push changes the file */
  prFile: (owner: string, repo: string, number: number, headSha: string, path: string) =>
    ['pr', owner, repo, number, 'file', headSha, path] as const,
  prComments: (owner: string, repo: string, number: number) => ['pr', owner, repo, number, 'comments'] as const,
  repoRules: (owner: string, repo: string) => ['rules', owner, repo] as const,
  chatSession: (owner: string, repo: string, number: number) => ['pr', owner, repo, number, 'chat'] as const,
  cliTokens: ['cli-tokens'] as const,
};
