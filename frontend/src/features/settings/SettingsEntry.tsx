import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { fetchUser } from '../../api';
import { useCurrentUser, useSetupStatus } from '../../app/session';
import { WarningCircle } from '@phosphor-icons/react';
import { Button, EmptyState, PageSpinner } from '../../ui';
import { ClaimOwnership } from './onboarding/ClaimOwnership';
import { SetupFlow } from './onboarding/SetupFlow';

/**
 * /settings, where GitHub's App callbacks land. Runs first-time setup and the
 * ownership claim outside the shell; owners go on to /settings/basic with
 * the callback's query string, which Basic setup turns into notices.
 */
export function SettingsEntry() {
  const { search } = useLocation();
  const setup = useSetupStatus();
  const configured = setup.data?.configured ?? false;
  const user = useCurrentUser();
  const signedOut = configured && user.isSuccess && !user.data;

  // OAuth only works once the App exists; fetchUser sends signed-out people to GitHub
  useEffect(() => {
    if (signedOut) void fetchUser();
  }, [signedOut]);

  if (setup.isPending) return <PageSpinner />;
  // Without the status we can't tell setup from settings; guessing "not
  // configured" would show a configured install the first-time setup
  if (setup.isError) return <LoadFailed what="setup status" error={setup.error} onRetry={() => setup.refetch()} />;
  if (!configured) return <SetupFlow defaultGithubUrl={setup.data?.githubUrl ?? 'https://github.com'} />;
  if (user.isError) return <LoadFailed what="your account" error={user.error} onRetry={() => user.refetch()} />;
  if (user.isPending || signedOut || !user.data) return <PageSpinner />;
  if (user.data.isOwner) return <Navigate to={`/settings/basic${search}`} replace />;
  if (!setup.data!.hasOwner) return <ClaimOwnership user={user.data} />;
  // Non-owners have nothing to manage here; their CLI tokens are at /cli
  return <Navigate to="/" replace />;
}

function LoadFailed({ what, error, onRetry }: { what: string; error: Error; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <EmptyState
        icon={<WarningCircle size={28} className="text-danger" />}
        title={`Couldn't load ${what}`}
        action={<Button onClick={onRetry}>Try again</Button>}
      >
        {error.message}
      </EmptyState>
    </div>
  );
}
