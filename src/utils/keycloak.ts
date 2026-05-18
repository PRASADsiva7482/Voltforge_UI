import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'https://copious-opposite-mangle.ngrok-free.dev',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'voltforge-realm',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'VOLT-UI',
});

export default keycloak;
