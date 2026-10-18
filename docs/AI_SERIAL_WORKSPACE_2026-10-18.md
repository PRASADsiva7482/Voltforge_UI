# AI Workspace and serial execution integration — 2026-10-18

Implemented in the existing UI, Java gateway and Python AI service, preserving the existing conversation schema, project store, board registry, compiler and simulator.

## Verified causes

- The editor kept local running/preparing flags while Serial Monitor read only the store's running boolean. Compilation therefore appeared as “Preparing” in one place and “Stopped” in another. The screenshot alone does not prove that the remote compiler hung; the inconsistent status path is confirmed in code and reproduced with a delayed compiler response.
- Compilation inherited the general 30-second HTTP timeout, shorter than the configured development compiler's 45-second deadline. Preparation could not be cancelled through its disabled Run button; engine initialization had no deadline.
- AVR USART forwarded both byte and line callbacks, duplicating serial output. Its input loop also called `writeByte` for every character immediately, although AVRUSART rejects additional bytes while receiving one.
- Serial logs mixed execution diagnostics and firmware output, forced the panel open and forced scrolling on new output. There was no run identity on log records.
- Standalone AI context was unavailable even for a project-associated conversation. Its page height depended on fixed viewport offsets. The Java AI gateway also defaulted context-free chat to Arduino Uno.
- Large simulation snapshots could consume the Python context excerpt before selected serial evidence reached the model.

## Resulting behavior

- `simulationStore` owns the editor execution session: UUID, project, board, input firmware, phase and diagnostics. Toolbar and console consume the same state. Existing `isSimulating` consumers remain compatible.
- Run validates the selected board, compiles the captured firmware using the existing API, validates the returned board/HEX and initializes the existing engine against the current circuit. HTTP timeout is 60 seconds; lazy engine startup is bounded to 15 seconds. Cancel/Stop aborts the HTTP request, invalidates asynchronous continuations and disposes the engine. A remote compiler job may finish independently, but its cancelled response cannot start a local run.
- A new run clears old output and queued input. Serial records distinguish firmware output, input and diagnostics and include timestamp/run ID. Retention is bounded to 300 entries and 16,000 characters per entry. None is saved as execution history in the database.
- USART output uses byte events once. Input queues bytes and advances on UART receive completion using emulated timing. Compiled Uno firmware was used to verify full-command echo.
- Console supports keyboard/pointer resizing, collapse, clear, copy and text export. Reading old output does not force scrolling; Latest output returns to the bottom. Collapse is respected until the next explicit run. Empty running sketches show “Waiting for firmware serial data.” Baud is reported by firmware, changed through `Serial.begin()` and a restart; it is not a decorative selector.
- Firmware edits display a restart-required notice. Restart retains explicit source compatibility mode. Existing live electrical circuit updates are preserved. Project/board target changes stop execution; target removal during preparation prevents startup.
- Ask AI captures actual current-run output/diagnostics and opens a draft. It never automatically enables sharing or sends a message. The attachment can be removed. With consent disabled, project code, circuit, logs and diagnostics are omitted; the backend independently strips them.
- AI Workspace uses the existing associated project ID and API to fetch saved context only after opt-in. It does not borrow another editor's live runtime. The UI explains saved versus live context. Existing persisted history, search, rename/delete, retry IDs, streaming, Markdown/code copy and ownership enforcement remain in use.
- Standalone layout fills the parent flex/grid workspace, with mobile navigation participating in flow. Messages scroll independently of header/composer. Contextual editor prompts depend on available circuit, firmware, errors or output.
- Python prioritizes selected execution evidence with explicit bounded excerpts. It distinguishes firmware observations from electrical model estimates and generated advice. Java sends `unspecified` when no board was shared.

## Main files

