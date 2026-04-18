import { BrowserRouter, Routes, Route } from 'react-router';
import { WalkthroughPage } from './pages/WalkthroughPage';
import { SetupPage } from './pages/SetupPage';
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

  if (!ready) return null; // Redirecting to /setup

  return (
    <Routes>
      <Route path="/:owner/:repo/pull/:pr" element={<WalkthroughPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/auth/complete" element={<AuthCompletePage />} />
        <Route path="*" element={<GuardedRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
