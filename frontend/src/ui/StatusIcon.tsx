import {
  CheckCircle,
  ChatCircle,
  CircleDashed,
  GitMerge,
  GitPullRequest,
  WarningCircle,
  XCircle,
  type Icon,
} from '@phosphor-icons/react';
import type { StatusIcon as StatusIconKey } from '../domain/prStatus';
import { cx } from '../lib/cx';
import { Spinner } from './Spinner';
import { TONE_CLASSES, type Tone } from './tone';

const ICONS: Record<Exclude<StatusIconKey, 'running'>, { icon: Icon; weight: 'fill' | 'regular' | 'bold' }> = {
  failed: { icon: XCircle, weight: 'fill' },
  'not-reviewed': { icon: CircleDashed, weight: 'regular' },
  approved: { icon: CheckCircle, weight: 'fill' },
  changes: { icon: WarningCircle, weight: 'fill' },
  discussion: { icon: ChatCircle, weight: 'fill' },
  merged: { icon: GitMerge, weight: 'bold' },
  closed: { icon: GitPullRequest, weight: 'bold' },
};

interface StatusIconProps {
  icon: StatusIconKey;
  tone: Tone;
  size?: number;
  /** Read by screen readers; omit when a visible label sits next to the icon */
  label?: string;
  className?: string;
}

/** Renders a domain/prStatus icon key */
export function StatusIcon({ icon, tone, size = 16, label, className }: StatusIconProps) {
  if (icon === 'running') return <Spinner size={size} tone={tone} className={className} />;
  const { icon: Glyph, weight } = ICONS[icon];
  return (
    <Glyph
      size={size}
      weight={weight}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      className={cx('flex-shrink-0', TONE_CLASSES[tone].icon, className)}
    />
  );
}
