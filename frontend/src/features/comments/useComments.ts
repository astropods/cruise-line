import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchComments, postComment, queryKeys, replyToComment, type PRComment } from '../../api';

interface UseCommentsOptions {
  owner: string;
  repo: string;
  pr: number;
  commitId: string;
}

/** The PR's inline review comments, grouped by line, plus posting and replying */
export function useComments({ owner, repo, pr, commitId }: UseCommentsOptions) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.prComments(owner, repo, pr),
    queryFn: () => fetchComments(owner, repo, pr).then((r) => r.comments),
  });

  // Group by path, side, and line: deleted line 10 and new line 10 are different lines
  const commentsByLine = useMemo(() => {
    const map = new Map<string, PRComment[]>();
    for (const c of query.data ?? []) {
      const lineKey = `${c.path}:${c.side}:${c.line}`;
      map.set(lineKey, [...(map.get(lineKey) ?? []), c]);
    }
    return map;
  }, [query.data]);

  const getCommentsForLine = useCallback(
    (path: string, line: number, side: 'LEFT' | 'RIGHT'): PRComment[] => commentsByLine.get(`${path}:${side}:${line}`) ?? [],
    [commentsByLine],
  );

  // GitHub returns the new comment; show it without refetching the thread
  const append = useCallback(
    (comment: PRComment) =>
      queryClient.setQueryData<PRComment[]>(queryKeys.prComments(owner, repo, pr), (prev) => [...(prev ?? []), comment]),
    [queryClient, owner, repo, pr],
  );

  const addComment = useCallback(
    async (path: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => {
      const res = await postComment(owner, repo, pr, { body, path, line, side, commitId });
      append(res.comment);
      return res.comment;
    },
    [owner, repo, pr, commitId, append],
  );

  const replyTo = useCallback(
    async (commentId: number, body: string) => {
      const res = await replyToComment(owner, repo, pr, commentId, body);
      append(res.comment);
      return res.comment;
    },
    [owner, repo, pr, append],
  );

  return {
    fetchError: query.isError ? query.error.message : null,
    getCommentsForLine,
    addComment,
    replyTo,
  };
}
