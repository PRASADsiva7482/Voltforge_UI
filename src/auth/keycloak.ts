import Keycloak from 'keycloak-js'

const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL || 'https://copious-opposite-mangle.ngrok-free.dev'

const keycloak = new Keycloak({
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'VOLT-UI',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'voltforge-realm',
  url: keycloakUrl,
})


export default keycloak
