// Served only by run-editor-render-tests.mjs; never imported by the application.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../../src/auth/AuthContext'
import CircuitEditorPage from '../../src/features/editor/CircuitEditorPage'
import { useCanvasStore } from '../../src/store/canvasStore'
import { useProjectStore } from '../../src/store/projectStore'
import { useSimulationStore } from '../../src/store/simulationStore'
import { usePcbStore } from '../../src/store/pcbStore'
import { ToastContainer } from '../../src/components/layout/ToastContainer'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/styles/components.css'
import '../../src/styles/editor.css'

const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } })
export default function Fixture() {
  const [user, setUser] = useState({ id: 'render-owner', keycloakId: 'render-owner', displayName: 'Render fixture', username: 'render-owner', role: 'USER' })
  window.__editorAudit.stores = { canvas: useCanvasStore, project: useProjectStore, simulation: useSimulationStore, pcb: usePcbStore }
  window.__editorAudit.setUser = setUser
  window.__editorAudit.queryClient = client
  return <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), isLoading: false, isRedirecting: false, error: null, login() {}, logout() { setUser(null) }, signup() {} }}>
    <ToastContainer />
    <Routes>
      <Route path="/editor/share" element={<CircuitEditorPage />} />
      <Route path="/editor/:projectId" element={<CircuitEditorPage />} />
      <Route path="/outside" element={<h1>Outside editor fixture</h1>} />
    </Routes>
  </AuthContext.Provider>
}
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={client}><BrowserRouter><Fixture /></BrowserRouter></QueryClientProvider></StrictMode>)
