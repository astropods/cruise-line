import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { TONE_CLASSES, type Tone } from './tone';

interface PillProps {
  tone?: Tone;
  icon?: ReactNode;
  /** Round status pill (default) or a squarer tag like "High" or "3 findings" */
  shape?: 'pill' | 'tag';
  className?: string;
  children: ReactNode;
}

export function Pill({ tone = 'neutral', icon, shape = 'pill', className, children }: PillProps) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={cx(
        'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium',
        shape === 'pill' ? cx('h-7 rounded-full border px-2.5', t.border) : 'h-5 rounded px-1.5',
        t.soft,
        t.fg,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
