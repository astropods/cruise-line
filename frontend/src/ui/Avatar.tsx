import { useState } from 'react';
import { cx } from '../lib/cx';

const SIZES = {
  16: 'h-4 w-4 text-[7px]',
  20: 'h-5 w-5 text-[8px]',
  24: 'h-6 w-6 text-[10px]',
  28: 'h-7 w-7 text-[11px]',
  32: 'h-8 w-8 text-xs',
  44: 'h-11 w-11 text-[15px]',
} as const;

interface AvatarProps {
  login: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** GitHub avatar, falling back to initials when there's no image or it fails to load */
export function Avatar({ login, src, size = 24, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const classes = cx('inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full', SIZES[size], className);

  if (src && !failed) {
    return <img src={src} alt="" className={cx(classes, 'bg-raised')} onError={() => setFailed(true)} />;
  }
  return (
    <span aria-hidden="true" className={cx(classes, 'bg-raised font-semibold text-fg')}>
      {initials(login)}
    </span>
  );
}

function initials(login: string): string {
  const parts = login.replace(/^@/, '').split(/[-_.]/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : login.slice(0, 2);
  return letters.toUpperCase();
}
