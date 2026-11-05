import keycloak, { getKeycloakConfig } from './keycloak'
import { getBaseURL } from '../api/client'
import { clearStoredAuthTokens, getStoredAuthTokens, setStoredAuthTokens } from './tokenStorage'

export const SESSION_CHECK_TIMEOUT_MS = 8000
export const USER_SYNC_TIMEOUT_MS = 5000

type SessionCheck = { authenticated: boolean; error: string | null }
let sessionCheck: Promise<SessionCheck> | undefined

function hasLoginCallback() {
  return [window.location.search.slice(1), window.location.hash.slice(1)].some((part) => {
    const params = new URLSearchParams(part)
    return params.has('state') && (params.has('code') || params.has('error'))
  })
}

// Share the single adapter initialization across StrictMode mounts.
export function checkSession(): Promise<SessionCheck> {
  sessionCheck ??= new Promise((resolve) => {
    let settled = false
    let callbackInFlight = false
    const observeCallback = (event: MessageEvent) => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="keycloak-silent-check-sso"]')
      if (event.origin === window.location.origin && frame && event.source === frame.contentWindow) {
        callbackInFlight = true
      }
    }
    window.addEventListener('message', observeCallback)
    const finish = (result: SessionCheck) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.removeEventListener('message', observeCallback)
      resolve(result)
    }
    const timer = window.setTimeout(() => {
      finish({
        authenticated: false,
        error: hasLoginCallback() ? 'The sign-in service did not respond. Please try signing in again.' : null,
      })
      keycloak.clearToken()
      document.querySelectorAll('iframe[title="keycloak-3p-check-iframe"], iframe[title="keycloak-silent-check-sso"]')
        .forEach((frame) => {
          if (!callbackInFlight || frame.getAttribute('title') !== 'keycloak-silent-check-sso') frame.remove()
        })
    }, SESSION_CHECK_TIMEOUT_MS)

    const kcConfig = getKeycloakConfig()
    const stored = !hasLoginCallback() ? getStoredAuthTokens() : null

    if (stored?.token && stored?.refreshToken) {
      void keycloak.init({
        token: stored.token,
        refreshToken: stored.refreshToken,
        idToken: stored.idToken,
        pkceMethod: kcConfig.pkceMethod,
        checkLoginIframe: false,
        messageReceiveTimeout: SESSION_CHECK_TIMEOUT_MS,
      }).then(async (authenticated) => {
        if (settled) {
          if (authenticated) keycloak.clearToken()
          return
        }
        try {
          // Rehydrate token; updateToken(30) refreshes access token if within 30s of expiry
          await keycloak.updateToken(30)
          if (keycloak.token) {
            setStoredAuthTokens({
              token: keycloak.token,
              refreshToken: keycloak.refreshToken,
              idToken: keycloak.idToken,
            })
            finish({ authenticated: true, error: null })
            return
          }
        } catch (refreshErr) {
          console.warn('[VoltForge Auth] Refresh token expired, attempting full refresh:', refreshErr)
          try {
            await keycloak.updateToken(-1)
            if (keycloak.token) {
              setStoredAuthTokens({
                token: keycloak.token,
                refreshToken: keycloak.refreshToken,
                idToken: keycloak.idToken,
              })
              finish({ authenticated: true, error: null })
              return
            }
          } catch {}
        }
        clearStoredAuthTokens()
        keycloak.clearToken()
        finish({ authenticated: false, error: null })
      }).catch(async (err) => {
        console.warn('Keycloak session rehydration notice:', err)
        if (stored.refreshToken) {
          try {
            await keycloak.updateToken(-1)
            if (keycloak.token) {
              setStoredAuthTokens({
                token: keycloak.token,
                refreshToken: keycloak.refreshToken,
                idToken: keycloak.idToken,
              })
              finish({ authenticated: true, error: null })
              return
            }
          } catch {}
        }
        clearStoredAuthTokens()
        keycloak.clearToken()
        finish({
          authenticated: false,
          error: null,
        })
      })
      return
    }

    void keycloak.init({
      checkLoginIframe: false,
      pkceMethod: kcConfig.pkceMethod,
      messageReceiveTimeout: 2000,
    }).then((authenticated) => {
      if (settled) {
        if (authenticated) keycloak.clearToken()
        return
      }
      if (authenticated && keycloak.token) {
        setStoredAuthTokens({
          token: keycloak.token,
          refreshToken: keycloak.refreshToken,
          idToken: keycloak.idToken,
        })
      }
      finish({ authenticated, error: null })
    }).catch((err) => {
      console.warn('Keycloak session check notice:', err)
      clearStoredAuthTokens()
      finish({
        authenticated: false,
        error: hasLoginCallback() ? 'Sign-in failed. Please try signing in again.' : null,
      })
    })
  })
  return sessionCheck
}

export function loginRedirectUri() {
  const { origin, pathname, search, hash } = window.location
  return pathname === '/' ? `${origin}/dashboard` : `${origin}${pathname}${search}${hash}`
}

export async function checkSignInAvailability() {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS)
  try {
    const config = getKeycloakConfig()
    const base = (keycloak.authServerUrl || config.url)?.replace(/\/$/, '')
    const realm = keycloak.realm || config.realm
    if (!base || !realm) throw new Error('Sign-in is not configured.')
    const issuer = `${base}/realms/${encodeURIComponent(realm)}`
    const headers = new Headers()
    headers.set('ngrok-skip-browser-warning', 'true')
    const response = await fetch(`${getBaseURL()}/auth/identity-health`, {
      signal: controller.signal,
      credentials: 'same-origin',
      headers,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Sign-in service unavailable.')
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw new Error('Sign-in service returned an invalid availability response.')
    }
    const configuration = await response.json() as { success?: boolean; data?: { issuer?: string; available?: boolean } }
    const isMatchingIssuer = configuration?.data?.issuer === issuer
    if (configuration?.success !== true || configuration.data?.available !== true
      || !isMatchingIssuer) throw new Error('Sign-in provider is unavailable or does not match the app configuration.')
  } finally {
    window.clearTimeout(timer)
  }
}
