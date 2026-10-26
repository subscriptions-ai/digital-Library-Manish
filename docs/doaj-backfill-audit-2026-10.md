# DOAJ — audit before any Phase 2D adapter (2026-10-26)

**Audit and design only. Nothing is built, nothing is applied, nothing was written to any catalogue.**
Sources: DOAJ's own documentation pages (`/docs/oai-pmh/`, `/docs/public-data-dump/`, `/docs/api/`), and the live services: the journal OAI-PMH endpoint (Identify, ListMetadataFormats, ListSets, and
a full walk of the whole journal list, 124 requests at 1.5 s, extracts only), the official journal CSV (downloaded once, 26 MB), and four requests to the JSON search API. Raw material is in the scratchpad
(`doaj-audit/`). Read-only checks against the dev and scratch catalogues used the existing `checkDoajCatalogue` (which writes nothing).

## Verdict in one paragraph
For a **historical** journal backfill the safest source is **DOAJ's official journal CSV snapshot, read from an operator-staged file** — not the OAI-PMH feed. The CSV is an immutable, dated, complete,
richer file (so there is no "list changed under the job" hazard at all and no network call at run time); the OAI feed is incomplete (2.4 % of live journals missing), poorer (no country, no print/e-ISSN
distinction, no journal-home link), 38 % deletion notices that cannot be tied to any journal we hold, has datestamps that carry no history, and is 30 days behind unless a paid key is used. OAI-PMH remains
the right channel for a later *delta / withdrawal* job, and the JSON API for a small freshness top-up. A second finding matters more than the choice of source: **the dev catalogue already holds 99 % of DOAJ**
(see "Marginal value"); the decision to build Phase 2D at all should weigh that.

## 1–18: the audit

1. **Official interfaces today.**
   * **OAI-PMH**: journals `https://doaj.org/oai`, articles `https://doaj.org/oai.article` (protocol 2.0).
   * **CSV** of all journals: `https://doaj.org/csv` → HTTP 307 → a **pre-signed S3 URL for a dated file** (`doaj_journalcsv_20260925_2320_utf8.csv`, 25,895,102 bytes, 23,544 rows, 52 columns). Documented as "available for immediate download".
   * **Public data dump** (full JSON): *by request only, case by case*; monthly for ordinary users, daily for Premium. Not usable without DOAJ's permission.
   * **JSON API v4**: `https://doaj.org/api/search/journals/{query}` (and `/api/v4/…`), 2 requests per second, **hard cap of 1,000 results per query** ("You cannot access results beyond 1000 records via this API", and it points to OAI/the dump instead).
2. **Is OAI-PMH available and appropriate for a historical walk?** Available, open, no login. *Not appropriate as the primary historical source* — see 7, 14, 15, 18.
3. **Base endpoint.** `https://doaj.org/oai`. Identify: `earliestDatestamp 2026-09-17T10:38:19Z`, `deletedRecord transient`, granularity seconds.
4. **Metadata formats.** Only **`oai_dc`** (documented: "Currently, we only support oai_dc"). The article feed also has `oai_doaj`; the journal feed does not.
5. **Sets.** 538, all LCC subject classifications (base64 `setSpec`, e.g. `LCC:Nursing`). Selective harvest by set works (the Nursing set, closed at 2026-09-17, listed 306 entries). No set for "added in year N".
6. **Pagination.** 300 records per page. The resumption token is **base64 JSON**: `{"m":"oai_dc","u":<fixed until>,"n":<offset, informational>,"a":[<last datestamp>,<how many records with that datestamp are already served>]}` — a *keyset*, not an offset (a hand-built
   token with a wrong `n` still continued from `a`, and `completeListSize` became `n + remaining`). **Tokens expire after 24 hours** (`expirationDate`), so a checkpoint cannot hold a token across a pause. `u` is fixed at the first request and was exactly 30 days before it.
   Order is newest-datestamp first; order within equal datestamps was **identical** across two walks minutes apart.
