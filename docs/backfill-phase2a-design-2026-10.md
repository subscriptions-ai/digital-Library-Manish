# Historical backfill — Phase 2A design (revision 2, 2026-10-26)

Status: **design for approval. Nothing here is applied or built.** Schema: only `BackfillJob` is added (model and SQL in the scratchpad copies
`schema-phase2-r2.prisma` / `phase2-r2.sql`; also reproduced in the reply that accompanied this note). `prisma/schema.prisma` is unchanged by this phase until approved.

## 1. Content types

`contentType` is a string validated in code (`backfillTypes.ts`), so a new kind of content needs an adapter and one line, never a migration:

| Backfill type | Catalogue it lands in |
|---|---|
| JOURNAL | `Journal` (Periodicals **are** Journals: there is no PERIODICAL type, table or pipeline) |
| ARTICLE | `Article`, `contentType` "Periodicals" (journal articles) |
| BOOK | `Book` |
| CASE_REPORT, THESIS, CONFERENCE_PROCEEDING, EDUCATIONAL_VIDEO, NEWSLETTER, MAGAZINE | **RESERVED** (2026-10-26 ruling): the names are recognised so future adapters have somewhere to land, but no job can be created for them (`TYPE_RESERVED`) and nothing may be written for them — in particular not into `Article` — until the separate content-model audit confirms each one's canonical catalogue model. (The earlier draft of this table mapped them to `Article` labels; that is withdrawn.) |

Existing Journal rows are never touched by the framework; a JOURNAL adapter, when one exists, goes through the same journal judge/writer the engine uses.

## 2. Generic core, per-type adapters

```ts
runBackfillChunk(job, adapter)           // the ONLY chunk routine; knows nothing about books, articles or journals
interface BackfillAdapter {
  id; label; contentTypes: BackfillType[];
  available(): true | string;            // a reason when it cannot run (production: "no backfill provider is connected yet")
  fetchPage(job, cursor, limit): { records, nextCursor, bytes }   // read-only, repeatable for the same cursor
  normalize(raw, job): Normalised | { error }
  judge(items, job): Judged[]            // outcome publish | review | held | duplicate | refused, a reason, and for duplicates enriched / conflicting — READ-ONLY
  apply(judged, job): { failed: n }      // the writes, idempotent; may fill empty fields of a held duplicate (never licence/DOI/file/access/status)
}
```

## 3. Exact counters across a crash — plan, apply, commit (no per-record ledger, no chunk table)

One chunk at a time (worker concurrency 1), so one in-flight chunk fits in the job row:

1. **Plan** — fetch from `cursor`, normalise, judge. Only the **counts** and the next cursor are saved: `inflight = { seq, fromCursor, nextCursor, counts }`.
2. **Apply** — write what the plan says (skipped for a dry run). Idempotent: a record already written is found as held and not written again.
3. **Commit** — ONE statement: totals += `inflight.counts` (minus write failures from this attempt), `cursor = nextCursor`, `chunksCompleted++`, `inflight = null`.

| Crash point | On restart | Counters |
|---|---|---|
| before the plan is saved | re-plan from `cursor` | nothing was counted; correct |
| after the plan, mid-apply (e.g. 80 of 100 written) | re-apply the SAME plan: the 80 are found held and left alone, the remaining are written | the plan said 80 published; stays 80 |
| after apply, before commit | re-apply writes nothing, then commits | same |
| after commit | next chunk | correct |

A write that fails is counted failed and removed from published. Documented limit: if a provider's page for the same cursor changes between attempts, the plan (the first attempt's view) is still what is counted.

## 4. Duplicates (consistent with Phase 1)
`recordsDuplicate` = all duplicates; `recordsEnriched` ⊂ it; `recordsDuplicateConflicting` ⊂ it; unchanged = the rest. A conflict (licence family, DOI, identity) is counted and the held record is left exactly as it was. A dry run uses the same read-only judgement (it reports "would enrich" / "conflicts" without writing).

## 5. Preview is bounded
`preview` = aggregate counts + at most 25 sample records + at most 25 reasons + a hard 64 KB size cap with a `truncated` flag; enforced by one function (`capPreview`) and tested. A real start requires a completed dry run of the same configuration made within the last 60 minutes (`config.previewJobId`).

## 6. State machine and controls
Pending → Running → Completed | Failed; Running ⇄ Paused; any non-terminal → Cancelled.
- **Pause**: finish and commit the current chunk, save, Paused. **Resume**: Paused → Pending, continues from `cursor`/`inflight` only. **Cancel**: finish and commit the current chunk, stop, Cancelled; nothing already imported is deleted.
- Pending/Paused jobs pause/cancel at once. Pause/cancel flags survive a crash: a recovered job honours them after committing its chunk.
- One active (Pending/Running/Paused) job per provider + content type.

