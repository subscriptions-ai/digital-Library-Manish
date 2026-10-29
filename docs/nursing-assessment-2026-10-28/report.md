# Nursing: evidence-based assessment of the public catalogue (PREVIEW, 2026-10-28)

**Nothing was written to production.** No insert, no status change, no deployment, no migration. Production was only read (twice, plus two `--dry` runs that write nothing).
The 1,000 target was **not** used to relax any criterion. What follows is what the evidence supports today.

## 0. Production now (read-only, 2026-10-28 11:09 and again 11:45 UTC)

| | Journals |
|---|---|
| Accepted (licence verified, full text) | 183 |
| MetadataOnly | 291 |
| NeedsReview | 827 |
| **Total in Nursing** | **1,301** |
| **Public (Accepted + MetadataOnly)** | **474** |

The historical baseline (1,301 / 474 / 827) was not assumed; it was re-measured and is identical.

## 1. The 827 existing NeedsReview records

All 827 are Crossref (725) or OpenAlex (102) listings, every one with an ISSN and the department already set to Nursing; 86 have no publisher. Each was assessed on
scope, publication evidence, duplicates and identity. Rules below are the existing ones: `MetadataOnly` needs no rights decision (open access stays *not verified*, licence stays empty);
`Accepted` needs a DOAJ declaration whose every licence allows commercial use (the rule in `src/lib/doajCatalogue.ts`). Neither the licence, `openAccess` nor any rights field is changed by the plan.

**Eligibility, separately**

| | Records |
|---|---|
| **MetadataOnly-eligible** (NeedsReview → MetadataOnly) | **242** |
| **Accepted-eligible** (rights-verified, full text) | **0** (the only DOAJ-listed candidate is a duplicate of a public record and CC BY-NC-ND) |

**Primary hold reason of the other 585** (each record once; order: structure, duplicates, non-journal, scope, publication; the secondary reasons overlap and are listed in `held.json`):

| Primary reason | Records | What it means |
|---|---|---|
| Scope insufficient (tier C/X) | 237 | the title says "nursing" but nothing independent supports it (NLM, CINAHL Nursing discipline, SciELO, OpenAlex topics, nursing-body publisher) |
| Scope tier B | 104 | one independent signal only; needs the journal's own aims-and-scope |
| No publisher | 78 | none recorded and none in Crossref/OpenAlex under a matching title (8 more were filled from evidence and are not held) |
| No recent publication evidence | 67 | no work in 2024–26 in Crossref, OpenAlex or PubMed, no indexer saying "current" |
| Same/base title as another NeedsReview record | 37 | identity conflict; never merged automatically |
| Print/electronic twin also in NeedsReview | 22 | 13 pairs; one journal, not two |
| Same journal as a public record | 17 | ISSN or ISSN-L cluster already public |
| Some publication evidence, not enough | 10 | 1–2 works or "currently indexed" only: official-site check |
| Same/base title as a public journal | 8 | |
| Reads as newsletter/conference/directory | 5 | |
| **Eligible** | **242** | |
| Total | 827 | |

## 2. Net-new candidates, by source

Sources read (facts only; conditions in `sources.md`): CINAHL Complete, SciELO, NLM Catalog (Nursing subject), OpenAlex (nursing topics), DOAJ (Nursing subject), J-STAGE (per ISSN).
De-duplication ran **before** any evidence was fetched, by ISSN-L clusters (print/electronic and renamed twins join one journal), cross-field ISSN and normalised title:

| Source | Source records | Already held | Title conflict | Net-new |
|---|---|---|---|---|
| CINAHL (academic journals, Nursing discipline or a nursing word) | 756 | 394 | 10 | 352 |
| NLM Catalog (Nursing subject, planner-ready) | 1,295 | 34 | 9 | 1,252 |
| OpenAlex (≥ 50% nursing topics, ≥ 3 core topics) | 450 | 274 | 4 | 172 |
| SciELO (WoS area NURSING or a nursing title) | 44 | 35 | 0 | 9 |
| DOAJ (Nursing subject) | 230 | 230 | 0 | 0 |
| **Merged genuinely net-new journals** (a journal found by several sources counts once; 274 were merged) | | | | **1,463** |

Of the 1,463: scope tier A 1,061, B 368, C 28, X 6. Publication evidence was fetched for the 1,170 that were not explicitly ceased (259 skipped: 132 CINAHL "indexing stopped before 2024",
127 NLM "publication dates closed") and not scope C/X.

| | Journals |
|---|---|
| **Eligible for MetadataOnly insertion** | **84** |
| of which, by the source that lists it first: NLM Catalog 45, OpenAlex 21, CINAHL 17, SciELO 1 (by membership, several sources list the same journal: NLM 46, OpenAlex 52, CINAHL 45, SciELO 1) | |
| **Accepted-eligible** | **0** |
| Held (1,379) | primary reason: no recent publication evidence 736; scope tier B needs official aims 337; reads as newsletter/conference/directory 133; some publication evidence 112; scope insufficient 34; no publisher 19; identity unconfirmed 8 |

General-medicine and allied-health titles are **not** counted: e.g. 8 of the 9 SciELO net-new are obstetrics, respiratory or mixed-area journals and are held at scope X/B.

