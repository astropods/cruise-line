import { createContext, useContext, useState, type ReactNode } from 'react';
import { useComments } from '../hooks/useComments';
import type { PRComment } from '../api';

interface CommentsContextValue {
  getCommentsForLine: (path: string, line: number) => PRComment[];
  commentCountForFile: (path: string) => number;
  addComment: (path: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => Promise<PRComment>;
  replyTo: (commentId: number, body: string) => Promise<PRComment>;
  activeCommentLine: { path: string; line: number; side: 'LEFT' | 'RIGHT' } | null;
  /** When set, shows a reply input under a specific comment */
  replyingTo: number | null;
  setActiveCommentLine: (line: { path: string; line: number; side: 'LEFT' | 'RIGHT' } | null) => void;
  setReplyingTo: (commentId: number | null) => void;
  loading: boolean;
  userAvatarUrl: string;
}

const CommentsContext = createContext<CommentsContextValue>({
  getCommentsForLine: () => [],
  commentCountForFile: () => 0,
  addComment: async () => ({} as PRComment),
  replyTo: async () => ({} as PRComment),
  activeCommentLine: null,
  replyingTo: null,
  setActiveCommentLine: () => {},
  setReplyingTo: () => {},
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
  const { getCommentsForLine, commentCountForFile, addComment, replyTo, loading } = useComments({
    owner, repo, pr, commitId,
  });
  const [activeCommentLine, setActiveCommentLine] = useState<{
    path: string; line: number; side: 'LEFT' | 'RIGHT';
  } | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  return (
    <CommentsContext.Provider value={{
      getCommentsForLine,
      commentCountForFile,
      addComment,
      replyTo,
      activeCommentLine,
      replyingTo,
      setActiveCommentLine,
      setReplyingTo,
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
