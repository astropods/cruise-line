import { useState, useCallback, useEffect, useRef } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  toolName?: string;
}

interface UseChatOptions {
  owner: string;
  repo: string;
  pr: number;
}

export function useChat({ owner, repo, pr }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolActivity, setToolActivity] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    setIsStreaming(true);
    setStreamingText('');
    setToolActivity('');

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
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'heartbeat') {
              continue;
            } else if (event.type === 'delta') {
              accumulated += event.text;
              setStreamingText(accumulated);
              setToolActivity('');
            } else if (event.type === 'tool') {
              // Push tool calls into the message stream in real-time
              const detail = event.detail ? `: ${event.detail}` : '';
              setMessages((prev) => [
                ...prev,
                { role: 'tool', content: `${event.name}${detail}`, timestamp: new Date(), toolName: event.name },
              ]);
              setToolActivity(`${event.name}${detail}`);
            } else if (event.type === 'done') {
              const finalText = event.text || accumulated;
              if (finalText) {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: finalText, timestamp: new Date() },
                ]);
              }
              accumulated = '';
              setStreamingText('');
              setToolActivity('');
            } else if (event.type === 'error') {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: `Error: ${event.message}`, timestamp: new Date() },
              ]);
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // If there's accumulated text that wasn't finalized by a 'done' event
      if (accumulated) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: accumulated, timestamp: new Date() },
        ]);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${(err as Error).message}`, timestamp: new Date() },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setToolActivity('');
      abortRef.current = null;
    }
  }, [owner, repo, pr, isStreaming]);

  const resetSession = useCallback(async () => {
    try {
      await fetch(`/api/chat/${owner}/${repo}/${pr}/session`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setMessages([]);
      setStreamingText('');
    } catch { /* ignore */ }
  }, [owner, repo, pr]);

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    streamingText,
    toolActivity,
    sendMessage,
    resetSession,
    cancelStreaming,
  };
}
