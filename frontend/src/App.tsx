import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router';
import { WalkthroughPage } from './pages/WalkthroughPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthCompletePage } from './pages/AuthCompletePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { CliAuthorizePage } from './pages/CliAuthorizePage';
import { HomePage } from './pages/HomePage';
import { useSetupGuard } from './hooks/useSetupGuard';

// Dev-only component sheet; the import is dropped from production builds
const UiGallery = import.meta.env.DEV
  ? lazy(() => import('./dev/UiGallery').then((m) => ({ default: m.UiGallery })))
  : null;

// Keyed by PR so moving between PRs remounts the page instead of carrying
// tab, chat, and polling state from the previous one.
function WalkthroughRoute() {
  const { owner, repo, pr } = useParams();
  return <WalkthroughPage key={`${owner}/${repo}/${pr}`} />;
}

function GuardedRoutes() {
  const { ready, checking } = useSetupGuard();

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ready) return null; // Redirecting to /settings

  return (
    <Routes>
      <Route path="/reviews" element={<ReviewsPage />} />
      <Route path="/:owner/:repo/pull/:pr" element={<WalkthroughRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
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
        {/* Public home page — CLI install + tokens for signed-in users. */}
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/setup" element={<LegacySetupRedirect />} />
        <Route path="/auth/complete" element={<AuthCompletePage />} />
        <Route path="/cli/authorize" element={<CliAuthorizePage />} />
        {UiGallery && (
          <Route path="/__ui" element={<Suspense fallback={null}><UiGallery /></Suspense>} />
        )}
        <Route path="*" element={<GuardedRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
