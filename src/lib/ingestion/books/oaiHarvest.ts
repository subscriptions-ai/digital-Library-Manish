import { ingestionDb } from '../db.js';
import { fetchSourceJson } from '../sourceHealth.js';
import { parseOaiPage, type OaiRecord } from './oaiXml.js';
import { normaliseOtlBook, OTL_BASE } from './otl.js';
import { parseNcbiList, rowStub, fetchArchive, normaliseNcbi, ncbiLimits, buildQueue, interleave, departmentOrder, departmentCoverage, NCBI_LIST_URL, NCBI_PROVIDER, NCBI_TARGET_DEPARTMENTS, NCBI_CONNECT_TIMEOUT_MS, type NcbiRow, type Stage1 } from './ncbi.js';
import { normaliseOaiBook, judgeBookAccess, bookFullTextEnabled, type NormalisedBook } from './normalise.js';
import { classifyDepartment, type DepartmentVerdict } from './classifier.js';
import { findHeldBooks, bookFingerprint, type BookMatch } from './dedupe.js';
import { fillEmptyPatch } from './merge.js';
import { FileChecker, type FileVerdict } from './fileCheck.js';
import { licenceAllowsCommercialUse } from '../eligibility.js';

/**
 * Incremental OAI-PMH harvest of one book provider.
 *
 *   ListRecords (from = last sync, or resume the saved token)
 *     → normalise → dedupe → classify department → judge access → catalogue
 *
 * Where it stands is kept in BookHarvestCheckpoint. While a harvest is part-way through, `cursor`
 * holds the resumptionToken, saved only after the page it follows has been fully processed, so a
 * restart repeats at most one page and dedupe makes the repeat harmless. `harvestStartedAt` is
 * stamped when a harvest BEGINS and becomes `lastSuccessfulSyncAt` when it ENDS: anything the
 * provider changes while the harvest runs is newer than that stamp and is picked up next time.
 *
 * A dry run reads and judges exactly the same way and writes nothing — not a book, not the
 * checkpoint.
 */

export type OaiProviderConfig = {
  /** Checkpoint key and Book.source. */
  provider: string;
  baseUrl: string;
  /** How the provider is read. Default 'oai' (OAI-PMH); 'otl' is Open Textbook Library's paged JSON. */
  kind?: 'oai' | 'otl' | 'ncbi';
  /** OAI set to harvest: the books, not the chapters, funders or publishers also in the repository. */
  set: string;
  metadataPrefix: string;
  /** After a harvest reaches the end, leave the provider alone this long. Default: six hours. */
  resyncMinutes?: number;
  /** For the provenance note kept on each book. */
  label: string;
  /** "https://host/handle/" — the provider's own page for a title. */
  handleBase: string;
  /** Ask whether the provider's PDF really opens before a book can be called Full Text. */
  verifyFiles?: boolean;
  /** Only these departments are taken from this provider; a book that lands elsewhere is left out. */
  allowedDepartments?: string[];
  /** May fill a held book's EMPTY licence from this provider's recognised title-level licence (and record conflicts). */
  fillsLicence?: boolean;
  /** Not due until this provider has finished a full harvest, so a book it already holds is enriched, not created twice. */
  after?: string;
};

export const DOAB_OAI: OaiProviderConfig = {
  provider: 'DOAB',
  baseUrl: 'https://directory.doabooks.org/oai/request',
  set: 'com_20.500.12854_5',
  metadataPrefix: 'xoai',
  label: 'DOAB (OAI-PMH, xoai)',
  handleBase: 'https://directory.doabooks.org/handle/',
};

/**
 * OAPEN hosts the books DOAB indexes. Its job here is second sighting: match a title DOAB already
 * gave us and fill what is empty, and add a title only when nothing matches. It waits for DOAB's
 * first full harvest to finish so that is true.
 */
export const OAPEN_OAI: OaiProviderConfig = {
  provider: 'OAPEN',
  baseUrl: 'https://library.oapen.org/oai/request',
  set: 'com_20.500.12657_5',
  metadataPrefix: 'xoai',
  label: 'OAPEN Library (OAI-PMH, xoai)',
  handleBase: 'https://library.oapen.org/handle/',
  verifyFiles: true,
  fillsLicence: true,
  after: 'DOAB',
};

/**
 * Open Textbook Library: ~2,000 openly licensed undergraduate textbooks, from its own JSON. It shares
 * everything else with the OAI providers — normalised book, dedupe, classifier, rights, checkpoint,
 * review Drafts. It waits for DOAB, so a textbook DOAB or OAPEN already holds is enriched, not repeated.
 */
