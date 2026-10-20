import { useState } from 'react';
import { ChatCircle } from '@phosphor-icons/react';
import { Button } from '../../ui';

/** The floating "ask a question" box on the Analysis view; sending opens Chat */
export function ChatInputBar({ onSubmit }: { onSubmit: (message: string) => void }) {
  const [input, setInput] = useState('');

  function submit() {
    const message = input.trim();
    if (!message) return;
    onSubmit(message);
    setInput('');
  }

  return (
    <div className="absolute bottom-6 left-1/2 z-40 w-full max-w-[600px] -translate-x-1/2 px-4">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-2xl backdrop-blur-sm">
        <ChatCircle size={16} className="flex-shrink-0 text-fg-muted opacity-50" aria-hidden="true" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask Claude about this PR..."
          aria-label="Ask Claude about this PR"
          className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
        {input.trim() && (
          <Button variant="accent" size="sm" onClick={submit}>Ask</Button>
        )}
      </div>
    </div>
  );
}
