import { Md } from '../../ui';
import { useCommentsContext } from './CommentsContext';
import { CommentInput } from './CommentInput';
import type { PRComment } from '../../api';
import { formatAgoPhrase } from '../../lib/time';

interface InlineCommentProps {
  comment: PRComment;
  /** Replies to this comment */
  replies?: PRComment[];
}

function CommentBubble({ comment, isReply }: { comment: PRComment; isReply?: boolean }) {
  const { setReplyingTo } = useCommentsContext();

  return (
    <div className={`flex gap-2.5 px-4 py-3 ${isReply ? 'pl-10' : ''}`}>
      <img
        src={comment.user.avatarUrl}
        alt={comment.user.login}
        className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-fg-strong">
            {comment.user.login}
          </span>
          <span className="text-xs text-fg-muted">
            {formatAgoPhrase(comment.createdAt)}
          </span>
          <a
            href={comment.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-fg-muted hover:text-accent transition-colors ml-auto"
            title="View on GitHub"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5H4.56l6.22 6.22a.75.75 0 1 1-1.06 1.06L3.5 4.56v2.69a.75.75 0 0 1-1.5 0v-3.5A1.75 1.75 0 0 1 3.75 2Zm6.5 0h2A1.75 1.75 0 0 1 14 3.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-2a.75.75 0 0 1 1.5 0v2c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25h-2a.75.75 0 0 1 0-1.5Z"/>
            </svg>
          </a>
        </div>
        <div className="cruise-markdown text-sm">
          <Md>{comment.body}</Md>
        </div>
        {!isReply && (
          <button
            onClick={() => setReplyingTo(comment.id)}
            className="mt-1.5 text-xs text-fg-muted hover:text-accent transition-colors"
          >
            Reply
          </button>
        )}
      </div>
    </div>
  );
}

export function InlineComment({ comment, replies }: InlineCommentProps) {
  const { replyingTo, setReplyingTo, replyTo, userAvatarUrl } = useCommentsContext();
  const isReplying = replyingTo === comment.id;

  return (
    <div className="bg-raised border-y border-line">
      <CommentBubble comment={comment} />
      {replies?.map((reply) => (
        <CommentBubble key={reply.id} comment={reply} isReply />
      ))}
      {isReplying && (
        <div className="pl-10">
          <CommentInput
            userAvatarUrl={userAvatarUrl}
            onSubmit={async (body) => {
              await replyTo(comment.id, body);
              setReplyingTo(null);
            }}
            onCancel={() => setReplyingTo(null)}
          />
        </div>
      )}
    </div>
  );
}
