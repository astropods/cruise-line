import { apiFetch, jsonBody } from './client';

export interface PRComment {
  id: number;
  body: string;
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  user: { login: string; avatarUrl: string };
  createdAt: string;
  inReplyToId: number | null;
  htmlUrl: string;
}

export function fetchComments(owner: string, repo: string, pr: number) {
  return apiFetch<{ comments: PRComment[] }>(`/api/comments/${owner}/${repo}/${pr}`);
}

export function postComment(
  owner: string,
  repo: string,
  pr: number,
  comment: { body: string; path: string; line: number; side: 'LEFT' | 'RIGHT'; commitId: string },
) {
  return apiFetch<{ comment: PRComment }>(`/api/comments/${owner}/${repo}/${pr}`, jsonBody('POST', comment));
}

export function replyToComment(owner: string, repo: string, pr: number, commentId: number, body: string) {
  return apiFetch<{ comment: PRComment }>(
    `/api/comments/${owner}/${repo}/${pr}/${commentId}/reply`,
    jsonBody('POST', { body }),
  );
}
