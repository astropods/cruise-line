import { useState, useRef, useEffect, useCallback } from 'react';
import {
  PaperPlaneRight, Plus, GitPullRequest, ShieldCheck, TreeStructure, Lightning, Anchor,
  FileText, MagnifyingGlass, FolderOpen, Terminal, PencilSimple, FileArrowUp, Archive, Clock,
  type Icon,
} from '@phosphor-icons/react';
import { RichContent } from './RichContent';
import { useChat, type ChatEntry, type ArchiveSummary } from '../hooks/useChat';
import type { FileContent } from '../api';

interface ChatPanelProps {
  owner: string;
  repo: string;
  prNumber: number;
  files: Record<string, FileContent>;
  onSwitchToWalkthrough: () => void;
  initialMessage?: string;
  onRuleClick?: (ruleNumber: number) => void;
  rules?: Array<{ ruleNumber: number; rule: string }>;
}

const SAMPLE_PROMPTS = [
  { icon: GitPullRequest, label: 'Summarize this PR in plain English' },
  { icon: ShieldCheck, label: 'Are there any security concerns?' },
  { icon: TreeStructure, label: 'How does this change affect the existing architecture?' },
  { icon: Lightning, label: 'What are the performance implications?' },
];

export function ChatPanel({ owner, repo, prNumber, files, onSwitchToWalkthrough, initialMessage, onRuleClick, rules }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);

  const {
    entries,
    isStreaming,
    historyLoaded,
    isArchived,
    archives,
    activeArchiveId,
    sendMessage,
    resetSession,
    loadArchive,
  } = useChat({ owner, repo, pr: prNumber });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  useEffect(() => {
    if (initialMessage && historyLoaded && !sentInitial.current) {
      sentInitial.current = true;
      sendMessage(initialMessage);
    }
  }, [initialMessage, historyLoaded, sendMessage]);

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  }, [input, isStreaming, sendMessage]);

  const handleSamplePrompt = useCallback((prompt: string) => {
    if (isStreaming) return;
    sendMessage(prompt);
  }, [isStreaming, sendMessage]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      const maxHeight = 160;
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [input]);

  const isEmpty = historyLoaded && entries.length === 0 && !isStreaming && !isArchived;

  return (
    <div className="flex flex-col h-full">
      {/* Archived banner */}
      {isArchived && (
        <ArchivedBanner
          archives={archives}
          activeArchiveId={activeArchiveId}
          onSelectArchive={loadArchive}
        />
      )}

      <div className={`flex-1 overflow-auto px-8 py-6 ${isEmpty ? 'flex items-center justify-center' : ''}`}>
        {isEmpty ? (
          <EmptyState onPromptClick={handleSamplePrompt} />
        ) : (
        <div className="max-w-[800px] mx-auto space-y-1">
          {!historyLoaded && (
            <div className="text-center text-[var(--text-secondary)] text-sm py-12">
              Loading conversation...
            </div>
          )}

          {entries.map((entry, i) => (
            <EntryView key={i} entry={entry} files={files} onRuleClick={onRuleClick} rules={rules} />
          ))}

          {/* Thinking indicator */}
          {isStreaming && (entries.length === 0 || entries[entries.length - 1]?.type === 'user') && (
            <div className="flex gap-1 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
        )}
      </div>

      {/* Input bar — hidden when viewing archived history */}
      {isArchived ? (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="max-w-[800px] mx-auto px-8 py-4 text-center text-sm text-[var(--text-secondary)]">
            This is an archived conversation from a closed PR. Chat is read-only.
          </div>
        </div>
      ) : (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="max-w-[800px] mx-auto px-8 py-4">
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this PR..."
                rows={1}
                disabled={isStreaming}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 overflow-hidden"
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isStreaming}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <PaperPlaneRight size={16} weight="bold" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[var(--text-secondary)] opacity-40">
                Enter to send, Shift+Enter for new line
              </span>
              {entries.length > 0 && (
                <button
                  onClick={resetSession}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                >
                  <Plus size={12} weight="bold" />
                  New chat
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchivedBanner({
  archives,
  activeArchiveId,
  onSelectArchive,
}: {
  archives: ArchiveSummary[];
  activeArchiveId: number | null;
  onSelectArchive: (id: number) => void;
}) {
  return (
    <div className="border-b border-[var(--border)] bg-amber-500/5 px-8 py-3">
      <div className="max-w-[800px] mx-auto flex items-center gap-3">
        <Archive size={16} className="text-amber-500 flex-shrink-0" />
        <span className="text-sm text-amber-500/90 font-medium">Archived chat history</span>
        {archives.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <Clock size={12} className="text-[var(--text-secondary)]" />
            <select
              value={activeArchiveId ?? ''}
              onChange={(e) => onSelectArchive(Number(e.target.value))}
              className="text-xs bg-transparent border border-[var(--border)] rounded px-2 py-1 text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {archives.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.sessionCreatedAt).toLocaleDateString()} ({a.messageCount} messages)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onPromptClick }: { onPromptClick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mb-6">
        <Anchor size={32} weight="duotone" className="text-[var(--accent)]" />
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-bright)] mb-2">
        Ask about this PR
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-[360px] text-center">
        Claude can read the codebase to answer questions about the changes, architecture, and implications.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-[520px]">
        {SAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            onClick={() => onPromptClick(prompt.label)}
            className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-left text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/50 transition-colors"
          >
            <prompt.icon size={16} className="flex-shrink-0 text-[var(--accent)]/60" />
            <span className="line-clamp-2">{prompt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TOOL_CONFIG: Record<string, { icon: Icon; label: string }> = {
  Read: { icon: FileText, label: 'Reading file' },
  Grep: { icon: MagnifyingGlass, label: 'Searching' },
  Glob: { icon: FolderOpen, label: 'Finding files' },
  Bash: { icon: Terminal, label: 'Running command' },
  Edit: { icon: PencilSimple, label: 'Editing file' },
  Write: { icon: FileArrowUp, label: 'Writing file' },
};

function EntryView({ entry, files, onRuleClick, rules }: { entry: ChatEntry; files: Record<string, FileContent>; onRuleClick?: (ruleNumber: number) => void; rules?: Array<{ ruleNumber: number; rule: string }> }) {
  if (entry.type === 'user') {
    return (
      <div className="flex justify-end pt-4">
        <div className="max-w-[85%] px-4 py-2.5 rounded-lg bg-[var(--accent)]/15 text-sm text-[var(--text-primary)]">
          {entry.content}
        </div>
      </div>
    );
  }

  if (entry.type === 'tool_call') {
    const config = TOOL_CONFIG[entry.toolName ?? ''];
    const ToolIcon = config?.icon ?? Terminal;
    // Strip the tool name prefix (e.g. "Read: /path" → "/path", "Bash: git log" → "git log")
    let detail = entry.content ?? '';
    detail = detail.replace(/^(?:Read|Grep|Glob|Bash|Edit|Write):\s*/, '');
    // Strip absolute repo clone paths, keeping only the relative path within the repo
    detail = detail.replace(/^\/.*?\.cruise-data\/repos\/[^/]+\/[^/]+\/\d+\//, '')
                   .replace(/^\/.*?\/repos\/[^/]+\/[^/]+\//, '');

    return (
      <div className="my-0.5 flex items-center gap-1.5 px-1 py-0.5 text-xs text-[var(--text-secondary)]/60">
        <ToolIcon size={11} className="flex-shrink-0" />
        {detail && (
          <span className="font-mono truncate">{detail}</span>
        )}
      </div>
    );
  }

  if (entry.type === 'error') {
    return (
      <div className="pt-2 text-sm text-red-400">{entry.content}</div>
    );
  }

  return (
    <div className="pt-2">
      <RichContent content={entry.content} files={files} className="cruise-chat-markdown" onRuleClick={onRuleClick} rules={rules} />
    </div>
  );
}
