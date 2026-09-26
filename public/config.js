// =============================================================================
// VoltForge UI — Runtime Configuration
// =============================================================================
// Modify service URLs and Keycloak settings below without rebuilding the app.
// =============================================================================

window.config = {
  // ── Base Service URLs ──────────────────────────────────────────────────────
  baseUrls: {
    BL: 'http://localhost:2001/voltForge-app/api/v1',
    WS: 'ws://localhost:2001/voltForge-app/ws-native',
    AI: 'http://localhost:2002/voltForge-ai',
    KEYCLOAK: 'http://localhost:8080',
  },

  // ── Keycloak Client Settings ───────────────────────────────────────────────
  keycloak: {
    realm: 'voltforge-realm',
    clientId: 'VOLT-UI',
  },
};
