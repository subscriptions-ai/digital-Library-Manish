# Duplicate journal pairs — plan (2026-10-27)

**Status: plan only.** Nothing is merged, no Journal or Article row was changed, and no merge code exists yet. The numbers come from a read-only
pass over production on 2026-10-27 (one `READ ONLY` transaction; Postgres refuses writes in it). Every step below is a separate approval.

## 1. What is there

A "pair" is two Journal rows that share an ISSN or e-ISSN value (including one row's ISSN being the other's e-ISSN). Production holds **87**.
The DOAJ check found 19 of them because it only looks at journals DOAJ lists; the whole table holds more.

| | Pairs |
|---|---:|
| Both rows have a public status (Accepted / Metadata Only): **the same title is listed twice on the public site now** | 34 |
| One public, one hidden (NeedsReview) | 21 |
| Neither public (two NeedsReview candidates) | 32 |
| Same normalised title | 63 |
| Different title (a rename, a translation, a spelling: needs a person) | 24 |
| Same publisher | 60 |
| Both rows hold articles (all published) | 30 |
| Published articles on journals in a pair | 5,482 |

By where the rows came from: Crossref NeedsReview + Crossref NeedsReview 32; DOAJ Accepted + older MetadataOnly record 28; Crossref NeedsReview + DOAJ
(Accepted 13, MetadataOnly 8); DOAJ MetadataOnly + older record 4; two DOAJ Accepted 2.

Why `ISSN is unique` did not prevent it: the DOAJ import stores `issn = print ISSN, or the online ISSN when there is no print one`, and leaves `eissn`
empty; Crossref and OpenAlex listings store the print ISSN in `issn` and the online one in `eissn`. The same journal therefore arrives as
`(issn = A, eissn = null)` and `(issn = B, eissn = A)`, and no single column collides. The 4,302-row finding in the first DOAJ audit was this pattern counted
twice by a bug in the audit; the real figure is 87.

What refers to a Journal (read from the production schema): `Article.journalId` (the only foreign key), `Article.journalIssn`, `Article.parentId`
(`parentKind = 'Journal'`), `IngestionRun.journalId`, `LibraryEvent.journalId` and `LibraryEvent.journalIssn`.

## 2. Principles

1. Nothing automatic. A merge happens only for a pair a person approved, from a preview, and never by a scheduled job or the engine.
2. Nothing is deleted. The row that goes away is retired and kept, so every old ISSN and id still resolves and a merge can be reversed.
3. Rights stay with the authority. DOAJ's declaration (licence, non-commercial flag) is never overwritten by a Crossref or OpenAlex listing.
4. The 24 different-title pairs and any pair with different publishers are decided one at a time.

## 3. Phases

**Phase 0 — report (read only, no approval needed beyond this plan).** `scripts/journal-duplicate-pairs.ts`: every pair, both rows side by side,
the proposed survivor and why, article counts, and flags (different publisher, different title, both rows have articles, the same DOI on both sides).
Run on production the same way the DOAJ audit was (read-only transaction). Output is the list a person reviews.

**Phase 1 — decisions (record only).** Reuse the pattern of DOAJ Identity Conflicts: an admin screen with Approve merge / Not a duplicate / Hold per pair, stored as
`AppSetting` rows with an audit entry. Nothing changes in the catalogue. A decision made on evidence that later changes shows "look again".

**Phase 2 — preview.** For the approved pairs: exactly what would move (article ids, fields that would be filled, the identifiers that would be kept),
re-checked against the catalogue as it is now, held as a server snapshot with a token (the same mechanism as the one-off import). Writes nothing.

**Phase 3 — apply, one pair per transaction, from the preview only.** For each pair, in one transaction:
1. re-read both rows; stop for this pair if either changed since the preview or the identifiers no longer cross;
2. repoint `Article.journalId`, `Article.journalIssn` and `Article.parentId` from the retired row to the survivor; repoint `IngestionRun.journalId`
   and `LibraryEvent.journalId` / `journalIssn`; where the same DOI exists on both sides, keep the survivor's article and report the other;
3. fill the survivor's empty fields (e-ISSN, publisher, country, homepage, subjects) from the retired row. **Never** its status, licence, non-commercial flag, rights basis or department when set;
4. recompute the survivor's `articleCount`, `volumeCount`, `issueCount`, `firstYear`, `lastYear` from its articles;
5. retire the other row (below), write one `AppSetting` mapping row `journal.merge.v1:<retiredId>` holding both ids, every identifier, and the ids of the articles moved (so it can be reversed), and one audit entry.

**Phase 4 — verify.** Orphan check (no Article points at a retired row), the public count falls by exactly the number of both-public pairs merged, no article lost,
every retired ISSN still resolves (see below), spot checks in the browser.

## 4. Choosing the survivor (a rule, shown in Phase 0 before anyone approves)

In order: the row DOAJ declared (rights basis `DOAJ declaration`, so its licence is authoritative); then the better status (Accepted, then Metadata Only, then NeedsReview);
then the row holding more published articles; then the older row. A pair where the rule is a tie, or where the publishers differ, is marked "needs a person".

