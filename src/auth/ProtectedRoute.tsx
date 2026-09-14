import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { CircuitBoard } from 'lucide-react'
import { useAuth } from './useAuth'
import { Button } from '../components/ui/Button'

export function ProtectedRoute() {
  const location = useLocation()
  const auth = useAuth()

  if (auth.isLoading) {
    return (
      <main className="auth-loader" aria-label="Checking sign-in">
        <div className="auth-loader__mark"><CircuitBoard size={30} /></div>
        <strong>Secure workspace</strong>
        <span role="status">Checking your sign-in…</span>
      </main>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <main className="auth-gate" aria-labelledby="sign-in-title">
        <div>
          <CircuitBoard size={30} aria-hidden="true" />
          <h1 id="sign-in-title">Sign in to continue</h1>
          <p>{auth.error ?? 'Sign in to open your workspace. You will return to this page.'}</p>
          <Button onClick={auth.login} isLoading={auth.isRedirecting} variant="primary">Sign in</Button>
          <p><Link to="/">Back to home</Link></p>
        </div>
      </main>
    )
  }

  if (location.pathname === '/app') return <Navigate replace to="/dashboard" />
  return <Outlet />
}
