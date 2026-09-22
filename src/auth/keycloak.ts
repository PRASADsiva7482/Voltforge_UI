import Keycloak from 'keycloak-js'

declare global {
  interface Window {
    config?: {
      keycloak?: {
        url?: string
        realm?: string
        clientId?: string
      }
      api?: {
        baseUrl?: string
      }
    }
  }
}

const runtimeKeycloak = typeof window !== 'undefined' ? window.config?.keycloak : undefined

const keycloakUrl = runtimeKeycloak?.url || import.meta.env.VITE_KEYCLOAK_URL
const clientId = runtimeKeycloak?.clientId || import.meta.env.VITE_KEYCLOAK_CLIENT_ID
const realm = runtimeKeycloak?.realm || import.meta.env.VITE_KEYCLOAK_REALM

const keycloak = new Keycloak({
  clientId,
  realm,
  url: keycloakUrl,
})


export default keycloak