## 5. How the retired row is kept

- **No schema change (recommended for the first batches):** the retired row is set to `Rejected` (hidden by the public rule), its `rightsBasis` says "merged into <survivor>",
  and the mapping row above lets the journal routes answer a request for the old ISSN or id with a redirect to the survivor instead of a 404. Its identifiers stay, so ISSN uniqueness still holds.
- **With a schema change (if approved later):** an additive `mergedIntoId` column on `Journal` and a redirect on it; cleaner, and the mapping row becomes unnecessary. This is one nullable column and no data change.

Changing a status is part of a merge by nature, which is why it is a separate approval and why only the retired row is touched.

## 6. Preventing new ones (a separate decision; the duplicate rule is NOT changed here)

The cause is two writers that spell the same journal differently. Options, smallest first:
1. Make both writers look a candidate up by every identifier it carries against both columns (the DOAJ check already does; the listing writer does too, so what remains is history and order of arrival).
2. Store the DOAJ online-only title the way the listings do (print in `issn`, online in `eissn`) for new imports only. A change to the import's output, so it needs its own approval and tests.
3. A normalised identifier table (one row per ISSN value, unique, pointing at a Journal) so the database refuses a second journal for any identifier. Schema change; the real fix, applied after the merge.

## 7. Tests the build will need

Pairs of every shape (print/online swapped, shared e-ISSN, online-only); survivor rule and ties; different publishers and titles refused for automatic handling;
rights and department never overwritten; articles moved with no loss and no duplicate DOI; counters recomputed; retired row hidden and its ISSN redirecting; reversal from the mapping row;
idempotence; a changed row between preview and apply is skipped; the engine and every importer ignore retired rows; a private database only.

## 8. Approvals, in order

1. This plan, and Phase 0 on production (read only).
2. After reading the Phase 0 list: the decision screen (Phase 1), which writes only decision records.
3. Phase 2 and 3 for a first small batch (for example the two-DOAJ pairs and the same-publisher, same-title pairs), then the rest.
4. Whether to add `mergedIntoId`, and any prevention change.

## 9. Addendum, 2026-10-28 (still plan only: no data or schema was touched)

**The numbers, reconciled.** Production holds **87** pairs; re-measured read-only on 2026-10-28 with the same results (34 both public, 21 one public,
32 neither; 63 same title, 24 different). The "19" in circulation is the subset the DOAJ identity-conflict check can see (it only looks at journals DOAJ
lists), and it is a different thing from the 26 DOAJ identity conflicts (a DOAJ journal we do NOT hold, whose title matches one we do). Merging the 87
and accepting conflicts as distinct are independent decisions; do the merge first so an accepted-distinct import cannot add a new pair.

**What changed since the plan was written.** Public visibility is now status-only (24,209 public on 2026-10-28). The 34 both-public pairs therefore show
one title twice on the public site as before, but the 21 one-public pairs matter more than they did: a hidden twin is one status change away from being listed.

**Source metadata preservation.** `Journal` has no free-form metadata column, so what survives a merge is what the columns hold. Before retiring a row,
the mapping row `journal.merge.v1:<retiredId>` must store the retired row *whole* (every column, including `rightsBasis`, `rightsVerifiedBy`,
`licence`, `licenceIsNC`, `homepage`, `subjects`, `createdAt`, `lastIngestedAt`, `fetchCursor`, `nextEligibleAt`), not just identifiers, so nothing about where it
came from is lost and a reversal restores it exactly. The survivor keeps its own rights fields; the retired row's ISSN/e-ISSN that the survivor lacks are
copied into the survivor's empty `eissn`, and any identifier that cannot fit (the survivor already has both) stays resolvable through the mapping row.

**Redirects.** Both journal routes (`/api/library/journal/:key`, `/volume`) already accept an id, ISSN or e-ISSN. Add one lookup: when a key matches no
public journal, consult `journal.merge.v1:*` (by retired id or any stored identifier) and answer **301** to the survivor. The retired row is `Rejected`,
so every public list already excludes it; the redirect only keeps old links and citations alive.

**Rollback, exactly.** Per pair, from its mapping row, in one transaction: (1) re-read the survivor; refuse if a later merge also targeted it; (2) set the
retired row back to its stored columns; (3) move back only the article ids listed in the mapping row (articles added to the survivor since stay with it);
(4) clear the survivor fields the merge filled, only where they still hold the value the merge wrote; (5) recompute both rows' counters; (6) delete the
mapping row and write one audit entry. A pair whose survivor changed in the meantime is reported, not forced. A full database backup (`npm run backup`)
is taken before the first batch, and the batches are small so a bad rule is seen on ten pairs, not eighty-seven.

**Ordering with the other open work.** Deploy pagination first (production department pages are currently 1.2 to 1.7 MB); merge a small first batch
(the two both-DOAJ pairs and the same-title, same-publisher pairs); only then consider accepting any DOAJ identity conflict as distinct.
