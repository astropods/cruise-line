import { CircleNotch } from '@phosphor-icons/react';
import { cx } from '../lib/cx';
import { TONE_CLASSES, type Tone } from './tone';

export function Spinner({ size = 14, tone = 'accent', className }: { size?: number; tone?: Tone; className?: string }) {
  return (
    <CircleNotch
      size={size}
      weight="bold"
      aria-hidden="true"
      className={cx('flex-shrink-0 animate-spin', TONE_CLASSES[tone].icon, className)}
    />
  );
}
