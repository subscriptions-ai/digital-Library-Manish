# Production audit, 2026-10-28 (read-only)

Everything below was read from production through one `SET TRANSACTION READ ONLY` transaction per query, or by outbound requests that write nothing.
Production was running `901fced` (the PR #46 merge). It contains the public-journals change and R3B, and does **not** contain pagination.

## 1. Publish Eligible and the year policy

Reproduced exactly: with the v1 classifier and the approved thresholds `{highMinScore 6, highMinMargin 3, highRequiresCode true}`, **4,874** ingested
Drafts are high confidence and **0** are eligible. (Production's saved book policy year is **2001**, not the 2000 default.)

| High-confidence books (v1) | Count |
|---|---:|
| Published before 2001 | 4,867 |
| No publication year at all | 7 |
| Malformed or implausible year (below 1000, not a whole number) | 0 |
| In the future | 0 |
| Within the year policy | 0 |

All 4,874 are **NLM Catalog** records (the newest is 1999, so the 2000/2001 boundary plays no part). Counterfactual: with the year set aside, **all 4,874 still
fail, on "No verified licence"**, because NLM Catalog records carry no licence. The "Year policy" label is the first failing check, not the only one.

This is not a bug. The ingestion rule and the publication rule are the same function (`yearPolicy.bookYearVerdict`, with the engine's saved year): the harvest writes an older or
undated book as a Draft *because* of that rule, so a Draft queue full of pre-2001 books is the rule working. The rule was not loosened.

Across **all 35,696** ingested Drafts, at any confidence: 435 pass the publication rules (221 Open Textbook Library, 214 NCBI Bookshelf); the rest fail on year
(14,410), licence (20,634) or no department (217). Of 21,222 in-policy Drafts, 19,213 are NLM Catalog with no licence.

Suggested follow-up (not done): the preview shows only the first failing reason; showing every failing check would have made this visible at once.

## 2. Review automation has run

Both gates are `true` in production and have been used today (04:12 to 04:19 UTC, by `info@celnet.in`):

- **Auto-assign:** two batches of 50 (`REVIEW_BATCH_ASSIGN`, v1, suggested mode): 100 NLM Catalog high-confidence books received a department and stayed Draft.
- **Auto-publish:** three previewed, confirmed jobs: medium/v2 published **177**, high/v2 published **1**, medium/v1 published **10**. **188 Books** carry
  `metadata.reviewPublication` and are Published (NCBI Bookshelf and Open Textbook Library, plus one NLM Catalog), all with a recorded licence. The skips were
  "Year policy" and "No verified licence" (2 more outside a source's department scope). Zero failed.
- Thresholds in force: the environment's `{6, 3, code required}`. The last analysis (v1, rules version 1, 35,884 Drafts: high 4,874, medium 7,059, low 23,635,
  unclassifiable 316) calibrates against 42 human decisions; its *recommendation* is looser (`{4, 0, no code}`, 100% of 40) than what is applied. The "high" tier
  itself has no human-decision sample under the applied rule (0), so its precision rests on the other tiers' evidence.
- Future-ingestion routing: `REVIEW_INGEST_ROUTING_ENABLED` and `_CLASSIFIER` are not set; it has never run.
- Journals (R3B): `REVIEW_JOURNAL_ASSIGN_ENABLED` is not set and there are 0 `REVIEW_JOURNAL_*` events.

## 3. DOAB and OAPEN connection resets

Egress address of the production container: **67.227.188.88** (not the server's SSH address). Health rows: DOAB 341 and OAPEN 125 consecutive failures, never a
success on record; Crossref and OpenAlex healthy. The stock `scripts/diagnose-source.ts` (run with `node --experimental-strip-types`, since the image has no `tsx`):
DNS ok, TCP 443 ok, TLS 1.3 ok, **first HTTP request reset**, for both hosts.

Comparison (one request per cell, no bodies kept):

| | Production egress 67.227.188.88 | This laptop 110.227.191.254 |
|---|---|---|
| directory.doabooks.org and library.oapen.org, OAI Identify, each of the 3 backend IPs | **reset (6 of 6)** | 200 (6 of 6) |
| engine user agent / Chrome / curl | **all reset** | all 200 |
| plain `GET /` on the same hosts | **reset** | 200 (DOAB `/` times out on its own) |
| www.doabooks.org (Cloudflare) | **403** | 200 |
| Crossref, OpenAlex, example.com, cds.cern.ch | all 200 | all 200 |

Reading: the three backend IPs behave identically from each place, so it is **not one bad backend**; the user agent makes no difference and the engine's own agent works
from the laptop, so it is **not user-agent filtering**; controls (including a CERN neighbour) pass, so it is **not a general outbound problem**. The evidence points to
**blocking of the egress address 67.227.188.88** (reset after TLS at the CERN-hosted OAI service; a Cloudflare 403 for the DOAB project site). Nothing was reset or changed.

Not done and needs a decision: ask the hosting provider for a different outbound address, or ask DOAB/OAPEN (CERN IT) to unblock 67.227.188.88 with the engine's contact user agent.

## 4. Journals

Public journals (Accepted + MetadataOnly) **24,209**; NeedsReview 25,607 stay hidden; 87 duplicate pairs (34 both public). The production department API is currently
unpaginated: Education and Social Sciences returns 4,551 rows, 1.69 MB, 8.5 s; Arts 1.48 MB; Medical Sciences 1.24 MB. Pagination is committed (`877ec29`, pushed) and not deployed.
DOAJ identity-conflict decisions recorded: 0.
