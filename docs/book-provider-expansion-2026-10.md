# Book provider expansion — runbook (2026-10-16)

Local only; not deployed. Schema: `IngestionRun` gains `checked`, `accounting`, `unaccounted` (additive; `prisma db push` applies them).

## What each source is allowed to do
| Source | Class | Mode | Rights | Department |
|---|---|---|---|---|
| DOAB, OAPEN, Open Textbook Library, NCBI Bookshelf | Open / strong rights | Continuous | licence declared per title | classifier |
| NLM Catalog | Metadata | Continuous (default on; `BOOKS_NLM=0` off) | none — Metadata Only | NLM class is a controlled code, so a health book can be placed with confidence |
| Crossref Books | Metadata | Quick Import + Bulk; continuous only with `BOOKS_CROSSREF=1` | none — Metadata Only | no code → review at best |
| Pressbooks Directory | Metadata | Quick Import + Bulk; continuous only with `BOOKS_PRESSBOOKS=1` | read from each book's own site; unknown → Metadata Only | no code → review at best |
| Open Library (search) | Metadata | targeted department runs | none | review-first |
| Open Library (data dump) | Metadata | **Bulk only** | none — Metadata Only | strong-only: unclear editions are skipped, never queued |
| Google Books | Enrichment | admin button/API, needs `GOOGLE_BOOKS_API_KEY` | never touched | n/a (fills empty fields only) |

Crossref Books and Pressbooks are off in the rotation because the classifier can never place their books with confidence (no controlled code), so each turn would add review Drafts.

## Run accounting
Every Book run satisfies `checked = added + already held + review + skipped + failed`. A run that does not is stored `accounting = 'ACCOUNTING_ERROR'` with the gap, and shows in Admin (red badge in Run activity; banner above the provider table). The OTL "80 checked, nothing else" bug: records the provider lists as unchanged since the last sync were dropped from the batch but counted in `checked`. They are now counted as skipped, with the reason.

## Open Library data dump
1. Download `ol_dump_editions_YYYY-MM-DD.txt.gz` (about 10 GB) to the server.
2. Admin → Data ingestion → Bulk expansion → Open Library → Change → file path.
3. Run bulk sync (the limit counts LINES read). Pause any time; run again to resume from the saved line. A different file starts from the top.
Authors are not in the editions dump (they are keys into the authors dump); the edition's own "by" statement is used when present.

## Not built (evaluated)
- **Project Gutenberg**: `pg_catalog.csv` is official and public-domain; useful for Arts/Humanities/Education only. Plan: a CSV provider, public-domain rights, Arts/Education only.
- **Library of Congress** `loc.gov/books/?fo=json`: answers a Cloudflare challenge (HTTP 403) from this host. Not integrable until that is resolved with LoC; supplemental only.
- **NCBI Bookshelf review queue**: all drafts are held for department confidence (close call / words only), not rights or metadata. Do not loosen thresholds; linking a Bookshelf title to its NLM Catalog record would give it the controlled code it lacks.
