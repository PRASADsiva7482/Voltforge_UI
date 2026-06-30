import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <main className="app-shell">
      <Sidebar />
      <div className="app-content">
        <Outlet />
      </div>
    </main>
  )
}