export const OTL_FEED: OaiProviderConfig = {
  provider: 'OpenTextbookLibrary',
  kind: 'otl',
  baseUrl: OTL_BASE,
  set: '',
  metadataPrefix: '',
  label: 'Open Textbook Library (JSON)',
  handleBase: '',
  verifyFiles: true,
  after: 'DOAB',
  resyncMinutes: 7 * 24 * 60,                 // there is no "changed since": a sync reads every page, so not often
};

/**
 * NCBI Bookshelf — health books from the official archive, in two stages (see ncbi.ts). It waits for DOAB,
 * reads nothing but the archive's metadata, publishes nothing on words alone, and keeps unknown rights as
 * Metadata Only. Every book it finds goes through the same pipeline as every other provider.
 */
export const NCBI_FEED: OaiProviderConfig = {
  provider: NCBI_PROVIDER,
  kind: 'ncbi',
  baseUrl: NCBI_LIST_URL,
  set: '',
  metadataPrefix: '',
  label: 'NCBI Bookshelf (official archive)',
  handleBase: '',
  after: 'DOAB',
  resyncMinutes: 30 * 24 * 60,
  allowedDepartments: NCBI_TARGET_DEPARTMENTS,
};

export type HarvestOptions = {
  dryRun?: boolean;
  /** Pages per call. The engine takes a few per pass and the checkpoint carries on from there. */
  maxPages?: number;
  /** Stop after this many records have been *written* (dry run: examined). For small local tests. */
  maxWrites?: number;
  pageDelayMs?: number;
  /** Dry run only: start from this datestamp instead of the checkpoint, so a sample is cheap. */
  from?: string | null;
  /** Dry run or capped run: ignore any saved token and start fresh. Neither ever advances the real harvest. */
  ignoreCheckpoint?: boolean;
  /** Dry or capped runs only: begin at this cursor (for Open Textbook Library, a page number) to sample elsewhere in the feed. */
  startToken?: string | null;
  /** NCBI dry run: how many archives to read for the sample (default 25). */
  maxArchives?: number;
  db?: any;
  now?: () => Date;
  sleep?: (ms: number) => Promise<any>;
};

export type HarvestReport = {
  provider: string; dryRun: boolean;
  pages: number; fetched: number; deleted: number; unusable: number;
  newCandidates: number;
  duplicates: { doi: number; isbn: number; sourceRecordId: number; fingerprint: number; title: number; inRun: number };
  enriched: number;
  department: { strong: number; review: number; none: number; byDepartment: Record<string, number>; suggestions: Record<string, number> };
  access: { FullText: number; OpenExternal: number; MetadataOnly: number };
  licences: Record<string, number>;
  added: number; queuedForReview: number; failed: number; firstError: string | null;
  /** Held books given an empty licence from this provider, and held books whose licence this provider contradicts. */
  licenceFilled: number; licenceConflicts: number;
  /** Left out because the book did not land in one of this provider's departments. */
  outsideScope: number;
  /** Why the run stopped early without it being a failure (a daily limit). */
  deferred: string | null;
  ncbi: { rows: number; candidates: number; existing: number; archives: number; bytes: number; oversize: number; parseFailures: number; explicitLicences: number; publicDomain: number; unknownRights: number; ambiguousRights: number; notSampled: number; failureReasons: Record<string, number>;
    /** Stage 1: candidates by department and by tier, the catalogue coverage the order leaned on, and where archives were actually read. */
    byDepartment: Record<string, number>; byTier: Record<string, number>; archivesByDepartment: Record<string, number>; coverage: Record<string, number>; order: string[]; sampled: boolean } | null;
  /** Open, commercial-use licence AND a PDF that really opened from here. Held as Open External while full text is off. */
  fullTextEligible: number;
  files: { checked: number; opened: number; refused: number; reasons: Record<string, number> };
  completed: boolean;
  resumedFrom: string | null; nextCursor: string | null; completeListSize: number | null;
  /** Page failed to arrive: the harvest stopped where it was and will resume. */
  sourceError: string | null;
  /** Dry run: a sample of what was decided, for a person to read. */
  sample: any[];
};

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const defaultSleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const SAMPLE = 40;

export function emptyReport(provider: string, dryRun: boolean): HarvestReport {
  return {
    provider, dryRun, pages: 0, fetched: 0, deleted: 0, unusable: 0, newCandidates: 0,
    duplicates: { doi: 0, isbn: 0, sourceRecordId: 0, fingerprint: 0, title: 0, inRun: 0 }, enriched: 0,
    department: { strong: 0, review: 0, none: 0, byDepartment: {}, suggestions: {} },
    access: { FullText: 0, OpenExternal: 0, MetadataOnly: 0 }, licences: {},
    added: 0, queuedForReview: 0, failed: 0, firstError: null, completed: false, fullTextEligible: 0, licenceFilled: 0, licenceConflicts: 0, outsideScope: 0, deferred: null, ncbi: null,
    files: { checked: 0, opened: 0, refused: 0, reasons: {} }, resumedFrom: null, nextCursor: null,
    completeListSize: null, sourceError: null, sample: [],
  };
}

