// VoltForge UI Runtime Configuration
// Loaded before main application bundle by index.html (<script src="/config.js"></script>)
window.config = {
  keycloak: {
    url: 'http://localhost:8080',
    realm: 'voltforge-realm',
    clientId: 'VOLT-UI',
  },
  api: {
    baseUrl: 'http://localhost:2001/voltForge-app/api/v1',
  },
};
