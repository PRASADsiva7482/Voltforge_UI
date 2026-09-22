import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import keycloak from './keycloak'
import { syncUser } from './user'
import type { AppUser } from '../types/auth'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { checkSession, checkSignInAvailability, loginRedirectUri, USER_SYNC_TIMEOUT_MS } from './session'
import { useToastStore } from '../store/useToastStore'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [isRedirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const redirectPending = useRef(false)

  useEffect(() => {
    let active = true
    const syncController = new AbortController()
    let syncTimer: ReturnType<typeof setTimeout> | undefined
    const sessionEnded = () => {
      if (!active) return
      syncController.abort()
      setAuthenticated(false)
      setUser(null)
      setLoading(false)
      setError('Your session has ended. Sign in again to continue.')
    }
    keycloak.onAuthLogout = sessionEnded

    void (async () => {
      try {
        const session = await checkSession()
        if (!active) return
        setError(session.error)
        if (!session.authenticated || !keycloak.token) return
        syncTimer = setTimeout(() => syncController.abort(), USER_SYNC_TIMEOUT_MS)
        const synced = await syncUser(syncController.signal)
        if (!active || syncController.signal.aborted || !keycloak.authenticated || !keycloak.token) return
        setUser(synced)
        setAuthenticated(Boolean(synced))
      } catch {
        if (active) {
          keycloak.clearToken()
          setUser(null)
          setAuthenticated(false)
          setError('We could not prepare your account. Please try signing in again.')
        }
      } finally {
        clearTimeout(syncTimer)
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      clearTimeout(syncTimer)
      syncController.abort()
      if (keycloak.onAuthLogout === sessionEnded) keycloak.onAuthLogout = undefined
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    const interval = window.setInterval(() => {
      // Expiration changes auth state; only a user's login action navigates.
      void keycloak.updateToken(60).catch(() => keycloak.clearToken())
    }, 50_000)
    return () => window.clearInterval(interval)
  }, [isAuthenticated])

  const beginSignIn = useCallback((signup = false) => {
    if (redirectPending.current) return
    redirectPending.current = true
    setRedirecting(true)
    setError(null)
    void (async () => {
      try {
        await checkSession()
        // Keep the page and retry controls when the provider is offline.
        await checkSignInAvailability()
        const options = { redirectUri: loginRedirectUri() }
        if (signup) await keycloak.register(options)
        else await keycloak.login(options)
      } catch {
        const message = 'Sign-in is unavailable right now. Please try again in a moment.'
        setError(message)
        useToastStore.getState().addToast(message, 'error')
      } finally {
        redirectPending.current = false
        setRedirecting(false)
      }
    })()
  }, [])

  const login = useCallback(() => beginSignIn(), [beginSignIn])
  const signup = useCallback(() => beginSignIn(true), [beginSignIn])
  const logout = useCallback(() => {
    const url = keycloak.createLogoutUrl({ redirectUri: window.location.origin })
    keycloak.clearToken()
    window.location.assign(url)
  }, [])
  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated, isLoading, isRedirecting, error, login, logout, signup, user,
  }), [isAuthenticated, isLoading, isRedirecting, error, login, logout, signup, user])

  // Public routes always render. ProtectedRoute alone gates private content.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
