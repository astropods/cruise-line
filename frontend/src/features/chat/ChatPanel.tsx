import { useEffect, useRef } from 'react';
import type { FileContent } from '../../api';
import type { RuleRef } from '../review/content/RichContent';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatEntryView, ThinkingDots } from './ChatEntryView';
import { useChat } from './useChat';

/** Each request is a new object; ChatPanel sends each one exactly once */
export interface ChatRequest {
  text: string;
}

interface ChatPanelProps {
  owner: string;
  repo: string;
  prNumber: number;
  files: Record<string, FileContent>;
  /** A question asked elsewhere (the Analysis view); sent once the panel is free */
  request?: ChatRequest;
  onRuleClick?: (ruleNumber: number) => void;
  rules?: RuleRef[];
}

/** The Chat view: the conversation, then the composer pinned underneath */
export function ChatPanel({ owner, repo, prNumber, files, request, onRuleClick, rules }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sentRequest = useRef<ChatRequest | undefined>(undefined);
  const { entries, isStreaming, historyLoaded, sendMessage, resetSession } = useChat({ owner, repo, pr: prNumber });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  // Waits for the history and for any reply in progress, which sendMessage
  // would otherwise drop
  useEffect(() => {
    if (request && request !== sentRequest.current && historyLoaded && !isStreaming) {
      sentRequest.current = request;
      sendMessage(request.text);
    }
  }, [request, historyLoaded, isStreaming, sendMessage]);

  function send(message: string) {
    if (!isStreaming) sendMessage(message);
  }

  const isEmpty = historyLoaded && entries.length === 0 && !isStreaming;
  const waitingForReply = isStreaming && (entries.length === 0 || entries[entries.length - 1]?.type === 'user');

  return (
    <div className="flex h-full flex-col">
      <div className={`flex-1 overflow-auto px-8 py-6 ${isEmpty ? 'flex items-center justify-center' : ''}`}>
        {isEmpty ? (
          <ChatEmptyState onPromptClick={send} />
        ) : (
          <div className="mx-auto max-w-[800px] space-y-1">
            {!historyLoaded && <div className="py-12 text-center text-sm text-fg-muted">Loading conversation...</div>}
            {entries.map((entry, i) => (
              <ChatEntryView key={i} entry={entry} files={files} onRuleClick={onRuleClick} rules={rules} />
            ))}
            {waitingForReply && <ThinkingDots />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatComposer disabled={isStreaming} onSend={send} onNewChat={entries.length > 0 ? resetSession : undefined} />
    </div>
  );
}