/** Everything decided about one candidate, before anything is written. */
export type Judged = {
  book: NormalisedBook;
  match: BookMatch | null;
  verdict: DepartmentVerdict;
  access: ReturnType<typeof judgeBookAccess>;
  file: FileVerdict | null;
};

export function bookRow(j: Judged, cfg: OaiProviderConfig, status: 'Published' | 'Draft' = 'Published') {
  const b = j.book, a = j.access;
  const subject = b.subjects[0] || null;
  const fullText = a.access === 'FullText';
  return {
    title: b.title,
    authors: [b.authors, b.editors].filter(Boolean).join(', ') || null,
    publisherName: b.publisherName,
    isbn: b.isbns[0] || null,
    doi: b.doi,
    year: b.year,
    pages: b.pages,
    edition: b.edition,
    subject,
    // A book waiting for review has no department yet: the suggestion is kept in metadata and a person
    // chooses on approval. Nothing is assigned on a guess.
    domain: status === 'Published' ? j.verdict.department : null,
    language: b.language,
    country: b.country,
    description: b.description,
    coverUrl: b.coverUrl,
    pdfUrl: fullText ? b.fileUrl : null,            // only a file that was asked for and really opened
    accessType: 'OpenAccess',
    status,
    licence: b.licence,
    licenceIsNC: a.licenceIsNC,
    rightsBasis: b.licenceBasis === 'title' ? `${cfg.provider} title licence`
      : b.licenceBasis === 'publisher-statement' ? `${cfg.provider} publisher statement`
      : `${cfg.provider} record, licence undeclared`,
    rightsVerifiedAt: new Date(),
    rightsVerifiedBy: 'ingestion',
    rightsStatus: a.rightsStatus,
    accessStatus: a.accessStatus,
    originalUrl: b.externalUrl || b.landingUrl,
    rightsHolder: b.publisherName,
    source: cfg.provider,
    sourceRecordId: b.sourceRecordId,
    ownershipSource: 'Ingested',
    rejectionNote: null,
    lastIngestedAt: new Date(),
    fingerprint: bookFingerprint(b),
    metadata: {
      harvest: {
        via: cfg.label, set: cfg.set, datestamp: b.modified, landingUrl: b.landingUrl,
        classifications: b.classifications, keywords: b.subjects,
        department: {
          band: j.verdict.band, score: j.verdict.score, reasons: j.verdict.reasons,
          suggested: j.verdict.suggested, runnerUp: j.verdict.runnerUp,
        },
        licenceBasis: b.licenceBasis, access: a.access, accessReason: a.reason,
        // The verified file stays on record for the day the reader can use it; it is not served or linked meanwhile.
        ...(b.extra ? { provider: b.extra } : {}),
        file: b.fileUrl ? { url: b.fileUrl, verdict: j.file, heldBack: !!j.file?.ok && !bookFullTextEnabled() } : null,
      },
    },
  };
}

/**
 * What a second provider adds to a book already held, as provenance: the metadata stays DOAB's
 * (`source`), and the access this provider offers is recorded beside it. JSON keys only — no column
 * is changed — and only when absent, so a later sighting never rewrites an earlier one.
 */
/**
 * The conservative licence rule for a book another provider already gave us.
 *
 *  - held licence EMPTY and this provider declares a recognised TITLE-level licence → fill that one field.
 *  - both declared and they differ → change neither; record the disagreement for a person.
 *
 * Only `licence` and its derived flag `licenceIsNC` are written. accessStatus, rightsStatus, rightsBasis,
 * department and source are left exactly as they were: a licence arriving later does not, by itself,
 * change what the book is offered as. The evidence is kept in metadata so it can be audited.
 *
 * Why licenceIsNC moves with the licence: for books it is not an independent decision, it is computed
 * from the licence at ingestion ("does this licence permit hosting?"; true when none is declared). Leaving
 * it behind would pin a CC BY book as "non-commercial" — contradictory rights metadata. It is a label;
 * what the book is offered as is decided by accessStatus/rightsStatus, which are untouched.
 */
