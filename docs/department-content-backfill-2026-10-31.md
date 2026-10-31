# Department content backfill and the gated production path (2026-10-31)

What was built, how a production write is made, what was run, and what is still open. The evidence for every run (plans, checksums, baselines, verifier output, logs)
lives outside the repo in `~/stm-evidence/` on the operator's machine; the repo holds the tools.

## The one way a department write reaches production: `scripts/prod-run.sh`

`scripts/prod-run.sh <script> <plan.json | run-id> [flags]` runs only `scripts/dept-*-apply.cjs`, `dept-*-articles-*.cjs` and `dept-*-rollback.cjs`, nothing inline. It
- finds the STM container by its Coolify uuid in the name (exactly one, else it stops);
- checks the plan's sha256 against a checksum file in the plan's evidence folder;
- hold check: the plan's ids (uuid, ISSN, e-ISSN, plus titles of id-less hold rows) against every `coordinator-*` hold file, the 218 held Paramedical journals resolved to uuids, and for
  books plans the coordinator's remediation list. Any hit refuses `--execute`;
- requires the script to take `select pg_advisory_xact_lock(...)` 2026103001 -> stm.journal.insert -> dept-radiology-book-insert, in that order, all three;
- runs a dry run first; `--execute` is accepted only after a dry run of the same script + plan + arguments in the last hour (one dry run buys one real run);
- one `--execute` at a time (global flock), fixed daily caps per IST day (journals + books 1,500 rows, articles 10,000; hard-coded, no env or config), a ledger by type, a log per run;
- rollback `--execute` needs `--plan=<the plan that made the run>` and an owner-created `approvals/<run-id>.ok` holding that plan's sha256.
Settings (not in the repo): allow `Bash(scripts/prod-run.sh:*)`, ask `Bash(scripts/prod-run.sh *--execute*)`. The `:* --execute*` spelling does not work; `:*` is only valid at the end of a pattern.

## Scripts

| Area | Files |
|---|---|
| Articles, Optometry & Ophthalmology | `dept-optometry-ophthalmology-articles-{apply,rollback}.cjs`, `-verify.js`, `-plan.py` |
| Articles, Radiology / MLT / Paramedical | `dept-newfour-articles-{apply,rollback}.cjs`, `-verify.js`, `-plan.py` (the department comes from the plan / run id / preamble) |
| Books, coordinator publication | `dept-coordinator-books-publish-{apply,rollback}.cjs` (wrapper forms of the coordinator's publisher and unpublish), `dept-coordinator-books-publish-verify.js` |
| Tests (private throwaway database `stm_optometry_articles_test` only) | `test-dept-optometry-articles-apply.ts`, `test-dept-optometry-articles-canary-rehearsal.ts`, `test-dept-newfour-articles-apply.ts`, `test-dept-newfour-articles-rehearsal.ts`, `test-dept-coordinator-books-publish-apply.ts`, `test-dept-coordinator-books-publish-verify.ts` |

The article writer creates only commercial-OK Creative Commons articles (CC BY, BY-SA, BY-ND, CC0, public domain) whose own Crossref licence entry is in force (no embargo, started,
content-version vor or unspecified) with its URL; 2020 on; LinkOnly; no abstract; accessType from the article's own licence; DOI dedupe inside the three locks; auto-stop on > 10% held (6),
lock wait (7) or a failed verification (8). Rollback deletes only what a run wrote and still as written. The `.js` verifiers are read-only and are not handed to the wrapper.

## Procedure for one run
1. Build and freeze a plan (`*-plan.py` or a reviewed manifest) and write its `.sha256` beside it.
2. Read-only baseline (verifier `baseline` mode). 3. `prod-run.sh ... ` (dry) - read the output. 4. Same command with `--execute`.
5. Verifier `verify` mode: pass/fail rests only on the run's own rows and audit ids, the department, and the plan's journals / books; whole-table counts are information.
6. `prod-run.sh <rollback script> <run-id> --plan=<plan>` (dry) must show wouldDelete / restoreable = rows, kept 0. Any exit 6/7/8 or failed check: stop, do not roll back, report.

## What was run (all verified, all reversible by run id)

| Run id | What | Rows |
|---|---|---|
| dept-optometry-ophthalmology-articles-2026-10-31-35b781c0 / -eb7cab30 | Optometry articles: canary / wave 2 | 200 / 4,225 |
| dept-paramedical-articles-2026-10-31-79e67766 / -85bbfcf2 | Paramedical articles (15 in-scope journals): canary / wave | 100 / 446 |
| dept-mlt-articles-2026-10-31-f1e5ddf8 / -976ff4e5 | MLT articles: canary / wave | 200 / 2,184 |
| dept-radiology-articles-2026-10-31-dcc6dfb5 / -d1987879 | Radiology articles: canary / wave A (one DOI already held, skipped) | 200 / 2,399 |
| dept-books-publish-2026-10-30-fa263ee0 | 455 coordinator-reviewed books (MLT 209, Optometry 81, Paramedical 165) | 455 |
| dept-books-publish-2026-10-31-220285f4 | Radiology books (criteria-checked by the assistant, owner-approved) | 567 |
| dept-books-publish-2026-10-31-34b225db | MLT NLM books (criteria-checked by the assistant, owner-approved) | 289 |

Department totals shown on the site afterwards (departments list = articles + published books + legacy content): Optometry & Ophthalmology 4,541, Radiology 3,232,
Medical Laboratory Technology 2,890, Paramedical Sciences 742 (741 ours plus one book approved by hand in the admin).

## Open
- Radiology articles wave B (plan of 1,107 rows, run dept-radiology-articles-2026-10-31-034cfd12): needs the next IST day's article cap.
- Paramedical's 917 Draft books: all on the coordinator's remediation and noncompliant lists, and only about two titles are inside the narrow Paramedical boundary; the wrapper's hold check
  refuses them. A decision (lift the hold for named ids / re-home to Medical Sciences / leave) is the owner's.
- MLT Open Library (283) and Crossref Books (7) Drafts are review-first sources; 19 licensed Drafts (Optometry 11, Paramedical 8, mostly NC) are not published.
- `dept-mlt-apply.cjs`, `dept-mlt-books-apply.cjs` take the three locks in the order stm -> 2026103001 -> radiology (and `dept-paramedical-apply.cjs`, `dept-mlt-rollback.cjs` do not take all three
  as SQL calls), so the wrapper refuses them until they are fixed.
- About 1.7% of the articles written are front matter / corrections / index-style items (not filtered); Europe PMC licence strings carry no URL, so those DOIs were not used.
- The older `dept-coordinator-books-eligibility.ts` route B ("NLM is a self-publishing feed") disagrees with the coordinator's finding that NLM books outside the feed's seven departments are
  `outside_source_scope`; do not use its "eligible" count to publish.
