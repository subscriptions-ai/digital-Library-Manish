# Why the solo and institution Content Library looked different (2026-10-29)

Scope: the reader Content Library at `/dashboard/library` (solo and member accounts) and `/institution/explore` (librarian, college, corporate). Verified on an isolated copy of the development database (`stm_library_qa`); no production record, entitlement or message was touched. The one production access was read-only: the running container's image tag. Screenshots and the raw matrices are kept outside Git (`/home/itb04/evidence/digital-library/library-parity-2026-10-29/`).

## Confirmed causes

| # | Cause | Evidence |
|---|---|---|
| 1 | **The build.** Production runs `9603179` (the Books-counts merge). The Content Library rework (`e56f5b8`) is not in it, so production still shows the older layout: Department / Publisher / Content type, "Clear all", no Availability, no Publication year, no Language. | `docker ps` image tag on the production host: `…:9603179bfd00593feeb14b701e12bae0d0f1553a`; `git merge-base --is-ancestor e56f5b8 origin/main` is false. Running `origin/main` locally reproduces the production screenshots (placeholder "Title, author or keyword…", Read button to the right of each card, no Availability group). |
| 2 | **The collection.** The two production screenshots are the **Archived** collection (Content type select; 28,742 and 1,220 results); the local screenshot is the **New** collection (Articles / Books, Publisher, Year). The two collections are different tables with different metadata: an archived record (`Content`) has no publisher and no publication year (`publishedAt` is the upload date), so those filters cannot honestly be offered there. | `prisma/schema.prisma` model `Content`; the matrix below. |
| 3 | **Role chrome only.** Solo has the in-page "Browse / My Access / Saved" tabs, the free-preview clock and the Buy Premium card; institution has its own sidebar entries and subscription card. Intentional and kept. | Screenshots. |
| 4 | **Dataset.** Counts on the two dashboards were never comparable (different departments, collections and accounts). The matrix below fixes department, collection, viewport and entitlement. | — |

**Not a cause:** separate solo and institution implementations. Both routes render the same `StructuredLibrary` in both builds (`src/App.tsx`); there is nothing to merge.

## Like-for-like matrix

New collection: department **Applied Sciences**. Archived collection: department **Management** (the only archived departments in the development copy are Management, Mechanical Engineering, Medical Sciences and Electrical Engineering). Viewport 1440×900. `node scripts/qa-library-parity.cjs <base-url> <tokens.json>`.

| Build | Roles measured | New: controls | Archived: controls | Result |
|---|---|---|---|---|
| Deployed (`origin/main`) | solo Pro/Free, librarian, college, corporate, faculty, student, researcher | Department, Publisher, Sort by; Articles/Books | Department, Content type, Sort by | identical across roles |
| Local release (`e56f5b8` on `origin/main`) | the same eight | Department, Publisher, **Publication year**, Sort by, **Availability** (Any / Readable here / At the source / Metadata only); Articles/Books | Department, Content type, Sort by, **Availability** (Any / Readable here / Metadata only), Subject area | identical across roles |

Counts on the release build, identical for every entitled role: New 1,218 articles, Archived 5,616 items; a solo account with no department access gets 0 and an empty state (never a wider list).

## Validation (release branch `release/library-reader-parity-2026-10-29`)

* `tsc --noEmit`: 0 errors. `npm run build`: succeeds. `check:english`: ok.
* `test-library-discovery` 153/153, `test-books-overview` 41/41, `test-department-access` 26/26.
* Browser flows `qa-library-flows.cjs` against the **production bundle**: 34/34 (department → content type keeps its context, pagination/reload/Back, search and return from the reader, mobile filter drawer with Escape and focus return, every reader role reaches only its own library, request failure shows an error with Try again).
* Parity matrix: 18 role × collection pages measured, same controls for every role.

## Notes for whoever runs the browser checks

* Run them against the production bundle (`npm run build`, then `NODE_ENV=production`). Under the Vite dev server a QA page reloaded itself about 30 times in 45 s in this environment, while the production bundle loaded once. Several dev servers on one machine also share `node_modules/.vite` through a symlinked `node_modules`, and invalidate each other's dependency cache; give each worktree its own `node_modules` directory.
* The API limiter is per account (1,200 requests / 15 min). Repeated runs against one server exhaust it: the page then ends on `/login`, because a 429 on the profile request is treated as no profile. That behaviour was observed, not changed here.
* `scripts/qa-library-flows.cjs` now waits for stable lists and for the elements it clicks, instead of fixed sleeps.

## Still local / not covered

* Nothing is pushed or deployed; the release branch is local, based on `origin/main`.
* Not re-run in this pass: dark mode, and the expired-subscription state (covered by the earlier access-overview checks, not by the parity matrix).
