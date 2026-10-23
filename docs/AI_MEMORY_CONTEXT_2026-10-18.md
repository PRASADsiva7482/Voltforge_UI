# AI memory, general chat, and project context — implementation receipt

## Behavior

- General chat has no project ID or project-sharing checkbox. It uses the user's message, bounded saved conversation history, and preferences the user explicitly saved.
- Selecting an owned project in New Chat associates that conversation with the project and provides a Playground link. Association alone does not transmit its circuit or firmware.
- Project sharing starts off and resets when switching conversations. Workspace sharing uses the associated project's saved board, component properties, wiring/netlist, and firmware. It never borrows a different editor project's state.
- Playground sharing can additionally include current editor state and actual execution diagnostics/serial output. Existing server ownership, project matching, and revision checks remain enforced. Sharing off discards client project fields on the server.
- Existing messages remain in history when sharing is turned off. The disclosure explains that turning off sharing prevents new project snapshots; it does not erase past discussion.
- Preference memory is independent of project sharing. The Memory dialog supports review, explicit save/edit, and forgetting each preference. Failed writes preserve the selection and show an error.
- Supported preferences: response detail (`concise`, `detailed`), units (`metric`, `imperial`), and electronics experience (`beginner`, `intermediate`, `advanced`). No arbitrary text, personal facts, credentials, or project data can be stored in this table.
- Example commands: `Remember I prefer concise answers`, `Remember I prefer metric units`, `Remember I am a beginner in electronics`.
- Ambiguous `save it to memory` requests receive clarification and the supported-memory explanation, without calling the model or pretending a write succeeded.
- Command writes and their persisted assistant confirmations share the conversation transaction. Request replay returns the existing confirmation and cannot repeat a write after the preference has later been edited/deleted.

## Verified root causes

1. The active Python service only implemented unavailable project-memory compatibility endpoints. The old UI still exposed enable/write/correct/delete controls for that unavailable capability. Normal memory requests went directly to the local model without a memory operation or a capability-specific response.
2. Standalone chat subscribed to the editor project's lifecycle and could clear its transcript when an unrelated editor project changed. Workspace context assembly was already scoped to the associated saved project; that boundary is preserved and regression-tested.
3. The sharing disclosure mixed saved project data, live execution, and unsupported project memory. Three stacked lines obscured the actual scope.
4. The project link occupied a separate header row; completed responses retained redundant activity banners. Those elements are now compact or visible only during generation.
5. Window-focus transcript refresh cleared the active conversation and previously loaded history pages, resetting reading position. Same-conversation refresh now merges messages and preserves the view; older-message loading preserves its scroll anchor.

## Database and APIs

Inspected the configured `dev` / `development` MySQL database `voltforge_db`. Existing tables were `ai_conversations`, `ai_messages`, `users`, `projects`, and supporting application tables; there was no active memory table.

Applied `Voltforge_BL/docs/schema/VF_MEMORY_001.sql` using `scripts/memory_schema.py --apply`. The additive, rerunnable migration creates `ai_user_memories` with UUID identity, owner FK with account-deletion cascade, one row per owner/preference key, timestamps, and a CHECK constraint permitting only supported key/value combinations. Existing records were not rewritten. Pre-change schema definitions were saved under the backend's ignored `target` directory.

Verified insert, read, update, rejection of arbitrary values, and owner cascade with synthetic records inside a rolled-back transaction. Verified the resulting schema again after implementation. No synthetic preferences or conversation records from the development smoke test remain.

New authenticated API resources follow existing backend conventions:

- `GET /api/v1/ai/user-memory`
- `PUT /api/v1/ai/user-memory/{key}` with `{ "value": "..." }`
- `DELETE /api/v1/ai/user-memory/{key}`

These use the authenticated JWT subject and existing user repository, never client `user_id`. Existing rate-limit and authentication filters cover them. A user-row lock serializes first writes and updates. Backend request assembly overwrites client preference data with stored owner-scoped values. The AI service independently allowlists those values before adding them to the existing provider prompt.

## Changed files

UI:

