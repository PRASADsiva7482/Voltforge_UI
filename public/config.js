// =============================================================================
// VoltForge UI — Runtime Configuration
// =============================================================================
// Supports local development and production deployments dynamically.
// =============================================================================

const isLocalDev = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
) && window.location.port === '3000';

const origin = typeof window !== 'undefined' ? window.location.origin : '';
const host = typeof window !== 'undefined' ? window.location.host : '';
const wsProto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';

window.config = {
  // ── Base Service URLs ──────────────────────────────────────────────────────
  baseUrls: {
    BL: isLocalDev ? 'http://localhost:2001/voltForge-app/api/v1' : `${origin}/voltForge-app/api/v1`,
    WS: isLocalDev ? 'ws://localhost:2001/voltForge-app/ws-native' : `${wsProto}//${host}/voltForge-app/ws-native`,
    AI: isLocalDev ? 'http://localhost:2002/voltForge-ai' : `${origin}/voltForge-ai`,
    KEYCLOAK: isLocalDev ? 'http://localhost:8080' : origin,
  },

  // ── Keycloak Client Settings ───────────────────────────────────────────────
  keycloak: {
    url: isLocalDev ? 'http://localhost:8080' : origin,
    realm: 'voltforge-realm',
    clientId: 'VOLT-UI',
  },
};
