import keycloak, { getKeycloakConfig } from './keycloak'
import api, { getBaseURL } from '../api/client'

export const SESSION_CHECK_TIMEOUT_MS = 3500
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
      finish({ authenticated, error: null })
    }).catch((err) => {
      console.warn('Keycloak session check notice:', err)
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
    const response = await fetch(`${getBaseURL()}/auth/identity-health`, {
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Sign-in service unavailable.')
    const configuration = await response.json() as { success?: boolean; data?: { issuer?: string; available?: boolean } }
    const realmSuffix = `/realms/${encodeURIComponent(realm)}`
    const isMatchingIssuer = configuration.data?.issuer === issuer
      || (Boolean(configuration.data?.issuer?.endsWith(realmSuffix)) && issuer.endsWith(realmSuffix))
    if (configuration.success !== true || configuration.data?.available !== true
      || !isMatchingIssuer) throw new Error('Sign-in provider is unavailable or does not match the app configuration.')
  } finally {
    window.clearTimeout(timer)
  }
}

