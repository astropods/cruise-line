import { useState, useCallback, useEffect, useRef } from 'react';
import { chatRunEventsUrl, fetchChatSession, resetChatSession, sendChatMessage } from '../../api';

export interface ChatEntry {
  type: 'user' | 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  timestamp: Date;
}

interface UseChatOptions {
  owner: string;
  repo: string;
  pr: number;
}

function historyToEntries(messages: any[]): ChatEntry[] {
  const restored: ChatEntry[] = [];
  for (const msg of messages) {
    if (msg.type === 'user') {
      restored.push({ type: 'user', content: msg.content, timestamp: new Date() });
    } else if (msg.type === 'assistant') {
      for (const part of msg.parts ?? []) {
        if (part.type === 'text') {
          restored.push({ type: 'text', content: part.content, timestamp: new Date() });
        } else if (part.type === 'tool_call') {
          const detail = part.detail ? `: ${part.detail}` : '';
          restored.push({
            type: 'tool_call',
            content: `${part.name}${detail}`,
            toolName: part.name,
            timestamp: new Date(),
          });
        }
      }
    } else if (msg.type === 'result' && msg.content) {
      restored.push({ type: 'text', content: msg.content, timestamp: new Date() });
    }
  }
  return restored;
}

export function useChat({ owner, repo, pr }: UseChatOptions) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const addError = useCallback((content: string) => {
    setEntries((prev) => [...prev, { type: 'error', content, timestamp: new Date() }]);
  }, []);

  const handleEvent = useCallback((event: any) => {
    if (event.type === 'text') {
      // Complete text block from an assistant turn
      setEntries((prev) => [...prev, {
        type: 'text', content: event.content, timestamp: new Date(),
      }]);
    } else if (event.type === 'tool_call') {
      // Tool call with full input detail
      setEntries((prev) => [...prev, {
        type: 'tool_call',
        content: event.detail || event.name,
        toolName: event.name,
        toolInput: event.input,
        timestamp: new Date(),
      }]);
    } else if (event.type === 'done') {
      // Turn complete — result may contain final text as fallback
      if (event.text) {
        // Only add if we didn't already get text blocks
        setEntries((prev) => {
          const lastText = prev.findLast((e) => e.type === 'text');
          if (!lastText || lastText.content !== event.text) {
            return [...prev, { type: 'text', content: event.text, timestamp: new Date() }];
          }
          return prev;
        });
      }
    } else if (event.type === 'error') {
      addError(event.message);
    }
  }, [addError]);

  // Follow a run's events. The server closes each connection after a few
  // seconds and EventSource reconnects with Last-Event-ID, so replies of any
  // length survive the ingress response timeout.
  const followRun = useCallback((runId: string) => {
    sourceRef.current?.close();
    setIsStreaming(true);

    const source = new EventSource(chatRunEventsUrl(owner, repo, pr, runId), { withCredentials: true });
    sourceRef.current = source;

    const finish = () => {
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
      setIsStreaming(false);
    };

    source.onmessage = (e) => {
      try {
        handleEvent(JSON.parse(e.data));
      } catch { /* skip malformed */ }
    };
    source.addEventListener('end', finish);
    source.onerror = () => {
      // CONNECTING means the browser is already retrying; CLOSED means the
      // server refused the stream (run expired, session ended).
      if (source.readyState === EventSource.CLOSED) {
        addError('Lost connection to this reply. Refresh to see the latest messages.');
        finish();
      }
    };
  }, [owner, repo, pr, handleEvent, addError]);

  useEffect(() => () => sourceRef.current?.close(), []);

  // Load conversation history from the server on mount, and rejoin a reply
  // that is still running (e.g. after a refresh).
  useEffect(() => {
    async function loadHistory() {
      try {
        const data = await fetchChatSession(owner, repo, pr);

        let restored = historyToEntries((data.messages ?? []) as any[]);
        const activeRun = data.activeRun;
        if (activeRun) {
          // The session may already hold part of the running turn; drop it so
          // the replayed run events don't duplicate it.
          const lastUser = restored.findLastIndex((e) => e.type === 'user');
          if (lastUser !== -1 && restored[lastUser].content === activeRun.prompt) {
            restored = restored.slice(0, lastUser);
          }
          restored.push({ type: 'user', content: activeRun.prompt, timestamp: new Date() });
        }
        if (restored.length > 0) {
          setEntries(restored);
        }
        if (activeRun) followRun(activeRun.id);
      } catch { /* ignore */ }
      setHistoryLoaded(true);
    }
    loadHistory();
  }, [owner, repo, pr, followRun]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setEntries((prev) => [...prev, { type: 'user', content: text, timestamp: new Date() }]);
    setIsStreaming(true);

    try {
      const { runId } = await sendChatMessage(owner, repo, pr, text);
      followRun(runId);
    } catch (err) {
      addError((err as Error).message);
      setIsStreaming(false);
    }
  }, [owner, repo, pr, isStreaming, followRun, addError]);

  const resetSession = useCallback(async () => {
    try {
      await resetChatSession(owner, repo, pr);
      sourceRef.current?.close();
      sourceRef.current = null;
      setIsStreaming(false);
      setEntries([]);
    } catch { /* ignore */ }
  }, [owner, repo, pr]);

  return {
    entries,
    isStreaming,
    historyLoaded,
    sendMessage,
    resetSession,
  };
}
