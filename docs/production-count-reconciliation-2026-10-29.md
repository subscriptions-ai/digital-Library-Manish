# Production count reconciliation — admin content sections (read-only)

**Snapshot:** 2026-10-29T08:28:13Z, database `postgres`, one `REPEATABLE READ`, `READ ONLY` transaction (snapshot `3839380:3839380:`), deployed commit `9603179` (Books release merged). Run through the repository's own `sectionOverview` / `contentWhere` code (bundled and piped into the app container; nothing written, nothing deployed). For each of the 8 sections × 2 collections it compares four things, all inside the same snapshot: **overview** (the cards and department counts), **list** (the exact `where` the table and Export use, counted for the collection and for every department, all records and public only), **export** (what the Export button would deliver: `min(matching, 100,000)`), and an **independent SQL** total written separately (its own `GROUP BY domain`, its own status list, department folding done in code, no Prisma `where`, no database-side spelling expansion).

The list and export figures are the same `where` the HTTP endpoints use, evaluated directly; the HTTP routes themselves are not deployed yet and were exercised on the local test database (`scripts/test-admin-content.ts`).

| Section / collection | Total (overview = list = SQL) | Public (overview = list = SQL) | Export rows | Unassigned or unrecognised | Full text here |
|---|---:|---:|---:|---:|---:|
| Books / New | 102,190 | 65,582 | **100,000 (truncated)** | 36,508 (all blank) | 0 |
| Books / Archived | 48,984 | 29,344 | 48,984 | 4,113 (Engineering 4,090; Social Sciences 23) | 27,352 |
| Periodicals / New | 1,197,102 | 1,197,102 | **100,000 (truncated)** | 1,596 (Engineering) | 769,882 |
| Periodicals / Archived | 216,934 | 163,163 | **100,000 (truncated)** | 98 (Social Sciences) | 163,046 |
| Magazines / New · Archived | 0 · 5,962 | 0 · 5,957 | 0 · 5,962 | 0 · 0 | 0 · 0 |
| Case Reports / New · Archived | 0 · 1,997 | 0 · 1,994 | 0 · 1,997 | 0 · 0 | 0 · 0 |
| Theses / New · Archived | 0 · 45,027 | 0 · **22,068** | 0 · 45,027 | 0 · 11 (Social Sciences) | 0 · 20,085 |
| Conference Proceedings / New · Archived | 0 · 5,982 | 0 · 4,664 | 0 · 5,982 | 0 · 0 | 0 · 2,675 |
| Educational Videos / New · Archived | 0 · 1,105 | 0 · 1,105 | 0 · 1,105 | 0 · 0 | n/a |
| Newsletters / New · Archived | 0 · 1,989 | 0 · 1,986 | 0 · 1,989 | 0 · 0 | 0 · 0 |

**Result: no discrepancy.** Overview, list and independent SQL agree on every total, every public figure and every department (all 16 combinations; per-department list counts were compared for every department with records, plus Unassigned); departments + Unassigned equal the collection total in all 16 (`reconciles = true`). These are production figures at one instant; they are not comparable with local fixture counts or with earlier screenshots, and were not forced to agree with them. The Books figures match the other session's reconciliation (94,926 listed = 65,582 + 29,344).

## Defects and findings this surfaced

1. **Export silently truncated.** The Export CSV asks the server for at most 100,000 rows. For Books/New (102,190), Periodicals/New (1,197,102) and Periodicals/Archived (216,934) the file held the first 100,000 with no word of it. Fixed: a partial export now says so in the message and in the file name (`…_first_100000_of_1197102.csv`). A true full export of 1.2 million records is a different design (server-side streaming) and is not attempted here.
2. **Theses carry a status no rule names.** 846 archived Theses have the status `Open Access` (an access type that landed in the status column). The public catalogue has always listed them (it withholds only Draft), so they are public today. See "Status semantics".
3. **The "Engineering" bucket** (Books/Archived 4,090; Periodicals/New 1,596) and "Social Sciences" (132 across three sections) are not departments of the official list. They stay in the clearly labelled bucket "Unassigned or unrecognised department", with the unrecognised names listed beside the count. Nothing was reassigned. A classification preview (below) exists; it is a proposal.
4. **All six non-Books, non-Periodicals sections are empty in the New collection** in production, so their normal view is the empty-collection state with the button to the populated Archived collection.

## Status semantics (what "public" means)

Every status value found, both collections (2026-10-29T08:20Z): `Content` — Published 229,365 · Draft 97,699 · **Open Access 846** · published (lower case) 70; `Article` — Published 1,197,102 (only Periodicals); `Book` — Published 65,582 · Draft 36,608. No hidden, deleted, rejected, review or pending state exists in production today.

| | New collection (`Article`, `Book`) | Archived collection (`Content`) |
|---|---|---|
| Publicly listed | status is exactly `Published` | not a withheld state (`src/lib/publicStatus.ts`: draft, rejected, hidden, deleted, removed, pending, review, in review, needs review, unpublished, withdrawn, archived, takedown), compared without regard to case |
| Case | exact | ignored (`published` = `Published`) |
| A status no rule names | not public | **listed** (as the catalogue always did), counted as public AND reported separately as "listed with an unrecognised status", never folded into Published |

This is a change in WORDING of the rule and a guard, not in what a reader sees today: the public catalogue's old test was "not `Draft`", under which a record someone later marks `Hidden` or `Deleted` would have gone public. The same list now backs every public count, list, item gate and department figure and the admin overview, so they cannot drift. It changes nothing for any production record (none is in a withheld state); no status or right was changed anywhere.

Three tiers are kept apart: **publicly listed** (the rule above; admin cards "Public"); **readable under a reader's entitlement** (reader side: `/api/user/library-overview` — a record is only "readable here" for the departments and content types the account's plan covers); **full text held here** (`summary.readable`: a file served from here — always a subset of the listed ones, never the other way). `Other status` in the admin filters finds records that are neither Published, Draft nor Rejected.

## Department facet

Choosing a department filters the table only. The overview does not take a department, so every department stays in the list with its count under the active search, status and public-only filters (tested: the department list is byte-identical with and without a department chosen). The counters: **cards** = the whole selected collection, unfiltered; **department counts** = the selected collection, narrowed by search/status/"Public only", never by department; **"N … match"** = the table, i.e. every filter including the department; the **other collection's** figures sit in the line under the cards.

## "Engineering" classification preview (not applied)

Read-only rows from production (2026-10-29T08:30Z), run through the repository's existing department rules (`journalDepartment`, `titleDepartments`): Periodicals/New "Engineering" = 1,596 articles in 60 journal groups — a rule suggests a department for 4 journals (233 articles: Agriculture 136, Civil / Construction Engineering 97); **1,363 get no suggestion** (a person decides). Books/Archived "Engineering" (4,090) and the 132 "Social Sciences": a title term or subject keyword names one department for roughly a fifth; the rest have no evidence. The per-row preview CSVs are kept outside Git (see the evidence folder). No record was reassigned, and none should be without review.
