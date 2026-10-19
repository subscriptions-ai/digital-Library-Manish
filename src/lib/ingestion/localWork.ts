import { ingestionDb as db } from './db.js';
import { bookMinYear, bookYearVerdict } from './yearPolicy.js';
import { classifyDepartment, CLASSIFIER_RULES_VERSION, STRONG_MIN, STRONG_MARGIN } from './books/classifier.js';
import { canonicalLicence } from './books/licence.js';
import { licenceAllowsCommercialUse } from './eligibility.js';
import { journalDepartment } from './journalDepartment.js';
import {
  DOAB_OAI, OAPEN_OAI, OTL_FEED, NCBI_FEED, NLM_FEED, CROSSREF_BOOKS_FEED, PRESSBOOKS_FEED, OPENLIBRARY_FEED, OPENLIBRARY_DUMP_FEED, type OaiProviderConfig,
} from './books/oaiHarvest.js';
import type { Group } from './rotationState.js';

/**
 * The engine's LOCAL backlog: work on records already in the database, done when no external source can be asked.
 *
 * Every job here re-applies a rule the harvest already applies, to data the harvest already fetched. None of them asks a source, invents a
 * value, or creates a record:
 *
 *   held-books         Draft books from a source that may publish on the classifier's word are judged again under the CURRENT rules (department
 *                      classifier, book year policy, the source's own department scope, duplicates). One that now passes every rule is published,
 *                      exactly as the harvest would have published it. Books from review-first sources, and books a person has decided, are never
 *                      touched. Runs once per rules version — after that there is nothing for it to do until the rules change.
 *   journal-departments Journals listed by Crossref / OpenAlex / ROAD that the importer could not place are offered to the same journal rule again,
 *                      once per rules version. It only fills an empty department; the journal's status (review, metadata only) is not changed.
 *   licence-fill       A book with no licence, where another provider's recorded sighting declared exactly one title-level licence, gets that licence —
 *                      the conservative fill the harvest makes when that provider re-reads the book, applied now instead of at its next visit.
 *   licence-spelling   A licence stored in a non-canonical spelling ("CC-BY 4.0") is rewritten in canonical form, ONLY where that cannot change what the
 *                      book may be offered as (the commercial-use reading of the old and new text agree with the stored flag). Anything else is left.
 *
 * Progress is a (createdAt, id) cursor per job, kept in one AppSetting row with the rules fingerprint it was made under, so a restart carries on
 * where it was and a rules change starts the re-judging jobs again from the beginning. Nothing here can raise a public count except a held book
 * that now meets every publishing rule.
 */

export type LocalOutcome = {
  checked: number;
  /** Held records that now meet every rule and were published (books only). Not "new records": they were already here. */
  promoted: number;
  /** Records whose metadata was completed or corrected. */
  enriched: number;
  /** Looked at, and still waiting for a person under the current rules. */
  stillHeld: number;
  /** Would have been published, but the same book is already published. */
  duplicates: number;
  /** Looked at and refused by a rule (outside the source's department scope, licence flag disagreement…). */
  refused: number;
  failed: number;
  note: string;
};

export type LocalJob = {
  id: string; label: string; group: Group;
  /** Records still to look at under the current rules. Cheap: a count. */
  pending: () => Promise<number>;
  run: (limit: number) => Promise<LocalOutcome>;
};

type Cursor = { at: string; id: string } | null;
type JobZeroYield = { count: number; exhaustedUntil: string | null };
type JobState = { fingerprint: string; cursor: Cursor; lastRunAt: string | null; totals: { checked: number; promoted: number; enriched: number }; zeroYield?: JobZeroYield };
type LocalState = { jobs: Record<string, JobState>; cursor: number };
const KEY = 'ingestion.localwork.v1';

const LOCAL_EXHAUSTED_MINUTES = 30;
const LOCAL_ZERO_YIELD_THRESHOLD = 3;

async function loadLocal(): Promise<LocalState> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v: any = row?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? { jobs: { ...(v.jobs || {}) }, cursor: Number(v.cursor) || 0 } : { jobs: {}, cursor: 0 };
}
async function saveLocal(s: LocalState) {
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s as any, updatedBy: 'engine' }, update: { value: s as any, updatedBy: 'engine' } }).catch(() => {});
}

