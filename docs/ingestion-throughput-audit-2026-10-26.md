# Ingestion throughput — audit and Phase 1 plan (2026-10-26)

Written before any code was changed. Everything below was read from the repository, not assumed. Nothing here was measured on production
(no production access is used); where a claim needs production numbers it says so.

## 1. Architecture map (what exists today)

```
server.ts  setInterval(60 s)  ── ingestTimer.busy guard ──▶ runEnginePass()            src/lib/ingestion/engine.ts
                                                              │
                          ┌───────────────────────────────────┴──────────────┐
                          ▼ DISCOVERY lane                                   ▼ MAINTENANCE lane (started, never awaited)
                runRotationPass()  rotation.ts                         maintenance.ts  → localWork.ts jobs
                  tick = up to INGESTION_MAX_TURNS_PER_TICK (3)         (licence fill, held-book re-judge, journal
                  turn = runTypeTurn(group)                              departments). Own state row, own cadence (120 s).
                          │
         provider registry  providers.ts (buildProviders)  ── each ProviderDef.turn(ctx) → TurnOutcome
                          │
   ┌──────────────────────┼───────────────────────────────────────────┐
   ▼ Journals             ▼ Articles                                  ▼ Books
 doaj   (primary, sweeps)  crossref (primary, journal-by-journal)      doab, oapen, otl, ncbi, nlm,
 road   (NOT connected)    openalex (fallback / peer when productive)  crossrefbooks*, pressbooks*   (*review-only)
 crossrefjournals (fb)     europepmc, arxiv (department search)       → harvestFeed() + BookHarvestCheckpoint
 openalexsources  (fb)                                                targeted (virtual coverage engine)
 journalcoverage (virtual)
```

| Concern | Where | Notes |
|---|---|---|
| Scheduler | `rotation.ts` `runRotationPass` / `runTypeTurn` | weighted type order (Books 3, Journals 2, Articles 1), round robin inside a type, every 2nd turn biased to best `addedEma` |
| Provider registry | `providers.ts` | 12 rotation providers + 2 virtual; ROAD unconnected |
| Health | `sourceHealth.ts` → `IngestionSourceHealth` | breaker: 3 consecutive failures → rest (10/30/60/120/240/360 min); 429 → rest = Retry-After (1–60 min) |
| Yield / "exhausted" | `rotationState.ts` (one `AppSetting` JSON row `ingestion.rotation.v1`) | provider-level and cursor-level zero-yield (3) → rest 6 h |
| Checkpoints | `BookHarvestCheckpoint` (books), `DepartmentSweep` (DOAJ/journal sources), `Journal.fetchCursor` JSON `{openalex,crossref}` (articles), `ProviderRuntime.position` (Europe PMC / arXiv) | never shared; rotation row holds no provider checkpoint |
| Run log | `IngestionRun` (+ `IngestionRunDepartmentStat`) | one row per turn / journal visit; `checked` only filled for Books |
| Locking | `providerLocks.ts` (in-memory, per provider) | continuous vs manual; one server process |
| Quick Import | `quickImport.ts` | own positions (audit log), same pipeline, same locks |
| Dedupe | `dedup.ts` (articles: DOI/title+year fingerprint, source id), `books/dedupe.ts` | |
| Rights | `eligibility.ts` `judgeArticle`, `books/licence.ts`, `books/classifier.ts` | uncertain → Draft/Metadata Only |
| Admin API | `server.ts` `/api/admin/ingest/*`, `status.ts` | |

## 2. What the brief asks for that is ALREADY built (verified, with tests)

| Brief item | Status | Evidence |
|---|---|---|
| §9 zero-yield rotation (3), checkpoint kept | built, per cursor and per provider | `noteZeroYield`, `noteCursors`; `test-discovery-lanes` 89 |
| §10 failure fallback (3) and immediate 429 rotation | built | `runTypeTurn` `request-failed` case; `sourceHealth.ts`; `test-rotation`, `test-engine-idle` |
| §8 health and yield separate | built | `availability()` vs `yieldState()` |
| §11 "waiting" only when nothing eligible | built (engine-wide `discoveryEligible`) | `status.ts` `asleep` |
| §12 independent checkpoints | built | see table above |
| §17/§1C discovery vs maintenance | built (a26daf4) | `maintenance.ts` |
| §33 provider locks, §34 Quick Import isolation | built | `providerLocks.ts`, `test-quick-import*.ts` |
| §28/§29 NCBI caps, Metadata Only for unknown rights | built | `books/ncbi.ts`, `books/licence.ts` |
| §41 backpressure (partial) | review-only books rest at `BOOKS_REVIEW_BACKLOG_LIMIT` | `providers.ts` |
| §26/§21/§27 DOAJ OAI, OpenAlex snapshot, OAPEN bulk | NOT built — Phase 2 | — |

