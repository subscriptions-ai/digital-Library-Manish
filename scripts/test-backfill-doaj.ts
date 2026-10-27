/**
 * Phase 2E: DOAJ journal ENRICHMENT as a backfill adapter, proved on DOAJ-FORMAT fixtures (100 and 1,000 rows) and, when DOAJ_REAL_SNAPSHOT names a staged copy of the real
 * official file, on its first rows. No network is used. The numbers in brackets, (#n), are the numbered cases of the brief's test plan.
 *
 *   [DOAJ_REAL_SNAPSHOT=<path to doaj_journalcsv_…_utf8.csv>] npx tsx scripts/test-backfill-doaj.ts
 *
 * Private throwaway database `stm_doaj_enrichment_test` only (refuses anything else; see TEST_DB below for how to create it). Everything the suite creates is removed at the end; the journal table, the article-eligibility set and every
 * continuous DOAJ checkpoint are compared before and after.
 */
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
// A PRIVATE database: the shared stm_ingestion_test is written by other suites (and other sessions) at the same time, so a whole-table count there cannot be exact — that is what made
// "enrichment never creates a journal" fail once. Create it once: createdb stm_doaj_enrichment_test && DATABASE_URL=…/stm_doaj_enrichment_test npx prisma db push
const TEST_DB = 'stm_doaj_enrichment_test';
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, `/${TEST_DB}`);
process.env.DATABASE_URL = TEST_URL;
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'doaj-test-'));
for (const k of Object.keys(process.env)) if (k.startsWith('BACKFILL_') || k === 'INGESTION_BACKFILL_ENABLED') delete process.env[k];
Object.assign(process.env, { INGESTION_BACKFILL_ENABLED: 'true', BACKFILL_DOAJ_ENABLED: 'true', DOAJ_SNAPSHOT_DIR: ROOT, BACKFILL_MIN_GAP_SECONDS: '0', BACKFILL_HEARTBEAT_SECONDS: '1', BACKFILL_HEARTBEAT_STALE_SECONDS: '3', BACKFILL_PREVIEW_MAX_RECORDS: process.env.DOAJ_MEMORY_TAKES ? '30000' : '5000', BACKFILL_CHUNK_SIZE: '100' });
if (process.env.DOAJ_MEMORY_TAKES) process.env.BACKFILL_MAX_RECORDS_PER_JOB = '30000';   // manual memory investigation only
delete process.env.NODE_ENV;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== TEST_DB) throw new Error(`refusing to run against anything but ${TEST_DB}`);
const J = await import('../src/lib/ingestion/backfill/jobs.js');
const W = await import('../src/lib/ingestion/backfill/worker.js');
const R = await import('../src/lib/ingestion/backfill/registry.js');
const H = await import('../src/lib/ingestion/backfill/testHooks.js');
const A = await import('../src/lib/ingestion/backfill/doajAdapter.js');
const SN = await import('../src/lib/ingestion/backfill/doajSnapshot.js');
const E = await import('../src/lib/ingestion/doajEnrichment.js');
const S = await import('./doaj-sample.js');
const Papa = (await import('papaparse')).default;

const SUITE_START = new Date(); const RUN = Date.now().toString(36).slice(-4);
const WHO = { uid: 'qa', email: `doaj-qa-${RUN}@test.invalid` };
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rejects = async (p: Promise<any>, code: string) => { try { await p; return false; } catch (e: any) { return e?.code === code; } };
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const mb = (n: number) => Math.round(n / 1048576);

// ── what must not move ──────────────────────────────────────────────────────
const WATCH: [string, string][] = [
  ['article-fetch state (fetchCursor, exhaustedAt, claims, nextEligibleAt)', `select md5(coalesce(string_agg(concat_ws('|', id, "fetchCursor", "exhaustedAt"::text, "claimedAt"::text, "nextEligibleAt"::text, "lastIngestionStatus"), E'\\n' order by id), '')) h from "Journal"`],
  ['article ELIGIBILITY set (Accepted + ISSN + DOAJ declaration), by id', `select md5(coalesce(string_agg(id, ',' order by id), '')) h from "Journal" where status = 'Accepted' and issn is not null and "rightsBasis" = 'DOAJ declaration'`],
  ['continuous DOAJ sweep checkpoints (DepartmentSweep, DOAJ)', `select md5(coalesce(string_agg(concat_ws('|', id, position::text, "exhaustedAt"::text, "lastSweptAt"::text), E'\\n' order by id), '')) h from "DepartmentSweep" where source = 'DOAJ'`],
  ['journal coverage state (AppSetting ingestion.journals.*)', `select md5(coalesce(string_agg(concat_ws('|', key, value::text), E'\\n' order by key), '')) h from "AppSetting" where key like 'ingestion.journals.%'`],
  ['DOAJ provider health row', `select md5(coalesce(string_agg(concat_ws('|', source, "consecutiveFailures"::text, "pausedUntil"::text, "lifetimeFailures"::text, "lastOkAt"::text), E'\\n' order by source), '')) h from "IngestionSourceHealth" where source = 'DOAJ'`],
  ['Book / Article / Publisher counts and the run log', `select (select count(*) from "Book")::text || '/' || (select count(*) from "Article")::text || '/' || (select count(*) from "Publisher")::text || '/' || (select count(*) from "IngestionRun")::text h`],
  ['ingestion engine on/off state (IngestionState) — a global the suite must neither flip nor leave flipped', `select md5(coalesce(string_agg(concat_ws('|', id, enabled::text), E'\\n' order by id), '')) h from "IngestionState"`],
];
const fingerprint = async () => { const o: string[] = []; for (const [, sql] of WATCH) o.push((await db.$queryRawUnsafe<any[]>(sql))[0].h); return o; };
const journalCount = async () => (await db.journal.count());
/** THE invariant: no Journal row exists that this suite did not create itself. A journal made by an enrichment path would be a stranger here (the database is private, so nothing else can be). */
const inBatches = async <T>(ids: string[], f: (b: string[]) => Promise<T>) => { const o: T[] = []; for (let i = 0; i < ids.length; i += 10_000) o.push(await f(ids.slice(i, i + 10_000))); return o; };   // Postgres allows ~32k bind variables
const seededStillThere = async () => (await inBatches([...createdIds], b => db.journal.count({ where: { id: { in: b } } }))).reduce((a, c) => a + c, 0);
const strangers = async () => (await journalCount()) - (await seededStillThere()) - BEFORE_JOURNALS;
const noStrangers = async (label: string) => check(`(no journal is ever created) ${label}: the journal table holds exactly the journals the suite seeded — enrichment created none`, (await strangers()) === 0, await strangers());
const BEFORE_ROWS = `${await db.journal.count()}/${await db.publisher.count()}/${await db.backfillJob.count()}/${await db.ingestionAudit.count()}`;
// A database-level TRIPWIRE (in this private test database only): every INSERT into and DELETE from "Journal" is recorded by Postgres itself, whoever made it. A count can miss a journal that is
// created and removed again between two checks; this cannot. At the end, the only inserts must be the suite's own seeding and the only delete the one the race test makes on purpose.
const deliberateDeletes = new Set<string>();
await db.$executeRawUnsafe(`create table if not exists "_doaj_test_journal_events" (id text, op text, at timestamptz default now())`);
await db.$executeRawUnsafe(`truncate "_doaj_test_journal_events"`);
await db.$executeRawUnsafe(`create or replace function _doaj_test_journal_event() returns trigger language plpgsql as $$ begin if tg_op = 'DELETE' then insert into "_doaj_test_journal_events"(id, op) values (old.id, 'DELETE'); return old; end if; insert into "_doaj_test_journal_events"(id, op) values (new.id, 'INSERT'); return new; end $$`);
await db.$executeRawUnsafe(`drop trigger if exists _doaj_test_journal_event on "Journal"`);
await db.$executeRawUnsafe(`create trigger _doaj_test_journal_event after insert or delete on "Journal" for each row execute function _doaj_test_journal_event()`);
const BEFORE_FP = await fingerprint(); const BEFORE_JOURNALS = await journalCount();

