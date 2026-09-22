# VFOPT-UI-011: document revisions and runtime feedback

Implemented on 2026-09-12; fixture acceptance passes. Live authenticated project persistence and two-client collaboration remain pending. The authoritative status and next task are in `../../VOLTFORGE_UI_BL_OPTIMIZATION_BACKLOG.json`.

An unchanged running editor previously treated LED feedback as document edits. The same 25-node fixture now runs for 60 seconds without document serialization, dirty transitions, autosaves or canvas broadcasts. Real edits still become dirty synchronously and survive a fixture save and browser reload.

## Document contract

The canvas store keeps `nodes` for live rendering and `documentNodes` for authored data. They initially share immutable values. `updateRuntimeNode` and `batchUpdateRuntimeNodes` update live nodes only. Local actions apply their actual changes to authored nodes; spreading a live node during a drag or property edit does not copy unchanged simulator feedback into the authored document. The reconciliation uses the existing node index rather than building additional full maps per drag frame.

Imported and authored properties remain valid, including custom properties and legacy values with runtime-like names. This change does not delete properties by name or migrate existing saved data. It prevents subsequent runtime writes from changing the authored snapshot. New component properties intended to persist must use local store actions; feedback must use runtime actions. Store updates must remain immutable. Direct external `setState` calls bypass these action contracts.

| Data | Save/share contract | Local dirty trigger |
| --- | --- | --- |
| Canvas | Authored nodes, wires, viewport | Local node/property/topology/geometry or viewport changes; undo/redo |
| PCB | Board width/height, active layer, trace width, grid snap, visible layers, viewport, footprints, traces, vias | Local changes to these existing persisted fields |
| Code | Content, filename, language, sort order | Changed code content; identical content or an unknown file ID is a no-op |
| Runtime | Live simulator feedback remains in rendering state | None |
| Editor tools | Canvas selection, pending wire tools, PCB selection, incomplete route, ratlines, DRC results | None |
| Load/remote apply | Replace authored state with the loaded document | None |
| Automatic footprints | Derived from authored nodes, retained in the next document snapshot | None by themselves |

Canvas and PCB `documentRevision` change when their document changes, including loads. `localDocumentRevision` changes only for local edits. Code has its own revision, and project activation increments `documentSession`. These counters have separate purposes from electrical `modelRevision` and topology invalidation. A revision is a conservative change marker: undoing back to equivalent bytes still counts as an edit until saved; no whole-document equality scan is performed.

History captures authored nodes. PCB generation subscribes to authored nodes, so LED feedback does not rerun footprint comparisons or ratline calculations. Existing JSON operations for undo snapshots and meaningful footprint reconciliation remain outside the runtime dirty path.

## Dirty state, persistence and collaboration

`EditorDocumentSync` subscribes directly to local document revisions. It sets dirty state synchronously for an owner edit and schedules the existing debounced collaboration send. Runtime changes, hydration, derived PCB state and remote application do not take this path. There is no time-based suppression window that can discard a local edit immediately after a remote update.

Save captures authored canvas, current PCB layout, current code, the server's expected revision, local revision counters and project session at invocation. Capture does not stringify the document. The HTTP transport serializes the payload; collaboration serializes its outgoing STOMP body once, after ownership and revision checks. Dirty detection needs neither serialized baselines nor deep document comparisons.

A synchronous save guard allows one in-flight save. An acknowledgement clears dirty state only if no newer local revision exists, and cannot update a different project session. It merges returned metadata without replacing local canvas or code. The query cache is updated from the acknowledgement instead of forcing a detail refetch. Stale background results cannot replace a newer saved document. Background permission changes remain visible while pending edits and their expected server revision are retained. Failed/conflicting saves retain edits for retry.

Incoming remote canvas state is applied without an autosave or echo when the local editor is clean. Pending local edits or an in-flight save prevent remote replacement and show a conflict notice. This is conflict preservation, not automatic merging. Queued outgoing frames recheck current ownership before sending. Existing STOMP authentication, rejection/reconnect handling and server conflict/authorization contracts remain in place. The ten-second autosave cadence still saves the latest real edits, including during continuous editing, and listeners/timers are removed on navigation.

All 34 `SimulationEngine` changes are the exact identifier replacement `updateNode` to `updateRuntimeNode`, verified against the start-of-item snapshot. Runtime batching still intercepts the runtime action. Simulator arithmetic, feedback values and batch ordering are unchanged. Editor start/stop feedback uses the runtime API as well; user electrical input continues through local actions.

