import { Info, Warning, Siren, ShieldWarning, Lightning, type Icon } from '@phosphor-icons/react';
import { Md } from '../../../ui';

interface CalloutProps {
  type: 'info' | 'warning' | 'breaking' | 'security' | 'perf';
  content: string;
}

const styles: Record<string, { border: string; bg: string; icon: Icon; label: string; iconColor: string }> = {
  info: {
    border: 'border-l-accent',
    bg: 'bg-accent/5',
    icon: Info,
    label: 'Note',
    iconColor: 'text-accent',
  },
  warning: {
    border: 'border-l-warning',
    bg: 'bg-warning/5',
    icon: Warning,
    label: 'Warning',
    iconColor: 'text-warning',
  },
  breaking: {
    border: 'border-l-danger',
    bg: 'bg-danger/5',
    icon: Siren,
    label: 'Breaking Change',
    iconColor: 'text-danger',
  },
  security: {
    border: 'border-l-danger',
    bg: 'bg-danger/5',
    icon: ShieldWarning,
    label: 'Security',
    iconColor: 'text-danger',
  },
  perf: {
    border: 'border-l-severe',
    bg: 'bg-severe/5',
    icon: Lightning,
    label: 'Performance',
    iconColor: 'text-severe',
  },
};

export function Callout({ type, content }: CalloutProps) {
  const s = styles[type] ?? styles.info;
  const Icon = s.icon;

  return (
    <div className={`my-4 border-l-4 ${s.border} ${s.bg} rounded-r-lg px-5 py-4`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
        <Icon size={14} weight="bold" className={s.iconColor} />
        {s.label}
      </div>
      <div className="cruise-markdown text-sm">
        <Md>{content}</Md>
      </div>
    </div>
  );
}
