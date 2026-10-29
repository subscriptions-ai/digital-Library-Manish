# Books for thin departments, and departments for unassigned books (2026-10-29)

What was written to production on 2026-10-29, by which run, how to check it and how to undo it. Every run went through the same path: frozen manifest with a sha256, a dry run on production, a canary, the rest in audited batches, and a read-only verifier (0 problems each time). Rows are `Book` records only; nothing existing was changed by the first group, and the second group changed only `domain` and `metadata.reviewAssignment` on Drafts.

## 1. New books (created; Published, link-only, Creative Commons, no file hosted)

Rule (`src/lib/ingestion/books/deptFill.ts`): the department's word in the title, or OpenAlex's subject classification mapping to the department **and** the classifier reading the topic wording on the same department; a Creative Commons licence declared on the book's own open-access record; a publisher / book-platform host (self-deposit sites such as Zenodo and Figshare are held); English (title and abstract checked, OpenAlex mislabels some); a whole book (no chapters, proceedings, workshop volumes, "[Working Title]" placeholders); year 2001 or later (the saved policy); not already held by DOI, ISBN, source id, fingerprint or title + author. Humanities wording is held for the engineering departments.

| Run id | Books | Departments | sha256 (manifest) |
|---|---:|---|---|
| `book-dept-fill-2026-10-29-a7c3e915` | 121 | Nano Technology 111, Multidisciplinary 8, Ayurveda 1, Applied Sciences 1 | `2073a1534afd4b77…` |
| `book-min-dept-2026-10-29-2001plus` | 252 | Mechanical 79, Civil 55, Electrical 34, E&TC 34, Material Science 32, Applied Mechanics 12, Multidisciplinary 5, Chemical Eng 1 | `04539bd41613ced3…` |
| `book-min-dept2-2026-10-29` | 255 | Civil 95, Material Science 59, Mechanical 39, Electrical 33, E&TC 21, Applied Mechanics 8 | `18a235be2c3c284f…` |
| `book-next-dept-2026-10-29` | 663 | Management 340, Architecture 274, Physiotherapy 49 | `7663c9db5993574d…` |

Not applied: `book-min-dept-2026-10-29-1980s` (1 book, an ACI concrete-committee standard; sha `b47e33603e2b3b54…`). Licensed open access before 2001 essentially does not exist, so the 1980 floor asked for adds nothing.

Undo (rows of one run, from its audit entries; check the ids first):
```sql
select jsonb_array_elements(meta->'inserted')->>'id' from "IngestionAudit"
 where action = 'BOOK_SOURCE_IMPORT' and meta->>'runId' = '<run id>';
-- then delete from "Book" where id in (...) and source in ('OpenAlex','DOAB','OAPEN') and status = 'Published';
```

## 2. Departments for books that had none (Drafts stay Drafts)

Applied with `scripts/book-department-assign.cjs` (one conditional UPDATE per book: still a Draft, Ingested, no department, same title). It writes the same note and the same `REVIEW_BATCH_ASSIGN` audit entry as the app's own review-assign, so Review History shows it. The app's gate `REVIEW_AUTO_ASSIGN_ENABLED` is off in production, which is why the script was used.

| Run id | Books | Rule | sha256 (plan) |
|---|---:|---|---|
| `book-dept-assign-2026-10-29-v2high` | 6,774 | classifier v2, tier High (a code and the title agree) | `208863a860bdfa84…` |
| `book-dept-assign-2026-10-29-v2medium` | 5,930 | classifier v2, tier Medium (a clear leader on words, or a narrow lead) | `c373fd9a57e676b6…` |
| `book-dept-assign-2026-10-29-v2low-nlm` | 11,921 | tier Low, NLM catalogue records only, one department clearly ahead (margin ≥ 4) | `e96fd8f1047cd89b…` |

Not assigned (11,883 remain): ties (margin below 4), non-NLM Low records, no usable evidence. A department is never chosen because it is short of books.

Undo (one run):
```sql
update "Book" set domain = null, metadata = metadata - 'reviewAssignment'
 where metadata->'reviewAssignment'->>'runId' = '<run id>' and status = 'Draft';
```

## Scripts
- `scripts/books-dept-fill.ts` (`harvest`, `harvest-otl`, `freeze`) and `scripts/test-books-dept-fill.ts` (39 checks, no database).
- `scripts/book-source-apply.cjs` (hardened: `--expect-db`, audited batches, order-independent author twin check) with `scripts/test-book-source-apply.ts`; `scripts/book-import-verify.cjs` (read-only).
- `scripts/export-unassigned-books.cjs` (read-only export), `scripts/analyse-unassigned-books.ts`, `scripts/build-assign-plan.ts`, `scripts/book-department-assign.cjs`, `scripts/book-department-assign-verify.cjs` (read-only), `scripts/test-book-department-assign.ts`.

## Findings worth keeping
- Production already holds about 380 published nanotechnology-titled books under other departments (Agriculture, Energy, Nursing, Chemistry …) and 47 Ayurveda books under Medical Sciences, Pharmacy and Dental. Re-filing them was offered and declined; it edits existing rows.
- Open Textbook Library adds nothing for the engineering departments: its titles are already in production as Drafts.
- Supply is thin for Chemical Engineering (4 public), Ayurveda (1) and Applied Sciences (1). Remaining routes: an Engineering LibreTexts scraper, a Springer open-access API key.
