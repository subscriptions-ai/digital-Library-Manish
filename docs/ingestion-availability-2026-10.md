# Ingestion availability — idle behaviour, engine states, Crossref Books and Pressbooks (2026-10-16)

Local only. Nothing here is deployed, and no catalogue record was changed.

## What changed

| Area | Before | After |
| --- | --- | --- |
| Nothing can be asked | One `Idle` run row every timer tick (10 ticks → 10 rows), and every tick re-walked all providers | One row when the stretch begins; later ticks sleep until the soonest source is due and write nothing (10 ticks → 1 row) |
| Engine status | `Running normally` / `Delayed` / `Needs attention` (red whenever all three content types waited) | `Running` / `Waiting for source recovery` / `Needs attention` / `Paused`. Red only for engine failures (passes failing, abandoned worker claims, long silence with no source to blame) |
| What is next | Not shown | "Next eligible source: Journals · DOAJ", "Next attempt: 5:27 PM" |
| Crossref Books | Broke on the live service (HTTP 400) | Fixed (see below) |
| Review-first Book sources | Would add to the review queue without limit once switched on | Rest while 250 of their books wait for review (`BOOKS_REVIEW_BACKLOG_LIMIT`, 0 = no limit) |
| "Connection reset" | Category only | Also says whether it happened before any reply or part-way through one |
| Metrics block | "Metrics" | "Ingestion activity — lifetime" with a note that these are events, not catalogue totals |

### How the sleep works
`runRotationPass` (src/lib/ingestion/rotation.ts) keeps one record, `idle`, in the rotation state. It holds the soonest time any source can be asked again, which source that is, and the engine settings the picture was judged under. A tick that finds `now < nextAt`, the same settings and nothing held open returns immediately and writes nothing.

It wakes at `nextAt`; when a per-pass setting, the scope, or the on/off switch changes (`POST /api/admin/ingest/state`); when a source is switched on or off by environment variable; on a server restart; and at once for "Run extra pass now". A source held with **no** end time (a Quick Import on it, or a review backlog) is not slept through: the engine looks again every tick, cheaply, and still logs the stretch once. A changed picture (a different source is now first back, or the cause changes) is logged again.

## Crossref Books — live staging result
Run against the real service, writing only to the throwaway database `stm_ingestion_test` (`npx tsx scripts/staging-book-feeds.ts`).

Two bugs found only by running it live, both fixed in `crossrefBooks.ts`:
1. `select=language` is not selectable on `/works` → HTTP 400 on every request.
2. `type:textbook` is not a Crossref type → HTTP 400.

After the fix: paging works (cursor advances, resumes from the saved cursor, no overlap between pages); every record is accounted for; **no licence is invented and nothing is offered as open** (all `MetadataOnly`); every book written is a `Draft` with no department; DOI dedupe holds on a re-read; Quick Import runs from its own position and never moves the continuous checkpoint.

Things to know before enabling:
- The universe is large: **2,478,505** book-family records. About 29 % are unusable (no title or contributor), and of the usable ones about a quarter reach review (the rest are too far from any department and are skipped, not written). Page 1 of an unfiltered walk is 100 title-less records.
- Crossref has no language field we can select, so a book's language is unknown and non-English books can reach review.
- It shares the Crossref health row with Crossref Articles and Journals: if Crossref rests, Crossref Books rests too.
- Hence the review-backlog rest. Without it, `BOOKS_CROSSREF=1` would keep adding review drafts for as long as it ran.

## Pressbooks Directory — live staging result
Works as built: 3,507 books at 20 per page; pagination follows `next`; resumes at its own page checkpoint; duplicates are held (fingerprint); no department placement is automatic (review only). Licences are read from each book's own site (up to `PRESSBOOKS_LICENCE_CHECKS`, default 20 per batch = a full page). In the sample of 40: 1 declared CC BY-NC-SA (recorded, `LinkOnly`, never offered as open), the rest declared nothing or were not checked → `MetadataOnly`, no licence recorded.

## Turning them on (needs approval; not done)
Set in the production environment and restart:

    BOOKS_CROSSREF=1
    BOOKS_PRESSBOOKS=1
    BOOKS_REVIEW_BACKLOG_LIMIT=250     # optional; 250 is the default

Each stays out of the rotation, and Quick Import / Bulk expansion still work, without the flags. Watch the review queue for the first day; a source at its limit shows "250 of its books are waiting for review" on its card and resumes as books are reviewed.

## DOAB / OAPEN "connection reset"
Not reproducible from the dev machine: both hosts answer every request (DNS, TCP, TLS, `Identify`, and the first `ListRecords` page of ~0.7–1 MB). Both resolve to the same three CERN addresses (188.185.10.165, 188.185.16.62, 188.185.39.50), so both failing together points to one thing in front of both rather than two outages — **an inference, not a finding**.

To learn where it breaks from the production host, run once (one DNS lookup, one connection, one TLS handshake, two HTTP requests, no retries, no database access):

    npx tsx scripts/diagnose-source.ts all

The output says which step fails. Failed requests now also record "(before any response)" or "(while reading the response)" in the source's last error. While a source rests no request is made; at its retry time exactly one request is made (tested).

## Tests
- `npx tsx scripts/test-engine-idle.ts` — 49 checks (stand-in providers, fake network, throwaway DB).
- `npx tsx scripts/staging-book-feeds.ts` — 33 checks against the live services.
- `scripts/test-quick-import-api.ts` expected twelve sources; there are now fifteen. Expectation updated.
- Pre-existing failures, unchanged by this work: `test-rotation` (2), `test-rotation-providers` (1), `test-ingestion-import` (1), `test-date-filters` (1, an HTTP 429 from the test's own rate limiter at the end of the run).
