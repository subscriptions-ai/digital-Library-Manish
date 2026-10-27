import { ingestionDb } from '../db.js';
import { bookMinYear, bookYearVerdict } from '../yearPolicy.js';
import { fetchSourceJson, SourceParseError, recordSourceFailure } from '../sourceHealth.js';
import { parseOaiPage, type OaiRecord } from './oaiXml.js';
import { normaliseOtlBook, OTL_BASE } from './otl.js';
import { fetchOpenLibraryPage, normaliseOpenLibraryDoc, OPENLIBRARY_SEARCH } from './openLibrary.js';
import { parseNcbiList, rowStub, fetchArchive, normaliseNcbi, ncbiLimits, buildQueue, interleave, departmentOrder, departmentCoverage, NCBI_LIST_URL, NCBI_PROVIDER, NCBI_TARGET_DEPARTMENTS, NCBI_CONNECT_TIMEOUT_MS, type NcbiRow, type Stage1 } from './ncbi.js';
import { normaliseOaiBook, judgeBookAccess, bookFullTextEnabled, type NormalisedBook } from './normalise.js';
import { classifyDepartment, type DepartmentVerdict } from './classifier.js';
import { findHeldBooks, bookFingerprint, type BookMatch } from './dedupe.js';
import { fillEmptyPatch } from './merge.js';
import { FileChecker, type FileVerdict } from './fileCheck.js';
import { licenceAllowsCommercialUse } from '../eligibility.js';
import { tryLockProvider, unlockProvider, providerHolder } from '../providerLocks.js';
import { bump, type DeptStats } from '../departmentStats.js';
import { reconcile, type Reconciliation } from '../accounting.js';
import { routingSession, type RoutingTally } from '../reviewIngestRouting.js';
import { extraBatch } from './extraKinds.js';
import { CROSSREF_WORKS } from './crossrefBooks.js';
import { NLM_EUTILS, NLM_PROVIDER, NLM_TARGET_DEPARTMENTS } from './nlmCatalog.js';
import { PRESSBOOKS_OPDS, PRESSBOOKS_PROVIDER } from './pressbooks.js';
import { OPENLIBRARY_DUMP_URL, OPENLIBRARY_DUMP_PROVIDER } from './openLibraryDump.js';

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
  kind?: 'oai' | 'otl' | 'ncbi' | 'openlibrary' | 'crossrefbooks' | 'nlm' | 'pressbooks' | 'olbulk';
  /** A subject-searchable provider: the phrases to ask for, in turn. The cursor is "<phrase index>|<page>". Used by targeted runs only. */
  queries?: string[];
  /**
   * Nothing from this provider is published on the classifier's word alone: even a clearly classified book waits as a Draft for a
   * person. For a provider that lists books of every kind and says nothing about rights.
   */
  reviewFirst?: boolean;
  /**
   * Only a book the classifier places with confidence is kept; a plausible-but-unclear one is skipped (counted, with its reason) rather than queued
   * for review. For a provider so large that its unclear books would bury the review queue (the Open Library dump).
   */
  strongOnly?: boolean;
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

/**
 * Open Library: searched by subject for a department that holds few books. Review-first and Metadata Only (see openLibrary.ts).
 * It has no checkpoint and no feed to walk: it is only ever read by a targeted run, which keeps its own place.
 */
export const OPENLIBRARY_FEED: OaiProviderConfig = {
  provider: 'OpenLibrary',
  kind: 'openlibrary',
  baseUrl: OPENLIBRARY_SEARCH,
  set: '',
  metadataPrefix: '',
  label: 'Open Library (subject search)',
  handleBase: 'https://openlibrary.org',
  reviewFirst: true,
};

/**
 * Crossref Books: scholarly book metadata by DOI. Metadata Only, review-first (Crossref carries no controlled code, so the classifier can
 * only say "review"). See crossrefBooks.ts.
 */
export const CROSSREF_BOOKS_FEED: OaiProviderConfig = {
  provider: 'CrossrefBooks', kind: 'crossrefbooks', baseUrl: CROSSREF_WORKS, set: '', metadataPrefix: '',
  label: 'Crossref Books (metadata)', handleBase: 'https://doi.org/', reviewFirst: true, resyncMinutes: 24 * 60,
};

