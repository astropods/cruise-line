import { useState, useRef, useEffect } from 'react';

interface CommentInputProps {
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  userAvatarUrl?: string;
  /** Pre-fill the textarea with this text */
  prefill?: string;
}

export function CommentInput({ onSubmit, onCancel, userAvatarUrl, prefill }: CommentInputProps) {
  const [body, setBody] = useState(prefill ?? '');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      // Move cursor to end when pre-filled
      if (prefill) {
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [body]);

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(body.trim());
      setBody('');
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <div className="flex gap-2.5 px-4 py-3 bg-[var(--bg-tertiary)] border-y border-[var(--border)]">
      {userAvatarUrl && (
        <img
          src={userAvatarUrl}
          alt="You"
          className="w-6 h-6 rounded-full flex-shrink-0 mt-1"
        />
      )}
      <div className="flex-1 min-w-0">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Leave a comment... (Ctrl+Enter to submit)"
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none focus:border-[var(--accent)] font-[var(--font-sans)]"
        />
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
            className="px-3 py-1 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Posting...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
