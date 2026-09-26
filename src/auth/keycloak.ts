import Keycloak from 'keycloak-js'

declare global {
  interface Window {
    config?: {
      baseUrls?: {
        BL?: string
        WS?: string
        AI?: string
        KEYCLOAK?: string
      }
      keycloak?: {
        realm?: string
        clientId?: string
      }
    }
  }
}

export function getKeycloakConfig() {
  const url = (typeof window !== 'undefined' ? window.config?.baseUrls?.KEYCLOAK : '') || ''
  const clientId = (typeof window !== 'undefined' ? window.config?.keycloak?.clientId : '') || ''
  const realm = (typeof window !== 'undefined' ? window.config?.keycloak?.realm : '') || ''
  const pkceMethod: 'S256' | false = typeof window !== 'undefined' && Boolean(window.crypto?.subtle) ? 'S256' : false

  return { url, clientId, realm, pkceMethod }
}

const { url: keycloakUrl, clientId, realm } = getKeycloakConfig()

const keycloak = new Keycloak({
  clientId,
  realm,
  url: keycloakUrl,
})

export default keycloak