/** The job's state under this fingerprint: a new fingerprint starts the job again from the beginning. */
function jobState(s: LocalState, id: string, fingerprint: string): JobState {
  const cur = s.jobs[id];
  if (cur && cur.fingerprint === fingerprint) return cur;
  return (s.jobs[id] = { fingerprint, cursor: null, lastRunAt: null, totals: cur?.totals ?? { checked: 0, promoted: 0, enriched: 0 } });
}

/** `(createdAt, id) > cursor`, as a Prisma filter. */
const after = (c: Cursor) => (c ? { OR: [{ createdAt: { gt: new Date(c.at) } }, { createdAt: new Date(c.at), id: { gt: c.id } }] } : {});
const ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
const blank = (): LocalOutcome => ({ checked: 0, promoted: 0, enriched: 0, stillHeld: 0, duplicates: 0, refused: 0, failed: 0, note: '' });
const obj = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// ── Feeds, as the harvest knows them ────────────────────────────────────────

const FEEDS: OaiProviderConfig[] = [DOAB_OAI, OAPEN_OAI, OTL_FEED, NCBI_FEED, NLM_FEED, CROSSREF_BOOKS_FEED, PRESSBOOKS_FEED, OPENLIBRARY_FEED, OPENLIBRARY_DUMP_FEED];
const feedOf = (source: string | null) => FEEDS.find(f => f.provider === source) ?? null;
/** Sources whose strong, in-policy books the harvest publishes by itself. Review-first sources never publish on their own; nor does this job for them. */
export const SELF_PUBLISHING_SOURCES = FEEDS.filter(f => !f.reviewFirst).map(f => f.provider);

/** Held books this job may judge: undecided Drafts the harvest created, from a self-publishing source. A rejected book is 'Rejected', never 'Draft'. */
const heldBookWhere = () => ({ status: 'Draft', ownershipSource: 'Ingested', rejectionNote: null, source: { in: SELF_PUBLISHING_SOURCES } });

// ── Job 1: held books, judged again under the current rules ────────────────

async function heldBooksFingerprint() {
  const st = await db.ingestionState.findUnique({ where: { id: 'singleton' }, select: { bookMinYear: true } }).catch(() => null);
  return JSON.stringify(['held-books', CLASSIFIER_RULES_VERSION, STRONG_MIN, STRONG_MARGIN, bookMinYear(st), SELF_PUBLISHING_SOURCES]);
}

/** Is the same book already published? DOI, ISBN or the dedupe fingerprint — the identifiers the harvest itself matches on. */
async function publishedTwin(b: { id: string; doi: string | null; isbn: string | null; fingerprint: string | null }) {
  const or: any[] = [];
  if (b.doi) or.push({ doi: b.doi });
  if (b.isbn) or.push({ isbn: b.isbn });
  if (b.fingerprint) or.push({ fingerprint: b.fingerprint });
  if (!or.length) return null;
  return db.book.findFirst({ where: { status: 'Published', id: { not: b.id }, OR: or }, select: { id: true } });
}

