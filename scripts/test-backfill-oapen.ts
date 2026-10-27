/**
 * Historical backfill, Phase 2C: the OAPEN adapter (OAI-PMH, BOOKS), proved on OAPEN-FORMAT corpora of 100 and 1,000 records served by a fake OAI server (no network), and — when
 * OAPEN_REAL=1 — on a small number of REAL OAPEN pages.
 *
 *   [OAPEN_REAL=1] npx tsx scripts/test-backfill-oapen.ts
 *
 * Throwaway database `stm_ingestion_test` only (refuses anything else). Everything the suite creates is removed at the end; catalogue counts and a fingerprint of every
 * continuous-engine checkpoint (including the continuous OAPEN harvest's resumption token and OAPEN's health row) are compared before and after.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
for (const k of Object.keys(process.env)) if (k.startsWith('BACKFILL_') || k === 'INGESTION_BACKFILL_ENABLED') delete process.env[k];
Object.assign(process.env, {
  INGESTION_BACKFILL_ENABLED: 'true', BACKFILL_OAPEN_ENABLED: 'true', BACKFILL_OAPEN_REQUEST_GAP_MS: '0', BACKFILL_MIN_GAP_SECONDS: '0', BACKFILL_HEARTBEAT_SECONDS: '1', BACKFILL_HEARTBEAT_STALE_SECONDS: '3',
  BACKFILL_PREVIEW_MAX_RECORDS: '2000', INGESTION_MULTI_SOURCE_ENRICHMENT: '1',
});
delete process.env.NODE_ENV; delete process.env.BOOK_FULLTEXT;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const J = await import('../src/lib/ingestion/backfill/jobs.js');
const W = await import('../src/lib/ingestion/backfill/worker.js');
const R = await import('../src/lib/ingestion/backfill/registry.js');
const H = await import('../src/lib/ingestion/backfill/testHooks.js');
const OS = await import('../src/lib/ingestion/backfill/oapenSource.js');
const BC = await import('../src/lib/ingestion/backfill/bookCommon.js');
const { __useFetchForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const S = await import('./oapen-sample.js');
const { parseOaiPage } = await import('../src/lib/ingestion/books/oaiXml.js');
const { normaliseOaiBook } = await import('../src/lib/ingestion/books/normalise.js');
const { OAPEN_OAI } = await import('../src/lib/ingestion/books/oaiHarvest.js');
const { oapenAdapter } = await import('../src/lib/ingestion/backfill/oapenAdapter.js');
const LIVE_ONLY = process.env.OAPEN_LIVE_ONLY === '1';

const SUITE_START = new Date(); const RUN = Date.now().toString(36);
const WHO = { uid: 'qa', email: `oapen-qa-${RUN}@test.invalid` };
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rejects = async (p: Promise<any>, code: string) => { try { await p; return false; } catch (e: any) { return e?.code === code; } };
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const mb = (n: number) => Math.round(n / 1048576);

const catalogue = async () => (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Article")::int articles, (select count(*) from "Journal")::int journals, (select count(*) from "Book")::int books, (select count(*) from "Publisher")::int publishers, (select count(*) from "IngestionRun")::int runs`))[0];
const checkpoints = async () => (await db.$queryRawUnsafe<any[]>(`select
  md5(coalesce((select string_agg(provider || coalesce(cursor, '') || coalesce("lastSuccessfulSyncAt"::text, '') || coalesce("harvestStartedAt"::text, ''), '|' order by provider) from "BookHarvestCheckpoint"), '')) harvest,
  md5(coalesce((select string_agg(id || position::text || coalesce("exhaustedAt"::text, '') || coalesce("lastSweptAt"::text, ''), '|' order by id) from "DepartmentSweep"), '')) sweeps,
  md5(coalesce((select string_agg(id || coalesce("fetchCursor", '') || coalesce("nextEligibleAt"::text, '') || coalesce("lastIngestedAt"::text, '') || "articleCount"::text, '|' order by id) from "Journal"), '')) journals,
  md5(coalesce((select string_agg(key || value::text, '|' order by key) from "AppSetting" where key like 'ingestion.%'), '')) settings,
  md5(coalesce((select string_agg(source || "consecutiveFailures"::text || coalesce("pausedUntil"::text, '') || "lifetimeFailures"::text, '|' order by source) from "IngestionSourceHealth"), '')) health`))[0];

// ── the continuous engine's own OAPEN state: a resumption token mid-harvest, and the health row. Remembered, and restored at the end.
const CP_TOKEN = 'xoai///com_20.500.12657_5/4200';
const cpExisting = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'OAPEN' } });
if (!cpExisting) await db.bookHarvestCheckpoint.create({ data: { provider: 'OAPEN', cursor: CP_TOKEN, harvestStartedAt: new Date(Date.now() - 86_400_000) } });
const oapenCp = () => db.bookHarvestCheckpoint.findUnique({ where: { provider: 'OAPEN' } });
const healthRow = () => db.ingestionSourceHealth.findUnique({ where: { source: 'OAPEN' } });
const CP_BEFORE_ROW = JSON.stringify(await oapenCp());
// Other suites leave OAPEN's health row resting. A backfill rightly waits for a resting source, so this suite starts from a clean row and puts the original back at the end.
const HEALTH_ORIGINAL = await healthRow(); if (HEALTH_ORIGINAL) await db.ingestionSourceHealth.deleteMany({ where: { source: 'OAPEN' } });
const BEFORE_CAT = await catalogue(), BEFORE_CP = await checkpoints();
const stateRow = await db.ingestionState?.findUnique?.({ where: { id: 'singleton' }, select: { bookMinYear: true } }).catch(() => null);
const MIN_YEAR = (stateRow as any)?.bookMinYear ?? 2000;

// ── the oracle: written from the DOCUMENTED shape of the corpus (see scripts/oapen-sample.ts), not from the adapter ───────────────────────────────────────────────
type Pref = 'OAFirst' | 'MetadataOnlyAllowed';
type Exp = { fetched: number; published: number; review: number; refused: number; duplicate: number; enriched: number; conflicting: number; scanned: number; deleted: number; unusable: number; outsideWindow: number; noDate: number };
const oracle = (total: number, o: { pref?: Pref; fromYear?: number; toYear?: number; depts?: string[] } = {}): Exp => {
  const pref = o.pref ?? 'OAFirst'; const e: Exp = { fetched: 0, published: 0, review: 0, refused: 0, duplicate: 0, enriched: 0, conflicting: 0, scanned: total, deleted: 0, unusable: 0, outsideWindow: 0, noDate: 0 };
  for (let i = 0; i < total; i++) {
    const k = S.kindOf(i);
    if (k === 0) { e.deleted++; continue; }
    if (k === 1) { e.unusable++; continue; }
    if (o.fromYear !== undefined || o.toYear !== undefined) {
      const y = S.yearOf(i);
      if (y === null) { e.noDate++; continue; }
      if ((o.fromYear !== undefined && y < o.fromYear) || (o.toYear !== undefined && y > o.toYear)) { e.outsideWindow++; continue; }
    }
    e.fetched++;
    const hk = S.heldKind(i);
    if (hk) {
      e.duplicate++;
      if (hk === 'enriched' || hk === 'licence-fill' || hk === 'isbn') e.enriched++;
      if (hk === 'conflicting') e.conflicting++;
      continue;
    }
    const excluded = !!o.depts?.length && !o.depts.includes(S.deptOf(i));
    if (S.isRepeat(i)) { if (excluded) e.refused++; else { e.duplicate++; if (i % 2 !== (S.cloneSource(i) as number) % 2) e.conflicting++; } continue; }          // a repeat of a new book: a duplicate of it, if that book was taken (a conflict when it states another licence)
    if (k === 4) { e.refused++; continue; }                                            // nothing points at a department
    if (excluded) { e.refused++; continue; }
    if (k === 2 || k === 3 || k === 5) { e.review++; continue; }
    if (k === 6 || k === 7) { pref === 'OAFirst' ? e.review++ : e.published++; continue; }
    e.published++;
  }
  return e;
};
const rowsOf = (j: any) => ({ fetched: j.recordsFetched, published: j.recordsPublished, review: j.recordsReview, refused: j.recordsRefused, failed: j.recordsFailed, held: j.recordsHeld, duplicate: j.recordsDuplicate, enriched: j.recordsEnriched, conflicting: j.recordsDuplicateConflicting, unique: j.recordsUnique, normalized: j.recordsNormalized });
const expRows = (e: Exp) => ({ fetched: e.fetched, published: e.published, review: e.review, refused: e.refused, failed: 0, held: 0, duplicate: e.duplicate, enriched: e.enriched, conflicting: e.conflicting, unique: e.published + e.review, normalized: e.fetched });
const statsOf = (j: any) => (j.config as any)?.sourceStats ?? {};
const statsOk = (j: any, e: Exp) => { const s = statsOf(j); return s.scanned === e.scanned && (s.deleted ?? 0) === e.deleted && (s.unusable ?? 0) === e.unusable && (s.outsideWindow ?? 0) === e.outsideWindow && (s.noDate ?? 0) === e.noDate && s.requests >= 1; };

// ── held duplicates seeded into the catalogue (what DOAB or an earlier harvest already gave us) ───────────────────────────────────────────────────────────────
const FROZEN_COLS = ['accessStatus', 'rightsStatus', 'rightsBasis', 'status', 'domain', 'pdfUrl', 'source', 'fingerprint', 'ownershipSource', 'accessType', 'rightsVerifiedBy', 'rejectionNote'];
const heldRows = (seed: string) => db.book.findMany({ where: { createdBy: 'BackfillTest', fingerprint: { startsWith: `bt:${seed}:` } }, orderBy: { fingerprint: 'asc' } });
const strip = (r: any) => { const { updatedAt, ...rest } = r; return JSON.stringify(rest); };
const seedHeld = async (seed: string, total: number) => {
  for (let i = 0; i < total; i++) {
    const hk = S.heldKind(i); if (!hk) continue;
    const lic = i % 2 ? 'CC BY-SA' : 'CC BY';
    const full = { authors: 'Held Author', publisherName: 'Held Press', year: S.yearOf(i), language: 'eng', description: 'Held description', subject: 'Held subject', pages: '100', coverUrl: 'https://example.test/c.jpg', originalUrl: 'https://example.test/o', rightsHolder: 'Held Press' };
    const base: any = { title: `Held ${seed} ${i}`, status: 'Published', source: 'DOAB', ownershipSource: 'Ingested', rightsVerifiedBy: 'ingestion', accessStatus: 'LinkOnly', rightsStatus: 'MetadataOnly', accessType: 'OpenAccess', domain: S.deptOf(i), createdBy: 'BackfillTest', fingerprint: `bt:${seed}:${i}`, metadata: {} };
    const doi = S.doiOf(seed, i), isbn = S.isbnOf(seed, i);
    const data: any = hk === 'enriched' ? { ...base, doi, licence: lic, licenceIsNC: false }
      : hk === 'conflicting' ? { ...base, ...full, doi, isbn, licence: 'CC BY-NC', licenceIsNC: true }
      : hk === 'unchanged' ? { ...base, ...full, doi, isbn, licence: lic, licenceIsNC: false, metadata: { sources: { OAPEN: { handle: 'seeded' } } } }
      : hk === 'licence-fill' ? { ...base, ...full, doi, isbn, licence: null, licenceIsNC: null, metadata: { sources: { OAPEN: { handle: 'seeded' } } } }
      : hk === 'protected' ? { ...base, doi, licence: lic, licenceIsNC: false, ownershipSource: 'PublisherSubmitted' }
      : hk === 'isbn' ? { ...base, isbn, licence: lic, licenceIsNC: false }
      : { ...base, title: S.titleOf(seed, i), authors: `Author${i}, Anna, Coauthor${i}, Ben`, year: S.yearOf(i), licence: lic, licenceIsNC: false };          // 'title'
    await db.book.create({ data });
  }
};

const jobIds: string[] = []; const seeds: string[] = [];
const useCorpus = (seed: string, total: number, opts: any = {}) => { seeds.push(seed); const f = S.fakeOapen(S.makeCorpus(seed, total, opts)); __useFetchForTests(f.transport as any); OS.__resetOapenThrottle(); BC.__clearDryKeys(); return f.ctl; };
const mkJob = async (o: any) => { const j = await J.createJob({ provider: 'oapen', contentType: 'BOOK', ...o }, WHO); jobIds.push(j.id); return j; };
const reload = (id: string) => db.backfillJob.findUnique({ where: { id } });
const finished = (j: any) => ['Completed', 'Failed', 'Cancelled', 'Paused'].includes(j.status);
const work = async (id: string, workerId = 'w-main', max = 200) => { for (let i = 0; i < max; i++) { const r = await W.backfillTick({ workerId }); const j = await reload(id); if (finished(j!) || (!r.ran && r.reason === 'no-job')) return j!; } return (await reload(id))!; };
const previewThenStart = async (o: any) => { const pv = await mkJob({ ...o, dryRun: true }); const done = await work(pv.id); const rl = await mkJob({ ...o, dryRun: false, previewJobId: pv.id }); return { pv: done, real: rl }; };
const goStale = (id: string) => db.backfillJob.update({ where: { id }, data: { heartbeatAt: new Date(Date.now() - 60_000) } });
const cfg = (extra: any = {}) => ({ adapter: { verifyFiles: false, ...extra } });
const booksOf = (seed: string) => db.book.findMany({ where: { source: 'OAPEN', doi: { startsWith: `10.7777/oapen.${seed}.` } } });
const idx = (b: any) => Number(String(b.title).split(' ').pop());
const dupDois = async (seed: string) => (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from (select doi from "Book" where source = 'OAPEN' and doi like $1 group by doi having count(*) > 1) t`, `10.7777/oapen.${seed}.%`))[0].n;

// Every record the adapter hands to the framework, in order: the proof that a recovery re-read never makes a record count twice.
const consumed: string[] = [];
{ const orig = oapenAdapter.fetchPage.bind(oapenAdapter); oapenAdapter.fetchPage = async (job, cursor, limit) => { const p = await orig(job, cursor, limit); consumed.push(...p.records.map(r => oapenAdapter.stableId(r))); return p; }; }
const consumedTwice = () => consumed.length - new Set(consumed).size;

let peakRss = 0; const rssTimer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 25); rssTimer.unref();
const rss0 = process.memoryUsage().rss;

try {
  if (!LIVE_ONLY) {
  // ═══════════════════════════════════════════════════════════════════════
  section('1. Availability, settings, and what the screen is told');
  delete process.env.BACKFILL_OAPEN_ENABLED;
  const ad0 = R.getAdapter('oapen')!;
  check('with BACKFILL_OAPEN_ENABLED unset the adapter is listed but NOT available, with the reason (so the screen offers no OAPEN)', ad0.available() !== true && String(ad0.available()).includes('BACKFILL_OAPEN_ENABLED') && (await J.overview()).adapters.filter((a: any) => a.available).length === 0 && await rejects(J.createJob({ provider: 'oapen', contentType: 'BOOK' }, WHO), 'PROVIDER_UNAVAILABLE'));
  process.env.BACKFILL_OAPEN_ENABLED = 'true';
  useCorpus('probe', 120);
  const ov = await J.overview(); const adv = ov.adapters.find((a: any) => a.id === 'oapen');
  check('with it set, OAPEN is available for BOOKS only, with its three settings; the type list offers Books through it', adv.available && adv.contentTypes.join() === 'BOOK' && adv.params.map((p: any) => p.key).join() === 'verifyFiles,modifiedFrom,modifiedUntil' && ov.types.find((t: any) => t.id === 'BOOK').providers.includes('oapen') && !ov.types.find((t: any) => t.id === 'ARTICLE').providers.includes('oapen'));
  const d = await J.describeSource('oapen', {});
  check('describe asks OAPEN once (Identify) and says what the source is', /OAPEN Library \(fake\) · OAI-PMH, set Books, xoai format/.test(d.summary), d.summary);
  check('a BOOK job on another provider type is refused both ways: OAPEN cannot do ARTICLE, reserved types stay reserved', await rejects(J.createJob({ provider: 'oapen', contentType: 'ARTICLE' }, WHO), 'TYPE_NOT_SUPPORTED') && await rejects(J.createJob({ provider: 'oapen', contentType: 'THESIS' }, WHO), 'TYPE_RESERVED'));
  check('bad change dates are refused before a job exists', await rejects(J.createJob({ provider: 'oapen', contentType: 'BOOK', adapter: { modifiedFrom: '2025-13-45' } }, WHO), 'BAD_ADAPTER_CONFIG') && await rejects(J.createJob({ provider: 'oapen', contentType: 'BOOK', adapter: { modifiedFrom: '2025-06-02', modifiedUntil: '2025-06-01' } }, WHO), 'BAD_ADAPTER_CONFIG') && await rejects(J.createJob({ provider: 'oapen', contentType: 'BOOK', adapter: { modifiedFrom: 'yesterday' } }, WHO), 'BAD_ADAPTER_CONFIG'));
  const idA = OS.oapenIdentity({}), idB = OS.oapenIdentity({ modifiedFrom: '2024-01-01' });
  check('the source identity is local and deterministic (no network, no clock): same settings → same identity, a different change window → a different one', idA === OS.oapenIdentity({ verifyFiles: false }) && idA !== idB && idA.length === 24);
  check('publication dates are read as ranges: a year is the whole year, a month the whole month', same(OS.publicationRange('2022'), ['2022-01-01', '2022-12-31']) && same(OS.publicationRange('2024-02'), ['2024-02-01', '2024-02-29']) && same(OS.publicationRange('2022-05-07T10:00:00Z'), ['2022-05-07', '2022-05-07']) && OS.publicationRange('n.d.') === null);

  // ═══════════════════════════════════════════════════════════════════════
  section('2. Test A — 100 OAPEN-format records: parser, identity, rights, duplicates, enrichment, conflicts, dry run');
  const SA = `a${RUN}`; const fakeA = useCorpus(SA, 100); await seedHeld(SA, 100);
  const heldA0 = await heldRows(SA); const catA0 = await catalogue(), cpA0 = await checkpoints();
  const baseA = { ...cfg({ verifyFiles: true }), accessPreference: 'OAFirst', maxRecords: 500 };
  const dry = await mkJob({ ...baseA, dryRun: true }); const dj = await work(dry.id); const eA = oracle(100);
  console.log(`  [oracle] 100 records → relevant ${eA.fetched}, published ${eA.published}, review ${eA.review}, refused ${eA.refused}, duplicates ${eA.duplicate} (enriched ${eA.enriched}, conflicting ${eA.conflicting}), deleted ${eA.deleted}, unreadable ${eA.unusable}`);
  check('the dry run completed in one chunk reading ONE OAI page, and counted every record it scanned (deleted and untitled are skipped, counted, and are not books)', dj.status === 'Completed' && dj.chunksCompleted === 1 && statsOf(dj).requests === 1 && statsOk(dj, eA), { s: dj.status, st: statsOf(dj), eA, err: dj.lastError });
  check('its counters equal the corpus\'s documented shape exactly (published / review / refused / duplicates split)', same(rowsOf(dj), expRows(eA)), { got: rowsOf(dj), want: expRows(eA) });
  check('the dry run wrote NOTHING (no book, article, journal, publisher or run-log row), changed no held book, and moved no checkpoint', same(await catalogue(), catA0) && (await booksOf(SA)).length === 0 && same((await heldRows(SA)).map(strip), heldA0.map(strip)) && same(await checkpoints(), cpA0));
  const pv: any = dj.preview;
  check('the preview is bounded and names the conflicts, the missing department and the licence rule as reasons', pv.samples.length <= 25 && pv.issues.length <= 25 && pv.issues.some((i: any) => i.kind === 'conflict' && /licence CC BY-NC? ?[^ ]* disagrees|disagrees/.test(i.reason)) && pv.issues.some((i: any) => /no reliable department/.test(i.reason)) && pv.samples.some((s: any) => /open access first/.test(s.reason || '')), pv.issues.map((i: any) => i.reason).slice(0, 5));
  check('the job carries the source identity it was created against', (dj.config as any).identity === OS.oapenIdentity({ verifyFiles: true }));
  check('the first request asked for the Books set in xoai format, CLOSED at the job\'s creation time (until=…), and the file checks went to the book files only', /verb=ListRecords&metadataPrefix=xoai&set=com_20\.500\.12657_5&until=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}Z$/.test(fakeA.log[0]) && fakeA.log.filter(u => !u.includes('/oai/request')).every(u => u.includes('/bitstream/')));

  const realA = await mkJob({ ...baseA, dryRun: false, previewJobId: dry.id }); const rj = await work(realA.id);
  const rowsA = await booksOf(SA);
  console.log(`  [info] Test A: scanned ${statsOf(dj).scanned}, relevant ${dj.recordsFetched}, published ${dj.recordsPublished}, review ${dj.recordsReview}, refused ${dj.recordsRefused}, duplicates ${dj.recordsDuplicate} (enriched ${dj.recordsEnriched}, conflicting ${dj.recordsDuplicateConflicting}); dry run ${Math.round((dj.config as any).activeMs)} ms, real run ${Math.round(((await reload(realA.id))!.config as any).activeMs)} ms`);
  check('the real run reproduces the dry run\'s counters exactly and ends because the data ended', rj.status === 'Completed' && same(rowsOf(rj), expRows(eA)) && (rj.config as any).finishedBecause === 'end of data' && statsOk(rj, eA), { got: rowsOf(rj) });
  check('the catalogue gained exactly published + review books, no duplicate DOI, all source OAPEN with the title\'s own handle, a title-level rights basis, and the job that wrote them', rowsA.length === eA.published + eA.review && (await dupDois(SA)) === 0 && rowsA.every(r => r.source === 'OAPEN' && /^20\.500\.12657\/\d+$/.test(r.sourceRecordId || '') && r.createdBy === `Backfill:${realA.id}` && r.ownershipSource === 'Ingested' && r.fingerprint === `oapen:doi:${r.doi}` && (r.metadata as any).backfill?.jobId === realA.id));
  check('published ones are Published WITH a department; review ones are Drafts WITHOUT one (no department is given on a guess)', rowsA.filter(r => r.status === 'Published').length === eA.published && rowsA.filter(r => r.status === 'Draft').length === eA.review && rowsA.filter(r => r.status === 'Published').every(r => r.domain === S.deptOf(idx(r))) && rowsA.filter(r => r.status === 'Draft').every(r => r.domain === null));
  const kinds = (k: number) => rowsA.filter(r => S.kindOf(idx(r)) === k);
  check('RIGHTS (year): a clearly classified book older than the policy year, or with no year, was NOT refused and NOT published: it waits as a Draft carrying the reason', kinds(2).concat(kinds(3)).length > 0 && kinds(2).every(r => r.status === 'Draft' && (r.metadata as any).harvest.yearPolicy.outcome === 'older' && (r.metadata as any).harvest.yearPolicy.minYear === MIN_YEAR) && kinds(3).every(r => r.status === 'Draft' && (r.metadata as any).harvest.yearPolicy.outcome === 'no-year'));
  check('RIGHTS (department): a book placed only by words waits for a person; one with no department evidence was not catalogued at all', kinds(5).length > 0 && kinds(5).every(r => r.status === 'Draft') && kinds(4).length === 0);
  check('RIGHTS (licence, "open access first"): no licence, or a non-commercial one, never reaches Published; both wait as Drafts', kinds(6).length > 0 && kinds(7).length > 0 && kinds(6).concat(kinds(7)).every(r => r.status === 'Draft'));
  const open = rowsA.filter(r => S.kindOf(idx(r)) >= 8);
  check('RIGHTS (access): nothing is offered as a file or Full Text (the Book reader does not serve it yet): every row is a link or metadata only, rightsStatus MetadataOnly, no file URL', rowsA.every(r => r.pdfUrl === null && r.accessStatus !== 'ViewableHere' && r.rightsStatus === 'MetadataOnly') && open.every(r => r.accessStatus === 'LinkOnly' && r.licenceIsNC === false && /^CC BY(-SA)?$/.test(r.licence || '')));
  check('RIGHTS (file check): with the check on, a file that opens is recorded as verified-and-held-back, one that does not open is recorded as refused, and a non-commercial licence is not even asked', open.every(r => { const f = (r.metadata as any).harvest.file; return f && f.verdict.ok === S.fileOk(idx(r)) && f.heldBack === S.fileOk(idx(r)); }) && kinds(7).every(r => (r.metadata as any).harvest.file?.verdict === null));
  check('RIGHTS (rights basis): a title-level licence is recorded as such; no licence is recorded as undeclared and the book is marked as not hostable', open.every(r => r.rightsBasis === 'OAPEN title licence') && kinds(6).every(r => r.rightsBasis === 'OAPEN record, licence undeclared' && r.licenceIsNC === true && r.licence === null));

  const heldA1 = await heldRows(SA); const byKind = (k: string) => heldA1.map((r, n) => ({ r, before: heldA0[n], i: Number(r.fingerprint!.split(':')[2]) })).filter(x => S.heldKind(x.i) === k);
  const frozenOk = (x: any) => FROZEN_COLS.every(c => x.r[c] === x.before[c]);
  check('DUPLICATES: every held book was found (DOI, ISBN) and none was written again; a title-only match was reported and left alone — titles are never merged', rowsA.length === eA.published + eA.review && byKind('title').every(x => strip(x.r) === strip(x.before)) && byKind('title').every(x => !rowsA.some(b => b.title === x.r.title)));
  check('ENRICHMENT: a held book was completed ONLY in its empty fields (authors, publisher, description, pages …) and gained the OAPEN provenance; what it already had is unchanged', byKind('enriched').length > 0 && byKind('enriched').every(x => x.r.description?.startsWith(`An abstract of sample book ${x.i}`) && x.r.authors?.startsWith(`Author${x.i}, Anna`) && x.r.licence === x.before.licence && x.r.year === S.yearOf(x.i) && (x.r.metadata as any).sources?.OAPEN?.handle && frozenOk(x)));
  check('ENRICHMENT (ISBN): a held book known only by ISBN took the DOI and the descriptive fields it lacked, and kept its rights fields', byKind('isbn').length > 0 && byKind('isbn').every(x => x.r.doi === S.doiOf(SA, x.i) && x.r.description && frozenOk(x)));
  check('RIGHTS (fill only an EMPTY licence): a held book with no licence took the title\'s recognised licence and its derived flag — and not one access or rights-status field moved', byKind('licence-fill').length > 0 && byKind('licence-fill').every(x => x.r.licence === (x.i % 2 ? 'CC BY-SA' : 'CC BY') && x.r.licenceIsNC === false && (x.r.metadata as any).licenceFill?.OAPEN?.basis === 'title' && x.before.licence === null && frozenOk(x) && x.r.description === x.before.description));
  const core = (r: any) => { const { updatedAt, metadata, ...rest } = r; return JSON.stringify(rest); };
  check('CONFLICTS: where OAPEN\'s licence disagrees with the held one, NOT ONE Book column changes (licence, access, rights, status, department, file — nothing); the only addition is the existing bounded evidence note in metadata (held / theirs / handle / "needs human review"), merged beside what was there; and it is counted', byKind('conflicting').length > 0 && byKind('conflicting').every(x => core(x.r) === core(x.before) && same({ ...(x.r.metadata as any), licenceConflicts: undefined }, { ...(x.before.metadata as any), licenceConflicts: undefined }) && (x.r.metadata as any).licenceConflicts?.OAPEN?.held === 'CC BY-NC' && (x.r.metadata as any).licenceConflicts.OAPEN.theirs === (x.i % 2 ? 'CC BY-SA' : 'CC BY') && (x.r.metadata as any).licenceConflicts.OAPEN.status === 'needs human review' && /^20\.500\.12657\/\d+$/.test((x.r.metadata as any).licenceConflicts.OAPEN.handle) && JSON.stringify((x.r.metadata as any).licenceConflicts).length < 400) && rj.recordsDuplicateConflicting === eA.conflicting, { sample: byKind('conflicting')[0] && byKind('conflicting')[0].r.metadata });
  check('…no other kind of held book (enriched, unchanged, protected, ISBN-only, title-only, licence-fill) received a conflict note', byKind('conflicting').every(x => !(x.before.metadata as any).licenceConflicts) && heldA1.filter(r => S.heldKind(Number(r.fingerprint!.split(':')[2])) !== 'conflicting').every(r => !(r.metadata as any)?.licenceConflicts));
  check('PROTECTED: a book owned by a publisher is never added to, and an unchanged book stays unchanged', byKind('protected').length > 0 && byKind('protected').every(x => strip(x.r) === strip(x.before)) && byKind('unchanged').every(x => strip(x.r) === strip(x.before)));
  check('the real run wrote no run-log row, and the continuous engine\'s state — the OAPEN resumption token, the health row, sweeps, journal cursors — is byte-identical', (await catalogue()).runs === catA0.runs && same(await checkpoints(), cpA0) && JSON.stringify(await oapenCp()) === CP_BEFORE_ROW);

  const catA1 = await catalogue(); const heldA2 = await heldRows(SA);
  const again = await previewThenStart({ ...baseA }); const aj = await work(again.real.id);
  check('IDEMPOTENT: the same configuration again creates NO book and changes NO held book; every non-refused relevant record is now a duplicate', same(await catalogue(), catA1) && aj.recordsPublished === 0 && aj.recordsReview === 0 && aj.recordsDuplicate === eA.fetched - eA.refused && aj.recordsRefused === eA.refused && same((await heldRows(SA)).map(strip), heldA2.map(strip)), rowsOf(aj));

  // "metadata only allowed" and no file checks
  const SM = `m${RUN}`; const fakeM = useCorpus(SM, 100); await seedHeld(SM, 100);
  const { real: rm } = await previewThenStart({ ...cfg({ verifyFiles: false }), accessPreference: 'MetadataOnlyAllowed', maxRecords: 500 }); const mj = await work(rm.id); const eM = oracle(100, { pref: 'MetadataOnlyAllowed' }); const rowsM = await booksOf(SM);
  check('"metadata only allowed": a book with no or non-commercial licence is catalogued as metadata only / a link; only what the department and year rules hold back goes to review; counters equal the shape; NO file request was made', same(rowsOf(mj), expRows(eM)) && fakeM.log.every(u => u.includes('/oai/request')) && rowsM.filter(r => S.kindOf(idx(r)) === 6).every(r => r.status === 'Published' && r.accessStatus === 'MetadataOnly' && r.licenceIsNC === true) && rowsM.filter(r => S.kindOf(idx(r)) === 7).every(r => r.status === 'Published' && r.accessStatus === 'LinkOnly' && r.licenceIsNC === true && r.licence === 'CC BY-NC'), { got: rowsOf(mj), want: expRows(eM) });

  // Full text switched on: the ONLY way a book is offered as a file, and only when it really opens
  process.env.BOOK_FULLTEXT = '1';
  const SF = `f${RUN}`; useCorpus(SF, 100);
  const { real: rf } = await previewThenStart({ ...cfg({ verifyFiles: true }), accessPreference: 'MetadataOnlyAllowed', maxRecords: 500 }); await work(rf.id); const rowsF = await booksOf(SF); delete process.env.BOOK_FULLTEXT;
  const viewable = rowsF.filter(r => r.accessStatus === 'ViewableHere');
  check('RIGHTS (full text, only if the reader supports it): a file is offered ONLY for a commercial-use licence AND a file that really opens; a file that does not open, a non-commercial licence and no licence are never offered', viewable.length > 0 && viewable.every(r => !!r.pdfUrl && /^CC BY(-SA)?$/.test(r.licence || '') && S.fileOk(idx(r)) && r.rightsStatus === 'Accepted') && rowsF.filter(r => S.kindOf(idx(r)) >= 8 && !S.fileOk(idx(r))).every(r => r.accessStatus === 'LinkOnly' && r.pdfUrl === null) && rowsF.filter(r => [6, 7].includes(S.kindOf(idx(r)))).every(r => r.accessStatus !== 'ViewableHere' && r.pdfUrl === null), { viewable: viewable.length });

  // ═══════════════════════════════════════════════════════════════════════
  section('3. Department and publication window');
  const SW = `w${RUN}`; useCorpus(SW, 200); await seedHeld(SW, 200);
  const bW = { ...cfg(), accessPreference: 'OAFirst', maxRecords: 500, windowStart: '2010-01-01', windowEnd: '2020-12-31', departments: ['Law'] }; const eW = oracle(200, { fromYear: 2010, toYear: 2020, depts: ['Law'] });
  const { pv: pvW, real: rW } = await previewThenStart(bW); const wj = await work(rW.id); const rowsW = await booksOf(SW);
  check('a publication window and a department are applied: books outside the window (or with no date) are counted and skipped; books outside the department are refused with the reason; the dry run and the real run agree with the shape', pvW.status === 'Completed' && same(rowsOf(pvW), expRows(eW)) && same(rowsOf(wj), expRows(eW)) && statsOk(wj, eW) && eW.outsideWindow > 0 && eW.noDate > 0, { got: rowsOf(wj), want: expRows(eW), st: statsOf(wj) });
  check('…and only Law books (or the held ones) were written; none is outside the window', rowsW.every(r => S.deptOf(idx(r)) === 'Law' && (S.yearOf(idx(r)) as number) >= 2010 && (S.yearOf(idx(r)) as number) <= 2020) && ((pvW.preview as any).issues as any[]).some(i => /outside the selected departments/.test(i.reason)));

  // ═══════════════════════════════════════════════════════════════════════
  section('4. Chunk sizes that do not match the 100-record page: a checkpoint inside a page, and a chunk of several pages');
  for (const [size, key, total] of [[30, 'c', 300], [250, 'd', 600], [100, 'e', 300]] as const) {
    process.env.BACKFILL_CHUNK_SIZE = String(size);
    const SZ = `${key}${RUN}`; const f = useCorpus(SZ, total); await seedHeld(SZ, total); const e = oracle(total);
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 2000 });
    let sawMidPage = false, sawToken = false;
    for (let t = 0; t < 400; t++) { await W.backfillTick({ workerId: `w-${key}` }); const j = await reload(real.id); if (j!.cursor) { const c = JSON.parse(j!.cursor); if (c.a.length === 3) sawMidPage = true; if (c.t) sawToken = true; } if (finished(j!)) break; }
    const fj = (await reload(real.id))!;
    check(`chunks of ${size}: counters equal the shape exactly, every record scanned ONCE, no duplicate book${size === 30 ? '; 9 chunks over 3 pages, so most chunks ended INSIDE a page and resumed after the last record read' : size === 250 ? '; chunks spanned several pages' : ''}`, fj.status === 'Completed' && same(rowsOf(fj), expRows(e)) && statsOf(fj).scanned === total && (await dupDois(SZ)) === 0 && (await booksOf(SZ)).length === e.published + e.review && (size !== 30 || (sawMidPage && sawToken && fj.chunksCompleted >= 9)) && (size !== 250 || fj.chunksCompleted <= Math.ceil(e.fetched / 250) + 1), { got: rowsOf(fj), want: expRows(e), st: statsOf(fj), chunks: fj.chunksCompleted });
    delete process.env.BACKFILL_CHUNK_SIZE;
  }

  // ═══════════════════════════════════════════════════════════════════════
  section('5. Test B — 1,000 records (10 pages, realistic page size): checkpoint, pause, resume, cancel, kill, recovery, memory');
  const SB = `k${RUN}`; const fakeB = useCorpus(SB, 1000, { padBytes: 7000 }); await seedHeld(SB, 1000);
  const eB = oracle(1000); const bB = { ...cfg(), accessPreference: 'OAFirst', maxRecords: 2000 }; const bB0 = bB;
  const { pv: pvB, real: realB } = await previewThenStart(bB);
  check('the dry run over 10 pages completed with counters equal to the shape, scanning exactly 1,000 records, and wrote no book', pvB.status === 'Completed' && same(rowsOf(pvB), expRows(eB)) && statsOk(pvB, eB) && (await booksOf(SB)).length === 0, { got: rowsOf(pvB), want: expRows(eB), st: statsOf(pvB) });
  await W.backfillTick({ workerId: 'w-b' }); let mB = (await reload(realB.id))!; const cur1 = JSON.parse(mB.cursor!);
  check('the checkpoint is {source identity, token of the page holding the NEWEST record read, token of the page before it, the handles of the last three records read}: a bounded string — a place identified by records, never by an offset', mB.chunksCompleted === 1 && cur1.v === 2 && cur1.id === (mB.config as any).identity && /^xoai\/[^/]*\/[^/]*\/com_20\.500\.12657_5\/\d+$/.test(cur1.t) && cur1.p === '' && cur1.a.length === 3 && cur1.a.every((h: string) => /^20\.500\.12657\/\d+$/.test(h)) && mB.cursor!.length < 1200 && !('n' in cur1), mB.cursor);
  await J.controlJob(realB.id, 'pause', WHO); await W.backfillTick({ workerId: 'w-b' });
  mB = (await reload(realB.id))!;
  check('paused at a chunk boundary with its checkpoint saved and nothing half-done', mB.status === 'Paused' && mB.inflight === null && mB.recordsFetched === 100);
  const cpDuring = await checkpoints();
  await J.controlJob(realB.id, 'resume', WHO); const fB = await work(realB.id, 'w-b');
  console.log(`  [info] Test B (1,000 records, ~${mb(Number(fB.bytesProcessed))} MB of OAI XML): scanned ${statsOf(fB).scanned}, relevant ${fB.recordsFetched}, published ${fB.recordsPublished}, review ${fB.recordsReview}, refused ${fB.recordsRefused}, duplicates ${fB.recordsDuplicate} (enriched ${fB.recordsEnriched}, conflicting ${fB.recordsDuplicateConflicting}), failed ${fB.recordsFailed}; ${fB.chunksCompleted} chunks, ${statsOf(fB).requests} OAI requests, ${Math.round((fB.config as any).activeMs)} ms of working time`);
  check('resume continues from that checkpoint and finishes: counters equal the shape exactly, scanned 1,000 (no record counted twice), feed repeats (some across a page boundary) counted as duplicates', fB.status === 'Completed' && same(rowsOf(fB), expRows(eB)) && statsOk(fB, eB) && (await booksOf(SB)).length === eB.published + eB.review && (await dupDois(SB)) === 0, { got: rowsOf(fB), want: expRows(eB), st: statsOf(fB) });
  check('the job finished at the END of the feed (no checkpoint left), and the engine\'s state did not move while pausing, resuming and finishing', fB.cursor === null && (fB.config as any).finishedBecause === 'end of data' && same(cpDuring, await checkpoints()) && JSON.stringify(await oapenCp()) === CP_BEFORE_ROW);
  check('the dry run and the real run agree exactly, including the repeats the real run found through the catalogue and the dry run through its own memory', same(rowsOf(pvB), rowsOf(fB)));

  // cancel mid-way keeps what was imported
  const SC = `q${RUN}`; useCorpus(SC, 1000); await seedHeld(SC, 1000);
  const { real: realC } = await previewThenStart(bB);
  await W.backfillTick({ workerId: 'w-c' }); await W.backfillTick({ workerId: 'w-c' }); await J.controlJob(realC.id, 'cancel', WHO); await W.backfillTick({ workerId: 'w-c' });
  const cC = (await reload(realC.id))!; const keptC = (await booksOf(SC)).length;
  check('cancel stops at a chunk boundary and DELETES NOTHING already imported', cC.status === 'Cancelled' && cC.chunksCompleted === 2 && keptC > 0 && keptC === cC.recordsPublished + cC.recordsReview);
  await W.backfillTick({ workerId: 'w-c' }); check('…and no further work happens', (await reload(realC.id))!.chunksCompleted === 2 && (await booksOf(SC)).length === keptC);

  // real kill, mid-apply, in another process reading the same fake feed
  const SK = `x${RUN}`; useCorpus(SK, 1000, { padBytes: 7000 }); await seedHeld(SK, 1000);
  const { real: realK } = await previewThenStart(bB);
  const child = spawn('npx', ['tsx', 'scripts/backfill-worker-child.ts', 'child-oapen'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, BACKFILL_TEST_CRASH: 'mid-apply:40', BACKFILL_CHILD_OAPEN: `${SK}:1000:7000` }, stdio: 'ignore' });
  const exit: any = await new Promise(res => child.on('exit', (code, signal) => res({ code, signal })));
  const kd = (await reload(realK.id))!;
  check('SIGKILL mid-apply (40 books written): the process really died, the job is Running under the dead worker with its plan, counters still 0', (exit.signal === 'SIGKILL' || exit.code === 137) && kd.status === 'Running' && kd.claimedBy === 'child-oapen' && !!kd.inflight && kd.recordsFetched === 0 && (await booksOf(SK)).length === 40, { exit, rows: (await booksOf(SK)).length });
  const inf: any = kd.inflight;
  check('…the plan holds handles and one-letter outcomes only (no title, no record), the page\'s resume position, and what the source cost', inf.planned.every((p: any) => /^20\.500\.12657\/\d+$/.test(p[0]) && /^[PRHUECXF]$/.test(p[1])) && !JSON.stringify(inf).includes('handbook') && inf.expectedCursorAfter && JSON.parse(inf.expectedCursorAfter).id === (kd.config as any).identity && inf.meta.requests >= 1 && inf.meta.scanned > 0);
  await sleep(3300); const fK = await work(realK.id, 'w-recover');
  check('another process recovers it: the same page is verified, the 40 written are found, the counters equal an uninterrupted run, scanned counted ONCE, no duplicate book', fK.status === 'Completed' && same(rowsOf(fK), expRows(eB)) && statsOk(fK, eB) && (await dupDois(SK)) === 0 && (await booksOf(SK)).length === eB.published + eB.review, { got: rowsOf(fK), want: expRows(eB), st: statsOf(fK) });
  for (const [point, key] of [['after-inflight', 'p'], ['after-apply', 'r']] as const) {
    const S2 = `${key}${RUN}`; useCorpus(S2, 1000); await seedHeld(S2, 1000);
    const { real } = await previewThenStart(bB);
    H.__setCrash(point); try { await W.backfillTick({ workerId: 'w-dead' }); } catch { /* simulated */ }
    await goStale(real.id); const j = await work(real.id, 'w-recover');
    check(`crash ${point}: recovered with exact counters, scanned counted once, no duplicate`, j.status === 'Completed' && same(rowsOf(j), expRows(eB)) && statsOk(j, eB) && (await dupDois(S2)) === 0, rowsOf(j));
  }
  // a source that returns a different page when a chunk is retried
  { const S3 = `v${RUN}`; const ctl = useCorpus(S3, 300); const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 500 });
    H.__setCrash('after-inflight'); try { await W.backfillTick({ workerId: 'w-dead' }); } catch { /* simulated */ }
    ctl.mutate = (_o, ix) => ix.filter(i => i % 20 !== 9); await goStale(real.id); const j = await work(real.id, 'w-recover'); ctl.mutate = null;
    check('a feed that returns a different page (a relevant record missing) when the chunk is retried: nothing is applied or counted, the job stops (BACKFILL_PAGE_CHANGED_DURING_RETRY), the plan is kept as evidence', j.status === 'Failed' && String(j.lastError).startsWith('BACKFILL_PAGE_CHANGED_DURING_RETRY') && j.recordsFetched === 0 && !!j.inflight && (await booksOf(S3)).length === 0, { s: j.status, e: j.lastError, f: j.recordsFetched }); }

  // ═══════════════════════════════════════════════════════════════════════
  section('5b. The source CHANGES under a running job: no record is skipped, none is duplicated');
  // Records that leave OAPEN's closed list (changed after the job's closing time) move every later record one place towards the front. A reader that resumes by OFFSET jumps over the record
  // that moved into the gap. This section proves the hazard is real on the fake feed, and then that the adapter survives it.
  { const g = S.fakeOapen(S.makeCorpus('hz', 250)); const q = (u: string) => g.transport(u).then(r => r.text()).then(parseOaiPage);
    const first = await q('https://library.oapen.org/oai/request?verb=ListRecords&metadataPrefix=xoai&set=com_20.500.12657_5&until=2030-01-01T00:00:00Z');
    g.ctl.removed.add(5);                                                                      // one record leaves the list after page 1 was read
    const second = await q('https://library.oapen.org/oai/request?verb=ListRecords&resumptionToken=' + encodeURIComponent(first.resumptionToken!));
    check('SANITY: the hazard is real — after one record leaves, a plain offset resume starts one record too late and the record that moved into the gap would never be read', first.records[99].handle === S.handleOf('hz', 99) && second.records[0].handle === S.handleOf('hz', 101) && S.handleOf('hz', 100) !== second.records[0].handle); }

  const expectWritten = (i: number, seeded: boolean) => { const k = S.kindOf(i); if (k <= 1 || k === 4) return false; if (S.isRepeat(i)) return false; return !(seeded && S.heldKind(i)); };
  const idxOfDoi = (d: string) => Number(d.split('.').pop());
  const proveNoSkip = async (seed: string, total: number, removedEver: Set<number>, seeded: boolean) => {
    const rows = await booksOf(seed); const have = new Set(rows.map(r => idxOfDoi(r.doi!)));
    const missing: number[] = []; for (let i = 0; i < total; i++) if (expectWritten(i, seeded) && !removedEver.has(i) && !have.has(i)) missing.push(i);
    const phantom = [...have].filter(i => !expectWritten(i, seeded) && !S.isRepeat(i));
    return { missing, phantom, dups: await dupDois(seed), rows: rows.length, consumedTwice: consumedTwice() };
  };
  const mulberry = (a: number) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const runMutating = async (key: string, total: number, size: number, mutate: (chunk: number, ctl: any, removed: Set<number>, j: any) => void, hook?: (ctl: any, removed: Set<number>) => void, held = false) => {
    const seed = `${key}${RUN}`; process.env.BACKFILL_CHUNK_SIZE = String(size);
    const ctl = useCorpus(seed, total); const removed = new Set<number>(); if (held) await seedHeld(seed, total);
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 5000 });
    consumed.length = 0;          // from here on: only what the REAL job reads
    hook?.(ctl, removed);
    let j = (await reload(real.id))!;
    for (let t = 0; t < 400 && !finished(j); t++) { await W.backfillTick({ workerId: `w-${key}` }); j = (await reload(real.id))!; if (!finished(j)) { mutate(j.chunksCompleted, ctl, removed, j); } }
    delete process.env.BACKFILL_CHUNK_SIZE;
    return { seed, j, removed, ctl };
  };
  const leave = (ctl: any, removed: Set<number>, i: number) => { if (i >= 0 && !removed.has(i)) { removed.add(i); ctl.removed.add(i); } };
  const idxOfHandle = (h: string) => Number(h.slice(-5));

  { // 1. chunks that end INSIDE a page; records leave behind, at and ahead of the checkpoint between chunks
    const r = await runMutating('s1', 600, 30, (c, ctl, removed, j) => {
      const cur = JSON.parse(j.cursor ?? 'null'); const here = cur ? idxOfHandle(cur.a[0]) : 0;
      leave(ctl, removed, here - 7); leave(ctl, removed, here - 1); leave(ctl, removed, here + 1); leave(ctl, removed, here + 2);         // two already read, two just ahead of the boundary
    });
    const pr = await proveNoSkip(r.seed, 600, r.removed, false);
    check(`partial page read, the feed changes around the boundary after EVERY chunk (${r.removed.size} records left the list), resume each time: the job completes, NO record that stayed in the list is missing, none is duplicated, none appeared from nowhere`, r.j.status === 'Completed' && pr.missing.length === 0 && pr.consumedTwice === 0 && pr.phantom.length === 0 && pr.dups === 0 && r.removed.size >= 20, { status: r.j.status, err: r.j.lastError, missing: pr.missing.slice(0, 10), phantom: pr.phantom.slice(0, 5), dups: pr.dups, removed: r.removed.size });
    console.log(`  [info] mutation 1: 600 records, chunks of 30, ${r.removed.size} records left the list between chunks; written ${pr.rows}; source stats ${JSON.stringify(statsOf(r.j))}`); }

  { // 2. the same, at random places, ahead and behind, several seeds
    for (const sd of [11, 22, 33]) {
      const rnd = mulberry(sd);
      const r = await runMutating(`s2${sd}`, 800, 100, (c, ctl, removed, j) => { const n = 1 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) leave(ctl, removed, Math.floor(rnd() * 800)); });
      const pr = await proveNoSkip(r.seed, 800, r.removed, false);
      check(`random departures (seed ${sd}): ${r.removed.size} records left the list at random places, ahead of and behind the checkpoint: nothing missing, nothing duplicated`, r.j.status === 'Completed' && pr.missing.length === 0 && pr.consumedTwice === 0 && pr.phantom.length === 0 && pr.dups === 0, { status: r.j.status, err: r.j.lastError, missing: pr.missing.slice(0, 10), dups: pr.dups }); }
  }

  { // 3. a record leaves BETWEEN TWO PAGE REQUESTS of the same chunk (chunks of 250 span 3 pages)
    const r = await runMutating('s3', 600, 250, () => {}, (ctl, removed) => { let m = 0; ctl.hook = () => { m++; if (m === 4) leave(ctl, removed, 40); if (m === 9) leave(ctl, removed, 330); }; });
    const pr = await proveNoSkip(r.seed, 600, r.removed, false); const st = statsOf(r.j);
    check('a record leaves the list between two page requests of ONE chunk: the page just read is read again, differs, and the read carries on from the last record read — nothing missing, nothing duplicated', r.j.status === 'Completed' && (st.reread ?? 0) >= 1 && pr.missing.length === 0 && pr.consumedTwice === 0 && pr.phantom.length === 0 && pr.dups === 0, { st, missing: pr.missing.slice(0, 10), status: r.j.status, err: r.j.lastError }); }

  { // 3b. the checkpoint sits at the very start of page 2 and records ahead of it leave: the checkpoint's records move onto the PREVIOUS page and are found there
    const r = await runMutating('s3b', 400, 91, (c, ctl, removed) => { if (c === 1) { leave(ctl, removed, 50); leave(ctl, removed, 51); leave(ctl, removed, 52); } });
    const pr = await proveNoSkip(r.seed, 400, r.removed, false); const st = statsOf(r.j);
    check('the checkpoint is a few records into page 2 and three earlier records leave the list: its records have moved onto page 1, are found there (rewound), and the read continues after them — nothing missing, nothing duplicated', r.j.status === 'Completed' && (st.rewound ?? 0) >= 1 && pr.missing.length === 0 && pr.consumedTwice === 0 && pr.phantom.length === 0 && pr.dups === 0, { st, status: r.j.status, err: r.j.lastError, missing: pr.missing.slice(0, 8) });
    console.log(`  [info] mutation 3b: rewound ${st.rewound}, re-read ${st.reread}, requests ${st.requests}, written ${pr.rows}`); }

  { // 4. the checkpoint's own records leave: still found through an older anchor, or the job STOPS — it never guesses
    const SX = `s4${RUN}`; process.env.BACKFILL_CHUNK_SIZE = '30'; const ctl = useCorpus(SX, 400); const removed = new Set<number>();
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 5000 });
    consumed.length = 0; await W.backfillTick({ workerId: 'w-x' }); const j1 = (await reload(real.id))!; const a = JSON.parse(j1.cursor!).a as string[];
    const rows1 = (await booksOf(SX)).length;
    leave(ctl, removed, idxOfHandle(a[0])); leave(ctl, removed, idxOfHandle(a[1]));          // the two newest anchors leave; the third remains
    const done = await work(real.id, 'w-x'); const pr = await proveNoSkip(SX, 400, removed, false);
    check('the two newest records of the checkpoint leave the list: the oldest of the three is found, the read continues after it — nothing missing, nothing duplicated', done.status === 'Completed' && pr.missing.length === 0 && pr.consumedTwice === 0 && pr.dups === 0 && pr.phantom.length === 0, { status: done.status, err: done.lastError, missing: pr.missing.slice(0, 5) });
    const SY = `s5${RUN}`; const ctl2 = useCorpus(SY, 400); const removed2 = new Set<number>();
    const { real: real2 } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 5000 });
    await W.backfillTick({ workerId: 'w-x2' }); const k1 = (await reload(real2.id))!; const a2 = JSON.parse(k1.cursor!).a as string[]; const writtenAtStop = (await booksOf(SY)).length;
    for (const h of a2) leave(ctl2, removed2, idxOfHandle(h));                                // all three leave
    await W.backfillTick({ workerId: 'w-x2' }); const k2 = (await reload(real2.id))!;
    check('all three records of the checkpoint leave the list: the job STOPS (OAPEN_FEED_CHANGED, Failed), keeps its checkpoint, writes nothing further, counts nothing further, and is not retried — it does not guess a position', k2.status === 'Failed' && String(k2.lastError).startsWith('OAPEN_FEED_CHANGED') && k2.cursor === k1.cursor && k2.recordsFetched === k1.recordsFetched && (await booksOf(SY)).length === writtenAtStop && (await W.backfillTick({ workerId: 'w-x2' })).reason === 'no-job', { s: k2.status, e: k2.lastError });
    delete process.env.BACKFILL_CHUNK_SIZE; void rows1; }

  { // 5. the same with duplicates and enrichment in play: held books, repeats and conflicts, while the feed changes
    const rnd = mulberry(77); const SH = `s6${RUN}`; process.env.BACKFILL_CHUNK_SIZE = '100'; const ctl = useCorpus(SH, 600); await seedHeld(SH, 600); const removed = new Set<number>();
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 5000 }); consumed.length = 0;
    let j = (await reload(real.id))!;
    for (let t = 0; t < 100 && !finished(j); t++) { await W.backfillTick({ workerId: 'w-h' }); j = (await reload(real.id))!; for (let k = 0; k < 3; k++) leave(ctl, removed, Math.floor(rnd() * 600)); }
    delete process.env.BACKFILL_CHUNK_SIZE;
    const pr = await proveNoSkip(SH, 600, removed, true);
    check('with held duplicates, feed repeats and conflicts in play while the feed changes: completed, nothing missing, no duplicate book, and the held books were not duplicated or changed beyond their empty fields', j.status === 'Completed' && pr.missing.length === 0 && pr.consumedTwice === 0 && pr.phantom.length === 0 && pr.dups === 0 && j.recordsFailed === 0, { status: j.status, err: j.lastError, missing: pr.missing.slice(0, 8), dups: pr.dups }); }

  // ═══════════════════════════════════════════════════════════════════════
  section('5c. Accounting: recovery re-reads never become business counts');
  // Re-reading is about PAGES (a verification read, a re-read after the list changed, a read of the page before). A record is only ever counted when the adapter hands it to the framework, and
  // the checkpoint is "after the last record read", so a recovery never hands over the same record twice. These runs force every recovery while only changing things that cannot change a
  // business outcome (records already read leave; records that are not books — deletion notices, untitled — leave ahead of the checkpoint), so the counters must equal an UNDISTURBED run exactly.
  { const calm = oracle(600); const gone = { deleted: 0, unusable: 0 };
    const r = await runMutating('s7', 600, 30, (c, ctl, removed, j) => {
      const cur = JSON.parse(j.cursor ?? 'null'); const here = cur ? idxOfHandle(cur.a[0]) : 0;
      leave(ctl, removed, here - 5); leave(ctl, removed, here - 2);                                     // already read, already counted
      let n = 0; for (let i = here + 1; i < 600 && n < 2; i++) if (S.kindOf(i) <= 1 && !removed.has(i)) { leave(ctl, removed, i); S.kindOf(i) === 0 ? gone.deleted++ : gone.unusable++; n++; }          // ahead, and not books
    }, undefined, true);
    const pr = await proveNoSkip(r.seed, 600, r.removed, true); const st = statsOf(r.j);
    check(`chunks of 30 while ${r.removed.size} records leave the list: every counter — published, review, refused, GENUINE duplicates (held, repeats), enriched, conflicting — equals the undisturbed run exactly; scanned/deleted/unreadable fall only by the not-yet-read non-books that left; no record was handed over twice`, r.j.status === 'Completed' && same(rowsOf(r.j), expRows(calm)) && st.scanned === 600 - gone.deleted - gone.unusable && st.deleted === calm.deleted - gone.deleted && st.unusable === calm.unusable - gone.unusable && pr.missing.length === 0 && pr.consumedTwice === 0 && pr.rows === calm.published + calm.review && pr.dups === 0, { got: rowsOf(r.j), want: expRows(calm), st, gone, twice: pr.consumedTwice }); }

  { const calm = oracle(600);
    const r = await runMutating('s8', 600, 250, () => {}, (ctl, removed) => { let m = 0; ctl.hook = () => { m++; if (m === 4) leave(ctl, removed, 40); if (m === 9) leave(ctl, removed, 100); }; }, true);
    const pr = await proveNoSkip(r.seed, 600, r.removed, true); const st = statsOf(r.j);
    check('a record leaves between two page requests of one chunk (a re-read is forced): the page is re-read, differs, the read carries on — and the counters equal the undisturbed run exactly; the re-read is recorded in the job\'s source stats (reread), not in any business counter', r.j.status === 'Completed' && (st.reread ?? 0) >= 1 && same(rowsOf(r.j), expRows(calm)) && st.scanned === 600 && pr.consumedTwice === 0 && pr.missing.length === 0 && pr.dups === 0 && pr.rows === calm.published + calm.review, { got: rowsOf(r.j), want: expRows(calm), st, twice: pr.consumedTwice }); }

  { const calm = oracle(400);
    const r = await runMutating('s9', 400, 91, (c, ctl, removed) => { if (c === 1) { leave(ctl, removed, 50); leave(ctl, removed, 51); leave(ctl, removed, 52); } }, undefined, true);
    const pr = await proveNoSkip(r.seed, 400, r.removed, true); const st = statsOf(r.j);
    check('the checkpoint\'s records move onto the previous page (a rewind is forced): counters equal the undisturbed run exactly, scanned counted once, nothing handed over twice', r.j.status === 'Completed' && (st.rewound ?? 0) >= 1 && same(rowsOf(r.j), expRows(calm)) && st.scanned === 400 && pr.consumedTwice === 0 && pr.missing.length === 0 && pr.dups === 0, { got: rowsOf(r.j), want: expRows(calm), st }); }

  { // a PREVIEW remembers the books it would add (it writes nothing); judging the SAME chunk again must not make it see its own books as repeats
    const seed = `dj${RUN}`; seeds.push(seed);
    const xml = `<OAI-PMH><ListRecords>${Array.from({ length: 40 }, (_, k) => S.recordXml(seed, 30 + k)).join('')}</ListRecords></OAI-PMH>`;
    const items = parseOaiPage(xml).records.filter(r => !r.deleted).map(r => ({ id: r.handle!, item: { book: normaliseOaiBook(OAPEN_OAI, r)! } })).filter(x => x.item.book?.title);
    const job: any = { id: `dry-${RUN}`, provider: 'oapen', contentType: 'BOOK', dryRun: true, createdAt: new Date(), identity: null, windowStart: null, windowEnd: null, departments: [], accessPreference: 'OAFirst', maxRecords: 999, adapter: {} };
    const a = await BC.judgeBookItems(items, job, OAPEN_OAI, { verifyFiles: false }), b = await BC.judgeBookItems(items, job, OAPEN_OAI, { verifyFiles: false });
    const repeats = (x: any[]) => x.filter(j => /earlier in the feed/.test(j.reason || '')).length;
    check('a dry-run chunk judged TWICE (a retry, a recovery re-read) gives the identical result: a book it remembered from the first pass is not then called a repeat of itself; the one genuine feed repeat is still found', same(a.map(j => [j.id, j.outcome, j.dup]), b.map(j => [j.id, j.outcome, j.dup])) && repeats(a) === 1 && repeats(b) === 1, { first: repeats(a), second: repeats(b) });
    BC.__clearDryKeys(); }

  // ═══════════════════════════════════════════════════════════════════════
  section('6. A source that says wait, rests, fails or refuses — and a backfill that never writes OAPEN\'s health');
  { const S4 = `n${RUN}`; const ctl = useCorpus(S4, 300); await seedHeld(S4, 300); const e = oracle(300); const healthBefore = JSON.stringify(await healthRow());
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 500 }); const cp0 = await checkpoints();
    ctl.fail = { n: 1, status: 429, retryAfter: 1 }; ctl.log.length = 0;
    const t1 = await W.backfillTick({ workerId: 'w-n' }); const j1 = (await reload(real.id))!;
    check('HTTP 429 with Retry-After: the chunk is not run, nothing is counted, the job stays Running and says why and until when — it did NOT fail, and no error streak built', t1.reason === 'wait' && j1.status === 'Running' && j1.recordsFetched === 0 && j1.chunksCompleted === 0 && (j1.config as any).waiting?.reason?.includes('429') && Date.parse((j1.config as any).waiting.until) > Date.now() && ((j1.config as any).errorStreak ?? 0) === 0 && j1.lastError === null, { t1, w: (j1.config as any).waiting });
    check('…a backfill never writes OAPEN\'s health row (its failures belong to the continuous engine): the row and every checkpoint are exactly as they were', JSON.stringify(await healthRow()) === healthBefore && same(await checkpoints(), cp0));
    const logged = ctl.log.length; const t2 = await W.backfillTick({ workerId: 'w-n' });
    check('inside the wait the source is NOT asked again (not one more request)', t2.reason === 'wait' && ctl.log.length === logged && (t2.waitMs ?? 0) > 0);
    await sleep(1200); const fj = await work(real.id, 'w-n');
    check('after the wait it carries on and finishes with exact counters; the waiting note is gone', fj.status === 'Completed' && same(rowsOf(fj), expRows(e)) && (fj.config as any).waiting === undefined && statsOf(fj).scanned === 300, rowsOf(fj)); }
  { const S5 = `o${RUN}`; const ctl = useCorpus(S5, 300); await seedHeld(S5, 300); const e = oracle(300);
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 500 });
    // the continuous engine has OAPEN resting (its breaker is open): a backfill makes no request at all
    await db.ingestionSourceHealth.upsert({ where: { source: 'OAPEN' }, create: { source: 'OAPEN', consecutiveFailures: 6, lifetimeFailures: 6, pausedUntil: new Date(Date.now() + 120_000), lastError: 'HTTP 503', lastErrorKind: 'http_5xx', lastFailureAt: new Date() }, update: { consecutiveFailures: 6, pausedUntil: new Date(Date.now() + 120_000), lastError: 'HTTP 503', lastErrorKind: 'http_5xx' } });
    const hRest = JSON.stringify(await healthRow()); ctl.log.length = 0;
    const t = await W.backfillTick({ workerId: 'w-o' }); const j = (await reload(real.id))!;
    check('the engine\'s breaker is OPEN for OAPEN: no request is made, the job waits (Running, not failed) and names the reason', t.reason === 'wait' && ctl.log.length === 0 && j.status === 'Running' && /resting/.test((j.config as any).waiting?.reason) && JSON.stringify(await healthRow()) === hRest, { t, w: (j.config as any).waiting });
    // the rest is over, but the engine has not yet made its single test request: a backfill is never that request
    await db.ingestionSourceHealth.update({ where: { source: 'OAPEN' }, data: { pausedUntil: null } }); await db.backfillJob.update({ where: { id: real.id }, data: { config: { ...(j.config as any), waiting: undefined } as any } });
    const t3 = await W.backfillTick({ workerId: 'w-o' });
    check('the rest is over but the engine has not re-tested the source yet: the backfill still does not ask (it is never the engine\'s test request)', t3.reason === 'wait' && ctl.log.length === 0, t3);
    await db.ingestionSourceHealth.update({ where: { source: 'OAPEN' }, data: { consecutiveFailures: 0, lastError: null, lastErrorKind: null } }); await db.backfillJob.update({ where: { id: real.id }, data: { config: { ...((await reload(real.id))!.config as any), waiting: undefined } as any } });
    const fj = await work(real.id, 'w-o');
    check('once the source is healthy again the job continues and finishes with exact counters', fj.status === 'Completed' && same(rowsOf(fj), expRows(e)), rowsOf(fj));
    await db.ingestionSourceHealth.deleteMany({ where: { source: 'OAPEN' } }); }
  { const S6 = `u${RUN}`; const ctl = useCorpus(S6, 300); await seedHeld(S6, 300); const e = oracle(300); const healthBefore = JSON.stringify(await healthRow());
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 500 });
    ctl.throwNext = 1; const a = await W.backfillTick({ workerId: 'w-u' }); const ja = (await reload(real.id))!;
    check('a network error: the chunk is released for another try (error streak 1), nothing counted, nothing written, the health row untouched', a.reason === 'error' && ja.status === 'Running' && ja.recordsFetched === 0 && (ja.config as any).errorStreak === 1 && JSON.stringify(await healthRow()) === healthBefore && /did not answer/.test(ja.lastError || ''), { a, e: ja.lastError });
    ctl.fail = { n: 1, status: 500 }; const b = await W.backfillTick({ workerId: 'w-u' }); const jb = (await reload(real.id))!;
    check('an HTTP 500: also a retried error, not a wait; and the third failure in a row would fail the job (streak 2 now)', b.reason === 'error' && (jb.config as any).errorStreak === 2 && jb.status === 'Running' && /HTTP 500/.test(jb.lastError || ''));
    const fj = await work(real.id, 'w-u'); check('then the source answers and the job finishes with exact counters (the streak is reset by a chunk that commits)', fj.status === 'Completed' && same(rowsOf(fj), expRows(e)) && (fj.config as any).errorStreak === 0, rowsOf(fj)); }
  { const S7 = `t${RUN}`; const ctl = useCorpus(S7, 300); await seedHeld(S7, 300);
    const { real } = await previewThenStart({ ...cfg(), accessPreference: 'OAFirst', maxRecords: 500 });
    await W.backfillTick({ workerId: 'w-t' }); const before = (await reload(real.id))!; const booksBefore = (await booksOf(S7)).length;
    ctl.badToken = true; await W.backfillTick({ workerId: 'w-t' }); const after = (await reload(real.id))!; ctl.badToken = false;
    check('OAPEN no longer honours the resumption token: the job STOPS (OAPEN_TOKEN_REJECTED), the checkpoint is kept, nothing is reset, nothing more is written, and it is not retried', after.status === 'Failed' && String(after.lastError).startsWith('OAPEN_TOKEN_REJECTED') && after.cursor === before.cursor && after.chunksCompleted === 1 && (await booksOf(S7)).length === booksBefore && (await W.backfillTick({ workerId: 'w-t' })).reason === 'no-job'); }
  { const S8 = `y${RUN}`; useCorpus(S8, 1000); await seedHeld(S8, 1000);
    // a window that matches few records: one chunk may read at most BACKFILL_OAPEN_MAX_PAGES_PER_CHUNK pages, so it cannot scan the feed
    process.env.BACKFILL_OAPEN_MAX_PAGES_PER_CHUNK = '2'; process.env.BACKFILL_CHUNK_SIZE = '100';
    const bY = { ...cfg(), accessPreference: 'OAFirst', maxRecords: 2000, windowStart: '2024-01-01', windowEnd: '2024-12-31' }; const e = oracle(1000, { fromYear: 2024, toYear: 2024 });
    const { real } = await previewThenStart(bY); let maxPages = 0, maxReq = 0, chunks = 0;
    for (let t = 0; t < 100; t++) { const b0 = statsOf((await reload(real.id))!); await W.backfillTick({ workerId: 'w-y' }); const j = (await reload(real.id))!; maxPages = Math.max(maxPages, (statsOf(j).pages ?? 0) - (b0.pages ?? 0)); maxReq = Math.max(maxReq, (statsOf(j).requests ?? 0) - (b0.requests ?? 0)); chunks = j.chunksCompleted; if (finished(j)) break; }
    const fj = (await reload(real.id))!; delete process.env.BACKFILL_OAPEN_MAX_PAGES_PER_CHUNK; delete process.env.BACKFILL_CHUNK_SIZE;
    check('a window that matches few records: no chunk moved through more than 3 pages (the allowance of 2 moves), so it cannot scan the feed, yet the job scanned all 1,000 records, found exactly the matching ones and finished', fj.status === 'Completed' && maxPages <= 3 && maxReq <= 7 && chunks >= 4 && statsOk(fj, e) && same(rowsOf(fj), expRows(e)), { maxPages, maxReq, chunks, got: rowsOf(fj), want: expRows(e), st: statsOf(fj) }); }

  // ═══════════════════════════════════════════════════════════════════════
  section('7. Resources — a fresh worker process running a job to completion, at three feed sizes (does memory follow the size of the feed?)');
  clearInterval(rssTimer);
  const measure = async (key: string, total: number) => {
    const SR = `${key}${RUN}`; useCorpus(SR, total, { padBytes: 7000 }); await seedHeld(SR, total); const e = oracle(total);
    const { real } = await previewThenStart(bB0);
    const child = spawn('npx', ['tsx', 'scripts/backfill-worker-child.ts', `child-rss-${key}`], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, BACKFILL_CHILD_OAPEN: `${SR}:${total}:7000`, BACKFILL_CHILD_REPORT_RSS: '1', NODE_OPTIONS: '--expose-gc' }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; child.stdout.on('data', d => { out += d; }); const t0 = Date.now();
    await new Promise(res => child.on('exit', res)); const secs = (Date.now() - t0) / 1000;
    const rss = JSON.parse(/RSS:(\{.*\})/.exec(out)?.[1] ?? '{"base":0,"peak":0}'); const j = (await reload(real.id))!;
    return { rss, j, e, secs, growth: rss.peak - rss.base, live: (rss.heapEnd ?? 0) - (rss.heapBase ?? 0) };
  };
  const m1 = await measure('g', 300), m2 = await measure('h', 1200), m3 = await measure('i', 2000);
  for (const m of [m1, m2, m3]) console.log(`  [info] worker process, ${statsOf(m.j).scanned} records (${mb(Number(m.j.bytesProcessed))} MB of OAI XML, ${m.j.chunksCompleted} chunks, ${statsOf(m.j).requests} requests): ${mb(m.rss.base)} MB resident before the job, ${mb(m.rss.peak)} MB at its peak (growth ${mb(m.growth)} MB); live heap after a forced GC: ${mb(m.rss.heapBase ?? 0)} MB before → ${mb(m.rss.heapEnd ?? 0)} MB after, ${(Number(m.j.bytesProcessed) / 1048576 / m.secs).toFixed(1)} MB/s end to end including startup`);
  check('all three jobs completed in a separate process with exact counters', [m1, m2, m3].every(m => m.j.status === 'Completed' && same(rowsOf(m.j), expRows(m.e)) && statsOk(m.j, m.e)), { a: rowsOf(m1.j), b: rowsOf(m2.j), c: rowsOf(m3.j) });
  check('MEMORY (no accumulation): after the job, and a forced garbage collection, the live heap is the same whatever the size of the feed — 300, 1,200 and 2,000 records leave within 25 MB of each other, and none more than 60 MB above where the process started; nothing the job read is kept', [m1, m2, m3].every(m => m.rss.heapEnd > 0) && Math.max(m1.live, m2.live, m3.live) - Math.min(m1.live, m2.live, m3.live) < 25 * 1048576 && Math.max(m1.live, m2.live, m3.live) < 60 * 1048576, { small: mb(m1.live), mid: mb(m2.live), large: mb(m3.live) });
  check('MEMORY (peak): the process peak stays under 250 MB resident for a 2,000-record, ~50 MB feed (the peak is the pages in flight plus garbage not yet collected)', m3.rss.peak < 250 * 1048576, { small: mb(m1.rss.peak), mid: mb(m2.rss.peak), large: mb(m3.rss.peak) });
  console.log(`  [info] the test process itself, over every run above (kills and recoveries included): start ${mb(rss0)} MB, peak ${mb(peakRss)} MB`);

  }

  // ═══════════════════════════════════════════════════════════════════════
  if (process.env.OAPEN_REAL === '1' || LIVE_ONLY) {
    section('8. Test C — a SMALL REAL OAPEN sample (live OAI-PMH, no file checks, scratch database)');
    const urls: string[] = []; const sizes: number[] = [];
    __useFetchForTests(async (u: any, init?: any) => { urls.push(String(u)); const r = await fetch(u, init); if (String(u).includes('/oai/request')) { const c = r.clone(); c.text().then(t => sizes.push(t.length)).catch(() => {}); } return r; });
    process.env.BACKFILL_OAPEN_REQUEST_GAP_MS = '1500'; OS.__resetOapenThrottle(); BC.__clearDryKeys();
    const catC0 = await catalogue(); const cpC0 = await checkpoints();
    const fixtureRows = await db.book.count({ where: { OR: [{ createdBy: 'BackfillTest' }, { doi: { startsWith: '10.7777/oapen.' } }] } });
    console.log(`  [info] BEFORE the live sample: ${catC0.books} books in the scratch database = ${fixtureRows} left by this suite's fixture/test sections + ${catC0.books - fixtureRows} that were there before the suite started`);
    const realC = { ...cfg({ verifyFiles: false }), accessPreference: 'OAFirst', maxRecords: 100 };
    const d0 = await J.describeSource('oapen', {}); console.log(`  [info] ${d0.summary}`);
    const t0 = Date.now(); const { pv: pvC, real: rC } = await previewThenStart(realC); const jC = await work(rC.id); const secs = (Date.now() - t0) / 1000;
    const rowsC = await db.book.findMany({ where: { createdBy: `Backfill:${rC.id}` } });
    const oai = urls.filter(u => /verb=ListRecords/.test(u));
    console.log(`  [info] real requests so far: ${oai.length} OAI ListRecords (+ ${urls.length - oai.length} Identify) for the dry run and the real run, in ${secs.toFixed(0)} s; response sizes ${sizes.map(s => (s / 1048576).toFixed(2)).join(' / ')} MB`);
    console.log(`  [info] first request : ${oai[0]}\n  [info] second request: ${oai[1] ?? '(none)'}`);
    const st = statsOf(jC), licences = new Map<string, number>(); for (const r of rowsC) licences.set(r.licence || '(none)', (licences.get(r.licence || '(none)') ?? 0) + 1);
    console.log(`  [info] real dry run: ${JSON.stringify(rowsOf(pvC))}\n  [info] real run    : ${JSON.stringify(rowsOf(jC))}\n  [info] source stats: ${JSON.stringify(st)}\n  [info] licences of the ${rowsC.length} written books: ${JSON.stringify(Object.fromEntries(licences))}; statuses: published ${rowsC.filter(r => r.status === 'Published').length}, drafts ${rowsC.filter(r => r.status === 'Draft').length}; with a DOI ${rowsC.filter(r => r.doi).length}, with an ISBN ${rowsC.filter(r => r.isbn).length}`);
    const tok2 = oai[1] ? decodeURIComponent(/resumptionToken=([^&]*)/.exec(oai[1])?.[1] ?? '') : null; const until1 = decodeURIComponent(/until=([^&]*)/.exec(oai[0])?.[1] ?? '');
    console.log(`  [info] the token OAPEN gave for page 2: ${tok2}   (the first request was closed at ${until1})`);
    check('the first request is the Books set in xoai, closed with until=; the next page was asked for by the token OAPEN itself gave, not one we built', /set=com_20\.500\.12657_5&until=/.test(oai[0]) && (!oai[1] || /^xoai\//.test(tok2 || '')), oai.slice(0, 2));
    check('the real dry run wrote nothing and the real run equals it; every record read was counted (scanned = relevant + deleted + unreadable)', pvC.status === 'Completed' && jC.status === 'Completed' && same(rowsOf(jC), rowsOf(pvC)) && st.scanned === jC.recordsFetched + (st.deleted ?? 0) + (st.unusable ?? 0) && jC.recordsFetched >= 90, { st, f: jC.recordsFetched });
    check('every written real book came from OAPEN with its own handle, wrote nothing as a file or Full Text, has the job that wrote it, and a Draft has no department', rowsC.length === jC.recordsPublished + jC.recordsReview && rowsC.every(r => r.source === 'OAPEN' && /^20\.500\.12657\/\d+$/.test(r.sourceRecordId || '') && r.accessStatus !== 'ViewableHere' && r.pdfUrl === null && (r.metadata as any).backfill?.jobId === rC.id && (r.status === 'Published' || r.domain === null)));
    check('RIGHTS (real data): nothing was published without a department; every licence written is one OAPEN declared for that title or none; no non-commercial or undeclared book is published under "open access first"', rowsC.filter(r => r.status === 'Published').every(r => !!r.domain && r.licence && !r.licenceIsNC) && rowsC.every(r => !r.licence || /^CC|^Public/i.test(r.licence)));
    const catC1 = await catalogue(); const { real: r2 } = await previewThenStart(realC); const j2 = await work(r2.id);
    check('IDEMPOTENT on real data: running it again creates no book; everything relevant that was written is now a duplicate', same(await catalogue(), catC1) && j2.recordsPublished === 0 && j2.recordsReview === 0, rowsOf(j2));
    check('real data did not move any continuous-engine checkpoint, health row, or the OAPEN resumption token', same(await checkpoints(), cpC0) && JSON.stringify(await oapenCp()) === CP_BEFORE_ROW);
    console.log(`  [info] catalogue around the real sample: books ${catC0.books} → ${catC1.books} (+${catC1.books - catC0.books}, all removed at the end)`);
    // The live sample's own catalogue delta, separated from everything else, then removed on its own.
    const liveJobs = [rC.id, r2.id]; const liveRows = await db.book.findMany({ where: { createdBy: { in: liveJobs.map(i => `Backfill:${i}`) } }, select: { status: true, createdBy: true } });
    const fixtureAfter = await db.book.count({ where: { OR: [{ createdBy: 'BackfillTest' }, { doi: { startsWith: '10.7777/oapen.' } }] } });
    console.log(`  [info] LIVE SAMPLE (job ${rC.id}): scanned ${st.scanned}; deletion notices skipped ${st.deleted}; relevant ${jC.recordsFetched}; rows CREATED ${liveRows.length} (published ${liveRows.filter(r => r.status === 'Published').length}, review/draft ${liveRows.filter(r => r.status === 'Draft').length}); REFUSED (not catalogued) ${jC.recordsRefused}; already held ${jC.recordsDuplicate}; failed ${jC.recordsFailed}`);
    console.log(`  [info] LIVE SAMPLE, second run (idempotence check, job ${r2.id}): rows created ${j2.recordsPublished + j2.recordsReview}; already held ${j2.recordsDuplicate} (enriched ${j2.recordsEnriched}, conflicting ${j2.recordsDuplicateConflicting}); refused ${j2.recordsRefused}`);
    console.log(`  [info] books now: ${catC1.books} = ${fixtureAfter} fixture/test rows + ${liveRows.length} live rows + ${catC1.books - fixtureAfter - liveRows.length} pre-existing; delta caused by the live sample = +${catC1.books - catC0.books}`);
    await db.book.deleteMany({ where: { createdBy: { in: liveJobs.map(i => `Backfill:${i}`) } } });
    const catC2 = await catalogue();
    console.log(`  [info] after removing ONLY the live sample's rows: ${catC2.books} books (= the ${catC0.books} before the live sample)`);
    check('the live sample\'s own delta is exactly its created rows, and removing them alone returns the catalogue to what it was before the live sample', catC1.books - catC0.books === liveRows.length && liveRows.length === jC.recordsPublished + jC.recordsReview && catC2.books === catC0.books && fixtureAfter === fixtureRows);
    __useFetchForTests(null); process.env.BACKFILL_OAPEN_REQUEST_GAP_MS = '0';
  } else console.log('\n8. Test C (real OAPEN sample): skipped — OAPEN_REAL=1 not set');

  section('9. Nothing else moved');
  const AFTER_CAT = await catalogue(), AFTER_CP = await checkpoints();
  check('every continuous-engine checkpoint is byte-identical to before this suite: book harvest (including the OAPEN resumption token), sweeps, journal cursors, settings and rotation, provider health', same(BEFORE_CP, AFTER_CP) && JSON.stringify(await oapenCp()) === CP_BEFORE_ROW, { BEFORE_CP, AFTER_CP });
  check('no article, journal, publisher or run-log row was created by any backfill; only books', AFTER_CAT.articles === BEFORE_CAT.articles && AFTER_CAT.journals === BEFORE_CAT.journals && AFTER_CAT.publishers === BEFORE_CAT.publishers && AFTER_CAT.runs === BEFORE_CAT.runs && AFTER_CAT.books >= BEFORE_CAT.books, { BEFORE_CAT, AFTER_CAT });
  console.log(`\n  catalogue before : ${JSON.stringify(BEFORE_CAT)}\n  catalogue after  : ${JSON.stringify(AFTER_CAT)}   (differs by this suite's OAPEN test books, removed next)`);
} catch (e: any) {
  fail++; console.log('  FAIL  the suite crashed:', e?.stack || e);
} finally {
  clearInterval(rssTimer); __useFetchForTests(null);
  await db.book.deleteMany({ where: { OR: [{ createdBy: 'BackfillTest' }, { createdBy: { in: jobIds.map(i => `Backfill:${i}`) } }, ...seeds.map(s => ({ source: 'OAPEN', doi: { startsWith: `10.7777/oapen.${s}.` } }))] } });
  await db.backfillJob.deleteMany({ where: { createdBy: WHO.email } });
  if (!cpExisting) await db.bookHarvestCheckpoint.deleteMany({ where: { provider: 'OAPEN' } });
  await db.ingestionSourceHealth.deleteMany({ where: { source: 'OAPEN' } }); if (HEALTH_ORIGINAL) await db.ingestionSourceHealth.create({ data: HEALTH_ORIGINAL as any });
  const AFTER_CLEAN = await catalogue();
  console.log(`  catalogue cleaned: ${JSON.stringify(AFTER_CLEAN)}`);
  check('after cleanup the catalogue is exactly as it was before the suite', same(BEFORE_CAT, AFTER_CLEAN), { BEFORE_CAT, AFTER_CLEAN });
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
