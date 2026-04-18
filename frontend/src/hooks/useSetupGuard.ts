import { useState, useEffect } from 'react';

export function useSetupGuard() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: { configured: boolean }) => {
        if (!data.configured) {
          window.location.href = '/setup';
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true)) // If check fails, let them through
      .finally(() => setChecking(false));
  }, []);

  return { ready, checking };
}
