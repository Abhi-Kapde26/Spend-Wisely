import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { useAuth } from './lib/auth.js';
import { useSettings } from './context/SettingsContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Button from './components/ui/Button.jsx';
import Card from './components/ui/Card.jsx';
import { FullPageSpinner } from './components/ui/Spinner.jsx';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import SetupPage from './pages/SetupPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import StatementPage from './pages/StatementPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function AuthLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      <FullPageSpinner label="Just a moment…" />
    </div>
  );
}

function AuthErrorScreen({ message }) {
  const { logout } = useAuth();
  const { refresh } = useSettings();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <p className="text-3xl" aria-hidden="true">
          📡
        </p>
        <h1 className="mt-2 text-lg font-bold text-slate-800">Can't reach your account</h1>
        <p className="mt-1 text-sm text-slate-400">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => refresh()}>Try again</Button>
          <Button
            variant="secondary"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Guards (SPEC §5 Auth flow):
 *  - no token            → /login
 *  - still loading /me   → spinner
 *  - onboarding not done → /setup
 */
function RequireAuth({ children }) {
  const { token } = useAuth();
  const { settings, onboardingComplete, loading, error } = useSettings();

  if (!token) return <Navigate to="/login" replace />;
  if (loading || (!settings && !error)) return <AuthLoading />;
  if (!settings && error) return <AuthErrorScreen message={error} />;
  if (onboardingComplete === false) return <Navigate to="/setup" replace />;
  return children;
}

/** /setup is only for signed-in users who have not finished onboarding. */
function RequireSetup({ children }) {
  const { token } = useAuth();
  const { settings, onboardingComplete, loading, error } = useSettings();

  if (!token) return <Navigate to="/login" replace />;
  if (loading || (!settings && !error)) return <AuthLoading />;
  if (!settings && error) return <AuthErrorScreen message={error} />;
  if (onboardingComplete === true) return <Navigate to="/" replace />;
  return children;
}

/** Signed-in users skip /login and /register. */
function PublicOnly({ children }) {
  const { token } = useAuth();
  const { settings, onboardingComplete, loading, error } = useSettings();

  if (!token) return children;
  if (loading || (!settings && !error)) return <AuthLoading />;
  if (!settings && error) return children;
  return <Navigate to={onboardingComplete === false ? '/setup' : '/'} replace />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        <Route
          path="/setup"
          element={
            <RequireSetup>
              <SetupPage />
            </RequireSetup>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:year/:month" element={<StatementPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>

      <ToastContainer
        position="top-right"
        autoClose={3500}
        newestOnTop
        closeOnClick
        pauseOnHover
        limit={3}
        theme="light"
      />
    </>
  );
}
