import Keycloak from 'keycloak-js'

declare global {
  interface Window {
    config?: {
      keycloak?: {
        url?: string
        realm?: string
        clientId?: string
        pkceMethod?: 'S256' | false
      }
      api?: {
        baseUrl?: string
        wsUrl?: string
      }
      ai?: {
        baseUrl?: string
      }
    }
  }
}

export function getKeycloakConfig() {
  const runtimeKeycloak = typeof window !== 'undefined' ? window.config?.keycloak : undefined
  const url = runtimeKeycloak?.url || import.meta.env.VITE_KEYCLOAK_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080')
  const clientId = runtimeKeycloak?.clientId || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'VOLT-UI'
  const realm = runtimeKeycloak?.realm || import.meta.env.VITE_KEYCLOAK_REALM || 'voltforge-realm'
  const pkceMethod: 'S256' | false = runtimeKeycloak?.pkceMethod !== undefined
    ? runtimeKeycloak.pkceMethod
    : (typeof window !== 'undefined' && Boolean(window.crypto?.subtle) ? 'S256' : false)
  return { url, clientId, realm, pkceMethod }
}

const { url: keycloakUrl, clientId, realm } = getKeycloakConfig()

const keycloak = new Keycloak({
  clientId,
  realm,
  url: keycloakUrl,
})

export default keycloak
