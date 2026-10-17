// =============================================================================
// VoltForge UI — Runtime Configuration
// =============================================================================
// Supports local development and production deployments dynamically.
// =============================================================================

const isLocalDev = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
);

const origin = typeof window !== 'undefined' ? window.location.origin : '';
const host = typeof window !== 'undefined' ? window.location.host : '';
const wsProto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ngrokKeycloakUrl = 'https://copious-opposite-mangle.ngrok-free.dev';

window.config = {
  // ── Base Service URLs ──────────────────────────────────────────────────────
  baseUrls: {
    BL: isLocalDev ? 'http://localhost:2001/voltForge-app/api/v1' : `${origin}/voltForge-app/api/v1`,
    WS: isLocalDev ? 'ws://localhost:2001/voltForge-app/ws-native' : `${wsProto}//${host}/voltForge-app/ws-native`,
    AI: isLocalDev ? 'http://localhost:2002/voltForge-ai' : `${origin}/voltForge-ai`,
    KEYCLOAK: ngrokKeycloakUrl,
  },

  // ── Keycloak Client Settings ───────────────────────────────────────────────
  keycloak: {
    url: ngrokKeycloakUrl,
    realm: 'voltforge-realm',
    clientId: 'VOLT-UI',
  },
};

