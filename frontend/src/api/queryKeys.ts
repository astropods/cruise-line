/** Cache keys for TanStack Query. Invalidate by prefix: ['pr', owner, repo, n] covers its status too. */
export const queryKeys = {
  currentUser: ['me'] as const,
  setupStatus: ['setup-status'] as const,
  prList: ['prs'] as const,
  pr: (owner: string, repo: string, number: number) => ['pr', owner, repo, number] as const,
  prProgress: (owner: string, repo: string, number: number) => ['pr', owner, repo, number, 'progress'] as const,
};
