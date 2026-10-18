# VoltForge Playground audit — 2026-10-18

Changes were made in the existing React/Vite/Zustand UI, Spring application backend and FastAPI/local-model service. Existing project and conversation storage, authentication, pin registry, compiler and simulation engine were retained. No new provider, database or parallel project state was introduced.

## Verified defects and repairs

| Defect / cause | Repair and evidence |
| --- | --- |
| AI workspace used absolute positioning without a positioned workspace ancestor, placing its header behind the global ribbon and covering the code pane. | A resizable dock participates in desktop layout. On small screens it is contained below the toolbar. Header/composer stay fixed while messages scroll. Chromium geometry assertions and screenshots cover both themes at 1366×768, 1280×720, 1024×768, 800×600 and 390×844, plus 125% CSS zoom. |
| Duplicate board header consumed vertical space. Split panes had percentage-only sizing and mouse-only resizing. | Board appears alongside the project title. Code/canvas stack when available width is narrow. Pointer and keyboard separators preserve mounted editor/chat state. Component panel can be collapsed; reopening it on constrained layouts closes the AI dock. |
| Run marked simulation active before compilation and silently substituted interpretation after failed/unsupported compilation. Startup/runtime errors could leave UI in a running state. | Run stays in preparation until startup succeeds. Compilation failure, wrong returned target, unsupported native CPU and startup/runtime errors are explicit. Source compatibility is a separate user action after failure. The existing sandbox continues to use explicitly identified source compatibility. |
| HEX upload only checked for a colon; engine ignored record integrity and extended addresses. Uploaded firmware could survive switching projects. | A shared parser validates checksum, byte count, EOF and address bounds against ATmega328P flash. Uploads are bounded; invalid firmware cannot start. Project/board changes clear the temporary HEX selection. |
| Code editor depended on a CDN and could stay indefinitely on Loading when it was unavailable. | Vite serves the already-installed Monaco runtime locally in development and bundles versioned runtime assets for production. Actual keyboard editing, syntax rendering and saving were exercised. Formatting and insertion controls are disabled when their required editor capability is unavailable. |
| Serial monitor reopened immediately when collapsed because its effect depended on the open state. Baud selector changed a display value without configuring a real UART. | Existing logs no longer force reopening. The monitor shows the baud rate reported by firmware and identifies AVR vs source compatibility. Input is disabled while stopped; stale queued input is cleared on project changes. |
| Save failure was only a transient toast; browser navigation could discard pending changes without warning. | Persistent Saving/Saved/Unsaved/Save failed status, size-limit feedback, and guards for reload, links, toolbar Back and browser Back/Forward. Existing revision/session guards and one-save-at-a-time behavior were retained and regression tested. |
| Live Sync status was hidden when disconnected, and did not explain what it meant. | Connected/offline status reflects the existing transport. Tooltip distinguishes live canvas transport from durable project saves. No new claim of cross-user conflict resolution was introduced. |
| AI reported a hardcoded 98% confidence; offline fallback invented verified relay wiring, protection and generated firmware. | Removed fabricated confidence from generation and historical-message display. Offline model reports unavailability. Interrupted generation emits an explicit error, so the existing persistence layer retains partial responses for safe retry. |
| Approved simulation context was accepted by the API but ignored by the model prompt. Project code was appended to system instructions. | Bounded simulation/context data reaches the existing model as user data, separate from system instructions. Execution mode and fidelity are included; unrelated viewport data is omitted. Context remains opt-in and ownership checked by BL. |
| AI validator read legacy `from/to` fields while the Playground sent `fromPin/toPin`, missing direct shorts and falsely warning about absent grounds. It also claimed all safety checks passed and automatically invented a 220-ohm correction. | Normalize the supported endpoint forms. Describe validation as limited heuristics, label its score accordingly, and stop inventing resistor values from warnings. No temperature or physical certification is claimed. |
| Project-memory preference endpoint returned success without storing anything. | Explicit unavailable response; preference writes return 501 and the UI disables changes when memory is unavailable. Durable conversation history remains separate and supported. |
| Compiler failure logging could copy private source excerpts from upstream diagnostics. | Backend logs response status only; authorized callers still receive actionable diagnostics. |

## Files changed in this audit

UI:

- `src/features/editor/CircuitEditorPage.tsx`, `EditorDocumentSync.tsx`, `SerialMonitor.tsx`, `CodeEditor.tsx`, `AiValidatorPanel.tsx`, new `useUnsavedEditorGuard.ts`.
- `src/components/ui/SplitPane.tsx`, new `EditorDock.tsx`, `src/styles/workspace.css`, lightweight `src/components/routing/navigationGuardRegistry.ts`.
- `src/features/simulator/SimulationEngine.ts`, new `intelHex.ts`, `src/features/canvas/CircuitCanvas.tsx`.
- `src/features/ai/AiChatPanel.tsx`, `aiPresentation.ts`, `src/types/domain.ts`, `src/store/projectStore.ts`, `src/App.tsx`.
- `vite.config.ts`, new `scripts/monacoAssets.ts`, `package.json`.
- New `scripts/run-playground-audit-tests.mjs`, `run-firmware-validation-tests.mjs`, `check-development-compiler.py`; updated project-flow, document-dirty and runtime-delta fixtures for explicit compatibility execution, numeric revisions and valid executable HEX.

BL: `FirmwareCompilerServiceImpl.java` and `ConversationIntegrationTest.java`. The existing in-progress conversation implementation and tests were retained.

