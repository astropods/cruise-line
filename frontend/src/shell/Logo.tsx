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
      // A small radius that grows a little with size: 3px at 24, 17px at 120
      style={{ borderRadius: Math.max(3, Math.round(size * 0.14)) }}
      className={cx('flex-shrink-0 select-none object-cover', className)}
    />
  );
}
