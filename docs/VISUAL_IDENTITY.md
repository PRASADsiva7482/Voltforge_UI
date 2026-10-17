# VoltForge visual identity and implementation audit

Implemented in the existing UI on 2026-10-17. The UI remains React 19, Vite, TypeScript, React Router, TanStack Query, Zustand, Lucide, custom CSS/components, React Konva, and Monaco. No new runtime dependency or separate dashboard was introduced.

## Design system

`src/styles/tokens.css` owns Graphite + Signal Orange and warm Ivory themes. Background, sidebar, surface, raised/inset surface, hover, text, border, action, status, focus, selection, radius, spacing, type and motion tokens are shared throughout the application. Legacy color-named brand variables have been migrated to semantic names. `workspace.css` defines shell, dashboard-adjacent controls, editor chrome, and responsive conventions; existing route CSS continues to own route layouts.

- Light primary fill is #B95418, with white labels (4.83:1). Dark primary is #FF8A35, with #171816 labels (7.58:1). Light orange text uses a separate darker token. Secondary/muted text is adjusted for contrast on raised surfaces; dark muted text is lifted from the original proposal.
- Primary is reserved for useful actions. Secondary buttons use neutral surfaces and borders; tertiary actions use a hover surface; destructive actions use error tokens. Buttons expose disabled/loading states and icon buttons retain accessible names and native tooltips.
- Compact 6px control and 10px panel radii; 4/8/12/16/24/32px spacing scale. Body and technical fonts remain local system fonts. Shell breakpoints are 1180px, 820px and 600px; the editor retains its specialized breakpoints. Coarse pointers receive larger shared control targets.
- Native selects, input placeholders, scrollbars, focus outlines, toasts, skeletons, dialogs, badges and error states follow the theme. Reduced-motion preferences suppress decorative transitions and animation.
- The existing SVG logo is preserved, including its internal artwork colors; surrounding navigation and wordmark styling use the new identity. No generated bitmap assets are required.

## Theme behavior

The existing `voltforge-theme` preference key and old persisted `{state:{theme}}` shape remain supported. An explicit preference wins over system changes. With no explicit preference, system changes are followed immediately. Settings offers System / Dark / Light. Cross-tab storage changes synchronize. Malformed or unavailable storage falls back safely. `public/theme-init.js` runs before styles/React to initialize the correct theme; `themeStore.ts` applies changes immediately. Monaco defines a custom VoltForge theme from these same CSS tokens.

## Route and feature audit

| Route / feature | Implementation |
| --- | --- |
| Dashboard | Asymmetric workspace overview, recent project ledger, lab spotlight and compact quick starts. Counts come from the paged API total, board catalog, and lab catalog. Removed invented inventory/architecture numbers and the incorrect public/private total derived from a partial page. Recent edits use backend timestamps. |
| My Projects | Existing project cards retained with redesigned controls; page navigation, page-scoped search/visibility/sort, clear filters, delete confirmation, success/error toasts. |
| Explore | Debounced backend search, URL-query synchronization, public-project pagination, template loading/error/empty states and useful navigation. |
| New Project | Existing routed creation flow retained. Validates nonblank names, 200-character names and 5000-character descriptions to match BL. Invalid board URL values require an explicit valid selection. Pending submissions are guarded, entries survive failures, and success opens the saved project with its selected board and pins. See `PROJECT_CONFIGURATION.md` for the subsequent full-stack integration. |
| Challenge / Engineering Labs | These are the same existing `/labs` destination, not separate invented services. Shared navigation/theme controls, category pressed states, tonal cards, and existing challenge execution retained. |
| Circuit editor / sandbox / shared project | Graphite/ivory mat, stronger major/minor grid hierarchy, orange selection/action chrome, themed panel inventory, firmware, validation, diagnostics, AI and instrument controls. Existing simulation, wire colors, board artwork and electrical component identities retained. |
| Canvas sizing | Resize observer now follows the mounted canvas container, including delayed project mounting and layout changes. Split canvas explicitly fills its pane. Together these fix a workspace staying at its initial 800x600 size. No circuit geometry, drag/pan guards, wire routing or model logic was rewritten. |
| Microcontroller configuration | Existing board search/family filters, geometry/capability feedback and project settings modal use the common surfaces and action colors. |
| Components | Inventory/library remain the editor's existing searchable palette and custom component studio; no new inventory backend or fake standalone route. |
| Profile / Settings | Warm surfaces, semantic status colors, appearance preference, readable inputs and mobile overflow corrections. Existing account/Keycloak actions remain. |
| Landing | Existing content and actions retained; brand, surfaces and controls migrated; decorative page gradients removed. Circuit illustration colors remain technical. |
| Navigation / overlays | Signal active-route marker, anchored account section, skip link, responsive mobile navigation, destination search suggestions, native keyboard language selection. Removed the inactive notification button because no notification endpoint/action exists. Shared dialogs trap/restore focus and Escape targets the topmost modal. Tabs/segmented controls support arrows/Home/End; dropdowns support Escape and arrow navigation. |
| Admin | Existing feature flag remains disabled. Shared design-system styles apply; enabling administration is outside this redesign. |