export function licencePatch(existing: any, j: Judged, cfg: OaiProviderConfig, baseMeta: any): { licence?: string; licenceIsNC?: boolean; metadata?: any } | null {
  if (!cfg.fillsLicence || existing.source === cfg.provider) return null;
  const b = j.book;
  if (!b.licence || b.licenceBasis !== 'title') return null;
  const meta = baseMeta && typeof baseMeta === 'object' && !Array.isArray(baseMeta) ? baseMeta : {};
  const held = String(existing.licence || '').trim();
  if (!held) {
    if (meta.licenceFill?.[cfg.provider]) return null;
    return { licence: b.licence, licenceIsNC: !licenceAllowsCommercialUse(b.licence), metadata: { ...meta, licenceFill: { ...(meta.licenceFill || {}), [cfg.provider]: { licence: b.licence, basis: 'title', handle: b.sourceRecordId, filledAt: new Date().toISOString() } } } };
  }
  if (held !== b.licence && meta.licenceConflicts?.[cfg.provider]?.theirs !== b.licence) {
    return { metadata: { ...meta, licenceConflicts: { ...(meta.licenceConflicts || {}), [cfg.provider]: { held, theirs: b.licence, handle: b.sourceRecordId, seenAt: new Date().toISOString(), status: 'needs human review' } } } };
  }
  return null;
}

export function sourcesPatch(existing: any, j: Judged, cfg: OaiProviderConfig): Record<string, any> | null {
  if (existing.source === cfg.provider) return null;
  const meta = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {};
  const have = meta.sources?.[cfg.provider];
  if (have) return null;
  const b = j.book;
  const next: any = {
    ...meta,
    sources: {
      ...(meta.sources || {}),
      [cfg.provider]: {
        handle: b.sourceRecordId, landingUrl: b.landingUrl, fileUrl: b.fileUrl, licence: b.licence, licenceBasis: b.licenceBasis,
        access: j.access.access, fileVerdict: j.file, seenAt: new Date().toISOString(),
      },
    },
  };
  // "accessSource": who offers the book, when the metadata came from elsewhere.
  if (!meta.access && (b.fileUrl || b.externalUrl || b.landingUrl)) {
    next.access = { source: cfg.provider, url: b.fileUrl || b.externalUrl || b.landingUrl, status: j.access.access, metadataSource: existing.source || null };
  }
  return next;
}

/**
 * Judge a page of records: dedupe, classify, decide access. Reads the catalogue; writes nothing.
 * With `verifyFiles`, a title whose licence permits hosting has its PDF asked for, because a link
 * alone never makes a book Full Text.
 */
export async function judgeBooks(cfg: OaiProviderConfig, books: NormalisedBook[], db: any, checker?: FileChecker | null): Promise<Judged[]> {
  const held = await findHeldBooks(books, db);
  const judged: Judged[] = [];
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    let file: FileVerdict | null = null;
    if (cfg.verifyFiles && checker && book.fileUrl && licenceAllowsCommercialUse(book.licence)) file = await checker.verifyPdf(book.fileUrl);
    judged.push({
      book,
      match: held.get(i) ?? null,
      verdict: classifyDepartment({ classifications: book.classifications, subjects: book.subjects, title: book.title, description: book.description, lcc: book.lcc }),
      access: judgeBookAccess(book, { verifiedFileUrl: file?.ok ? book.fileUrl : null }),
      file,
    });
  }
  return judged;
}

/** OAI records → judged books. */
export async function judgePage(cfg: OaiProviderConfig, records: OaiRecord[], db: any, checker?: FileChecker | null): Promise<{ judged: Judged[]; deleted: number; unusable: number }> {
  let deleted = 0, unusable = 0;
  const books: NormalisedBook[] = [];
  for (const r of records) {
    if (r.deleted) { deleted++; continue; }
    const b = normaliseOaiBook(cfg, r);
    if (!b || !b.title) { unusable++; continue; }
    books.push(b);
  }
  return { judged: await judgeBooks(cfg, books, db, checker), deleted, unusable };
}

async function readCheckpoint(db: any, provider: string) {
  return db.bookHarvestCheckpoint.findUnique({ where: { provider } });
}

