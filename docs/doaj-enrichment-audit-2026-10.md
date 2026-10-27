# Phase 2E — DOAJ Journal enrichment & verification: read-only audit (2026-10-26)

**Nothing was written.** Compared: the staged, dated DOAJ CSV snapshot (`doaj_journalcsv_20260925_2320_utf8.csv`, 25,895,102 bytes, sha-256 `8ed9d800c045759f…`, 23,544 rows) with the **development** Journal catalogue (`stm_library`, 23,660 journals). Run with `scripts/doaj-enrichment-audit.ts` over `src/lib/ingestion/doajEnrichment.ts` (a pure plan: no database access, no download). Every query ran in a `READ ONLY` transaction; fingerprints of the journal columns, the article-fetch state, the continuous DOAJ sweep checkpoints, the coverage setting and DOAJ's health row were identical before and after.

## Matching (identity = exact ISSN against both of a held journal's ISSN columns)
| | Rows |
|---|---|
| matched to exactly one held journal, confidently | **23,305** (99.0 %) |
| – ISSNs identical / DOAJ has an extra / held has an extra | 23,296 / 8 / 1 |
| – a shared ISSN filed in the other role (print vs electronic) | 3 |
| – ISSN disagreement (each side has an ISSN the other lacks) | 0 |
| AMBIGUOUS (reported only): ISSN shared by two DOAJ rows 2 · one row touching two held journals 2 · one journal touched by several rows 0 | 4 |
| IDENTITY_CONFLICT (same normalised title **and** publisher, different ISSN) | 1 |
| same title only (other publisher), different ISSN | 71 |
| no catalogue match (would be new) | 163 |

23,305 + 4 + 1 + 71 + 163 = 23,544. The existing admin Check's "72 needs review" = 71 + 1.

## Protection
Among matched journals: **0** protected. Whole catalogue: 256 protected — all "our own" (`rightsBasis = our own`, `rightsVerifiedBy = build-own-catalogue`), 181 of them linked to a publisher; **none is in the DOAJ file**. No journal is Rejected or NeedsReview in dev. Protection rules applied: our own · Rejected · rights decided by a person (`rightsVerifiedBy` other than `ingestion`) · linked to a publisher.

## Enrichment opportunities (an EMPTY held field, a VALID DOAJ value; 23,305 eligible)
| field | journals | |
|---|---|---|
| homepage | 10,249 | 44.0 % |
| language | 10,249 | 44.0 % |
| subject (the stored single string) | 10,249 | 44.0 % |
| publisherName · country · subjects (list) | 0 · 0 · 0 | |
| e-ISSN | 5 | **review-only** (see below) |
| malformed DOAJ values ignored | 0 | |

**10,249 journals (44 %) would gain at least one safe field — all of them the same three fields at once.** 6,393 are Accepted, **3,856 are MetadataOnly** (for those the homepage is the only way out to the journal: `JournalPage` shows it as the link), 442 already have articles. Root cause: the continuous sweep fills `homepage` from `bibjson.link[type=homepage]`, but DOAJ's v4 API now carries the journal URL in `ref.journal` (and the sweep never stores language or subject), so journals created by the sweep arrive without them; the CSV importer fills all three. (The sweep is not touched by this phase; fixing it is a separate, small change.)

