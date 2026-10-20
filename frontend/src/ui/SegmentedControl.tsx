import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers */
  label: string;
  className?: string;
}

/** A row of mutually exclusive views, like Analysis / Architecture / Chat */
export function SegmentedControl<T extends string>({ segments, value, onChange, label, className }: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('inline-flex flex-shrink-0 gap-0.5 rounded-lg border border-line bg-surface p-[3px]', className)}
    >
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={s.disabled}
            onClick={() => onChange(s.value)}
            className={cx(
              'inline-flex h-[26px] items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] transition-colors',
              'disabled:pointer-events-none disabled:opacity-40',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              selected ? 'bg-raised font-medium text-fg-strong' : 'text-fg-muted hover:text-fg',
            )}
          >
            {s.icon}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
