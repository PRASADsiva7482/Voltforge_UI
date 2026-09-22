# VFOPT-UI-014 — Schematic component and pin culling

Implemented and verified against the scoped production acceptance on 2026-09-19. The full application is not declared complete. Machine-readable status, checks and remaining work are in [VFOPT_UI_014_COMPONENT_CULLING.json](VFOPT_UI_014_COMPONENT_CULLING.json).

## Change

CircuitCanvas previously mounted every component, pin and associated visual subscription, including parts far offscreen. It now queries a spatial index of conservative authored component bounds, with 128 screen pixels of entry overscan and a 384-pixel exit margin. Bounds include rotation, external pins, labels, glow and sensor controls. The larger exit margin limits remounting at viewport edges; oversized shapes have a bounded fallback.

Selected, dragged, wired and probed components and wire-edit endpoints remain resident. DOM pointer capture keeps nested controls alive when they stop Konva bubbling. Drag-only preview geometry stays out of the scene visibility snapshot until release; other edits and document replacement update it immediately. The component itself continues to read its live coordinates. Distant zoom removes pin labels while preserving physical hit targets and interaction detail. The legacy schematic PCB pad layer uses the same visible component set.

Simulation and routing still receive every node and wire. Sound transition ownership moved to a document-level subscription because unmounting an offscreen visual must not silence a buzzer or replay a click when panning back. Offscreen visual animations can now release their timers while sound remains active.

## Production measurements

Headless Chrome 153.0.8010.48, 1280×700 CSS-pixel canvas, DPR 1; 30 actual pan and 30 wheel inputs per size. All load-time wire migration/routing finishes before measuring. Values are before → after. Input-to-Konva-draw completion is a paint proxy; JS heap is one post-GC sample, not total process/GPU memory.

| Stored nodes | Mounted components | Mounted pins | Pan p95 ms | Zoom p95 ms | JS heap MiB |
| --- | --- | --- | --- | --- | --- |
| 500 | 500 → 35 | 1000 → 70 | 135.2 → 44.2 | 109 → 31.5 | 26.8 → 7.5 |
| 1000 | 1000 → 35 | 2000 → 70 | 347.7 → 46.1 | 288.7 → 42 | 45.8 → 9.5 |

Both documents mount 42 components after a distant pan and retain all stored nodes and wires. The 500-node acceptance fixture meets the 50 ms stress target. The extra 1000-node result and maximum timings remain explicit in the JSON. Median layer draw count stays at four per measured pan input; the saving is the amount of scene work per draw. Initial viewport PNG files are byte-identical and were visually inspected.

## Verification and remaining work

- `npm test` and `npm run build` pass, including 11 new geometry/audio contracts. Initial static JavaScript remains 504.6 KiB across 13 chunks.
- `npm run test:component-scene-browser` passes 13 checks: culling, native pan, retained interactions, offscreen wiring, read-only probes, drag/history, rotated external pins, dense breadboards, sound, nested controls, legacy pads and PNG export.
- `npm run test:routing-browser` passes all eight checks.
- `npm run test:drag-browser` still fails its development timing check: 58 ms p95 against 50 ms. Eight functional/lifecycle checks pass. The preserved pre-change source also fails the timing check at 56.9 ms; this remains open and is not represented as a passing regression suite.
- Existing palette Fast Refresh and short-lived SSR dependency-scan shutdown warnings remain. They do not fail the full test command.

Full authenticated persistence, long simulation/idle CPU and heap runs, other DPI/hardware and the normal 16.7 ms target are not verified by this isolated fixture. A visible large breadboard retains all its pin hit targets. This is a viewport optimization, not a claim that every all-visible workload is fast.

## Reproduction and continuation

Run `npm run test:component-scene-contract` and `npm run test:component-scene-browser`. The original three-file source snapshot is local under `node_modules/.cache/vfopt-ui-014/before`; `node scripts/run-component-scene-browser-tests.mjs --before` uses it. Preserve/restore that snapshot when comparing against the original code. Do not treat a newly captured baseline from already optimized code as the original measurement. `npm run test:drag-browser -- --ui014-baseline` uses the same snapshot for the development comparison. Raw reports are generated under ignored `docs/reports/`; the task JSON retains the summarized evidence.

UI-027's committed implementation and historical document remain present. The later cleanup removed the former root backlog and old raw reports, so they were not recreated or presented as newly verified. Its recommendation to proceed with schematic culling has now been addressed.

The original next item was VFOPT-UI-015 — reduce unnecessary schematic re-renders, including the development drag timing failure above.

Continuation, 2026-09-19: **UI-015 is now completed with scoped acceptance** in [VFOPT_UI_015_RENDER_ISOLATION.json](VFOPT_UI_015_RENDER_ISOLATION.json) and [its notes](VFOPT_UI_015_RENDER_ISOLATION.md). The existing drag suite now passes all nine checks at 47.2 ms p95; its 79.8 ms maximum remains explicit. The original failed run above is historical, and a faster fresh baseline means this difference cannot all be attributed to UI-015. Component-scene and routing suites also pass. **Next: VFOPT-X-001 — full-application performance baseline and validation.**

Continuation, 2026-09-20: the full-app baseline and **VFOPT-X-001-F001** revision fix are complete. See [the findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json) for live acceptance evidence and remaining work. **Next: VFOPT-X-001-F002 — native WebSocket limits and reconnect behavior.** Generated raw reports/screenshots/profiles were removed at the user's request; embedded JSON measurements remain.

Continuation, 2026-09-20: **VFOPT-X-001-F002 is complete for transport/runtime separation.** The 60-second production simulation stayed on one connection with no canvas publication or autosave; supported native/SockJS messages and terminal rejection handling passed. A separate large REST save failed twice. **Next: VFOPT-X-001-F008 — large-document save and database transaction reliability**, ahead of F003 rendering work. See the [retained findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json) for evidence and limits.

Continuation, 2026-09-21: **VFOPT-X-001-F008 is complete for save/database reliability.** Large Unicode canvas/code/PCB data, exact 4 MiB requests, concurrent writes, bounded failure recovery and development/production size-rejection recovery passed. Evidence is embedded in the [findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json). The initial renderer freeze was later traced to a bulk typed-text test, as corrected by F009 below.

Continuation, 2026-09-21: **VFOPT-X-001-F009 is complete with scoped acceptance.** The original freeze test used `keyboard.insertText`, which exercises Monaco's per-character typing path. Native 920,003-character single-line and 930,000-character multiline pastes were responsive. Removed a real 100 ms guard that lost immediate edits after file/view switches. Five focused browser checks, ten document checks, build/bundle budget and eight real production checks passed. Production pastes reached two frames in 146–187 ms; save/reopen, undo/redo, read-only mode and oversized-save recovery passed. Detailed evidence and limitations are in the [findings backlog](VFOPT_X_001_FINDINGS_BACKLOG.json). Reusable check: `npm run test:editor-render -- --code-editor --no-artifacts`. **Next: VFOPT-X-001-F003 — reduce visible-scene drawing cost during sustained mixed-component simulation.**
