import { Md } from './Md';

interface CalloutProps {
  type: 'info' | 'warning' | 'breaking' | 'security' | 'perf';
  content: string;
}

const styles: Record<string, { border: string; bg: string; icon: string; label: string }> = {
  info: {
    border: 'border-l-[var(--accent)]',
    bg: 'bg-[var(--accent)]/5',
    icon: '\u2139\uFE0F',
    label: 'Note',
  },
  warning: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-500/5',
    icon: '\u26A0\uFE0F',
    label: 'Warning',
  },
  breaking: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    icon: '\uD83D\uDEA8',
    label: 'Breaking Change',
  },
  security: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    icon: '\uD83D\uDD12',
    label: 'Security',
  },
  perf: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/5',
    icon: '\u26A1',
    label: 'Performance',
  },
};

export function Callout({ type, content }: CalloutProps) {
  const s = styles[type] ?? styles.info;

  return (
    <div className={`my-4 border-l-4 ${s.border} ${s.bg} rounded-r-lg px-5 py-4`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
        {s.icon} {s.label}
      </div>
      <div className="cruise-markdown text-sm">
        <Md>{content}</Md>
      </div>
    </div>
  );
}