## 3. Bottleneck analysis (root causes, with code references)

**B1 — one productive turn per tick, one tick per minute.** `rotation.ts:703` `if (took.useful > 0) { lastUseful = took; break; }` ends the tick at the first
useful turn; the timer (`server.ts` `setInterval`, 60 s, `ingestTimer.busy` guard) then idles until the next boundary. The hard ceiling is
≈ 1 productive turn × ≤ 100–200 candidates per minute *whatever the providers could give*, and a turn that runs longer than 60 s (article turns have a 3-minute
budget) loses whole ticks to the busy guard. This — not the database — is the dominant limit on "runs per 24 h". A useful turn followed by *idle time*
is exactly the "waiting for the next minute" the brief describes.

**B2 — fixed content priority.** `typeSequence`/`orderForTick` (`rotation.ts:167–191`) lead each tick with a static 3/2/1 order. The tick does fall
through to the next type when the leader cannot run (so a dead Books family costs no time), but a *low-yield* leader still takes the first turn
every time, and nothing measures how productive a type is. Providers have a yield average (`addedEma`) but it is used only inside a type.

**B3 — duplicates are measured but not *used*.** `ProviderRuntime` keeps `addedEma`/`reviewEma`; it has no duplicate ratio, no error rate, no review-backlog
pressure, so a provider that is 95 % duplicates scores the same as one that is 40 % new unless it hits zero.

**B4 — repeated re-reading of already-held articles.** `visitJournalCrossref` (`articleTurns.ts:46`) and `visitJournal` (`ingestionWorker.ts:662`) walk a
journal newest-first from offset 0 / cursor `*`. When a walk reaches the end the cursor is cleared and the journal is eligible again after
`exhaustedDays = 7` (`finishJournalVisit`), so the *whole* window is re-read weekly and every record comes back as a duplicate. Crossref supports
`from-index-date`, so the re-read can be an incremental sync instead. (How much of production's duplicate volume this is cannot be known without
production run data; cross-provider overlap (DOAB ↔ OAPEN, Crossref ↔ OpenAlex) is the other source and is unavoidable.)

**B5 — duplicates carry no information.** An article that is already held is `HELD` and dropped (`importService.ts` `classifyCandidates`); it is never compared to
the stored row, so a second source can never enrich the first. Books already enrich (`books/merge.ts`, `IngestionRun.enriched`); articles do not.
The dashboard therefore has one "Duplicate skipped" number.

**B6 — metrics cannot show efficiency.** `IngestionRun.checked` is filled for Books only (`rotation.ts:567`); journal-visit rows put "N checked" in free text.
Unique yield (new ÷ checked) per provider cannot be computed from the log for articles and journals.

**B7 — no durable record of *why* the scheduler chose or skipped a provider.** `lastDecision` is one overwritten sentence list.

**B8 — review queue is invisible from Data Ingestion.** Drafts accumulate (books `ownershipSource='Ingested'`, articles, journals `NeedsReview`) but
the ingestion screen shows no count, no age, no per-provider split, no link to Content Review.

**Not a bottleneck (checked):** cursor advancement on duplicate-only batches. Books (`harvestFeed` saves the token after every page, `oaiHarvest.ts:812`),
DOAJ/journal sweeps (`closeSweep(position+1)`), Europe PMC/arXiv (`places[dept]+1`), and journals (`finishJournalVisit` stores `next` whether or not
anything was added; the all-held branch even carries the cursor on with a growing pause) all move forward on 100 % duplicates. I add tests that pin this
rather than changing it. Database writes are not the limit either (failed writes ≈ 0, as the brief says).

## 4. Phase 1 implementation plan

**1B — scheduler**
1. `scheduler.ts` (pure, no I/O): provider **score** = health × availability × yield × freshness × (1 − backlogPenalty), from the rotation row only. Providers that
   are unavailable / rate limited / cooling / exhausted score 0. Runtime fields added to the existing JSON (`uniqueEma`, `dupEma`, `errorEma`, `lastAskedAt`) — no schema.
