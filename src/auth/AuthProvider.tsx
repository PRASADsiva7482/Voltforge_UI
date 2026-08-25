import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircuitBoard } from 'lucide-react'
import keycloak from './keycloak'
import { syncUser } from './user'
import type { AppUser } from '../types/auth'
import { AuthContext, type AuthContextValue } from './AuthContext'

let keycloakInitPromise: Promise<boolean> | null = null

function initKeycloakSafely(): Promise<boolean> {
  if (import.meta.env.VITE_AUTH_MOCK === 'true') {
    console.warn('[Voltforge Auth] VITE_AUTH_MOCK is ignored because the API requires a real bearer token.')
    return Promise.resolve(false)
  }

  keycloakInitPromise ??= new Promise<boolean>((resolve) => {
    // Do not manufacture a local session when Keycloak is unavailable. The API
    // is protected and would reject the resulting requests with 401 responses.
    const timeout = setTimeout(() => {
      console.warn('[Voltforge Auth] Keycloak server unreachable. The workspace will remain signed out.')
      resolve(false)
    }, 3500)

    keycloak
      .init({
        checkLoginIframe: false,
        onLoad: 'check-sso',
        pkceMethod: 'S256',
      })
      .then((authenticated) => {
        clearTimeout(timeout)
        resolve(authenticated)
      })
      .catch((err) => {
        clearTimeout(timeout)
        console.warn('[Voltforge Auth] Keycloak init error:', err)
        resolve(false)
      })
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
      const authenticated = await initKeycloakSafely()
      setAuthenticated(authenticated)
      if (authenticated && keycloak.token) {
        const synced = await syncUser()
        setUser(synced)
        if (!synced) setAuthenticated(false)
      } else {
        setUser(null)
      }
    } catch {
      setAuthenticated(false)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!isAuthenticated || !keycloak.token) return undefined

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
      login: () => {
        try {
          keycloak.login({ redirectUri: dashboardRedirect() })
        } catch {
          setAuthenticated(false)
          setUser(null)
        }
      },
      logout: () => {
        try {
          keycloak.logout({ redirectUri: window.location.origin })
        } catch {
          setAuthenticated(false)
          setUser(null)
        }
      },
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
