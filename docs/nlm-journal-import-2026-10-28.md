# NLM Catalog journal import, 2026-10-28 (run `nlm-2026-10-28-247b5154`)

Closeout of a bounded production import: **70 journals inserted** into production from the NLM Catalog, **396 held**. Everything below is reproducible from the files in
`docs/import-manifests/nlm-2026-10-28-247b5154/` and `scripts/nlm-journal-import/`. Nothing here is a deployment, a push or a schema change.

## 1. What was inserted

| Department | Inserted |
|---|---|
| Nursing | 23 |
| Dental | 22 |
| Bio Technology | 13 |
| Pharmacy | 6 |
| Nano Technology | 3 |
| Physiotherapy | 3 |
| **Total** | **70** (canary 35 + remainder 35, two audited batches) |

Every row is `MetadataOnly`, `openAccess = false`, no licence, no rights verification, `rightsBasis = "NLM Catalog listing — OA unverified"`, no country, no homepage, no articles.
Production before → after: total 54,384 → 54,454; MetadataOnly 15,937 → 16,007; Accepted 12,840 → 12,840; NeedsReview 25,607 → 25,607. A content hash of the 54,384 pre-existing
rows (id, title, ISSN, eISSN, status, department, openAccess, licence) was identical before and after.

## 2. Count reconciliation (fetch → inserted)

| Step | Count | Note |
|---|---|---|
| NLM serials fetched (13 subject queries, `"<subject>"[Subject] AND serial[Type]`) | 12,214 | unique serials across subjects |
| no valid ISSN, or a non-Latin title | 4,887 | |
| ISSN or eISSN already held | 1,860 | |
| same normalised title as a held journal | 202 | identity conflict, never merged |
| no department from NLM subjects | 1,275 | e.g. only "Engineering" or "Rehabilitation" |
| no publisher recorded | 212 | |
| weak or multi-subject mapping | 92 | |
| duplicate inside the batch | 1 | |
| **planner "ready"** | **3,685** | 4,887 + 1,860 + 202 + 1,275 + 212 + 92 + 1 + 3,685 = 12,214 |
| not ongoing (NLM dates closed, or no dates) | −3,026 | pre-freeze gate |
| non-journal title (newsletter, directory, report, proceedings, manual…) | −113 | pre-freeze gate (101 + 12, two regex passes) |
| hand-dropped by ISSN after reading the titles | −80 | `prefreeze-dropped-80.json` |
| **frozen manifest** | **466** | sha256 `88317182f2a3d3a7121401d08eb1985fe094b8149a747eb5716f932293a6b2fc` |
| held by the validator | −396 | section 3 |
| **inserted** | **70** | validated set sha256 `e8f48e0c1d84091b52b6c0ae6b5534c34038eccea0d743543d37e3f78b538268` |

The validator's pass count moved 74 (Crossref + PubMed, at least 1 recent article) → 80 (OpenAlex added as a third source) → **70** (the at-least-3 bar).

## 3. The 396 held candidates

**Unique primary reason** (each held row counted once, department/scope first, then identity, then recent-publication evidence):

| Primary reason | Rows |
|---|---|
| D1 broad NLM subject, the title does not name the field | 37 |
| ID Crossref has recent DOIs for the ISSN under a different title (identity not confirmed) | 5 |
| E0 no record in Crossref or OpenAlex, and 0 PubMed articles 2024–26 | 230 |
| E1 a Crossref/OpenAlex record exists but 0 recent articles | 114 |
| E2 1–2 recent articles (would pass an "at least 1" bar, fails "at least 3") | 10 |
| **Total** | **396** |

**Overlapping secondary reasons.** 23 rows carry two reasons: they are D1 and also fail the evidence bar (17 with E0, 5 with E1, 1 with E2). The validator prints one line per
reason, so its raw instance counts add up to more than the row count:

| Validator line | Instances | = |
|---|---|---|
| fewer than 3 recent articles | 377 | E0 230 + E1 114 + E2 10 + 23 overlaps |
| department (title does not name the field) | 37 | all D1, 23 of them also in the line above |
| identity not confirmed | 5 | ID |
| **sum of instances** | **419** | = 396 rows + 23 overlaps |

