# VFOPT-UI-017: bounded schematic drag routing

Implemented and verified on the 100-component/99-wire schematic fixture. The next recommended implementation is **VFOPT-UI-025: Make schematic-to-PCB synchronization incremental**. Existing live-project, initial-render, and broader performance follow-ups remain open on their owning items.

## Result

The matching Chrome browser fixture uses 31 actual mouse-movement events and records event arrival to the component layer's Konva draw completion. Its p95 changed from **169.5 ms to 33.2 ms**, below the 50 ms fixture target. Five synchronous release-dispatch samples changed from **166.6–227.4 ms to 1.3–1.8 ms**. One post-change sample still took 53.9 ms; this is a p95 result, not a guarantee that every frame is below 50 ms.

The measurements are browser draw proxies, not physical display scanout, whole-application CPU attribution, or results for every circuit size/device. Intermediate runs ranged from approximately 26 to 47 ms p95; the report links the final clean run and immutable pre-change baseline. No total laptop-load percentage is claimed.

## Gesture and routing behavior

- Native Konva movement remains immediate. Store geometry updates coalesce through one requestAnimationFrame callback; releasing flushes the latest coordinates and cancels an older queued frame. Repeating identical geometry does no document, history, or routing work.
- The wire array stays unchanged during movement. Only endpoint subscribers update, using a cheap automatic-wire preview that does not scan unrelated wires. Other geometry callers use cached node-to-wire adjacency rather than searching all wires for incident connections.
- A gesture captures one authored undo snapshot on its first actual change. Runtime feedback stays outside the snapshot. Final geometry and breadboard topology commit before routing; derived worker completion adds no local dirty revision, model rebuild, or undo entry.
- Final routing uses the cancellable UI-016 worker. With a valid pre-gesture cache, its conservative selection includes changed endpoints and routes whose bounding corridors overlap either the old or new obstacle bounds. The margin includes the router's 18 px obstacle padding and grid-rounding allowance. A global routing-grid extent change, changed node membership/order, or unknown pre-gesture layout safely falls back to routing all automatic wires in the worker.
- Existing automatic routes outside affected corridors retain their bends and wire object identities. Manual bends, IDs, labels, colors, connections, and the canonical routing algorithm remain unchanged. Worker results retain UI-016 generation/reference guards, timeout, failure handling, and Retry.
- Document replacement, undo, read-only changes, and unmount cancel pending gesture callbacks. Late events cannot update a new document with the same node IDs. Nested control drags cannot bubble into a component geometry gesture; stage drag guards remain intact.

Routing jobs belong to the editor/lab document lifecycle. A scene can remount while its document remains open; only the document owner cancels its routing job. Scene cleanup cancels its own gesture callbacks. Saved-project and lab regression tests cover this ownership under React StrictMode.

Route planning scans the document once in the worker at release. It is conservative rather than a spatial-tree implementation, and may reroute additional wires. Nodes and authored arrays still involve O(N) copying/reconciliation per published frame, and the first history snapshot still serializes the authored document once per gesture. These are explicit remaining costs, not repeated whole-wire routing during movement.

## Rendering integration

Component wrappers are memoized so the required gesture-start/end updates do not redraw every unchanged React component. Incident wires remain mounted while a dragged endpoint moves into view. A separate committed-geometry revision refreshes culling and current-flow geometry after release, including documents with only manual wires.

Current-flow particles on moving connections are temporarily omitted during the gesture; other connections continue animating and solver state continues unchanged. Their paths resume after release. The browser test verifies that flow paths do not recompile on every movement frame.

The existing final display router still differs from the stored automatic-route calculation: `getWireRenderPoints` uses its existing smart display route. Consolidating those representations remains UI-018/UI-019. This change preserves the existing final display behavior and validates stored endpoint/obstacle routing; it does not claim to fix pre-existing display-router limitations. The UI-016 load regression still returns from synchronous dispatch in 1.6–4.3 ms, but its scene-mount first-yield proxy was 437.5–1,465.3 ms on this rerun. That rendering delay remains open; the run does not isolate the cause of the difference from older timings. Initial scene mounting, legacy PCB trace overlay performance, larger circuits, sustained CPU/heap, touch hardware, live authenticated persistence, and production CSP behavior are not accepted as performance-complete here.

## Verification

- `npm test`: TypeScript, lint, existing worker/runtime/model/simulator/document/palette/routing suites, plus 14 new drag contract groups.
- `npm run test:drag-browser`: nine browser checks covering actual mouse movement, final route equivalence, undo/redo, a 100-event Konva burst, current-flow paths, permission changes, and unmount.
- `npm run test:routing-browser`: eight UI-016 worker/load/cache/cancellation regression checks.
- `node scripts/run-routing-editor-tests.mjs`: six editor/save/share/collaboration/lab regressions with isolated HTTP/STOMP services.
- `node scripts/run-editor-render-tests.mjs --report-prefix=vfopt-ui-017-editor`: 17 editor isolation, simulation, save, autosave, permission, and cleanup checks.
- `npm run build` and `npm run lint`: production bundle/worker checks and lint. The pre-existing palette fixture export warning remains. The full suite also prints existing dependency-scan shutdown warnings in the AI presentation/hardware harnesses; their assertions pass.

The new contracts independently check one publication for 1,000 queued moves, no-op suppression, obstacle entry/removal, distant-route reuse, grid-bound fallback, stale jobs and frames, runtime/history separation, failed-worker retry, rotation/resize, and actual MNA breadboard pin connectivity before/after dragging and undo.

Evidence: `reports/vfopt-ui-017-implementation.json`, `reports/vfopt-ui-017-drag-before.json`, `reports/vfopt-ui-017-drag-after.json`, and `reports/vfopt-ui-017-drag-contract-tests.json`. Historical reports are preserved byte-for-byte; fresh reruns use the `vfopt-ui-017-rerun-` prefix. Backend source/configuration, simulator calculation sources, the wire-routing algorithm, the lockfile, and the user's staged pin registry are checked against the 353-file task-start inventory.
