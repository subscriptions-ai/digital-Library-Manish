# Content Library usability and correctness (2026-10-29)

Scope: the reader-facing Content Library in every reader dashboard. Nothing in production was touched: no catalogue record, no entitlement, no message, no deploy. All verification ran on `stm_library_qa` (a copy of the local development database) and the throwaway test database. Screenshots: `content-library-usability-2026-10-29/screenshots/`. Data-quality review: `library-data-quality-2026-10-29/`.

## 1. Role / route / access-state matrix

There is no separate "R&D" role in the application: a company account is `Corporate`, and runs from the institution dashboard when it belongs to an institution. "Faculty", "Researcher" and "Student" are *account types* (`memberRole`); technically all three are `role = Student` with an institution, and they read from `/dashboard`. Authorisation never reads `memberRole`.

| Account | Technical role | Library shell | Access comes from | Reading |
|---|---|---|---|---|
| Librarian / Institution admin | `Institution` | `/institution/*` | the institution's subscription, else the departments its administrator chose | not timed with a subscription; free clock without |
| College / University / Corporate (R&D) admin | same-named role + institution | `/institution/*` | same | same |
| Faculty / Researcher / Student member | `Student` + institution | `/dashboard/*` | the institution's departments (never more) | same as its institution |
| Individual, Pro | `Subscriber` + own subscription | `/dashboard/*` | the subscription's departments (an unlisted Pro plan: the ones selected) | not timed |
| Individual, Free | `Subscriber`, no subscription | `/dashboard/*` | the departments selected at registration | free clock (timed sessions) |
| Individual with no departments | `Subscriber` | `/dashboard/*` | none | none |
| Staff (admin, manager, sales, publisher, studio) | staff roles | no reading shell | — | — |

Routes: `/dashboard/library` (Browse), `/dashboard/library/access`, `/dashboard/library/saved`, `/dashboard/history`, `/dashboard/viewer/:id`; `/institution/explore`, `/institution/access`, `/institution/saved`, `/institution/history`, `/institution/viewer/:id`. Measured in a browser (`scripts/qa-library-roles.cjs`), every reader account **opens its own shell's four routes and is sent home from the other shell's four** (9 accounts × 8 routes). The two shells share `StructuredLibrary`, `AccessOverview`, `ResultCard`, `ContinueReading` and `SaveButton`; only the base path differs. Permissions are unchanged and server-side: the department scope (`applyDomainScope`), the plan's content-type limits (`checkContentAccess`) and the free clock (`passesFreeClock`) are the same code as before.

## 2. Confirmed root causes

