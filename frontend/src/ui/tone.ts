import type { Tone } from '../domain/tone';

export type { Tone };

/**
 * Theme classes for each tone. Written out in full so Tailwind sees them.
 * `fg` is for text on a tinted background, `icon` for a bare icon,
 * `soft` and `border` for tinted surfaces like pills.
 */
export const TONE_CLASSES: Record<Tone, { fg: string; icon: string; soft: string; border: string }> = {
  neutral: { fg: 'text-fg-muted', icon: 'text-fg-muted', soft: 'bg-raised', border: 'border-line' },
  accent: { fg: 'text-accent-strong', icon: 'text-accent', soft: 'bg-accent-emphasis/15', border: 'border-accent-emphasis/40' },
  success: { fg: 'text-success', icon: 'text-success', soft: 'bg-success/10', border: 'border-success/40' },
  warning: { fg: 'text-warning-fg', icon: 'text-warning', soft: 'bg-warning/10', border: 'border-warning/35' },
  severe: { fg: 'text-severe', icon: 'text-severe', soft: 'bg-severe/10', border: 'border-severe/35' },
  danger: { fg: 'text-danger-fg', icon: 'text-danger', soft: 'bg-danger/10', border: 'border-danger/40' },
  done: { fg: 'text-done-fg', icon: 'text-done', soft: 'bg-done/15', border: 'border-done/40' },
};