## Conflicts (counted, never written; eligible matched journals)
title 1 · publisherName 28 · country 4 · homepage 47 · language 14 (+13 where the held list is a subset of DOAJ's) · subject 6 · subjects 6 (+762 where one list is a subset of the other, after comparing leaf terms) · e-ISSN 0 · licence list differs 17 · **licence: held records only a subset of DOAJ's licences 1,131** (the sweep stores the first licence only). Held country stored as an ISO code that denotes the same country DOAJ names: 10,249 (unchanged, not a conflict; 132 codes learnt from the pairs, none ambiguous).

## Rights / status evidence — NOT applied by this phase
Held **Accepted** journals that DOAJ's own rule (every licence must allow commercial use) would make MetadataOnly: **1,105** (109 with articles); 1,100 are multi-licence journals ("CC BY, CC BY-NC-ND") that the sweep accepted on the first listed licence. Held MetadataOnly that the rule would make Accepted: 10. A held licence that is empty where DOAJ declares one: 0. A policy question for a person; this phase records and counts it only.

## Department — analysis only, nothing assigned
Journals with no department: **0** (nothing to suggest in dev). For the 23,305 matched journals that have one, the existing `departmentForDoajRow` suggestion agrees for 18,191 and differs for **5,114 (21.9 %)** — mostly neighbouring departments (Commerce→Management 465, Arts→Education & Social Sciences 344, Computer/IT→Applied Sciences 199, Computer/IT→Medical Sciences 121 …). Held departments came from the sweep's search term for many journals; no change is proposed here.

## Verification
Held, OA-unverified journals that DOAJ lists: 0 (every non-own journal is already DOAJ-declared). Held DOAJ-declared journals no longer in the file (possibly withdrawn): 96 (informational only).

## Article-ingestion check (your §17)
Article eligibility (`status = Accepted`, `issn` present, `rightsBasis = DOAJ declaration`, department scope, `articleCount` below the cap, `exhaustedAt`/`nextEligibleAt`/claim) depends on **none** of the enrichable fields, and this phase never changes status, rights basis, department or ISSN. **One field has an adjacent effect:** the e-ISSN is used when a fetched work is attributed to a journal (`articleSources`: accepted if any of its ISSNs is the journal's ISSN or e-ISSN; `articlePipeline`/`dedup` find a journal by either), so filling it would change which articles attach. It is therefore **review-only** — 5 journals in dev — and excluded from automatic enrichment.

## Recommendation
**10,249 materially enrichable journals (≥ 500): implement bounded Phase 2E enrichment**, for `homepage`, `language`, `subject`, `country`, `publisherName`, `subjects` (fill-empty only), excluding e-ISSN, department, licence, status, conflicts, ambiguous and protected journals. Preview first (bounded: 25 enrichable, 25 conflicts, 25 ambiguous); write only after a confirmed preview.
**Design:** reuse the existing `BackfillJob` framework as a `doaj` adapter in *enrichment-only* mode (never creates a journal) rather than inventing another job runner — it already provides preview → start, chunked and crash-exact counters, pause/resume/cancel, a bounded preview, the staged-file identity check and the screen; the plan module above is its judge; apply re-reads each journal and re-checks identity, emptiness, protection and the staged value before one guarded `updateMany` (`where id AND field empty`), 100–250 journals per chunk. The maintenance lane's local jobs are the wrong home: they run unattended and have no staged file or operator approval. No schema change; one additive `AuditAction` member, staged by hunk.

## Build status (2026-10-27) — Preview + bounded write mode, scratch DB only

Built as the `doaj` adapter in enrichment-only mode on the existing `BackfillJob` framework (no new table, no schema change; one additive `AuditAction` member, `DOAJ_ENRICHMENT_APPLIED`). **Nothing was applied to the dev catalogue, and production was not touched.** Re-running this read-only audit on dev (2026-10-27 11:30 IST) gave identical fingerprints before and after, and identical to the first audit. The per-field opportunity is 10,249 journals; 10,248 would gain a field, because one of them is held back by a title that differs from DOAJ's.

- **Preview** writes nothing and is bounded (25 samples per outcome / issue kind). **Start** stays disabled until a completed preview shows ≥ 500 enrichable journals.
- **Write** fills one empty field at a time with a guarded `UPDATE` (journal id, field still empty, ISSN unchanged, not protected), 100–250 journals a chunk, idempotent, pausable, cancellable and restart-safe. A second preview after a run shows 0 enrichable.
- **Never written:** status, licence, access, department, e-ISSN (review only: it changes which articles attach). Protected journals (ours, Rejected, decided by a person, linked to a publisher) are untouched. A differing title blocks filling.
- **Operator settings:** `BACKFILL_DOAJ_ENABLED=true`, `DOAJ_SNAPSHOT_DIR=<folder holding the dated CSV>`, `BACKFILL_MAX_RECORDS_PER_JOB` and `BACKFILL_PREVIEW_MAX_RECORDS` of at least ~25,000 for a full pass, and a gap between chunks of at least 1 s.

### Test isolation and what the tests prove (2026-10-27)

- **Private database.** `scripts/test-backfill-doaj.ts` runs only on `stm_doaj_enrichment_test` (`createdb stm_doaj_enrichment_test`, then `prisma db push` with that `DATABASE_URL`). The shared `stm_ingestion_test` is written by other suites at the same time, so an exact whole-table count there cannot be relied on. That is the cause of the one "enrichment never creates a journal" failure seen on the shared database: a concurrent writer, not an enrichment path. The Phase 2E code has no create path (no `create`, `createMany`, `upsert` or `INSERT`, and no network call, in the three DOAJ files).
- **Tripwire.** The suite installs a Postgres trigger on `"Journal"` that records every INSERT and DELETE, whoever made it, and asserts at the end that the only inserts were its own seeding and the only delete was the one the race test makes on purpose. It also checks the journal table holds exactly the seeded journals after every scenario (preview, enrichment, idempotent re-run, race, 1,000-row chunks, pause, resume, cancel, three SIGKILL recoveries, changed file).
- **Memory.** The first build re-read, hashed and decoded the whole staged file for every chunk and re-read the whole journal title table whenever a chunk had an unmatched row; a complete 24,000-row pass over a 24 MB file peaked near 500 MB resident (about 440 MB on its plateau). The optimisation (see the `perf` commit) streams the identity hash through one 1 MB buffer on every page (the file is still fully hashed each time, and the identity is unchanged: name + size + sha-256), reads each page as a bounded window at a **byte** offset (checkpoint version 2), and reads the title table once per job. Measured: the same pass now peaks near 313 MB with a plateau of about 235 MB, the live heap stays at 15 → 45 MB (the title map, which follows the catalogue, not the file), and nothing trends upward. The remaining ~120 MB above the process's own start is the runtime and the database client, not the snapshot.
