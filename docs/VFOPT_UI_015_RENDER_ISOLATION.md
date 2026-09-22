# VFOPT-UI-015 — Reduce unnecessary schematic re-renders

Completed with scoped acceptance on 2026-09-19. The [task JSON](VFOPT_UI_015_RENDER_ISOLATION.json) contains the measurements, source hashes, checks and remaining work. This continues UI-014's component culling; it does not establish full application readiness.

Wire selection, electrical-property changes and pointer previews were rerendering every mounted wire. WireShape received a fresh selection callback and the complete wire array, and its endpoint subscriptions consumed runtime properties that do not affect geometry. CanvasMat was not actually memoized, WireToolbar subscribed to the whole canvas store, and memoized pins still received a changing full node.

WireShape, the grid and toolbar now have effective memo boundaries. Wire endpoints retain their geometry snapshot across property-only updates. Stable routing-peer arrays contain the same component-pair membership that the existing smart router uses for lane spacing. Own wire edits, endpoint geometry and membership changes still update their paths. Pin layout props stay stable, while separately subscribed hovered tooltips retain live voltage readings. Full document data and routing algorithms remain intact.

## Measured render work

The fixture uses the real CircuitCanvas with 100 resistors, 99 wires and scale 0.65. Both production and development runs produce the same action counts. These are component render/path computation counts, not Konva layer draw counts.

| Action | Wire renders before → after | Path computations before → after |
| --- | ---: | ---: |
| Select one wire | 99 → 1 | 99 → 0 |
| Update one runtime property | 2 → 0 | 2 → 0 |
| Edit one electrical property | 99 → 0 | 99 → 0 |
| Edit one wire color | 99 → 1 | 99 → 1 |
| Pan with unchanged mounted membership | 99 → 0 | 99 → 0 |
| Move wiring preview twice | 198 → 0 | 198 → 0 |

Property-only changes also reduce pin renders from two to zero. The grid and toolbar avoid unrelated updates. Selecting a wire intentionally refreshes its two endpoint components to show retained pin details at this zoom. Panning still redraws the grid.

## Timing and visual checks

Thirty native drag movements were measured from mouse capture to the last Konva layer draw. Routing was settled before each measurement. The original source snapshot was preserved before implementation and used again for the final baseline runs.

| Build | Drag p95 before → after, ms | Maximum before → after, ms |
| --- | ---: | ---: |
| Production | 35.4 → 28.5 | 71.3 → 28.6 |
| Development | 34.1 → 32.6 | 83.3 → 112.2 |

Both p95 values meet the 50 ms stress target. The development maximum remains a measured spike. The existing drag regression separately passes all nine checks at 47.2 ms p95 and 79.8 ms maximum; drag-end dispatch is at most 1.9 ms. UI-014's earlier 58 ms failure remains historical evidence. Fresh pre-UI-015 timing was already below 50 ms, so the entire difference from that earlier run cannot be attributed to this change.

The component-scene regression passes all 13 checks. Its 500-node pan/zoom p95 values are 26.7/21.6 ms; the 1000-node values are 22.9/23.0 ms. Both scenes retain 35 mounted components and 70 pins initially. Initial viewport screenshots are byte-identical before and after in each build mode; the production image was also visually inspected.

Konva still draws visible objects during movement. These measurements do not establish a universal 16.7 ms frame budget, reduced total laptop power usage or absence of long frames.

## Verification

- `npm test`: passes TypeScript, lint and all configured contracts, including six new render-isolation contracts.
- `npm run build`: passes production compilation and bundle budgets; initial static JavaScript remains 504.6 KiB across 13 chunks.
- `npm run test:render-isolation-browser` and `npm run test:render-isolation-development`: 11 checks each pass. They cover render counts, native selection, move/rotate/resize, endpoint retargeting, peer add/remove, native bend preview/commit, live wire/pin probes, theme, toolbar and read-only behavior.
- Existing browser suites pass: component scene 13, drag 9, routing 8. Current flow, undo/redo, routing-worker cancellation, culling, sound and teardown remain covered.
- Existing palette Fast Refresh and two short-lived SSR dependency-scan shutdown warnings remain; the full test command exits successfully.

The contract suite is included in `npm test`. Browser commands remain explicit because they run timing measurements. Baseline reruns require the original local files under `node_modules/.cache/vfopt-ui-015/before`; the runner fails if they are missing instead of silently measuring optimized code as the original baseline. Add `--before` to the underlying browser script, and `--production` for its production build. Raw reports and screenshots are ignored under `docs/reports/`. Task-specific copies preserve regression results, and the prior UI-014/016/017 report bytes were restored.

## Next work

**VFOPT-X-001 — Full-application performance baseline and validation.** This is the broader baseline already left open in UI-014. Measure the public and authenticated dashboards, project/editor opening, idle CPU/heap, sustained simulation and save/reopen against the UI and backend. Correlate slow requests with backend/database timing, and record any further fixes as concrete evidence-backed work items. AI implementation remains outside this scope.

The old root optimization backlog was removed during an earlier cleanup. This task keeps its evidence and continuation in retained task documents rather than inventing definitions for missing backlog items.

Continuation, 2026-09-20: the full-app baseline and **VFOPT-X-001-F001** revision fix are complete. See [the findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json) for live acceptance evidence and remaining work. **Next: VFOPT-X-001-F002 — native WebSocket limits and reconnect behavior.** Generated raw reports/screenshots/profiles were removed at the user's request; embedded JSON measurements remain.

Continuation, 2026-09-20: **VFOPT-X-001-F002 is complete for transport/runtime separation.** The 60-second production simulation stayed on one connection with no canvas publication or autosave; supported native/SockJS messages and terminal rejection handling passed. A separate large REST save failed twice. **Next: VFOPT-X-001-F008 — large-document save and database transaction reliability**, ahead of F003 rendering work. See the [retained findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json) for evidence and limits.

Continuation, 2026-09-21: **VFOPT-X-001-F008 is complete for save/database reliability.** Large Unicode canvas/code/PCB data, exact 4 MiB requests, concurrent writes, bounded failure recovery and development/production size-rejection recovery passed. Evidence is embedded in the [findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json). The initial renderer freeze was later traced to a bulk typed-text test, as corrected by F009 below.

Continuation, 2026-09-21: **VFOPT-X-001-F009 is complete with scoped acceptance.** The original freeze test used `keyboard.insertText`, which exercises Monaco's per-character typing path. Native 920,003-character single-line and 930,000-character multiline pastes were responsive. Removed a real 100 ms guard that lost immediate edits after file/view switches. Five focused browser checks, ten document checks, build/bundle budget and eight real production checks passed. Production pastes reached two frames in 146–187 ms; save/reopen, undo/redo, read-only mode and oversized-save recovery passed. Detailed evidence and limitations are in the [findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json). Reusable check: `npm run test:editor-render -- --code-editor --no-artifacts`. **Next: VFOPT-X-001-F003 — reduce visible-scene drawing cost during sustained mixed-component simulation.**