/**
 * NLM Catalog: bibliographic records for health books, with the NLM classification as a controlled code. Metadata Only. See nlmCatalog.ts.
 * Not NCBI Bookshelf (open access texts, its own quota): a separate source with a separate health row.
 */
export const NLM_FEED: OaiProviderConfig = {
  provider: NLM_PROVIDER, kind: 'nlm', baseUrl: NLM_EUTILS, set: '', metadataPrefix: '',
  label: 'NLM Catalog (metadata)', handleBase: 'https://www.ncbi.nlm.nih.gov/nlmcatalog/', resyncMinutes: 7 * 24 * 60,
  allowedDepartments: NLM_TARGET_DEPARTMENTS,
};

/** Pressbooks Directory: openly published textbooks; the licence is read from each book's own site. Review-first. See pressbooks.ts. */
export const PRESSBOOKS_FEED: OaiProviderConfig = {
  provider: PRESSBOOKS_PROVIDER, kind: 'pressbooks', baseUrl: PRESSBOOKS_OPDS, set: '', metadataPrefix: '',
  label: 'Pressbooks Directory (OPDS)', handleBase: '', reviewFirst: true, resyncMinutes: 7 * 24 * 60,
};

/**
 * Open Library's monthly data dump: the bulk source. BULK ONLY — never in the continuous rotation. Strong-only: an edition is catalogued
 * (Metadata Only) when the classifier places it with confidence, and skipped with a counted reason otherwise. See openLibraryDump.ts.
 */
export const OPENLIBRARY_DUMP_FEED: OaiProviderConfig = {
  provider: OPENLIBRARY_DUMP_PROVIDER, kind: 'olbulk', baseUrl: OPENLIBRARY_DUMP_URL, set: '', metadataPrefix: '',
  label: 'Open Library data dump (bulk)', handleBase: 'https://openlibrary.org', strongOnly: true,
};

export type HarvestOptions = {
  dryRun?: boolean;
  /** The book policy year (yearPolicy.ts). Absent: read from the engine's saved settings. */
  bookMinYear?: number;
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
  /**
   * A MANUAL run (an administrator's Quick Import, or the write step of a one-off book import).
   *
   * It does everything a harvest does — fetch, normalise, dedupe, classify, judge rights, write — and
   * nothing to the provider's checkpoint: not the saved token, not the start stamp, not the last-sync
   * time. It begins from `startToken` / `from` (its own position, held by the caller) and reports where
   * it stopped in `nextCursor`. The continuous harvest therefore resumes exactly where it was.
   */
  manual?: boolean;
  /** Stop after the page that brings the records examined to at least this many. */
  maxRecords?: number;
  /** NCBI: read at most this many archives, still strictly by tier, still under the daily limits. */
  archiveCap?: number;
  /** Called after every page, with the report so far. */
  onPage?: (report: HarvestReport) => void;
  db?: any;
  now?: () => Date;
  sleep?: (ms: number) => Promise<any>;
};

export type HarvestReport = {
  /** Clearly classified books held for review only because of the book year policy (older than it, or no year). Never refused for it. */
  heldForYear: { older: number; noYear: number };
  /** Future-ingestion routing (Review Automation R3A) for the Drafts this harvest wrote. Present only when that gate was on and routing ran; the harvest's own counts are unchanged by it. */
  routing?: RoutingTally;
  provider: string; dryRun: boolean;
  pages: number; fetched: number; deleted: number; unusable: number;
  /** Records the provider listed that it says have not changed since our last sync, so they were not judged again. Counted as skipped. */
  unchanged: number;
  /** Records read and rejected by the provider's own pre-filter (bulk dumps), and why. Counted as skipped. */
  filtered: number;
  filterReasons: Record<string, number>;
  /** Books a strong-only provider read whose department was not clear enough; skipped, never queued. */
  weakSkipped: number;
  /** Books judged fit to write that a capped run (`maxWrites`) stopped short of. Counted as skipped, and re-read next time. */
  notWritten: number;
  newCandidates: number;
  duplicates: { doi: number; isbn: number; sourceRecordId: number; fingerprint: number; title: number; inRun: number };
  enriched: number;
  department: { strong: number; review: number; none: number; byDepartment: Record<string, number>; suggestions: Record<string, number> };
  access: { FullText: number; OpenExternal: number; MetadataOnly: number };
  licences: Record<string, number>;
  added: number; queuedForReview: number; failed: number; firstError: string | null;
  /**
   * The department breakdown, counted as each book's fate is decided (see departmentStats.ts). '' is unassigned / needs review.
   * Σ added = `added`, Σ sentToReview = `queuedForReview`, Σ failed = `failed`, Σ held = every kind of duplicate.
   */
  departmentStats: DeptStats;
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
  /** How many DIFFERENT books the run examined, by identifier (DOI, else ISBN, else the provider's id, else the title). `fetched` counts a repeat each time it is seen. */
  uniqueCandidates: number;
  /** Whether every record fetched ended in exactly one bucket. Null for NCBI, whose "checked" counts archives read rather than records listed. */
  accounting: Reconciliation | null;
};

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const defaultSleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const SAMPLE = 40;

