import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout'
import { AdminPage } from './features/admin/AdminPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import CircuitEditorPage from './features/editor/CircuitEditorPage'
import { ExplorePage } from './features/explore/ExplorePage'
import { LandingPage } from './features/landing/LandingPage'
import { NewProjectPage } from './features/projects/NewProjectPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { LabExplorerPage } from './features/labs/LabExplorerPage'
import { LabChallengeRunner } from './features/labs/LabChallengeRunner'
import { useThemeStore } from './store/themeStore'
import { ToastContainer } from './components/layout/ToastContainer'
import './App.css'
import './styles/components.css'
import './styles/landing.css'
import './styles/dashboard.css'
import './styles/pages.css'
import './styles/editor.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function App() {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastContainer />
          <Routes>
            <Route element={<LandingPage />} path="/" />

            {/* Public share route (bypass login, read-only) */}
            <Route element={<CircuitEditorPage />} path="/editor/share" />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route element={<DashboardPage />} path="/dashboard" />
                <Route element={<ProjectsPage />} path="/projects" />
                <Route element={<NewProjectPage />} path="/projects/new" />
                <Route element={<ExplorePage />} path="/explore" />
                <Route element={<LabExplorerPage />} path="/labs" />
                <Route element={<SettingsPage />} path="/settings" />
                <Route element={<AdminPage />} path="/admin" />
              </Route>
              {/* Full-screen editors */}
              <Route element={<CircuitEditorPage />} path="/editor/:projectId" />
              <Route element={<LabChallengeRunner />} path="/labs/:labId" />
            </Route>

            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
