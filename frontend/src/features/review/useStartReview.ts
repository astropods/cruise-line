import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateWalkthrough,
  queryKeys,
  type PrSummary,
  type WalkthroughResponse,
} from '../../api';

interface StartReviewInput {
  owner: string;
  repo: string;
  number: number;
  /** Rerun even though a review exists */
  force?: boolean;
}

/**
 * Starts or reruns a review. The PR shows as reviewing everywhere at once;
 * a failed start rolls that back.
 */
export function useStartReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ owner, repo, number, force }: StartReviewInput) =>
      generateWalkthrough(owner, repo, number, force),

    onMutate: async ({ owner, repo, number }) => {
      const prKey = queryKeys.pr(owner, repo, number);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.prList }),
        queryClient.cancelQueries({ queryKey: prKey, exact: true }),
      ]);
      // The last run's progress (and its "complete") isn't this run's
      queryClient.removeQueries({ queryKey: queryKeys.prProgress(owner, repo, number), exact: true });

      const previousList = queryClient.getQueryData<{ prs: PrSummary[] }>(queryKeys.prList);
      const previousPr = queryClient.getQueryData<WalkthroughResponse>(prKey);
      const now = new Date().toISOString();

      queryClient.setQueryData<{ prs: PrSummary[]; githubUrl: string }>(queryKeys.prList, (data) =>
        data && {
          ...data,
          prs: data.prs.map((p) =>
            p.owner === owner && p.repo === repo && p.number === number ? { ...p, status: 'pending' } : p,
          ),
        },
      );
      queryClient.setQueryData<WalkthroughResponse>(prKey, (data) =>
        data && {
          ...data,
          walkthrough: {
            id: data.walkthrough?.id ?? -1,
            headSha: data.currentHeadSha ?? data.walkthrough?.headSha ?? '',
            data: null,
            error: null,
            createdAt: data.walkthrough?.createdAt ?? now,
            status: 'pending',
            updatedAt: now,
          },
        },
      );

      return { previousList, previousPr, prKey };
    },

    onError: (_err, _input, context) => {
      if (!context) return;
      queryClient.setQueryData(queryKeys.prList, context.previousList);
      queryClient.setQueryData(context.prKey, context.previousPr);
    },

    onSettled: (_data, _err, { owner, repo, number }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prList });
      queryClient.invalidateQueries({ queryKey: queryKeys.pr(owner, repo, number) });
    },
  });
}