**"Extra 10":** exactly the E2 rows, held only because the evidence bar is 3 and not 1 (Dental 4, Nursing 4, Architecture 1, Physiotherapy 1). Without the 3-article bar the
validated set would be 80.

## 4. Additional conservative filters (document of intent)

These were chosen by the operator of this run, on top of the authorization's own conditions, to prefer a smaller, defensible set over reaching 466. Both are tunable and both
are reflected in the numbers above.

1. **At least 3 articles issued 2024–2026** (`MIN = 3` in `scripts/nlm-journal-validate.ts`) from Crossref (DOIs issued 2024–26, title overlap ≥ 0.5), PubMed (`<ISSN>[ISSN]`,
   publication date 2024–26) or OpenAlex (`counts_by_year` 2024–26, title overlap ≥ 0.5). One or two stray records are not evidence that a journal still publishes. Effect: 10 rows held.
   The NLM "open-ended" date is never evidence by itself (366 of the 396 holds have no recent article anywhere).
2. **Title-keyword requirement for broad departments** (`TITLE_EVIDENCE` in `src/lib/ingestion/nlmJournalDepartment.ts`): Ayurveda, Architecture, Chemical Engineering, Nano
   Technology and Physiotherapy need the field named in the title on top of the NLM subject. "Medicine, Traditional" and "Complementary Therapies" never place Ayurveda alone;
   "Rehabilitation" never places Physiotherapy. Effect: 37 rows held (Ayurveda 20, Physiotherapy 8, Chemical Engineering 5, Nano 3, Architecture 1).

## 5. Definitions that were executed

* **NLM subject → department** (`NLM_SUBJECT_DEPARTMENT`): Nursing→Nursing, Dentistry→Dental, Pharmacy→Pharmacy, Physical Therapy Modalities→Physiotherapy, Biotechnology→Bio
  Technology, Nanotechnology→Nano Technology, Complementary Therapies and Medicine, Traditional→Ayurveda (title evidence required), Architecture→Architecture, Chemical
  Engineering→Chemical Engineering (title evidence required), Energy-Generating Resources→Energy. "Engineering" and "Rehabilitation" place nothing on their own.
* **Exactly one department** must be named by a serial's subjects; two or more is held.
* **Non-journal title** (`NLM_NON_JOURNAL`): directory, newsletter, annual report, report(s), proceedings, yearbook, guide, catalogue, abstracts, series, handbook, index, statistics,
  symposium, conference, transactions, manual, standards, update, digest, alert, and the like. The pre-freeze gate used the same idea as two regexes recorded in section 9.
* **Ongoing** (pre-freeze): NLM `dateissued` ends with `-` after a year. Undated or closed serials were not carried forward.
* **Identity**: the Crossref/OpenAlex record counts only when its title shares at least half of the (non-stop) words of the NLM title.
* The planner in `scripts/nlm-journal-plan.ts` holds a deliberately lenient inline mapping; the strict mapping is the module above, applied by the validator. Both are committed
  as executed.

## 6. Preview-only reassessment plan for the 396 held (no insertion is part of this)

Goal: find which held journals can honestly be promoted, with evidence a person can check, without lowering any bar. Output is a preview file per tier; **any insertion needs a
new, explicit authorization.**

| Tier | Rows | What is missing | Evidence to collect | Likely outcome |
|---|---|---|---|---|
| T1 = E2 | 10 | one or two recent articles only (Dental 4, Nursing 4, Architecture 1, Physiotherapy 1) | the official publisher site's issue list: at least 3 articles in issues dated within the last 24 months | highest yield, at most 10 |
| T2 = D1 with evidence ≥ 3 | 14 | the title does not name the field (Physiotherapy 4, Ayurveda 3, Chemical Eng 3, Nano 3, Architecture 1) | the publisher or society "aims & scope" naming the field, plus the NLM subject; for Nano also the journal's own scope | partial: titles like "Small" or "Adapted physical activity quarterly" should stay held; a handful (e.g. JOSPT cases, Musculoskeletal science & practice) may qualify |
| T3 = ID | 5 | identity of the ISSN | compare the NLM record with the Crossref title and the publisher site. 4 look like a rename or edition (Biuletyn Wydziału Farmaceutycznego → Prospects in Pharmaceutical Sciences; Enfermería clínica / English Edition; ORNAC journal; Yakhakhoe chi = Yakhak Hoeji). 1 is a wrong ISSN (The Zimbabwe nurse resolves to an unrelated Russian journal): never import | up to 4 |
| T4 = E1 | 114 | recent output (a record exists, nothing in 2024–26) | the publisher site's latest issue date; 14 have ≥ 50 Crossref DOIs in total and are the first to look at | low: most are dormant |
| T5 = E0 | 230 | any digital record at all | only the publisher site can qualify these (print and regional titles; 146 have an unclear publisher type, 65 are societies/universities, 19 commercial) | very low; do not automate |