## 3. Duplicates, conflicts and holds

* **Already held (not new):** 737 source records resolve to a journal the catalogue has (ISSN, print/electronic or ISSN-L cluster); 23 more are title conflicts (same or base title, different identifiers): reported, never merged, never counted as new.
* **Inside NeedsReview:** 17 are the same journal as a public record; 13 print/electronic pairs (26 records); 48 records share a title with another NeedsReview record or 9 with a public one.
* **Identity unconfirmed:** 3 (NeedsReview) + 11 (net-new): recent works exist only under a different title (rename or edition); to be resolved by a person.
* **Not touched:** the 87 existing duplicate-journal pairs elsewhere in the catalogue, and 14 DOAJ Nursing-subject journals (plus 9 SciELO nursing-tagged ones) that are already public but filed under other departments. Moving a public journal between departments is a separate decision and was not assumed.

## 4. Public count: now and evidence-supported projection

| | Public journals in Nursing |
|---|---|
| Now | **474** |
| + MetadataOnly transitions from NeedsReview | + 242 |
| + genuinely net-new MetadataOnly insertions | + 84 |
| **Evidence-supported projection** | **800** |
| Accepted (full-text) additions in this plan | 0 (Accepted stays 183) |

**Conditional pool (not counted).** Records blocked by exactly one fixable thing, with the concrete step that would clear it:

| Blocker | NeedsReview | Net-new | Step |
|---|---|---|---|
| Scope tier B | 90 | 71 | the journal's own aims-and-scope naming nursing |
| 1–2 recent works / "indexed" only | 10 | 112 | official publisher recent issue |
| No publisher | 23 | 8 | publisher from the journal site |
| Identity unconfirmed | 0 | 8 | rename/edition confirmed |
| Print/electronic pair | 10 records = 5 journals | | a person chooses the surviving record |
| **Total** | **133 records** | **199** | **332 records = 327 journals** (a pair is one journal) |

If every one of those 327 journals were verified the ceiling would be 1,127, but that is an upper bound, not a forecast: the official-site pilot (40 candidates) reached the site in 5 cases and found a recent issue in 2, so these need
manual verification. Reaching 1,000 would need roughly 200 of the 327 (about 61%) to verify. 736 net-new NLM serials have no recent work anywhere and were left as ceased/unknown on purpose.

## 5. Reviewing and implementing it (all prepared, none run)

| File | Purpose |
|---|---|
| `eligible-candidates.csv` | 326 rows: title, ISSN/eISSN, publisher, homepage, Nursing scope evidence, latest publication evidence, source URLs, verification date, record id |
| `plan-needsreview-to-metadataonly.json` | 242 rows for `scripts/nursing-assessment/journal-status-apply.cjs` |
| `plan-netnew-insert.json` | 84 rows for `scripts/journal-source-apply.cjs` (per-row `basisSource`; 10 of the 84 take their publisher from Crossref/OpenAlex under a matching title, because the listing source gave none) |
| `held.json` | all 1,964 other records with primary and all reasons, scope tier and publication class |
| `sources.md` | access and reuse conditions per source, what was collected |

* `journal-status-apply.cjs` changes **only** `status` (NeedsReview → MetadataOnly, never Accepted) and an *empty* `publisherName` (fill-empty only; 1 row of the 242 needs it). It re-checks each row live (still NeedsReview, still Nursing, same ISSN/eISSN/title, no other row holds an identifier, no public row holds the title, has a publisher), runs in batches of at most 100, writes one audit entry per batch with before and after values, and has `--rollback` that restores exactly those values (and leaves any row edited since alone).
* Both plans were **dry-run against live production** (reads only): 242 of 242 pass every live precondition, 84 of 84 would insert, 0 skipped. Production stayed at 183 / 291 / 827.
* Tests (scratch database only): `scripts/test-journal-status-apply.ts` 16/16, `scripts/test-journal-source-import.ts` 39/39.

**Next step (needs your explicit, bounded authorization).** Two separate approvals, so each can be refused alone: (1) the exact 242-row status plan, canary of 35 first, then batches of at most 100;
(2) the exact 84-row insert plan, canary first. Each is preceded by a fresh dry run, and the plan checksums in `SHA256SUMS` identify the exact sets.

## 6. Limitations

* Scope tiers are heuristics over independent signals; tier A means two independent subject signals, or one plus a nursing word in the title. A person should skim `eligible-candidates.csv` before approving (a few non-obvious titles, e.g. *Stat* from a state nurses' association, are plausible but unusual).
* Publication evidence is strong for journals that register DOIs. Print-only and regional titles are under-counted, which is why "no evidence" is a *hold*, not a rejection, and why 736 NLM serials stay unknown rather than ceased.
* The CINAHL list states intended coverage, and a "currently indexed" statement is used only as corroboration next to at least one recent work, never alone.
* INANE (275 vetted nursing journals), REVENF, and the Elsevier / Wolters Kluwer / Wiley / T&F / Sage catalogues could not be read lawfully by program (see `sources.md`); they are the likeliest places for more verified Nursing titles and need a manual or licensed export.
* J-STAGE found none of the 12 Japanese candidates; official-site probing is not reliable enough to automate.
* Some journals will be small or new start-ups; the existing rules contain no quality filter, and none was added.