No fabricated activity feed, analytics chart, cloud-sync status, trained-model claim or populated backend fixture is shipped. Test-only browser fixtures are isolated inside the Vite test runner.

## BL and AI integration

BL already sorts owned projects by `updatedAt DESC` and provides pagination totals; the redesign consumes those contracts. Its validation limits are reflected in project creation. No BL source modification was needed. Java 25 / Spring Boot 4.1.1 Maven tests passed: 46 tests, zero failures/errors/skips. The running BL health and public-project endpoints returned HTTP 200; the public response includes the pagination fields consumed by the UI.

AI source currently uses `engine/llm.py` and `api/routes.py`. Its health endpoint previously reported `ready: true` even without a loaded neural model. It now distinguishes service availability from model readiness with `serviceReady`, `ready`, `neuralLoaded`, `responseMode`, and a meaningful status code. Model configuration, inference selection and model assets were not changed. The existing three security tests and two new readiness tests pass. The AI HTTP service was not listening on localhost:2002 during this work.

The editor no longer fabricates verified AI coverage from a local list after a failed request, or from substring matches against a component catalog. Coverage remains optional and fails closed: a catalog without coverage entries/summary shows unavailable, while search and placement remain usable. The current AI catalog endpoint does not supply that coverage evidence; exact coverage badges require a proper coverage report. The palette fixture now supplies its required auth/i18n providers, and its viewport-placement assertion follows the existing placement behavior.

## Verification and limits

- `npm test`: existing TypeScript, lint, security, simulation, canvas/routing/drag, PCB, AI presentation/proposal and component contracts pass. Lint retains pre-existing warnings; no new warnings are introduced by the theme/Monaco work.
- `npm run build`: TypeScript, production build and bundle budget pass.
- `npm run test:design-system`: actual route components with isolated auth/API fixtures, Dark/Light at 1440px and 390px, global theme persistence/system changes, Monaco, canvas sizing, search/empty/error states, validation, deletion cancellation and modal focus. Screenshots and machine-readable results are generated in ignored `docs/reports/visual-identity/`.
- Additional editor overlay checks use the same runner; `--interactions-only` skips the route screenshot sweep.
- The theme bootstrap is also tested before React/styles load, verifying the correct first-paint background.
- `npm run test:palette-browser`: all 24 checks pass, including 1000-item search/pagination, keyboard placement, narrow layout, custom-component draft retention, optional coverage error/retry states and rejecting catalog-only verification claims.
- The browser checks are Chrome checks. They do not establish a live authenticated save/delete/compile roundtrip, successful AI inference, other-browser compatibility or a formal accessibility certification. Those require the actual signed-in environment, available services and follow-up assistive-technology testing.

The production application still uses its real API and auth provider. This work was not deployed and does not alter Keycloak configuration.