/** Fetch one page, returning the parsed page or a reason it could not be had. */
export async function fetchPage(cfg: OaiProviderConfig, token: string | null, from: string | null) {
  const url = token
    ? `${cfg.baseUrl}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`
    : `${cfg.baseUrl}?verb=ListRecords&metadataPrefix=${cfg.metadataPrefix}&set=${encodeURIComponent(cfg.set)}`
      + (from ? `&from=${encodeURIComponent(from)}` : '');
  const r = await fetchSourceJson(url, { text: true, timeoutMs: 90_000, attempts: 3, headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` } });
  if (!r.ok) return { error: r.error || `HTTP ${r.status}`, paused: !!r.paused } as const;
  return { page: parseOaiPage(String(r.json)) } as const;
}

/** One page of a provider, in the shape the shared pipeline wants. */
export type Batch = {
  books: NormalisedBook[]; count: number; deleted: number; unusable: number;
  next: string | null; total: number | null;
  /** The provider answered, but with a protocol-level refusal. */
  error: { code: string; message: string } | null;
  /** Stopped for a limit (not a failure); resume from `next`. */
  deferred?: string | null;
  /** A dry-run sample is complete. */
  stop?: string | null;
};

/** Fetch and normalise one page for any provider kind. A string is the reason it could not be had. */
let ncbiList: { at: number; rows: NcbiRow[] } | null = null;
let ncbiPlan: { key: string; queue: Stage1[]; sample: Stage1[] } | null = null;

/** The position in the queue, and the department order it was built with, so a pass resumes in the order it began. */
const ncbiToken = (t: string | null) => { const [i, o] = (t || '').split('@'); const order = o ? o.split('|') : null; return { idx: Number(i) || 0, order: order && order.length === NCBI_TARGET_DEPARTMENTS.length && order.every(d => NCBI_TARGET_DEPARTMENTS.includes(d)) ? order : null }; };

async function ncbiBatch(cfg: OaiProviderConfig, token: string | null, ctx: BatchContext): Promise<Batch | { failed: string }> {
  if (!ncbiList || Date.now() - ncbiList.at > 15 * 60_000) {
    const r = await fetchSourceJson(cfg.baseUrl, { source: 'NCBI', encoding: 'windows-1252', timeoutMs: 120_000, attempts: 3, connectTimeoutMs: NCBI_CONNECT_TIMEOUT_MS, headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` } });
    if (!r.ok) return { failed: r.error || `HTTP ${r.status}` };
    ncbiList = { at: Date.now(), rows: parseNcbiList(String(r.json)) };
    ncbiPlan = null;
  }
  const rows = ncbiList.rows, lim = ncbiLimits();
  const { idx: start, order: savedOrder } = ncbiToken(token);
  const coverage = await departmentCoverage(ctx.db);
  const order = savedOrder ?? departmentOrder(coverage);

  // Stage 1 over the whole list: a priority queue of the titles with department-specific wording. No download, no write.
  const key = `${ncbiList.at}|${order.join('|')}`;
  if (!ncbiPlan || ncbiPlan.key !== key) { const queue = buildQueue(rows, order); ncbiPlan = { key, queue, sample: interleave(queue, order) }; }
  const bounded = ctx.maxArchives != null;
  const seq = bounded ? ncbiPlan.sample : ncbiPlan.queue;     // a bounded test takes its turn from every department; a real pass goes strictly by tier

  const st = (ctx.report.ncbi ||= { rows: 0, candidates: 0, existing: 0, archives: 0, bytes: 0, oversize: 0, parseFailures: 0, explicitLicences: 0, publicDomain: 0, unknownRights: 0, ambiguousRights: 0, notSampled: 0, failureReasons: {}, byDepartment: {}, byTier: {}, archivesByDepartment: {}, coverage: {}, order: [], sampled: false });
  if (!st.rows) {
    st.rows = rows.length; st.candidates = ncbiPlan.queue.length; st.coverage = coverage; st.order = order; st.sampled = bounded;
    for (const q of ncbiPlan.queue) { st.byDepartment[q.department] = (st.byDepartment[q.department] || 0) + 1; st.byTier[`tier ${q.tier}`] = (st.byTier[`tier ${q.tier}`] || 0) + 1; }
    ctx.report.outsideScope += rows.length - ncbiPlan.queue.length;
  }

  const books: NormalisedBook[] = [];
  let i = start, thisBatch = 0, deferred: string | null = null, stop: string | null = null;
  const end = Math.min(seq.length, start + lim.rowsPerBatch);

  // Which of this slice we already hold (by accession, or the same title and year): nothing to fetch for those.
  const slice = seq.slice(start, end);
  const held = await findHeldBooks(slice.map(c => rowStub(c.row)), ctx.db);

  for (; i < end; i++) {
    const c = seq[i], row = c.row;
    if (held.get(i - start)) { st.existing++; continue; }
    // A bounded run reads a limited sample of archives; the rest of the queue is still counted by stage 1.
    if (bounded && st.archives >= ctx.maxArchives!) { stop = 'sample complete'; break; }
    if (thisBatch >= lim.archivesPerBatch) break;
    // Stage 2: the archive, under the daily limits.
    const res = await fetchArchive(row, ctx.db, lim);
    if (res.status === 'deferred') { deferred = res.reason; break; }
    if (res.status === 'oversize') { st.oversize++; const k = `over the size limit (${res.bytes ? Math.round(res.bytes / 1048576) + ' MB' : 'size unknown'})`; st.failureReasons[k] = (st.failureReasons[k] || 0) + 1; continue; }       // skipped with a reason; not a provider failure
    thisBatch++; st.archives++; st.bytes += res.bytes;
    st.archivesByDepartment[c.department] = (st.archivesByDepartment[c.department] || 0) + 1;
    if (res.status === 'failed') { st.parseFailures++; st.unknownRights++; st.failureReasons[res.reason] = (st.failureReasons[res.reason] || 0) + 1; }
    else if (res.toc.rights === 'cc') st.explicitLicences++;
    else if (res.toc.rights === 'public-domain') { st.explicitLicences++; st.publicDomain++; }
    else if (res.toc.rights === 'ambiguous') { st.ambiguousRights++; st.unknownRights++; }
    else st.unknownRights++;
    const book = normaliseNcbi(row, res);
    book.extra = { ...(book.extra || {}), ncbi: { ...((book.extra as any)?.ncbi || {}), stage1: { department: c.department, tier: c.tier, score: c.score, evidence: c.evidence } } };
    books.push(book);
    await new Promise(r => setTimeout(r, ctx.pauseMs ?? 1000));
  }

  if (stop) {
    // The sample is done; count what is left so the report still says how many were not read, and how many we already hold.
    for (let k = i; k < seq.length; k += lim.rowsPerBatch) {
      const rest = seq.slice(k, k + lim.rowsPerBatch);
      const h = await findHeldBooks(rest.map(c => rowStub(c.row)), ctx.db);
      rest.forEach((_, n) => { if (h.get(n)) st.existing++; else st.notSampled++; });
    }
  }
  const more = i < seq.length && !stop;
  return { books, count: i - start, deleted: 0, unusable: 0, next: more ? `${i}@${order.join('|')}` : null, total: seq.length, error: null, deferred, stop };
}

