import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../../src/auth/AuthContext'
import CircuitEditorPage from '../../src/features/editor/CircuitEditorPage'
import { LabChallengeRunner } from '../../src/features/labs/LabChallengeRunner'
import { useCanvasStore } from '../../src/store/canvasStore'
import { useProjectStore } from '../../src/store/projectStore'
import { ToastContainer } from '../../src/components/layout/ToastContainer'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/styles/components.css'
import '../../src/styles/editor.css'
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } })
const user = { id: 'routing-owner', keycloakId: 'routing-owner', displayName: 'Routing fixture', username: 'routing-owner', role: 'USER' }
export default function Fixture() {
  window.__routingEditor.store = useCanvasStore
  window.__routingEditor.project = useProjectStore
  window.__routingEditor.navigate = useNavigate()
  return <AuthContext.Provider value={{ user, isAuthenticated: true, isLoading: false, isRedirecting: false, error: null, login() {}, logout() {}, signup() {} }}>
    <ToastContainer />
    <Routes>
      <Route path="/editor/share" element={<CircuitEditorPage />} />
      <Route path="/editor/:projectId" element={<CircuitEditorPage />} />
      <Route path="/labs/:labId" element={<LabChallengeRunner />} />
      <Route path="/outside" element={<h1>Outside routing fixture</h1>} />
    </Routes>
  </AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><Fixture /></BrowserRouter></QueryClientProvider></StrictMode>)
