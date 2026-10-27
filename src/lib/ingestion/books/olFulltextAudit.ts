import { createHash } from 'node:crypto';
import { isbn13s } from './identifiers.js';
import { CATEGORIES, departmentOf, idsOf, judge, type ArchiveLookup, type BookRef, type Category, type Evidence, type Match, type Verdict } from './olFulltext.js';
import { OlClient, type ClientOpts } from './olFulltextClient.js';

/**
 * The READ-ONLY audit of the Open Library Books we hold: which of them have an openly readable Internet Archive file under a licence that allows reuse?
 *
 * It reads the catalogue inside ONE `READ ONLY` transaction (Postgres itself refuses a write), asks Open Library and the Internet Archive for small JSON through the polite client
 * (olFulltextClient.ts), and WRITES NOTHING: no Book, no status, no department, no licence, no access, no file address, no checkpoint, no provider-health row. Its result is a report.
 *
 * Matching order for each Book, most exact first: its Open Library EDITION id → its ISBN → its WORK id (a work with more than one archive item is "ambiguous", not guessed).
 * A Book whose ISBN another Book also carries is "ambiguous" and is not looked up: nothing is merged or de-duplicated here.
 */

export const DEFAULT_SOURCES = ['OpenLibraryDump', 'OpenLibrary'];
export type AuditOpts = ClientOpts & { sources?: string[]; limit?: number; sampleSize?: number; /** Only Books whose id sorts after this one (keyset): audit a large population in steps. */ afterId?: string };

type Db = { $transaction: (fn: (tx: any) => Promise<any>, o?: { timeout?: number }) => Promise<any> };

/** Run `fn` inside a transaction Postgres will not let write. */
export const readOnly = <T>(db: Db, fn: (tx: any) => Promise<T>): Promise<T> =>
  db.$transaction(async (tx: any) => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); return fn(tx); }, { timeout: 120_000 });

export async function loadBooks(db: Db, sources: string[], limit?: number, afterId?: string): Promise<{ books: BookRef[]; dupIsbns: Set<string>; total: number }> {
  return readOnly(db, async tx => {
    const rows: any[] = await tx.$queryRawUnsafe(
      `select id, source, "sourceRecordId", isbn, title, authors, year, "originalUrl", domain, status, metadata->'harvest'->'department'->>'suggested' as suggested
         from "Book" where source = any($1::text[]) and ($2::text is null or id > $2) order by id ${limit ? `limit ${Math.max(1, Math.floor(limit))}` : ''}`, sources, afterId ?? null);
    const total: number = Number((await tx.$queryRawUnsafe(`select count(*)::int n from "Book" where source = any($1::text[]) and ($2::text is null or id > $2)`, sources, afterId ?? null))[0].n);
    const dups: any[] = await tx.$queryRawUnsafe(`select isbn from "Book" where isbn is not null and isbn <> '' group by isbn having count(*) > 1`);
    return { books: rows.map(r => ({ id: r.id, source: r.source, sourceRecordId: r.sourceRecordId, isbn: r.isbn, title: r.title, domain: r.domain, suggested: r.suggested, status: r.status, authors: r.authors, year: r.year, originalUrl: r.originalUrl })) as BookRef[], dupIsbns: new Set(dups.map(d => String(d.isbn))), total };
  });
}

export type CandidateRow = {
  bookId: string; title: string; authors: string | null; year: number | null; isbn: string | null; source: string | null; olId: string | null; olEdition: string | null; ocaid: string; department: string;
  licence: string; licenceUrl: string | null; access: 'full'; format: 'PDF' | 'EPUB'; file: { name: string; format: string | null; size: number | null };
  landingUrl: string; olUrl: string | null; evidence: Evidence; sourceFingerprint: string;
};
export type Row = { id: string; title: string; department: string; verdict: Verdict };
export type Report = {
  v: 1; sources: string[]; booksInScope: number; booksAudited: number; incomplete: boolean; incompleteReasons: string[];
  counts: Record<Category, number>; matched: number; readable: number;
  licences: Record<string, number>; notes: Record<string, number>; candidatesBySource: Record<string, number>;
  /** The id of the last Book audited (pass it as afterId to continue), and whether this audit covered the whole scope (so a saved candidate list may mark absent ones stale). */
  lastId: string | null; wholeScope: boolean;
  /** One full row per candidate, for review. Not printed by the CLI. */
  candidates: CandidateRow[];
  byDepartment: Record<string, Record<Category, number>>; candidatesByDepartment: Record<string, number>;
  samples: Record<Category, { id: string; title: string; department: string; why: string; ocaid?: string; licence?: string | null; file?: string | null }[]>;
  requests: { total: number; retries: number; rateLimited: number; failures: number; notFound: number; waitedMs: number; budget: number; gapMs: number; batch: number };
  /** A hash of what was concluded (no times, no counters of requests): two audits of unchanged sources have the same one. */
  reportHash: string;
  /** Every Book's verdict, id → category + the source fingerprint, for comparing two audits. Not printed by the CLI. */
  verdicts: Record<string, { c: Category; f?: string }>;
};
const zero = (): Record<Category, number> => Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<Category, number>;

