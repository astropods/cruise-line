import { useCallback, useEffect, useRef, useState } from 'react';

/** Copy text to the clipboard; `copied` stays true for `resetMs` afterwards */
export function useCopy(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fails on insecure origins and in sandboxed iframes; the text can still be selected by hand
      return false;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), resetMs);
    return true;
  }, [resetMs]);

  return { copy, copied };
}
