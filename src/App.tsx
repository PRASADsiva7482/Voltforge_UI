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
import { useThemeStore } from './store/themeStore'
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
          <Routes>
            <Route element={<LandingPage />} path="/" />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route element={<DashboardPage />} path="/dashboard" />
                <Route element={<ProjectsPage />} path="/projects" />
                <Route element={<NewProjectPage />} path="/projects/new" />
                <Route element={<ExplorePage />} path="/explore" />
                <Route element={<SettingsPage />} path="/settings" />
                <Route element={<AdminPage />} path="/admin" />
              </Route>
              {/* Editor is full-screen (no sidebar) */}
              <Route element={<CircuitEditorPage />} path="/editor/:projectId" />
            </Route>

            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
