# AI Workspace cleanup — 2026-10-19

## Audit

The existing app uses React 19, TypeScript, Vite, React Router, Zustand and React
Query, with shared UI controls and semantic CSS theme tokens. `/ai-chat` renders
`AiChatPage` → `AiChatPanel`; the Playground reuses the same panel. Conversation
history, persistence and streaming continue through the existing APIs and hook.

The screenshot's clutter came from two visible history toggles, decorative header
branding, an unexplained memory icon, repeated user avatars, copy controls inside
message bubbles, and competing width/background rules. The source already had
one full-message copy button per message; code blocks also had a separate code-only
copy action. No duplicate saved messages were identified by this UI audit.

Dark-mode selectors in `components.css` also overrode the workspace's message,
composer and surface styles. Those redundant overrides were removed so the shared
theme tokens and workspace rules determine both themes consistently.

## Implemented

- One history control at a time: collapse in the history sidebar, reopen at the
  left of the conversation title. New Chat remains available in either layout.
- Responsive history drawer with backdrop, Escape dismissal, focus containment,
  focus return, and an inert chat panel while the drawer is open.
- Compact title-only header with a Chat options disclosure for Memory and context/privacy details. Project links,
  Playground expand/close actions and all working memory controls remain available.
- No user or assistant avatars, including before streamed responses. Neutral user bubbles,
  readable assistant text, bounded line lengths and consistent message action rows.
- `MessageCopyAction` copies the complete original message, including Markdown and
  code, confirms “Copied” briefly, and handles denied clipboard access inline.
  Code-only copying remains explicitly labeled inside code blocks.
- Full-message Copy is an icon revealed on message hover or keyboard focus, with a
  subtle visible touch control where hover is unavailable. No permanent Copy labels
  surround ordinary messages. “Copied” remains briefly visible after success.
- A unified composer with bounded automatic growth, independently scrolling long
  drafts, Enter/Shift+Enter handling, character count and Send/Stop in one location.
  Width-only resize observation avoids layout feedback loops.
- Mobile chat shell tracks the visual viewport so the keyboard can reduce available
  height without covering the composer. History collapses at the existing 820px
  mobile breakpoint.
- Removed the persistent history footer; tightened main navigation spacing while
  preserving its logo, routes, active state, account information and logout.
- Removed the repeated VoltForge AI header subtitle, decorative welcome icon, and
  general-chat notices above the composer. Context consent remains visible only for
  a real linked project. Character count and shortcut help appear on input focus or
  with a draft. Ordinary chat defaults to title, messages and composer.

## Files changed for this cleanup

- `src/features/ai/AiChatPanel.tsx`
- `src/features/ai/ConversationSidebar.tsx`
- `src/features/ai/MessageCopyAction.tsx` (new)
- `src/features/ai/chatWorkspace.css`
- `src/components/ui/Field.tsx` (React 19 textarea ref support)
- `src/components/layout/AppLayout.tsx`
- `src/styles/components.css`
- `src/styles/workspace.css`
- `scripts/run-chat-browser-tests.mjs`

Other changes already present in the working tree were preserved. This cleanup
does not change backend services, authentication, database schemas or saved records.

## Validation

- `npm run build`: TypeScript, production bundle and bundle budgets passed.
- `npm run lint`: passed with 13 existing warnings outside the changed logic.
- `node scripts/run-chat-browser-tests.mjs`: all 11 verification groups passed.
  Includes full-message/code copy, temporary confirmation, clipboard denial and
  recovery, history CRUD, preferences, project consent, safe Markdown, restored
  messages, partial streaming before completion, Stop/retry, and scroll preservation.
- New layout assertions cover 1366, 1024, 768, 390 and 320px widths in both themes,
  title containment, absence of avatars/subtitle, hover/focus copy visibility, one message-copy action per message, drawer
  focus/Escape, bounded composer growth and a simulated keyboard viewport. No
  browser exceptions or ResizeObserver errors remained.
- `node scripts/run-playground-audit-tests.mjs`: all 7 default verification groups
  passed, including shared AI dock containment, resizing, themes, zoom, conversation
  continuity, consent, editor persistence and execution/serial regression checks.
  The optional remote-compiled firmware branch was not run for this UI change.
- `git diff --check`: passed.

Browser tests use isolated authenticated API fixtures, with real incremental HTTP
delivery for the streaming UI test. They do not claim new live-database/provider
verification. Physical iOS/Android keyboards were not tested; visual viewport
behavior was exercised in Chromium automation. Screenshots are under
`test-results/chat/cleanup-{dark,light}-{width}.png` and `test-results/playground/`.
