import { GitPullRequest, Lightning, ShieldCheck, TreeStructure } from '@phosphor-icons/react';
import { Logo } from '../../shell/Logo';

const SAMPLE_PROMPTS = [
  { icon: GitPullRequest, label: 'Summarize this PR in plain English' },
  { icon: ShieldCheck, label: 'Are there any security concerns?' },
  { icon: TreeStructure, label: 'How does this change affect the existing architecture?' },
  { icon: Lightning, label: 'What are the performance implications?' },
];

/** A new conversation: what chat can do, with a few questions to start from */
export function ChatEmptyState({ onPromptClick }: { onPromptClick: (prompt: string) => void }) {
  return (
    <div className="flex w-full flex-col items-center justify-center">
      <Logo size={64} className="mb-6" />
      <h3 className="mb-2 text-lg font-semibold text-fg-strong">Ask about this PR</h3>
      <p className="mb-8 max-w-[360px] text-center text-sm text-fg-muted">
        Claude can read the codebase to answer questions about the changes, architecture, and implications.
      </p>
      <div className="grid w-full max-w-[520px] grid-cols-1 gap-2 sm:grid-cols-2">
        {SAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            onClick={() => onPromptClick(prompt.label)}
            className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm text-fg-muted transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <prompt.icon size={16} className="flex-shrink-0 text-accent/60" />
            <span className="line-clamp-2">{prompt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
