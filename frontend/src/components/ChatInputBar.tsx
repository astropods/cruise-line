import { useState, useRef, useEffect } from 'react';

interface ChatInputBarProps {
  onSubmit: (message: string) => void;
}

export function ChatInputBar({ onSubmit }: ChatInputBarProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    if (!input.trim()) return;
    onSubmit(input.trim());
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-[600px] px-4">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] shadow-2xl backdrop-blur-sm">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-secondary)" className="flex-shrink-0 opacity-50">
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
        </svg>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Claude about this PR..."
          className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none"
        />
        {input.trim() && (
          <button
            onClick={handleSubmit}
            className="px-3 py-1 rounded-md bg-[var(--accent)] text-white text-xs hover:bg-[var(--accent-hover)] transition-colors flex-shrink-0"
          >
            Ask
          </button>
        )}
      </div>
    </div>
  );
}