## Recorded validation

The before and after browser reports have the same fixture SHA-256. They use installed Chrome 153.0.8010.36, Node 20.19.6, the actual editor/Monaco/engine with an interpreter loop, 25 LED nodes and approximately 20 Hz injected feedback plus irrelevant PCB selection. HTTP and STOMP are isolated fixtures; they do not write to a real backend.

| Metric during unchanged simulation | Before (60.034 s) | After (60.026 s) |
| --- | ---: | ---: |
| Injected runtime updates | 1,195 | 1,200 |
| PCB document JSON calls | 9,045 | 0 |
| Canvas document JSON calls | 1,577 | 0 |
| Collaboration document JSON calls | 596 | 0 |
| Save payload JSON calls | 5 | 0 |
| Canvas sends | 298 | 0 |
| Save requests | 5 | 0 |
| Dirty transitions | 11 | 0 |
| Electrical model revision delta | 5 | 0 |

The before revision changes occurred with save/refetch document rehydration. Afterward, both simulation start and stop also keep a clean document clean. A separate mounted PCB check processes 100 feedback updates without document serialization or dirty revisions.

JSON counters instrument document-shaped `JSON.stringify` arguments inside the browser harness. Counts establish removal of this work in the fixture; they do not establish a percentage of laptop CPU savings, large-circuit latency, or compiled firmware throughput. Recorded simulation clock values are diagnostics, not a simulation accuracy comparison. Background activity and power mode were not controlled.

Passed checks:

- Eight store/snapshot regression groups cover runtime exclusion, authored property preservation, viewport/PCB boundaries, load/derived origins, undo/redo, save/session races, code no-ops and metadata preservation.
- Sixteen browser checks cover the 60-second window, mounted PCB, immediate dirty state, authored payloads, reload durability, delayed acknowledgements, stale GETs, failure/retry, remote echo/conflicts, immediate local edits after remote data, autosave, permission changes and unmount cleanup.
- Seventeen existing editor browser checks pass again, including real Monaco typing, current save/share snapshots, canvas pan, engine controls and subscription isolation. Their new report retains `task: VFOPT-UI-010` to identify the reused suite; its file prefix identifies this follow-up. The suite deliberately marks its later isolation windows dirty and is not the unchanged-document acceptance test.
- The existing full UI regression suite passed, including runtime/model/worker, solver, scope, canvas and AVR contracts. The new document suite also passed separately and is included in `npm test`. After the final acknowledgement/refetch refinements, TypeScript, production build, bundle budgets, lint and both browser suites passed. Existing short-lived test servers emitted dependency-scan shutdown warnings during the full suite; test commands exited successfully.
- Final bundle budgets pass: initial static JavaScript 504.6 KiB / 550 KiB; 13 / 16 initial chunks.

Reproduce from `Voltforge_UI`, with fixture ports 3102 and 3103 available:

```powershell
rtk proxy npm test
rtk proxy npm run build
rtk proxy npm run test:document-dirty-browser
rtk proxy node scripts/run-editor-render-tests.mjs --report-prefix=vfopt-ui-011-editor
```

The browser harness needs installed Chrome and the configured Monaco CDN. Run browser suites sequentially. Before-phase measurements require the preserved pre-change source; rerunning before mode on current code is not a historical baseline.

Evidence: [implementation](reports/vfopt-ui-011-implementation.json), [before](reports/vfopt-ui-011-dirty-before.json), [after](reports/vfopt-ui-011-dirty-after.json), [store regressions](reports/vfopt-ui-011-document-revision-tests.json), [editor regression](reports/vfopt-ui-011-editor-render-after.json).

## Remaining validation and next work

Live authorized-account save/reload, refresh/expiry and simultaneous clients against the real REST/STOMP persistence path remain unverified. No credentials were submitted and no owner projects were modified. A live test should edit a disposable authorized project, save/reload canvas/code/PCB, delay a save while editing, then verify remote application and conflict preservation between two clients. Preserve the backend expected-revision checks throughout.

The representative 100/500-node, high-pin and actual compiled-firmware performance matrix remains in the existing performance backlog. These measurements do not close it. Backend and AI source were not changed for this item; previous service readiness results remain historical.

Next: **VFOPT-UI-012 — Stop palette-wide work on every canvas store update**. Stable action subscriptions and a memo boundary already exist from UI-010. Remaining work is catalogue sorting/grouping, bounded rendering for 1,000 components and responsive, accessible search with every component discoverable.