- `src/features/ai/AiChatPanel.tsx`: scope isolation, compact header/disclosure, honest memory controls, message copy, scroll preservation, activity presentation.
- `src/features/ai/UserMemoryDialog.tsx`: approved-preference CRUD with loading/error/confirmed-save states.
- `src/features/ai/NewConversationDialog.tsx`: exact explanation of optional project association and sharing.
- `src/features/ai/useConversationHistory.ts`: preserve active view and loaded pages during focus refresh.
- `src/features/ai/chatWorkspace.css`: compact conversation spacing, context toolbar, header project link, preference form.
- `scripts/run-chat-browser-tests.mjs`: memory CRUD/failure, general-chat isolation, consent, pagination and scroll regressions.
- `scripts/run-playground-audit-tests.mjs`: updated composer accessible-label selector.

Backend:

- `src/main/java/in/voltforge/api/ai/memory/{UserMemory,UserMemoryRepository,UserMemoryService,UserMemoryController}.java`
- `ai/conversation/ConversationStore.java`: transactional memory commands, owner-scoped preference retrieval, meaningful neutral titles for greeting/test-only first messages.
- `ai/dto/AiChatRequest.java`, `ai/service/impl/AiServiceImpl.java`: server-only approved preference field and private gateway forwarding.
- `user/repository/UserRepository.java`: scoped write lock.
- `src/test/java/in/voltforge/api/{ConversationIntegrationTest,DevelopmentConversationSmokeTest}.java`
- `docs/schema/VF_MEMORY_001.sql`, `scripts/memory_schema.py`, `.gitignore` (Python cache files).

AI service:

- `api/schemas.py`, `api/routes.py`: carry approved preferences through existing synchronous and streaming paths.
- `engine/llm.py`: enum-only preference context; explicit memory/history and project-availability instructions.
- `tests/test_chat_integrity.py`: preference isolation, prompt-injection rejection, existing-provider forwarding.

## Tests executed

- UI `npm test`: passed full existing contract suite, type checks and lint. Lint reports 13 existing warnings in unrelated files; no errors.
- UI `npm run build`: passed TypeScript, production build, and bundle budgets.
- UI `npm run test:chat-browser`: passed persistence/reload, independent chats, rename/search/delete, duplicate prevention, retry, safe Markdown/code copy, memory CRUD/failure recovery, project scope/consent, desktop/mobile dark/light layouts, older-page loading, focus-refresh scroll preservation, and no forced scroll during incoming responses. These browser checks use API/auth fixtures.
- UI `npm run test:playground-browser`: passed existing editor, serial, save/conflict, AI context consent, theme/resize, and navigation checks. This invocation exercised the supported interpreter path, not a new native compiler validation.
- Backend full Maven test suite: 66 passed, with the opt-in development smoke initially skipped. The separately enabled development smoke also passed, bringing the combined unique result to 67 passed, zero failures/errors/skips in the final reports. Includes 17 conversation/memory integration tests with real HTTP endpoints and test JWT identities.
- Development smoke: real configured MySQL and existing local AI provider. Stored/read an approved preference, loaded it into a new general conversation with no project ID, persisted both messages, reopened the conversation, verified replay, and removed only the synthetic test account/data. Assistant response completed (91 characters).
- AI `.venv/Scripts/python.exe -m unittest tests.test_chat_integrity test_health_status test_security_va`: 16 passed. An initial run under the system Python failed because it lacked `llama_cpp`; the correct project virtual environment passed.
- Whitespace checks passed across all three repositories.

Refreshed only the identified local development backend and AI processes after checking that no pending chat generation existed. The backend runs the updated classes; the local AI model loaded successfully. No Keycloak or production process was changed.

## Intentional limits

- Memory supports only the listed non-sensitive preferences. Arbitrary facts and per-project persistent memory remain unsupported and are disclosed as such. The existing conversation transcript continues to persist separately.
- The model can use supplied preferences but is not guaranteed to follow every stylistic preference perfectly. Model output remains advice, not verified simulator/compiler evidence.
- AI Workspace cannot inspect unsaved editor changes or live output. Use the Playground and explicitly enable sharing for those inputs.
- Existing saved titles and project associations were preserved; no bulk rewrite of user history occurred. New greeting/test-only conversations receive a neutral title, and manual renames continue to persist.
