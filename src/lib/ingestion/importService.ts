import { ingestionDb as db } from './db.js';
import { audit } from './audit.js';
import { INGESTION_POLICY, minutes } from './policy.js';
import { judgeArticle, type Outcome } from './eligibility.js';
import {
  canonicalFingerprint, findHeldArticles, findJournalByAnyIssn, findPossibleDuplicates, normaliseDoi,
} from './dedup.js';
import { normaliseIssn } from '../ingestionWorker.js';

/**
 * The one-off import: preview first, then write exactly what the preview showed — after checking it again.
 *
 * Two separate steps, joined by a token held on the server:
 *
 *   dry run  — fetch candidates, judge each one with the same rules the engine uses, check what is already
 *              held, and keep the result as a snapshot. Writes nothing to the catalogue.
 *   write    — takes the snapshot's id and nothing else. The records come from the server's own snapshot, not
 *              from anything the browser sends, so an edited request cannot smuggle a record in. Each record is
 *              judged AGAIN at write time against the catalogue as it is now, because an hour may have passed.
 *
 * Records are written one at a time, each in its own small transaction, so a failure on one leaves the rest
 * intact and never leaves a half-made record. A giant transaction around thousands of external calls would do
 * the opposite.
 */

export type Candidate = {
  source: string;
  sourceRecordId?: string | null;
  title: string;
  authors?: string | null;
  doi?: string | null;
  pdfUrl?: string | null;
  journalName?: string | null;
  issn?: string | null;
  publisherName?: string | null;
  volume?: any;
  issue?: any;
  year?: number | null;
  subject?: string | null;
  openAccess?: boolean;
  licence?: string | null;
  department: string;
  /** False when the file's host is one our server cannot fetch from, so it could not open in the reader. */
  fileOpensHere?: boolean;
};

export type Classified = Candidate & {
  key: string;
  outcome: Outcome;
  access?: 'ViewableHere' | 'LinkOnly';
  status?: 'Published' | 'Draft';
  licenceVerdict?: string;
  reasons: string[];
  /** Filled in by the write step. */
  result?: 'added' | 'held' | 'rejected' | 'review' | 'failed';
  resultDetail?: string;
};

export type PreviewSummary = {
  found: number;
  eligible: number;
  viewable: number;
  metadataOnly: number;
  alreadyHeld: number;
  needsReview: number;
  rejected: number;
  errors: number;
};

const toWork = (c: Candidate) => ({
  source: c.source, sourceRecordId: c.sourceRecordId ?? null, doi: c.doi ?? null, title: c.title, authors: c.authors ?? null, year: c.year ?? null,
});

/** Judge every candidate, in a handful of queries. Used by both the dry run and the write step (with fresh facts). */
export async function classifyCandidates(cands: Candidate[]): Promise<Classified[]> {
  const works = cands.map(toWork);
  const held = await findHeldArticles(works);

  // The journal each belongs to, if we already hold it (by either of its ISSNs).
  const journalByIssn = new Map<string, any>();
  for (const c of cands) {
    const n = normaliseIssn(c.issn);
    if (n && !journalByIssn.has(n)) journalByIssn.set(n, await findJournalByAnyIssn([n]));
  }
  // Records with no DOI that share a title and year with one already in the same journal.
  const dupes = new Map<number, string>();
  const perJournal = new Map<string, number[]>();
  cands.forEach((c, i) => {
    const j = journalByIssn.get(normaliseIssn(c.issn) || '');
    if (j && !normaliseDoi(c.doi)) (perJournal.get(j.id) || perJournal.set(j.id, []).get(j.id)!).push(i);
  });
  for (const [jid, idx] of perJournal) {
    const found = await findPossibleDuplicates(jid, idx.map(i => works[i]));
    for (const [k, articleId] of found) dupes.set(idx[k], articleId);
  }

  const seen = new Set<string>();
  return cands.map((c, i) => {
    const key = canonicalFingerprint(toWork(c));
    const j = journalByIssn.get(normaliseIssn(c.issn) || '') || null;
    // The same record listed twice in one import (under two departments) is held the second time, not added twice.
    const duplicateInBatch = seen.has(key);
    const d = judgeArticle(
      { title: c.title, doi: c.doi, pdfUrl: c.pdfUrl, licence: c.licence, year: c.year },
      {
        journal: j ? { licenceIsNC: j.licenceIsNC, rightsBasis: j.rightsBasis } : null,
        held: held.get(i) ?? (duplicateInBatch ? { articleId: '(this import)', via: 'fingerprint', journalId: null } : null),
        possibleDuplicateOf: dupes.get(i) ?? null,
        fileOpensHere: c.fileOpensHere,
      },
    );
    if (d.outcome === 'ADD') seen.add(key);
    return { ...c, key, outcome: d.outcome, access: d.access, status: d.status, licenceVerdict: d.licenceVerdict, reasons: d.reasons };
  });
}

