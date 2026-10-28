# Saved and Reading History

"Saved" is the one name for the wish list (table `Favorite`, `/api/user/favorites`). Reading History is what a reader has opened.
Both are personal: every query is keyed on the signed-in account's own id, never on an id the request carries.

## What was wrong (confirmed, not assumed)

| # | Finding | Evidence |
|---|---------|----------|
| 1 | The institution dashboard (`/institution/*`) had no Saved or Reading History: no sidebar entry, no route. It is not a version difference: the deployed build (`901fced`) has the same `InstitutionLayout` with neither. `/dashboard` already had Reading History in the deployed build; Saved was only a tab inside Library. | `git show 901fced:src/components/institution/InstitutionLayout.tsx` has no such entry; `DashboardLayout.tsx` at `901fced` has "Reading History" and no "Saved". |
| 2 | Reading History only ever held legacy `Content`. `StudentActivity.contentId` is a foreign key to `Content`, so an Article or Book (the whole new catalogue) could not be recorded. `/view` wrote it only for legacy items and only for roles `Student` and `Subscriber`, so Institution, College, University and Corporate accounts were never recorded. | Local DB: 16,240 article views in `LibraryEvent`, `StudentActivity` holds legacy rows only. FK `StudentActivity_contentId_fkey → Content`. |
| 3 | `PATCH /api/user/reading-progress` for an article or book id failed on that foreign key (the viewer fires it and ignores the answer), so "resume where you left off" never worked for the new catalogue. | Same FK. |
| 4 | The reader footer said "Reading session is logged" unconditionally. | `ProtectedContentViewer.tsx` (static text). |
| 5 | Saving worked only from the reader. No heart on results or on the article page, so Saved was hard to feed. | grep: only the reader called `/api/user/favorites`. |
| 6 | `GET /api/user/favorites` returned the stored `fileUrl` of a legacy item whether or not the reader's plan covers it. | `publicContent` keeps `fileUrl`. |
| 7 | Titles that arrive as markup (`&lt;p&gt;…&lt;/p&gt;`) were shown literally. Production, read-only count taken 2026-10-28: 47 Book titles (21 published) contain an entity or a tag, and 4,462 Article titles contain a tag or an encoded tag; the 19 Book titles with tags are all DOAB-sourced. | Source records, not a display bug alone. |

## What changed

* `ReadingHistory` table (additive): one row per account per Article or Book, updated in place on a reopen. Legacy items keep using `StudentActivity`.
  `GET /api/user/history` merges both, newest first, with `q`, `page`, `limit`.
* `/api/content/:id/view` records an open only after access was granted (a refused open leaves nothing), for every non-staff role, and answers `tracked` (true / false / null for a staff preview) and `access` (`full` / `external` / `metadata`).
* Progress (`PATCH`) updates an existing entry only; it can never start one, and it validates the page.
* `GET /api/user/favorites`: no stored file address, a withdrawn item stays listed as "no longer available" so it can be removed; saving needs the item to be openable (draft or unknown id → 404). New `GET /api/user/favorites/ids`.
* UI: shared `SaveButton` (reader, article page, result rows), `Saved` in both sidebars, `/institution/saved` and `/institution/history`, history with search, paging, "Continue reading · page N", labels that say read / opened / viewed as appropriate. The footer states what actually happened.
* Titles: `plainTitle()` (markup removed, entities decoded, never inserted as HTML) applied in the shared `public*` helpers, the reader, history, trending and search.

## Privacy

Saved and history are the account's own. The institution account does not see members' lists (it gets its own, even when it names a member in the query). Institution aggregate analytics are untouched. A saved item or history entry is not access: reopening goes through `/view`, so a spent free allowance, a withdrawn item or a department the account no longer holds is refused there.

## Deploying

`npx prisma db push` (adds the `ReadingHistory` table; nothing existing changes). Until it runs: opens still work and the reader says the session could not be added to history; the history page shows its error state. Nothing in production was modified while building this.

## Known limits

* A Book or Article already stored with markup in its title is fixed at display, not in the database. Source cleaning for newly ingested rows is a separate change.
* The "journal article shown as Books / Commerce" record could not be pinned down: the production query for it was blocked. Locally, the legacy `Content` table has roughly 2,000 rows per content type, which looks assigned in rotation rather than from the source; about 94 of 313 local "Books" look like journal articles. Proposed correction: classify from source evidence (DOI/venue, ISBN) into a review list; no bulk reclassification.
* Opening something from "Details" (metadata modal) or "Read at publisher" is not recorded: nothing was read in the library.
* History keeps the latest 500 entries per shelf.