export function emptyReport(provider: string, dryRun: boolean): HarvestReport {
  return {
    provider, dryRun, pages: 0, fetched: 0, deleted: 0, unusable: 0, unchanged: 0, filtered: 0, filterReasons: {}, weakSkipped: 0, notWritten: 0, uniqueCandidates: 0, accounting: null, newCandidates: 0,
    duplicates: { doi: 0, isbn: 0, sourceRecordId: 0, fingerprint: 0, title: 0, inRun: 0 }, enriched: 0,
    department: { strong: 0, review: 0, none: 0, byDepartment: {}, suggestions: {} },
    access: { FullText: 0, OpenExternal: 0, MetadataOnly: 0 }, licences: {},
    added: 0, queuedForReview: 0, failed: 0, firstError: null, departmentStats: {}, completed: false, fullTextEligible: 0, licenceFilled: 0, licenceConflicts: 0, outsideScope: 0, deferred: null, ncbi: null, heldForYear: { older: 0, noYear: 0 },
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
      verdict: classifyDepartment({ classifications: book.classifications, subjects: book.subjects, title: book.title, description: book.description, lcc: book.lcc, nlm: Array.isArray((book.extra as any)?.nlmClass) ? (book.extra as any).nlmClass : undefined }),
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

/**
 * The department of each book already held that this page matched: the department it was published into, or unassigned
 * ('') when it is itself waiting for review. Read from the held row now, so a book edited or moved since is counted where
 * it is, not where it once was.
 */
async function heldDepartments(db: any, judged: Judged[]): Promise<Map<string, string>> {
  const ids = [...new Set(judged.filter(j => j.match).map(j => j.match!.bookId))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rows: any[] = await db.book.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, domain: true } });
  for (const r of rows) out.set(r.id, r.status === 'Published' && r.domain ? r.domain : '');
  return out;
}

