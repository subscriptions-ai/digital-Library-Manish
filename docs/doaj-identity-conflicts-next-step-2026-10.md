# DOAJ identity conflicts — the rule for a later import (2026-10-28)

**Status: rule only.** Nothing imports a conflict row, and no code path creates a Journal from one. `planDistinctImports()` in
`src/lib/ingestion/doajConflicts.ts` is a pure function (it reads items, writes nothing) that pins who may ever become importable, so a future
import cannot be written broader than this. Building the import itself is a separate approval.

## Where it stands

- A conflict is a DOAJ journal whose ISSN and e-ISSN we do not hold but whose title equals a held journal's. The last production run found **26**:
  19 read as likely distinct, 5 as likely duplicate or renamed, 2 as ambiguous. Those are **verdicts** (a reading aid), not decisions.
- **Recorded decisions in production on 2026-10-28: 0** (`AppSetting` rows `doaj.conflict.v1:*`). So nothing has been accepted as distinct yet, and
  the plan below returns an empty importable list today. Existing decisions, when there are some, are kept: the rule only reads them.

## The rule

A row may become importable only when **all** of these hold:

1. A named administrator explicitly chose **Accept as distinct** (`decision = distinct`). A "likely distinct" verdict nobody accepted is refused.
   `blocked`, `hold` and undecided rows are refused, each with its own reason.
2. The decision still stands on its evidence: the fingerprint matches and the row is not "look again". A stale decision is refused until re-decided.
3. Its ISSN and e-ISSN are not held **now** (re-checked at write time). The title that caused the conflict plays no part: nothing is matched, merged
   or replaced by title, and no existing journal is edited.
4. A person's "distinct" outranks a "duplicate" verdict, but the plan flags it (`contradictsVerdict`) so the preview shows it prominently.

## What an import would create (when separately approved)

- Status **NeedsReview**, never Accepted. **Not MetadataOnly either**: since 2026-10-27 a MetadataOnly journal is public the instant it exists, so it
  would skip the second look. A person (or the journal review) promotes it afterwards.
- Fields from the DOAJ row only, as the DOAJ import writes them (title, ISSN/e-ISSN, publisher, country, subjects, homepage, licence declaration).
  No department is guessed; the journal review assigns it.
- One audit entry per journal, and a preview first (a server snapshot with a token, as the one-off import does), re-checked against the catalogue as
  it is at apply time. A changed identifier or a newly held ISSN leaves that row out and says so.

## What is deliberately not done

- No import, no endpoint, no button, no environment gate. No decision is created or changed by this work.
- No bulk acceptance. The 19 "likely distinct" are not imported; each needs a person's decision first.
- Duplicate pairs that already exist are a different problem: see `duplicate-journal-pairs-plan-2026-10.md`.
