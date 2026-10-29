# Nursing catalogue expansion: 80 new journals inserted (run `nursing-netnew-2026-10-28-8e430d72`)

Authorization: controlled insertion of **eligible new** Nursing journals only. No validation was relaxed to reach a number; existing journals, NeedsReview transitions and article ingestion were not touched.

## Result

| | Before (2026-10-28 12:17 UTC) | After (2026-10-29) |
|---|---|---|
| All journals | 54,454 | 54,534 |
| Accepted | 12,840 | 12,840 |
| MetadataOnly | 16,007 | 16,087 |
| NeedsReview | 25,607 | 25,607 |
| **Nursing: Accepted / MetadataOnly / NeedsReview** | 183 / 291 / 827 | 183 / **371** / 827 |
| **Nursing public** | **474** | **554** |

The 54,454 pre-existing rows are byte-identical (content hash `af3773e0…` before, during the canary and after). The Accepted count did not move.

## Source-wise

| Source | Records read | Already held | Title conflict | Net-new | Inserted |
|---|---|---|---|---|---|
| CINAHL (academic journals, Nursing discipline or a nursing word) | 756 | 394 | 10 | 352 | 42 list it (16 first-listed) |
| NLM Catalog (Nursing subject) | 1,295 | 34 | 9 | 1,252 | 43 list it (42 first-listed) |
| OpenAlex (nursing topics) | 450 | 274 | 4 | 172 | 51 list it (21 first-listed) |
| SciELO (WoS area NURSING / nursing title) | 44 | 35 | 0 | 9 | 1 |
| KoreaMed / KAMJE (501 journals read, 210 renames linked) | 32 | 31 | 0 | 1 | 0 (the one candidate is held) |
| DOAJ (Nursing subject) | 230 | 230 | 0 | 0 | 0 |
| J-STAGE (per-ISSN official host) | 12 queried | | | | 0 found |
| INANE directory | not collected: Airtable embed, no lawful programmatic access; needs a manual export | | | | |
| REVENF, Elsevier, Wolters Kluwer, Wiley, T&F, Sage, Karger, Emerald | 403 / unreachable to automated access; not bypassed | | | | |
| **Merged genuinely net-new journals** | | | | **1,464** | **80** |

A journal found by several sources counts once (the "list it" figures overlap). Print/electronic twins, ISSN-L clusters and KoreaMed renames were joined into one journal before counting, and the 84 eligible were checked again against NLM "Continues / Continued by" relations and near-identical catalogue titles.

## Held (1,384 net-new journals)

| Primary reason | Journals |
|---|---|
| No recent publication evidence in any source (259 of them explicitly ceased per NLM/CINAHL) | 736 |
| Nursing scope: one independent signal only; needs the journal's aims-and-scope | 337 |
| Reads as newsletter / conference / directory / trade serial | 133 |
| Some publication evidence, not enough (needs the official issue list) | 112 |
| Nursing scope insufficient | 34 |
| No publisher | 20 |
| Identity unconfirmed (recent works only under another title) | 8 |
| Rename or continuation of a catalogue journal (*Emergency Nurse*), near-identical catalogue title (*Primary Health Care* vs *Journal of Primary Health Care*), newsletter-type (*Stat*, *Nurse Author & Editor*) | 4 |

Held records are listed in `docs/nursing-assessment-2026-10-28/held.json` (the preview) and the 4 added here in `frozen-hand-and-rename-holds.json`. Same-title conflicts, newsletters, proceedings, trade serials and ambiguous mappings were held, never merged.

## What qualified (mandatory, all of it)

Valid ISSN check digits; confirmed identity (no cluster, ISSN or base-title match in any catalogue status); strong Nursing scope (two independent subject signals, or one plus a nursing word in the title: NLM subject, CINAHL Nursing discipline, SciELO WoS area, OpenAlex topics ≥ 50% nursing, nursing-body publisher); current publication evidence; a publisher; not a non-journal serial.

* A nursing word in the title was **not** required: 15 of the 80 have none.
* "At least 3 Crossref articles" was **not** required: 76 have ≥ 3 works in 2024–26 across Crossref/OpenAlex/PubMed; 4 qualify on an official statement (SciELO status current; CINAHL indexing current plus a recent work).
* A source listing is not a rights claim: every row is `MetadataOnly`, `openAccess = false`, no licence, no rights verification, `rightsBasis = "<source> listing — OA unverified"` (NLM 42, OpenAlex 21, CINAHL 16, SciELO 1).

## Canary (25) and remainder (55)

Dry runs on live production first (0 held, 0 clashes). Canary: 25 inserted, 0 skipped, 0 failed, stratified by listing source (SciELO 1, NLM 8, CINAHL 8, OpenAlex 8). Verified read-only: fields and Nursing department as above; publisher present on all 25;
0 duplicate ISSNs, 0 cross-field collisions, 0 same-title rows, 0 articles attached; the audit entry's IDs equal the IDs of the plan's ISSNs; **25 of 25 public detail pages** (`/api/library/journal/:issn`) return the right title, Nursing and MetadataOnly;
existing rows hash unchanged. Only then the remaining 55 went in as one batch (≤ 100): 55 inserted, 0 skipped, 0 failed. Final verification on all 80: same results, 80/80 public pages, 2 audit entries (25 + 55).

## Audit, evidence and rollback (all in `docs/nursing-expansion-2026-10-28/`)

* `manifest-frozen.json`: the 80 rows with sources, scope and publication evidence, source URLs and verification date. sha256 `ae58d8fbfe30a3461b038c73b5e6ccea268ebc9bc0e387ef11445e0b5251beb0`.
* `plan-canary.json`, `plan-rest.json`, `audit-manifest.json` (exact inserted IDs with ISSN/title, code hashes, production before/after, verification, source counts), `verify-*.json`, `rollback-review.json`, `SHA256SUMS`.
* Production audit: table `IngestionAudit`, action `JOURNAL_SOURCE_IMPORT`, `meta.runId` = the run id (2 entries).
* **Rollback (reviewed, not executed):** scoped to the exact 80 IDs. The `rightsBasis` label alone is not a safe scope (it is shared: OpenAlex 6,263 rows, NLM 112). `Article.journalId` is `ON DELETE SET NULL`, so the `NOT EXISTS` guard is essential; articles, runs and library events referencing the 80 are all 0 today and must be re-counted before use. Audit rows have no foreign key and are never deleted. The statement is in `audit-manifest.json`.

## Tests

`test-journal-source-import.ts` 39/39, `test-journal-status-apply.ts` 16/16, `test-nlm-journals.ts` 15/15, `test-nursing-expansion-manifest.ts` 16/16 (offline invariants of the frozen manifest). Code files used were hashed before the first write and had not changed afterwards.

## Limits

INANE (275 vetted nursing journals), REVENF and the large publisher catalogues are the likeliest places for more verified Nursing titles and could not be read lawfully by program: they need a manual or licensed export. Nursing is at 554 public, not 1,000; the remaining candidates need an official issue list or aims-and-scope that automation cannot supply (the official-site probe reached 5 of 40 sites). The 827 NeedsReview records were reassessed in preview only (`docs/nursing-assessment-2026-10-28/`) and their status transitions remain unauthorized.
