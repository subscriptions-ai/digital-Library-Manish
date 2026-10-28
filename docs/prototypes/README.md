# Librarian dashboard prototype

A design prototype, not part of the app. Nothing here is imported by the product.

- `librarian-dashboard-desktop.html` and `librarian-dashboard-mobile.html` open straight from disk: no server, no login, no internet (Inter falls back to the system font offline).
- All numbers beyond the real totals for the four held departments (79,099 items) are sample data. The "Prototype" menu (top bar) resets it, replays the animations and flips to the Premium state.
- To change it, edit `source/parts` (desktop) or `source/mparts` (mobile), then run `node docs/prototypes/source/build.mjs`.

## v2 (`librarian-dashboard-v2.html`)

A redesign of `librarian-dashboard-desktop.html` (which is left untouched). One responsive file for desktop, tablet and phone; open it from disk, no server or build needed.

The file is hand-editable: the stylesheet, the markup (`<script id="dc-template">`) and the logic (`<script id="dc-logic">`) are plain readable blocks; only the React runtime at the end is minified. The same sources live in `source-v2/` (`styles.css`, `tpl/*.html`, `logic.js`); `node docs/prototypes/source-v2/build.mjs` rebuilds the file from them.

All data is sample data. Use the small "Prototype" control (bottom right) to switch Free/Premium, replay animations, toggle sample live activity or reset.

### Library flow in v2
Content Library → a department (its content types: Books / Periodicals / Theses) → results with filters (department, content type, subject area, search, sort, "show more") → Read opens a secure-viewer mock (page by page, Save, Esc to close). Counts for Agriculture are the real split (8,936 / 20,067 / 363); everything inside the results and the viewer is sample content.

## Admin dashboard v2 (`admin-dashboard-v2.html`)

A redesign of the live `/admin` Analytics Dashboard. Same idea as the librarian prototype: one self-contained responsive file, open it from disk. The sidebar keeps the live admin's navy (`#0f172a`) with the blue active state; the 30+ flat links are grouped (Content, People & Sales, Billing, System), searchable and collapsible, with an off-canvas menu on phones.

Sources are in `source-admin/` (`base.css` + `admin.css`, `tpl/*.html`, `logic.js`, `runtime.js`); `node docs/prototypes/source-admin/build.mjs` rebuilds the file.

All data is sample data, chosen to add up to the live totals (650 users, 327,980 content items, 15 pending requests, 3,868 visits in 30 days, 647 users / 43 quotations / 19 contacts by state). Only the Dashboard page exists; the other sidebar links open a "not part of this prototype" page.