export function summarise(items: Classified[], errors = 0): PreviewSummary {
  const add = items.filter(i => i.outcome === 'ADD');
  return {
    found: items.length,
    eligible: add.length,
    viewable: add.filter(i => i.access === 'ViewableHere').length,
    metadataOnly: add.filter(i => i.access !== 'ViewableHere').length,
    alreadyHeld: items.filter(i => i.outcome === 'HELD').length,
    needsReview: items.filter(i => i.outcome === 'NEEDS_REVIEW').length,
    rejected: items.filter(i => i.outcome === 'REJECTED').length,
    errors,
  };
}

// ── The snapshot ────────────────────────────────────────────────────────────

export async function createPreview(
  kind: 'ONE_OFF' | 'DOAJ_CATALOGUE', admin: any, params: Record<string, any>, summary: any, items: any[] | null,
) {
  const row = await db.ingestionPreview.create({
    data: {
      kind, createdBy: admin?.email || admin?.uid || null,
      expiresAt: new Date(Date.now() + minutes(INGESTION_POLICY.preview.ttlMinutes)),
      params, summary, items,
    },
  });
  await audit(admin, 'DRY_RUN_CREATED', { previewId: row.id, kind, params, summary });
  return row;
}

export class PreviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Load a preview for a write, refusing one that is missing, of the wrong kind, or too old. */
export async function loadPreview(id: string, kind: 'ONE_OFF' | 'DOAJ_CATALOGUE') {
  if (!id || typeof id !== 'string') throw new PreviewError(400, 'A preview is required. Run a dry run first.');
  const row = await db.ingestionPreview.findUnique({ where: { id } });
  if (!row || row.kind !== kind) throw new PreviewError(404, 'That preview does not exist. Run a dry run first.');
  if (row.expiresAt.getTime() < Date.now()) throw new PreviewError(410, 'That preview has expired. Run the dry run again so what you confirm is what is in the catalogue now.');
  return row;
}

// ── The write ──────────────────────────────────────────────────────────────

export type WriteSummary = { attempted: number; added: number; held: number; rejected: number; failed: number; skippedNeedsReview: number; firstError?: string };

async function upsertPublisher(tx: any, name: string | null | undefined, source: string) {
  if (!name) return null;
  const existing = await tx.publisher.findFirst({ where: { name } });
  if (existing) return existing;
  try { return await tx.publisher.create({ data: { name, tieUpStatus: 'Discovered', source } }); }
  catch { return tx.publisher.findFirst({ where: { name } }); }
}

/**
 * Write the eligible records of a preview. Idempotent: every record is checked against the catalogue as it is
 * now, so running it twice, or after someone else added the same record, adds nothing the second time.
 *
 * `retryFailed` re-attempts only the records the last write could not store; everything already added or held
 * is left alone.
 */
