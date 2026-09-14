# VFOPT-UI-027: PCB scene rendering

This change bounds PCB rendering by the viewport and preserves the complete physical layout in the store. Production browser stress checks pass on the recorded fixtures. This is not a claim that every frame, development session, or live account workflow is below the target.

## Rendering changes

- `pcbSceneGeometry.ts` caches footprint bounds, trace/ratline points and via bounds by immutable object identity using weak maps. Bounds include rotated bodies, external pads, drills, text overhang, copper stroke and shadow. Crossing lines remain visible even when both endpoints are outside the viewport. Invalid geometry fails open.
- Objects enter within 64 screen pixels of the viewport. Previously mounted objects remain until they leave a 256-pixel margin. This avoids repeatedly rebuilding objects when a pan or zoom reverses near the edge. The retained set contains only current mounted IDs; removed documents and objects do not accumulate in a history cache.
- The selected footprint or trace, active routing source and actively dragged footprint/via remain mounted. Layer visibility still applies. Native Stage motion updates the culling view through one animation-frame callback; only the final viewport is written to the document. External viewport changes and unmount cancel pending pan work.
- Stable callbacks, memoized shape components and reuse of unchanged React elements prevent unrelated footprints from rendering during movement and routing. Toolbar subscriptions are separate from scene updates. Pad callbacks read current routing state and permission changes invalidate the appropriate element props.
- Below scale 0.7, reference/pad text, orientation dots and small drill drawings are omitted. Copper pads and their routing hit targets remain. Stored dimensions, drill sizes, pad IDs, coordinates, connectivity and exports are unchanged.
- Footprints and short static copper traces use raster and hit caches. The combined persistent RGBA payload is capped at 32 MiB per mounted PCB scene and 256 KiB per object; oversized objects fall back to vector drawing. Buffers clear on visual changes, culling and unmount. Trace caching uses local coordinates so temporary buffers do not grow with the trace's position on the board. Browser canvas overhead and one temporary rasterization buffer are additional to the payload cap.
- The footprint layer now remains visible when either front copper or front silkscreen is visible. Turning silkscreen off no longer hides copper pads. Saved visibility settings and back-copper trace behavior are retained.

The ratline algorithm, schematic synchronization, document revisions, simulator and backend remain unchanged. Culling affects render objects only. The DRC/export modal still receives the full store arrays and retains its existing invalidation behavior.

## Evidence and interpretation

The implementation report is `reports/vfopt-ui-027-implementation.json`; the root optimization backlog contains the same acceptance decision and evidence hashes. Raw browser reports retain every latency sample.

| Production fixture measurement | Task-start source | Updated source |
| --- | ---: | ---: |
| 512-part first-use release p95, 20 document-load-separated samples | 247.4 ms | 48.5 ms |
| 512-part warm release p95, 40 samples | 224.2 ms | 35.1 ms |
| Footprints re-rendered per moved part | 512 | 1 |
| Mounted Konva objects on the mixed board | 16,383 | 3,845 |
| Mounted footprints / ratlines / copper objects | 1,024 / 1,016 / 2,049 | 256 / 254 / 513 |

The mixed document contains 1,024 footprints, 1,025 traces and 1,024 vias. Those complete arrays remain available after culling and reload. Its observed combined footprint/trace raster payload is 16,223,680 bytes, with 512 cached objects.

The production endurance test covers 20 seconds each of native pan, wheel zoom and routing. Pan has 289 observations, p95 43.5 ms and maximum 164.3 ms; zoom has 232 observations, p95 23.3 ms and maximum 49.9 ms; routing has 397 observations, p95 8.8 ms and maximum 14.3 ms. The 50 ms stress p95 target passes. Occasional expensive pan frames remain, particularly when entering new regions; the maximum is not hidden by the p95 result.

Release timing starts in capture-phase mouseup before Konva handles the release, and ends at the ratline layer's draw. Endurance timing records the final relevant layer draw observed across two animation frames for each delivered input, including native drawing and culling reconciliation. These are browser event-to-draw observations, not physical display scanout. The separate 30-wheel comparison includes automation and two-frame pacing and must not be presented as input-to-paint latency.

Production baseline builds substitute only the task-start `PcbCanvas.tsx` and `PcbFootprintRenderer.tsx` from the preserved inventory; their dependencies are unchanged. Both production lanes use identical fixture hashes, the same harness, 20/40 sample counts and installed headless Chrome at 1366x800. Development StrictMode measurements remain a separate 5/20-sample lane. The host's power policy and unrelated applications are not controlled, so these observations are not universal timing guarantees.

Development release p95 improves from 1,023.4 to 52.3 ms for the five load-separated samples, and from 1,136.2 to 37.6 ms for twenty warm samples. Its eleven behavior checks pass, while its first-use latency assertion still fails the 50 ms gate. The development command therefore intentionally returns a failing result; this is recorded as remaining validation, not relabeled as a passing production result.

## Checks and reproduction

```text
npm run test:pcb-scene-contract
npm run test:pcb-scene-browser
npm run test:pcb-scene-development
npm run test:pcb-sync-browser
npm run test:ratline-browser
npm test
npm run build
```

The eight geometry/resource contracts cover viewport inversion, inclusive edges, hysteresis, rotated/external pads and text, copper extents, immutable caches, invalid geometry and bounded allocation. Thirteen production browser checks cover rendering counts, final release, native pan persistence, selected/crossing traces, routing across the viewport, independent layers, distant detail, via drag, read-only and late events, active-drag retention, rotated/renamed cached pads, cache cleanup/save roundtrip and the endurance window.

The prior 15 PCB synchronization contracts, 15 ratline contracts, ten PCB browser checks and six ratline browser checks are rerun. Existing historical report bytes are restored after each run; task-specific copies and their hashes are recorded in `vfopt-ui-027-rerun-artifacts.json`. Full test/build receipts and logs are under the workspace's `.voltforge-logs/vfopt-ui-027-verification/` directory.

The browser fixtures block external HTTP and create isolated documents. They do not write a real project, call manufacturing services or change backend data. Before/after production screenshots were visually reviewed for missing visible geometry; rasterized text can differ in antialiasing and is not asserted to be pixel-identical.

## Remaining scope and next item

Rare pan spikes, development-mode overhead, higher device pixel ratios, much larger or unusually shaped footprints, full-app idle CPU/heap, authenticated persistence and manufacturing services remain outside the verified production stress result. Cache caps bound retained bitmap payload, not whole-browser memory. Axis-aligned bounds are conservative and scanning the document remains linear; this is not a spatial-index implementation.

Next recommended item: **VFOPT-UI-014 — Cull components and pins as well as wires**. It addresses the corresponding offscreen component, pin, hit-region and subscription costs in the schematic. Start with its own preserved baseline and retain selections, drag/probe anchors and wire endpoints. The existing UI-015 memoization work remains a separate subsequent item; no schematic implementation is included here.