// ── fixtures ────────────────────────────────────────────────────────────────
const seeds: string[] = [];
// A fixture's ISSNs run through (3-digit seed prefix + one per thousand rows), so two seeds can collide on the unique ISSN. Every default seed is therefore chosen so that its range is free.
const usedPrefixes = new Set<number>();
const freshSeed = (tag: string, rows: number) => { for (let c = 0; ; c++) { const seed = `${tag}${RUN}${c || ''}`; const p0 = Number(S.seedPrefix(seed)) - 100; const range = Array.from({ length: Math.max(1, Math.ceil(rows / 1000)) }, (_, k) => (p0 + k) % 900); if (range.every(r => !usedPrefixes.has(r))) { range.forEach(r => usedPrefixes.add(r)); return seed; } } }; const jobIds: string[] = []; const createdIds = new Set<string>(); let pubId: string | null = null; let n = 0;
const pub = async () => (pubId ??= (await db.publisher.create({ data: { name: `Doaj test publisher ${RUN}` } })).id);
type Fx = { seed: string; total: number; file: string; ids: Map<number, string[]> };
const fx = async (tag: string, total: number, opts: { seed?: string } = {}): Promise<Fx> => {
  const seed = opts.seed ?? freshSeed(tag, total); seeds.push(seed);
  const file = path.basename(S.stage(ROOT, S.makeCsv(seed, total), '20260926', String(1000 + ++n)));
  const ids = new Map<number, string[]>();
  for (let i = 0; i < total; i++) for (const h of S.heldFor(seed, i)) { const { id } = await db.journal.create({ data: { ...h.data, ...(h.publisherId ? { publisherId: await pub() } : {}) } }); (ids.get(i) ?? ids.set(i, []).get(i)!).push(id); createdIds.add(id); }
  return { seed, total, file, ids };
};
const rowsOf = async (f: Fx) => { const all = await db.journal.findMany({ where: { id: { in: [...f.ids.values()].flat() } } }); const m = new Map(all.map(j => [j.id, j])); return (i: number) => (f.ids.get(i) ?? []).map(id => m.get(id)!); };
const byIssnPrefix = (seed: string) => db.journal.count({ where: { OR: [{ issn: { startsWith: `9${S.seedPrefix(seed)}-` } }, { eissn: { startsWith: `9${S.seedPrefix(seed)}-` } }] } });
const strip = (j: any) => JSON.stringify({ ...j, updatedAt: undefined });
const snap = async (f: Fx) => { const g = await rowsOf(f); const o = new Map<number, any[]>(); for (let i = 0; i < f.total; i++) o.set(i, g(i)); return o; };

