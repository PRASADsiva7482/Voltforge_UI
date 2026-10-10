import { lazy, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout'
import { LazyRouteBoundary } from './components/routing/LazyRouteBoundary'
import { useThemeStore } from './store/themeStore'
import { ToastContainer } from './components/layout/ToastContainer'
import './App.css'
import './styles/components.css'
import './styles/landing.css'
import './styles/dashboard.css'
import './styles/pages.css'
import './styles/editor.css'
import { ENABLE_ADMIN_NAV_MENU } from './config/navigation'

const AdminPage = lazy(() => import('./features/admin/AdminPage').then((module) => ({ default: module.AdminPage })))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const CircuitEditorPage = lazy(() => import('./features/editor/CircuitEditorPage'))
const ExplorePage = lazy(() => import('./features/explore/ExplorePage').then((module) => ({ default: module.ExplorePage })))
const LandingPage = lazy(() => import('./features/landing/LandingPage').then((module) => ({ default: module.LandingPage })))
const NewProjectPage = lazy(() => import('./features/projects/NewProjectPage').then((module) => ({ default: module.NewProjectPage })))
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage').then((module) => ({ default: module.ProjectsPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const LabExplorerPage = lazy(() => import('./features/labs/LabExplorerPage').then((module) => ({ default: module.LabExplorerPage })))
const LabChallengeRunner = lazy(() => import('./features/labs/LabChallengeRunner').then((module) => ({ default: module.LabChallengeRunner })))

function lazyRoute(label: string, page: ReactNode) {
  return <LazyRouteBoundary label={label}>{page}</LazyRouteBoundary>
}

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
            <Route element={lazyRoute('home', <LandingPage />)} path="/" />

            {/* Public share & sandbox routes (bypass login) */}
            <Route element={lazyRoute('shared circuit', <CircuitEditorPage />)} path="/editor/share" />
            <Route element={lazyRoute('live sandbox', <CircuitEditorPage />)} path="/editor/sandbox" />
            <Route element={lazyRoute('live sandbox', <CircuitEditorPage />)} path="/sandbox" />
            {/* Public database-backed project route; private projects remain
                protected by the backend project access check. */}
            <Route element={lazyRoute('public project', <CircuitEditorPage />)} path="/public-project/:projectId" />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route element={lazyRoute('dashboard', <DashboardPage />)} path="/dashboard" />
                <Route element={lazyRoute('projects', <ProjectsPage />)} path="/projects" />
                <Route element={lazyRoute('new project', <NewProjectPage />)} path="/projects/new" />
                <Route element={lazyRoute('explore', <ExplorePage />)} path="/explore" />
                <Route element={lazyRoute('labs', <LabExplorerPage />)} path="/labs" />
                <Route element={lazyRoute('profile', <ProfilePage />)} path="/profile" />
                <Route element={lazyRoute('user profile', <ProfilePage />)} path="/profile/:userId" />
                <Route element={lazyRoute('settings', <SettingsPage />)} path="/settings" />
                <Route element={ENABLE_ADMIN_NAV_MENU ? lazyRoute('admin', <AdminPage />) : <Navigate replace to="/dashboard" />} path="/admin" />
              </Route>
              {/* Full-screen editors */}
              <Route element={lazyRoute('circuit editor', <CircuitEditorPage />)} path="/editor/:projectId" />
              <Route element={lazyRoute('lab challenge', <LabChallengeRunner />)} path="/labs/:labId" />
            </Route>

            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
