import type { FileContent } from '../../api';
import { RichContent, type RuleRef } from '../review/content/RichContent';
import { toolCallDetail, toolIcon } from '../../lib/toolCalls';
import type { ChatEntry } from './useChat';

interface ChatEntryViewProps {
  entry: ChatEntry;
  files: Record<string, FileContent>;
  onRuleClick?: (ruleNumber: number) => void;
  rules?: RuleRef[];
}

/** One line of the conversation: a question, a tool call, an answer, or an error */
export function ChatEntryView({ entry, files, onRuleClick, rules }: ChatEntryViewProps) {
  switch (entry.type) {
    case 'user':
      return (
        <div className="flex justify-end pt-4">
          <div className="max-w-[85%] rounded-lg bg-accent/15 px-4 py-2.5 text-sm text-fg">{entry.content}</div>
        </div>
      );
    case 'tool_call':
      return <ToolCallLine toolName={entry.toolName} content={entry.content} />;
    case 'error':
      return <div className="pt-2 text-sm text-danger-fg">{entry.content}</div>;
    default:
      return (
        <div className="pt-2">
          <RichContent content={entry.content} files={files} className="cruise-chat-markdown" onRuleClick={onRuleClick} rules={rules} />
        </div>
      );
  }
}

function ToolCallLine({ toolName, content }: { toolName?: string; content?: string }) {
  const ToolIcon = toolIcon(toolName);
  const detail = toolCallDetail(content);
  return (
    <div className="my-0.5 flex items-center gap-1.5 px-1 py-0.5 text-xs text-fg-muted/60">
      <ToolIcon size={11} className="flex-shrink-0" />
      {detail && <span className="truncate font-mono">{detail}</span>}
    </div>
  );
}

/** Shown while waiting for the first part of an answer */
export function ThinkingDots() {
  return (
    <div className="flex gap-1 py-3" aria-label="Thinking">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </div>
  );
}
