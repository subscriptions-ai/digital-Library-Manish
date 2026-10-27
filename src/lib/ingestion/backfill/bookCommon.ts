import { createHash } from 'node:crypto';
import { ingestionDb as db } from '../db.js';
import { normaliseDoi } from '../dedup.js';
import { licenceAllowsCommercialUse } from '../eligibility.js';
import { multiSourceEnrichmentEnabled } from '../policy.js';
import { bookMinYear, bookYearVerdict } from '../yearPolicy.js';
import { licenceFamily } from '../duplicates.js';
import { judgeBooks, bookRow, sourcesPatch, licencePatch, type OaiProviderConfig, type Judged as JudgedBook } from '../books/oaiHarvest.js';
import { findHeldBooks } from '../books/dedupe.js';
import { fillEmptyPatch } from '../books/merge.js';
import { FileChecker } from '../books/fileCheck.js';
import type { NormalisedBook } from '../books/normalise.js';
import { crashPoint } from './testHooks.js';
import type { DupKind, JobView, Judged, WriteResult } from './types.js';

/**
 * The judging and the writing of BOOKS for a backfill adapter: the engine's own book pipeline (duplicate detection, department classifier, licence / access judge, year policy, row
 * builder), called from a place that has no checkpoint. An adapter only turns its source's record into a NormalisedBook; this decides what that book is. Nothing here reads or writes
 * BookHarvestCheckpoint, a provider's health row, or any other engine state.
 *
 *   publish    a NEW book the classifier places with confidence, within the year policy (and, under "open access first", with a verifiable open licence)
 *   review     a NEW book that waits for a person as a Draft with no department: unclear department, older than the policy year, no year, or no verifiable open licence under "open access first"
 *   refused    no reliable department, or outside the departments the job was asked for
 *   duplicate  already in the catalogue, found by DOI, ISBN or the provider's own id (a title-only match is reported and left alone; titles are never merged)
 *                unchanged     nothing to add
 *                enriched      the held book has EMPTY descriptive fields (or an empty licence the provider declares for this very title) this fills; only those
 *                conflicting   the licence family or the DOI disagrees with the held book; counted. No Book column changes. For a LICENCE disagreement the existing, bounded evidence note
 *                              (Book.metadata.licenceConflicts.<provider>: held / theirs / handle / when / "needs human review", one entry per provider, rewritten only if the disagreement is
 *                              a different one) is kept for a person, exactly as the continuous harvest keeps it; metadata is merged, never replaced. A DOI disagreement is counter-only.
 *
 * Never written to a book that already exists, whatever the newcomer says: access status, rights status, rights basis, status, department, file link, a licence that is already there,
 * a DOI that is already there; and nothing at all to a book a person owns, rejected or decided the rights of.
 */

export type BookItem = { book: NormalisedBook };

/** What apply() needs for one record, kept in memory between judge and apply only (never stored). */
type NewExtra = { jb: JudgedBook; status: 'Published' | 'Draft'; yearNote: { outcome?: string; reason?: string; minYear: number } | null };
type HeldExtra = { heldId: string; via: string; jb: JudgedBook };

const keysOf = (b: NormalisedBook): string[] => [b.doi && `doi:${b.doi}`, ...b.isbns.map(i => `isbn:${i}`), b.sourceRecordId && `id:${b.sourceRecordId}`].filter(Boolean) as string[];

/** What the first sighting of a book in this feed said about its rights and identity, so a repeat can be judged against it exactly as it would be against the row it wrote. */
type Sight = { licence: string | null; basis: string; doi: string | null };
const sightOf = (b: NormalisedBook): Sight => ({ licence: b.licence, basis: b.licenceBasis, doi: b.doi });
/** A dry run writes nothing, so a repeat of a book later in the feed would look new again. A dry run remembers the keys it has seen, per job, in this process only. */
const dryKeys = new Map<string, { keys: Map<string, Sight>; byBatch: Map<string, string[]> }>();
const DRY_KEY_CAP = 100_000;
export const __clearDryKeys = () => dryKeys.clear();

/** A held row nobody may add to: rejected, owned by a publisher or an administrator, or its rights decided by a person. */
export function protectedRow(h: any): string | null {
  if (h.status === 'Rejected') return 'the held book was rejected';
  if (h.ownershipSource && h.ownershipSource !== 'Ingested') return `the held book is ${h.ownershipSource === 'PublisherSubmitted' ? 'owned by a publisher' : 'entered by an administrator'}`;
  if (h.rightsVerifiedBy && h.rightsVerifiedBy !== 'ingestion') return 'a person decided the rights of the held book';
  return null;
}