AI: `api/routes.py`, `api/schemas.py`, `engine/llm.py`, `engine/electronics.py`, new `tests/test_chat_integrity.py`; runtime logs excluded in `.gitignore`.

## Persistence and security

Project writes still use the authenticated project's server ID, `documentRevision`/`expectedRevision`, saved code files, canonical board ID, schematic and PCB configuration. Runtime simulation updates are not persisted as authored edits. Newer edits survive delayed save responses; stale GETs and remote canvas messages cannot overwrite local pending changes.

Conversation APIs remain under the existing `/api/v1/ai/conversations` service: create/list/get/rename/delete, paginated messages, streamed send and stop. The authenticated owner is resolved server-side; attached-project ownership and context consent are checked. Idempotent request IDs and ordered messages prevent duplicate retries. History, rename/delete/search, failure/retry and reload were tested without reading private user messages.

The configured **dev/development MySQL** schema was inspected and verified using `scripts/chat_schema.py --verify`. Existing `ai_conversations` and `ai_messages` tables already matched `VF_CHAT_001.sql`; **no additional DDL was required**. Synthetic insert/update/ordered-read/cascading-delete checks ran in a transaction and were rolled back. Existing user records and conversations were preserved. This audit did not run a production migration.

## Executed verification

| Check | Result |
| --- | --- |
| UI `npm test` | Passed: TypeScript, lint and existing security, board/pin, proposal, solver, AVR budget, document revision, routing, dragging, PCB, render and configuration contracts. |
| UI build and bundle budget | Passed. Monaco stays deferred; its versioned static runtime is now shipped with the app. |
| UI lint | Passed with existing warnings, principally unused symbols and editor hook-dependency warnings. |
| `test:project-flow-browser` | Passed: required project name, reserved Untitled circuit rejection, creation failures, board configuration, saves/reloads, settings, privacy and mobile form behavior. |
| `test:chat-browser` | Passed: persistence fixture, new conversation, reload, title search, rename/delete confirmation, failures/retries, Markdown/code copy, XSS checks and responsive themes. |
| `test:playground-browser --compiled` | Passed: geometry/themes/zoom, keyboard resizing, actual toolbar theme toggle and persistence, local Monaco editing and save, PNG bytes, visualization/fidelity controls, compiler failures, mismatched target rejection, real interpreter output, actual AVR serial output, save conflicts, navigation guards and reload. API/auth boundaries use isolated fixtures. |
| Development compiler probe | Configured remote compiler generated real Uno HEX from a synthetic sketch; that exact firmware emitted `VOLT_FORGE_AUDIT_NATIVE` through AVR8js in the browser. No private project source was used. |
| `test:firmware-validation` | Passed malformed-record, checksum, EOF, address, memory-size and byte-order cases. |
| `test:drag-browser` | Passed real component drag, viewport/grid pan, wire persistence, undo/redo, current-flow pause/resume, read-only cancellation and gesture timing. |
| `test:document-dirty-browser` | Passed 60-second running-engine window with zero dirty transitions/save/broadcast/serialization work, plus code/canvas/PCB persistence, delayed saves, stale reads, errors, autosave and permission changes. |
| `test:palette-browser` | All functional checks passed. Initial concurrent run missed the 50 ms timing budget (66.4 ms p95); isolated rerun passed at 35 ms p95. |
| BL Maven tests | Default suite: 61 discovered, 60 passed, 1 opt-in test skipped. Compiler and conversation suites rerun after changes. The skipped `DevelopmentConversationSmokeTest` was then explicitly enabled and passed against actual development MySQL and the restarted live model: two persisted/restored messages, completed assistant response, title search and idempotent replay; synthetic account/conversation cleaned up. |
| AI unittest | 8 new integrity/heuristic tests plus 5 existing health/authentication tests passed in the project's `.venv`. An initial global-Python run hit the app's virtual-environment redirect; rerunning in `.venv` passed. |
| Development database | Actual schema and transactional CRUD verified; synthetic rows rolled back. |

Screenshots and synthetic firmware/PNG outputs are under ignored `test-results/playground/`. They are test evidence, not replacement application data.

## Remaining limits

- Native browser CPU emulation is ATmega328P only. Catalog presence, pin-map coverage and compiler target registration do not imply native emulation for every board. Other targets may use the limited source interpreter; it is not full C++ or hardware emulation.
- Power stress is an estimate relative to ratings, not temperature simulation. Solver models and synthetic stimulus are engineering approximations. PIR auto-stimulus now requires explicit `autoStimulus: true`; real motion is not inferred.
- Real compiler verification covers one synthetic Uno program. It does not certify every peripheral, board, library or solver model.
- Live Sync regression uses a controlled STOMP fixture. This audit does not establish real-account, multi-device synchronization or resolution of concurrent edits by multiple people. Code collaboration is not advertised as canvas Live Sync.
- Browser verification used Chromium/Chrome. CSS zoom was checked; OS scaling, Safari/Firefox, assistive technology and every touch device were not independently tested.
- Approved-fact memory is unavailable in this AI service. Conversation history works; it is not a substitute for that separate feature. Search is by conversation title, not full transcript content.
- Presentation preferences and custom uploaded HEX are session-scoped. Saved source, board, authored schematic, wiring, viewport and PCB configuration survive reopening.
- The verified workspace-owned local AI service was restarted and its updated authenticated health/capability endpoints passed (model ready, unsupported fact memory correctly unavailable). A backend process running without reload still needs its normal restart to load rebuilt Java classes. No production deployment or real-user Keycloak login was performed during these fixture-based browser checks.