## 7. Gate, limits, locking, recovery
- **Gate**: `INGESTION_BACKFILL_ENABLED` (default false), deployment-time only. False ⇒ no job can be created, started or resumed, and the worker does nothing (a Running job found while off is left untouched). No runtime toggle.
- **Limits**: `BACKFILL_MAX_RECORDS_PER_JOB` (5000), `BACKFILL_MAX_RUNTIME_MINUTES` (60), `BACKFILL_MAX_BYTES_PER_JOB` (256 MB), `BACKFILL_WORKER_CONCURRENCY` (1; 2A supports only 1), `BACKFILL_CHUNK_SIZE` (100). A job that reaches a limit completes with a note; it never fails for being "full".
- **Locking**: the provider lock (new owner `backfill`) is held for ONE chunk, then released. After each chunk the worker waits at least `BACKFILL_MIN_GAP_SECONDS` (10) and as long as the chunk took (≤ 50 % duty), and if the lock is busy it simply tries again later, so the continuous engine always gets turns.
- **Independence**: the job's cursor lives only on `BackfillJob`. The worker never imports or calls anything that writes `BookHarvestCheckpoint`, `DepartmentSweep`, `Journal.fetchCursor`, the rotation row or provider health. Backfill writes no `IngestionRun` rows, so the continuous engine's metrics are not mixed with it.
- **Recovery**: the worker heartbeats; a Running job whose heartbeat is older than `BACKFILL_HEARTBEAT_STALE_SECONDS` (120) is taken over from `cursor`/`inflight` by an atomic claim.

## 8. API (SuperAdmin; BigInt serialised as a string)
`GET /api/admin/ingest/backfill` (status, gate, limits, adapters, jobs) · `POST …/backfill` (create: dry-run or, with `previewJobId`, real) · `POST …/backfill/:id/pause|resume|cancel` · `GET …/backfill/:id`.

## 9. Screen
A "Historical backfill" tab: content type · provider · date window (presets + custom) · departments · access preference · maximum records · limits (read-only) · **Dry run ON by default** → **Preview Backfill** (would publish / would review / already held / would enrich / conflicts / refused / failed + bounded samples) → **Start Backfill** (confirmation). With no adapter available (production in 2A) the screen says no backfill provider is connected yet and the form is disabled; it never lists a real provider. The fixture adapter exists only when `BACKFILL_FIXTURE=1` and never when `NODE_ENV=production`.

## 10. Test plan (stm_ingestion_test only)
Bounded fixture import (a few hundred records) · dry run writes nothing and preview stays bounded · pause/resume/cancel · limits · gate off ⇒ nothing starts · provider lock released between chunks and a busy lock is skipped · **kill the worker (SIGKILL) mid-chunk and mid-apply, restart, finish: catalogue has no duplicates and the counters equal an uninterrupted run** · re-running the same job creates no catalogue rows · continuous checkpoints byte-identical before/after · catalogue row counts before/after · regression suites.

---

## Revision 3 (what was built)

**`inflight` (bounded identity of one chunk; never a record):**
```
{ v: 1, chunkNumber, cursorBefore, expectedCursorAfter, limit,
  pageHash,                         // sha256 of the page's stable ids in order + the next cursor
  planned: [[stableId, code], …],   // ≤ one chunk (≤ 100 pairs); code: P publish · R review · H held · U dup unchanged · E dup enriched · C dup conflicting · X refused · F unreadable
  counts: { fetched, normalized, unique, duplicate, enriched, conflicting, held, review, published, refused, failed, bytes },
  bytes, plannedAt, attempts }
```
**Retry state machine (per chunk, per job):**
```
no inflight ──PLAN──▶ save inflight (compare-and-set on claimedBy + chunksCompleted) ──APPLY──▶ COMMIT (one compare-and-set) ──▶ no inflight, cursor = expectedCursorAfter
inflight present (after a crash)
   └─ VERIFY: refetch cursorBefore with the saved limit; chunkNumber, pageHash (ids + next cursor) and the id list must all match
        ├─ match    → attempts + 1 → APPLY the SAME plan (planned-new records already present are "present", not re-written) → COMMIT the ORIGINAL counts once
        └─ mismatch → nothing applied, nothing counted → job Failed: BACKFILL_PAGE_CHANGED_DURING_RETRY (plan kept as evidence)
                         └─ explicit RE-PLAN (SuperAdmin) → plan dropped, recorded in config.replans → Paused → Resume → plans the page afresh
```
A worker that no longer holds the job (taken over while frozen) cannot commit: the commit's WHERE requires its own `claimedBy` and the expected `chunksCompleted`.

**Heartbeat:** refreshed every `BACKFILL_HEARTBEAT_SECONDS` (20) by a timer for the whole of a chunk; the stale limit is `max(BACKFILL_HEARTBEAT_STALE_SECONDS, 3 × heartbeat)` (default 120 s).

**Preview identity:** `config.hash` = sha256 of the canonical request (provider, content type, window, departments sorted, access preference, maximum records as asked, adapter parameters); a real start needs a Completed dry run with the same hash within 60 minutes. Stored in the existing `config` JSON; no schema.

**Safety fix found by the tests:** "open access first" downgrades (an addable record without a verifiable open licence goes to review) were overridden by the writer's re-judge and written as Published. `Candidate.forceReview` (stricter only; never set by the engine or Quick Import) makes the writer honour the downgrade.
