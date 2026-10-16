import { ingestionDb } from './db.js';
import { sourceHealthState } from './sourceHealth.js';
import { buildProviders } from './providers.js';
import { ncbiLimits, usedToday, NCBI_PROVIDER } from './books/ncbi.js';
import { googleBooksConfigured, googleBooksDailyLimit } from './books/googleBooks.js';
import { loadDumpSource } from './books/extraKinds.js';

/**
 * The Book provider matrix: every Book source on one table, with what it has done, how it is behaving and when it may be asked again.
 *
 * Three different sources of truth, never mixed:
 *   · what the provider DID — summed from the run log (checked, unique, added, already held, review, skipped, failed writes). "Checked" is the
 *     candidates a run examined; it is never the same word as "added";
 *   · how it is BEHAVING — the one source-health row everything writes (health, consecutive vs lifetime request failures, rest and retry time);
 *   · what the catalogue HOLDS from it — counted from the Book table (published, Metadata Only, readable, waiting for review).
 *
 * Sources are grouped by the kind of evidence they give about rights, because that decides what they may do to the catalogue:
 *   OPEN / STRONG RIGHTS      the source states a licence for the book: DOAB, OAPEN, Open Textbook Library, NCBI Bookshelf
 *   METADATA / DISCOVERY      the source says a book exists, never that it may be read: NLM Catalog, Crossref Books, Pressbooks (licence read per book),
 *                             Open Library (search and bulk dump), Google Books (enrichment only)
 */

export type MatrixClass = 'Open / strong rights' | 'Metadata / discovery';
type Def = {
  id: string; label: string; cls: MatrixClass;
  /** How it is used: in the continuous rotation, only by Quick Import and Bulk, only in bulk, or to enrich what is held. */
  mode: 'Continuous' | 'Opt-in (continuous)' | 'Quick Import and Bulk' | 'Bulk only' | 'Targeted search' | 'Enrichment only';
  healthKey: string;
  /** Book.source values this provider writes. */
  bookSources: string[];
  /** IngestionRun.source labels (the run log writes the label, with "Bulk · " in front for bulk runs). */
  runLabels: string[];
  rotationId?: string;
};

export const MATRIX_PROVIDERS: Def[] = [
  { id: 'doab', label: 'DOAB', cls: 'Open / strong rights', mode: 'Continuous', healthKey: 'DOAB', bookSources: ['DOAB'], runLabels: ['DOAB'], rotationId: 'doab' },
  { id: 'oapen', label: 'OAPEN', cls: 'Open / strong rights', mode: 'Continuous', healthKey: 'OAPEN', bookSources: ['OAPEN'], runLabels: ['OAPEN'], rotationId: 'oapen' },
  { id: 'otl', label: 'Open Textbook Library', cls: 'Open / strong rights', mode: 'Continuous', healthKey: 'open.umn.edu', bookSources: ['OpenTextbookLibrary'], runLabels: ['Open Textbook Library'], rotationId: 'otl' },
  { id: 'ncbi', label: 'NCBI Bookshelf', cls: 'Open / strong rights', mode: 'Continuous', healthKey: 'NCBI', bookSources: [NCBI_PROVIDER], runLabels: ['NCBI Bookshelf'], rotationId: 'ncbi' },
  { id: 'nlm', label: 'NLM Catalog', cls: 'Metadata / discovery', mode: 'Continuous', healthKey: 'NLMCatalog', bookSources: ['NLMCatalog'], runLabels: ['NLM Catalog'], rotationId: 'nlm' },
  { id: 'crossrefbooks', label: 'Crossref Books', cls: 'Metadata / discovery', mode: 'Opt-in (continuous)', healthKey: 'Crossref', bookSources: ['CrossrefBooks'], runLabels: ['Crossref Books'], rotationId: 'crossrefbooks' },
  { id: 'pressbooks', label: 'Pressbooks Directory', cls: 'Metadata / discovery', mode: 'Opt-in (continuous)', healthKey: 'Pressbooks', bookSources: ['Pressbooks'], runLabels: ['Pressbooks Directory'], rotationId: 'pressbooks' },
  { id: 'openlibrary', label: 'Open Library (search)', cls: 'Metadata / discovery', mode: 'Targeted search', healthKey: 'OpenLibrary', bookSources: ['OpenLibrary'], runLabels: [] },
  { id: 'openlibrary-dump', label: 'Open Library (data dump)', cls: 'Metadata / discovery', mode: 'Bulk only', healthKey: 'OpenLibraryDump', bookSources: ['OpenLibraryDump'], runLabels: ['Open Library'] },
  { id: 'googlebooks', label: 'Google Books', cls: 'Metadata / discovery', mode: 'Enrichment only', healthKey: 'GoogleBooks', bookSources: [], runLabels: [] },
];