Procedure for T1–T4: resolve the official site from the Crossref member/DOI prefix landing page or by the publisher name on the NLM record; record URL, latest issue date and
three article titles; require the same department rule (subject plus title or scope evidence) and the same live duplicate re-check as the original run; a second person samples
10% of the preview; then stop and ask. NLM subject strength is weak as a discriminator on its own (379 of the 396 held rows carry exactly one matching subject), so scope evidence
from the publisher is the deciding signal for T2.

## 7. Does `openAccess = false` mislead the frontend or API?

* **Frontend:** no component reads `openAccess` for journals. The journal page (`src/components/library/JournalPage.tsx`, `LicenceMark`) keys on `licence`: a journal without one shows
  a neutral badge "Licence not recorded". It never says "closed access", "subscription" or "paywalled". One minor point: that badge uses a padlock icon, which can read as "locked".
* **API:** `GET /api/library/journal/:issn` returns the whole journal row, so a third-party consumer sees `openAccess: false` next to `licence: null`,
  `rightsBasis: "NLM Catalog listing — OA unverified"` and `rightsVerifiedAt: null`. The flag on its own is ambiguous (false = "not verified as open", not "verified closed"). The
  same is true of all 16,007 MetadataOnly journals; this import follows the existing convention and changes none of it.
* **Conclusion:** no surface claims verified closed access. If the ambiguity matters to API consumers, a follow-up could expose a derived `openAccessStatus: "unverified"` (from
  `rightsVerifiedAt IS NULL`) and use a neutral icon. Not done here.

## 8. Rollback review (read-only; nothing was executed)

Checked against production with read-only queries (`rollback-review.json`, `rollback-softrefs.json`):

* **Scope = exactly the 70 IDs.** Rows with `rightsBasis = 'NLM Catalog listing — OA unverified'`: 70, all in the ID list, all MetadataOnly. The rollback predicate matches 70.
* **Foreign keys:** the only FK onto `"Journal"` is `Article_journalId_fkey` with **ON DELETE SET NULL**. Deleting a journal that has articles would not fail; it would silently
  detach them. The `NOT EXISTS (… "Article" …)` guard is therefore essential. Currently 0 articles are attached to the 70.
* **References without a foreign key:** `IngestionRun.journalId`, `LibraryEvent.journalId` / `journalIssn`, `Article.journalIssn` / `journalName`. All 0 for the 70 (111 ISSN values
  checked). They are not protected by the database, and the journals are public, so re-run the counts immediately before any rollback.
* **Audit preservation:** two `IngestionAudit` rows (`JOURNAL_SOURCE_IMPORT`, batch 1 each, 35 + 35 inserted entries, `adminId` null). `IngestionAudit` has no foreign key to
  `Journal`, so a delete leaves them intact. Never delete them.
* **Safer shape** (do not run without a new instruction): bind to the ID list from the audit meta, not only to `rightsBasis`; one transaction; assert the row count is 70 before commit; write a
  `JOURNAL_SOURCE_ROLLBACK` audit row in the same transaction; or, if reversibility matters, change `status` to `NeedsReview` instead of deleting.

```sql
BEGIN;
  -- ids: docs/import-manifests/nlm-2026-10-28-247b5154/audit-manifest.json -> inserted.ids (70)
  DELETE FROM "Journal" j
   WHERE j.id = ANY (:ids)
     AND j."rightsBasis" = 'NLM Catalog listing — OA unverified'
     AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id)
   RETURNING j.id;            -- must return exactly 70 rows, otherwise ROLLBACK
COMMIT;
```

## 9. Reproducible commands

