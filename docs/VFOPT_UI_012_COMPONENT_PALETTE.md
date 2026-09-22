# VFOPT-UI-012: bounded component palette

Implemented and verified on the 1,000-component browser fixture on 2026-09-12. The task's three acceptance criteria pass within that scope. The original audit and previous tasks' pending live/performance work remain recorded separately in `../../VOLTFORGE_UI_BL_OPTIMIZATION_BACKLOG.json`.

The palette now caches catalogue ordering and normalized search text, renders up to 40 component buttons per page, and reuses unchanged rows. Category browsing provides direct access to component families. Search always covers the full catalogue by name, type (including its displayed form) and description, regardless of the selected or collapsed category. Clearing search restores the browsing category and collapse preferences.

The custom-component studio loads on first use. Its mounted instance is retained after closing so an unfinished draft survives reopening. Read-only changes disable insertion and creation and close an open studio. Existing coverage badges, premium labels, built-in/API catalogue merging and canvas-node creation remain intact. Backend and AI implementation were not changed.

## Why this change

UI-010 had already isolated the palette from canvas-store updates. The UI-012 baseline confirms zero palette commits from 60 runtime, 60 node geometry/drag, 60 selection and 60 viewport updates. It also shows that 1,000 rows still mounted, each keystroke sorted the entire catalogue, and the studio was imported eagerly.

| Measurement | Before | After |
| --- | ---: | ---: |
| Components in catalogue | 1,000 | 1,000 |
| Initial mounted component buttons | 1,000 | 40 |
| Catalogue sorts during 20-character search | 40 | 0 |
| Typing event to second frame, p95 | 409 ms | 37 ms |
| Palette commits for each 60-update canvas stream | 0 | 0 |
| Studio module requested before opening | Yes | No |

The before and final after reports have identical fixture-source SHA-256 values. Both use installed headless Chrome, a 1366 by 768 viewport, Vite development and React StrictMode. StrictMode accounts for two initial index builds and the baseline's two sorts per input. The catalogue contains the real built-ins plus synthetic entries, totaling exactly 1,000. Query-cache data and blocked external requests keep the run independent of backend availability and avoid real project writes.

Timing is an input-event-to-second-animation-frame scheduling proxy, not pixel paint or total laptop CPU attribution. The final raw sample includes one 58.8 ms event; the p95 gate is 50 ms and passes at 37 ms. Background activity and power mode were not controlled. An intermediate implementation measured 52.9 ms p95, which led to memoizing individual rows; it was not accepted as the final result.

## Implementation and behavior

- `componentPalette.ts` builds an immutable search index when the merged catalogue identity changes. Known categories retain the existing order, entries within each category retain sort-order/name ordering, and unknown categories follow known categories deterministically. Empty search reuses the index; filtering and paging never sort it again.
- `ComponentPanel.tsx` keeps the stable canvas action selector and memo boundary from UI-010. Indexing, filtering and page grouping have separate memo dependencies. Coverage changes and navigation reuse the index. Memoized rows receive a stable insertion callback, which reads the current viewport when activated.
- Pagination bounds component buttons to 40 and category headers to at most 40 on a page. The footer identifies the current range; category counts describe items on that page. A category selector avoids stepping through preceding families. A smaller/replaced catalogue clamps an invalid page, and entering a query resets to the first page.
- Search trims surrounding whitespace and is case-insensitive. It reveals matching collapsed groups. While searching, category browsing/disclosure is disabled and the selector says `Searching all categories`; clearing the query restores the previous browsing state.
- Search, category selection, result region and page buttons have accessible names/control relationships. Category buttons expose expanded state. Keyboard activation inserts components, paging focuses the result region and resets scroll, and visible focus styles are present. Both 272 px and 220 px palette widths were inspected; paging stays visible without horizontal overflow. These checks are not a complete assistive-technology audit.
- Studio loading follows the application's lazy/Suspense pattern. Production manifest traversal confirms the 6,449-byte studio chunk is outside the editor's static import closure. No dependencies were added.

Pagination is deliberate: it gives a firm row limit with native controls and avoids removing focused items during scroll. It does not provide one continuous list of all components; category browsing and global search provide direct discovery. This task does not optimize network transfer of the full catalogue or change catalogue ownership/security contracts.

## Validation and evidence

- Four catalogue regression groups pass: immutable ordering and unknown categories, complete bounded traversal of 1,000 entries, empty/shrinking/out-of-range pages, and global search/catalogue replacement.
- Sixteen palette browser checks pass: row limits; four independent canvas streams; typing budget; all 1,000 items across 25 pages with no duplicates; name/type/description search; category/global-search interaction; collapsed matches; replacement/clamping; coverage changes; keyboard insertion at the current viewport; read-only behavior; lazy studio/draft retention; and narrow layout.
- Seventeen existing editor browser checks pass again, including real Monaco typing, save/share snapshots, pan, engine controls, autosave, permission updates and navigation cleanup. Their follow-up filename preserves the previous reports; the reused suite retains its original `VFOPT-UI-010` task identifier.
- TypeScript, production build and bundle-budget checks pass: entry 98.2 KiB / 150 KiB, initial static JavaScript 504.6 KiB / 550 KiB, 13 / 16 initial chunks, largest chunk 175.2 KiB / 450 KiB.
- Lint exits successfully with one `react/only-export-components` warning in the isolated browser fixture entry, which owns its React root. Application lint has no reported warnings. Whitespace checks pass.

This item ran the relevant palette and editor tests rather than rerunning unrelated simulator/backend suites. The existing simulator/store/backend bytes are verified against the start-of-item inventory. Live authenticated custom-component creation and whole-application CPU/performance validation were not performed or claimed.

Run from `Voltforge_UI`, sequentially for the browser suites:

```powershell
rtk proxy npm run test:palette-index
rtk proxy npm run build
rtk proxy npm run lint
rtk proxy npm run test:palette-browser
rtk proxy node scripts/run-editor-render-tests.mjs --report-prefix=vfopt-ui-012-editor
```

Browser runs require installed Chrome; the full editor regression also needs its configured Monaco CDN. Fixture ports are 3104 and 3102. The pure catalogue suite is included in `npm test`. Before-mode measurements require the original source; running `--before` on changed code does not reproduce the historical baseline.

Artifacts: [implementation](reports/vfopt-ui-012-implementation.json), [before browser](reports/vfopt-ui-012-palette-before.json), [after browser](reports/vfopt-ui-012-palette-after.json), [catalogue tests](reports/vfopt-ui-012-palette-index-tests.json), [editor regression](reports/vfopt-ui-012-editor-render-after.json), [272 px screenshot](reports/vfopt-ui-012-palette-after.png), [220 px screenshot](reports/vfopt-ui-012-palette-narrow.png).

Next: **VFOPT-UI-016 — Avoid synchronous global rerouting when loading saved circuits**. Capture its current load baseline, define safe reuse of saved routes and make expensive routing cancellable without changing pin endpoints, collision handling or document ownership. VFOPT-UI-017 follows it for drag-time/drag-end routing.