export async function runAudit(db: Db, opts: AuditOpts = {}, client = new OlClient(opts)): Promise<Report> {
  const sources = opts.sources?.length ? opts.sources : DEFAULT_SOURCES; const sampleSize = Math.max(1, opts.sampleSize ?? 25);
  const { books, dupIsbns, total } = await loadBooks(db, sources, opts.limit, opts.afterId);
  const ids = new Map(books.map(b => [b.id, idsOf(b)]));
  const verdicts = new Map<string, Verdict>(); const matches = new Map<string, Match | null | 'error'>();
  const reasons = new Set<string>();

  // 1. which Books are looked up at all: not one whose ISBN another Book also carries (decided as ambiguous, with no request)
  const dup13 = new Set(isbn13s([...dupIsbns]));
  const sharedIsbn = new Set<string>();
  const todo = books.filter(b => { const i = ids.get(b.id)!; if (i.isbn13 && dup13.has(i.isbn13)) { sharedIsbn.add(b.id); verdicts.set(b.id, judge(i, null, () => undefined, true)); return false; } return true; });

  // 2. editions and ISBNs, then works for what is still unknown
  const keyOf = (i: ReturnType<typeof idsOf>) => (i.edition ? `OLID:${i.edition}` : i.isbn13 ? `ISBN:${i.isbn13}` : null);
  const first = [...new Set(todo.map(b => keyOf(ids.get(b.id)!)).filter(Boolean) as string[])];
  const e1 = first.length ? await client.editions(first) : { found: new Map<string, Match>(), failed: new Set<string>() };
  const second = [...new Set(todo.filter(b => { const i = ids.get(b.id)!; const k = keyOf(i); return k && !e1.found.has(k) && !e1.failed.has(k) && i.edition && i.isbn13; }).map(b => `ISBN:${ids.get(b.id)!.isbn13}`))].filter(k => !e1.found.has(k) && !e1.failed.has(k));
  const e2 = second.length ? await client.editions(second) : { found: new Map<string, Match>(), failed: new Set<string>() };
  const needWork = [...new Set(todo.filter(b => { const i = ids.get(b.id)!; if (!i.work) return false; const ks = [i.edition && `OLID:${i.edition}`, i.isbn13 && `ISBN:${i.isbn13}`].filter(Boolean) as string[]; return !ks.some(k => e1.found.has(k) || e2.found.has(k)) && !ks.some(k => e1.failed.has(k) || e2.failed.has(k)); }).map(b => ids.get(b.id)!.work!))];
  const w = needWork.length ? await client.works(needWork) : { found: new Map<string, Match>(), failed: new Set<string>() };

  for (const b of todo) {
    const i = ids.get(b.id)!; const ks = [i.edition && `OLID:${i.edition}`, i.isbn13 && `ISBN:${i.isbn13}`].filter(Boolean) as string[];
    const hit = ks.map(k => e1.found.get(k) ?? e2.found.get(k)).find(Boolean) ?? (i.work ? w.found.get(i.work) : undefined);
    if (hit) matches.set(b.id, hit);
    else if (ks.some(k => e1.failed.has(k) || e2.failed.has(k)) || (i.work && w.failed.has(i.work))) matches.set(b.id, 'error');      // asked, and the request failed: not "unmatched"
    else matches.set(b.id, null);
  }

  // 3. the Archive items that matter: only those Open Library says are openly readable (anything else is decided without asking the Archive)
  const iaFor = new Map<string, ArchiveLookup>();
  const wanted = [...new Set([...matches.values()].flatMap(m => (m && m !== 'error' && m.archive.length === 1 && m.archive[0].availability === 'full' ? [m.archive[0].ocaid] : [])))].sort();
  for (const oc of wanted) iaFor.set(oc, await client.archiveItem(oc));

  for (const b of todo) verdicts.set(b.id, judge(ids.get(b.id)!, matches.get(b.id) ?? null, oc => iaFor.get(oc)));

  // 3b. INFORMATION ONLY, never a verdict: a Book whose own edition has no Archive item but whose WORK has other editions there (a different edition is a different book, so it is not
  // a candidate; a person may still want to know). One batched work search, skipped when the budget is spent.
  const otherEd = new Map<string, string>();
  const noItem = todo.filter(b => verdicts.get(b.id)?.category === 'noFile' && /lists no Internet Archive item/.test(verdicts.get(b.id)!.reasons[0]) && ids.get(b.id)!.work);
  if (noItem.length && !client.c.stopped) {
    const ow = await client.works([...new Set(noItem.map(b => ids.get(b.id)!.work!))]);
    for (const b of noItem) { const m = ow.found.get(ids.get(b.id)!.work!); if (m?.archive.length) otherEd.set(b.id, m.archive[0].availability); }
  }

  // 4. the report
  const counts = zero(); const byDepartment: Report['byDepartment'] = {}; const samples = Object.fromEntries(CATEGORIES.map(c => [c, []])) as unknown as Report['samples'];
  const candidates: CandidateRow[] = []; const candidatesBySource: Record<string, number> = {};
  const licences: Record<string, number> = {}, notes: Record<string, number> = {}; const candidatesByDepartment: Record<string, number> = {}; const compact: Report['verdicts'] = {};
  for (const b of books) {
    const v = verdicts.get(b.id)!; const dept = departmentOf(b);
    counts[v.category]++; (byDepartment[dept] ??= zero())[v.category]++; compact[b.id] = { c: v.category, ...(v.sourceFingerprint ? { f: v.sourceFingerprint } : {}) };
    if (v.category === 'reuseSafe' && v.evidence && v.file && v.licence && v.ocaid) {
      candidatesBySource[b.source ?? '—'] = (candidatesBySource[b.source ?? '—'] ?? 0) + 1;
      candidates.push({ bookId: b.id, title: b.title, authors: b.authors ?? null, year: b.year ?? null, isbn: b.isbn, source: b.source, olId: b.sourceRecordId, olEdition: v.olEdition ?? null, ocaid: v.ocaid, department: dept, licence: v.licence, licenceUrl: v.evidence.licenceUrl, access: 'full', format: /epub/i.test(v.file.name) ? 'EPUB' : 'PDF', file: v.file, landingUrl: `https://archive.org/details/${v.ocaid}`, olUrl: b.originalUrl ?? null, evidence: v.evidence, sourceFingerprint: v.sourceFingerprint! });
    }
    if (v.category === 'reuseSafe') { candidatesByDepartment[dept] = (candidatesByDepartment[dept] ?? 0) + 1; licences[v.licence ?? '—'] = (licences[v.licence ?? '—'] ?? 0) + 1; }
    if (v.category === 'readableLicenceRestricted') { const k = `restricted: ${v.licence ?? '—'}`; licences[k] = (licences[k] ?? 0) + 1; }
    if (otherEd.has(b.id)) { const k = `otherEditionOnArchive.${otherEd.get(b.id)}`; notes[k] = (notes[k] ?? 0) + 1; }
    if (v.category === 'readableLicenceUnknown') { const k = /out of copyright/.test(v.reasons[0]) ? 'publicDomainFlagOnly' : /not one we recognise/.test(v.reasons[0]) ? 'unrecognisedLicenceUrl' : 'noLicenceDeclared'; notes[k] = (notes[k] ?? 0) + 1; }
    if (samples[v.category].length < sampleSize) samples[v.category].push({ id: b.id, title: b.title.slice(0, 90), department: dept, why: v.reasons[0], ...(v.ocaid ? { ocaid: v.ocaid } : {}), ...(v.licence !== undefined ? { licence: v.licence } : {}), ...(v.file !== undefined ? { file: v.file?.name ?? null } : {}) });
  }
  if (client.c.budgetHit) reasons.add(`the request budget (${client.limits.maxRequests}) ended before every Book was checked`);
  if (client.c.stopped) reasons.add('a source failed repeatedly and the audit stopped asking it');
  if (opts.limit && total > books.length) reasons.add(`only the first ${books.length} of ${total} Books were audited (limit)`);
  const stable = JSON.stringify({ counts, byDepartment, licences, notes, candidatesByDepartment, verdicts: compact });
  const readable = counts.reuseSafe + counts.readableLicenceUnknown + counts.readableLicenceRestricted;
  return {
    v: 1, sources, booksInScope: total, booksAudited: books.length, incomplete: reasons.size > 0, incompleteReasons: [...reasons], counts,
    matched: books.length - counts.unmatched - counts.couldNotCheck - sharedIsbn.size,
    readable, licences, notes, candidatesBySource, byDepartment, candidatesByDepartment, samples, candidates,
    lastId: books.length ? books[books.length - 1].id : null, wholeScope: !opts.limit && !opts.afterId && reasons.size === 0,
    requests: { total: client.c.requests, retries: client.c.retries, rateLimited: client.c.rateLimited, failures: client.c.failures, notFound: client.c.notFound, waitedMs: client.c.waitedMs, budget: client.limits.maxRequests, gapMs: client.limits.gapMs, batch: client.limits.batch },
    reportHash: createHash('sha256').update(stable).digest('hex').slice(0, 16), verdicts: compact,
  };
}

/** Which Books' verdicts (or source fingerprints) differ between two audits: the sources changed, or our reading of them did. */
export function diffReports(prev: Pick<Report, 'verdicts'>, next: Pick<Report, 'verdicts'>) {
  const changed: { id: string; from: Category | null; to: Category | null; sourceChanged: boolean }[] = [];
  for (const id of new Set([...Object.keys(prev.verdicts), ...Object.keys(next.verdicts)])) {
    const a = prev.verdicts[id], b = next.verdicts[id];
    if (!a || !b || a.c !== b.c || a.f !== b.f) changed.push({ id, from: a?.c ?? null, to: b?.c ?? null, sourceChanged: !!a && !!b && a.f !== b.f });
  }
  return changed.sort((x, y) => x.id.localeCompare(y.id));
}
