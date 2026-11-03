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
      // No retry loop: explicit login starts a fresh page/session instead.
      document.querySelectorAll('iframe[title="keycloak-3p-check-iframe"], iframe[title="keycloak-silent-check-sso"]')
        .forEach((frame) => {
          // The adapter owns removal after a callback's token exchange. Avoid
          // removing its frame twice if that exchange finishes after timeout.
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
        if (authenticated && keycloak.token) {
          try {
            await keycloak.updateToken(30)
            setStoredAuthTokens({
              token: keycloak.token,
              refreshToken: keycloak.refreshToken,
              idToken: keycloak.idToken,
            })
            finish({ authenticated: true, error: null })
          } catch {
            clearStoredAuthTokens()
            keycloak.clearToken()
            finish({ authenticated: false, error: null })
          }
        } else {
          clearStoredAuthTokens()
          finish({ authenticated: false, error: null })
        }
      }).catch((err) => {
        console.warn('Keycloak session rehydration notice:', err)
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
      messageReceiveTimeout: SESSION_CHECK_TIMEOUT_MS,
      // An explicit callback needs code exchange, not another cookie probe.
      // Public share URLs containing only ?state= are not login callbacks.
      ...(hasLoginCallback() ? {} : {
        onLoad: 'check-sso' as const,
        silentCheckSsoRedirectUri: new URL('silent-check-sso.html', window.location.origin).href,
        // Public startup must never turn an unavailable silent check into a
        // top-level identity-provider navigation. Explicit login owns redirects.
        silentCheckSsoFallback: false,
      }),
    }).then((authenticated) => {
      if (settled) {
        // Reject late tokens after reporting that session discovery failed.
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
  // Only the current same-origin location is used, never an untrusted return URL.
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
    // Discovery endpoints can be reachable while browser CORS rejects them.
    // The backend probes only its configured issuer with a bounded timeout.
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
    // A realm name is not an issuer identity: a different host, port or path
    // can serve an unrelated realm with the same name.
    const isMatchingIssuer = configuration?.data?.issuer === issuer
    if (configuration?.success !== true || configuration.data?.available !== true
      || !isMatchingIssuer) throw new Error('Sign-in provider is unavailable or does not match the app configuration.')
  } finally {
    window.clearTimeout(timer)
  }
}

