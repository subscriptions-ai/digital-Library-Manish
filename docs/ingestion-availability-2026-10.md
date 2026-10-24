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

## In the rotation by default (since 2026-10-19)
Approved on 2026-10-19 once working and validated; re-validated live that day with `scripts/staging-book-feeds.ts` (all checks pass: nothing
published automatically, nothing assumed open, no licence invented, dedupe and checkpoints hold). Both rotate by default and stay review-only:

    BOOKS_CROSSREF=0                    # take Crossref Books out of the continuous rotation
    BOOKS_PRESSBOOKS=0                  # take Pressbooks out
    BOOKS_REVIEW_BACKLOG_LIMIT=250      # optional; each rests once this many of its books wait for review

Watch the review queue for the first day; a source at its limit shows "250 of its books are waiting for review" on its card and resumes as
books are reviewed.

## Always-productive scheduling (2026-10-19)
The engine no longer waits while there is useful work. Each tick:

1. **Weighted content priority.** One slot of the order from `INGESTION_WEIGHT_BOOKS / _JOURNALS / _ARTICLES` (default 3 / 2 / 1: Books, Journals,
   Books, Articles, Journals, Books). The type whose slot it is goes first; if it cannot work, the same tick tries the others. A weight of 0 never
   leads but still runs when nothing ahead of it can. Equal weights are the original Journals → Articles → Books rotation.
2. **Live fallback inside a type**, as before: a resting, rate-limited, busy or exhausted source is stepped over at once; only that source sleeps.
3. **Coverage engines** (not sources): *Targeted coverage* (books for the departments with the fewest) and *Journal coverage* (the departments with
   the fewest distinct journal TITLES, `INGESTION_JOURNAL_COVERAGE_TARGET`, default 100; `INGESTION_JOURNAL_COVERAGE=0` switches it off). They use the
   sources' own health, locks and sweeps.
4. **Local backlog** (`src/lib/ingestion/localWork.ts`, `INGESTION_LOCAL_WORK=0` switches it off, `INGESTION_LOCAL_BATCH` default 200), only when
   no source of any type could work: held books re-judged under the current rules (published only if strong, self-publishing source, in scope, in
   the year policy, not a duplicate — once per `CLASSIFIER_RULES_VERSION`); departments for unplaced Crossref/OpenAlex journals; a licence another
   provider already declared at title level; canonical licence spelling where it changes nothing else.
5. Only when all of that is empty: **Waiting for source recovery**, logged once, asleep until the first source is due.