export const heldBooksJob: LocalJob = {
  id: 'held-books', label: 'Held candidate review', group: 'Books',
  pending: async () => {
    const s = await loadLocal(); const fp = await heldBooksFingerprint();
    const js = s.jobs['held-books']; const cursor = js?.fingerprint === fp ? js.cursor : null;
    return db.book.count({ where: { ...heldBookWhere(), ...after(cursor) } });
  },
  run: async (limit) => {
    const s = await loadLocal(); const fp = await heldBooksFingerprint(); const js = jobState(s, 'held-books', fp);
    const minYear = bookMinYear(await db.ingestionState.findUnique({ where: { id: 'singleton' }, select: { bookMinYear: true } }).catch(() => null));
    const rows: any[] = await db.book.findMany({ where: { ...heldBookWhere(), ...after(js.cursor) }, orderBy: ORDER, take: limit,
      select: { id: true, title: true, description: true, year: true, doi: true, isbn: true, fingerprint: true, source: true, metadata: true, createdAt: true } });
    const o = blank(); const byDept: Record<string, number> = {};
    for (const b of rows) {
      o.checked++;
      js.cursor = { at: b.createdAt.toISOString(), id: b.id };
      const meta = obj(b.metadata); const h = obj(meta.harvest); const p = obj(h.provider);
      const verdict = classifyDepartment({
        classifications: Array.isArray(h.classifications) ? h.classifications : [], subjects: Array.isArray(h.keywords) ? h.keywords : [],
        title: b.title, description: b.description, lcc: Array.isArray(p.lcc) ? p.lcc : undefined, nlm: Array.isArray(p.nlmClass) ? p.nlmClass : undefined,
      });
      const cfg = feedOf(b.source);
      const yv = bookYearVerdict(b.year, minYear);
      // The harvest's own publishing rule, in full: strong, a self-publishing source, inside the source's department scope, within the year policy.
      if (verdict.band !== 'strong' || !verdict.department || !cfg || cfg.reviewFirst || !yv.ok) { o.stillHeld++; continue; }
      if (cfg.allowedDepartments && !cfg.allowedDepartments.includes(verdict.department)) { o.refused++; continue; }
      if (await publishedTwin(b)) { o.duplicates++; continue; }
      try {
        const harvest = { ...h, department: { band: verdict.band, score: verdict.score, reasons: verdict.reasons, suggested: verdict.suggested, runnerUp: verdict.runnerUp },
          promoted: { at: new Date().toISOString(), from: 'review', rules: CLASSIFIER_RULES_VERSION, minYear } };
        // Updated only while still an undecided Draft: a person who acted on it a moment ago wins.
        const r = await db.book.updateMany({ where: { id: b.id, status: 'Draft', rejectionNote: null }, data: { status: 'Published', domain: verdict.department, metadata: { ...meta, harvest } } });
        if (r.count) { o.promoted++; byDept[verdict.department] = (byDept[verdict.department] || 0) + 1; } else o.stillHeld++;
      } catch { o.failed++; }
    }
    js.lastRunAt = new Date().toISOString();
    js.totals.checked += o.checked; js.totals.promoted += o.promoted;
    await saveLocal(s);
    o.note = `${o.checked} held books judged under rules v${CLASSIFIER_RULES_VERSION} (books from ${minYear}): ${o.promoted} now meet every rule and were published${Object.keys(byDept).length ? ` (${Object.entries(byDept).map(([d, n]) => `${d} ${n}`).join(', ')})` : ''}, ${o.stillHeld} still need a person${o.duplicates ? `, ${o.duplicates} already published under another record` : ''}${o.refused ? `, ${o.refused} outside the source's departments` : ''}`;
    return o;
  },
};

// ── Job 2: departments for journals the importer could not place ───────────

/** Only journals placed by journalDepartment() at import (Crossref / OpenAlex / ROAD listings). DOAJ journals were placed from LCC codes this job does not have. */
const unplacedJournalWhere = () => ({ domain: null, rightsBasis: { contains: 'OA unverified' } });
const journalFingerprint = () => JSON.stringify(['journal-departments', CLASSIFIER_RULES_VERSION]);

export const journalDepartmentsJob: LocalJob = {
  id: 'journal-departments', label: 'Department classification', group: 'Journals',
  pending: async () => {
    const s = await loadLocal(); const js = s.jobs['journal-departments'];
    const cursor = js?.fingerprint === journalFingerprint() ? js.cursor : null;
    return db.journal.count({ where: { ...unplacedJournalWhere(), ...after(cursor) } });
  },
  run: async (limit) => {
    const s = await loadLocal(); const js = jobState(s, 'journal-departments', journalFingerprint());
    const rows: any[] = await db.journal.findMany({ where: { ...unplacedJournalWhere(), ...after(js.cursor) }, orderBy: ORDER, take: limit, select: { id: true, title: true, subjects: true, createdAt: true } });
    const o = blank();
    for (const j of rows) {
      o.checked++;
      js.cursor = { at: j.createdAt.toISOString(), id: j.id };
      const dep = journalDepartment(j.title, Array.isArray(j.subjects) ? (j.subjects as any[]).map(x => String(x)) : []);
      if (!dep) { o.stillHeld++; continue; }
      try {
        const r = await db.journal.updateMany({ where: { id: j.id, domain: null }, data: { domain: dep } });
        r.count ? o.enriched++ : o.stillHeld++;
      } catch { o.failed++; }
    }
    js.lastRunAt = new Date().toISOString(); js.totals.checked += o.checked; js.totals.enriched += o.enriched;
    await saveLocal(s);
    o.note = `${o.checked} unplaced journals offered to the department rule (v${CLASSIFIER_RULES_VERSION}): ${o.enriched} placed, ${o.stillHeld} still unclear`;
    return o;
  },
};

// ── Job 3: a licence another provider already declared ─────────────────────

const licenceFillWhere = () => ({ OR: [{ licence: null }, { licence: '' }] });

