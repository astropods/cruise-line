import { cx } from '../lib/cx';

/** The Cruise Line mark: the blueprint's avatar, a cruise ship at sea */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.jpg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      // Corners scale with size so the mark reads the same from 24px to 160px
      style={{ borderRadius: Math.round(size * 0.22) }}
      className={cx('flex-shrink-0 select-none object-cover', className)}
    />
  );
}
