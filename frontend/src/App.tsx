import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import { WalkthroughPage } from './pages/WalkthroughPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthCompletePage } from './pages/AuthCompletePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useSetupGuard } from './hooks/useSetupGuard';

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
      <Route path="/:owner/:repo/pull/:pr" element={<WalkthroughPage />} />
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/setup" element={<LegacySetupRedirect />} />
        <Route path="/auth/complete" element={<AuthCompletePage />} />
        <Route path="*" element={<GuardedRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