/** The one title-level licence the recorded sightings agree on, or null (none, or they disagree). */
function agreedSightingLicence(meta: any): { licence: string; provider: string; handle: string | null } | null {
  const seen = Object.entries(obj(meta.sources)).map(([provider, v]: [string, any]) => ({ provider, licence: canonicalLicence(v?.licence) || null, basis: v?.licenceBasis, handle: v?.handle ?? null }))
    .filter(x => x.basis === 'title' && x.licence);
  const distinct = [...new Set(seen.map(x => x.licence))];
  return distinct.length === 1 ? { licence: distinct[0]!, provider: seen[0].provider, handle: seen[0].handle } : null;
}

export const licenceFillJob: LocalJob = {
  id: 'licence-fill', label: 'Licence completion', group: 'Books',
  pending: async () => {
    const s = await loadLocal(); const js = s.jobs['licence-fill'];
    const cursor = js?.fingerprint === 'licence-fill:1' ? js.cursor : null;
    const r: any[] = await db.$queryRawUnsafe(
      `select count(*)::int n from "Book" b where (b.licence is null or b.licence = '') and b.metadata ? 'sources'
         ${cursor ? `and (b."createdAt", b.id) > ($1::timestamptz at time zone 'UTC', $2)` : ''}`, ...(cursor ? [cursor.at, cursor.id] : []));
    return r[0]?.n ?? 0;
  },
  run: async (limit) => {
    const s = await loadLocal(); const js = jobState(s, 'licence-fill', 'licence-fill:1');
    const rows: any[] = await db.book.findMany({ where: { ...licenceFillWhere(), ...after(js.cursor) }, orderBy: ORDER, take: limit, select: { id: true, metadata: true, createdAt: true } });
    const o = blank();
    for (const b of rows) {
      js.cursor = { at: b.createdAt.toISOString(), id: b.id };
      const meta = obj(b.metadata);
      if (!meta.sources) continue;               // nothing recorded to go on: not looked at
      o.checked++;
      const got = agreedSightingLicence(meta);
      if (!got) { o.stillHeld++; continue; }
      try {
        // Only the licence and its derived flag, exactly as licencePatch() fills it during a harvest. Access and rights status are untouched.
        const r = await db.book.updateMany({ where: { id: b.id, OR: [{ licence: null }, { licence: '' }] }, data: {
          licence: got.licence, licenceIsNC: !licenceAllowsCommercialUse(got.licence),
          metadata: { ...meta, licenceFill: { ...obj(meta.licenceFill), [got.provider]: { licence: got.licence, basis: 'title', handle: got.handle, filledAt: new Date().toISOString(), by: 'backlog' } } },
        } });
        r.count ? o.enriched++ : o.stillHeld++;
      } catch { o.failed++; }
    }
    js.lastRunAt = new Date().toISOString(); js.totals.checked += o.checked; js.totals.enriched += o.enriched;
    await saveLocal(s);
    o.note = `${o.checked} books with no licence and a recorded sighting: ${o.enriched} filled from a title-level licence another provider declared, ${o.stillHeld} left (none declared, or sources disagree)`;
    return o;
  },
};

// ── Job 4: canonical licence spelling, where it changes nothing else ───────

/** The stored licence values that are not in canonical form. There are only a handful of distinct values, so this is one small query. */
async function nonCanonicalLicences(): Promise<string[]> {
  const rows: any[] = await db.$queryRawUnsafe(`select distinct licence from "Book" where licence is not null and licence <> ''`);
  return rows.map(r => r.licence as string).filter(l => { const c = canonicalLicence(l); return !!c && c !== l; });
}