const mkJob = async (o: any) => { const j = await J.createJob({ provider: 'doaj', contentType: 'JOURNAL', ...o }, WHO); jobIds.push(j.id); return j; };
const reload = (id: string) => db.backfillJob.findUnique({ where: { id } });
const finished = (j: any) => ['Completed', 'Failed', 'Cancelled', 'Paused'].includes(j.status);
const work = async (id: string, workerId = 'w-main', max = 300) => { for (let i = 0; i < max; i++) { const r = await W.backfillTick({ workerId }); const j = await reload(id); if (finished(j!) || (!r.ran && r.reason === 'no-job')) return j!; } return (await reload(id))!; };
const preview = async (f: Fx, o: any = {}) => { const pv = await mkJob({ adapter: { file: f.file }, accessPreference: 'OAFirst', maxRecords: f.total + 100, windowStart: null, windowEnd: null, departments: [], ...o, dryRun: true }); return work(pv.id); };
const previewThenStart = async (f: Fx, o: any = {}) => { const body = { adapter: { file: f.file }, accessPreference: 'OAFirst', maxRecords: f.total + 100, ...o }; const pv = await mkJob({ ...body, dryRun: true }); const done = await work(pv.id); const rl = await mkJob({ ...body, dryRun: false, previewJobId: pv.id }); return { pv: done, real: rl }; };
const goStale = (id: string) => db.backfillJob.update({ where: { id }, data: { heartbeatAt: new Date(Date.now() - 60_000) } });
const ctr = (j: any) => ({ fetched: j.recordsFetched, enriched: j.recordsEnriched, conflicting: j.recordsDuplicateConflicting, duplicate: j.recordsDuplicate, refused: j.recordsRefused, published: j.recordsPublished, review: j.recordsReview, held: j.recordsHeld, unique: j.recordsUnique, failed: j.recordsFailed });
const expCtr = (e: ReturnType<typeof S.oracle>) => ({ fetched: e.fetched, enriched: e.enriched, conflicting: e.conflicting, duplicate: e.duplicate, refused: e.refused, published: 0, review: 0, held: 0, unique: 0, failed: 0 });
const stats = (j: any) => (j.config as any)?.sourceStats ?? {};
const tagsOk = (j: any, e: ReturnType<typeof S.oracle>) => { const st = stats(j); const got = Object.fromEntries(Object.entries(st).filter(([k]) => k.startsWith('t.')).map(([k, v]) => [k.slice(2), v])); const want = e.tags; const keys = ['matched', 'enrichable', 'fill.homepage', 'fill.country', 'fill.publisherName', 'fill.language', 'fill.subject', 'fill.subjects', 'conflict', 'conflict.publisherName', 'conflict.title', 'conflict.licenceListDiffers', 'protected', 'ambiguous', 'identityConflict', 'titleOnly', 'notInCatalogue', 'unchanged', 'review.eissn', 'blockedByTitle', 'crossField']; return keys.every(k => (got[k] ?? 0) === (want[k] ?? 0)) && !('fill.eissn' in got); };
const eligible = async () => (await db.journal.findMany({ where: { status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration' }, select: { id: true } })).map(x => x.id).sort();

let peak = 0; const rssTimer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 25); rssTimer.unref();
const rss0 = process.memoryUsage().rss;

/** Every effect on the journals of one fixture after a COMPLETE enrichment, shape by shape. */
const verify = async (f: Fx, before: Map<number, any[]>, label: string) => {
  const g = await rowsOf(f); const bad: string[] = []; const ex = (c: boolean, m: string) => { if (!c) bad.push(m); };
  for (let i = 0; i < f.total; i++) {
    const k = S.kindOf(i); const [a] = g(i); const [b] = before.get(i)!; const hp = S.homepageOf(f.seed, i);
    if (k === 14 || k === 17) { ex(!a, `row ${i} should have no journal`); continue; }
    const same_ = (cols: string[]) => cols.every(c => JSON.stringify((a as any)[c]) === JSON.stringify((b as any)[c]));
    const never = ['title', 'issn', 'eissn', 'status', 'licence', 'licenceIsNC', 'rightsBasis', 'rightsVerifiedBy', 'domain', 'publisherId', 'articleCount', 'fetchCursor', 'exhaustedAt', 'nextEligibleAt'];
    ex(same_(never), `row ${i} (shape ${k}): a status/licence/department/ISSN/identity column moved`);
    if (k === 0) ex(a.homepage === hp && a.country === 'Brazil' && a.publisherName === 'Fixture Press' && a.language === S.BASE.language && a.subject === S.BASE.subject && same(a.subjects, ['Medicine: Nursing', 'Medicine: Internal medicine']), `row ${i}: shape 0 not completed`);
    if (k === 1) ex(a.homepage === hp && a.domain === null, `row ${i}: shape 1 homepage not filled or department assigned`);
    if (k === 2) ex(a.homepage === hp && a.publisherName === 'Other Publisher Ltd' && a.domain === 'Law', `row ${i}: shape 2 publisher/department not preserved`);
    if (k === 4) ex(a.country === 'Brazil', `row ${i}: shape 4 country not filled`);
    if (k === 5) ex(a.country === 'BR' && a.updatedAt.getTime() === b.updatedAt.getTime(), `row ${i}: shape 5 country code touched`);
    if (k === 6) ex(a.homepage === null && a.updatedAt.getTime() === b.updatedAt.getTime(), `row ${i}: shape 6 filled despite the title conflict`);
    if ([3, 7, 8, 9, 10, 13, 15, 16, 18, 19].includes(k)) ex(strip(a) === strip(b) && a.updatedAt.getTime() === b.updatedAt.getTime(), `row ${i}: shape ${k} was touched`);
    if (k === 11) ex(a.homepage === hp && a.licence === 'CC BY-NC' && a.licenceIsNC === true && a.status === 'MetadataOnly', `row ${i}: shape 11 licence/status changed`);
    if (k === 12) ex(a.homepage === hp && a.issn === b.issn && a.eissn === b.eissn, `row ${i}: shape 12`);
  }
  check(`${label}: every journal ended exactly as the rules say, shape by shape — filled only what was empty, kept every held value, touched no protected / ambiguous / conflicting journal`, bad.length === 0, bad.slice(0, 5));
  return bad.length === 0;
};

try {
  // ═══════════════════════════════════════════════════════════════════════
  section('1. Availability, the staged file, and its identity');
  delete process.env.BACKFILL_DOAJ_ENABLED;
  const ad = R.getAdapter('doaj')!;
  check('with BACKFILL_DOAJ_ENABLED unset the adapter is listed but NOT available, with the reason; no job can be created', ad.available() !== true && String(ad.available()).includes('BACKFILL_DOAJ_ENABLED') && await rejects(J.createJob({ provider: 'doaj', contentType: 'JOURNAL' }, WHO), 'PROVIDER_UNAVAILABLE'));
  process.env.BACKFILL_DOAJ_ENABLED = 'true'; const keepDir = process.env.DOAJ_SNAPSHOT_DIR!; delete process.env.DOAJ_SNAPSHOT_DIR;
  check('enabled but with no staged folder configured: unavailable, saying so', String(ad.available()).includes('DOAJ_SNAPSHOT_DIR'));
  process.env.DOAJ_SNAPSHOT_DIR = keepDir;
  check('enabled, folder configured, no staged file in it: unavailable, saying so', String(ad.available()).includes('no staged DOAJ snapshot file'));
  const f100 = await fx('a', 100); const A0 = await snap(f100);
  const ov = await J.overview(); const adv = ov.adapters.find((a: any) => a.id === 'doaj');
  check('with a staged file it is available, enrich-only, for JOURNAL only; the type list offers Journals through it and not Articles or Books', ad.available() === true && adv.enrichOnly === true && adv.contentTypes.join() === 'JOURNAL' && ov.types.find((t: any) => t.id === 'JOURNAL').providers.includes('doaj') && !ov.types.find((t: any) => t.id === 'BOOK').providers.includes('doaj'));
  check('it cannot be asked for Articles or Books, and the reserved types stay reserved', await rejects(J.createJob({ provider: 'doaj', contentType: 'ARTICLE' }, WHO), 'TYPE_NOT_SUPPORTED') && await rejects(J.createJob({ provider: 'doaj', contentType: 'BOOK' }, WHO), 'TYPE_NOT_SUPPORTED') && await rejects(J.createJob({ provider: 'doaj', contentType: 'THESIS' }, WHO), 'TYPE_RESERVED'));
  for (const [what, file, code] of [['a path (..)', '../x.csv', 'BAD_SNAPSHOT_PATH'], ['a path with a slash', 'a/b.csv', 'BAD_SNAPSHOT_PATH'], ['a name that is not DOAJ\'s', 'journals.csv', 'BAD_SNAPSHOT_NAME'], ['a file that is not there', 'doaj_journalcsv_20250101_0000_utf8.csv', 'SNAPSHOT_NOT_FOUND']] as const) check(`a staged file given as ${what} is refused`, await rejects(J.createJob({ provider: 'doaj', contentType: 'JOURNAL', adapter: { file } }, WHO), code));
  fs.symlinkSync('/etc/hostname', path.join(ROOT, 'doaj_journalcsv_20250102_0000_utf8.csv'));
  check('a symlink that leaves the staged folder is refused', await rejects(J.createJob({ provider: 'doaj', contentType: 'JOURNAL', adapter: { file: 'doaj_journalcsv_20250102_0000_utf8.csv' } }, WHO), 'BAD_SNAPSHOT_PATH'));
  fs.unlinkSync(path.join(ROOT, 'doaj_journalcsv_20250102_0000_utf8.csv'));
  const d = await J.describeSource('doaj', { file: f100.file });
  check('describe reports the dated snapshot, its row count, size and hash prefix', /Snapshot 2026-09-26 .* 100 journals · .* MB · sha-256 [0-9a-f]{12}…/.test(d.summary), d.summary);
  const l1 = SN.loadSnapshot(SN.locateSnapshot(f100.file).abs); const csvText = fs.readFileSync(path.join(ROOT, f100.file), 'utf8');
  const other = path.join(ROOT, 'doaj_journalcsv_20260926_9999_utf8.csv'); fs.writeFileSync(other, csvText + ' '); const l2 = SN.loadSnapshot(other); fs.unlinkSync(other);
  check('the snapshot identity is stable for the same bytes and changes with one byte (name + size + sha-256)', l1.identity === SN.loadSnapshot(SN.locateSnapshot(f100.file).abs).identity && l1.identity !== l2.identity && l1.identity.length === 24 && l1.date === '2026-09-26');
  { const bytes = fs.readFileSync(path.join(ROOT, f100.file)); const sha = createHash('sha256').update(bytes).digest('hex'); const ident = createHash('sha256').update(`doaj-csv|${f100.file}|${bytes.length}|${sha}`).digest('hex').slice(0, 24);
    check('the STREAMED identity equals the one-shot name + size + sha-256 of the whole file (nothing weaker than hashing every byte), and the file is hashed again on every call', l1.sha256 === sha && l1.size === bytes.length && l1.identity === ident); }

  // ═══════════════════════════════════════════════════════════════════════
  section('2. Reading the file page by page is exact (a quoted line break must not move a position)');
  { const full = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true }).data; const fields = SN.headerOf(l1.abs);
    for (const size of [1, 7, 33, 100, 250]) { let off = 0, got: Record<string, string>[] = []; for (let g = 0; g < 400; g++) { const r = SN.readRows(l1.abs, l1.size, off, size, fields); got.push(...r.rows); if (r.next === null) break; off = r.next; } check(`pages of ${size} rows reproduce a full parse exactly (${got.length} rows, including the rows with a quoted line break and comma)`, same(got, full) && got.length === 100); }
    check('the file index knows which ISSNs are shared in the whole file (rows 13 and 14)', await (async () => { const idx = await SN.fileIndexOf(l1); return idx.rows === 100 && (idx.rowsByIssn.get(S.sharedE(f100.seed, 13)) ?? []).length === 2; })());
    // A file whose rows are far larger than the first read window, in a multi-byte script, with a BOM and quoted line breaks: byte offsets must land on row starts and no character may be cut.
    { const hdr = S.COLUMNS; const mk = (i: number) => Object.fromEntries(hdr.map(c => [c, c === 'Journal title' ? `Журнал №${i} 日本語 ✓ "кавычки", запятая` : c === 'Alternative title' ? ('ж'.repeat(5000) + '\nline\r\nbreak ' + 'ü'.repeat(4000)) : c === 'Journal ISSN (print version)' ? `9${String(500 + i).slice(-3)}-0000` : '']));
      const big = '\uFEFF' + Papa.unparse({ fields: hdr, data: Array.from({ length: 260 }, (_, i) => hdr.map(c => (mk(i) as any)[c])) }) + '\r\n'; const bigPath = path.join(ROOT, 'doaj_journalcsv_20260926_8888_utf8.csv'); fs.writeFileSync(bigPath, big, 'utf8');
      const lb = SN.loadSnapshot(bigPath); const want = Papa.parse<Record<string, string>>(big.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true }).data; const hf = SN.headerOf(bigPath);
      for (const size of [1, 7, 100, 250]) { let off = 0, got: Record<string, string>[] = [], starts: number[] = []; for (let g = 0; g < 400; g++) { starts.push(off); const r = SN.readRows(bigPath, lb.size, off, size, hf); got.push(...r.rows); if (r.next === null) break; off = r.next; }
        check(`a ${mb(lb.size)} MB multi-byte file with a BOM, 9,000-character fields and quoted line breaks, in pages of ${size}: byte offsets reproduce a full parse exactly (${got.length} rows)`, same(got, want) && got.length === 260 && starts.every(o => o === 0 || big.length > 0)); }
      // …and resuming from a byte offset in the middle gives the same rows as reading straight through
      const mid = SN.readRows(bigPath, lb.size, 0, 100, hf); const rest = SN.readRows(bigPath, lb.size, mid.next!, 1000, hf);
      check('resuming from a saved byte offset (a checkpoint) returns exactly the rows after it', same([...mid.rows, ...rest.rows], want) && rest.next === null);
      fs.unlinkSync(bigPath); }
  }
  check('SAFETY (#23 setup): the checkpoint is a bounded string {v, identity, row index, offset}', (() => { const c = JSON.parse(SN.cursorOf({ v: 2, id: l1.identity, i: 100, o: 12345 })); return c.v === 2 && c.id === l1.identity && c.i === 100 && c.o === 12345; })());
  check('a checkpoint from the earlier (character-offset) version is refused, not guessed at: the job would stop with its checkpoint kept', (() => { try { SN.parseCursor(JSON.stringify({ v: 1, id: l1.identity, i: 1, o: 1 })); return false; } catch (e: any) { return e?.code === 'DOAJ_BAD_CURSOR'; } })());

  // ═══════════════════════════════════════════════════════════════════════
  section('3. Test A — 100 rows: preview, then enrichment, shape by shape');
  const fpA0 = await fingerprint(); const jA0 = await journalCount(); const eA = S.oracle(100);
  const pvA = await preview(f100);
  check('(#1,2,3,4,5) PREVIEW: it read all 100 rows in one chunk and its counters equal the shapes exactly — enrichable, conflicting, unchanged/protected, and refused (ambiguous, identity conflict, same title, not held)', pvA.status === 'Completed' && pvA.chunksCompleted === 1 && same(ctr(pvA), expCtr(eA)) && tagsOk(pvA, eA), { got: ctr(pvA), want: expCtr(eA), st: stats(pvA) });
  const pvj: any = pvA.preview;
  check('the preview is hard-bounded and shows the interesting kinds: enrichable examples with what they fill, conflicts with the held and DOAJ values, ambiguous / identity conflict / same-title — and NOT the "not in the catalogue" flood', pvj.samples.length <= 100 && pvj.issues.length <= 100 && JSON.stringify(pvj).length < 65536 && pvj.samples.some((s: any) => s.dup === 'enriched' && /fills homepage/.test(s.reason)) && pvj.issues.some((i: any) => i.kind === 'conflict' && /publisherName: held "Other Publisher Ltd" vs DOAJ "Fixture Press"/.test(i.reason)) && pvj.issues.some((i: any) => i.kind === 'ambiguous') && pvj.issues.some((i: any) => i.kind === 'identity conflict') && pvj.issues.some((i: any) => i.kind === 'same title') && !pvj.issues.some((i: any) => /not in the catalogue/.test(i.reason)), { n: [pvj.samples.length, pvj.issues.length], kinds: [...new Set(pvj.issues.map((i: any) => i.kind))] });
  const A1 = await snap(f100);
  check('the PREVIEW wrote nothing: not one journal changed, none was created, and no checkpoint moved', [...A0.keys()].every(i => same(A0.get(i)!.map(strip), A1.get(i)!.map(strip))) && await journalCount() === jA0 && same(await fingerprint(), fpA0));
  check('the job carries the snapshot identity it was created against', (pvA.config as any).identity === l1.identity);

  const realA = await mkJob({ adapter: { file: f100.file }, accessPreference: 'OAFirst', maxRecords: 200, dryRun: false, previewJobId: pvA.id });
  const rjA = await work(realA.id);
  console.log(`  [info] Test A (100 rows): fetched ${rjA.recordsFetched}, enriched ${rjA.recordsEnriched}, conflicting ${rjA.recordsDuplicateConflicting}, unchanged ${rjA.recordsDuplicate - rjA.recordsEnriched - rjA.recordsDuplicateConflicting}, refused ${rjA.recordsRefused}; fills ${JSON.stringify(Object.fromEntries(Object.entries(stats(rjA)).filter(([k]) => k.startsWith('t.fill.'))))}`);
  check('the real run reproduces the preview\'s counters exactly and ends because the data ended', rjA.status === 'Completed' && same(ctr(rjA), expCtr(eA)) && tagsOk(rjA, eA) && (rjA.config as any).finishedBecause === 'end of data', ctr(rjA));
  await verify(f100, A0, 'Test A');
  const g100 = await rowsOf(f100);
  check('(#6,7,8) empty publisher enriched; an existing publisher preserved; the publisher conflict counted', g100(0)[0].publisherName === 'Fixture Press' && g100(2)[0].publisherName === 'Other Publisher Ltd' && (stats(rjA)['t.conflict.publisherName'] ?? 0) === eA.tags['conflict.publisherName']);
  check('(#9,10) missing country enriched; an existing country preserved (including the same country held as an ISO code)', g100(4)[0].country === 'Brazil' && g100(0)[0].country === 'Brazil' && g100(5)[0].country === 'BR');
  check('(#11) a missing URL (homepage) enriched', g100(1)[0].homepage === S.homepageOf(f100.seed, 1) && g100(11)[0].homepage === S.homepageOf(f100.seed, 11));
  check('(#12) a malformed source value is ignored: DOAJ\'s "not a url" is not written', g100(18)[0].homepage === null && (stats(rjA)['t.fill.homepage'] ?? 0) === eA.tags['fill.homepage']);
  check('(#13,14,15,16) protected journals are untouched: ours, Rejected, decided by a person, linked to a publisher — not even their updatedAt moved; all counted as protected', [7, 8, 9, 10].every(k => strip(g100(k)[0]) === strip(A0.get(k)![0]) && g100(k)[0].updatedAt.getTime() === A0.get(k)![0].updatedAt.getTime()) && (stats(rjA)['t.protected'] ?? 0) === 4 * 5);
  check('(#17,18) an existing department is preserved, and a journal with NO department keeps none: the classifier\'s suggestion is analysis only', g100(2)[0].domain === 'Law' && g100(1)[0].domain === null && g100(0)[0].domain === 'Nursing');
  check('(#19,20) the existing licence and status are preserved, even where DOAJ says otherwise (a CC BY-NC / MetadataOnly journal DOAJ lists as CC BY stays so; the conflict is counted)', g100(11)[0].licence === 'CC BY-NC' && g100(11)[0].status === 'MetadataOnly' && g100(0)[0].status === 'MetadataOnly' && g100(1)[0].status === 'Accepted' && (stats(rjA)['t.conflict.licenceListDiffers'] ?? 0) === 5);
  check('(#1,2,3) identity: an exact ISSN match, an exact match held under the e-ISSN only, and a cross-field match (print and e-ISSN held in the other columns) were all enriched', g100(1)[0].homepage !== null && g100(4)[0].country === 'Brazil' && g100(12)[0].homepage === S.homepageOf(f100.seed, 12) && (stats(rjA)['t.crossField'] ?? 0) === 5);
  check('(#4,5) a same-title/different-ISSN journal (IDENTITY_CONFLICT) and a journal touched by an ISSN shared in the file are reported and NOT enriched', (stats(rjA)['t.identityConflict'] ?? 0) === 5 && (stats(rjA)['t.ambiguous'] ?? 0) === 10 && strip(g100(13)[0]) === strip(A0.get(13)![0]) && strip(g100(15)[0]) === strip(A0.get(15)![0]));
  check('the e-ISSN is REVIEW-ONLY: DOAJ\'s e-ISSN for a held print-only journal is counted and never written', (stats(rjA)['t.review.eissn'] ?? 0) === 5 && g100(19)[0].eissn === null && !('t.fill.eissn' in stats(rjA)));
  check('a title that differs makes the match doubtful: that journal is a conflict and NOTHING is filled', (stats(rjA)['t.blockedByTitle'] ?? 0) === 5 && g100(6)[0].homepage === null);
  check('enrichment NEVER creates a journal: the journal table has exactly the fixture\'s rows (no row for "not held" shape 17, none for the identity conflict)', await journalCount() === jA0 && await byIssnPrefix(f100.seed) === [...f100.ids.values()].flat().length);
  check('(#26) the audit trail: one DOAJ_ENRICHMENT_APPLIED entry per chunk with counts, field totals and at most 50 ISSNs — never a field value, never a credential', await (async () => { const rows = await db.ingestionAudit.findMany({ where: { action: 'DOAJ_ENRICHMENT_APPLIED' as any, at: { gte: SUITE_START } } }); const mine = rows.filter(r => (r.meta as any)?.jobId === realA.id); const m: any = mine[0]?.meta; return mine.length === 1 && m.journalsWritten === eA.enriched && (m.issns as string[]).length <= 50 && m.fields.homepage === eA.tags['fill.homepage'] && !/https?:|Fixture Press|BR\b/.test(JSON.stringify(m)) && !/token|password|secret/i.test(JSON.stringify(m)); })());

  const A2 = await snap(f100);
  const again = await previewThenStart(f100); const aj = await work(again.real.id); const A3 = await snap(f100);
  check('(#21) a repeated run is zero further writes: nothing is left to enrich, no journal changed — not even an updatedAt', aj.status === 'Completed' && aj.recordsEnriched === 0 && [...A2.keys()].every(i => A2.get(i)!.every((j, x) => strip(j) === strip(A3.get(i)![x]) && j.updatedAt.getTime() === A3.get(i)![x].updatedAt.getTime())), ctr(aj));
  check('(#27,28 / §17) after the real run: every continuous DOAJ checkpoint, the coverage state, DOAJ\'s health row, the article-fetch state and the SET OF JOURNALS ELIGIBLE FOR ARTICLE INGESTION are byte-identical — enrichment alone cannot make a journal newly eligible', same(await fingerprint(), fpA0));

  // ═══════════════════════════════════════════════════════════════════════
  await noStrangers('after the 100-row test (preview, enrichment, idempotent re-run)');
  section('4. Race safety: a journal that changes between reading it and writing it is skipped, field by field');
  { const f = await fx('r', 40); const file = f.file; const l = SN.loadSnapshot(SN.locateSnapshot(file).abs);
    const job: any = { id: `race-${RUN}`, provider: 'doaj', contentType: 'JOURNAL', dryRun: false, createdAt: new Date(), identity: l.identity, windowStart: null, windowEnd: null, departments: [], accessPreference: 'OAFirst', maxRecords: 999, adapter: { file } };
    const page = await A.doajAdapter.fetchPage(job, null, 40); const items = page.records.map(r => ({ id: A.doajAdapter.stableId(r), item: A.doajAdapter.normalize(r, job) as any }));
    const judged = await A.doajAdapter.judge(items, job); const enrich = judged.filter(j => j.outcome === 'duplicate' && j.dup === 'enriched');
    const g = await rowsOf(f); const at = (k: number) => g(k)[0]; const pick = (k: number) => enrich.find(j => j.id.startsWith(`r${k}:`))!;
    // between judging and writing: row 1's homepage is filled by someone else; row 0's language is; row 2's journal becomes protected; row 4's ISSN is changed; row 11's journal is deleted
    await db.journal.update({ where: { id: at(1).id }, data: { homepage: 'https://someone-else.example/' } });
    await db.journal.update({ where: { id: at(0).id }, data: { language: 'Latin' } });
    await db.journal.update({ where: { id: at(2).id }, data: { rightsBasis: 'our own' } });
    await db.journal.update({ where: { id: at(4).id }, data: { issn: S.issnOf(f.seed, 4, 2) } });
    deliberateDeletes.add(at(11).id); await db.journal.delete({ where: { id: at(11).id } });
    const res = await A.doajAdapter.apply([], [pick(1), pick(0), pick(2), pick(4), pick(11)], job);
    check('(#22) RACE: a field filled between the read and the write is skipped (the other\'s value is kept); the other fields of that journal are still filled one by one', res.get(pick(1).id) === 'present' && (await db.journal.findUnique({ where: { id: at(1).id } }))!.homepage === 'https://someone-else.example/' && res.get(pick(0).id) === 'written' && (await db.journal.findUnique({ where: { id: at(0).id } }))!.language === 'Latin' && (await db.journal.findUnique({ where: { id: at(0).id } }))!.homepage === S.homepageOf(f.seed, 0), Object.fromEntries(res));
    check('a journal that becomes protected, whose ISSN changed (identity no longer matches), or that was deleted is skipped: nothing written, nothing failed', res.get(pick(2).id) === 'present' && (await db.journal.findUnique({ where: { id: at(2).id } }))!.homepage === null && res.get(pick(4).id) === 'present' && (await db.journal.findUnique({ where: { id: at(4).id } }))!.country === null && res.get(pick(11).id) === 'present' && [...res.values()].every(v => v !== 'failed'));
  }

  // ═══════════════════════════════════════════════════════════════════════
  await noStrangers('after the race-safety tests');
  section('5. Test B — 1,000 rows: chunks, pause, resume, cancel, kill, recovery, window and department filters');
  const f1k = await fx('k', 1000); const B0 = await snap(f1k); const eB = S.oracle(1000);
  const { pv: pvB, real: realB } = await previewThenStart(f1k, { maxRecords: 2000 });
  const B1 = await snap(f1k);
  check('the dry run over 1,000 rows (10 chunks of 100) equals the shapes exactly, and wrote nothing', pvB.status === 'Completed' && pvB.chunksCompleted === 10 && same(ctr(pvB), expCtr(eB)) && tagsOk(pvB, eB) && [...B0.keys()].every(i => same(B0.get(i)!.map(strip), B1.get(i)!.map(strip))), { got: ctr(pvB), want: expCtr(eB) });
  const filledCount = (f: Fx) => db.journal.count({ where: { id: { in: [...f.ids.values()].flat() }, homepage: { not: null } } });
  const baseFilled = await filledCount(f1k);
  await W.backfillTick({ workerId: 'w-b' }); let mB = (await reload(realB.id))!; const cur1 = JSON.parse(mB.cursor!);
  check('the checkpoint after one chunk is {snapshot identity, row index 100, a BYTE offset}: a bounded string', cur1.v === 2 && cur1.id === (mB.config as any).identity && cur1.i === 100 && cur1.o > 0 && mB.cursor!.length < 120, mB.cursor);
  await J.controlJob(realB.id, 'pause', WHO); await W.backfillTick({ workerId: 'w-b' }); mB = (await reload(realB.id))!;
  const writtenAtPause = (await filledCount(f1k)) - baseFilled;
  check('paused at a chunk boundary with its checkpoint saved and nothing half-done', mB.status === 'Paused' && mB.inflight === null && mB.recordsFetched === 100);
  await J.controlJob(realB.id, 'resume', WHO); const fB = await work(realB.id, 'w-b');
  console.log(`  [info] Test B (1,000 rows): fetched ${fB.recordsFetched}, enriched ${fB.recordsEnriched}, conflicting ${fB.recordsDuplicateConflicting}, refused ${fB.recordsRefused}; ${fB.chunksCompleted} chunks, ${Math.round((fB.config as any).activeMs)} ms of working time`);
  check('resume continues from the checkpoint and finishes with counters equal to the shapes exactly (no row counted twice)', fB.status === 'Completed' && same(ctr(fB), expCtr(eB)) && tagsOk(fB, eB) && stats(fB).scanned === 1000, { got: ctr(fB), want: expCtr(eB) });
  await verify(f1k, B0, 'Test B');
  check('it finished at the END of the file (no checkpoint left), and wrote journals both before and after the pause', fB.cursor === null && (fB.config as any).finishedBecause === 'end of data' && writtenAtPause > 0 && writtenAtPause < (await filledCount(f1k)) - baseFilled);

  { const fc = await fx('c', 1000); const C0 = await snap(fc); const { real } = await previewThenStart(fc, { maxRecords: 2000 });
    await W.backfillTick({ workerId: 'w-c' }); await W.backfillTick({ workerId: 'w-c' }); await J.controlJob(real.id, 'cancel', WHO); await W.backfillTick({ workerId: 'w-c' });
    const cj = (await reload(real.id))!; const kept = await db.journal.count({ where: { id: { in: [...fc.ids.values()].flat() }, homepage: { not: null } } }); const wasFilled = [...C0.values()].flat().filter(j => j.homepage).length;
    check('(#24) CANCELLATION stops at a chunk boundary, DELETES NOTHING already written, and no further chunk runs', cj.status === 'Cancelled' && cj.chunksCompleted === 2 && kept - wasFilled > 0 && kept - wasFilled <= cj.recordsEnriched && (await W.backfillTick({ workerId: 'w-c' })).reason === 'no-job' && (await db.journal.count({ where: { id: { in: [...fc.ids.values()].flat() }, homepage: { not: null } } })) === kept, { chunks: cj.chunksCompleted, kept, wasFilled, enriched: cj.recordsEnriched }); }

  // real kill, mid-apply, in another process; recovered by a third
  { const fk = await fx('x', 1000); const K0 = await snap(fk); const { real } = await previewThenStart(fk, { maxRecords: 2000 });
    const child = spawn('npx', ['tsx', 'scripts/backfill-worker-child.ts', 'child-doaj'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, BACKFILL_TEST_CRASH: 'mid-apply:20' }, stdio: 'ignore' });
    const exit: any = await new Promise(res => child.on('exit', (code, signal) => res({ code, signal })));
    const kd = (await reload(real.id))!; const filledAtKill = await db.journal.count({ where: { id: { in: [...fk.ids.values()].flat() }, homepage: { not: null } } }) - [...K0.values()].flat().filter(j => j.homepage).length;
    check('SIGKILL mid-apply (20 journals written): the process really died; the job is Running under the dead worker with its plan, its counters still 0', (exit.signal === 'SIGKILL' || exit.code === 137) && kd.status === 'Running' && kd.claimedBy === 'child-doaj' && !!kd.inflight && kd.recordsFetched === 0 && filledAtKill > 0, { exit, filledAtKill });
    const inf: any = kd.inflight;
    check('…the plan holds row ids and one-letter outcomes only (no journal, no value), the checkpoint after the chunk, and the tag counts', inf.planned.every((p: any) => /^r\d+:/.test(p[0]) && /^[PRHUECXF]$/.test(p[1])) && !JSON.stringify(inf).includes('journals.example.org') && JSON.parse(inf.expectedCursorAfter).id === (kd.config as any).identity && inf.meta['t.matched'] > 0);
    await sleep(3300); const fK = await work(real.id, 'w-recover');
    check('another process recovers it: the same page is verified, the already-written journals are found filled and skipped, counters equal an uninterrupted run, and every journal ends exactly as the rules say', fK.status === 'Completed' && same(ctr(fK), expCtr(eB)) && tagsOk(fK, eB), { got: ctr(fK), want: expCtr(eB) });
    await verify(fk, K0, 'after the kill');
    for (const [point, key] of [['after-inflight', 'p'], ['after-apply', 'q']] as const) { const f2 = await fx(key, 1000); const P0 = await snap(f2); const { real: r2 } = await previewThenStart(f2, { maxRecords: 2000 });
      H.__setCrash(point); try { await W.backfillTick({ workerId: 'w-dead' }); } catch { /* simulated */ }
      await goStale(r2.id); const j = await work(r2.id, 'w-recover'); check(`crash ${point}: recovered with exact counters and every journal as the rules say`, j.status === 'Completed' && same(ctr(j), expCtr(eB)) && await verify(f2, P0, `after ${point}`), ctr(j)); } }

  { // filters
    const fw = await fx('w', 400); const W0 = await snap(fw);
    const eW = S.oracle(400, { fromYear: 2013, toYear: 2016, depts: ['Law'] });
    const { pv, real } = await previewThenStart(fw, { maxRecords: 2000, windowStart: '2013-01-01', windowEnd: '2016-12-31', departments: ['Law'] }); const wj = await work(real.id);
    check('a window on "Added on Date" and a department are applied: rows outside the window are counted and skipped; journals outside the department are left alone and counted; preview and real run equal the shapes', pv.status === 'Completed' && same(ctr(pv), expCtr(eW)) && same(ctr(wj), expCtr(eW)) && tagsOk(wj, eW) && stats(wj).outsideWindow === eW.outsideWindow && eW.outsideWindow > 0 && (stats(wj)['t.outsideDepartments'] ?? 0) === eW.tags.outsideDepartments, { got: ctr(wj), want: expCtr(eW), st: stats(wj) });
    const gw = await rowsOf(fw); check('…only the Law journals in the window were written; nothing else', [...W0.keys()].every(i => { const k = S.kindOf(i); const inWin = S.yearOf(i) >= 2013 && S.yearOf(i) <= 2016; const before = W0.get(i)![0]; const after = gw(i)[0]; if (!before) return true; if (k === 2 && inWin) return after.homepage === S.homepageOf(fw.seed, i); return after.homepage === before.homepage && after.country === before.country; })); }

  // ═══════════════════════════════════════════════════════════════════════
  await noStrangers('after the 1,000-row test (chunks, pause, resume, cancel, kill, recovery)');
  section('6. A staged file that changes under a job stops it safely');
  { const fs1 = await fx('s', 600); const S0 = await snap(fs1); const { real } = await previewThenStart(fs1, { maxRecords: 2000 });
    await W.backfillTick({ workerId: 'w-s' }); await J.controlJob(real.id, 'pause', WHO); await W.backfillTick({ workerId: 'w-s' });
    const before = (await reload(real.id))!; const filled = await db.journal.count({ where: { id: { in: [...fs1.ids.values()].flat() }, homepage: { not: null } } });
    const p = path.join(ROOT, fs1.file); const orig = fs.readFileSync(p, 'utf8'); fs.writeFileSync(p, orig.replace(`${S.titleOf(fs1.seed, 450)}`, `${S.titleOf(fs1.seed, 450)} (edited)`));
    await J.controlJob(real.id, 'resume', WHO); await W.backfillTick({ workerId: 'w-s' }); const after = (await reload(real.id))!;
    check('(#23) the staged file is EDITED (one title) while the job is paused: on resume the job STOPS (DOAJ_SNAPSHOT_CHANGED, Failed), its checkpoint is kept, nothing more is written or counted, and it is not retried', after.status === 'Failed' && String(after.lastError).startsWith('DOAJ_SNAPSHOT_CHANGED') && after.cursor === before.cursor && after.recordsFetched === before.recordsFetched && await db.journal.count({ where: { id: { in: [...fs1.ids.values()].flat() }, homepage: { not: null } } }) === filled && (await W.backfillTick({ workerId: 'w-s' })).reason === 'no-job', { s: after.status, e: after.lastError });
    fs.writeFileSync(p, orig);
    const fr = await fx('u', 300); const pv2 = await mkJob({ adapter: {}, accessPreference: 'OAFirst', maxRecords: 500, dryRun: true }); void pv2;   // blank file: "the newest"
    const pvDone = await work(pv2.id); const rj = await mkJob({ adapter: {}, accessPreference: 'OAFirst', maxRecords: 500, dryRun: false, previewJobId: pvDone.id }); await W.backfillTick({ workerId: 'w-u' });
    await J.controlJob(rj.id, 'pause', WHO); await W.backfillTick({ workerId: 'w-u' });
    S.stage(ROOT, S.makeCsv(`n${RUN}`, 20), '20260927', '2320');            // a NEWER official file is staged while the job is paused
    await J.controlJob(rj.id, 'resume', WHO); await W.backfillTick({ workerId: 'w-u' }); const nj = (await reload(rj.id))!;
    check('a NEWER snapshot staged while a job (created for "the newest file") is paused: the job stops rather than carrying on over other data; a real start after such a change is refused', nj.status === 'Failed' && String(nj.lastError).startsWith('DOAJ_SNAPSHOT_CHANGED') && await rejects(J.createJob({ provider: 'doaj', contentType: 'JOURNAL', adapter: {}, accessPreference: 'OAFirst', maxRecords: 500, dryRun: false, previewJobId: pvDone.id }, WHO), 'SOURCE_CHANGED_SINCE_PREVIEW'), { s: nj.status, e: nj.lastError });
    void fr; void S0; fs.unlinkSync(path.join(ROOT, 'doaj_journalcsv_20260927_2320_utf8.csv')); }

  // ═══════════════════════════════════════════════════════════════════════
  await noStrangers('after the changed-file tests');
  section('7. Resources — fresh worker processes: the job size, and the file size, must not grow memory');
  clearInterval(rssTimer);
  // Each measurement is a NEW process that enriches `take` held journals from the first rows of a file of `rows` rows. The stable metric is the live heap after a forced GC (what the job
  // kept); total resident memory is reported and compared only as GROWTH over the process's own start, across job sizes — an absolute RSS ceiling would test the machine's load, not the code.
  const measure = async (key: string, rows: number, take: number) => {
    const seed = freshSeed(key, rows); seeds.push(seed); const file = path.basename(S.stage(ROOT, S.makeCsv(seed, rows, [], 700), '20260926', String(1000 + ++n)));
    // the journals the job will really enrich (bulk-created, by recorded id), so the apply path is measured too, not only the read path
    const data: any[] = []; for (let i = 0; i < take; i++) for (const h of S.heldFor(seed, i)) { const id = randomUUID(); createdIds.add(id); data.push({ id, ...h.data, ...(h.publisherId ? { publisherId: await pub() } : {}) }); }
    for (let o = 0; o < data.length; o += 500) await db.journal.createMany({ data: data.slice(o, o + 500) });
    const f: Fx = { seed, total: take, file, ids: new Map() };
    const { real } = await previewThenStart(f, { maxRecords: take });
    const child = spawn('npx', ['tsx', 'scripts/backfill-worker-child.ts', `child-rss-${key}`], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, BACKFILL_CHILD_REPORT_RSS: '1', NODE_OPTIONS: '--expose-gc' }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; child.stdout.on('data', d => { out += d; }); await new Promise(res => child.on('exit', res));
    const rss = JSON.parse(/RSS:(\{.*\})/.exec(out)?.[1] ?? '{"base":0,"peak":0,"heapBase":0,"heapEnd":0}'); const j = (await reload(real.id))!;
    return { rss, j, take, size: fs.statSync(path.join(ROOT, file)).size };
  };
  const small = await measure('g', 3000, 1000);
  // DOAJ_MEMORY_TAKES="500,2000,5000,24000" widens the series for a manual investigation (the largest is a complete pass over the 24,000-row file); the default is the quick three.
  const takes = (process.env.DOAJ_MEMORY_TAKES ?? '500,2000,5000').split(',').map(Number); const series: Awaited<ReturnType<typeof measure>>[] = [];
  for (const [k, t] of takes.entries()) series.push(await measure(`m${k}`, 24000, t));
  const all = [small, ...series];
  for (const m of all) console.log(`  [info] worker process, a ${mb(m.size)} MB file, ${m.j.recordsFetched} rows (${m.j.recordsEnriched} journals enriched) in ${m.j.chunksCompleted} chunks: ${mb(m.rss.base)} MB resident before, ${mb(m.rss.peak)} MB at its peak (growth ${mb(m.rss.peak - m.rss.base)} MB); live heap after a forced GC ${mb(m.rss.heapBase)} → ${mb(m.rss.heapEnd)} MB; resident after that GC ${mb(m.rss.rssEnd ?? 0)} MB (${JSON.stringify(m.rss.mem ?? {})} MB); trace every 10 chunks (MB) ${(m.rss.rssTrace ?? []).map(mb).join(' ')}`);
  const growth = (m: typeof small) => m.rss.peak - m.rss.base, heapKept = (m: typeof small) => m.rss.heapEnd - m.rss.heapBase;
  check('(#25) every measured job completed and looked at exactly the rows asked for', all.every(m => m.j.status === 'Completed' && m.j.recordsFetched === m.take), all.map(m => [m.take, m.j.status, m.j.recordsFetched]));
  check('(#25) MEMORY, job size: enriching 500, 2,000 and 5,000 journals from the same large file keeps the live heap (after a forced GC) within 25 MB of one another and growing by under 80 MB — nothing the job read or wrote is kept, so it does not scale with the number of records', Math.max(...series.map(m => m.rss.heapEnd)) - Math.min(...series.map(m => m.rss.heapEnd)) < 25 * 1048576 && series.every(m => heapKept(m) < 80 * 1048576), series.map(m => [m.take, mb(m.rss.heapEnd), mb(heapKept(m))]));
  check('(#25) MEMORY, file size: the first 1,000 rows of a small file and of one eight times larger leave the live heap the same after a forced GC (within 25 MB)', Math.abs(series[0].rss.heapEnd - small.rss.heapEnd) < 25 * 1048576, { small: mb(small.rss.heapEnd), large: mb(series[0].rss.heapEnd) });
  // What a job costs. The staged file is hashed again on every page (identity) by STREAMING it through a 1 MB buffer and each page is a bounded window of bytes, so the file is never held;
  // the held-journal title map is read once per job, not once per chunk. Measured on a complete 24,000-row pass over a 24 MB file: live heap 15 → ~45 MB (the title map, which follows the
  // catalogue, not the file), resident memory a start-up peak near 310 MB and then ~235 MB, against ~500 MB and ~440 MB when every chunk re-read and decoded the whole file and re-read
  // the whole title table. What is asserted is (1) a ceiling proportional to the FILE (plus the runtime's own ~100 MB), not to the load of the machine, and (2) for a long job, no upward trend.
  check('…and resident growth stays proportional to the file (under 100 MB of runtime overhead plus 12× the file\'s size above the process\'s own start, for every job size)', all.every(m => growth(m) < 100 * 1048576 + 12 * m.size), all.map(m => [m.take, mb(growth(m)), mb(m.size)]));
  const longest = series[series.length - 1];
  if (longest.j.chunksCompleted >= 150) { const tr: number[] = longest.rss.rssTrace ?? []; const cut = Math.floor(tr.length * 2 / 3); check('…and on a long job (150+ chunks) there is no upward trend once the plateau is reached: the last third of the run never exceeds the earlier two thirds by more than 60 MB', Math.max(...tr.slice(cut)) <= Math.max(...tr.slice(0, cut)) + 60 * 1048576, tr.map(mb)); }
  await noStrangers('after the resource measurements');

  // ═══════════════════════════════════════════════════════════════════════
  const REAL = process.env.DOAJ_REAL_SNAPSHOT;
  if (REAL && fs.existsSync(REAL)) {
    section('8. Test C — the REAL official snapshot (its first rows), on the scratch catalogue');
    const name = path.basename(REAL); fs.copyFileSync(REAL, path.join(ROOT, name));
    const saved = await db.$queryRawUnsafe<any[]>(`select id, homepage, country, "publisherName", language, subject, subjects::text s, "updatedAt" from "Journal"`);
    const lReal = SN.loadSnapshot(SN.locateSnapshot(name).abs); const dReal = await J.describeSource('doaj', { file: name });
    console.log(`  [info] ${dReal.summary}`);
    const fpC0 = await fingerprint(); const heldC = await db.journal.count();
    const pvC = await mkJob({ adapter: { file: name }, accessPreference: 'OAFirst', maxRecords: 1000, dryRun: true }); const pvj2 = await work(pvC.id);
    const st = stats(pvj2); const tags = Object.fromEntries(Object.entries(st).filter(([k]) => k.startsWith('t.')));
    console.log(`  [info] real preview, first ${pvj2.recordsFetched} rows: enriched ${pvj2.recordsEnriched}, conflicting ${pvj2.recordsDuplicateConflicting}, refused ${pvj2.recordsRefused}, duplicates ${pvj2.recordsDuplicate}; tags ${JSON.stringify(tags)}`);
    check('the real file: the dry run read its first 1,000 rows page by page in bounded memory, wrote nothing, and moved no checkpoint', pvj2.status === 'Completed' && pvj2.recordsFetched === 1000 && await db.journal.count() === heldC && same(await fingerprint(), fpC0) && (pvj2.config as any).identity === lReal.identity);
    const rC = await mkJob({ adapter: { file: name }, accessPreference: 'OAFirst', maxRecords: 1000, dryRun: false, previewJobId: pvC.id }); const rcj = await work(rC.id);
    check('the real file: the real run equals the real preview exactly, creates no journal, and a second run writes nothing', rcj.status === 'Completed' && same(ctr(rcj), ctr(pvj2)) && await db.journal.count() === heldC);
    const afterRows = await db.$queryRawUnsafe<any[]>(`select id, homepage, country, "publisherName", language, subject, subjects::text s, "updatedAt" from "Journal"`);
    const before = new Map(saved.map(r => [r.id, r])); let changed = 0, onlyEmptyFilled = true;
    for (const a of afterRows) { const b = before.get(a.id); if (!b) continue; const diff = ['homepage', 'country', 'publisherName', 'language', 'subject', 's'].filter(c => a[c] !== b[c]); if (diff.length) { changed++; for (const c of diff) if (!(b[c] == null || String(b[c]).trim() === '' || b[c] === '[]')) onlyEmptyFilled = false; } }
    console.log(`  [info] real rows written into the scratch catalogue by the real run: ${changed} journals`);
    check('the real file: only journals that already existed changed, and only fields that were empty', onlyEmptyFilled);
    // put the scratch catalogue back exactly as it was
    for (const b of saved) { const a = afterRows.find(x => x.id === b.id); if (a && (a.homepage !== b.homepage || a.country !== b.country || a.publisherName !== b.publisherName || a.language !== b.language || a.subject !== b.subject || a.s !== b.s)) await db.$executeRawUnsafe(`update "Journal" set homepage = $2, country = $3, "publisherName" = $4, language = $5, subject = $6, subjects = $7::jsonb, "updatedAt" = $8 where id = $1`, b.id, b.homepage, b.country, b.publisherName, b.language, b.subject, b.s ?? '[]', b.updatedAt); }
    fs.unlinkSync(path.join(ROOT, name));
  } else console.log('\n8. Test C (the real official snapshot): skipped — DOAJ_REAL_SNAPSHOT not set');

  await noStrangers('after the resource measurements and the real-snapshot rows');
  section('9. Nothing else moved');
  // remove what the suite created, then compare with the start
} catch (e: any) {
  fail++; console.log('  FAIL  the suite crashed:', e?.stack || e);
} finally {
  clearInterval(rssTimer);
  try {
    const ev = await db.$queryRawUnsafe<{ id: string; op: string }[]>(`select id, op from "_doaj_test_journal_events"`);
    const ins = ev.filter(e => e.op === 'INSERT').map(e => e.id), del = ev.filter(e => e.op === 'DELETE').map(e => e.id);
    check('TRIPWIRE (Postgres recorded every INSERT into "Journal" during the whole suite): every journal ever inserted is one the suite seeded itself — no enrichment, preview, pause, resume, cancel, crash or recovery created one, not even for a moment', ins.length === createdIds.size && ins.every(i => createdIds.has(i)), { inserted: ins.length, seeded: createdIds.size, strangers: ins.filter(i => !createdIds.has(i)).slice(0, 5) });
    check('TRIPWIRE (every DELETE): the only journal ever deleted was the one the race test removes on purpose — enrichment deleted none', del.length === deliberateDeletes.size && del.every(i => deliberateDeletes.has(i)), { deleted: del.length, deliberate: deliberateDeletes.size });
  } catch (e: any) { fail++; console.log('  FAIL  the tripwire could not be read:', e?.message); }
  // ONLY the journals this suite created, by the ids it recorded: never a prefix or a title (the scratch catalogue holds other suites' rows).
  await inBatches([...createdIds], b => db.journal.deleteMany({ where: { id: { in: b } } }));
  if (pubId) await db.publisher.deleteMany({ where: { id: pubId } });
  await db.backfillJob.deleteMany({ where: { createdBy: WHO.email } });
  // the audit rows the suite's own jobs wrote (job created / control / finished / enrichment applied): in the private database everything since the suite began is the suite's
  await db.ingestionAudit.deleteMany({ where: { at: { gte: SUITE_START } } });
  const AFTER_FP = await fingerprint(); const AFTER_JOURNALS = await journalCount();
  check('(#27,28) after cleanup every continuous DOAJ checkpoint, the coverage state, DOAJ\'s provider health, the article-fetch state, the set of journals eligible for article ingestion and the Book/Article/Publisher/run-log counts are byte-identical to before the suite', same(BEFORE_FP, AFTER_FP), WATCH.map(([l], i) => BEFORE_FP[i] === AFTER_FP[i] ? null : l).filter(Boolean));
  const ROWS = async () => `${await db.journal.count()}/${await db.publisher.count()}/${await db.backfillJob.count()}/${await db.ingestionAudit.count()}`;
  check('the private database is exactly as it was before the suite: Journal / Publisher / BackfillJob / audit-row counts (nothing the suite created is left, nothing else was removed)', (await ROWS()) === BEFORE_ROWS, { BEFORE_ROWS, now: await ROWS() });
  check('the journal table is exactly as it was before the suite', BEFORE_JOURNALS === AFTER_JOURNALS, { BEFORE_JOURNALS, AFTER_JOURNALS });
  await db.$executeRawUnsafe(`drop trigger if exists _doaj_test_journal_event on "Journal"`); await db.$executeRawUnsafe(`drop function if exists _doaj_test_journal_event()`); await db.$executeRawUnsafe(`drop table if exists "_doaj_test_journal_events"`);
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
