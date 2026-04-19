import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchComments, postComment, type PRComment } from '../api';

interface UseCommentsOptions {
  owner: string;
  repo: string;
  pr: number;
  commitId: string;
}

export function useComments({ owner, repo, pr, commitId }: UseCommentsOptions) {
  const [comments, setComments] = useState<PRComment[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch existing comments on mount
  useEffect(() => {
    fetchComments(owner, repo, pr)
      .then((res) => setComments(res.comments))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner, repo, pr]);

  // Group comments by path:line for easy lookup
  const commentsByLine = useMemo(() => {
    const map = new Map<string, PRComment[]>();
    for (const c of comments) {
      const key = `${c.path}:${c.line}`;
      const existing = map.get(key) ?? [];
      existing.push(c);
      map.set(key, existing);
    }
    return map;
  }, [comments]);

  const getCommentsForLine = useCallback(
    (path: string, line: number): PRComment[] => {
      return commentsByLine.get(`${path}:${line}`) ?? [];
    },
    [commentsByLine],
  );

  const commentCountForFile = useCallback(
    (path: string): number => {
      return comments.filter((c) => c.path === path).length;
    },
    [comments],
  );

  const addComment = useCallback(
    async (path: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => {
      const res = await postComment(owner, repo, pr, {
        body,
        path,
        line,
        side,
        commitId,
      });
      // Optimistically add to local state
      setComments((prev) => [...prev, res.comment]);
      return res.comment;
    },
    [owner, repo, pr, commitId],
  );

  return {
    comments,
    loading,
    getCommentsForLine,
    commentCountForFile,
    addComment,
  };
}