/** What a second sighting may add to a held book (empty fields only), or why it conflicts. Reads nothing, writes nothing. */
export function decideBookDuplicate(h: any, j: JudgedBook, cfg: OaiProviderConfig): { kind: DupKind; patch?: Record<string, any>; reason?: string; evidence?: Record<string, any> } {
  const b = j.book;
  const prot = protectedRow(h);
  if (prot) return { kind: 'unchanged', reason: prot };
  // Disagreement on rights or identity: counted, and the held book is not touched at all.
  const titleLicence = b.licenceBasis === 'title' && b.licence;
  if (titleLicence && h.licence && licenceFamily(h.licence) !== licenceFamily(b.licence)) {
    // The continuous harvest's own evidence note (licencePatch's disagreement branch): metadata only, never a licence, access or status column. Null when this very disagreement is already on record.
    const note = licencePatch(h, j, cfg, h.metadata);
    return { kind: 'conflicting', reason: `licence ${b.licence} disagrees with the held ${h.licence}`, ...(note?.metadata && !note.licence ? { evidence: { metadata: note.metadata } } : {}) };
  }
  if (h.doi && b.doi && normaliseDoi(h.doi) !== normaliseDoi(b.doi)) return { kind: 'conflicting', reason: 'DOI disagrees with the held book' };
  if (!multiSourceEnrichmentEnabled()) return { kind: 'unchanged' };
  const patch: Record<string, any> = fillEmptyPatch(h, b, b.isbns[0] || null, b.subjects[0] || null, { sameProvider: h.source === cfg.provider });
  const src = sourcesPatch(h, j, cfg);
  if (src) patch.metadata = src;
  // Only the EMPTY-licence fill of licencePatch is used; its "record a disagreement" branch is a conflict, which a backfill counts and does not write.
  const lic = licencePatch(h, j, cfg, patch.metadata ?? h.metadata);
  if (lic?.licence) { patch.licence = lic.licence; patch.licenceIsNC = lic.licenceIsNC; if (lic.metadata) patch.metadata = lic.metadata; }
  return Object.keys(patch).length ? { kind: 'enriched', patch } : { kind: 'unchanged' };
}

export async function judgeBookItems(items: { id: string; item: BookItem }[], job: JobView, cfg: OaiProviderConfig, opts: { verifyFiles?: boolean } = {}): Promise<Judged<BookItem>[]> {
  const verify = opts.verifyFiles !== false;
  const books = items.map(i => i.item.book);
  const jbs = await judgeBooks({ ...cfg, verifyFiles: verify }, books, db, verify ? new FileChecker() : null);
  const state = await db.ingestionState?.findUnique?.({ where: { id: 'singleton' }, select: { bookMinYear: true } }).catch(() => null);
  const minYear = bookMinYear(state);

  const heldIds = [...new Set(jbs.filter(j => j.match).map(j => j.match!.bookId))];
  const held = new Map<string, any>();
  for (let i = 0; i < heldIds.length; i += 200) for (const r of await db.book.findMany({ where: { id: { in: heldIds.slice(i, i + 200) } } })) held.set(r.id, r);

  let seen = new Map<string, Sight>();
  const batch = createHash('sha1').update(items.map(i => i.id).join('|')).digest('hex');
  const mine: string[] = [];
  if (job.dryRun) {
    if (!dryKeys.has(job.id)) { if (dryKeys.size > 4) dryKeys.clear(); dryKeys.set(job.id, { keys: new Map(), byBatch: new Map() }); }       // a handful of recent previews at most
    const mem = dryKeys.get(job.id)!; seen = mem.keys;
    // A chunk judged AGAIN (a retry after an error, a recovery re-read) must not meet its own earlier keys and call its books "repeats": forget what this very batch remembered first.
    for (const k of mem.byBatch.get(batch) ?? []) seen.delete(k);
    mem.byBatch.set(batch, mine);
  }
  const runKeys = new Map<string, Sight>();
  const out: Judged<BookItem>[] = [];
  items.forEach(({ id, item }, k) => {
    const jb = jbs[k], b = jb.book;
    const keys = keysOf(b);
    // A book that appears twice in the feed is a duplicate of its first sighting. Within a chunk always; across chunks the catalogue says so (a dry run writes nothing, so it remembers).
    const prior = jb.match ? undefined : keys.map(x => runKeys.get(x) ?? seen.get(x)).find(Boolean);
    if (prior) {
      // Judged against its first sighting as it would be against the row that sighting wrote: a licence family or a DOI that disagrees is a conflict, anything else changes nothing.
      const conflict = (b.licenceBasis === 'title' && b.licence && prior.basis === 'title' && prior.licence && licenceFamily(prior.licence) !== licenceFamily(b.licence)) || (prior.doi && b.doi && normaliseDoi(prior.doi) !== normaliseDoi(b.doi));
      out.push({ id, item, outcome: 'duplicate', dup: conflict ? 'conflicting' : 'unchanged', reason: conflict ? 'disagrees with the same book earlier in the feed' : 'the same book appears earlier in the feed' });
      return;
    }

    if (jb.match) {
      const h = held.get(jb.match.bookId);
      if (jb.match.via === 'title') { out.push({ id, item, outcome: 'duplicate', dup: 'unchanged', reason: 'matched by title only; never merged by title' }); return; }
      const d = h ? decideBookDuplicate(h, jb, cfg) : { kind: 'unchanged' as DupKind };
      out.push({ id, item, outcome: 'duplicate', dup: d.kind, reason: d.reason ?? null, extra: { heldId: jb.match.bookId, via: jb.match.via, jb } satisfies HeldExtra });
      return;
    }

    const v = jb.verdict;
    if (v.band === 'none') { out.push({ id, item, outcome: 'refused', reason: 'no reliable department' }); return; }
    const dept = v.band === 'strong' ? v.department : v.suggested;
    if (job.departments.length && !(dept && job.departments.includes(dept))) { out.push({ id, item, outcome: 'refused', reason: `outside the selected departments (${dept ?? 'none'})` }); return; }
    const yv = bookYearVerdict(b.year, minYear);
    const openLicence = !!b.licence && licenceAllowsCommercialUse(b.licence);
    // Stricter than the engine, never looser: under "open access first" a book without a verifiable open licence waits for a person.
    const oaHold = job.accessPreference === 'OAFirst' && !openLicence;
    const publish = v.band === 'strong' && !cfg.reviewFirst && yv.ok && !oaHold;
    const status = publish ? 'Published' as const : 'Draft' as const;
    const extra: NewExtra = { jb, status, yearNote: yv.ok ? null : { outcome: yv.outcome, reason: yv.reason, minYear } };
    // Only a book that will really be written makes a later repeat of it a duplicate. A refused one is not in the catalogue, so its repeat is judged on its own.
    const sight = sightOf(b);
    keys.forEach(x => runKeys.set(x, sight));
    if (job.dryRun && seen.size < DRY_KEY_CAP) keys.forEach(x => { seen.set(x, sight); mine.push(x); });
    out.push({
      id, item, outcome: publish ? 'publish' : 'review', extra,
      reason: publish ? null : v.band !== 'strong' ? 'department not clear enough' : !yv.ok ? (yv.reason ?? 'outside the book year policy') : 'no verifiable open licence (open access first)',
    });
  });
  return out;
}

