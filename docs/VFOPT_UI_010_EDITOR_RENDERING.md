# VFOPT-UI-010: editor subscription isolation

The implementation removes high-frequency document and simulation subscriptions from `CircuitEditorPage`. The header uses shallow project metadata; actions read current documents when invoked. Simulation time, AVR telemetry, solver diagnostics, dirty indication, document synchronization and autosave have their own consumers. The palette subscribes only to its required canvas action, and the palette/code editor have measured memo boundaries.

The 25-node browser fixture passed 17 checks with the actual editor, canvas, Monaco and simulation engine. API responses and authentication in this fixture are isolated test data; the real dependency smoke check is a separate report.

| Stream (60 independent updates) | Before shell / palette / code commits | After shell / palette / code commits |
| --- | --- | --- |
| Runtime LED feedback | 60 / 60 / 60 | 0 / 0 / 0 |
| Simulation time | 59 / 59 / 59 | 0 / 0 / 0 |
| AVR workload | 60 / 60 / 60 | 0 / 0 / 0 |
| Solver diagnostics | 60 / 60 / 60 | 0 / 0 / 0 |
| Viewport | 60 / 60 / 60 | 0 / 0 / 0 |
| Code changes | 60 / 60 / 60 | 0 / 0 / 60 |
| PCB dimensions | 59 / 59 / 59 | 0 / 0 / 0 |

An initial value identical to the existing store value explains the 59-commit windows. The first runtime update from a clean document also avoids shell, palette and code commits. Its isolated dirty indicator can still change under the existing dirty policy.

The hidden clock/AVR/diagnostics windows prove that unused telemetry no longer reaches the shell. A separate mounted-clock check produces 30 clock-leaf commits and zero shell commits. These results do not claim zero work in the canvas, document synchronization or simulator.

The harness uses Vite development, React StrictMode, installed headless Chrome at 1366×768 and test-only layout-effect counters injected into actual components. Before/after fixture hashes are recorded. Counters are absent from production. Sixty updates per stream are spaced over separate animation frames; these are deterministic subscription probes, **not 60-second performance samples**. Raw scheduling proxies are retained in the JSON. Real Monaco typing recorded 38 key samples with a 31.1 ms event-to-second-frame p95 in the final run; this is not measured pixel paint or hardware input latency. Machine power mode and unrelated laptop activity were not controlled; timing is diagnostic, and the commit-count comparison is the main acceptance evidence.

Functional checks cover fresh code/geometry/viewport/PCB in save and share, save revision propagation, metadata updates, actual keyboard typing, actual canvas drag, simulation start/pause/step/resume/stop, permission revocation, and cancellation on navigation. Autosave sends the latest code after its ten-second interval despite nine seconds of continuous edits. All API writes in this suite are intercepted; no saved user project is modified. Compiler responses are fixture failures, so this suite does not establish real compiled AVR fidelity.

Validation also includes the existing UI regression suite, TypeScript, lint, production build and bundle budgets. Source inventory comparison preserves simulator/store implementation, backend configuration and prior user changes. Root launcher checks cover Spring vendor JSON decoding, ngrok discovery and owned-process cleanup. The existing UI suite exits successfully but its short-lived AI presentation/hardware harnesses still emit Vite dependency-scan shutdown warnings; those harnesses and AI implementation were not changed.

The live dependency check reproduced an additional VFOPT-UI-001 problem: browser discovery failed CORS even though the issuer was online. `session.ts` now calls the public backend `/auth/identity-health` endpoint. It probes only the configured issuer, accepts no caller-supplied URL, caps the response at 128 KiB and the request at two seconds, and shares results for two seconds. The UI retains its 3.5-second deadline and checks the returned issuer matches its build configuration. Existing account/sync endpoints still require authentication. Seven real-HTTP service tests and three HTTP/security tests cover this path; all 34 backend tests and packaging pass using the project's JDK 17 target. The initial JDK 25 Mockito run failed due to its instrumentation compatibility; no dependency or global Java setting was changed.

All 20 authentication browser scenarios pass, including provider offline, timeout, mismatched issuer, retry, deep-link callback and private-route guards. Against the real services, Spring health and auth health return 200, public home remains usable, and explicit Login reaches the actual Keycloak login form. A fresh browser encounters ngrok's external Visit Site page; the smoke check records accepting that step. Credentials were not submitted, so real account synchronization/private-project acceptance remains pending.

Full performance acceptance remains open: the audit's 5-cold/20-warm load matrix, 60-second traces, 100/500-node/high-pin circuits, pointer-to-paint and simulation-control latency, real authenticated project save/reload and multi-client collaboration were not established by this fixture. The backlog records `implemented_pending_representative_performance_validation` rather than claiming all scenario budgets passed.

Reproduce the editor check from `Voltforge_UI`:

```powershell
npm run test:editor-render
npm test
npm run build
```

Run the browser measurement alone, without another Vite test suite. It requires installed Chrome and access to the currently configured Monaco CDN. `--before` is only meaningful against the saved pre-change source; it does not automatically restore old files. The preserved baseline is [render-before.json](reports/vfopt-ui-010-render-before.json), and current results are [render-after.json](reports/vfopt-ui-010-render-after.json).

For the read-only live smoke check, start the root launcher with `-RequireIdentity`, then run `node scripts/check-app-live-dependencies.mjs` from the workspace root. It checks the actual backend, anonymous home and Keycloak login form without submitting credentials. Results are in `docs/reports/vfopt-ui-010-live-dependencies.json` at the root.

Next: **VFOPT-UI-011 — Stop serializing runtime state for dirty detection.** Full-document dirty comparison and the existing collaboration broadcast policy remain in `EditorDocumentSync.tsx`. The palette's catalogue sorting/grouping/windowing remains VFOPT-UI-012.
