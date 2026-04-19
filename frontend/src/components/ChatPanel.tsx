import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { useChat, type ChatMessage } from '../hooks/useChat';

interface ChatPanelProps {
  owner: string;
  repo: string;
  prNumber: number;
  /** Called when user wants to switch back to walkthrough */
  onSwitchToWalkthrough: () => void;
  /** Initial message to send (from the floating input bar) */
  initialMessage?: string;
}

export function ChatPanel({ owner, repo, prNumber, onSwitchToWalkthrough, initialMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);

  const {
    messages,
    isStreaming,
    streamingText,
    toolActivity,
    sendMessage,
    resetSession,
  } = useChat({ owner, repo, pr: prNumber });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Send initial message once
  useEffect(() => {
    if (initialMessage && !sentInitial.current) {
      sentInitial.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage, sendMessage]);

  // Focus input
  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  function handleSubmit() {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-[800px] mx-auto space-y-3">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center text-[var(--text-secondary)] text-sm py-12">
              Ask a question about this pull request. Claude can read the codebase to answer.
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {/* Streaming response */}
          {isStreaming && (
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs text-[var(--accent)]">C</span>
              </div>
              <div className="flex-1 min-w-0">
                {streamingText ? (
                  <div className="cruise-markdown text-sm">
                    <Markdown>{streamingText}</Markdown>
                    <span className="inline-block w-1.5 h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle" />
                  </div>
                ) : toolActivity ? (
                  <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
                    <span className="text-yellow-400">&#9656;</span>
                    <span>{toolActivity}</span>
                  </div>
                ) : (
                  <div className="flex gap-1 py-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-[800px] mx-auto px-8 py-4">
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this PR..."
              rows={1}
              disabled={isStreaming}
              className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isStreaming}
              className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.989 8 .064 2.68a1.342 1.342 0 0 1 1.85-1.462l13.402 5.744a1.13 1.13 0 0 1 0 2.076L1.913 14.782a1.343 1.343 0 0 1-1.85-1.463L.99 8Zm.603-5.428L2.38 7.25h4.87a.75.75 0 0 1 0 1.5H2.38l-.788 4.678L13.929 8Z"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-[var(--text-secondary)] opacity-50">Ctrl+Enter to send</span>
            <button
              onClick={resetSession}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
            >
              Reset conversation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-4 py-2.5 rounded-lg bg-[var(--accent)]/15 text-sm text-[var(--text-primary)]">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    return (
      <div className="flex items-center gap-2 py-0.5 pl-9 text-xs font-mono text-[var(--text-secondary)] opacity-50">
        <span className="text-yellow-400">&#9656;</span>
        <span className="truncate">{message.content}</span>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 flex items-center justify-center flex-shrink-0 mt-1">
        <span className="text-xs text-[var(--accent)]">C</span>
      </div>
      <div className="flex-1 min-w-0 cruise-markdown text-sm">
        <Markdown>{message.content}</Markdown>
      </div>
    </div>
  );
}
