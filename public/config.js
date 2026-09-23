// Polyfill crypto.randomUUID for non-secure HTTP contexts if not natively supported
if (typeof window !== 'undefined' && window.crypto && !window.crypto.randomUUID) {
  window.crypto.randomUUID = function() {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function(c) {
      return (c ^ window.crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
    });
  };
}

// =============================================================================
// VoltForge UI — External Runtime Configuration
// Loaded by index.html before React initializes (<script src="/config.js"></script>)
// =============================================================================
window.config = {
  keycloak: {
    url: window.location.origin,
    realm: 'voltforge-realm',
    clientId: 'VOLT-UI',
    pkceMethod: false, // Set to 'S256' when HTTPS is configured, or false for plain HTTP
  },
  api: {
    baseUrl: window.location.origin + '/voltForge-app/api/v1',
    wsUrl: (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/voltForge-app/ws-native',
  },
  ai: {
    baseUrl: window.location.origin + '/voltForge-ai',
  },
};