7. **Volume** (full walk, 37,149 records, 124 pages, ~8 min, ~45 MB of XML): **22,972 live journals + 14,177 deletion notices (38.2 %)**. The CSV has **23,544** journals. Every live OAI record's ISSN is in the CSV, but **572 CSV journals (2.4 %) have no ISSN in the OAI live set**, spread across every year back
   to 2003 (e.g. a journal added 2025-11-10). The OAI list is therefore **not a complete record of DOAJ**.
8. **Identifiers.** No ISSN-L anywhere in DOAJ. **CSV:** print ISSN and e-ISSN as separate, labelled columns (12,500 journals have both, 10,069 only an e-ISSN, 975 only a print ISSN; none malformed; none with print = electronic); `URL in DOAJ`
   (`https://doaj.org/toc/<ISSN>`). **OAI:** the ISSNs as undifferentiated `dc:identifier` values (we cannot tell which is print) plus a DOAJ record UUID in the header (`oai:doaj.org/journal:<32 hex>`). **API:** `id` (the same UUID), `pissn`, `eissn`. Three ISSNs are shared by two CSV rows
   (e.g. two entries titled "Ethics, Politics & Society"): duplicate DOAJ records the adapter must treat as one journal. **We store no DOAJ UUID** (the `Journal` model has none), so OAI deletion notices (which carry only the UUID) cannot be applied to anything we hold.
9. **Licence.** CSV: `Journal license` ("CC BY", or a list like "CC BY, CC BY-NC-ND"), `License attributes`, `URL for license terms`. OAI: `dc:rights`, one value per licence — equal to the CSV's for all 5,000 journals compared. API: `license[]` with `type` and the flags `BY/NC/ND/SA`.
   11,747 CSV rows (50 %) name a non-commercial licence somewhere, so about half of DOAJ is MetadataOnly under our existing rule.
10. **OA verification.** CSV column `Does the journal comply to DOAJ's definition of open access?` — "Yes" for 23,543 rows (one blank). API: `boai: true`. OAI: nothing (membership of the list is the only signal).
11. **Publisher.** CSV `Publisher` (always present), `Other organisation`. OAI `dc:publisher`. API `publisher.name`.
12. **Country / language.** CSV `Country of publisher` (always present) and `Languages…`. **OAI has no country at all**; language is two-letter codes. API: `publisher.country`, `language[]`.
13. **Subject / topic.** CSV: `LCC Codes` (always present), `Subjects`, `Keywords`. OAI: `dc:subject` free text plus LCC description and code (`xsi:type="dcterms:LCC"` in reality; the documentation still says `LCSH`). API: `subject[]` with `scheme/code/term`, `keywords[]`. All three can feed the existing LCC-based department rule.
14. **Dates.** CSV: `Added on Date` (2002 → 2026, **the only real historical dimension**), `Last updated Date`, `Last Full Review Date`, `Number of Article Records`. OAI: `dc:date` = the same added date (equal for 5,000/5,000), but the **header datestamp is useless as history**: 36,852 of 37,149 records were stamped on 2026-09-17 (a bulk re-index in an 18-minute span; `until=2026-09-17T10:55:30Z` still returns 36,660 records). 1,349 distinct datestamps, largest tie group 74.
    API: `created_date`, `last_updated`; **fresher than either bulk file** (161 journals created after the CSV's last addition).
15. **Deletions.** OAI: header `status="deleted"`, no other content. 14,177 of them, none with an ISSN, so unusable without a stored DOAJ UUID. CSV and API list only live journals. A withdrawn journal we already hold is not detectable from the CSV alone (it is simply absent).
16. **Reliable checkpoint unit.**
    * **CSV snapshot (recommended):** `(snapshot identity, row position)`. The file is immutable and its name carries its timestamp, so a position is exact and a page can be re-read bit for bit.
    * OAI: a *record* anchor, as for OAPEN, restarting by `until=<datestamp of the anchor>` (tokens expire in 24 h) and finding the anchor by DOAJ UUID within the tie group; workable, but it needs the whole OAPEN recovery machinery and still cannot fill the missing fields.
17. **Rate limit / resources.** Documented 2 requests/second on all API routes (bursts of 5). The OAI walk used 1 request per 1.5 s with no refusal. A CSV download is one request (~9 s). Parsing the CSV takes ~0.5 s and ~60 MB retained (236 MB transient) — bounded if the adapter parses per chunk from a stored offset instead of holding all rows.
18. **Bulk file or OAI?** Bulk file (CSV). Side by side:

| | CSV snapshot | OAI-PMH `oai_dc` | JSON API |
|---|---|---|---|
| Complete | 23,544 | 22,972 (572 absent) | yes (live) |
| Immutable / dated identity | **yes** (filename timestamp) | no (live list, 24 h tokens) | no |
| Fields we need | **all** (country, print/e-ISSN, URL, LCC, licence attrs, OA flag, added date) | no country, no print/e distinction, no clear homepage | all (+ DOAJ id) |
| Deletions | not shown | 14,177 notices, unusable without a stored id | not shown |
| History | `Added on Date` | `dc:date` only; datestamp meaningless | `created_date` (query) |
| Freshness | ~30 days behind | 30 days behind (free tier) | live |
| Mutation hazard during a job | **none** | yes (anchor + re-read design needed) | yes |
| Runtime network | **none** (staged file) | ~80–124 requests | ≥ 236 requests, date-partitioned |

## Marginal value — read before approving
Using the existing read-only check on the CSV (2026-09-25 snapshot):
* **dev catalogue (`stm_library`)**: 23,660 journals held; of the CSV's 23,544, **23,309 are already held**, **163 are new** (76 would be Accepted, 87 MetadataOnly), **72 share a title with a held journal under different ISSNs** (the importer's "needs review").
* **scratch test database**: 3,462 held; 22,409 new — a good bounded-test substrate.
* The existing admin "Import every DOAJ journal" already adds new journals from this same CSV, but never **enriches** held ones, never counts conflicts, and cannot be previewed in bounded, pausable, resumable jobs. That is what a Phase 2D adapter would add. If production already ran that import, a DOAJ backfill's catalogue growth there is also small. Production state is unknown and was not touched; running the existing "Check" on the production screen gives the exact figure without writing anything.

