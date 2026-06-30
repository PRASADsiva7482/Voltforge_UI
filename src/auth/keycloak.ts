import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'VOLT-UI',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'voltforge-realm',
  url: import.meta.env.VITE_KEYCLOAK_URL || 'https://copious-opposite-mangle.ngrok-free.dev',
})

export default keycloak
