import { licenceAllowsCommercialUse } from '../eligibility.js';
import { audit } from '../audit.js';
import type { CandidateRow } from './olFulltextAudit.js';

/**
 * FULL-TEXT CANDIDATE REVIEW: the saved list of Books the Phase 2F audit found openly readable under a reuse licence, and a person's decision on each —
 * Approve for future ingestion, Hold, or Reject. A decision is a RECORD. It downloads nothing, stores no file, and changes nothing about the Book (status, department, licence,
 * access, file address, source address); the only rows written here are `AppSetting` rows under `fulltext.candidate.v1:<bookId>` and one run summary, plus an audit entry.
 * No schema change: one small row per candidate, so two reviewers deciding different Books never overwrite each other.
 *
 * An Approve is refused unless BOTH are on the row: the edition is confirmed (the Archive item names this Open Library edition, shares its ISBN, or — for a work-level Book — its
 * work) AND the declared licence is one our book policy allows (CC0, Public Domain Mark, CC BY, CC BY-SA, CC BY-ND), on an item that is openly readable, not access-restricted, with a
 * PDF/EPUB. "Full", downloadable, borrowable, preview and the Archive's "possibly out of copyright" flag are never enough, and anything unclear is a Hold, not an Approve.
 * The licence is the uploader's declaration, so an approval means "worth ingesting"; ingestion itself must re-check the live source and each file before it stores anything.
 */

export const PREFIX = 'fulltext.candidate.v1:';
export const RUN_KEY = 'fulltext.candidates.run.v1';
export const MAX_SAVED = 20_000;
export type Decision = 'approve' | 'hold' | 'reject';
export type Decided = { decision: Decision; by: string | null; at: string; note: string | null; evidenceFingerprint: string };
export type Stored = {
  v: 1; row: CandidateRow; firstSeenAt: string; lastSeenAt: string;
  /** The latest audit no longer finds it a candidate (its source changed, or the Book is gone). Kept so a decision is never silently lost. */
  stale: boolean; staleSince?: string;
  decision: Decided | null; history: Decided[];
  /** The source facts changed after the decision was made: it must be looked at again. */
  sourceChangedSinceDecision: boolean;
};
export type RunMeta = { savedAt: string; savedBy: string | null; reportHash: string; booksAudited: number; booksInScope: number; wholeScope: boolean; incomplete: boolean; incompleteReasons: string[]; counts: Record<string, number>; licences: Record<string, number>; candidates: number; requests: Record<string, number> };
export type State = 'pending' | 'approved' | 'approvedNeedsReview' | 'hold' | 'rejected';

type Db = any;
export const keyOf = (bookId: string) => `${PREFIX}${bookId}`;

export function stateOf(s: Stored): State {
  if (!s.decision) return 'pending';
  if (s.decision.decision === 'approve') return s.stale || s.sourceChangedSinceDecision ? 'approvedNeedsReview' : 'approved';
  return s.decision.decision === 'hold' ? 'hold' : 'rejected';
}

/** Why this candidate may NOT be approved right now. Empty: it may. Pure. */
export function approvalProblems(s: Pick<Stored, 'row' | 'stale'>, book?: { sourceRecordId: string | null; isbn: string | null } | null): string[] {
  const out: string[] = []; const r = s.row; const e = r.evidence;
  if (s.stale) out.push('the latest audit no longer finds this a candidate');
  if (!e || !e.identityBasis) out.push('the edition match is not confirmed');
  if (!r.licence || !licenceAllowsCommercialUse(r.licence)) out.push('no licence that allows our use is declared');
  if (!r.licenceUrl) out.push('there is no licence address to point to');
  if (r.access !== 'full' || e?.olAvailability !== 'full') out.push('the item is not openly readable');
  if (e?.archiveRestricted) out.push('the Archive item is access-restricted');
  if (!r.file || !/^(PDF|EPUB)$/.test(r.format)) out.push('there is no PDF or EPUB without DRM');
  if (book !== undefined) {
    if (!book) out.push('the Book no longer exists');
    else if ((book.sourceRecordId ?? null) !== (r.olId ?? null) || (book.isbn ?? null) !== (r.isbn ?? null)) out.push('the Book\'s Open Library id or ISBN changed since the audit');
  }
  return out;
}