## Recommended design (not built)
**Adapter `doaj` for `JOURNAL`** on the existing `BackfillJob` framework — no second system, no Periodical table, no Article mapping.
* **Source:** the official CSV, **staged by an operator** into `DOAJ_SNAPSHOT_DIR` (a helper script downloads it; the app never contacts DOAJ at run time, so it cannot touch DOAJ's health, rate or the engine's breaker). Available only with `BACKFILL_DOAJ_ENABLED` and a staged file. Alternative if preferred: the adapter downloads once to a cache directory behind a second switch.
* **Source identity:** filename timestamp + byte size + sha-256 prefix; recorded on the job; a changed file stops the job (`DOAJ_SNAPSHOT_CHANGED`, like OpenAlex).
* **Checkpoint** (`BackfillJob.cursor`): `{"v":1,"id":<identity>,"i":<row index>,"o":<character offset of that row>}` — bounded, exact, re-readable. A chunk parses from the stored offset (header supplied), so memory does not grow with the file.
* **Window:** the screen's publication period is applied to `Added on Date` ("when the journal entered DOAJ"); an optional `updatedSince` to `Last updated Date`. Departments and maximum records as for every backfill.
* **Identity / dedupe (never merge on title similarity):** (1) every ISSN of the row against `Journal.issn` **and** `Journal.eissn` (both columns, as the existing importer and writer do); (2) a row seen earlier in the same file (the three shared-ISSN pairs) is judged against its first sighting; (3) a *new* ISSN whose normalised title **and** publisher equal a held journal's is **not written**: it is reported (outcome "refused — needs a person", reason named) exactly like the importer's "needs review". ISSN-L is not available from DOAJ. No DOAJ UUID is stored, so none is used.
* **Rights / acceptance (unchanged rules):** a new journal is `Accepted` only if the OA flag is "Yes", it declares a licence, **every** licence allows commercial use, and `License attributes` names no non-commercial restriction — otherwise `MetadataOnly` (catalogued, no full text). `rightsBasis = "DOAJ declaration"`, `rightsVerifiedBy = "ingestion"`, exactly as today. A missing licence, a non-"Yes" OA flag, or no valid ISSN/title is not catalogued.
* **Held journals:** fill **empty** descriptive fields only (e-ISSN, publisher, country, homepage, language, subjects, department) — the same set the engine's refresh uses, minus its licence/status refresh (a backfill never changes licence, status, access or rights; the continuous sweep already refreshes DOAJ-decided ones). **Conflicts** (licence family differs; the held row's ISSN pair contradicts the row's) are counted and nothing is written. `rightsBasis = "our own"`, `status = Rejected`, or a rights decision by a person: never touched. (`Journal` has no metadata column, so unlike books there is no evidence note — conflicts are counter-only and appear in the bounded preview.)
* **Department:** the existing `departmentForDoajRow` (LCC class, with the title overrides) — no new classifier. If it returns nothing, the journal is written `NeedsReview` with **no department** (the status the other journal sources already use) and is not Accepted. (In the scratch check none of the 22,409 rows that would be new lacked a department — though many land in broad ones: Arts 4,350, Education & Social Sciences 4,727, Science 1,488 — and the quality of that mapping is unchanged by this phase.)
* **Independence:** reads only the staged file. Never touches `DepartmentSweep`, `Journal.fetchCursor/exhaustedAt/nextEligibleAt/lastIngestionStatus/claimedAt`, the `ingestion.journals.coverage.v1` setting, `IngestionSourceHealth('DOAJ')`, `IngestionRun`, rotation or Quick Import. Lock key `DOAJ` (the engine's, and the admin one-off import's), held for one chunk, so none of them overlaps.
* **Expected schema change: NONE.**
* **Traceability without a column:** `Journal` has no `createdBy`. Journals written by a backfill are traceable through a bounded audit entry per chunk (job id + the ISSNs written, ≤ chunk size) — this needs one new member in the `AuditAction` union in `src/lib/ingestion/audit.ts`, a file another session has uncommitted edits in, so it would be staged by hunk.

