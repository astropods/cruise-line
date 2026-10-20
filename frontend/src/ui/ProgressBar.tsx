import { cx } from '../lib/cx';

/** A thin bar. Without `value` (0–1) it shows indeterminate motion. */
export function ProgressBar({ value, className, label = 'Progress' }: { value?: number; className?: string; label?: string }) {
  const determinate = value != null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      className={cx('relative h-[3px] w-full overflow-hidden rounded-full bg-raised', className)}
    >
      <div
        className={cx('h-full rounded-full bg-accent', !determinate && 'animate-progress-indeterminate w-1/3')}
        style={determinate ? { width: `${Math.min(100, Math.max(0, value * 100))}%` } : undefined}
      />
    </div>
  );
}
