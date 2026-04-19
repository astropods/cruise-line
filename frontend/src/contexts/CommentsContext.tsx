import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useComments } from '../hooks/useComments';
import type { PRComment } from '../api';

interface CommentsContextValue {
  getCommentsForLine: (path: string, line: number) => PRComment[];
  commentCountForFile: (path: string) => number;
  addComment: (path: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => Promise<PRComment>;
  activeCommentLine: { path: string; line: number; side: 'LEFT' | 'RIGHT' } | null;
  setActiveCommentLine: (line: { path: string; line: number; side: 'LEFT' | 'RIGHT' } | null) => void;
  loading: boolean;
  userAvatarUrl: string;
}

const CommentsContext = createContext<CommentsContextValue>({
  getCommentsForLine: () => [],
  commentCountForFile: () => 0,
  addComment: async () => ({} as PRComment),
  activeCommentLine: null,
  setActiveCommentLine: () => {},
  loading: true,
  userAvatarUrl: '',
});

interface CommentsProviderProps {
  children: ReactNode;
  owner: string;
  repo: string;
  pr: number;
  commitId: string;
  userAvatarUrl: string;
}

export function CommentsProvider({ children, owner, repo, pr, commitId, userAvatarUrl }: CommentsProviderProps) {
  const { getCommentsForLine, commentCountForFile, addComment, loading } = useComments({
    owner, repo, pr, commitId,
  });
  const [activeCommentLine, setActiveCommentLine] = useState<{
    path: string; line: number; side: 'LEFT' | 'RIGHT';
  } | null>(null);

  return (
    <CommentsContext.Provider value={{
      getCommentsForLine,
      commentCountForFile,
      addComment,
      activeCommentLine,
      setActiveCommentLine,
      loading,
      userAvatarUrl,
    }}>
      {children}
    </CommentsContext.Provider>
  );
}

export function useCommentsContext() {
  return useContext(CommentsContext);
}
