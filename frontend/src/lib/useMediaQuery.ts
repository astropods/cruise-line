import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches, kept current as the window changes */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's md breakpoint: below it, panels take the whole screen */
export const WIDE_SCREEN = '(min-width: 768px)';

/** The window's width in CSS pixels, kept current on resize */
export function useViewportWidth(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => window.innerWidth,
    () => 1280,
  );
}