2. Adaptive type order (`INGESTION_ADAPTIVE_SCHEDULER`, default on, `=0` restores today's static order exactly): the type whose best eligible provider scores highest
   leads; static weights are only the tie-break prior; a **starvation guard** puts any type not served for N turns first.
3. **Drain**: a tick keeps taking turns after a useful one while a time budget (`INGESTION_TICK_BUDGET_SECONDS`, default 40) and turn cap
   (`INGESTION_DRAIN_MAX_TURNS`, default 8) allow, never the same provider twice in a row, and never inside a provider's minimum gap
   (`INGESTION_PROVIDER_MIN_GAP_SECONDS`, default 15; per-provider override) — the conservative per-provider rate limit. No new parallelism.
4. Crossref **incremental sync** (`INGESTION_INCREMENTAL_SYNC`, default on): after a journal's walk ends naturally, the next visit asks `from-index-date` = last completed
   sync (minus one day) instead of re-reading the window. Kept inside the existing `fetchCursor` JSON; cleared when the journal ends "full" or the year policy changes, so
   nothing that was deferred can be hidden.
5. Structured reason codes (`OPENALEX_SELECTED_PRODUCTIVE`, `DOAB_SKIPPED_COOLDOWN` …) on every decision; written to `IngestionAudit` **only on a state change**
   (a provider starts/stops resting, a fallback takes over), never per idle tick.

**1B — duplicates and metrics**
6. Duplicate classification for articles: unchanged / enriched / conflicting. Enrichment fills only **empty, non-rights** fields (authors, volume, issue, subject, publisher,
   journal name); licence, file URL, access and status are never written; a differing licence or DOI is recorded as *conflicting* and left alone
   (`INGESTION_MULTI_SOURCE_ENRICHMENT`, default on).
7. `checked` written for every phase; provider yield report for the last 24 h (checked, new, review, held, enriched, conflicting, failed writes, provider failures,
   unique yield %, enrichment yield %, last productive time, cursor age).

**1C — lanes** are done (a26daf4); I add tests that discovery never waits for maintenance and that a long maintenance job does not delay a tick.

**1D — visibility**
8. Review queue summary (awaiting, new today, oldest pending, by provider, by content type) + **Review now** link into Content Review with the source pre-filtered.
9. Pipeline status strip from real counts only (held backlog, licence/department backlog, review, publish-ready); engine copy per brief §38.

**Stop after 1D and report. Phase 2 (backfill, snapshot/OAI/bulk importers) is not started.**

## 5. Schema proposal (additive, one column)

```prisma
model IngestionRun {
  ...
  /// Duplicates whose incoming metadata disagreed with the held record on a rights-bearing field (licence) or identifier (DOI).
  /// Counted, left alone, and shown to a person; never applied.
  duplicateConflicting Int @default(0)
}
```

Why: "Duplicate conflicting" has no existing column (`skippedHeld` = duplicates, `enriched` = duplicates improved). Everything else reuses columns that exist
(`checked`, `enriched`, `skippedHeld`, `needsReview`). Nullable-free, defaulted, no index, no backfill — a `db push` adds one column with `ALTER TABLE ... ADD COLUMN`.
Verified with `prisma migrate diff` on the throwaway database before use (see the Phase 1 report). No other schema change is proposed for Phase 1.

---

## 6. Phase 1 as built (2026-10-26)

**Switches** (all read from the environment on every use; nothing stored is read differently, so each is an instant rollback):

| Variable | Default | Effect |
|---|---|---|
| `INGESTION_ADAPTIVE_SCHEDULER` | on | `0` = previous behaviour exactly: static 3/2/1 type order, tick ends at the first useful turn |
| `INGESTION_TICK_BUDGET_SECONDS` | 40 | no new turn starts once a tick has run this long (a turn under way is never cut) |
| `INGESTION_DRAIN_MAX_TURNS` | 8 | most turns in one tick |
| `INGESTION_PROVIDER_MIN_GAP_SECONDS` | 15 | a provider is not asked twice inside one tick sooner than this (per-provider `minGapSeconds` overrides) |
| `INGESTION_STARVATION_TURNS` | 6 | a content type passed over this many turns leads next |
| `INGESTION_REVIEW_PRESSURE_FULL` | 1000 | drafts waiting at which the review queue counts as full for backpressure |
| `INGESTION_INCREMENTAL_SYNC` | on | `0` = Crossref re-reads a journal's whole window as before |
| `INGESTION_MULTI_SOURCE_ENRICHMENT` | on | `0` = duplicates are only counted, never written to |

**Deploy order:** (1) `npm run backup`; (2) deploy; (3) `prisma db push` adds one column (`IngestionRun.duplicateConflicting INTEGER NOT NULL DEFAULT 0`) — check the printed SQL is that single `ADD COLUMN`; (4) restart (the dev server has no watch mode). Until step 3 runs, run-log reads fail on a database without the column.

**Known limits (honest):** per-provider concurrency is still one request stream: the drain makes the single worker busier, it does not run providers in parallel. OpenAlex per-journal visits are not incremental (no confirmed safe "since" filter). Licence is never filled on a held duplicate (rights-bearing; the maintenance lane's licence job owns that). Cross-source article identity is DOI / title+year / source id only — PMID, PMCID, OpenAlex id and arXiv id lookups are Phase 3. Journals have no per-provider source column, so the review queue cannot split journals by provider, and no review screen exists for journals. Older article/journal run rows did not record `checked`, so yield percentages exist only for runs since this change. "Ready to publish" has no durable queue and is not shown.
