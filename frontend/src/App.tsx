import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router';
import { AuthGate, SetupGate } from './app/gates';
import { InboxHome } from './features/inbox/InboxHome';
import { AppShell } from './shell/AppShell';
import { ReviewPage } from './features/review/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthCompletePage } from './pages/AuthCompletePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CliAuthorizePage } from './pages/CliAuthorizePage';
import { HomePage } from './pages/HomePage';

// Dev-only component sheet; the import is dropped from production builds
const UiGallery = import.meta.env.DEV
  ? lazy(() => import('./dev/UiGallery').then((m) => ({ default: m.UiGallery })))
  : null;

// Keyed by PR (not view) so moving between PRs remounts the page instead of
// carrying chat and polling state over, while switching views doesn't.
function ReviewRoute() {
  const { owner, repo, pr } = useParams();
  return <ReviewPage key={`${owner}/${repo}/${pr}`} />;
}

// Hard redirect for legacy /setup URLs — preserves the query string so the
// GitHub App callback flows (?success, ?installed, ?install_url, ?error)
// keep working for installs whose stored setup_url still points to /setup.
function LegacySetupRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/settings${search}`} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public: CLI install steps, plus the viewer's tokens when signed in */}
        <Route path="/cli" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/setup" element={<LegacySetupRedirect />} />
        <Route path="/auth/complete" element={<AuthCompletePage />} />
        <Route path="/cli/authorize" element={<CliAuthorizePage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* The sidebar replaced the PR list page */}
        <Route path="/reviews" element={<Navigate to="/" replace />} />
        {UiGallery && (
          <Route path="/__ui" element={<Suspense fallback={null}><UiGallery /></Suspense>} />
        )}

        {/* Signed out, the root is the public home page; signed in, it's the inbox */}
        <Route element={<AuthGate signedOut={<HomePage />} />}>
          <Route element={<SetupGate />}>
            <Route element={<AppShell />}>
              <Route index element={<InboxHome />} />
              <Route path="/:owner/:repo/pull/:pr/:view?" element={<ReviewRoute />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