const now = () => new Date().toISOString();

/**
 * Save an audit's candidates for review. Existing decisions are kept. A candidate whose source facts changed since it was decided is flagged; when the audit covered the whole scope, a stored
 * candidate that is no longer one is marked stale (not deleted). Writes only AppSetting rows.
 */
export async function saveCandidates(db: Db, report: { candidates: CandidateRow[]; reportHash: string; booksAudited: number; booksInScope: number; wholeScope: boolean; incomplete: boolean; incompleteReasons: string[]; counts: Record<string, number>; licences: Record<string, number>; requests: Record<string, number> }, who: { id?: string; email?: string } | null) {
  const t = now(); let added = 0, updated = 0, flagged = 0, madeStale = 0;
  const cands = report.candidates.slice(0, MAX_SAVED); const seen = new Set<string>();
  for (const row of cands) {
    seen.add(row.bookId);
    const cur = await db.appSetting.findUnique({ where: { key: keyOf(row.bookId) } });
    const prev: Stored | null = cur?.value?.v === 1 ? cur.value : null;
    const changed = !!prev?.decision && prev.decision.evidenceFingerprint !== row.sourceFingerprint;
    const value: Stored = prev
      ? { ...prev, row, lastSeenAt: t, stale: false, staleSince: undefined, sourceChangedSinceDecision: prev.decision ? changed : false }
      : { v: 1, row, firstSeenAt: t, lastSeenAt: t, stale: false, decision: null, history: [], sourceChangedSinceDecision: false };
    if (prev) { updated++; if (changed && !prev.sourceChangedSinceDecision) flagged++; } else added++;
    await db.appSetting.upsert({ where: { key: keyOf(row.bookId) }, create: { key: keyOf(row.bookId), value: value as any, updatedBy: who?.email ?? null }, update: { value: value as any, updatedBy: who?.email ?? null } });
  }
  if (report.wholeScope && !report.incomplete) {
    const all = await db.appSetting.findMany({ where: { key: { startsWith: PREFIX } } });
    for (const a of all) { const s: Stored = a.value; if (s?.v === 1 && !seen.has(s.row.bookId) && !s.stale) { await db.appSetting.update({ where: { key: a.key }, data: { value: { ...s, stale: true, staleSince: t } as any, updatedBy: who?.email ?? null } }); madeStale++; } }
  }
  const meta: RunMeta = { savedAt: t, savedBy: who?.email ?? null, reportHash: report.reportHash, booksAudited: report.booksAudited, booksInScope: report.booksInScope, wholeScope: report.wholeScope, incomplete: report.incomplete, incompleteReasons: report.incompleteReasons, counts: report.counts, licences: report.licences, candidates: cands.length, requests: report.requests };
  await db.appSetting.upsert({ where: { key: RUN_KEY }, create: { key: RUN_KEY, value: meta as any, updatedBy: who?.email ?? null }, update: { value: meta as any, updatedBy: who?.email ?? null } });
  return { added, updated, flagged, madeStale, saved: cands.length, truncated: report.candidates.length > MAX_SAVED };
}

export type ListQuery = { state?: string; department?: string; source?: string; q?: string; page?: number; pageSize?: number };
export type Item = Stored & { state: State; problems: string[] };