```bash
W=./work                                               # any scratch directory with nlm/ and nlm/run/ inside
mkdir -p $W/nlm/run
D=docs/import-manifests/nlm-2026-10-28-247b5154

# 1. tests (no database needed)
npx tsx scripts/test-nlm-journals.ts                   # 15 checks
npx tsx scripts/test-journal-source-import.ts          # 39 checks
npx tsx scripts/test-journal-quality.ts                # 52 checks

# 2. re-validate the frozen candidates with the committed evidence: must give 70 passed / 396 held
cp $D/manifest-466.json $D/evidence.json $W/nlm/run/
npx tsx scripts/nlm-journal-validate.ts --manifest $D/manifest-466.json --evidence $D/evidence.json --out-dir $W/nlm/run
#   passedSha256 e8f48e0c…38268 (the evidence rows carry a checkedAt date, so the hash is stable only on the day of the run)
python3 scripts/nlm-journal-import/reconcile_held.py $W/nlm/run/        # section 3 numbers

# 3. how the inputs were produced (network; needs a read-only snapshot of held journals for the planner)
python3 scripts/nlm-journal-import/fetch_subjects.py $W                # -> $W/nlm/subject-serials.json
npx tsx scripts/nlm-journal-plan.ts --serials $W/nlm/subject-serials.json --held <held.json> --public <public-by-dept.json> --out $W/nlm/plan-nlm.json
python3 scripts/nlm-journal-import/evidence.py $W                      # Crossref + PubMed -> $W/nlm/run/evidence.json (needs manifest-466.json in $W/nlm/run/)
python3 scripts/nlm-journal-import/evidence_oa.py $W                   # OpenAlex layer (needs OPENALEX_API_KEY and held.json from a validate run)

# 4. production write (what was run; dry first, then canary, then the rest)
(cat <(echo "var __PLAN__ = $(cat final-canary.json);") scripts/journal-source-apply.cjs) | <ssh … docker exec -i -w /app <app> node - --batch=100 [--dry]
```

Pre-freeze gate (ad hoc, recorded here because it was not code): keep rows whose NLM `dateissued` matches `-\s*\]?\s*$`; drop titles matching

* pass 1: `\b(directory|directories|news ?letter|newsletter|annual report|rapport annuel|reports?|proceedings|yearbook|year book|guide|buyers|catalog(ue)?|who'?s who|abstracts?|monograph series|handbook|bibliography|index|statistics|symposium|conference|workshop|transactions|series|program plans|memoirs|lecture notes|update|digest|review of|news|magazine|forum|letters?)\b` (101 rows)
* pass 2: `\b(manual|standards|sheet|notes|insights|accreditation|chronicles|best practices|profiles of|compendium|primer|calendar|schedule|price|fees|pocket|guidelines)\b` (12 rows)

then 80 rows were dropped by ISSN after reading the titles (`prefreeze-dropped-80.json`).
`scripts/nlm-journal-import/evidence_oa.py` differs from what was executed only in how it finds `.env` (the executed copy held an absolute home-directory path).

## 10. Remaining limitations

* The NLM identifier and the evidence live in the audit rows and the manifest, not on the `Journal` row: there is no per-journal source-reference column, and none was added.
* Crossref/OpenAlex/PubMed coverage is biased against print-only and regional journals, so the 3-article bar produces false negatives (366 holds have no recent article anywhere).
  It is conservative by design.
* The title-overlap test is a word-share heuristic; the 5 ID rows show it can reject a renamed journal.
* The department rests on one NLM subject per journal in 379 of 396 held rows and on 1 subject in 64 of the 70 inserted (2 in the other 6); the title-keyword rule is the second signal.
* The pre-freeze gate is documented, not coded; the planner's lenient mapping and the strict module are separate code paths.
* No country or homepage was recorded (NLM gives country names, the table uses ISO codes; no homepage is given).
* `openAccess` ambiguity (section 7) is a convention shared with all MetadataOnly journals and is unchanged.
* After this run no department is at 1,000 public journals; NLM at this bar is exhausted. Wikidata was **not** touched (outside the authorization).
* Not pushed, not deployed. Other sessions' files in the working tree (`openAlexJournals.ts`, `openAlexTopicDepartment.ts`, `openalex-journal-fetch.ts`) are not part of this commit,
  and neither is this session's OpenAlex `--filter` change in `scripts/openalex-journals-fetch.ts`.