Run log: backlog runs carry the content type as phase and the job as source ("Held candidate review", "Department classification", "Licence
completion", "Licence spelling"), with new columns `promoted` and `enriched` (never counted as `added`). The admin card shows Currently processing,
Next job / Then, the local backlog, and a collapsible "Why the engine chose …".

## Two lanes: discovery and maintenance (2026-10-24)

**Why production sat in "Waiting for source recovery" while providers were Healthy.** A provider that gave nothing *useful* (new records, or records for review) for three turns in a row was set aside **as a whole** for six hours ("Exhausted for now") — even when it still had other departments, searches or journals to ask. A duplicate-only batch counts as nothing, so a source that keeps re-reading a department it already holds exhausts itself in three turns. With Journals, Articles and Books all in that state (plus DOAB/OAPEN/arXiv really unreachable and NCBI over quota) no provider was left to ask, the engine slept until the first rest ended, and the screen read "Waiting for source recovery" next to "Healthy". The old scheduler also ran maintenance (licence completion, held review) as the *fallback* turn when nothing else could run, so it showed as the "current source".

**Discovery lane** (`rotation.ts`)
- A tick takes up to `INGESTION_MAX_TURNS_PER_TICK` (3) turns: a turn that gave nothing useful goes straight on to the next provider/type; the first useful turn ends the tick. `1` is the old one-turn tick.
- **Cursors.** A provider that asks in many places reports where (`TurnRan.cursors`): DOAJ / Crossref Journals / OpenAlex Sources → the department|search sweep; Crossref and OpenAlex articles → the journal's department; Europe PMC / arXiv → the department. Each cursor has its own zero-yield count (`INGESTION_CURSOR_ZERO_YIELD_TURNS`, default = the provider threshold, 3). At the threshold only **that cursor** rests (`INGESTION_EXHAUSTED_HOURS`, 6); the next turn passes it over (`ctx.restingCursors` → `claimSweep(…, exclude)`, `pickJournal(…, excludeDepartments)`, `runSearchProvider(…, {skip})`). Cursor state lives in the rotation row under `providers[id].cursors`; no sweep row, journal cooldown or checkpoint is changed.
- The provider as a whole is "exhausted for now" only when it returns `nothing-due` (no cursor left), and then until its **first** cursor reopens, or the first journal cooldown ends (`nothing-due.until`), never longer than the usual rest. Book feeds (one checkpoint, no department) are judged as a whole, as before.
- **Productivity.** Every other turn of a content type goes first to the available source with the highest recent *added* average (`addedEma`, published records only; review-only sources are excluded). That turn does not move the round-robin place, so nobody is starved. OpenAlex articles (`peerWhenProductive`) take part as a peer while `addedEma ≥ 0.5`. `INGESTION_PRODUCTIVITY_BIAS=0` is the rollback to plain round robin.
- Health and yield stay separate; the screen also says what a productive source is productive **for** ("published catalogue" vs "review") and a one-sentence reading per provider (`plain`).
- "Waiting for source recovery" appears only when no provider of any type is eligible; while some are resting but discovery carries on it reads "Continuing with next available source" with the next content type, provider and department/search.

**Maintenance lane** (`maintenance.ts`, state row `ingestion.maintenance.v1`)
- Started beside the discovery tick, **not awaited**, on its own cadence (`INGESTION_MAINTENANCE_SECONDS`, 120); one job per run (`INGESTION_LOCAL_BATCH` records); never takes a discovery turn; does not touch the engine's health fields. `INGESTION_LOCAL_WORK=0` switches it off.
- Held candidates get a real second pass (`localWork.ts` `held-books`): **enrich** (a licence another provider declared for that title) → **classify** → **year / department scope** → **duplicate check** → publish only if all pass. Full pass per rules version and again every `INGESTION_HELD_RECHECK_DAYS` (7). Counted: checked, new evidence, promoted, waiting for review, still held.
- A run that *looked at* records is progress through the backlog and no longer counts toward a rest.

**Screen / metrics.** Last 24 h shows new published, new review candidates, duplicates, held promoted, enriched, source requests failed and failed writes as separate figures, plus **published additions by provider** (records added only; review beside, never added into it). No schema change; no data touched.

**Tests:** `scripts/test-discovery-lanes.ts` (89): scenarios A–H of the brief plus cursor mechanics on the real database. The older suites are pinned to `INGESTION_MAX_TURNS_PER_TICK=1` and `INGESTION_PRODUCTIVITY_BIAS=0` so they keep testing the plain rotation.

## DOAB / OAPEN "connection reset"
Not reproducible from the dev machine: both hosts answer every request (DNS, TCP, TLS, `Identify`, and the first `ListRecords` page of ~0.7–1 MB). Both resolve to the same three CERN addresses (188.185.10.165, 188.185.16.62, 188.185.39.50), so both failing together points to one thing in front of both rather than two outages — **an inference, not a finding**.

To learn where it breaks from the production host, run once (one DNS lookup, one connection, one TLS handshake, two HTTP requests, no retries, no database access):

    npx tsx scripts/diagnose-source.ts all

The output says which step fails. Failed requests now also record "(before any response)" or "(while reading the response)" in the source's last error. While a source rests no request is made; at its retry time exactly one request is made (tested).

## Tests
- `scripts/test-discovery-lanes.ts` (89): the two lanes, cursor-level rotation, productivity order, review-only wording, held second pass, scenarios A–H.
- `scripts/test-always-productive.ts` (61): weights, cross-type fallback, coverage, maintenance lane, true idle, 429, zero-yield, rule-bound
  promotion, enrichment never counted as added, restart.
- `npx tsx scripts/test-engine-idle.ts` — 49 checks (stand-in providers, fake network, throwaway DB).
- `npx tsx scripts/staging-book-feeds.ts` — 33 checks against the live services.
- `scripts/test-quick-import-api.ts` expected twelve sources; there are now fifteen. Expectation updated.
- Pre-existing failures, unchanged by this work: `test-rotation` (2), `test-rotation-providers` (1), `test-ingestion-import` (1), `test-date-filters` (1, an HTTP 429 from the test's own rate limiter at the end of the run).