export type BatchContext = { db: any; report: HarvestReport; maxArchives?: number; pauseMs?: number };

export async function fetchBatch(cfg: OaiProviderConfig, token: string | null, from: string | null, ctx?: BatchContext): Promise<Batch | { failed: string }> {
  if (cfg.kind === 'ncbi') return ncbiBatch(cfg, token, ctx!);
  if (cfg.kind === 'otl') {
    const page = token ? Number(token) : 1;
    const r = await fetchSourceJson(`${cfg.baseUrl}?page=${page}`, { timeoutMs: 90_000, attempts: 3, headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` } });
    if (!r.ok) return { failed: r.error || `HTTP ${r.status}` };
    const items: any[] = Array.isArray(r.json?.data) ? r.json.data : [];
    // The library reports more pages than it has (202 claimed, 189 with books): an empty page is the end.
    const totalPages = items.length ? Number(r.json?.links?.total_pages) || page : page;
    let unusable = 0;
    // The library has no "changed since": a book last updated before our last sync was already judged then.
    const since = from ? Date.parse(from) : NaN;
    const books: NormalisedBook[] = [];
    for (const it of items) {
      const b = normaliseOtlBook(cfg.provider, it);
      if (!b) { unusable++; continue; }
      if (Number.isFinite(since) && b.modified && Date.parse(b.modified) < since) continue;
      books.push(b);
    }
    return { books, count: items.length, deleted: 0, unusable, next: page < totalPages ? String(page + 1) : null, total: Number(r.json?.links?.total_count) || null, error: null };
  }
  const got = await fetchPage(cfg, token, from);
  if ('error' in got) return { failed: got.error ?? 'request failed' };
  const page = got.page;
  if (page.error) return { books: [], count: 0, deleted: 0, unusable: 0, next: null, total: null, error: page.error };
  let deleted = 0, unusable = 0;
  const books: NormalisedBook[] = [];
  for (const r of page.records) {
    if (r.deleted) { deleted++; continue; }
    const b = normaliseOaiBook(cfg, r);
    if (!b || !b.title) { unusable++; continue; }
    books.push(b);
  }
  return { books, count: page.records.length, deleted, unusable, next: page.resumptionToken, total: page.completeListSize, error: null };
}

export async function harvestFeed(cfg: OaiProviderConfig, opts: HarvestOptions = {}): Promise<HarvestReport> {
  const db = opts.db ?? ingestionDb;
  const dry = !!opts.dryRun;
  // A capped write (`maxWrites`) stops part-way down a page. Remembering a position after that would
  // skip the rest of the page for ever, so a capped run, like a dry run, never touches the checkpoint.
  const keepsCheckpoint = !dry && opts.maxWrites == null;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => new Date());
  const report = emptyReport(cfg.provider, dry);
  const seenInRun = new Set<string>();
  const checker = cfg.verifyFiles ? new FileChecker() : null;

  let cp = await readCheckpoint(db, cfg.provider);
  const ignoreCp = (dry || !keepsCheckpoint) && !!opts.ignoreCheckpoint;
  let token: string | null = !keepsCheckpoint && opts.startToken ? opts.startToken : ignoreCp ? null : cp?.cursor ?? null;
  let from: string | null = null;
  let boundary: Date | null = cp?.harvestStartedAt ?? null;
  report.resumedFrom = token;

  if (!token) {
    // A new harvest. Stamp its start now; everything changed after this is the next sync's to find.
    const last: Date | null = ignoreCp ? null : cp?.lastSuccessfulSyncAt ?? null;
    // A minute of overlap covers clock skew between us and the provider; dedupe makes the overlap free.
    from = opts.from ?? (last ? iso(new Date(last.getTime() - 60_000)) : null);
    boundary = now();
    if (keepsCheckpoint) {
      cp = await db.bookHarvestCheckpoint.upsert({
        where: { provider: cfg.provider },
        create: { provider: cfg.provider, cursor: null, harvestStartedAt: boundary },
        update: { harvestStartedAt: boundary, cursor: null },
      });
    }
  }

  const maxPages = opts.maxPages ?? 3;
  for (let n = 0; n < maxPages; n++) {
    const got = await fetchBatch(cfg, token, from, { db, report, maxArchives: opts.maxArchives ?? (dry && cfg.kind === 'ncbi' ? 25 : undefined), pauseMs: opts.pageDelayMs });
    if ('failed' in got) { report.sourceError = got.failed; break; }                          // stay put; resume later
    const page = got;

    if (page.error) {
      if (page.error.code === 'noRecordsMatch') { token = null; report.completed = true; break; }   // nothing new since last sync
      if (page.error.code === 'badResumptionToken') {
        // The provider no longer honours our token. Start again from the last sync; dedupe absorbs the overlap.
        report.sourceError = 'resumption token expired; restarting from the last successful sync';
        token = null;
        if (keepsCheckpoint) await db.bookHarvestCheckpoint.update({ where: { provider: cfg.provider }, data: { cursor: null } });
        break;
      }
      report.sourceError = `OAI error ${page.error.code}: ${page.error.message}`;
      break;
    }

    report.pages++;
    report.completeListSize = page.total ?? report.completeListSize;
    report.fetched += page.count;

    const judged = await judgeBooks(cfg, page.books, db, checker);
    report.deleted += page.deleted; report.unusable += page.unusable;

    // Books already held come first: enriching what we have matters more than adding, and a capped run
    // must not spend its whole allowance on new books before reaching the matches.
    for (const j of [...judged.filter(x => x.match), ...judged.filter(x => !x.match)]) {
      const b = j.book;
      // The same book twice in one run (e.g. two records sharing a DOI) is a duplicate of the first.
      const keys = [b.doi && `doi:${b.doi}`, ...b.isbns.map(i => `isbn:${i}`), b.sourceRecordId && `id:${b.sourceRecordId}`].filter(Boolean) as string[];
      if (!j.match && keys.some(k => seenInRun.has(k))) { report.duplicates.inRun++; continue; }
      keys.forEach(k => seenInRun.add(k));

      if (j.file) {
        report.files.checked++;
        if (j.file.ok) { report.files.opened++; report.fullTextEligible++; }
        else { report.files.refused++; report.files.reasons[j.file.reason] = (report.files.reasons[j.file.reason] || 0) + 1; }
      }

      if (j.match) {
        report.duplicates[j.match.via]++;
        // Identified by DOI, ISBN or the provider's id → fill what is empty. A title-only match is
        // a suggestion and the row is left exactly as it is.
        if (j.match.via !== 'title') {
          const existing = await db.book.findUnique({ where: { id: j.match.bookId } });
          const patch: Record<string, any> = existing ? fillEmptyPatch(existing, b, b.isbns[0] || null, b.subjects[0] || null, { sameProvider: existing.source === cfg.provider }) : {};
          const sources = existing ? sourcesPatch(existing, j, cfg) : null;
          if (sources) patch.metadata = sources;
          const lic = existing ? licencePatch(existing, j, cfg, patch.metadata ?? existing.metadata) : null;
          if (lic?.licence) { patch.licence = lic.licence; patch.licenceIsNC = lic.licenceIsNC; report.licenceFilled++; }
          if (lic?.metadata) { patch.metadata = lic.metadata; if (!lic.licence) report.licenceConflicts++; }
          const cap = opts.maxWrites;
          const writes = report.added + report.queuedForReview + report.enriched;
          if (!dry && cap != null && writes >= cap) continue;       // a capped run caps every kind of write
          if (Object.keys(patch).length) {
            report.enriched++;
            if (!dry) await db.book.update({ where: { id: j.match.bookId }, data: patch }).catch((e: any) => { report.failed++; report.firstError ||= String(e?.message || e).slice(0, 300); });
          }
        }
        continue;
      }

      report.newCandidates++;
      report.department[j.verdict.band]++;
      if (j.verdict.department) report.department.byDepartment[j.verdict.department] = (report.department.byDepartment[j.verdict.department] || 0) + 1;
      else if (j.verdict.band === 'review' && j.verdict.suggested) report.department.suggestions[j.verdict.suggested] = (report.department.suggestions[j.verdict.suggested] || 0) + 1;
      report.access[j.access.access]++;
      const lk = b.licence || '(none declared)';
      report.licences[lk] = (report.licences[lk] || 0) + 1;
      if (report.sample.length < SAMPLE) {
        report.sample.push({
          title: b.title, authors: b.authors || b.editors, publisher: b.publisherName, year: b.year, doi: b.doi, isbn: b.isbns[0] || null,
          codes: b.classifications, keywords: b.subjects.slice(0, 5),
          band: j.verdict.band, department: j.verdict.department, suggested: j.verdict.suggested, score: j.verdict.score,
          runnerUp: j.verdict.runnerUp,
          licence: b.licence, licenceBasis: b.licenceBasis, access: j.access.access, file: j.file, url: b.externalUrl || b.landingUrl, handle: b.sourceRecordId,
        });
      }

      // A clearly-classified book is catalogued. A plausible but unclear one becomes a non-public
      // Draft for a person to place, so it is not lost behind the checkpoint. No reliable match is
      // logged and nothing more: it is never given a department to make a number look better.
      if (cfg.allowedDepartments && j.verdict.band !== 'none' && !(j.verdict.suggested && cfg.allowedDepartments.includes(j.verdict.suggested))) { report.outsideScope++; continue; }
      if (j.verdict.band === 'none') continue;
      if (dry) { j.verdict.band === 'strong' ? report.added++ : report.queuedForReview++; continue; }
      if (opts.maxWrites != null && report.added + report.queuedForReview + report.enriched >= opts.maxWrites) continue;
      try {
        await db.book.create({ data: bookRow(j, cfg, j.verdict.band === 'strong' ? 'Published' : 'Draft') });
        j.verdict.band === 'strong' ? report.added++ : report.queuedForReview++;
      } catch (e: any) {
        report.failed++; report.firstError ||= String(e?.message || e).slice(0, 300);
      }
    }

    if (page.deferred) report.deferred = page.deferred;
    // The page is done. Only now is it safe to remember where the next one starts.
    token = page.next;
    report.nextCursor = token;
    if (keepsCheckpoint) await db.bookHarvestCheckpoint.update({ where: { provider: cfg.provider }, data: { cursor: token } });
    if (page.stop) break;                                          // a dry-run sample is complete
    if (page.deferred) break;                                      // a daily limit: resume from the saved position later
    if (!token) { report.completed = true; break; }
    if (opts.maxWrites != null && report.added + report.queuedForReview + report.enriched >= opts.maxWrites) break;
    await (opts.pageDelayMs === 0 ? Promise.resolve() : sleep(opts.pageDelayMs ?? 1000));
  }

  if (report.completed && keepsCheckpoint && boundary) {
    await db.bookHarvestCheckpoint.update({
      where: { provider: cfg.provider },
      data: { cursor: null, lastSuccessfulSyncAt: boundary, harvestStartedAt: null },
    });
  }
  return report;
}

/** One harvest at a time per provider in this process; the timer and a manual pass must not both walk the same token. */
const running = new Set<string>();

/** How long to leave a provider alone after a harvest that reached the end. New records are rare by the hour. */
export const OAI_RESYNC_MINUTES = 6 * 60;

/** Kept under its old name: the OAI providers and Open Textbook Library share this one harvest. */
export const harvestOai = harvestFeed;

/**
 * The engine's entry point. Returns null when there is nothing to do right now — a harvest is
 * already running, or the last one finished recently — so the pass can go on to other work.
 */
export async function runScheduledHarvest(cfg: OaiProviderConfig, opts: HarvestOptions = {}): Promise<HarvestReport | null> {
  const db = opts.db ?? ingestionDb;
  if (running.has(cfg.provider)) return null;
  // OAPEN waits for DOAB's first full harvest, so what DOAB already holds is enriched rather than created twice.
  if (cfg.after) {
    const prior = await readCheckpoint(db, cfg.after);
    if (!prior?.lastSuccessfulSyncAt) return null;
  }
  const cp = await readCheckpoint(db, cfg.provider);
  const now = (opts.now ?? (() => new Date()))();
  if (!cp?.cursor && cp?.lastSuccessfulSyncAt && now.getTime() - cp.lastSuccessfulSyncAt.getTime() < (cfg.resyncMinutes ?? OAI_RESYNC_MINUTES) * 60_000) return null;
  running.add(cfg.provider);
  try { return await harvestFeed(cfg, opts); } finally { running.delete(cfg.provider); }
}
