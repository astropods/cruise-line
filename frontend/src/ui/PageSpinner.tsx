import { cx } from '../lib/cx';

/** A centered spinner filling the screen, or its container inside the shell */
export function PageSpinner({ fill = 'screen' }: { fill?: 'screen' | 'parent' }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cx('flex items-center justify-center bg-canvas', fill === 'screen' ? 'h-screen' : 'h-full')}
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
