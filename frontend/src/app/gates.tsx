import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { PageSpinner } from '../ui';
import { useCurrentUser, useSetupStatus } from './session';

/**
 * Sends unconfigured installs to Settings. If the check itself fails, lets
 * the user through rather than locking them out.
 */
export function SetupGate() {
  const setup = useSetupStatus();
  if (setup.isPending) return <PageSpinner />;
  if (setup.data && !setup.data.configured) return <Navigate to="/settings" replace />;
  return <Outlet />;
}

/**
 * Signed-out visitors to the root see `signedOut` (the public home page).
 * Deeper links fall through: their API calls send the browser to GitHub
 * sign-in.
 */
export function AuthGate({ signedOut }: { signedOut: ReactNode }) {
  const { pathname } = useLocation();
  const user = useCurrentUser();
  if (user.isPending) return <PageSpinner />;
  if (!user.data && pathname === '/') return <>{signedOut}</>;
  return <Outlet />;
}
