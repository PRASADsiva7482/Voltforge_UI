# VFOPT-UI-025: Incremental schematic-to-PCB synchronization

Schematic edits now reuse unchanged PCB footprints and pads. The PCB scene subscribes to the fields it renders; an external store subscription observes authored nodes and wires without rendering the scene for schematic movement or simulator feedback.

The synchronizer compares ordered wire IDs/endpoints, builds first-incident pin membership only when connections change, and retains unchanged per-component membership maps. It generates a generic footprint only for a new part or a changed pin layout. Name, package and pad-net changes update just the affected objects. Existing footprint IDs, placements, rotations, dimensions and custom pad geometry survive metadata edits. Pin IDs/order changes regenerate that part's generic geometry while preserving its placed identity.

PCB synchronization coalesces synchronous edits into one microtask and publishes derived footprints and ratlines together. `getLayout()` flushes the current authored source before a save/share snapshot. Load/reset clears reconciliation and undo-placement caches; a source getter reads the latest schematic after a combined document load. Scene cleanup flushes a pending edit and invalidates queued callbacks. The cache survives scene remounts and retains up to 50 removal batches for schematic delete/undo, matching the history bound. PCB synchronization remains scoped to an opened PCB scene; edits made while it is closed reconcile on reopening, as before.

Ratlines are invalidated by wire connectivity, connected pad geometry and traces. Cosmetic edits and isolated additions preserve the previous ratlines. The existing MST implementation is unchanged; equivalent output is checked against it across branching, multi-net, rotated, routed and missing-endpoint fixtures. Pad `netId` continues to use the first incident wire ID, retaining existing saved/export conventions. This task does not introduce a new net identifier scheme or change routed-trace suppression rules.

The actual mouse test also exposed a pre-existing Stage drag handler accepting bubbled footprint events. The handler now updates the viewport only for a Stage drag. Footprint and via dragging no longer write their local coordinates into the board viewport.

## Matching browser evidence

The same 100-LED, 99-wire PCB fixture ran before and after, in headless Chrome at 1366 by 800. HTTP outside the fixture server was blocked. The fixture hashes are recorded in the raw reports.

| Trigger | Before | After |
| --- | --- | --- |
| 60 runtime updates | 0 generations, 0 ratline computations | 0 generations, 0 ratline computations |
| 60 schematic moves | 6,000 generations, 60 ratline computations, 120 footprint-array comparisons | 0 of each; all 100 footprint objects retained |
| Add one disconnected part | 202 generations, 2 ratline computations; no existing object retained | 1 generation, 0 ratline computations; all 100 existing objects retained |
| Change one package | 202 generations, 2 ratline computations | 0 generations, 0 ratline computations; only that footprint changes |
| Move one PCB footprint | 101 generations, 1 ratline computation | 0 generations, 1 ratline computation |
| Remove one wire (after only) | Not measured | 1 membership-index rebuild; 2 affected footprints; 1 ratline computation |

The schematic-move measurement window fell from 17,674.3 ms to 1,027.4 ms. These windows include animation-frame pacing, rendering and automation, and are not CPU-only timing or physical pointer-to-display measurements. Runtime isolation was already present from VFOPT-UI-011 and is preserved, not a new saving claimed here. Counters cover footprint-array comparisons; the separate export dialog's design-signature serialization is outside that counter.

## Validation and limits

`npm run test:pcb-sync-contract` covers 15 contracts, including immediate editor snapshots, coalesced publication, no dirty echo, changed pins/nets, saved custom pad geometry, routed suppression, undo/redo, remount and document replacement. `npm run test:pcb-sync-browser` covers 10 checks in the actual PCB scene, including mouse dragging, read-only controls, save/reload, removal/undo and stale-ratline cleanup. Raw results and the final implementation report are under `docs/reports/vfopt-ui-025-*`.

All 25 PCB checks, 16 full-editor dirty/save/browser checks and 17 editor interaction checks passed. The one-minute running-editor window processed 1,200 runtime updates with zero document serializations, dirty transitions, saves or collaboration broadcasts. `npm test`, the production build and bundle budget passed; initial static JavaScript remains 504.6 KiB in 13 chunks. Existing palette fixture and Vite SSR shutdown warnings are recorded in the implementation report. Historical report bytes were preserved and reruns stored separately.

There is still linear source/geometry inspection on authored changes. Connected footprint movement and trace changes still use the existing global ratline computation, and initial scene rendering remains a separate cost. This fixture does not establish large-power-net interaction budgets, sustained laptop CPU/heap savings, live authenticated persistence, STOMP behavior or manufacturing-service output. Those checks remain explicit follow-ups.

The next recommended item is **VFOPT-UI-026: Reduce ratline construction complexity for large nets**. It directly depends on this work and addresses the remaining computation when connected PCB geometry or copper changes.
