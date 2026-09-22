# VFOPT-UI-026: Large-net ratline calculation

The ratline engine now uses a dense Prim calculation that evaluates each unordered pad pair once. Its distance work is quadratic, replacing the repeated connected-to-unconnected scans. Four temporary typed arrays carry the nearest distance, parent, insertion order and selected flag: 17 bytes per pad of array payload, excluding pad/edge objects and runtime allocation. No quadratic distance matrix is retained.

Exact compatibility matters here. The original engine chose equal-distance edges by connected-pad insertion order, then target pad index. The new calculation retains those ties, `Math.hypot` rounding, ratline IDs, output order and transformed pad coordinates. A preserved copy of the former engine is the regression oracle. Malformed nonfinite coordinates retain a compatibility fallback; the measured finite fixtures use the new algorithm.

Each schematic-to-PCB synchronization session owns an engine cache. Unchanged footprint geometry reuses world pad points, and unchanged nets reuse their spanning trees and visible ratlines. Moving a footprint rebuilds only its affected nets. A footprint with pads on several nets invalidates each changed pad net. Cache maps are pruned to current geometry; PCB load/reset replaces the owner, and an empty schematic clears its engine cache.

Trace endpoints are indexed in spatial cells in both directions. The existing strict 0.05-coordinate tolerance, endpoint-only rule, and independence from trace net labels/layers are preserved. Trace edits refresh suppression without rebuilding any spanning trees. Trace changes still inspect cached edges across nets, and coincident endpoint buckets can require multiple candidate checks. These are bounded by the current document, not a retained history of removed nets.

## Measurements

Both engine versions ran on identical deterministic 32/64/128/512-pad single-net fixtures. The browser moved one connected footprint five times per size. The separate Node lane ran five GC-separated fresh-cache calls and twenty warm-JIT fresh-cache calls per size. Fixture and output hashes match before and after.

| Single-net pads | Browser median before | Browser median after | Distance evaluations before | After |
| --- | --- | --- | --- | --- |
| 32 | 0.7 ms | 0.2 ms | 5,456 | 496 |
| 64 | 2.1 ms | 0.1 ms | 43,680 | 2,016 |
| 128 | 16.8 ms | 0.4 ms | 349,504 | 8,128 |
| 512 | 1,189.9 ms | 4.7 ms | 22,369,536 | 130,816 |

The 512-pad Node warm median decreased from 1,817.4 ms to 8.2 ms. On a mixed board containing four 128-pad nets, moving one footprint evaluated only 8,128 distances and retained the other 381 ratline objects. Adding/removing a routed trace evaluated zero new distances.

Separate Chrome allocation sampling included objects collected by both minor and major GC, with three calls per size/version after two warmups. The median estimated cumulative engine allocations per call were:

| Pads | Before, bytes | After, bytes |
| --- | --- | --- |
| 32 | 72,124 | 31,400 |
| 64 | 565,908 | 67,800 |
| 128 | 5,566,136 | 197,664 |
| 512 | 266,779,592 | 1,909,576 |

These are sampled cumulative allocation estimates, not peak RAM, retained heap or laptop memory savings. Sampling intervals and profile heads are recorded for review. The Node heap-delta diagnostics are also retained, with explicit GC limitations. Profiling was kept separate from timing measurements.

## Interaction boundary and remaining work

The actual 512-pad PCB mouse fixture ran for 60 seconds before and after. Event arrival to footprint-layer draw p95 was 26.9 ms before and 27.1 ms after. Both are within the 50 ms stress target. Movement already performed zero ratline computations and published only the final placement; this task preserves that behavior.

The measured mouse release calculation fell from 1,212.1 ms to 5.2 ms. The final ratline-layer redraw still arrived after 464.3 ms, down from 1,875.4 ms in the paired release. These are single-release observations, not p95 release claims. The remaining delay includes work outside the calculation entrypoint, such as store/React/Konva reconciliation and drawing; those contributions were not individually profiled here. This task does **not** close the overall release-to-final-redraw budget.

The next recommended item is **VFOPT-UI-027: Cull and simplify the PCB scene independently of schematic culling**. The scene still maps all footprints, pads, traces and ratlines and creates changing callbacks. It is the next source-identified target for the remaining redraw delay. Full release responsiveness remains an open acceptance boundary until that work is measured.

No new worker is needed for the measured 32–512-pad calculation range: the largest browser calculation was 5.3 ms. This range is a tested fixture range, not a declared product maximum. Larger boards, many coincident traces, sustained whole-system resource use, real-account persistence/manufacturing services and production CSP execution remain unverified.

## Verification

`npm run test:ratline-contract` covers 15 contracts against the former engine, including 100 deterministic randomized graphs, ties, rotations, tolerance boundaries, missing endpoints, cache reuse/pruning, trace changes and empty-document lifecycle. `npm run test:ratline-browser` covers six checks using the actual StrictMode PCB scene. The prior 15 PCB synchronization contracts and ten PCB browser checks remain regression gates. Full `npm test` and the production build/bundle budget are recorded in the implementation report, including existing fixture/SSR warnings.

Raw artifacts are under `docs/reports/vfopt-ui-026-*`. Original optimization reports are retained byte-for-byte; reruns have distinct names and hashes.
