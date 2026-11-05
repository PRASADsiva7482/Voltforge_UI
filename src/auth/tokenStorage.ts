/**
 * VoltForge Auth Session Token Storage
 *
 * Persists Keycloak authentication tokens in sessionStorage and localStorage
 * to maintain active sessions across hard browser refreshes (F5), tab reloads,
 * and cross-tab navigation, avoiding third-party cross-origin cookie blockage in iframes.
 */

export interface StoredAuthTokens {
  idToken?: string
  refreshToken?: string
  token: string
}

const STORAGE_KEY = 'vf_auth_session'

export function getStoredAuthTokens(): StoredAuthTokens | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage?.getItem(STORAGE_KEY) || window.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredAuthTokens>
    if (typeof parsed?.token === 'string' && parsed.token.length > 0 && typeof parsed?.refreshToken === 'string' && parsed.refreshToken.length > 0) {
      return {
        idToken: typeof parsed.idToken === 'string' ? parsed.idToken : undefined,
        refreshToken: parsed.refreshToken,
        token: parsed.token,
      }
    }
  } catch {
    clearStoredAuthTokens()
  }
  return null
}

export function setStoredAuthTokens(tokens: StoredAuthTokens): void {
  if (typeof window === 'undefined') return
  try {
    if (!tokens.token) {
      clearStoredAuthTokens()
      return
    }
    const serialized = JSON.stringify({
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken,
      token: tokens.token,
    })
    window.sessionStorage?.setItem(STORAGE_KEY, serialized)
    window.localStorage?.setItem(STORAGE_KEY, serialized)
  } catch (err) {
    console.warn('[VoltForge Auth] Could not cache auth tokens:', err)
  }
}

export function clearStoredAuthTokens(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage?.removeItem(STORAGE_KEY)
    window.localStorage?.removeItem(STORAGE_KEY)
  } catch {}
}
