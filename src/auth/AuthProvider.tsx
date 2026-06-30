import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircuitBoard } from 'lucide-react'
import keycloak from './keycloak'
import { syncUser } from './user'
import type { AppUser } from '../types/auth'
import { AuthContext, type AuthContextValue } from './AuthContext'

let keycloakInitPromise: Promise<boolean> | null = null

function initKeycloakOnce() {
  keycloakInitPromise ??= keycloak.init({
    checkLoginIframe: false,
    onLoad: 'check-sso',
    pkceMethod: 'S256',
  })
  return keycloakInitPromise
}

function dashboardRedirect() {
  return `${window.location.origin}/dashboard`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [user, setUser] = useState<AppUser | null>(null)

  const loadSession = useCallback(async () => {
    try {
      const authenticated = await initKeycloakOnce()
      setAuthenticated(authenticated)
      setUser(authenticated ? await syncUser() : null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    const interval = window.setInterval(() => {
      void keycloak.updateToken(60).catch(() => {
        keycloak.login({ redirectUri: dashboardRedirect() })
      })
    }, 50_000)

    return () => window.clearInterval(interval)
  }, [isAuthenticated])

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading,
      login: () => keycloak.login({ redirectUri: dashboardRedirect() }),
      logout: () => keycloak.logout({ redirectUri: window.location.origin }),
      signup: () => {
        try {
          keycloak.register({ redirectUri: dashboardRedirect() })
        } catch {
          keycloak.login({ action: 'register', redirectUri: dashboardRedirect() })
        }
      },
      user,
    }),
    [isAuthenticated, isLoading, user],
  )

  if (isLoading) {
    return (
      <main className="auth-loader" aria-label="Loading Voltforge">
        <div className="auth-loader__mark">
          <CircuitBoard size={30} />
        </div>
        <strong>Voltforge</strong>
        <span>Preparing workspace</span>
      </main>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
