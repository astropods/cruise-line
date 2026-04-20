import { useState, useCallback, useEffect, useRef } from 'react';

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

export function useChat({ owner, repo, pr }: UseChatOptions) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversation history from the server on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/chat/${owner}/${repo}/${pr}/session`, {
          credentials: 'include',
        });
        if (!res.ok) { setHistoryLoaded(true); return; }
        const data = await res.json();
        if (!data.messages?.length) { setHistoryLoaded(true); return; }

        const restored: ChatEntry[] = [];
        for (const msg of data.messages) {
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
        if (restored.length > 0) {
          setEntries(restored);
        }
      } catch { /* ignore */ }
      setHistoryLoaded(true);
    }
    loadHistory();
  }, [owner, repo, pr]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setEntries((prev) => [...prev, { type: 'user', content: text, timestamp: new Date() }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/chat/${owner}/${repo}/${pr}/message`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'heartbeat') {
              continue;
            } else if (event.type === 'text') {
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
              setEntries((prev) => [...prev, {
                type: 'error', content: event.message, timestamp: new Date(),
              }]);
            }
          } catch { /* skip malformed */ }
        }
      }

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setEntries((prev) => [...prev, {
          type: 'error',
          content: (err as Error).message,
          timestamp: new Date(),
        }]);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [owner, repo, pr, isStreaming]);

  const resetSession = useCallback(async () => {
    try {
      await fetch(`/api/chat/${owner}/${repo}/${pr}/session`, {
        method: 'DELETE',
        credentials: 'include',
      });
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
