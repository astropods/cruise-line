import { useState } from 'react';
import { claimOwnership, type UserInfo } from '../../../api';
import { Avatar, Button } from '../../../ui';

/** A configured install with no owner yet: the first person to claim it becomes owner */
export function ClaimOwnership({ user }: { user: UserInfo }) {
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setClaiming(true);
    setError(null);
    try {
      await claimOwnership();
      // A full load so the session, the shell, and settings all see the new role
      window.location.href = '/settings/basic';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim ownership');
      setClaiming(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-8 text-fg">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-fg-strong">Claim ownership</h1>
          <p className="text-sm text-fg-muted">
            This Cruise Line install has no owner yet. The first person to claim it can manage settings and make other
            people owners.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm text-fg-muted">
          <Avatar login={user.login} src={user.avatarUrl} size={32} />
          <span>Signed in as <span className="font-medium text-fg-strong">@{user.login}</span></span>
        </div>
        {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        <Button variant="primary" onClick={claim} disabled={claiming} className="w-full">
          {claiming ? 'Claiming…' : `Claim ownership as @${user.login}`}
        </Button>
      </div>
    </div>
  );
}