export type MatrixRow = {
  id: string; label: string; cls: MatrixClass; mode: Def['mode'];
  health: 'healthy' | 'degraded' | 'rate_limited' | 'cooling' | 'unavailable' | 'unknown';
  /** In words: whether it can be asked right now, and if not, why. */
  availability: string;
  checked: number; unique: number; added: number; existing: number; review: number; skipped: number;
  /** Request failures: the run since the last success, and every one there has ever been. Plus books that failed to WRITE. */
  failures: { consecutive: number; lifetime: number; failedWrites: number };
  lastError: string | null;
  nextRetry: string | null;
  lastSuccess: string | null;
  runs: number;
  /** What the catalogue holds from it now. */
  catalogue: { published: number; readable: number; external: number; metadataOnly: number; reviewWaiting: number };
  unaccountedRuns: number;
};

export type Matrix = {
  period: 'lifetime' | '7d' | '24h';
  rows: MatrixRow[];
  /** Book runs whose buckets do not add up to what they checked (ACCOUNTING_ERROR). */
  accounting: { errors: number; runsChecked: number; recent: { at: string; source: string | null; checked: number; unaccounted: number; message: string | null }[] };
};

const sinceOf = (p: Matrix['period']): Date | null => (p === 'lifetime' ? null : new Date(Date.now() - (p === '24h' ? 24 : 168) * 3600_000));
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function providerMatrix(period: Matrix['period'] = 'lifetime', db: any = ingestionDb): Promise<Matrix> {
  const since = sinceOf(period);
  const where = since ? `and r."at" >= $1` : '';
  const args = since ? [since] : [];
  // One grouped read of the run log: Book runs, the provider's own and its bulk runs (a targeted run spans providers, so it belongs to none).
  const runs: any[] = await db.$queryRawUnsafe(`
    select regexp_replace(coalesce(r.source, ''), '^Bulk · ', '') as label,
           count(*)::int runs,
           coalesce(sum(case when r.checked > 0 then r.checked else r.added + r."skippedHeld" + r."needsReview" + r."skippedRejected" + r."skippedFailed" end), 0)::int checked,
           coalesce(sum(r."uniqueCandidates"), 0)::int "unique",
           coalesce(sum(r.added), 0)::int added, coalesce(sum(r."skippedHeld"), 0)::int existing, coalesce(sum(r."needsReview"), 0)::int review,
           coalesce(sum(r."skippedRejected"), 0)::int skipped, coalesce(sum(r."skippedFailed"), 0)::int "failedWrites",
           (count(*) filter (where r.accounting = 'ACCOUNTING_ERROR'))::int "unaccountedRuns",
           max(r."at") filter (where r.error is null and (r.added + r."skippedHeld" + r."needsReview" + r."skippedRejected") > 0) "lastSuccess"
      from "IngestionRun" r where r.phase = 'Books' and r.source not like 'Targeted · %' ${where}
     group by 1`, ...args);
  const byLabel = new Map(runs.map(r => [r.label, r]));

  const held: any[] = await db.$queryRawUnsafe(`
    select source,
           (count(*) filter (where status = 'Published'))::int published,
           (count(*) filter (where status = 'Published' and "accessStatus" = 'ViewableHere'))::int readable,
           (count(*) filter (where status = 'Published' and "accessStatus" = 'LinkOnly'))::int external,
           (count(*) filter (where status = 'Published' and ("accessStatus" is null or "accessStatus" not in ('ViewableHere', 'LinkOnly'))))::int "metadataOnly",
           (count(*) filter (where status = 'Draft'))::int "reviewWaiting"
      from "Book" group by 1`);
  const heldBy = new Map(held.map(h => [h.source, h]));

  const rotation = new Map(buildProviders().map(p => [p.id, p]));
  const out: MatrixRow[] = [];
  for (const d of MATRIX_PROVIDERS) {
    const h = await sourceHealthState(d.healthKey);
    const a = d.runLabels.map(l => byLabel.get(l)).filter(Boolean) as any[];
    const sum = (k: string) => a.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    const cat = d.bookSources.map(s => heldBy.get(s)).filter(Boolean) as any[];
    const c = (k: string) => cat.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    const last = a.map(r => r.lastSuccess).filter(Boolean).sort().pop() ?? null;

    // Availability: whether it can be asked now, and if not, the plain reason.
    let availability = 'Available';
    const rp = d.rotationId ? rotation.get(d.rotationId) : undefined;
    const configured = rp?.configured?.() === true ? (rp.rotationOff?.() ?? true) : rp?.configured?.() ?? true;
    if (h.until) availability = `Resting until ${new Date(h.until).toISOString().slice(11, 16)} UTC${h.reason ? ` — ${h.reason}` : ''}`;
    else if (h.probeDue) availability = 'Rest over — the next request is a single test';
    else if (d.id === 'ncbi') {
      const lim = ncbiLimits(), used = await usedToday(db);
      if (used.archives >= lim.maxArchivesPerDay || used.bytes >= lim.maxBytesPerDay) availability = 'Daily limit reached — resumes after midnight UTC';
    } else if (d.id === 'googlebooks' && !googleBooksConfigured()) availability = 'Needs an API key (GOOGLE_BOOKS_API_KEY)';
    else if (d.id === 'googlebooks') availability = `Enrichment only — up to ${googleBooksDailyLimit()} lookups a day`;
    else if (d.id === 'openlibrary-dump') { const s = await loadDumpSource(db); availability = `Bulk only — ${s.kind === 'file' ? 'local file' : 'download'}: ${s.location.slice(-60)}`; }
    else if (d.id === 'openlibrary') availability = 'Used by targeted department runs only';
    if (typeof configured === 'string' && availability === 'Available') availability = configured.charAt(0).toUpperCase() + configured.slice(1);

    out.push({
      id: d.id, label: d.label, cls: d.cls, mode: d.mode,
      health: h.health,
      availability,
      checked: sum('checked'), unique: sum('unique'), added: sum('added'), existing: sum('existing'), review: sum('review'), skipped: sum('skipped'),
      failures: { consecutive: h.failures, lifetime: h.lifetimeFailures, failedWrites: sum('failedWrites') },
      lastError: h.failures > 0 || h.until ? h.reason : null,
      nextRetry: iso(h.until),
      lastSuccess: iso(last) ?? iso(h.lastOkAt),
      runs: sum('runs'),
      catalogue: { published: c('published'), readable: c('readable'), external: c('external'), metadataOnly: c('metadataOnly'), reviewWaiting: c('reviewWaiting') },
      unaccountedRuns: sum('unaccountedRuns'),
    });
  }

  const errs: any[] = await db.$queryRawUnsafe(`
    select "at", source, checked, unaccounted, error from "IngestionRun" r where r.accounting = 'ACCOUNTING_ERROR' ${where} order by "at" desc limit 20`, ...args);
  const totals: any[] = await db.$queryRawUnsafe(`
    select (count(*) filter (where r.accounting = 'ACCOUNTING_ERROR'))::int errors, (count(*) filter (where r.accounting is not null))::int checked from "IngestionRun" r where r.phase = 'Books' ${where}`, ...args);
  return {
    period, rows: out,
    accounting: {
      errors: totals[0]?.errors ?? 0, runsChecked: totals[0]?.checked ?? 0,
      recent: errs.map(e => ({ at: iso(e.at)!, source: e.source, checked: e.checked, unaccounted: e.unaccounted, message: e.error })),
    },
  };
}