## If OAI-PMH is still preferred
Feasible, not recommended. It would need: the OAPEN-style anchor/re-read recovery (position = the anchor's DOAJ UUID within its datestamp tie group, restarting by `until=` because tokens expire in 24 h); a join with the CSV for country, print/e-ISSN and homepage; acceptance that 2.4 % of journals are absent; deletion notices ignored (no stored UUID); and the free tier's 30-day lag. All of that to reproduce a file we can read directly.

## Files likely to change (if approved)
New: `backfill/doajSnapshot.ts` (locate, identity, offset reader), `backfill/doajAdapter.ts`, `backfill/journalCommon.ts` (judge/write for journals), `scripts/doaj-stage-csv.ts` (operator download helper), `scripts/doaj-sample.ts` (DOAJ-format fixture generator), `scripts/test-backfill-doaj.ts`, an audit-appendix doc.
Edited: `backfill/registry.ts`, `backfill/config.ts` (or the adapter) for the two switches, `src/lib/ingestion/audit.ts` (one union member, by hunk), `HistoricalBackfill.tsx` only if the new adapter's parameters need wording. **Not** edited: `doajCatalogue.ts` (its `departmentForDoajRow` and `doajRowToJournal` are already exported and are reused), the engine, the schema.

## Risks
1. **Low marginal catalogue growth** (above) — possibly the strongest reason to pause.
2. The snapshot is **~30 days stale**; journals added since are absent (161 so far). A later small API top-up (`created_date` after the snapshot date) would cover them.
3. Withdrawn journals are not seen by a CSV-based backfill; they are a *maintenance* concern needing a stored DOAJ id (schema) — out of scope.
4. Writing `Accepted` journals makes them eligible for the engine's **article** fetching and widens the OpenAlex **article** backfill's scope (that adapter reads Accepted + DOAJ-declared journals as of job creation, so a running job is unaffected).
5. Broad-department mapping quality (existing classifier) and journals with the same title but different ISSNs (72 in dev) need a person.
6. `audit.ts` is shared with another session's uncommitted work.
7. The CSV link is a pre-signed S3 URL that expires in an hour; only the helper script (never the app) follows it.

## Development test plan (scratch database only; no production; no DOAJ call at test time)
* **Fixtures:** a DOAJ-format CSV generator (52 columns, deterministic shapes: open / NC / mixed licences, no department evidence, print-only / e-only / both ISSNs, shared-ISSN repeats, title-only matches, held journals of every kind: enrich, conflict, unchanged, protected `our own`, `Rejected`, different-ISSN same-title).
* **A — 100 rows**, **B — 1,000 rows** (pause, resume, cancel, SIGKILL mid-apply and recovery, idempotent re-run, duplicates, enrichment, conflicts, a changed staged file, exact counters, memory), then **C — the real 26 MB snapshot, first 100 and 1,000 rows only** (no network needed — it is the file already staged), and **up to 5,000 rows only after approval**.
* **Always:** dry run writes nothing; the continuous DOAJ state (sweeps, journal cursors, coverage setting, health row) is fingerprinted before and after; every created journal is removed afterwards by its recorded ISSNs; the Journal count before, after and after cleanup is reported.
* **No full import.** The job limits (5,000 records, 60 minutes, 256 MB) stay as they are.

## Decisions needed from you
1. Source: **CSV snapshot** (recommended) or OAI-PMH?
2. Given dev already holds 99 % of DOAJ, do you still want Phase 2D now, or a different next step (for example enrichment-only for held journals, or the Phase 2E batching sources)?
3. Staged file only (recommended), or may the adapter download the CSV itself behind its own switch?
4. May the plan add one `AuditAction` member (staged by hunk) for traceability, or should traceability be counter-only?
5. Should a journal with no department be written `NeedsReview` (recommended) or skipped?

---

## Production coverage check (2026-10-26) — method and development proxy

**Production is not reachable from the development machine** (its database host is Coolify-internal and no production credential is held here), so the production figures must be produced by running a read-only report there. The existing admin "Check First" is *not* strictly read-only (it saves one `IngestionPreview` row) and reports only held / new / same-title / Accepted vs MetadataOnly / no-department, so a zero-write report was written: `scripts/doaj-coverage-report.cjs` (untracked).

* Runs every query inside one `SET TRANSACTION READ ONLY` transaction (proved: an INSERT inside it is refused by Postgres, SQLSTATE 25006; and database-wide insert/update/delete counters were identical before and after a full run). Creates no preview row, imports nothing, moves no checkpoint.
* Classifies every CSV row with the app's own `doajRowToJournal` / `departmentForDoajRow`; on dev it reproduces the admin Check exactly (23,309 held · 163 new · 72 same-title · 76 Accepted / 87 MetadataOnly).
* Adds what the Check cannot say: protected / manual / Rejected journals, fill-empty enrichment by field, conflicts, rights drift, held DOAJ journals the file no longer lists.
* Run on the production container: `node scripts/doaj-coverage-report.cjs --json /tmp/doaj-prod.json` (it downloads DOAJ's CSV itself, one request; `--csv <file>` to use a file instead). Needs the repository's `src/` and `tsx` in the image, like `scripts/audit-departments.cjs`.

**Development proxy (`stm_library`, snapshot 2026-09-25; NOT production):** 23,544 rows · 23,309 held (99.0 %) · **163 new** (76 Accepted / 87 MetadataOnly; none without a department) · 72 same-title/different-ISSN · 0 protected · 10,255 held journals (44 %) would gain a field — **10,251 would gain a homepage and a language** (3,856 of them MetadataOnly, for which the homepage is the only way out to the journal; 442 already have articles); 5 an e-ISSN; none a department · 96 held DOAJ journals are no longer in the file.
**Rights drift found (existing, not caused by this work):** 1,105 held **Accepted** journals that DOAJ's file would make MetadataOnly (109 with articles). 1,100 of them are multi-licence journals ("CC BY, CC BY-NC-ND"): the continuous sweep accepts a journal on its **first** listed licence, the CSV importer only if **every** licence allows commercial use. Which rule is intended is a policy decision; nothing was changed.
