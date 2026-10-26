/**
 * Historical backfill, Phase 2A: the generic framework, proved with a fixture provider. No real source exists and none is asked.
 *
 *   npx tsx scripts/test-backfill.ts
 *
 * Throwaway database `stm_ingestion_test` only (refuses anything else). The fixture writes real Article rows through the real judge and writer, so the duplicate,
 * rights and idempotency results are about the real catalogue. Everything this suite creates is removed at the end; the catalogue row counts and a fingerprint of every
 * continuous-engine checkpoint are compared before and after.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
for (const k of Object.keys(process.env)) if (k.startsWith('BACKFILL_') || k === 'INGESTION_BACKFILL_ENABLED') delete process.env[k];
Object.assign(process.env, { INGESTION_BACKFILL_ENABLED: 'true', BACKFILL_FIXTURE: '1', BACKFILL_MIN_GAP_SECONDS: '0', BACKFILL_HEARTBEAT_SECONDS: '1', BACKFILL_HEARTBEAT_STALE_SECONDS: '3', INGESTION_MULTI_SOURCE_ENRICHMENT: '1' });
delete process.env.NODE_ENV;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const T = await import('../src/lib/ingestion/backfill/types.js');
const C = await import('../src/lib/ingestion/backfill/config.js');
const J = await import('../src/lib/ingestion/backfill/jobs.js');
const W = await import('../src/lib/ingestion/backfill/worker.js');
const K = await import('../src/lib/ingestion/backfill/chunk.js');
const P = await import('../src/lib/ingestion/backfill/preview.js');
const F = await import('../src/lib/ingestion/backfill/fixtureAdapter.js');
const R = await import('../src/lib/ingestion/backfill/registry.js');
const H = await import('../src/lib/ingestion/backfill/testHooks.js');
const { tryLockProvider, unlockProvider, providerHolder, __resetProviderLocks } = await import('../src/lib/ingestion/providerLocks.js');

const RUN = Date.now().toString(36);
const WHO = { uid: 'qa', email: `backfill-qa-${RUN}@test.invalid` };
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rejects = async (p: Promise<any>, code: string) => { try { await p; return false; } catch (e: any) { return e?.code === code; } };

// ── what the catalogue and the continuous engine look like, so "nothing else moved" is a measurement ──────────────────────────────────────
const catalogue = async () => (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Article")::int articles, (select count(*) from "Journal")::int journals, (select count(*) from "Book")::int books, (select count(*) from "Publisher")::int publishers, (select count(*) from "IngestionRun")::int runs`))[0];
const checkpoints = async () => (await db.$queryRawUnsafe<any[]>(`select
  md5(coalesce((select string_agg(provider || coalesce(cursor, '') || coalesce("lastSuccessfulSyncAt"::text, '') || coalesce("harvestStartedAt"::text, ''), '|' order by provider) from "BookHarvestCheckpoint"), '')) harvest,
  md5(coalesce((select string_agg(id || position::text || coalesce("exhaustedAt"::text, '') || coalesce("lastSweptAt"::text, ''), '|' order by id) from "DepartmentSweep"), '')) sweeps,
  md5(coalesce((select string_agg(id || coalesce("fetchCursor", '') || coalesce("nextEligibleAt"::text, '') || coalesce("lastIngestedAt"::text, ''), '|' order by id) from "Journal"), '')) journals,
  md5(coalesce((select string_agg(key || value::text, '|' order by key) from "AppSetting" where key like 'ingestion.%'), '')) settings,
  md5(coalesce((select string_agg(source || "consecutiveFailures"::text || coalesce("pausedUntil"::text, '') || "lifetimeFailures"::text, '|' order by source) from "IngestionSourceHealth"), '')) health`))[0];
const BEFORE_CAT = await catalogue(), BEFORE_CP = await checkpoints();
const journalsBefore = await db.journal.count();

// ── the fixture's shape (the oracle: written from the documented shape, not from the adapter) ────────────────────────────────────────
type Exp = { fetched: number; normalized: number; published: number; review: number; refused: number; failed: number; duplicate: number; enriched: number; conflicting: number; unique: number };
const dupKind = (i: number) => (i % 30 === 3 ? 'enriched' : i % 30 === 15 ? 'conflicting' : i % 30 === 9 ? 'unchanged' : null);
const oracle = (total: number, pref: 'OAFirst' | 'MetadataOnlyAllowed', seeded = true): Exp => {
  const e: Exp = { fetched: total, normalized: 0, published: 0, review: 0, refused: 0, failed: 0, duplicate: 0, enriched: 0, conflicting: 0, unique: 0 };
  for (let i = 0; i < total; i++) {
    const k = i % 20;
    if (k === 0) e.refused++;
    else if (k === 1) e.review++;
    else if (k === 2) e.failed++;
    else if (seeded && dupKind(i)) { e.duplicate++; if (dupKind(i) === 'enriched') e.enriched++; if (dupKind(i) === 'conflicting') e.conflicting++; }
    else if (pref === 'OAFirst' && i % 4 === 0 && i % 30 !== 15) e.review++;
    else e.published++;
  }
  e.normalized = total - e.failed; e.unique = e.published + e.review;
  return e;
};
const rowsOf = (j: any) => ({ fetched: j.recordsFetched, normalized: j.recordsNormalized, published: j.recordsPublished, review: j.recordsReview, refused: j.recordsRefused, failed: j.recordsFailed, duplicate: j.recordsDuplicate, enriched: j.recordsEnriched, conflicting: j.recordsDuplicateConflicting, unique: j.recordsUnique });
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

const seedIds: string[] = [];
/** Records already in the catalogue before the job, in the three kinds of duplicate (the same shape for every seed). */
const seedHeld = async (seed: string, total: number) => {
  for (let i = 0; i < total; i++) {
    const k = dupKind(i), c = i % 20; if (!k || c < 3) continue;
    const doi = F.fixtureDoi(seed, i);
    const a = await db.article.create({ data: { title: `Held ${seed} ${i}`, doi, fingerprint: `doi:${doi}`, status: 'Published', source: 'BackfillTest', ownershipSource: 'Ingested', licence: 'CC BY', volume: k === 'unchanged' ? '7' : null, authors: `Author ${i}`, accessType: 'OpenAccess', accessStatus: 'LinkOnly' } });
    seedIds.push(a.id);
  }
};
const fixtureRows = (seed: string) => db.article.findMany({ where: { source: 'BackfillFixture', doi: { startsWith: `10.9999/bf.${seed}.` } } });
const jobIds: string[] = [];
const mkJob = async (o: any) => { const j = await J.createJob({ provider: 'fixture', contentType: 'ARTICLE', ...o }, WHO); jobIds.push(j.id); return j; };
const finished = (j: any) => ['Completed', 'Failed', 'Cancelled', 'Paused'].includes(j.status);
const reload = (id: string) => db.backfillJob.findUnique({ where: { id } });
/** Work a job with this worker until it stops or `max` ticks have passed. */
const work = async (id: string, workerId = 'w-main', max = 30) => { for (let i = 0; i < max; i++) { const r = await W.backfillTick({ workerId }); const j = await reload(id); if (finished(j!) || (!r.ran && r.reason === 'no-job')) return j!; } return (await reload(id))!; };
/** Preview, then start for real, the way the screen does. */
const previewThenStart = async (o: any) => { const pv = await mkJob({ ...o, dryRun: true }); const done = await work(pv.id); const real = await mkJob({ ...o, dryRun: false, previewJobId: pv.id }); return { pv: done, real }; };
const goStale = (id: string) => db.backfillJob.update({ where: { id }, data: { heartbeatAt: new Date(Date.now() - 60_000) } });
const dupDois = async (seed: string) => (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from (select doi from "Article" where source = 'BackfillFixture' and doi like $1 group by doi having count(*) > 1) t`, `10.9999/bf.${seed}.%`))[0].n;

try {
  // ═══════════════════════════════════════════════════════════════════════
  section('1. The gate, the registry, and what content types exist');
  process.env.INGESTION_BACKFILL_ENABLED = 'false';
  check('gate off: a job cannot be created', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE' }, WHO), 'BACKFILL_DISABLED'));
  const idle = await db.backfillJob.create({ data: { provider: 'fixture', contentType: 'ARTICLE', status: 'Running', claimedBy: 'someone-else', heartbeatAt: new Date(Date.now() - 600_000), config: { adapter: { seed: `gate${RUN}` } }, createdBy: WHO.email } });
  jobIds.push(idle.id);
  const tg = await W.backfillTick({ workerId: 'w-gate' });
  const idleAfter = await reload(idle.id);
  check('gate off: the worker does nothing, and leaves a Running job exactly as it is', tg.ran === false && tg.reason === 'disabled' && idleAfter!.claimedBy === 'someone-else' && +idleAfter!.heartbeatAt! === +idle.heartbeatAt! && idleAfter!.chunksCompleted === 0);
  check('gate off: pause/resume are refused too (resume), reading is not', await rejects(J.controlJob(idle.id, 'resume', WHO), 'BACKFILL_DISABLED') && (await J.overview()).enabled === false);
  await db.backfillJob.delete({ where: { id: idle.id } });
  process.env.INGESTION_BACKFILL_ENABLED = 'true';
  process.env.NODE_ENV = 'production';
  check('in production the fixture does not exist: no adapter is listed, none can be chosen', R.listAdapters().length === 0 && R.getAdapter('fixture') === null && (await J.overview()).adapters.length === 0 && await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE' }, WHO), 'NO_SUCH_PROVIDER'));
  delete process.env.NODE_ENV;
  check('outside production, only with BACKFILL_FIXTURE=1', R.listAdapters().length === 1 && (process.env.BACKFILL_FIXTURE = '0', R.listAdapters().length === 0) && (process.env.BACKFILL_FIXTURE = '1', true));
  check('the nine content types exist, Journals among them, and there is NO Periodical type', T.BACKFILL_TYPES.length === 9 && ['JOURNAL', 'ARTICLE', 'BOOK', 'CASE_REPORT', 'THESIS', 'CONFERENCE_PROCEEDING', 'EDUCATIONAL_VIDEO', 'NEWSLETTER', 'MAGAZINE'].every(t => (T.BACKFILL_TYPES as readonly string[]).includes(t)) && !(T.BACKFILL_TYPES as readonly string[]).some(t => /PERIODICAL/i.test(t)));
  check('an unknown type (PERIODICAL) is refused', await rejects(J.createJob({ provider: 'fixture', contentType: 'PERIODICAL' }, WHO), 'BAD_CONTENT_TYPE'));
  check('a type the adapter cannot bring is refused (the fixture is for articles only)', await rejects(J.createJob({ provider: 'fixture', contentType: 'THESIS' }, WHO), 'TYPE_NOT_SUPPORTED'));
  const ov = await J.overview();
  check('the overview lists all nine types, and only ARTICLE has a provider (fixture) here', ov.types.length === 9 && ov.types.filter(t => t.providers.length).map(t => t.id).join() === 'ARTICLE');

  // ═══════════════════════════════════════════════════════════════════════
  section('2. A request is validated, and a dry run is the default');
  check('a department that is not ours is refused', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', departments: ['Basket Weaving'] }, WHO), 'BAD_DEPARTMENT'));
  check('a window that ends before it starts is refused', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', windowStart: '2024-01-01', windowEnd: '2020-01-01' }, WHO), 'BAD_WINDOW'));
  check('maximum records above the server ceiling is refused', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', maxRecords: 5001 }, WHO), 'BAD_MAX_RECORDS'));
  check('an unknown access preference is refused', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', accessPreference: 'Anything' }, WHO), 'BAD_ACCESS'));
  check('a real start with no preview is refused', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', dryRun: false }, WHO), 'PREVIEW_REQUIRED'));
  const dflt = await mkJob({ adapter: { seed: `d${RUN}`, total: 10 } });
  check('with nothing said, the job is a DRY RUN, Pending, and holds nothing', dflt.dryRun === true && dflt.status === 'Pending' && dflt.cursor === null && dflt.recordsFetched === 0);
  check('only one active job per provider and content type', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE' }, WHO), 'JOB_ALREADY_ACTIVE'));
  await J.controlJob(dflt.id, 'cancel', WHO);

  // ═══════════════════════════════════════════════════════════════════════
  section('3. Dry run and preview: reads, judges, writes nothing; bounded');
  const S1 = `dry${RUN}`; await seedHeld(S1, 300);
  const cat0 = await catalogue();
  const dry = await mkJob({ adapter: { seed: S1, total: 300 }, accessPreference: 'OAFirst', departments: ['Computer / IT'], maxRecords: 300 });
  let dj = await work(dry.id);
  const cat1 = await catalogue();
  check('the dry run completed in three chunks of 100', dj.status === 'Completed' && dj.chunksCompleted === 3 && dj.cursor === null && dj.recordsFetched === 300, { s: dj.status, c: dj.chunksCompleted });
  check('it WROTE NOTHING to the catalogue (no article, journal, book or publisher; no run-log row)', same(cat0, cat1), { cat0, cat1 });
  check('it wrote no fixture article at all', (await fixtureRows(S1)).length === 0);
  check('its counters are what would happen (published / review / refused / failed / duplicates, from the documented shape)', same(rowsOf(dj), oracle(300, 'OAFirst')), { got: rowsOf(dj), want: oracle(300, 'OAFirst') });
  check('duplicates are split: unchanged / enriched / conflicting', dj.recordsDuplicate === 30 && dj.recordsEnriched === 10 && dj.recordsDuplicateConflicting === 10 && J.serializeJob(dj).records.unchangedDuplicate === 10);
  check('the held records were NOT enriched by a dry run', (await db.article.count({ where: { id: { in: seedIds }, volume: null } })) === 20);
  const pj = dj.preview as any;
  check('the preview is aggregate + a small sample: at most 25 records and 25 reasons', pj.v === 1 && pj.samples.length <= 25 && pj.issues.length <= 25 && pj.samples.length > 0, { s: pj.samples.length, i: pj.issues.length });
  check('…and its samples are not all the same kind', new Set(pj.samples.map((s: any) => s.outcome)).size >= 4, pj.samples.map((s: any) => s.outcome));
  check('…it names conflicts and refusals as reasons', pj.issues.some((i: any) => i.kind === 'conflict') && pj.issues.some((i: any) => i.kind === 'refused') && pj.issues.some((i: any) => i.kind === 'failed'));
  check('the job row stays small (preview under 64 KB, no records in the plan)', Buffer.byteLength(JSON.stringify(pj)) < 64 * 1024 && dj.inflight === null);
  const ser = J.serializeJob({ ...dj, bytesProcessed: 9007199254740993n });
  check('BigInt is sent as a string, exactly, and the whole job serialises', ser.bytesProcessed === '9007199254740993' && typeof JSON.stringify(ser) === 'string');
  // bounded by construction
  { const many: any[] = Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, outcome: ['publish', 'review', 'refused', 'duplicate'][i % 4], dup: i % 8 === 3 ? 'conflicting' : 'unchanged', reason: 'r'.repeat(5000), item: { title: 't'.repeat(5000) } }));
    const p = P.addToPreview(null, many, Array.from({ length: 500 }, (_, i) => ({ id: `f${i}`, reason: 'e'.repeat(5000) })), j => (j.item as any).title);
    check('500 records and 500 errors still make a preview of ≤ 25 + 25 entries, text clipped, under 64 KB', p.samples.length <= 25 && p.issues.length <= 25 && Buffer.byteLength(JSON.stringify(p)) <= 64 * 1024 && p.samples.every(s => (s.title ?? '').length <= 160) && p.truncated === true); }

  // ═══════════════════════════════════════════════════════════════════════
  section('4. Preview → Start: the configuration hash');
  const base = { adapter: { seed: S1, total: 300 }, accessPreference: 'OAFirst', departments: ['Computer / IT'], maxRecords: 300 };
  const h0 = C.configHash({ provider: 'fixture', contentType: 'ARTICLE', windowStart: null, windowEnd: null, ...base } as any);
  check('the hash is deterministic and ignores the order of departments', h0 === C.configHash({ provider: 'fixture', contentType: 'ARTICLE', windowStart: null, windowEnd: null, ...base } as any) && C.configHash({ provider: 'fixture', contentType: 'ARTICLE', windowStart: null, windowEnd: null, ...base, departments: ['Law', 'Computer / IT'] } as any) === C.configHash({ provider: 'fixture', contentType: 'ARTICLE', windowStart: null, windowEnd: null, ...base, departments: ['Computer / IT', 'Law'] } as any));
  const changed: [string, any][] = [['access preference', { accessPreference: 'MetadataOnlyAllowed' }], ['maximum records', { maxRecords: 299 }], ['departments', { departments: ['Law'] }], ['window start', { windowStart: '2021-01-01' }], ['window end', { windowEnd: '2024-01-01' }], ['an adapter parameter', { adapter: { seed: S1, total: 299 } }]];
  for (const [name, patch] of changed) check(`changing the ${name} changes the hash`, C.configHash({ provider: 'fixture', contentType: 'ARTICLE', windowStart: null, windowEnd: null, ...base, ...patch } as any) !== h0);
  check('the preview job carries the hash of the request as ASKED (not of its smaller sample)', (dj.config as any).hash === h0 && (dj.config as any).requestedMaxRecords === 300);
  for (const [name, patch] of changed.slice(0, 3)) check(`a real start after changing the ${name} is refused: PREVIEW_MISMATCH`, await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', ...base, ...patch, dryRun: false, previewJobId: dry.id }, WHO), 'PREVIEW_MISMATCH'));
  check('a preview that was not completed (a cancelled one) cannot start anything', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', ...base, dryRun: false, previewJobId: dflt.id }, WHO), 'PREVIEW_REQUIRED'));
  await db.backfillJob.update({ where: { id: dry.id }, data: { completedAt: new Date(Date.now() - 2 * 3600_000) } });
  check('a preview older than an hour is refused: PREVIEW_STALE', await rejects(J.createJob({ provider: 'fixture', contentType: 'ARTICLE', ...base, dryRun: false, previewJobId: dry.id }, WHO), 'PREVIEW_STALE'));
  await db.backfillJob.update({ where: { id: dry.id }, data: { completedAt: new Date() } });

  // ═══════════════════════════════════════════════════════════════════════
  section('5. A real run, bounded: 300 fixture records, nothing is counted twice');
  const catR0 = await catalogue(), runsBefore = catR0.runs;
  const realJ = await J.createJob({ provider: 'fixture', contentType: 'ARTICLE', ...base, dryRun: false, previewJobId: dry.id }, WHO); jobIds.push(realJ.id);
  check('a real job starts from the preview, Pending, with the preview recorded', realJ.dryRun === false && (realJ.config as any).previewJobId === dry.id && realJ.maxRecords === 300);
  const rj = await work(realJ.id);
  const e1 = oracle(300, 'OAFirst');
  check('it completed: three chunks, cursor at the end, end of data', rj.status === 'Completed' && rj.chunksCompleted === 3 && rj.cursor === null && (rj.config as any).finishedBecause === 'end of data' && rj.inflight === null, { s: rj.status, c: rj.chunksCompleted, why: (rj.config as any).finishedBecause });
  check('its counters equal the documented shape exactly', same(rowsOf(rj), e1), { got: rowsOf(rj), want: e1 });
  check('every fetched record is in exactly one bucket (published + review + duplicate + refused + failed = fetched)', rj.recordsPublished + rj.recordsReview + rj.recordsDuplicate + rj.recordsRefused + rj.recordsFailed + rj.recordsHeld === rj.recordsFetched);
  const rows1 = await fixtureRows(S1);
  check('the catalogue gained exactly published + review rows, no more', rows1.length === e1.published + e1.review, { rows: rows1.length, want: e1.published + e1.review });
  check('published ones are Published, review ones are Drafts (a person decides), and nothing was made viewable here', rows1.filter(r => r.status === 'Published').length === e1.published && rows1.filter(r => r.status === 'Draft').length === e1.review && rows1.every(r => r.accessStatus !== 'ViewableHere'));
  check('no catalogue duplicate was created', (await dupDois(S1)) === 0);
  check('every row it wrote says which job wrote it (provenance)', rows1.every(r => r.createdBy === `Backfill:${realJ.id}`));
  const enr = await db.article.findMany({ where: { id: { in: seedIds } } });
  const byI = (a: any) => Number(a.title.split(' ').pop());
  check('held duplicates that could be completed were completed (empty volume filled) — and only that', enr.filter(a => dupKind(byI(a)) === 'enriched').every(a => a.volume === '7') && enr.filter(a => dupKind(byI(a)) === 'conflicting').every(a => a.volume === null && a.licence === 'CC BY'));
  check('a CONFLICTING duplicate was left exactly as it was: licence still CC BY, nothing filled', enr.filter(a => dupKind(byI(a)) === 'conflicting').length === 10);
  check('the real run wrote no run-log row (the engine\'s metrics are not mixed with it)', (await catalogue()).runs === runsBefore);
  check('only articles changed: no journal, book or publisher was created', (await catalogue()).journals === catR0.journals && (await catalogue()).books === catR0.books && (await catalogue()).publishers === catR0.publishers);

  // ═══════════════════════════════════════════════════════════════════════
  section('6. Idempotency: the same job again adds nothing');
  const catI0 = await catalogue();
  const again = await previewThenStart({ ...base });
  const aj = await work(again.real.id);
  check('running the same configuration again created NO catalogue rows', same(await catalogue(), { ...catI0, runs: catI0.runs }), { before: catI0, after: await catalogue() });
  check('every readable, non-refused record is now a duplicate: 0 published, 0 review, 270 duplicates, 10 still conflicting, 0 enriched', aj.recordsPublished === 0 && aj.recordsReview === 0 && aj.recordsDuplicate === 270 && aj.recordsDuplicateConflicting === 10 && aj.recordsEnriched === 0 && aj.recordsRefused === 15 && aj.recordsFailed === 15, rowsOf(aj));

  // ═══════════════════════════════════════════════════════════════════════
  section('7. Pause, resume, cancel');
  const S2 = `pz${RUN}`; await seedHeld(S2, 300);
  const b2 = { adapter: { seed: S2, total: 300 }, accessPreference: 'OAFirst', maxRecords: 300 };
  const pa = await mkJob({ ...b2, dryRun: true });
  await J.controlJob(pa.id, 'pause', WHO);
  check('a Pending job pauses at once', (await reload(pa.id))!.status === 'Paused' && !!(await reload(pa.id))!.pausedAt);
  check('a paused job is not picked up by the worker', (await W.backfillTick({ workerId: 'w-p' })).reason === 'no-job');
  await J.controlJob(pa.id, 'resume', WHO);
  check('resume puts it back to Pending', (await reload(pa.id))!.status === 'Pending' && (await reload(pa.id))!.pausedAt === null);
  await J.controlJob(pa.id, 'cancel', WHO);
  check('a Pending job cancels at once; a cancelled job cannot be resumed or paused', (await reload(pa.id))!.status === 'Cancelled' && await rejects(J.controlJob(pa.id, 'resume', WHO), 'BAD_STATE') && await rejects(J.controlJob(pa.id, 'pause', WHO), 'BAD_STATE'));

  const pv2 = await mkJob({ ...b2, dryRun: true }); await work(pv2.id);
  const pr = await J.createJob({ provider: 'fixture', contentType: 'ARTICLE', ...b2, dryRun: false, previewJobId: pv2.id }, WHO); jobIds.push(pr.id);
  await W.backfillTick({ workerId: 'w-p' });
  let m = (await reload(pr.id))!;
  check('after one chunk: committed, cursor 100, still Running', m.chunksCompleted === 1 && m.cursor === '100' && m.status === 'Running' && m.recordsFetched === 100);
  await J.controlJob(pr.id, 'pause', WHO);
  check('pausing a Running job only asks: it is not Paused until the worker is at a boundary', (await reload(pr.id))!.status === 'Running' && (await reload(pr.id))!.pauseRequested === true);
  await W.backfillTick({ workerId: 'w-p' });
  m = (await reload(pr.id))!;
  check('the next tick pauses it, saves the checkpoint, and does not start another chunk', m.status === 'Paused' && m.chunksCompleted === 1 && m.cursor === '100' && m.claimedBy === null && m.pauseRequested === false);
  const rowsAtPause = (await fixtureRows(S2)).length;
  await J.controlJob(pr.id, 'resume', WHO);
  const rr = await work(pr.id, 'w-p');
  check('resume continues from the saved checkpoint only, and completes with exact totals (nothing re-counted)', rr.status === 'Completed' && same(rowsOf(rr), oracle(300, 'OAFirst')) && (await fixtureRows(S2)).length >= rowsAtPause && (await dupDois(S2)) === 0, { got: rowsOf(rr) });

  // pause / cancel DURING a chunk: the chunk finishes and commits first
  const S3 = `pc${RUN}`; await seedHeld(S3, 300);
  const b3 = { adapter: { seed: S3, total: 300, delayMs: 1200 }, accessPreference: 'OAFirst', maxRecords: 300 };
  const { real: r3 } = await previewThenStart({ ...b3, adapter: { ...b3.adapter, delayMs: 0 } });
  await db.backfillJob.update({ where: { id: r3.id }, data: { config: { ...(r3.config as any), adapter: { seed: S3, total: 300, delayMs: 1200 } } } });
  const running = W.backfillTick({ workerId: 'w-c' });
  await sleep(300); await J.controlJob(r3.id, 'pause', WHO);
  const tr = await running; m = (await reload(r3.id))!;
  check('a pause asked for DURING a chunk: the chunk is finished and committed (100 records), THEN the job is Paused', tr.ran && m.status === 'Paused' && m.chunksCompleted === 1 && m.recordsFetched === 100 && m.cursor === '100', { s: m.status, c: m.chunksCompleted });
  await J.controlJob(r3.id, 'resume', WHO);
  const running2 = W.backfillTick({ workerId: 'w-c' });
  await sleep(300); await J.controlJob(r3.id, 'cancel', WHO);
  await running2; m = (await reload(r3.id))!;
  const rowsAtCancel = (await fixtureRows(S3)).length;
  check('a cancel asked for DURING a chunk: that chunk is committed, then the job is Cancelled and does no more', m.status === 'Cancelled' && m.chunksCompleted === 2 && m.recordsFetched === 200 && !!m.completedAt, { s: m.status, c: m.chunksCompleted });
  await W.backfillTick({ workerId: 'w-c' });
  check('cancel deletes nothing: what was imported stays, and no further work happens', (await fixtureRows(S3)).length === rowsAtCancel && rowsAtCancel > 0 && (await reload(r3.id))!.recordsFetched === 200);

  // ═══════════════════════════════════════════════════════════════════════
  section('8. Limits');
  const S4 = `lm${RUN}`;
  { const { real } = await previewThenStart({ adapter: { seed: S4, total: 300 }, maxRecords: 150, accessPreference: 'MetadataOnlyAllowed' });
    const j = await work(real.id);
    check('maximum records 150: chunks of 100 and 50, then COMPLETED (a limit is not a failure)', j.status === 'Completed' && j.recordsFetched === 150 && j.chunksCompleted === 2 && (j.config as any).finishedBecause === 'maximum records reached', { f: j.recordsFetched, c: j.chunksCompleted, why: (j.config as any).finishedBecause }); }
  { process.env.BACKFILL_MAX_BYTES_PER_JOB = '3000';
    const { real } = await previewThenStart({ adapter: { seed: `by${RUN}`, total: 300 }, maxRecords: 300, accessPreference: 'MetadataOnlyAllowed' });
    const j = await work(real.id);
    check('maximum bytes: stops at the end of the chunk that crossed it, Completed', j.status === 'Completed' && j.chunksCompleted === 1 && (j.config as any).finishedBecause === 'maximum bytes reached' && Number(j.bytesProcessed) >= 3000, { b: String(j.bytesProcessed), why: (j.config as any).finishedBecause });
    delete process.env.BACKFILL_MAX_BYTES_PER_JOB; }
  { const { real } = await previewThenStart({ adapter: { seed: `rt${RUN}`, total: 300 }, maxRecords: 300, accessPreference: 'MetadataOnlyAllowed' });
    await db.backfillJob.update({ where: { id: real.id }, data: { config: { ...(real.config as any), activeMs: 61 * 60_000 } } });
    const j = await work(real.id);
    check('maximum runtime (60 min of active time): Completed before another chunk starts', j.status === 'Completed' && j.chunksCompleted === 0 && (j.config as any).finishedBecause === 'maximum runtime reached'); }
  { const blocker = await db.backfillJob.create({ data: { provider: 'other', contentType: 'ARTICLE', status: 'Running', claimedBy: 'another-worker', heartbeatAt: new Date(), config: {}, createdBy: WHO.email } }); jobIds.push(blocker.id);
    const waiting = await db.backfillJob.create({ data: { provider: 'fixture', contentType: 'ARTICLE', status: 'Pending', config: { adapter: { seed: `cc${RUN}` } }, createdBy: WHO.email } }); jobIds.push(waiting.id);
    const t = await W.backfillTick({ workerId: 'w-second' });
    check('concurrency is 1: while another worker is alive on a job, this one claims nothing', t.reason === 'no-job' && (await reload(waiting.id))!.status === 'Pending');
    await db.backfillJob.deleteMany({ where: { id: { in: [blocker.id, waiting.id] } } }); }

  // ═══════════════════════════════════════════════════════════════════════
  section('9. The provider lock: one chunk, then let go');
  const S5 = `lk${RUN}`;
  { const { real } = await previewThenStart({ adapter: { seed: S5, total: 300 }, maxRecords: 300, accessPreference: 'MetadataOnlyAllowed' });
    __resetProviderLocks(); tryLockProvider('BackfillFixture', 'continuous');
    const t = await W.backfillTick({ workerId: 'w-l' }); const j = await reload(real.id);
    check('the continuous engine holds the provider: the backfill skips (busy), counts nothing, and does not take the lock', t.reason === 'busy' && j!.chunksCompleted === 0 && j!.recordsFetched === 0 && providerHolder('BackfillFixture')?.owner === 'continuous');
    unlockProvider('BackfillFixture', 'continuous');
    const t2 = await W.backfillTick({ workerId: 'w-l' });
    check('once it is free, one chunk runs — and the lock is released straight after it (the engine gets its turn)', t2.ran === true && providerHolder('BackfillFixture') === null && (await reload(real.id))!.chunksCompleted === 1);
    check('between chunks the worker waits at least the minimum gap, and as long as the chunk took (≤ 50 % of the provider\'s time)', (process.env.BACKFILL_MIN_GAP_SECONDS = '10', W.nextDelayMs({ ran: true, elapsedMs: 4000 }) === 10_000 && W.nextDelayMs({ ran: true, elapsedMs: 25_000 }) === 25_000 && W.nextDelayMs({ ran: false, reason: 'busy' }) >= 10_000)); process.env.BACKFILL_MIN_GAP_SECONDS = '0';
    await J.controlJob(real.id, 'cancel', WHO); await W.backfillTick({ workerId: 'w-l' }); }

  // ═══════════════════════════════════════════════════════════════════════
  section('10. Crash recovery — in-process crashes, one at each point (counters must equal an uninterrupted run)');
  const crashCase = async (point: string, seedKey: string) => {
    const seed = `${seedKey}${RUN}`; await seedHeld(seed, 300);
    const { real } = await previewThenStart({ adapter: { seed, total: 300 }, maxRecords: 300, accessPreference: 'OAFirst' });
    H.__setCrash(point);
    let crashed = false; try { await W.backfillTick({ workerId: 'w-dead' }); } catch (e) { crashed = e instanceof H.SimulatedCrash; }
    return { seed, id: real.id, crashed, after: (await reload(real.id))!, rows: (await fixtureRows(seed)).length };
  };
  const recover = async (c: { seed: string; id: string }) => { await goStale(c.id); return work(c.id, 'w-recover'); };
  const exact = (j: any) => same(rowsOf(j), oracle(300, 'OAFirst'));

  { const c = await crashCase('before-inflight', 'cb');
    check('crash BEFORE the plan is saved: nothing counted, nothing written, no plan', c.crashed && c.after.inflight === null && c.after.recordsFetched === 0 && c.after.chunksCompleted === 0 && c.rows === 0);
    const j = await recover(c);
    check('…the job is re-planned normally and finishes with exact counters, once', j.status === 'Completed' && exact(j) && (await dupDois(c.seed)) === 0 && (await fixtureRows(c.seed)).length === oracle(300, 'OAFirst').published + oracle(300, 'OAFirst').review, rowsOf(j)); }

  { const c = await crashCase('after-inflight', 'ci');
    const inf: any = c.after.inflight;
    check('crash AFTER the plan is saved, BEFORE any write: the plan is there and bounded, counters are still 0, nothing is written', c.crashed && !!inf && inf.chunkNumber === 1 && inf.cursorBefore === null && inf.expectedCursorAfter === '100' && inf.planned.length === 100 && !!inf.pageHash && c.after.recordsFetched === 0 && c.rows === 0, { inf: inf && { n: inf.chunkNumber, a: inf.expectedCursorAfter, p: inf.planned.length } });
    check('…the plan holds identifiers and one-letter outcomes, never a record, and is small', inf.planned.every((p: any) => typeof p[0] === 'string' && /^[PRHUECXF]$/.test(p[1])) && JSON.stringify(inf).length < 12_000 && !JSON.stringify(inf).includes('Fixture article'), JSON.stringify(inf).length);
    check('…its planned counts are the chunk\'s counts', inf.counts.fetched === 100 && inf.counts.published + inf.counts.review + inf.counts.duplicate + inf.counts.refused + inf.counts.failed === 100);
    const j = await recover(c);
    check('…recovery verifies it is the same page, applies the plan once, and commits the planned counters once', j.status === 'Completed' && exact(j) && (await dupDois(c.seed)) === 0, rowsOf(j)); }

  { const c = await crashCase('mid-apply:40', 'cm');
    const inf: any = c.after.inflight;
    check('crash AFTER PARTIAL WRITES (40 records written): the plan is saved, counters are 0, 40 rows exist', c.crashed && !!inf && c.after.recordsFetched === 0 && c.rows === 40, { rows: c.rows });
    const j = await recover(c);
    check('…recovery finds the 40 already there, writes the rest, and the counters still describe the ORIGINAL plan (those 40 are published, not duplicates)', j.status === 'Completed' && exact(j), { got: rowsOf(j), want: oracle(300, 'OAFirst') });
    check('…no row was written twice', (await dupDois(c.seed)) === 0 && (await fixtureRows(c.seed)).length === oracle(300, 'OAFirst').published + oracle(300, 'OAFirst').review); }

  { const c = await crashCase('after-apply', 'ca');
    check('crash AFTER ALL WRITES, before the commit: all of chunk 1 is in the catalogue, but cursor and counters have not moved', c.crashed && c.after.recordsFetched === 0 && c.after.cursor === null && c.after.chunksCompleted === 0 && c.rows > 0, { rows: c.rows });
    const rowsAtCrash = c.rows;
    await goStale(c.id); await W.backfillTick({ workerId: 'w-recover' });
    const mid = (await reload(c.id))!;
    check('…the retry creates no records again, and the chunk is committed EXACTLY once: cursor 100, one chunk, 100 fetched', (await fixtureRows(c.seed)).length === rowsAtCrash && mid.chunksCompleted === 1 && mid.cursor === '100' && mid.recordsFetched === 100 && mid.inflight === null, { c: mid.chunksCompleted, f: mid.recordsFetched });
    const j = await work(c.id, 'w-recover');
    check('…and the finished job has exact counters (the retried chunk is not counted again)', j.status === 'Completed' && exact(j) && (await dupDois(c.seed)) === 0, rowsOf(j)); }

  { // a second crash DURING the retry: the plan is the same one, and the retry is recorded on it
    const c = await crashCase('after-inflight', 'c2');
    await goStale(c.id); H.__setCrash('after-apply');
    let again = false; try { await W.backfillTick({ workerId: 'w-dead-2' }); } catch (e) { again = e instanceof H.SimulatedCrash; }
    const inf: any = (await reload(c.id))!.inflight;
    check('crash during the RETRY too: the same plan is still there, now marked as attempt 1', again && inf.chunkNumber === 1 && inf.attempts === 1, { a: inf?.attempts });
    await goStale(c.id); const j = await work(c.id, 'w-recover');
    check('…and the third worker still finishes it with exact counters', j.status === 'Completed' && exact(j) && (await dupDois(c.seed)) === 0, rowsOf(j)); }

  section('10b. The source returns a DIFFERENT page for the same cursor');
  { const c = await crashCase('after-inflight', 'cx');
    const planned = (c.after.inflight as any).planned.map((p: any) => p[0]);
    F.fixtureHooks.mutate = (recs, off) => off === 0 ? recs.map((r, i) => (i === 5 ? { ...r, id: `${r.id}:CHANGED`, doi: `${r.doi}.changed` } : r)) : recs;
    await goStale(c.id); const t = await W.backfillTick({ workerId: 'w-recover' });
    const j = (await reload(c.id))!;
    check('the job STOPS: Failed with BACKFILL_PAGE_CHANGED_DURING_RETRY and a reason', t.reason === 'failed' && j.status === 'Failed' && String(j.lastError).startsWith('BACKFILL_PAGE_CHANGED_DURING_RETRY'), { s: j.status, e: j.lastError });
    check('…nothing was applied: no row written, no counter moved, the saved plan kept as evidence', (await fixtureRows(c.seed)).length === 0 && j.recordsFetched === 0 && j.recordsPublished === 0 && j.chunksCompleted === 0 && !!j.inflight && (j.inflight as any).planned.map((p: any) => p[0]).join() === planned.join());
    check('…the different page was not written under the first page\'s counts (the changed record does not exist)', (await db.article.count({ where: { doi: { endsWith: '.changed' } } })) === 0);
    check('a Failed job cannot simply be resumed', await rejects(J.controlJob(c.id, 'resume', WHO), 'BAD_STATE'));
    F.fixtureHooks.mutate = (recs, off) => off === 0 ? recs.slice(0, -1) : recs;
    await db.backfillJob.update({ where: { id: c.id }, data: { status: 'Failed' } });
    F.fixtureHooks.mutate = null;
    await J.controlJob(c.id, 'replan', WHO);
    const rp = (await reload(c.id))!;
    check('an explicit RE-PLAN drops the saved plan, records that it did, and leaves the job Paused for a person to resume', rp.status === 'Paused' && rp.inflight === null && ((rp.config as any).replans ?? []).length === 1 && (rp.config as any).replans[0].chunk === 1);
    await J.controlJob(c.id, 'resume', WHO); const done = await work(c.id, 'w-recover');
    check('…after the re-plan it completes with exact counters and no duplicate rows (no write had happened under the dropped plan)', done.status === 'Completed' && exact(done) && (await dupDois(c.seed)) === 0, rowsOf(done));
    check('a page that is merely SHORTER also stops the job', await (async () => {
      const c2 = await crashCase('after-inflight', 'cy'); F.fixtureHooks.mutate = (recs, off) => off === 0 ? recs.slice(0, -1) : recs;
      await goStale(c2.id); await W.backfillTick({ workerId: 'w-recover' }); F.fixtureHooks.mutate = null;
      const j2 = (await reload(c2.id))!; return j2.status === 'Failed' && (await fixtureRows(c2.seed)).length === 0 && j2.recordsFetched === 0;
    })()); }

  // ═══════════════════════════════════════════════════════════════════════
  section('11. Heartbeat: a long chunk is not taken over; a dead worker is');
  { const seed = `hb${RUN}`;
    const { real } = await previewThenStart({ adapter: { seed, total: 100, delayMs: 0 }, maxRecords: 100, accessPreference: 'MetadataOnlyAllowed' });
    await db.backfillJob.update({ where: { id: real.id }, data: { config: { ...(real.config as any), adapter: { seed, total: 100, delayMs: 4500 } } } });   // one chunk of 4.5 s: longer than the 3 s stale limit
    const longRun = W.backfillTick({ workerId: 'w-long' });
    await sleep(1500);
    const hb1 = (await reload(real.id))!.heartbeatAt!;
    await sleep(2500);                                   // 4 s in: past the stale limit, but the worker has been beating
    const hb2 = (await reload(real.id))!.heartbeatAt!;
    const other = await W.backfillTick({ workerId: 'w-thief' });
    const mid = (await reload(real.id))!;
    check('while a chunk runs, the heartbeat keeps moving (about every second)', +hb2 > +hb1 && Date.now() - +hb2 < 2500, { hb1, hb2 });
    check('a second worker, 4 s into a 4.5 s chunk (stale limit 3 s), CANNOT take the job over', other.reason === 'no-job' && mid.claimedBy === 'w-long' && mid.status === 'Running');
    const lr = await longRun; const fin = (await reload(real.id))!;
    check('the long chunk committed normally: not "lost", counted once', lr.ran === true && fin.chunksCompleted === 1 && fin.status === 'Completed' && fin.recordsFetched === 100, { r: lr, s: fin.status });
    // and a genuinely dead worker (no heartbeat) is taken over
    const dead = await db.backfillJob.create({ data: { provider: 'fixture', contentType: 'ARTICLE', status: 'Running', dryRun: true, claimedBy: 'w-dead-x', heartbeatAt: new Date(Date.now() - 10_000), config: { adapter: { seed: `dd${RUN}`, total: 50 } }, createdBy: WHO.email } }); jobIds.push(dead.id);
    const tk = await W.backfillTick({ workerId: 'w-taker' });
    check('a Running job whose worker has been silent for longer than the stale limit IS taken over, from its checkpoint', tk.ran === true && tk.jobId === dead.id && (await reload(dead.id))!.status === 'Completed'); }
  check('the stale limit can never be shorter than three heartbeats', (process.env.BACKFILL_HEARTBEAT_SECONDS = '30', process.env.BACKFILL_HEARTBEAT_STALE_SECONDS = '40', C.backfillLimits().heartbeatStaleSeconds === 90)); process.env.BACKFILL_HEARTBEAT_SECONDS = '1'; process.env.BACKFILL_HEARTBEAT_STALE_SECONDS = '3';
  { // a worker that lost the job (it was taken over while this one was frozen) must not commit
    const seed = `fz${RUN}`;
    const { real } = await previewThenStart({ adapter: { seed, total: 100 }, maxRecords: 100, accessPreference: 'MetadataOnlyAllowed' });
    await db.backfillJob.update({ where: { id: real.id }, data: { status: 'Running', claimedBy: 'w-new', heartbeatAt: new Date() } });
    const job = (await reload(real.id))!;
    const r = await K.runBackfillChunk({ ...job, claimedBy: 'w-new' }, R.getAdapter('fixture')!, { workerId: 'w-frozen', chunkSize: 100 });
    check('a worker that no longer holds the job commits NOTHING (compare-and-set): "lost"', r.kind === 'lost' && (await reload(real.id))!.recordsFetched === 0 && (await reload(real.id))!.chunksCompleted === 0);
    await db.backfillJob.update({ where: { id: real.id }, data: { status: 'Cancelled' } }); }

  // ═══════════════════════════════════════════════════════════════════════
  section('12. Crash recovery — a REAL kill (SIGKILL), then a different process finishes');
  const killCase = async (point: string, seedKey: string) => {
    const seed = `${seedKey}${RUN}`; await seedHeld(seed, 300);
    const { real } = await previewThenStart({ adapter: { seed, total: 300 }, maxRecords: 300, accessPreference: 'OAFirst' });
    const child = spawn('npx', ['tsx', 'scripts/backfill-worker-child.ts', `child-${seedKey}`], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, BACKFILL_TEST_CRASH: point }, stdio: 'ignore' });
    const exit: { code: number | null; signal: string | null } = await new Promise(res => child.on('exit', (code, signal) => res({ code, signal })));
    return { seed, id: real.id, exit, after: (await reload(real.id))!, rows: (await fixtureRows(seed)).length };
  };
  for (const [point, key, label] of [['mid-apply:40', 'km', 'mid-apply (40 written)'], ['after-apply', 'ka', 'after all writes, before the commit'], ['after-inflight', 'ki', 'after the plan, before any write']] as const) {
    const k = await killCase(point, key);
    check(`SIGKILL ${label}: the process really died (signal), the job is left Running under the dead worker with its plan`, (k.exit.signal === 'SIGKILL' || k.exit.code === 137) && k.after.status === 'Running' && k.after.claimedBy === `child-${key}` && !!k.after.inflight && k.after.recordsFetched === 0, k.exit);
    await sleep(3300);                                   // the dead worker's heartbeat goes stale
    const j = await work(k.id, 'w-after-kill');
    check(`…and finishes it: exact counters (same as an uninterrupted run), no duplicate rows`, j.status === 'Completed' && exact(j) && (await dupDois(k.seed)) === 0 && (await fixtureRows(k.seed)).length === oracle(300, 'OAFirst').published + oracle(300, 'OAFirst').review, { got: rowsOf(j), rows: (await fixtureRows(k.seed)).length }); }

  // ═══════════════════════════════════════════════════════════════════════
  section('13. Nothing else moved');
  const AFTER_CP = await checkpoints(), AFTER_CAT = await catalogue();
  check('every continuous-engine checkpoint is byte-identical to before this suite: book harvest, department sweeps, journal cursors and cooldowns, engine settings and rotation, provider health', same(BEFORE_CP, AFTER_CP), { BEFORE_CP, AFTER_CP });
  check('no Journal row was created or changed (Periodicals ARE Journals; none touched)', AFTER_CAT.journals === BEFORE_CAT.journals && (await db.journal.count()) === journalsBefore);
  check('no book and no publisher was created', AFTER_CAT.books === BEFORE_CAT.books && AFTER_CAT.publishers === BEFORE_CAT.publishers);
  console.log(`\n  catalogue before : ${JSON.stringify(BEFORE_CAT)}\n  catalogue after  : ${JSON.stringify(AFTER_CAT)}   (articles differ only by this suite's fixture rows, removed next)`);
} finally {
  // remove what this suite made (fixture articles, seeded held articles, jobs) — never anything else
  await db.article.deleteMany({ where: { OR: [{ source: 'BackfillFixture' }, { source: 'BackfillTest' }] } });
  await db.backfillJob.deleteMany({ where: { createdBy: WHO.email } });
  const AFTER_CLEAN = await catalogue();
  console.log(`  catalogue cleaned: ${JSON.stringify(AFTER_CLEAN)}`);
  check('after cleanup the catalogue is exactly as it was before the suite', same(BEFORE_CAT, AFTER_CLEAN), { BEFORE_CAT, AFTER_CLEAN });
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