| Area | Files |
| --- | --- |
| Execution and serial | `src/store/simulationStore.ts`, `src/features/editor/CircuitEditorPage.tsx`, `SerialMonitor.tsx`, `src/features/simulator/SimulationEngine.ts`, `useDeferredSimulationEngine.ts`, `src/api/services.ts` |
| AI UI/context | `src/features/ai/AiChatPanel.tsx`, `executionContext.ts`, `chatWorkspace.css`, `src/components/layout/AppLayout.tsx`, `src/styles/workspace.css` |
| Existing lab callback compatibility | `src/features/labs/LabChallengeRunner.tsx` |
| Java gateway | `Voltforge_BL/.../ai/service/impl/AiServiceImpl.java` and conversation/gateway tests |
| Python context | `Voltforge_AI/engine/llm.py`, `tests/test_chat_integrity.py` |
| Regression coverage | `scripts/run-execution-session-tests.mjs`, `run-playground-audit-tests.mjs`, `run-chat-browser-tests.mjs`, `run-runtime-delta-tests.mjs`, `check-development-compiler.py` |

## Database and runtime verification

Inspected the configured `dev/development` MySQL database. Existing `ai_conversations` and `ai_messages` already provide ownership, project references, ordered messages, request idempotency and activity indexes. No new migration or DDL was necessary. Ran `chat_schema.py --verify`: synthetic insert, update, ordered read and cascade cleanup passed inside a rolled-back transaction. Existing user conversations were preserved.

Refreshed only the verified workspace-owned AI process after confirming no pending persisted generation, then verified authenticated health (`ONLINE`, ready). The opt-in Java development smoke test used the real configured database and AI provider: both messages persisted, assistant completed, history/search/replay succeeded, and its synthetic account/conversation were cleaned up. The existing separately launched Java development server was not restarted; reload/restart it to load the gateway's context-free board-default change if it is still running old classes.

## Checks executed

- UI `npm test`: passed type checks, lint and the existing contract suites. Final lint has 13 existing warnings, no errors.
- Production build and bundle budgets: passed (initial JS approximately 496 kB against 550 kB limit).
- Execution-session tests: passed atomic initialization, failure recovery, stale run rejection, byte assembly, baud, clear, input gating, bounded logs and isolation.
- Playground browser suite with actual remote-compiled Uno HEX: passed layouts in both themes at 1366×768, 1280×720, 1024×768, 800×600 and 390×844, zoom, dock/console keyboard resizing, cancelled compilation, explicit compatibility, firmware restart notice, real output sharing/consent, copy/export/clear, no-output execution, baud change, AVR output/echo, restart isolation, invalid target/HEX recovery, save/reopen and navigation guards. API/auth fixtures are isolated; engine, workers, Monaco and firmware execution are real.
- Chat browser suite: passed history/reload, independent conversations, association, consent, saved-context loading, retries, duplicate prevention, Markdown/code copy, rename/search/delete and responsive themes.
- Project-flow browser suite: passed creation, saved-board initialization, save/reopen and validation regressions.
- Document-dirty browser suite: passed 60 seconds of real simulation with zero runtime dirty/save/broadcast/serialization work, plus saved edits, conflicts, stale loads and permission changes.
- Runtime-delta contract rerun: passed live rewiring, undo/redo, AVR GPIO/PWM ordering, power changes, worker replacement and stop/restart cleanup.
- Java default Maven suite: 61 discovered, 60 passed, one opt-in smoke skipped. Explicit development smoke then passed; all 61 unique tests were exercised successfully.
- Python: 9 chat integrity tests plus 5 health/security tests passed using the existing unittest framework. Pytest is not installed; no dependency was added.
- Diff whitespace checks passed for UI, BL and AI.

## Limits

- Native browser firmware emulation remains ATmega328P only (Uno R3, classic Nano and the supported ATmega328P target). Other boards retain their existing explicit compatibility/compiler limitations.
- Source compatibility is a limited interpreter, not compiled firmware. Electrical results remain model estimates. Baud mismatch/physical serial hardware are not emulated.
- Serial input is raw text without an automatic line ending. Serial display pause is not added; runtime pause and read-without-autoscroll remain available.
- Uploaded HEX is session-only as before. Serial logs and selected attachments are transient; switching to a separate AI page does not transfer unsent runtime attachments.
- Context excerpts are bounded and may omit older output. Project fact-memory management remains unavailable; this work does not fabricate that service.
- Browser authentication/API fixtures are not a live Keycloak login test; the separate development smoke covers real database/provider persistence.
