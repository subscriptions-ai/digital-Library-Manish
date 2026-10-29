# Admin content sections: department navigation, counts and layout (2026-10-29)

Applies to `/admin/books`, `/admin/periodicals`, `/admin/magazines`, `/admin/case-reports`, `/admin/theses`, `/admin/conference-proceedings`, `/admin/educational-videos`, `/admin/newsletters`. Verified on a copy of the local development database and the throwaway test database only; no production data was read or changed. Verification screenshots are kept outside Git.

## What one record is (the counting unit)

| Section | New collection | Archived collection |
|---|---|---|
| Books | one `Book` row — a book title | one legacy `Content` row, type Books |
| **Periodicals** | one `Article` row of type Periodicals — **an individual article**. *Not* a journal title (those are the `Journal` table, Admin › Journals, which the page links to) and *not* an issue (issues are not stored; each article only carries a volume/issue) | one legacy `Content` row, type Periodicals — an individual paper |
| Magazines, Case Reports, Theses, Conference Proceedings, Educational Videos, Newsletters | one `Article` row of that type | one legacy `Content` row of that type |

* **New** and **Archived** are two *collections* (two tables with their own lifecycles), not publication statuses. A Published archived record is as public as a Published new one.
* **Public** = what the public library lists: new → status `Published`; archived → status not `Draft` (compared without regard to case: the legacy table holds a lower-case `published` on 70 Educational Videos, which a plain `= 'Published'` filter missed).
* **Department** is single-valued in every table (one `domain` string), so *departments + Unassigned = the filtered total*, nothing is counted twice, and the page says so. **Unassigned** = no department, a blank one, or a name the department registry does not recognise (for example "Engineering"); nothing is auto-classified, and the unrecognised spellings are listed beside the count so someone can decide. There are no multi-valued classifications in these sections, so there are no overlaps to explain.
* The wording of each unit is `SECTION_LABELS` in `src/lib/adminContent.ts`; the page shows it ("Each record here is one individual article (not a journal title or an issue)").

Counting is not forced into one rule: the search fields differ (Books: title, author, ISBN, publisher; new Periodicals: title, author, journal, DOI; archived: title, author, description), "full text served here" follows each table's own rule, and Rejected exists only in the New collection.

## Behaviour

* One filter per section and collection (`contentWhere`) feeds the table, the Export and the department counts, so a number beside a department is the number of rows the table shows after clicking it. Counts follow search and status, not the department, so choosing one never empties the others. Every department of the registry is listed (zero ones included) in a fixed alphabetical order, then Unassigned.
* **All records / Public only** is one control; the counts and the table follow it.
* **URL state**: collection, search, status, public-only, department, sort and page (`src/lib/adminContentUrl.ts`). Filter changes write a new history entry (Back steps through them), typing in the search replaces it, any filter change returns to page 1, a page past the end goes to the last page. An explicitly chosen collection is never switched on the reader's behalf.
* **Layout**: from 1400px the department list is a collapsible panel beside the table; below that it is a drawer opened from one button (dialog, Escape, focus trap, focus returns). Exactly one department control exists at any width. The table scrolls inside its own box if it must (the page never does); the Actions column stays pinned. Titles show on two lines with "Show full title" (only when actually cut); authors show two names and "+N more".
* **Cards** describe the whole selected collection and say so; the other collection's figures are in the line below. A failed overview shows dashes and a Retry, never zeros; a failed list is an error, never "no records" (and one Retry reloads both).
* **Empty collection**: "There are no magazine items in the New collection", with a button that opens the populated one and its real count (shown only when that count was actually read). The explicit choice is kept on refresh.
* **Creating**: one entry point, the "Add <type>" button on the list ("Add Thesis", not "Add These"); the module's "Add New" tab is gone (the tab only appears while the form is open). Permissions are unchanged and server-side.
* **Authorization**: the New collection's list and overview need an admin or subscription-manager token; the Archived collection's list and counts need a super admin. A subscription manager has no content module in the UI (it is sent to its own workspace).

## Routes and files

API (`server.ts`): `GET /api/admin/library/overview` (new: any section, either collection), `GET /api/admin/library/items` and `GET /api/admin/content` (now use the shared filter, take `sort`, reject an unknown section with 400). `GET /api/admin/library/books/overview` is left as it was.
New: `src/lib/adminContent.ts`, `src/lib/adminContentUrl.ts`, `src/lib/useModalFocus.ts`, `src/components/admin/content/ContentOverview.tsx` (cards, department list, panel, drawer), `scripts/test-admin-content.ts`, `scripts/qa-admin-flows.cjs`. Changed: `ContentListView.tsx` (rewritten around the address), `ContentModuleLayout.tsx` (tabs), `scripts/qa-library-fixtures.ts` (admin and manager QA accounts).

## Console / network errors

The reported counter was not taken as a cause. In the browser every section was opened at 1085px and the app's console errors and failed requests were recorded: none from the application. The only failing request in development is Vite's hot-reload socket (`:24678`, refused), which does not exist in a production build. The real defect found in this area was different: the section counts were fetched with `.catch(() => 0)`, so a refused request showed as an empty collection.

## Remaining issues

* `BooksOverview.tsx`, `adminBooks.ts` and the `/api/admin/library/books/overview` route (another session's uncommitted work) are no longer used by the page; the generic code does the same job for Books. They can be removed once that session has committed.
* `Article.domain` values such as "Engineering" are not in the registry, so they count as Unassigned (1,596 locally in new Periodicals). Deciding where they belong is a data decision, not made here.
* The department panel appears from 1400px because the admin sidebar takes 256px; the threshold is `DEPARTMENT_PANEL_MIN_WIDTH`.
* Production figures were not looked at and must not be compared with local fixture counts.
