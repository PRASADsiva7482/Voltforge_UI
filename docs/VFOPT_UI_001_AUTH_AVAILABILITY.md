# VFOPT-UI-001: public rendering and authentication availability

Public pages render while session discovery runs. The identity provider cannot
take over the page during background discovery or token-refresh failure. Private
routes wait for a bounded session/account check and then show an explicit sign-in
action and a link home when authentication is unavailable.

The change uses [Keycloak's supported silent SSO flow](https://www.keycloak.org/securing-apps/javascript-adapter),
with `silentCheckSsoFallback: false`, PKCE S256, and a same-origin callback at
`/silent-check-sso.html`. Explicit login callbacks skip the third-party cookie
probe. Login preserves the current path and query; the home page returns to the
dashboard. Authentication still requires an adapter-issued session and successful
account synchronization. There is no application mock-auth mode or stored token.

The public-project 401 regression also exposed an existing code-pane render loop:
its store selector allocated a fresh empty array when no project was loaded.
The fallback now sits outside the subscribed snapshot, keeping failed/denied
project loads from crashing the recovery path.

Session discovery has a 3.5-second application deadline. Account synchronization
has a separate 5-second abort deadline. A response arriving after the discovery
deadline cannot install a usable session. Login and signup check provider
availability through the backend with a 3.5-second abort deadline so offline failures leave
the current page and retry controls available. A provider that goes down after
that check can still fail during the subsequent explicit login navigation.

Before deploying, allow the exact application origins and
`<app-origin>/silent-check-sso.html` in the Keycloak client's redirect settings.
Retain the existing application redirect paths and token-endpoint CORS policy.
The discovery document must be readable by the backend. Verify the
callback is served as this static HTML file, including under the deployed CSP.
No live identity configuration was changed for this task.

Run from `Voltforge_UI`:

```powershell
rtk npm run build
rtk npm run lint
rtk proxy npm run test:auth-availability
```

The browser runner starts its own preview on port 3101, uses installed Chrome or
Edge (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`), and closes its browser/server afterward.
It tests the actual built app and installed Keycloak adapter. Failure, callback,
token, and API responses are simulated except the explicitly labeled configured
identity endpoint check. Synthetic tokens remain inside test contexts and are
never submitted to a real backend. Tests assert private-route gating, deep-link
return, public shares, failed account sync, delayed tokens and refresh failures.

The runner writes machine-readable results and screenshots under `docs/reports/`
while it runs. These generated artifacts are temporary; remove them after review.
They distinguish real-endpoint availability from simulated authenticated flows.
A development-mode check can be run with `-- --dev "Explicit login"`.

The earlier audit reproduced a top-level redirect to an offline identity endpoint
instead of the public home page. Its elapsed observation window was not a render
time. The new report records visible-heading timing and browser LCP/long tasks;
these single-run observations are not p95, a total laptop CPU attribution or an
overall performance sign-off.

Validation on 2026-09-11 passed the production build, bundle budget, lint, all 18
production browser scenarios and two development-mode explicit-login scenarios.
The real configured-endpoint check kept the home page visible without a top-level
identity redirect. Authenticated successes use the simulated protocol described
above and do not establish that the offline deployment can accept a real login.

Follow-up on 2026-09-12: the available Keycloak endpoint exposed a browser CORS
failure in the explicit availability probe. The UI now checks the backend's
`GET /auth/identity-health`, which probes only its configured issuer with a
two-second deadline, 128 KiB response cap and two-second shared cache. The UI
compares the issuer with its own configuration and preserves its deadline/retry
controls. The endpoint returns availability and issuer only; private account and
sync authorization is unchanged.

All 20 production browser scenarios now pass, including stalled probes and
mismatched issuers. Against the real DB/backend/Keycloak, public home stays usable
and Login reaches the real Keycloak form after ngrok's external Visit Site page.
See the root `docs/reports/vfopt-ui-010-live-dependencies.json`. No credentials
were submitted: full real-account login, sync, private project operations and
deployed redirect/CORS/CSP acceptance remain pending. The next implementation
item is **VFOPT-UI-011**, runtime-only dirty detection, following the measured
editor subscription changes in VFOPT-UI-010.

## Login handoff follow-up, 2026-09-26

The development runtime defaults in `public/config.js` set both service URLs to
the UI origin. Those defaults masked the configured `VITE_API_BASE_URL` and
`VITE_KEYCLOAK_URL`, so the login preflight could call the UI server instead of
the backend and the adapter could try Keycloak on the UI host. Development now
uses the Vite service URLs when the runtime values match those generated
same-origin defaults; explicit runtime endpoints and deployed same-origin
configuration retain precedence. The collaboration WebSocket follows the same
rule and derives its endpoint from the selected API URL when no explicit WS URL
is configured.

The interactive flow is now verified in order: the Login button awaits
`GET /auth/identity-health`, checks that the backend-reported issuer matches
the configured realm, and only then lets the Keycloak adapter start interactive
authorization. The browser regression verifies callback, account sync, and
return to the requested private route. Public startup no longer falls back from
silent SSO to a full-page redirect. Session discovery and explicit availability
checks are bounded at 3.5 seconds; account sync is bounded at 5 seconds. The
runtime selects PKCE S256 whenever browser Web Crypto is available.

Validation on 2026-09-26: production build and bundle budget passed; all 20
production auth browser scenarios passed; the development service-origin and
callback scenario passed. A real-browser login attempt against the currently
running services also stayed on the app and hit the configured backend. The
backend returned `available: false` (HTTP 503), and Keycloak discovery for
`voltforge-realm` returned HTTP 404. Therefore real account sign-in and
Dashboard access remain unavailable until that realm, client, and user
configuration are restored. The availability gate remains closed, and no live
credentials were submitted.
