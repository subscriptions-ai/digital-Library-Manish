# Open Library / Internet Archive full-text eligibility audit (Phase 2F, read-only)

**Question.** Of the Books we hold only as metadata from Open Library (`source` = `OpenLibraryDump` or `OpenLibrary`), which have a file the Internet Archive lets anyone read **and** a licence that clearly allows us to redistribute it?

This phase is an audit. It writes nothing: no Book, status, department, licence, access, rights, file address, checkpoint or provider-health row, and it downloads no book file. Full-text ingestion is a later, separately approved step.

## Architecture

```
Book (metadata only)
 → match: its Open Library EDITION id → its ISBN → its WORK id          (olFulltextClient.ts, olFulltextAudit.ts)
 → Open Library says how it is accessed: full | borrow | restricted      (api/books jscmd=data; search.json for works)
 → only for `full`: the Internet Archive item's metadata                 (archive.org/metadata/<id>)
 → identity cross-check (same edition / ISBN / work), access-restriction flag, licenseurl, files
 → verdict                                                               (olFulltext.ts, pure)
```

| File | Role |
|---|---|
| `src/lib/ingestion/books/olFulltext.ts` | The rules, pure: matching, licence reading, file choice, the verdict. |
| `src/lib/ingestion/books/olFulltextClient.ts` | The polite client: ≥1.1 s between requests, batches of 20 keys, a hard request budget, backoff on 5xx / timeouts, `Retry-After` honoured (capped), a stop after repeated failures, a User-Agent naming us. It does **not** use the engine's source-health bookkeeping, so an audit cannot pause or count against a provider. |
| `src/lib/ingestion/books/olFulltextAudit.ts` | Reads the Books in one `READ ONLY` transaction (Postgres refuses a write), runs the lookups, builds the report, and `diffReports` for comparing two audits. |
| `scripts/ol-fulltext-audit.ts` | The CLI. Prints the report and before/after fingerprints (Book table, provider health, settings/checkpoints, sweeps, other counts). |
| `scripts/test-ol-fulltext.ts`, `scripts/fixtures/ol-ia/` | 55 checks on a private database with a fake transport and clock; the Archive items are trimmed copies of real metadata. |

Run it: `npx tsx scripts/ol-fulltext-audit.ts [--source OpenLibraryDump,OpenLibrary] [--limit N] [--max-requests N] [--gap-ms N] [--json file] [--previous report.json]`. On production, start with `--limit 200` and read the numbers before a full run (a full run is about one request per 20 Books for the editions plus one per openly readable item, at 1.1 s each).

## Rights rules

Readable, borrowable, downloadable and "preview available" are **access** words. None of them is permission to copy. A Book is a **full-text candidate** only if all of these hold:

1. Open Library says the item is openly readable (`full` / `public`).
2. The Internet Archive item is not access-restricted (a lending item is borrow-only even if Open Library says readable).
3. Its `licenseurl` names a licence our existing book policy allows (`licenceAllowsCommercialUse`): **CC0, Public Domain Mark, CC BY, CC BY-SA, CC BY-ND**. Free-text `rights`, collection names and the Archive's own "possible copyright status: NOT_IN_COPYRIGHT" flag are **not** rights; a flag alone is reported as a note for a person and is never a candidate.
4. The item is the same edition as the Book (the Archive's `openlibrary_edition`, an ISBN in common, or for a work-level Book the work id). Otherwise: ambiguous.
5. A PDF or EPUB without DRM exists (ACS / LCP / "encrypted" copies are never chosen). It is named, never downloaded.

The licence is the **uploader's declaration** on the item. A candidate is a candidate for review and ingestion, never an automatic publication. Anything else stays Metadata Only plus an external link.

## Verdicts (every Book is in exactly one)

`reuseSafe` (candidate) · `readableLicenceUnknown` · `readableLicenceRestricted` (e.g. CC BY-NC-ND) · `borrowOnly` · `previewOnly` (search-inside, print-disabled, restricted) · `noFile` · `ambiguous` (a shared ISBN, several archive items for a work, or identity not confirmed) · `unmatched` · `couldNotCheck` (source down, rate limited, or the budget ended — never reported as "unmatched").

Information only, never a verdict: `otherEditionOnArchive.<access>` counts Books whose own edition has no Archive item although another edition of the work does.

## Real audit — dev catalogue, 2026-10-27 13:01 IST

The dev catalogue holds 99 Open Library Books (all from the subject-search provider, `source = OpenLibrary`; there are no `OpenLibraryDump` rows in dev, so the dump-edition path is covered by the tests and by the production run described above).

| | |
|---|---|
| Books audited | 99 (8 requests, 10 s) |
| Matched to Open Library | 99 |
| Openly readable (any licence) | **0** |
| **Full-text candidates** | **0** |
| Borrow only | 37 |
| Preview / print-disabled only | 21 |
| No file (own edition has no Archive item) | 41 (13 of them have another edition on the Archive: 9 restricted, 3 borrow, 1 unknown) |
| Licence unknown / restricted / ambiguous / unmatched / could not check | 0 |

By department: all 99 are unassigned Drafts with a "Physiotherapy" suggestion, so the estimated candidates by department are none. Re-running the audit gave the same verdicts (0 Books changed). Before and after: every Book column, provider health, settings/checkpoints, sweeps and the other counts are identical.

**Reading.** This is the expected shape for a metadata-only Open Library import: most scanned modern textbooks are lending-library items. The route to real full text is more likely through DOAB / OAPEN, which declare a licence, than through Open Library; the audit is there so that the production `OpenLibraryDump` set (older editions, more public-domain scans) can be measured before anyone builds ingestion.

## Not done, on purpose

No file is downloaded or stored; no Book changes status, department, licence, access or rights; no schema change; no provider-health or checkpoint change. If ingestion is approved later: the database stores metadata and a file reference, the file goes to the existing object storage (never PostgreSQL), and each candidate gets a per-title rights review first.