export const licenceSpellingJob: LocalJob = {
  id: 'licence-spelling', label: 'Licence spelling', group: 'Books',
  pending: async () => {
    const s = await loadLocal(); const js = s.jobs['licence-spelling'];
    const cursor = js?.fingerprint === 'licence-spelling:1' ? js.cursor : null;
    const odd = await nonCanonicalLicences();
    return odd.length ? db.book.count({ where: { licence: { in: odd }, ...after(cursor) } }) : 0;
  },
  run: async (limit) => {
    const s = await loadLocal(); const js = jobState(s, 'licence-spelling', 'licence-spelling:1');
    const odd = await nonCanonicalLicences();
    const rows: any[] = odd.length ? await db.book.findMany({ where: { licence: { in: odd }, ...after(js.cursor) }, orderBy: ORDER, take: limit, select: { id: true, licence: true, licenceIsNC: true, createdAt: true } }) : [];
    const o = blank();
    for (const b of rows) {
      js.cursor = { at: b.createdAt.toISOString(), id: b.id };
      const canon = canonicalLicence(b.licence)!;
      o.checked++;
      // The new text must read exactly as the old one does for what the book may be offered as, and agree with the stored flag.
      const same = licenceAllowsCommercialUse(canon) === licenceAllowsCommercialUse(b.licence) && (b.licenceIsNC == null || b.licenceIsNC === !licenceAllowsCommercialUse(canon));
      if (!same) { o.refused++; continue; }
      try {
        const r = await db.book.updateMany({ where: { id: b.id, licence: b.licence }, data: { licence: canon } });
        r.count ? o.enriched++ : o.stillHeld++;
      } catch { o.failed++; }
    }
    js.lastRunAt = new Date().toISOString(); js.totals.checked += o.checked; js.totals.enriched += o.enriched;
    await saveLocal(s);
    o.note = `${o.checked} licences in a non-canonical spelling: ${o.enriched} rewritten in canonical form${o.refused ? `, ${o.refused} left because the rewrite would change what the book may be offered as (a person should look)` : ''}`;
    return o;
  },
};

// ── The queue ───────────────────────────────────────────────────────────────

export const LOCAL_JOBS: LocalJob[] = [heldBooksJob, journalDepartmentsJob, licenceFillJob, licenceSpellingJob];

/** What each job still has to do, for the screen and the scheduler. A job that fails to count is reported as 0, never guessed. */
export async function localBacklog(jobs: LocalJob[] = LOCAL_JOBS): Promise<{ id: string; label: string; group: Group; pending: number }[]> {
  const out = [];
  for (const j of jobs) out.push({ id: j.id, label: j.label, group: j.group, pending: await j.pending().catch(() => 0) });
  return out;
}

/** True when a local job produced useful changes (something was promoted or enriched). */
export function localOutcomeIsUseful(o: LocalOutcome): boolean {
  return o.promoted > 0 || o.enriched > 0;
}

/** Record the outcome of a local job run: reset or increment its zero-yield counter, and mark it exhausted after enough consecutive zero-yield batches. */
export async function recordLocalOutcome(jobId: string, o: LocalOutcome): Promise<{ exhausted: boolean; count: number }> {
  const s = await loadLocal();
  const js = s.jobs[jobId];
  if (!js) return { exhausted: false, count: 0 };
  if (!js.zeroYield) js.zeroYield = { count: 0, exhaustedUntil: null };
  if (localOutcomeIsUseful(o)) {
    js.zeroYield = { count: 0, exhaustedUntil: null };
    await saveLocal(s);
    return { exhausted: false, count: 0 };
  }
  if (o.checked === 0) {
    // Nothing to check at all — the cursor has passed everything. Not a zero-yield: the job is simply done.
    await saveLocal(s);
    return { exhausted: false, count: js.zeroYield.count };
  }
  js.zeroYield.count++;
  if (js.zeroYield.count >= LOCAL_ZERO_YIELD_THRESHOLD) {
    js.zeroYield.exhaustedUntil = new Date(Date.now() + LOCAL_EXHAUSTED_MINUTES * 60_000).toISOString();
    // After rest, the next zero-yield batch exhausts again immediately (same pattern as external providers).
    js.zeroYield.count = LOCAL_ZERO_YIELD_THRESHOLD - 1;
  }
  await saveLocal(s);
  return { exhausted: js.zeroYield.count >= LOCAL_ZERO_YIELD_THRESHOLD - 1 && !!js.zeroYield.exhaustedUntil, count: js.zeroYield.count };
}

/** True when the job is in zero-yield cooldown. */
function jobExhausted(s: LocalState, jobId: string): boolean {
  const js = s.jobs[jobId];
  if (!js?.zeroYield?.exhaustedUntil) return false;
  return Date.now() < Date.parse(js.zeroYield.exhaustedUntil);
}

/** The local job to run next: round robin among those with work, skipping exhausted (zero-yield cooldown) jobs. */
export async function nextLocalJob(jobs: LocalJob[], allow: (g: Group) => boolean): Promise<{ job: LocalJob; pending: number } | null> {
  if (!jobs.length) return null;
  const s = await loadLocal();
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[(s.cursor + i) % jobs.length];
    if (!allow(job.group)) continue;
    if (jobExhausted(s, job.id)) continue;
    const pending = await job.pending().catch(() => 0);
    if (pending > 0) { s.cursor = (jobs.indexOf(job) + 1) % jobs.length; await saveLocal(s); return { job, pending }; }
  }
  return null;
}