/** What a held book may still be given, recomputed from the book as it is NOW so a retried chunk never writes twice or over a person's edit: empty fields (enriched), or the bounded licence-conflict note. */
async function enrichOne(j: Judged<BookItem>, cfg: OaiProviderConfig): Promise<void> {
  const x = j.extra as HeldExtra | undefined; if (!x) return;
  const h = await db.book.findUnique({ where: { id: x.heldId } }); if (!h) return;
  const d = decideBookDuplicate(h, x.jb, cfg);
  const data = d.kind === 'enriched' ? d.patch : d.kind === 'conflicting' ? d.evidence : undefined;
  if (!data || !Object.keys(data).length) return;
  // Guarded by the row's own version: if anyone changed the book since it was read, nothing is written and it is simply looked at again next time.
  await db.book.updateMany({ where: { id: h.id, updatedAt: h.updatedAt }, data });
}

export async function applyBookItems(write: Judged<BookItem>[], enrich: Judged<BookItem>[], job: JobView, cfg: OaiProviderConfig): Promise<Map<string, WriteResult>> {
  const out = new Map<string, WriteResult>();
  // Idempotent: a book an earlier attempt of this very chunk already wrote is found again (by DOI, ISBN or handle) and is "present", never written twice.
  const found = write.length ? await findHeldBooks(write.map(j => (j.extra as NewExtra).jb.book), db) : new Map();
  let n = 0;
  for (let i = 0; i < write.length; i++) {
    const j = write[i], x = j.extra as NewExtra;
    if (found.get(i)) { out.set(j.id, 'present'); continue; }
    try {
      const row: any = bookRow(x.jb, cfg, x.status);
      if (x.yearNote) row.metadata = { ...row.metadata, harvest: { ...(row.metadata?.harvest || {}), yearPolicy: x.yearNote } };
      row.metadata = { ...row.metadata, backfill: { jobId: job.id, adapter: job.provider, via: 'historical backfill' } };
      row.createdBy = `Backfill:${job.id}`;
      await db.book.create({ data: row });
      out.set(j.id, 'written');
    } catch (e: any) {
      // The fingerprint is unique: losing the race to another writer of the same book is "present", not a failure.
      out.set(j.id, e?.code === 'P2002' ? 'present' : 'failed');
    }
    n++; crashPoint('mid-apply', n);
  }
  if (multiSourceEnrichmentEnabled()) for (const j of enrich) await enrichOne(j, cfg);
  return out;
}
