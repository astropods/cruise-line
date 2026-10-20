import { useEffect, useRef, useState } from 'react';
import { PaperPlaneRight, Plus } from '@phosphor-icons/react';
import { Button, IconButton } from '../../ui';

const MAX_HEIGHT = 160;

interface ChatComposerProps {
  disabled: boolean;
  onSend: (message: string) => void;
  /** Shown once there's a conversation to clear */
  onNewChat?: () => void;
}

/** The message box under the conversation; Enter sends, Shift+Enter adds a line */
export function ChatComposer({ disabled, onSend, onNewChat }: ChatComposerProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus is lost while a reply streams in; give it back when it finishes
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // Grow with the text up to MAX_HEIGHT, then scroll
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [input]);

  function submit() {
    const message = input.trim();
    if (!message || disabled) return;
    onSend(message);
    setInput('');
  }

  return (
    <div className="border-t border-line bg-surface">
      <div className="mx-auto max-w-[800px] px-8 py-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about this PR..."
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none overflow-hidden rounded-lg border border-line bg-canvas px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <IconButton
            label="Send"
            variant="accent"
            size="lg"
            icon={<PaperPlaneRight size={16} weight="bold" />}
            onClick={submit}
            disabled={!input.trim() || disabled}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-fg-muted opacity-40">Enter to send, Shift+Enter for new line</span>
          {onNewChat && (
            <Button variant="ghost" size="sm" icon={<Plus size={12} weight="bold" />} onClick={onNewChat}>
              New chat
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