export async function commitOneOff(
  previewId: string, admin: any, opts: { retryFailed?: boolean; onProgress?: (s: WriteSummary & { total: number }) => void } = {},
): Promise<WriteSummary> {
  const row = await loadPreview(previewId, 'ONE_OFF');
  const claimed = await db.ingestionPreview.updateMany({
    where: { id: previewId, consumedAt: null }, data: { consumedAt: new Date(), consumedBy: admin?.email || admin?.uid || null },
  });
  if (claimed.count === 0 && !opts.retryFailed) throw new PreviewError(409, 'This preview has already been ingested. Run a new dry run to import again.');

  const items: Classified[] = Array.isArray(row.items) ? (row.items as any) : [];
  const todo = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => it.outcome === 'ADD' && (opts.retryFailed ? it.result === 'failed' : !it.result));

  const sum: WriteSummary = { attempted: 0, added: 0, held: 0, rejected: 0, failed: 0, skippedNeedsReview: items.filter(i => i.outcome === 'NEEDS_REVIEW').length };

  await audit(admin, 'ONE_OFF_IMPORT_STARTED', {
    previewId, retry: !!opts.retryFailed, eligible: todo.length, source: (row.params as any)?.source, departments: (row.params as any)?.departments,
  });

  const BATCH = 25;
  for (let b = 0; b < todo.length; b += BATCH) {
    const batch = todo.slice(b, b + BATCH);
    // The judgement is repeated here, with the catalogue as it is now, not as it was an hour ago.
    const fresh = await classifyCandidates(batch.map(({ it }) => it));
    for (let k = 0; k < batch.length; k++) {
      const { it, idx } = batch[k]; const f = fresh[k];
      sum.attempted++;
      if (f.outcome !== 'ADD') {
        const held = f.outcome === 'HELD';
        items[idx].result = held ? 'held' : f.outcome === 'REJECTED' ? 'rejected' : 'review';
        items[idx].resultDetail = f.reasons.join('; ');
        held ? sum.held++ : f.outcome === 'REJECTED' ? sum.rejected++ : sum.skippedNeedsReview++;
        continue;
      }
      try {
        await db.$transaction(async (tx: any) => {
          const issn = normaliseIssn(f.issn);
          const publisher = await upsertPublisher(tx, f.publisherName, f.source);
          let journal = issn ? await findJournalByAnyIssn([issn], tx) : null;
          if (!journal && issn) {
            try {
              journal = await tx.journal.create({ data: {
                title: f.journalName || 'Unknown Journal', issn, publisherId: publisher?.id || null, publisherName: f.publisherName || null,
                domain: f.department, subject: f.subject || null, openAccess: !!f.openAccess, startYear: f.year || null,
              } });
            } catch { journal = await findJournalByAnyIssn([issn], tx); }
          }
          const doi = normaliseDoi(f.doi);
          await tx.article.create({ data: {
            title: f.title, authors: f.authors || null, doi, pdfUrl: f.pdfUrl || null,
            journalId: journal?.id || null, journalName: f.journalName || null, journalIssn: issn || f.issn || null,
            publisherId: publisher?.id || null, publisherName: f.publisherName || null,
            volume: f.volume ? String(f.volume) : null, issue: f.issue ? String(f.issue) : null,
            year: f.year || null, domain: f.department, subject: f.subject || null,
            accessType: 'OpenAccess', accessStatus: f.access, licence: f.licence || null,
            licenceIsNC: f.licenceVerdict !== 'allows-commercial',
            originalUrl: doi ? `https://doi.org/${doi}` : null,
            status: f.status || 'Published', source: f.source, sourceRecordId: f.sourceRecordId || null,
            fingerprint: f.key, createdBy: admin?.email || 'Ingestion',
          } });
        });
        items[idx].result = 'added'; sum.added++;
      } catch (e: any) {
        // Losing a race to another writer means the record is held — the system working, not failing.
        if (e?.code === 'P2002') { items[idx].result = 'held'; items[idx].resultDetail = 'already added by another writer'; sum.held++; }
        else {
          items[idx].result = 'failed'; items[idx].resultDetail = String(e?.message || e).slice(0, 200); sum.failed++;
          if (!sum.firstError) sum.firstError = items[idx].resultDetail;
        }
      }
    }
    opts.onProgress?.({ ...sum, total: todo.length });
  }

  // Remember what happened to each record, so a failed one can be retried and nothing is guessed later.
  await db.ingestionPreview.update({
    where: { id: previewId },
    data: { items: items as any, summary: { ...(row.summary as any), write: { ...sum, finishedAt: new Date().toISOString() } } },
  });
  return sum;
}

/** CSV of every candidate with its classification and reason. */
export function previewToCsv(items: Classified[]): string {
  const headers = ['outcome', 'reason', 'access', 'title', 'authors', 'journalName', 'issn', 'publisherName', 'volume', 'issue', 'year', 'doi', 'pdfUrl', 'licence', 'department', 'source', 'sourceRecordId', 'result'];
  const esc = (v: any) => { let t = String(v ?? '').replace(/"/g, '""'); if (/^[=+\-@]/.test(t)) t = "'" + t; return `"${t}"`; };   // no spreadsheet formulas from foreign text
  const row = (it: any) => headers.map(h => esc(h === 'reason' ? (it.reasons || []).join('; ') : h === 'outcome' ? it.outcome : it[h])).join(',');
  return [headers.join(','), ...items.map(row)].join('\n');
}
