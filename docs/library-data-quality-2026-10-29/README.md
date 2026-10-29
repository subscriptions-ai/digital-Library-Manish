# Content Library data-quality review (2026-10-29)

Produced by `scripts/audit-library-data-quality.ts`. It is READ ONLY (every query is a `SELECT` inside a `READ ONLY` transaction); it wrote the files in this folder and changed no record. Nothing here has been applied. The numbers are from the local QA copy of the development database (`stm_library_qa`); **production was not queried** (read-only production access has been approved task by task, and this task did not ask for it), so every figure below must be re-run on production before any correction is decided. The script takes its database from `DATABASE_URL`, so it can be pointed at a read-only export.

The generated outputs (`summary.json`, `legacy-books-suspect.csv`, `structured-books-suspect.csv`, `subject-values-held-back.csv`, `proposed-corrections.json` — the manifest: one proposal per record, `action` is `propose-reclassify` or `needs-human-review`, never an instruction to run) are not kept in Git because the script regenerates them. The local-QA copy is in `/home/itb04/evidence/digital-library/library-usability-2026-10-29/data-quality/` (checksums in `SHA256SUMS`).

## 1. "Books" that look like journal articles

A title is never proof. The evidence used is what the source record carries.

**Legacy `Content` rows with `contentType = 'Books'`** (these are the archived shelf; Books-reconciliation definition: *listed* = status not Draft, see `src/lib/publicBooks.ts`):

| | records |
|---|---|
| Books in the table | 313 |
| Evidence says journal article — **high** (file address is an article page of a journal platform **and** the description opens as an abstract) | 55 |
| Evidence says journal article — **medium** (one of the two, no book evidence) | 115 |
| Kept: book evidence present (an ISBN, or a book/repository address) | 115 |
| No evidence either way | 28 |

All 170 suspects are in one department (Management). The file addresses are journal platforms (for example `jsezu.journals.ekb.eg` 65, `jmr.usb.ac.ir` 10, `jes.journals.ekb.eg` 5, `e3s-conferences.org` 4): the source record is an article page of a journal, on topics that have nothing to do with management (clove extract, date-palm pollen, bread formulation). The department is wrong as well as the type, which fits the earlier observation that the legacy table's type/department were assigned in rotation rather than read from the source.

**Structured `Book` rows**: 6,796 checked, 50 have two or more article signals (an article DOI/page address and an article's page range, with no ISBN). They are listed for review only: DOAB/OAPEN book records are, by construction, book DOIs, and the 50 are the exceptions.

**Proposed correction** (not applied): the 55 high-confidence legacy rows would become `Periodicals` (journal article) and be re-checked for department; the 115 medium and the 50 structured rows go to a person. No bulk reclassification is proposed. If applied, it moves records between *listed* totals (Books −N, Periodicals +N) — coordinate with the Books-count reconciliation so its published figure and this change land together.

## 2. Subject Area values that are not subjects

The Subject Area facet exists only on the archived shelf (`Content.subjectArea`). Local findings:

| Table / column | Distinct values held back | Records | What they are |
|---|---|---|---|
| `Content.subjectArea` | 6 | 70 | bare numbers (`27`, `22` …) — a mis-mapped column. Already refused by the old rule |
| `Article.subject` | 36 | 3,587 | **the journal's own name copied into the subject column** (3,567 are `source = 'Admin'`, i.e. a bulk import mapping; 20 OpenAlex) |
| `Article.subject` | 30 | 35 | classification codes (`05C78`, `11B39`) |
| `Book.subject` | 11 | 14 | short identifiers |
| `Journal.subject` | 0 | 0 | long classification paths are legitimate and are not reported |

**The DOI strings and bibliographic references reported on the screen are not present in the local data**, so their source could not be traced here; production must be queried (the script reports them under the reasons `DOI`, `web address`, `bibliographic reference`). What is confirmed is the cause of the *facet* problem: the old rule (`cleanSubjectArea`) refused titles, numbers and sentences but let any short string through, and `/api/content/filters` read every legacy row into memory to build the list. Now: `src/lib/subjectFacets.ts` also refuses DOIs, web addresses, citations and identifiers; the lists are built by `GROUP BY` in the database; the stored value is never changed. The ingestion mapping defect (journal name in the subject column on the Admin bulk import) is a separate finding and is not fixed here.

## 3. Titles that arrive as markup

Local counts: `Article` 54, `Book` 5, `Content` 90 titles carry an entity or a tag. They are shown as plain text everywhere in the library (`plainTitle`, `abstractToPlainText`); the stored values are untouched. Cleaning them at the source is a separate change.
