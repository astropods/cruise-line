import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { fetchUser } from '../../api';
import { useCurrentUser, useSetupStatus } from '../../app/session';
import { PageSpinner } from '../../ui';
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
  if (!configured) return <SetupFlow defaultGithubUrl={setup.data?.githubUrl ?? 'https://github.com'} />;
  if (user.isPending || signedOut || !user.data) return <PageSpinner />;
  if (user.data.isOwner) return <Navigate to={`/settings/basic${search}`} replace />;
  if (!setup.data!.hasOwner) return <ClaimOwnership user={user.data} />;
  // Non-owners have nothing to manage here; their CLI tokens are at /cli
  return <Navigate to="/" replace />;
}
