import Markdown from 'react-markdown';
import type { PRComment } from '../api';

interface InlineCommentProps {
  comment: PRComment;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function InlineComment({ comment }: InlineCommentProps) {
  return (
    <div className="flex gap-2.5 px-4 py-3 bg-[var(--bg-tertiary)] border-y border-[var(--border)]">
      <img
        src={comment.user.avatarUrl}
        alt={comment.user.login}
        className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--text-bright)]">
            {comment.user.login}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {timeAgo(comment.createdAt)}
          </span>
        </div>
        <div className="cruise-markdown text-sm">
          <Markdown>{comment.body}</Markdown>
        </div>
      </div>
    </div>
  );
}
