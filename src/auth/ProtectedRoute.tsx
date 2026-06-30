import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { CircuitBoard } from 'lucide-react'
import { useAuth } from './useAuth'

export function ProtectedRoute() {
  const location = useLocation()
  const auth = useAuth()
  const didRequestLogin = useRef(false)

  useEffect(() => {
    if (auth.isAuthenticated || didRequestLogin.current) return
    didRequestLogin.current = true
    auth.login()
  }, [auth])

  if (!auth.isAuthenticated) {
    return (
      <main className="auth-loader" aria-label="Redirecting to secure login">
        <div className="auth-loader__mark">
          <CircuitBoard size={30} />
        </div>
        <strong>Secure workspace</strong>
        <span>Redirecting to secure login</span>
      </main>
    )
  }

  if (location.pathname === '/app') return <Navigate replace to="/dashboard" />
  return <Outlet />
}
