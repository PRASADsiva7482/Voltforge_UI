import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import keycloak from './utils/keycloak';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { authApi } from './api/services';
import AppLayout from './components/layout/AppLayout';
import ToastContainer from './components/layout/ToastContainer';
import DashboardPage from './features/dashboard/DashboardPage';
import EditorPage from './features/editor/EditorPage';
import ExplorePage from './features/explore/ExplorePage';
import ProjectsPage from './features/projects/ProjectsPage';
import NewProjectPage from './features/projects/NewProjectPage';
import SettingsPage from './features/settings/SettingsPage';
import AdminPage from './features/admin/AdminPage';
import { Zap } from 'lucide-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30000 } } });

let keycloakInitPromise: Promise<boolean> | null = null;
let syncUserPromise: Promise<ReturnType<typeof authApi.syncUser> extends Promise<infer T> ? T : never> | null = null;

import LandingPage from './features/landing/LandingPage';

function initKeycloakOnce() {
  if (!keycloakInitPromise) {
    keycloakInitPromise = keycloak.init({ onLoad: 'check-sso', checkLoginIframe: false, pkceMethod: 'S256' });
  }
  return keycloakInitPromise;
}

function syncUserOnce() {
  if (!syncUserPromise) {
    syncUserPromise = authApi.syncUser();
  }
  return syncUserPromise;
}

import { useTranslation } from 'react-i18next';

function AuthInit({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, setUser, setAuthenticated, setLoading } = useAuthStore();
  const [kcReady, setKcReady] = useState(false);

  const initKeycloak = useCallback(async () => {
    try {
      const authenticated = await initKeycloakOnce();
      setAuthenticated(authenticated);
      if (authenticated) {
        const res = await syncUserOnce();
        setUser(res.data.data);
      }
    } catch (err) {
      console.error('Keycloak init error:', err);
    } finally {
      setLoading(false);
      setKcReady(true);
    }
  }, [setUser, setAuthenticated, setLoading]);

  useEffect(() => {
    initKeycloak();
  }, [initKeycloak]);

  useEffect(() => {
    if (!kcReady || !isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        await keycloak.updateToken(60);
      } catch {
        keycloak.login({ redirectUri: window.location.origin + '/dashboard' });
      }
    }, 50000);
    return () => clearInterval(interval);
  }, [kcReady, isAuthenticated]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-screen bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-100">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center mx-auto mb-6 animate-pulse">
          <Zap className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-surface-950 dark:text-white mb-2">{t('VoltForge')}</h2>
        <p className="text-surface-600 dark:text-surface-400 text-sm">{t('Loading your workspace...')}</p>
        <div className="mt-4 w-32 h-1 bg-surface-200 dark:bg-surface-800 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-gradient-to-r from-volt-500 to-forge-500 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" style={{ width: '60%' }} />
        </div>
      </div>
    </div>
  );

  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    keycloak.login({ redirectUri: window.location.origin + '/dashboard' });
    return (
      <div className="flex items-center justify-center h-screen bg-surface-50 text-surface-950 dark:bg-surface-950 dark:text-white font-semibold">
        {t('Redirecting to login...')}
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastContainer />
      <BrowserRouter>
        <AuthInit>
          <Routes>
            {/* Public landing details page */}
            <Route path="/" element={<LandingPage />} />

            {/* Protected application views */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/new" element={<NewProjectPage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            <Route
              path="/editor/:projectId"
              element={
                <ProtectedRoute>
                  <EditorPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthInit>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
