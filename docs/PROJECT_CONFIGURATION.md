# Saved project configuration and Playground integration

Implemented 2026-10-17 in the existing UI and BL. No database migration or new state system is required. AI requests already obtain the target from `currentProject.boardType`; no AI source changes were necessary for this flow.

## Root cause and decision

Retained the development-board selector (Option A). `Project.boardType` already persisted in `projects.board_type`, appeared in list/detail DTOs, and reached the compiler and AI requests. However, creation sent only metadata and starter code, without a `canvasLayout`. The editor loaded a missing layout as `[]`, so selecting a board never placed its definition or pins on the canvas. Project Settings could also change the firmware target without checking the schematic. The UI defaulted invalid URL board IDs to Uno, masking stale selections.

The existing UI `BOARD_CATALOG` has 49 targets. They match the BL's existing compiler target registry (checked by the configuration contract test when both repositories are available). The wider Java enum retains historical targets for saved-project compatibility; newly selected targets must be registered. Registration means a target configuration exists, not that a compiler core is installed or every physical variant has verified pins.

## Authoritative data flow

1. `NewProjectPage` validates and snapshots the form. `createProjectPayload` builds a schematic using the existing component factory and pin registry, and generates starter code for that same `boardType`.
2. The existing POST persists name, description, boardType, visibility, layout and code files in one project transaction. Ownership comes from the authenticated JWT user, never the form.
3. Navigation uses the returned project ID. The editor GET reloads that persisted project; it does not use the creation page's transient state or query parameters.
4. Editor hydration loads the saved schematic, code, PCB configuration and canonical board target. The editor and My Projects use registry names for that target.
5. Save snapshots include the boardType, schematic, code, PCB and existing optimistic revision. The existing guarded PUT saves against the same project ID. Reload and My Projects reopening restore that document.

No `activeBoard`, `selectedBoardId` or separate project persistence store was introduced. Component node `type` identifies each placed component; `Project.boardType` identifies the single firmware target. They have distinct purposes.

## Validation and access control

- Name: mandatory after trimming; 200-character maximum; default placeholder "Untitled circuit" is not allowed and creation form starts empty. Description: mandatory after trimming, 5000-character maximum. Both Project Name and Description are explicitly marked and shown as required mandatory fields in the UI with asterisk indicators.
- Board: required, selected from the existing UI registry; invalid/stale IDs remain visible as invalid rather than becoming Uno. Server validation uses the existing compiler target registry, rejects missing/retired new targets and rejects enum labels, unknown IDs and numeric ordinals with HTTP 400.
- Boolean privacy is persisted as `isPublic`; the UI now labels and checks the private toggle consistently. Existing owner/share read permissions and owner-only writes are unchanged. HTTP tests verify anonymous/other-user denial for private projects and denial of unauthorized writes to public projects.
- Inline errors have stable accessible input names, `aria-invalid`, error descriptions and first-invalid-field focus. Changes update errors; failed requests preserve values. A synchronous submission lock and pending-state controls prevent duplicate requests. Success and navigation occur only after a confirmed server response with an ID.
- Settings validate text and require a changed target to exist in the current schematic. A target change saves the current document and metadata together, with the existing revision/session guards; it never rewires or discards firmware automatically.

## Compatibility and capability limits

- Existing explicit targets and layouts are preserved, including empty layouts. A missing layout is initialized from a known saved target; a visible notice explains that saving retains it. No automatic database backfill occurs.
- For the exceptional legacy document with no target, a single placed board determines the target. Otherwise the historical Uno default is used with a notice. Unknown/retired explicit targets remain unchanged and are not executed or silently converted.
- Firmware execution is guarded when the target is missing from the schematic. The existing runtime drives only one MCU; multiple-board firmware execution is explicitly rejected instead of silently driving the first board. Multi-board schematic editing remains available.
- Browser compiled-HEX emulation remains limited to ATmega328P-compatible Uno, Nano and ATmega328P DIP targets. Other targets use the existing source compatibility interpreter. Compilation depends on the deployed toolchain. A mismatched compiler response cannot execute its HEX on the selected board.
- Pin definitions and electrical safety checks reuse existing registries. Many board variants use shared footprint pin layouts; the creation form and settings expose this limitation. No new pin maps or hardware-compatibility claims were invented.

## Changed files

UI: `NewProjectPage.tsx`, new `projectConfiguration.ts`, `CircuitEditorPage.tsx`, `editorDocumentSnapshots.ts`, `ProjectSettingsModal.tsx`, `ProjectSummaryCard.tsx`, `codeTemplates.ts`, `types/domain.ts`, `workspace.css`, package scripts and regression runners. Starter code now escapes project names in C++ strings and normalizes comment line breaks.

BL: `CreateProjectRequest.java`, `ProjectServiceImpl.java`, `BoardType.java`, `FirmwareCompilerServiceImpl.java`, `GlobalExceptionHandler.java`, new `ProjectValidationException.java`, and `BackendRuntimeCompatibilityTest.java`. The existing Project entity, mapper, database columns and revision protocol remain unchanged.

## Validation

- `npm test`: TypeScript, lint, existing security/simulation/geometry/drag/routing/PCB/AI contracts, plus project configuration tests pass. Existing lint warnings remain.
- `npm run test:project-configuration`: validation, all 49 target/pin/firmware/save roundtrips, UI/BL registry parity and legacy compatibility pass.
- `npm run test:project-flow-browser`: all 9 check groups pass. Real routes/stores with an isolated HTTP persistence fixture cover creation failure/retry, server field errors, duplicate prevention, ESP32 initialization, correct-ID save, reload, My Projects reopening, compiler target, legacy/empty layouts, visibility, optional description and mobile accessibility. Settings reject a target absent from the schematic and atomically save/reopen a placed target with its layout.
- `npm run test:design-system -- --interactions-only`: all 9 checks pass, covering both themes, Monaco/editor panels, focus, theme persistence and first paint.
- BL `mvnw.cmd test -q` on Java 25: 49 tests, zero failures/errors/skips. New tests use the actual HTTP server, security filter chain and isolated H2 database for create/read/save/reopen and authorization. JWT verification is mocked only in tests. The HTTP/database test class was rerun after adding Unicode-whitespace validation.
- Production build and bundle budget are checked with `npm run build`.

No production records were created, no live Keycloak credentials were used, and no deployment was performed. Successful native firmware compilation on installed production toolchains is not established by these tests; the browser test deliberately checks the compiler-unavailable path.