export async function listCandidates(db: Db, q: ListQuery = {}) {
  const rows = await db.appSetting.findMany({ where: { key: { startsWith: PREFIX } } });
  const run: RunMeta | null = (await db.appSetting.findUnique({ where: { key: RUN_KEY } }))?.value ?? null;
  const all: Item[] = rows.map((r: any) => r.value).filter((v: any) => v?.v === 1).map((s: Stored) => ({ ...s, state: stateOf(s), problems: approvalProblems(s) }));
  const tally = (f: (i: Item) => string) => { const o: Record<string, number> = {}; for (const i of all) { const k = f(i); o[k] = (o[k] ?? 0) + 1; } return o; };
  const summary = { total: all.length, byState: tally(i => i.state), byDepartment: tally(i => i.row.department), bySource: tally(i => i.row.source ?? '—'), byLicence: tally(i => i.row.licence), byFormat: tally(i => i.row.format) };
  const needle = (q.q ?? '').trim().toLowerCase();
  let list = all.filter(i => (!q.state || q.state === 'all' || i.state === q.state) && (!q.department || i.row.department === q.department) && (!q.source || i.row.source === q.source)
    && (!needle || [i.row.title, i.row.authors, i.row.isbn, i.row.olId, i.row.ocaid].some(x => String(x ?? '').toLowerCase().includes(needle))));
  list.sort((a, b) => a.row.department.localeCompare(b.row.department) || a.row.title.localeCompare(b.row.title) || a.row.bookId.localeCompare(b.row.bookId));
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25)); const pages = Math.max(1, Math.ceil(list.length / pageSize)); const page = Math.min(pages, Math.max(1, q.page ?? 1));
  return { run, summary, total: list.length, page, pages, pageSize, items: list.slice((page - 1) * pageSize, page * pageSize) };
}

export class CandidateError extends Error { constructor(public code: 'NOT_FOUND' | 'BAD_REQUEST' | 'NOT_ELIGIBLE' | 'CHANGED', message: string, public status = 400, public problems: string[] = []) { super(message); } }

/** Record a person's decision. Never touches the Book; Approve only when the evidence is complete. */
export async function decide(db: Db, bookId: string, decision: unknown, who: { id?: string; email?: string } | null, note?: unknown, expectedFingerprint?: unknown) {
  if (!['approve', 'hold', 'reject'].includes(String(decision))) throw new CandidateError('BAD_REQUEST', 'Decision must be approve, hold or reject.');
  const d = decision as Decision; const text = note == null || note === '' ? null : String(note).trim().slice(0, 500) || null;
  if (d !== 'approve' && d !== 'hold' && !text) throw new CandidateError('BAD_REQUEST', 'Say briefly why you reject this candidate.');
  const rec = await db.appSetting.findUnique({ where: { key: keyOf(bookId) } });
  const s: Stored | null = rec?.value?.v === 1 ? rec.value : null;
  if (!s) throw new CandidateError('NOT_FOUND', 'That Book is not in the candidate list.', 404);
  if (expectedFingerprint && String(expectedFingerprint) !== s.row.sourceFingerprint) throw new CandidateError('CHANGED', 'The source facts for this candidate changed since you opened it. Reload and look again.', 409);
  if (d === 'approve') {
    const book = await db.book.findUnique({ where: { id: bookId }, select: { sourceRecordId: true, isbn: true } });     // read only
    const problems = approvalProblems(s, book);
    if (problems.length) throw new CandidateError('NOT_ELIGIBLE', `Not approved: ${problems.join('; ')}. Hold it instead if you are unsure.`, 409, problems);
  }
  const rec2: Decided = { decision: d, by: who?.email ?? null, at: now(), note: text, evidenceFingerprint: s.row.sourceFingerprint };
  const same = s.decision && s.decision.decision === d && (s.decision.note ?? null) === text && s.decision.evidenceFingerprint === rec2.evidenceFingerprint;
  if (same) return { ...s, state: stateOf(s), problems: approvalProblems(s), unchanged: true };
  const next: Stored = { ...s, decision: rec2, history: [...(s.decision ? [s.decision] : []), ...s.history].slice(0, 10), sourceChangedSinceDecision: false };
  await db.appSetting.update({ where: { key: keyOf(bookId) }, data: { value: next as any, updatedBy: who?.email ?? null } });
  await audit(who as any, 'FULLTEXT_CANDIDATE_DECISION' as any, { bookId, decision: d, ocaid: s.row.ocaid, licence: s.row.licence });
  return { ...next, state: stateOf(next), problems: approvalProblems(next), unchanged: false };
}