/** Fetch one page, returning the parsed page or a reason it could not be had. */
export async function fetchPage(cfg: OaiProviderConfig, token: string | null, from: string | null) {
  const url = token
    ? `${cfg.baseUrl}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`
    : `${cfg.baseUrl}?verb=ListRecords&metadataPrefix=${cfg.metadataPrefix}&set=${encodeURIComponent(cfg.set)}`
      + (from ? `&from=${encodeURIComponent(from)}` : '');
  const r = await fetchSourceJson(url, {
    text: true, timeoutMs: 90_000, attempts: 3, countClientErrors: true,
    headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` },
    // Checked before the request counts as having worked: a page that is not XML, or that is an OAI refusal, is the provider failing —
    // not a success followed by an exception, which would reset the failure count every time and keep the source in the rotation for ever.
    // "No records" and "bad resumption token" are ordinary answers the harvest handles itself.
    parse: (body: any) => {
      let page: ReturnType<typeof parseOaiPage>;
      try { page = parseOaiPage(String(body)); } catch { throw new SourceParseError('invalid_xml', 'The reply was not valid OAI-PMH XML'); }
      if (!page.error && !page.records.length && !/<OAI-PMH[\s>]/.test(String(body).slice(0, 2000))) throw new SourceParseError('invalid_xml', 'The reply was not an OAI-PMH document');
      // The set or the format we ask for no longer exists: the source has changed under us, which is not the same as the source failing.
      if (page.error && ['cannotDisseminateFormat', 'noSetHierarchy'].includes(page.error.code)) throw new SourceParseError('source_changed', `OAI error ${page.error.code}`);
      if (page.error && !['noRecordsMatch', 'badResumptionToken'].includes(page.error.code)) throw new SourceParseError('oai_protocol', `OAI error ${page.error.code}`);
      return page;
    },
  });
  if (!r.ok) return { error: r.error || `HTTP ${r.status}`, paused: !!r.paused, kind: r.errorKind } as const;
  return { page: r.json as ReturnType<typeof parseOaiPage> } as const;
}

/**
 * An xoai resumptionToken is stateless and says where it is: `xoai/<from>/<until>/<set>/<offset>`. For DISPLAY only — how far into the
 * list a harvest has got. It never judges a token: whether the source still honours one is for the source to say (badResumptionToken),
 * because refusing a token on its shape would block a harvest for good the day the format changes.
 */
export function describeOaiToken(_cfg: unknown, token: string | null): { offset: number | null; from: string | null } {
  if (!token) return { offset: null, from: null };
  const parts = token.split('/');
  const offset = /^\d+$/.test(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : null;
  return { offset, from: parts[0] === 'xoai' && parts[1] ? parts[1] : null };
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
  /** Records the provider lists as unchanged since the last sync: counted in `count`, not judged, accounted as skipped. */
  unchanged?: number;
  /** Records read and deliberately not taken as candidates (a bulk dump's non-academic lines), with the reason for each. Counted in `count`, accounted as skipped. */
  filtered?: number;
  filterReasons?: Record<string, number>;
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
    if (ctx.archiveCap != null && st.archives >= ctx.archiveCap) { stop = 'archive cap'; break; }
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
  // A bounded sample is finished when it says so; a manual run that reached its archive cap is only paused, and keeps its place.
  const more = i < seq.length && (!stop || stop === 'archive cap');
  return { books, count: i - start, deleted: 0, unusable: 0, next: more ? `${i}@${order.join('|')}` : null, total: seq.length, error: null, deferred, stop };
}

export type BatchContext = { db: any; report: HarvestReport; /** The book policy year, for a provider that can be asked for nothing older. */ minYear?: number; maxArchives?: number; archiveCap?: number; pauseMs?: number };

export async function fetchBatch(cfg: OaiProviderConfig, token: string | null, from: string | null, ctx?: BatchContext): Promise<Batch | { failed: string }> {
  if (cfg.kind === 'ncbi') return ncbiBatch(cfg, token, ctx!);
  if (cfg.kind === 'crossrefbooks' || cfg.kind === 'nlm' || cfg.kind === 'pressbooks' || cfg.kind === 'olbulk') return (await extraBatch(cfg, token, from, ctx))!;
  if (cfg.kind === 'openlibrary') {
    const queries = cfg.queries ?? [];
    const [qi, pg] = (token || '0|1').split('|').map(Number);
    const qIndex = Number.isInteger(qi) && qi >= 0 ? qi : 0, page = Number.isInteger(pg) && pg >= 1 ? pg : 1;
    if (qIndex >= queries.length) return { books: [], count: 0, deleted: 0, unusable: 0, next: null, total: null, error: null };
    const r = await fetchOpenLibraryPage(queries[qIndex], page, undefined, ctx?.minYear);
    if (!r.ok) return { failed: r.error || `HTTP ${r.status}` };
    const docs: any[] = r.json.docs;
    const books: NormalisedBook[] = [];
    let unusable = 0;
    for (const d of docs) { const b = normaliseOpenLibraryDoc(cfg.provider, d); if (b) books.push(b); else unusable++; }
    // A short page is the end of that phrase; the next phrase starts at its first page. Nothing left at all ends the run.
    const more = docs.length >= 20 && page < 5;
    const next = more ? `${qIndex}|${page + 1}` : qIndex + 1 < queries.length ? `${qIndex + 1}|1` : null;
    return { books, count: docs.length, deleted: 0, unusable, next, total: Number(r.json?.numFound) || null, error: null };
  }
  if (cfg.kind === 'otl') {
    const page = token ? Number(token) : 1;
    const r = await fetchSourceJson(`${cfg.baseUrl}?page=${page}`, {
      timeoutMs: 90_000, attempts: 3, countClientErrors: true, headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` },
      // A reply that is not the list we expect is a failure, not an empty last page: the harvest must not read it as "finished" — and it must count against the source.
      parse: (body: any) => { if (!Array.isArray(body?.data)) throw new SourceParseError('invalid_response', 'Open Textbook Library sent a response in a shape we do not recognise'); return body; },
    });
    if (!r.ok) return { failed: r.error || `HTTP ${r.status}` };
    const items: any[] = r.json.data;
    // The library reports more pages than it has (202 claimed, 189 with books): an empty page is the end.
    const totalPages = items.length ? Number(r.json?.links?.total_pages) || page : page;
    let unusable = 0;
    // The library has no "changed since": a book last updated before our last sync was already judged then.
    const since = from ? Date.parse(from) : NaN;
    const books: NormalisedBook[] = [];
    let unchanged = 0;
    for (const it of items) {
      const b = normaliseOtlBook(cfg.provider, it);
      if (!b) { unusable++; continue; }
      // Counted, not dropped: this record WAS examined, so it must end in a bucket (skipped: unchanged since the last sync).
      if (Number.isFinite(since) && b.modified && Date.parse(b.modified) < since) { unchanged++; continue; }
      books.push(b);
    }
    return { books, count: items.length, deleted: 0, unusable, unchanged, next: page < totalPages ? String(page + 1) : null, total: Number(r.json?.links?.total_count) || null, error: null };
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
  const keepsCheckpoint = !dry && opts.maxWrites == null && !opts.manual;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => new Date());
  const report = emptyReport(cfg.provider, dry);
  // The book year policy: a new book from this year on is published the normal way; an older one, or one with no year, waits for review.
  const minYear = opts.bookMinYear ?? bookMinYear(await db.ingestionState?.findUnique?.({ where: { id: 'singleton' }, select: { bookMinYear: true } }).catch(() => null));
  const seenInRun = new Set<string>();
  const seenDept = new Map<string, string>();
  const uniqueKeys = new Set<string>();
  const checker = cfg.verifyFiles ? new FileChecker() : null;
  // Newly written Drafts may be given a department by future-ingestion routing (off unless its own gate is on). It only ever sees the id of a row created by THIS run.
  const routing = routingSession(cfg.provider);

  let cp = await readCheckpoint(db, cfg.provider);
  const ignoreCp = (dry || !keepsCheckpoint) && !!opts.ignoreCheckpoint;
  let token: string | null = !keepsCheckpoint && opts.startToken ? opts.startToken : ignoreCp ? null : cp?.cursor ?? null;
  let from: string | null = null;
  let boundary: Date | null = cp?.harvestStartedAt ?? null;
  report.resumedFrom = token;

  if (keepsCheckpoint && token) await db.bookHarvestCheckpoint.updateMany({ where: { provider: cfg.provider }, data: { lastAttemptAt: now() } }).catch(() => {});

  if (!token) {
    // A new harvest. Stamp its start now; everything changed after this is the next sync's to find.
    const last: Date | null = ignoreCp ? null : cp?.lastSuccessfulSyncAt ?? null;
    // A minute of overlap covers clock skew between us and the provider; dedupe makes the overlap free.
    from = opts.from ?? (last ? iso(new Date(last.getTime() - 60_000)) : null);
    boundary = now();
    if (keepsCheckpoint) {
      cp = await db.bookHarvestCheckpoint.upsert({
        where: { provider: cfg.provider },
        create: { provider: cfg.provider, cursor: null, harvestStartedAt: boundary, lastAttemptAt: boundary },
        update: { harvestStartedAt: boundary, cursor: null, lastAttemptAt: boundary },
      });
    }
  }

  const maxPages = opts.maxPages ?? 3;
  for (let n = 0; n < maxPages; n++) {
    const got = await fetchBatch(cfg, token, from, { db, report, minYear, maxArchives: opts.maxArchives ?? (dry && cfg.kind === 'ncbi' && opts.archiveCap == null ? 25 : undefined), archiveCap: opts.archiveCap, pauseMs: opts.pageDelayMs });
    if ('failed' in got) { report.sourceError = got.failed; break; }                          // stay put; resume later
    const page = got;

    if (page.error) {
      // A FIRST full harvest has no completed sync behind it: its cursor is the only record of how far it got. An empty answer to that very
      // token ("no records at this offset") is far more likely the repository's index stumbling than the end of a 70,000-record list — the
      // real last page carries no token — so it is not allowed to mark the harvest complete (which would skip the rest for good).
      const firstHarvestResume = keepsCheckpoint && n === 0 && !!report.resumedFrom && !cp?.lastSuccessfulSyncAt && (describeOaiToken(cfg, report.resumedFrom).offset ?? 0) > 0;
      if (page.error.code === 'noRecordsMatch' && firstHarvestResume) {
        report.sourceError = `INVALID_RESUMPTION_TOKEN: the source answered "no records" at offset ${describeOaiToken(cfg, report.resumedFrom).offset} of an unfinished first harvest. The checkpoint was kept and the harvest was not marked complete; it will be asked again.`;
        await recordSourceFailure(cfg.provider, report.sourceError, 'invalid_resumption_token');
        break;
      }
      if (page.error.code === 'noRecordsMatch') { token = null; report.completed = true; break; }   // nothing new since last sync
      if (page.error.code === 'badResumptionToken') {
        if (keepsCheckpoint && !cp?.lastSuccessfulSyncAt) {
          // First full harvest, token rejected. Restarting would silently re-read everything from the beginning; keep the place instead and say so.
          const at = describeOaiToken(cfg, token).offset;
          report.sourceError = `INVALID_RESUMPTION_TOKEN: ${cfg.provider} no longer honours the saved token (offset ${at ?? 'unknown'}). The checkpoint was kept and nothing was restarted; a person must decide.`;
          await recordSourceFailure(cfg.provider, report.sourceError, 'invalid_resumption_token');
          break;
        }
        // An incremental sync (or a run that never owned the checkpoint): start again from the last successful sync; dedupe absorbs the overlap.
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
    report.deleted += page.deleted; report.unusable += page.unusable; report.unchanged += page.unchanged ?? 0; report.filtered += page.filtered ?? 0;
    for (const [k, v] of Object.entries(page.filterReasons ?? {})) report.filterReasons[k] = (report.filterReasons[k] || 0) + v;
    // Records that were never books (deleted at the source, or unreadable) or that the source says are unchanged since our last sync
    // are skipped, with no department to put them in. Every record fetched ends in a bucket; none is dropped.
    if (page.deleted + page.unusable + (page.unchanged ?? 0) + (page.filtered ?? 0)) bump(report.departmentStats, '', 'skipped', page.deleted + page.unusable + (page.unchanged ?? 0) + (page.filtered ?? 0));
    const heldDept = await heldDepartments(db, judged);
    const stats: DeptStats = report.departmentStats;

    // Books already held come first: enriching what we have matters more than adding, and a capped run
    // must not spend its whole allowance on new books before reaching the matches.
    for (const j of [...judged.filter(x => x.match), ...judged.filter(x => !x.match)]) {
      const b = j.book;
      uniqueKeys.add(b.doi ? `doi:${b.doi}` : b.isbns[0] ? `isbn:${b.isbns[0]}` : b.sourceRecordId ? `id:${b.sourceRecordId}` : `t:${String(b.title).toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 120)}`);
      // The same book twice in one run (e.g. two records sharing a DOI) is a duplicate of the first.
      const keys = [b.doi && `doi:${b.doi}`, ...b.isbns.map(i => `isbn:${i}`), b.sourceRecordId && `id:${b.sourceRecordId}`].filter(Boolean) as string[];
      // Where this book will count: the held book's department, or — for a new one — the department it would be published into.
      const here = j.match ? (heldDept.get(j.match.bookId) ?? '') : (j.verdict.band === 'strong' ? (j.verdict.department || '') : '');
      if (!j.match && keys.some(k => seenInRun.has(k))) {
        report.duplicates.inRun++;
        bump(stats, seenDept.get(keys.find(k => seenInRun.has(k))!) ?? '', 'held');     // held by the first sighting, in that one's department
        continue;
      }
      keys.forEach(k => { seenInRun.add(k); seenDept.set(k, here); });

      if (j.file) {
        report.files.checked++;
        if (j.file.ok) { report.files.opened++; report.fullTextEligible++; }
        else { report.files.refused++; report.files.reasons[j.file.reason] = (report.files.reasons[j.file.reason] || 0) + 1; }
      }

      if (j.match) {
        report.duplicates[j.match.via]++;
        bump(stats, heldDept.get(j.match.bookId) ?? '', 'held');
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
          if (!dry && cap != null && writes >= cap) continue;       // a capped run caps every kind of write (already counted held above)
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
      if (cfg.allowedDepartments && j.verdict.band !== 'none' && !(j.verdict.suggested && cfg.allowedDepartments.includes(j.verdict.suggested))) { report.outsideScope++; bump(stats, here, 'skipped'); continue; }
      if (j.verdict.band === 'none') { bump(stats, '', 'skipped'); continue; }
      // A strong-only provider keeps only what the classifier places with confidence; the rest is counted as skipped, never queued.
      if (cfg.strongOnly && j.verdict.band !== 'strong') { report.weakSkipped++; bump(stats, '', 'skipped'); continue; }
      // A review-first provider publishes nothing by itself: a clearly classified book still waits for a person.
      // The book year policy: a clearly classified book that is older than the policy year, or has no year, is NOT refused — it waits for a
      // person, who may approve an important older title. Nothing is given a year it does not have.
      const yv = bookYearVerdict(b.year, minYear);
      const publishes = j.verdict.band === 'strong' && !cfg.reviewFirst && yv.ok;
      if (j.verdict.band === 'strong' && !cfg.reviewFirst && !yv.ok) report.heldForYear[yv.outcome === 'older' ? 'older' : 'noYear']++;
      if (dry) { if (publishes) { report.added++; bump(stats, here, 'added'); } else { report.queuedForReview++; bump(stats, '', 'sentToReview'); } continue; }
      if (opts.maxWrites != null && report.added + report.queuedForReview + report.enriched >= opts.maxWrites) { report.notWritten++; bump(stats, here, 'skipped'); continue; }
      try {
        const row: any = bookRow(j, cfg, publishes ? 'Published' : 'Draft');
        if (!yv.ok) row.metadata = { ...row.metadata, harvest: { ...(row.metadata?.harvest || {}), yearPolicy: { outcome: yv.outcome, reason: yv.reason, minYear } } };
        const created = await db.book.create({ data: row });
        if (!publishes) await routing.route(created.id);          // never throws; changes only the department of this new Draft, and only when it is High confidence
        // Published: counted in the department it was published into. Waiting for review: unassigned, whatever it suggests.
        if (publishes) { report.added++; bump(stats, here, 'added'); } else { report.queuedForReview++; bump(stats, '', 'sentToReview'); }
      } catch (e: any) {
        report.failed++; bump(stats, here, 'failed'); report.firstError ||= String(e?.message || e).slice(0, 300);
      }
    }

    await routing.flush();
    if (routing.tally) report.routing = routing.tally;
    if (page.deferred) report.deferred = page.deferred;
    // The page is done. Only now is it safe to remember where the next one starts.
    token = page.next;
    report.nextCursor = token;
    if (keepsCheckpoint) await db.bookHarvestCheckpoint.update({ where: { provider: cfg.provider }, data: { cursor: token, lastPageAt: now() } });
    opts.onPage?.(report);
    if (page.stop) break;                                          // a dry-run sample is complete
    if (page.deferred) break;                                      // a daily limit: resume from the saved position later
    if (!token) { report.completed = true; break; }
    if (opts.maxWrites != null && report.added + report.queuedForReview + report.enriched >= opts.maxWrites) break;
    if (opts.maxRecords != null && report.fetched >= opts.maxRecords) break;
    await (opts.pageDelayMs === 0 ? Promise.resolve() : sleep(opts.pageDelayMs ?? 1000));
  }

  report.uniqueCandidates = uniqueKeys.size;
  // Every record fetched must have ended in exactly one bucket. (NCBI reports archives read as its "checked", a different unit.)
  if (cfg.kind !== 'ncbi') {
    const t = Object.values(report.departmentStats).reduce((a, c) => ({ added: a.added + c.added, held: a.held + c.held, review: a.review + c.sentToReview, skipped: a.skipped + c.skipped, failed: a.failed + c.failed }), { added: 0, held: 0, review: 0, skipped: 0, failed: 0 });
    report.accounting = reconcile({ checked: report.fetched, added: t.added, alreadyHeld: t.held, review: t.review, skipped: t.skipped, failed: t.failed });
    if (!report.accounting.ok) console.error(`[ingest] ${cfg.provider}: ${report.accounting.message}`);
  }

  if (report.completed && keepsCheckpoint && boundary) {
    await db.bookHarvestCheckpoint.update({
      where: { provider: cfg.provider },
      data: { cursor: null, lastSuccessfulSyncAt: boundary, harvestStartedAt: null },
    });
  }
  return report;
}

/**
 * Where a continuous harvest stands, in words a card can show. Read-only. `lastPageAt` is the last page that arrived and was fully
 * processed — the honest "last successful import"; `lastAttemptAt` is the last time the engine tried, which can be today while the
 * last page was a month ago. `lastRequestOkAt` is the health row's last answered request (a probe or a Quick Import counts there too).
 */
export async function harvestDiagnostics(cfg: OaiProviderConfig, db: any = ingestionDb) {
  if ((cfg.kind ?? 'oai') !== 'oai' && cfg.kind !== 'otl') return null;
  const [cp, h] = await Promise.all([
    readCheckpoint(db, cfg.provider).catch(() => null),
    db.ingestionSourceHealth.findUnique({ where: { source: cfg.provider } }).catch(() => null),
  ]);
  const seen = cfg.kind === 'otl' ? { offset: cp?.cursor ? Math.max(0, (Number(cp.cursor) - 1)) : null } : describeOaiToken(cfg, cp?.cursor ?? null);
  const state: 'not_started' | 'mid_harvest' | 'idle' = cp?.cursor ? 'mid_harvest' : cp?.lastSuccessfulSyncAt ? 'idle' : 'not_started';
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
  return {
    checkpoint: {
      state,
      /** How far into the current harvest's list it has got (OAI: records passed; Open Textbook Library: pages passed). Null when idle. */
      position: state === 'mid_harvest' ? seen.offset : null,
      positionUnit: cfg.kind === 'otl' ? 'pages' : 'records',
      since: iso(cp?.harvestStartedAt), lastSuccessfulSyncAt: iso(cp?.lastSuccessfulSyncAt),
    },
    lastPageAt: iso(cp?.lastPageAt), lastAttemptAt: iso(cp?.lastAttemptAt), lastRequestOkAt: iso(h?.lastOkAt), lastFailureAt: iso(h?.lastFailureAt),
    // There is no second route today: OAI-PMH is the only one in use (DOAB's REST search is a rollback path that refuses unlisted addresses).
    fallback: { active: false, available: false },
  };
}

/** One harvest at a time per provider in this process: the timer, a manual pass and a Quick Import all go through providerLocks. */

/** How long to leave a provider alone after a harvest that reached the end. New records are rare by the hour. */
export const OAI_RESYNC_MINUTES = 6 * 60;

/** Kept under its old name: the OAI providers and Open Textbook Library share this one harvest. */
export const harvestOai = harvestFeed;

/**
 * The engine's entry point. Returns null when there is nothing to do right now — a harvest is
 * already running, or the last one finished recently — so the pass can go on to other work.
 */
/**
 * Is a pass over this provider due? (Nothing locked, nothing taken: the caller decides who holds the provider.)
 *
 * `waitForAfter` is the old rule that OAPEN, OTL and NCBI wait for DOAB's first full harvest, so what DOAB already holds is
 * enriched rather than created twice. Under the fair rotation each provider takes its turn independently — a first DOAB harvest
 * takes hundreds of turns, and a failing DOAB must never hold the others back — so the rotation passes false, and a book
 * another provider created is simply found by the DOI, ISBN or id match when it arrives.
 */
export async function harvestDue(cfg: OaiProviderConfig, opts: HarvestOptions & { waitForAfter?: boolean } = {}): Promise<boolean> {
  const db = opts.db ?? ingestionDb;
  if (cfg.after && opts.waitForAfter !== false) {
    const prior = await readCheckpoint(db, cfg.after);
    if (!prior?.lastSuccessfulSyncAt) return false;
  }
  const cp = await readCheckpoint(db, cfg.provider);
  const now = (opts.now ?? (() => new Date()))();
  if (!cp?.cursor && cp?.lastSuccessfulSyncAt && now.getTime() - cp.lastSuccessfulSyncAt.getTime() < (cfg.resyncMinutes ?? OAI_RESYNC_MINUTES) * 60_000) return false;
  return true;
}

export async function runScheduledHarvest(cfg: OaiProviderConfig, opts: HarvestOptions = {}): Promise<HarvestReport | null> {
  const db = opts.db ?? ingestionDb;
  if (providerHolder(cfg.provider)) return null;                  // someone — the timer, or an administrator's manual import — has it
  if (!(await harvestDue(cfg, { ...opts, db }))) return null;
  if (!tryLockProvider(cfg.provider, 'continuous')) return null;
  try { return await harvestFeed(cfg, opts); } finally { unlockProvider(cfg.provider, 'continuous'); }
}
