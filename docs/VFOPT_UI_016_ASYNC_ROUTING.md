# VFOPT-UI-016: saved circuit routing

Implemented and verified on the 100-node/99-wire browser fixture. Live project validation and the total canvas responsiveness target remain open. The next implementation recommendation is **VFOPT-UI-017: Bound drag-time and drag-end rerouting**.

## Behavior

`loadCanvas` still hydrates components, reconciles legacy pin references, and upgrades eligible legacy straight wires. It now publishes the document before expensive automatic routing. A dedicated module worker runs the existing `routeWireBetweenNodes` algorithm. Manual bends, connection endpoints, authored fields, electrical behavior, and the routing algorithm are preserved.

The worker yields between wires after approximately 8 ms and reports progress at most every 100 ms. An individual route can take longer inside the worker. A 30-second period without progress fails the job, terminates the worker, and offers Retry. Failure retains the document and current wire preview; there is no blocking synchronous fallback. The worker terminates after success, failure, cancellation, or superseding work.

Each job captures a generation and authored node/wire references. Replacing or resetting a document, leaving the editor, or editing its geometry invalidates the old job. Synchronous edits during an unfinished load coalesce into a replacement job; completion can only publish to its captured document. Runtime feedback, selection, and viewport changes do not replace the routing geometry. Route completion updates derived layout without adding local dirty revisions, electrical model rebuilds, undo history, or collaboration echoes. Runtime node values remain intact. Local mutation and routing-status invalidation share one store publication.

## Saved route validity

`canvasLayout.routeCache` is optional and uses version `vf-grid-route-1`. Its `geometryKey` and `wiresKey` are exact serialized tuple strings, avoiding hash collisions. They bind ordered node IDs, positions, dimensions, rotations, pin IDs/names/coordinates, wire IDs/endpoints/modes, and bend coordinates. All obstacles participate. A routing algorithm change must bump this version.

Matching version, geometry, wires, and finite bend coordinates allow reuse without a worker. Missing, malformed, outdated, or mismatched metadata causes recomputation after normal hydration and pin reconciliation. Firmware and simulation properties are excluded. Cache generation/validation occurs on load and routing completion; runtime feedback and dirty-state subscriptions do not serialize these keys. Authored node/wire edits conservatively invalidate the cache, including property edits; a later load safely recomputes it.

Exact keys increase saved/share/collaboration payload size linearly with geometry and wires. The fixture's cache is 13,537 bytes within a 58,217-byte saved layout; cached reload takes 1.3 ms and reuses all 99 routes. Saving before routing completes is allowed and omits the cache; the next load recomputes routes. Derived completion alone does not trigger autosave, so its metadata is persisted on the next genuine save/edit.

Editor save/load, public share, collaboration payloads, and lab restoration carry the optional metadata. Lab restoration captures authored nodes instead of transient simulator feedback. The backend accepts canvas layout as a map and preserves its unknown optional fields; this task does not change backend code. Browser persistence and collaboration tests intercept HTTP/STOMP and do not establish live backend validation.

## Evidence and limits

On the same 100-resistor/99-auto-wire fixture and browser, five synchronous `loadCanvas` samples changed from **159.1–217.3 ms** to **1.7–2.5 ms**. Every uncached sample returned in the routing phase with 100 nodes available. Worker output exactly matched the existing router, including bends, and cache reload created no new worker. See `reports/vfopt-ui-016-routing-before.json` and `reports/vfopt-ui-016-routing-after.json` for raw values and matching fixture hashes.

This is a reduction in synchronous load work, not a measurement of total laptop CPU or pointer-to-paint. The subsequent first-yield proxy still measured **165.4–321.6 ms**, and browser long tasks remain. React/Konva scene construction and the existing `getWireRenderPoints` automatic display router still perform substantial work; that display path does not consume the stored automatic bends. Rendering and route representation work remain with UI-014, UI-015, UI-018, and UI-019. Regular drag and drag-end routing remains the next item, UI-017.

The raw long-task list filters tasks by start time and can miss a containing task that started immediately before a sample. It is diagnostic evidence, not a complete count of interaction-blocking tasks. The first acceptance criterion is therefore verified for synchronous hydration/dispatch and moving the old global router off the main thread, while full first-interaction responsiveness remains pending.

Validation commands:

- `npm test`: TypeScript, lint, simulator/store/document/palette contracts, and eight routing contract groups.
- `npm run build`: production worker output and existing bundle budgets.
- `npm run test:routing-browser`: eight actual-worker browser checks, timings, cache reuse/invalidation, cancellation, and failure/Retry.
- `node scripts/run-routing-editor-tests.mjs`: six actual editor/share/collaboration/lab checks using isolated services.
- `node scripts/run-editor-render-tests.mjs --report-prefix=vfopt-ui-016-editor`: existing editor rendering isolation regression.
- `npm run test:document-dirty-browser`: existing document persistence and runtime isolation regression.

The full test command passes with the existing palette fixture export warning and dependency-scan shutdown warnings in the existing AI presentation/hardware harnesses. No new lint warnings were reported. The 60-second running editor regression observes 1,200 runtime updates with zero dirty transitions, saves, collaboration broadcasts, or document serializations.

The aggregate receipt is `reports/vfopt-ui-016-implementation.json`. Earlier task report bytes are preserved; rerun evidence uses the `vfopt-ui-016-rerun-` prefix. The routing algorithm, simulator sources, lockfile, backend sources/configuration, and pre-existing staged pin registry are checked against the start-of-task inventory. Real account/database/STOMP writes, production CSP execution, larger circuits, and sustained whole-application CPU/heap measurements remain unverified.