1. **Applied Sciences → Books lost its department/kind** (reproduced in a browser). The institution "Browse" card always sent Books to the *archived* shelf (`mode=archived&atype=Books`) because, unlike the reader copy, it ignored which dataset held the items. That account has no archived shelf, so the library silently switched to the New Collection but kept the default `kind=articles` and a stale `atype=Books` chip: **1,218 articles under a "Books" label**. (`/institution/explore?kind=books`, with no department, is also what the librarian home's "Books" tile links to.) Fixed at both ends: every Browse link is built from one module (`libraryParams.ts`) from the shelf the items are on, and the library carries a request for a missing shelf to where those items live (`resolveForAccess`) or says it could not.
2. **State was copied, not read.** Twenty `useState`s mirrored into the URL with `replace`, so Back skipped every filter change and a changed filter kept page 20. The address is now the only state; each change writes it (Back steps through filters), changing a filter resets the page, search typing replaces the entry.
3. **"3 of 3 accessible" / "Full Access"** counted content *types* that merely had a row, and called a department "Full Access" even on the free preview with a running timer and the sidebar saying "No active premium subscription". Three separate derivations. The server now states the facts (`basis`, `timed`, `expiresAt`) and one function words them.
4. **Failed requests looked like empty ones** on the access screen (a toast, then "No departments available") and results could be overwritten by a slower, older request. Requests now abort when superseded, and failure, empty, no-entitlement and loading are different states.
5. **Hosting rights implied by badges.** A record the source calls open access, a LinkOnly record that still stores a file address, and a catalogue entry were all shown as "Full text" / "External source" / "Metadata only" in combination. Availability is now computed once on the server from the same rule the Books counts use.
6. **Subject facets.** `/api/content/filters` read every legacy row into memory and only refused titles, numbers and sentences (a short DOI or citation passed). See the data-quality README for what is and is not reproducible locally.
7. **Floating WhatsApp/Feedback buttons covered Read/Save/Browse** (visible in the first screenshot): the action column sat on the right edge, exactly where the fixed buttons are.

## 3. What changed

* Results: availability filter (readable here / at the source / metadata only, with counts), publisher, language (only where records carry one), publication year, content type, "open access with a recorded licence" (CC licences only — **"Publisher terms (our own)" is not open access**), sort, applied-filter chips, "Clear filters", exact totals and "showing 1–12", all in the database query next to the count. Within-results search is named as such; the box says only what is implemented (title and author; archived: subject and tags too — books now match authors, they matched titles only).
* New Collection vs Archived are described, not renamed: two shelves of one library, neither "recent" nor "closed".
* Result card: title, authors (expandable), journal/publisher · year · volume(issue), availability, source-OA (separate badge, tooltip says it is not hosting), type, department; DOI/ISSN/ISBN/licence/source in "More details"; **Read** only when the full text is held here, the plan covers it and the clock is open; **Visit source** only for a validated `http(s)` address; **View details** otherwise. Save is always visible; actions are the last line, on the left.
* Access overview (shared): per department the types with *in the catalogue* and *readable here* (and at the source / metadata only), a Browse link per type and per department; a type on both shelves is two rows. The banner says why the access exists and for how long.
* Returning readers: "Continue reading" (their own last full-text reads, straight into the reader, which resumes at the saved page) with Saved and Reading history always one click away. Nothing is recommended or invented.
* Layout: filter drawer below 1024px (dialog, Escape, focus trap, focus returns, "Show N results"), no horizontal scroll at 390px, dark mode checked.
* Data: `scripts/audit-library-data-quality.ts` (read-only) and the manifests.

## 4. Changed files

New: `src/lib/{libraryParams,libraryAvailability,libraryQuery,subjectFacets,accessSummary}.ts`, `src/components/library/{ResultCard,ContinueReading,AccessOverview}.tsx`, `scripts/{test-library-discovery.ts,qa-library-fixtures.ts,qa-browser.cjs,qa-library-flows.cjs,qa-library-roles.cjs,audit-library-data-quality.ts}`, this folder and `library-data-quality-2026-10-29/`.
Changed: `server.ts` (list endpoints take the shared filters and say what each record offers; `/api/library/discovery-facets`; `/api/user/library-overview`; `/api/content/filters` by `GROUP BY`; a department the account does not hold is reported as `denied`), `src/components/StructuredLibrary.tsx` (rewritten around the address), `MyContentAccess.tsx` and `InstitutionContentAccess.tsx` (now one shared component), `src/lib/libraryRoute.ts`, `MetadataModal.tsx` (source link validated), `ui/Badge.tsx` (`title`), `scripts/test-department-access.ts` (the shortest address for "Articles" omits the default `kind`).

The existing `/api/user/content-access` is unchanged and still served; nothing in the app reads it any more.

## 5. Verification (local / test only)

| Check | Result |
|---|---|
| `scripts/test-library-discovery.ts` (address, resets, bug reproduction, availability, subject facets, wording; API: filters vs per-record classification, books, authorization, overview counts, archived shelf, facets, personal lists) on `stm_ingestion_test` | **153 passed, 0 failed** |
| Browser: `scripts/qa-library-flows.cjs` (card → type → results, URL, reload, Back, filter resets page, reader return, drawer, 8 reader roles, cross-institution, failed request) | **34 passed, 0 failed** |
| Role × route matrix in a browser | 72 cells, all as in §1 |
| Regression: `test-entitlements` 90/90, `test-department-access` 26/26, `test-saved-and-history` 430/430 (8 account types, privacy), `check:english` ok | pass |
| `tsc --noEmit` | clean |
| `vite build` (to a scratch folder) and the server bundle (`esbuild`, scratch output) | build |

Counts against the matching population: overview total / readable / at-source for Applied Sciences articles and books equal the database classification of the same rows (test 2d); `oa=1`, `avail=*`, `year`, `lang`, `publisher` totals equal the per-record classification (test 2a/2b). Local example: Applied Sciences = 1,354 records: Periodicals 1,218 (1,173 readable here, 25 at the source, 20 metadata only) and Books 136 (0 readable here, 136 at the source). Open access with a recorded licence = 0 for the articles, because the 241 "OpenAccess" rows carry "Publisher terms (our own)".

Not exercised for lack of a way to do it safely here: a free reading session actually in *waiting*/*spent* (the lock label is covered by the existing clock code and by the wording tests, not by a browser run) and a subscription that has just expired (its wording is covered by the unit tests: "ended on …" / "N days left").

## 6. Open items and blockers

* **Production numbers**: not queried (see data-quality README). Re-run the audit on a read-only production export before deciding any correction. The DOI/citation subject values you saw on screen could not be traced locally.
* **Deploy**: `server_compiled.cjs` is tracked and production runs it; it was **not rebuilt or committed** because `server.ts` also carries another session's uncommitted Books-reconciliation work. Rebuild after that lands. No schema change, no `db push`.
* **Books count reconciliation**: this change reuses its definitions (`publicBookWhere`, "readable = ViewableHere + file"). One edge: an admin-entered book with a file and a null `accessStatus` is "readable" in the viewer but "metadata only" by that definition (none exist locally).
* Source cleaning (markup in titles, journal name written into `Article.subject` by the Admin bulk import) is reported, not fixed.
* Department is carried by its canonical name in the address (validated, server-checked), not by an opaque id; the registry already folds spellings.
* The "Continue reading" strip and the scroll position are not restored to the pixel after Back (the page, filters and results are).
