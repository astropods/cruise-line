import { Info, Warning, Siren, ShieldWarning, Lightning, type Icon } from '@phosphor-icons/react';
import { Md } from './Md';

interface CalloutProps {
  type: 'info' | 'warning' | 'breaking' | 'security' | 'perf';
  content: string;
}

const styles: Record<string, { border: string; bg: string; icon: Icon; label: string; iconColor: string }> = {
  info: {
    border: 'border-l-[var(--accent)]',
    bg: 'bg-[var(--accent)]/5',
    icon: Info,
    label: 'Note',
    iconColor: 'text-[var(--accent)]',
  },
  warning: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-500/5',
    icon: Warning,
    label: 'Warning',
    iconColor: 'text-yellow-500',
  },
  breaking: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    icon: Siren,
    label: 'Breaking Change',
    iconColor: 'text-red-500',
  },
  security: {
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    icon: ShieldWarning,
    label: 'Security',
    iconColor: 'text-red-500',
  },
  perf: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/5',
    icon: Lightning,
    label: 'Performance',
    iconColor: 'text-orange-500',
  },
};

export function Callout({ type, content }: CalloutProps) {
  const s = styles[type] ?? styles.info;
  const Icon = s.icon;

  return (
    <div className={`my-4 border-l-4 ${s.border} ${s.bg} rounded-r-lg px-5 py-4`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
        <Icon size={14} weight="bold" className={s.iconColor} />
        {s.label}
      </div>
      <div className="cruise-markdown text-sm">
        <Md>{content}</Md>
      </div>
    </div>
  );
}
