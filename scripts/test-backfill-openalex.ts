/**
 * Historical backfill, Phase 2B: the OpenAlex snapshot adapter, proved on OpenAlex-FORMAT samples (100 and 1,000 works), a long-line / large-file streaming check, and — when
 * OPENALEX_REAL_FRAGMENT names a staged copy of a real, small partition — on real OpenAlex records. No network is used by the sample runs; the real fragment is read from disk.
 *
 *   OA_TEST_DIR=<scratch dir> [OPENALEX_REAL_FRAGMENT=<staged real fragment dir>] npx tsx scripts/test-backfill-openalex.ts
 *
 * Throwaway database `stm_ingestion_test` only (refuses anything else). Everything the suite creates is removed at the end; catalogue counts and a fingerprint of every
 * continuous-engine checkpoint (including every journal's OpenAlex cursor) are compared before and after.
 */
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const ROOT = fs.mkdtempSync(path.join(process.env.OA_TEST_DIR || os.tmpdir(), 'oa-test-'));
for (const k of Object.keys(process.env)) if (k.startsWith('BACKFILL_') || k === 'INGESTION_BACKFILL_ENABLED') delete process.env[k];
Object.assign(process.env, { INGESTION_BACKFILL_ENABLED: 'true', OPENALEX_SNAPSHOT_DIR: ROOT, BACKFILL_MIN_GAP_SECONDS: '0', BACKFILL_HEARTBEAT_SECONDS: '1', BACKFILL_HEARTBEAT_STALE_SECONDS: '3', BACKFILL_PREVIEW_MAX_RECORDS: '2000', INGESTION_MULTI_SOURCE_ENRICHMENT: '1' });
delete process.env.NODE_ENV;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const J = await import('../src/lib/ingestion/backfill/jobs.js');
const W = await import('../src/lib/ingestion/backfill/worker.js');
const R = await import('../src/lib/ingestion/backfill/registry.js');
const H = await import('../src/lib/ingestion/backfill/testHooks.js');
const OA = await import('../src/lib/ingestion/backfill/openalexAdapter.js');
const SN = await import('../src/lib/ingestion/backfill/openalexSnapshot.js');
const { __useFileCheckForTests } = await import('../src/lib/ingestion/articleSources.js');
const { makeSample, sampleDoi, sampleId, sampleWork } = await import('./openalex-sample.js');

const SUITE_START = new Date(); const RUN = Date.now().toString(36);
const WHO = { uid: 'qa', email: `oa-qa-${RUN}@test.invalid` };
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rejects = async (p: Promise<any>, code: string) => { try { await p; return false; } catch (e: any) { return e?.code === code; } };
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const mb = (n: number) => Math.round(n / 1048576);
// the engine's own "does this file open?" check, replaced: files named ok-… open, bad-… do not. No network.
__useFileCheckForTests(async (u: string | null) => !!u && !/bad-/.test(u));

const catalogue = async () => (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Article")::int articles, (select count(*) from "Journal")::int journals, (select count(*) from "Book")::int books, (select count(*) from "Publisher")::int publishers, (select count(*) from "IngestionRun")::int runs`))[0];
const checkpoints = async () => (await db.$queryRawUnsafe<any[]>(`select
  md5(coalesce((select string_agg(provider || coalesce(cursor, '') || coalesce("lastSuccessfulSyncAt"::text, '') || coalesce("harvestStartedAt"::text, ''), '|' order by provider) from "BookHarvestCheckpoint"), '')) harvest,
  md5(coalesce((select string_agg(id || position::text || coalesce("exhaustedAt"::text, '') || coalesce("lastSweptAt"::text, ''), '|' order by id) from "DepartmentSweep"), '')) sweeps,
  md5(coalesce((select string_agg(id || coalesce("fetchCursor", '') || coalesce("nextEligibleAt"::text, '') || coalesce("lastIngestedAt"::text, '') || "articleCount"::text, '|' order by id) from "Journal" where title not like 'OA test journal%' and title not like 'OAR %'), '')) journals,
  md5(coalesce((select string_agg(key || value::text, '|' order by key) from "AppSetting" where key like 'ingestion.%'), '')) settings,
  md5(coalesce((select string_agg(source || "consecutiveFailures"::text || coalesce("pausedUntil"::text, '') || "lifetimeFailures"::text, '|' order by source) from "IngestionSourceHealth"), '')) health`))[0];
const BEFORE_CAT = await catalogue(), BEFORE_CP = await checkpoints();

// ── the sample's journals (ours: accepted, DOAJ-declared; the last is non-commercial) ─────────────────────────────────────────────────
let jN = 0; const jPrefix = String(1000 + (parseInt(RUN, 36) % 8000));
const mkIssn = () => `${jPrefix}-${String(++jN).padStart(3, '0')}X`;
const journalRows: any[] = [];
for (let k = 0; k < 4; k++) journalRows.push(await db.journal.create({ data: { title: `OA test journal ${RUN} ${k}`, issn: mkIssn(), status: 'Accepted', rightsBasis: 'DOAJ declaration', licenceIsNC: k === 3, domain: 'Computer / IT' } }));
const FOREIGN = mkIssn();
const JOURNALS = journalRows.map(j => ({ issn: j.issn as string, title: j.title as string }));
await sleep(30);          // journals exist strictly before any job is created

// ── the oracle: written from the documented shape of the sample, not from the adapter ───────────────────────────────────────────────
const dupKind = (i: number) => (i % 30 === 6 ? 'enriched' : i % 30 === 15 ? 'conflicting' : i % 30 === 9 ? 'unchanged' : null);
type Exp = { fetched: number; normalized: number; unique: number; published: number; review: number; refused: number; failed: number; duplicate: number; enriched: number; conflicting: number; scanned: number; notRelevant: number };
const oracle = (total: number, pref: 'OAFirst' | 'MetadataOnlyAllowed' = 'OAFirst', seeded = true): Exp => {
  const e: Exp = { fetched: 0, normalized: 0, unique: 0, published: 0, review: 0, refused: 0, failed: 0, duplicate: 0, enriched: 0, conflicting: 0, scanned: total, notRelevant: 0 };
  for (let i = 0; i < total; i++) {
    const k = i % 10, relevant = k === 3 || k >= 5;
    if (!relevant) { e.notRelevant++; continue; }
    e.fetched++;
    if (k === 3) { e.refused++; continue; }
    const d = seeded ? dupKind(i) : null;
    if (d) { e.duplicate++; if (d === 'enriched') e.enriched++; if (d === 'conflicting') e.conflicting++; continue; }
    const sp = i % 25;
    if (sp === 0) { e.refused++; continue; }
    if (sp === 1) { e.review++; continue; }
    const jIdx = Math.floor(i / 4) % 4, licenceNull = i % 4 === 0 && i % 30 !== 15;
    if (pref === 'OAFirst' && jIdx === 3 && licenceNull) { e.review++; continue; }
    e.published++;
  }
  e.normalized = e.fetched; e.unique = e.published + e.review;
  return e;
};
const rowsOf = (j: any) => ({ fetched: j.recordsFetched, normalized: j.recordsNormalized, unique: j.recordsUnique, published: j.recordsPublished, review: j.recordsReview, refused: j.recordsRefused, failed: j.recordsFailed, duplicate: j.recordsDuplicate, enriched: j.recordsEnriched, conflicting: j.recordsDuplicateConflicting });
const expRows = (e: Exp) => ({ fetched: e.fetched, normalized: e.normalized, unique: e.unique, published: e.published, review: e.review, refused: e.refused, failed: e.failed, duplicate: e.duplicate, enriched: e.enriched, conflicting: e.conflicting });
const heldIds: string[] = [];
const seedHeld = async (seed: string, total: number) => {
  for (let i = 0; i < total; i++) {
    const k = i % 10, d = dupKind(i); if (!d || k < 5) continue;
    const j = JOURNALS[Math.floor(i / 4) % 4], doi = sampleDoi(seed, i);
    const a = await db.article.create({ data: { title: `OpenAlex sample ${seed} ${i}`, doi, fingerprint: `doi:${doi}`, status: 'Published', source: 'BackfillTest', ownershipSource: 'Ingested', licence: 'CC BY', accessType: 'OpenAccess', accessStatus: 'LinkOnly',
      authors: `Author ${i}, Coauthor ${i}`, volume: d === 'enriched' ? null : i % 3 === 0 ? '12' : null, issue: '2', subject: 'Computer Science', publisherName: 'Sample Press', journalName: j.title, journalIssn: j.issn } });
    heldIds.push(a.id);
  }
};
const oaRows = (seed: string) => db.article.findMany({ where: { source: 'OpenAlex', doi: { startsWith: `10.8888/oa.${seed}.` } } });
const dupDois = async (seed: string) => (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from (select doi from "Article" where source = 'OpenAlex' and doi like $1 group by doi having count(*) > 1) t`, `10.8888/oa.${seed}.%`))[0].n;
const jobIds: string[] = [];
const stage = async (name: string, total: number, files: number, seed: string, extra: any = {}) => { await makeSample({ dir: path.join(ROOT, name), total, files, seed, journals: JOURNALS, foreignIssn: FOREIGN, ...extra }); OA.__clearJournalCache(); };
const mkJob = async (o: any) => { const j = await J.createJob({ provider: 'openalex', contentType: 'ARTICLE', ...o }, WHO); jobIds.push(j.id); return j; };
const reload = (id: string) => db.backfillJob.findUnique({ where: { id } });
const finished = (j: any) => ['Completed', 'Failed', 'Cancelled', 'Paused'].includes(j.status);
const work = async (id: string, workerId = 'w-main', max = 60) => { for (let i = 0; i < max; i++) { const r = await W.backfillTick({ workerId }); const j = await reload(id); if (finished(j!) || (!r.ran && r.reason === 'no-job')) return j!; } return (await reload(id))!; };
const previewThenStart = async (o: any) => { const pv = await mkJob({ ...o, dryRun: true }); const done = await work(pv.id); const rl = await mkJob({ ...o, dryRun: false, previewJobId: pv.id }); return { pv: done, real: rl }; };
const goStale = (id: string) => db.backfillJob.update({ where: { id }, data: { heartbeatAt: new Date(Date.now() - 60_000) } });
const cfgOf = (name: string, extra: any = {}) => ({ adapter: { path: name, verifyFiles: true, ...extra } });

const FRAG = process.env.OPENALEX_REAL_FRAGMENT;
let peakRss = 0; const rssTimer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 25); rssTimer.unref();
const rss0 = process.memoryUsage().rss;

try {
  // ═══════════════════════════════════════════════════════════════════════
  section('1. Availability, safe paths, integrity, and what the screen is told');
  delete process.env.OPENALEX_SNAPSHOT_DIR;
  check('with no staged snapshot configured the adapter is listed but NOT available, with the reason (so the screen says no provider is connected)', R.getAdapter('openalex')!.available() !== true && String(R.getAdapter('openalex')!.available()).includes('OPENALEX_SNAPSHOT_DIR') && (await J.overview()).adapters.filter((a: any) => a.available).length === 0 && await rejects(J.createJob({ provider: 'openalex', contentType: 'ARTICLE' }, WHO), 'PROVIDER_UNAVAILABLE'));
  process.env.OPENALEX_SNAPSHOT_DIR = ROOT;
  await stage('a100', 100, 1, `a${RUN}`); await seedHeld(`a${RUN}`, 100);
  check('with one configured, it is available', R.getAdapter('openalex')!.available() === true && (await J.overview()).adapters.find((a: any) => a.id === 'openalex').params.map((p: any) => p.key).join() === 'path,verifyFiles');
  const d = await J.describeSource('openalex', { path: 'a100' });
  check('describe reports the release, the files and the size from the manifest', /Release 2026-10-14 · 1 part file · 100 works/.test(d.summary), d.summary);
  for (const [name, p, code] of [['outside it (..)', '../x', 'BAD_SNAPSHOT_PATH'], ['an absolute path', '/etc', 'BAD_SNAPSHOT_PATH'], ['a folder that does not exist', 'nope', 'SNAPSHOT_NOT_FOUND'], ['a path with a NUL byte', 'a\0b', 'BAD_SNAPSHOT_PATH']] as const) check(`a snapshot folder that is ${name} is refused`, await rejects(J.createJob({ provider: 'openalex', contentType: 'ARTICLE', adapter: { path: p } }, WHO), code));
  fs.symlinkSync('/etc', path.join(ROOT, 'escape'));
  check('a symlink that leaves the staged folder is refused', await rejects(J.createJob({ provider: 'openalex', contentType: 'ARTICLE', adapter: { path: 'escape' } }, WHO), 'BAD_SNAPSHOT_PATH'));
  fs.mkdirSync(path.join(ROOT, 'empty')); check('a folder with no part files is refused', await rejects(J.createJob({ provider: 'openalex', contentType: 'ARTICLE', adapter: { path: 'empty' } }, WHO), 'SNAPSHOT_EMPTY'));
  await stage('damaged', 50, 1, `d${RUN}`); { const f = path.join(ROOT, 'damaged/data/jsonl/works/updated_date=2026-03-01/part_0000.gz'); fs.appendFileSync(f, 'junk'); }
  check('a part file whose size is not the manifest\'s (a partial or damaged copy) is refused', await rejects(J.createJob({ provider: 'openalex', contentType: 'ARTICLE', adapter: { path: 'damaged' } }, WHO), 'SNAPSHOT_INCOMPLETE'));
  check('the reserved content types stay reserved for this adapter too', await rejects(J.createJob({ provider: 'openalex', contentType: 'THESIS', adapter: { path: 'a100' } }, WHO), 'TYPE_RESERVED') && await rejects(J.createJob({ provider: 'openalex', contentType: 'BOOK', adapter: { path: 'a100' } }, WHO), 'TYPE_NOT_SUPPORTED'));

  // ═══════════════════════════════════════════════════════════════════════
  section('2. Test A — about 100 works: parser, identity, rights gate, duplicates, dry run');
  const SA = `a${RUN}`; const catA0 = await catalogue(), cpA0 = await checkpoints();
  const baseA = { ...cfgOf('a100'), accessPreference: 'OAFirst', maxRecords: 500 };
  const dry = await mkJob({ ...baseA, dryRun: true }); const dj = await work(dry.id);
  const eA = oracle(100);
  check('the dry run completed in one chunk and READ every line (scanned 100): 60 relevant, 40 not', dj.status === 'Completed' && dj.chunksCompleted === 1 && (dj.config as any).sourceStats.scanned === 100 && (dj.config as any).sourceStats.notRelevant === 40, { s: dj.status, st: (dj.config as any).sourceStats });
  check('its counters equal the sample\'s documented shape exactly (published / review / refused / duplicates split)', same(rowsOf(dj), expRows(eA)), { got: rowsOf(dj), want: expRows(eA) });
  check('the dry run wrote NOTHING (no article, journal, book, publisher or run-log row)', same(await catalogue(), catA0) && (await oaRows(SA)).length === 0);
  check('duplicates are split: unchanged / enriched / conflicting (and none of the held rows was filled by the dry run)', dj.recordsDuplicate === eA.duplicate && dj.recordsEnriched === eA.enriched && dj.recordsDuplicateConflicting === eA.conflicting && eA.enriched === 4 && eA.conflicting === 3 && J.serializeJob(dj).records.unchangedDuplicate === eA.duplicate - eA.enriched - eA.conflicting && (await db.article.count({ where: { id: { in: heldIds }, volume: null } })) === eA.enriched, rowsOf(dj));
  const pv: any = dj.preview;
  check('the preview names the retraction, the old year and the conflicts as reasons, within its caps', pv.samples.length <= 25 && pv.issues.length <= 25 && pv.issues.some((i: any) => /retracted/.test(i.reason)) && pv.issues.some((i: any) => i.kind === 'conflict') && pv.issues.some((i: any) => /before the article policy year/.test(i.reason)), pv.issues.map((i: any) => i.reason).slice(0, 6));
  check('the job carries the snapshot identity it was created against', typeof (dj.config as any).identity === 'string' && (dj.config as any).identity.length === 24);

  const realA = await mkJob({ ...baseA, dryRun: false, previewJobId: dry.id }); const rj = await work(realA.id);
  const rowsA = await oaRows(SA);
  console.log(`  [info] Test A (100 works): scanned ${(dj.config as any).sourceStats.scanned}, relevant ${dj.recordsFetched}, published ${dj.recordsPublished}, review ${dj.recordsReview}, refused ${dj.recordsRefused}, duplicates ${dj.recordsDuplicate} (enriched ${dj.recordsEnriched}, conflicting ${dj.recordsDuplicateConflicting}), failed ${dj.recordsFailed}; dry run ${Math.round((dj.config as any).activeMs)} ms, real run ${Math.round(((await reload(realA.id))!.config as any).activeMs)} ms\n`);
  check('the real run reproduces the dry run\'s counters exactly', rj.status === 'Completed' && same(rowsOf(rj), expRows(eA)) && (rj.config as any).finishedBecause === 'end of data', { got: rowsOf(rj) });
  check('the catalogue gained exactly published + review rows, no duplicate, all from OpenAlex with the work\'s own id', rowsA.length === eA.published + eA.review && (await dupDois(SA)) === 0 && rowsA.every(r => r.source === 'OpenAlex' && /^https:\/\/openalex\.org\/W\d+$/.test(r.sourceRecordId || '')));
  check('every row says which backfill job wrote it', rowsA.every(r => r.createdBy === `Backfill:${realA.id}`));
  check('published ones are Published, review ones are Drafts', rowsA.filter(r => r.status === 'Published').length === eA.published && rowsA.filter(r => r.status === 'Draft').length === eA.review);
  check('every article belongs to one of OUR journals, takes its department, and no journal was created', rowsA.every(r => JOURNALS.some(j => j.issn === r.journalIssn) && r.domain === 'Computer / IT') && (await catalogue()).journals === catA0.journals);
  const viewable = rowsA.filter(r => r.accessStatus === 'ViewableHere');
  check('RIGHTS: a file is offered only where a licence allows it AND the file really opens; a "bad-" file is never offered', viewable.every(r => !/bad-/.test(r.pdfUrl || '') && !!r.licence) && rowsA.filter(r => /bad-/.test(r.pdfUrl || '')).every(r => r.accessStatus === 'LinkOnly') && viewable.length > 0, { viewable: viewable.length });
  check('RIGHTS: nothing without a verifiable open licence was published under "open access first"', rowsA.filter(r => r.status === 'Published').every(r => r.licence || JOURNALS[Math.floor(Number(r.title.split(' ').pop()) / 4) % 4] !== JOURNALS[3]));
  const enr = await db.article.findMany({ where: { id: { in: heldIds } } }); const idx = (a: any) => Number(a.title.split(' ').pop());
  check('held duplicates were completed ONLY in their empty field (volume), and a conflicting one was left exactly as it was', enr.filter(a => dupKind(idx(a)) === 'enriched').every(a => a.volume === '12') && enr.filter(a => dupKind(idx(a)) === 'conflicting').every(a => a.licence === 'CC BY' && a.volume === (idx(a) % 3 === 0 ? '12' : null)) && enr.every(a => a.licence === 'CC BY' && a.status === 'Published'));
  check('the real run wrote no run-log row, and the continuous engine\'s checkpoints (every journal\'s OpenAlex cursor included) are byte-identical', (await catalogue()).runs === catA0.runs && same(await checkpoints(), cpA0));

  const catA1 = await catalogue();
  const again = await previewThenStart({ ...baseA }); const aj = await work(again.real.id);
  check('IDEMPOTENT: the same configuration again creates NO catalogue row; every non-refused relevant work is now a duplicate (published 0, review 0)', same(await catalogue(), catA1) && aj.recordsPublished === 0 && aj.recordsReview === 0 && aj.recordsDuplicate === eA.fetched - eA.refused && aj.recordsRefused === eA.refused, rowsOf(aj));
  // metadata-only path: with verifyFiles off nothing is ever offered as a file
  await stage('a100b', 100, 1, `b${RUN}`); const { real: rb } = await previewThenStart({ ...cfgOf('a100b', { verifyFiles: false }), accessPreference: 'MetadataOnlyAllowed', maxRecords: 500 }); await work(rb.id);
  const rowsB = await oaRows(`b${RUN}`);
  const eBm = oracle(100, 'MetadataOnlyAllowed', false); const rbj = (await reload(rb.id))!;
  check('verifyFiles OFF: no record is offered as a file (every row is a link); "metadata only allowed" publishes what the rules allow and sends only what they hold back to review', rowsB.length === eBm.published + eBm.review && rowsB.every(r => r.accessStatus !== 'ViewableHere') && same(rowsOf(rbj), expRows(eBm)), { got: rowsOf(rbj), want: expRows(eBm), rows: rowsB.length });

  // ═══════════════════════════════════════════════════════════════════════
  section('2b. Identity: a work WITHOUT a DOI is held by its stable OpenAlex id, not only by title + year');
  const SN0 = `n${RUN}`; await stage('nd100', 100, 1, SN0, { noDoi: true });
  const nd = { ...cfgOf('nd100', { verifyFiles: false }), accessPreference: 'MetadataOnlyAllowed', maxRecords: 500 };
  const { real: rN1 } = await previewThenStart(nd); const n1 = await work(rN1.id);
  const ndRows = await db.article.findMany({ where: { createdBy: `Backfill:${rN1.id}` } });
  check('works without a DOI are written with the OpenAlex work id durably in Article.sourceRecordId (source "OpenAlex") and a title+year fingerprint, and no DOI', ndRows.length === n1.recordsPublished + n1.recordsReview && ndRows.length > 20 && ndRows.every(r => r.doi === null && r.source === 'OpenAlex' && /^https:\/\/openalex\.org\/W\d+$/.test(r.sourceRecordId || '') && /^t:/.test(r.fingerprint || '')), { n: ndRows.length, sample: ndRows[0] && { doi: ndRows[0].doi, id: ndRows[0].sourceRecordId, fp: ndRows[0].fingerprint } });
  // Defeat the title+year path: the rows are renamed and their fingerprints changed, so only the OpenAlex id can still say "already held".
  await db.$executeRawUnsafe(`update "Article" set title = 'RENAMED ' || id, fingerprint = 'renamed:' || id where "createdBy" = $1`, `Backfill:${rN1.id}`);
  const catN = await catalogue(); const { real: rN2 } = await previewThenStart(nd); const n2 = await work(rN2.id);
  check('a later run (a new job, as after a restart) finds every one of them again BY THE OPENALEX ID alone — no new row, all duplicates', same(await catalogue(), catN) && n2.recordsPublished === 0 && n2.recordsReview === 0 && n2.recordsDuplicate === ndRows.length, { dup: n2.recordsDuplicate, want: ndRows.length, rows: rowsOf(n2) });
  // Control: remove the id as well, and the same works are no longer recognised (so it really was the id that protected them).
  await db.$executeRawUnsafe(`update "Article" set "sourceRecordId" = null where "createdBy" = $1`, `Backfill:${rN1.id}`);
  const { real: rN3 } = await previewThenStart(nd); const n3 = await work(rN3.id);
  check('CONTROL: with the id removed too, the same works are written again as new rows — the id is what held them', n3.recordsPublished + n3.recordsReview === ndRows.length, rowsOf(n3));
  const dedupeFile = fs.readFileSync(new URL('../src/lib/ingestion/dedup.ts', import.meta.url), 'utf8');
  check('the path that reads it: findHeldArticles matches on (source, sourceRecordId) and reports it as via "sourceRecordId"', /where: \{ source, sourceRecordId: \{ in: part \}/.test(dedupeFile) && /via: 'sourceRecordId'/.test(dedupeFile));

  // ═══════════════════════════════════════════════════════════════════════
  section('3. Test B — 1,000 works over 3 files: streaming, checkpoint, pause, cancel, kill, counters');
  const SB = `k${RUN}`; await stage('k1000', 1000, 3, SB); await seedHeld(SB, 1000);
  const bB = { ...cfgOf('k1000'), accessPreference: 'OAFirst', maxRecords: 2000 }; const eB = oracle(1000);
  const { pv: pvB, real: realB } = await previewThenStart(bB);
  check('the dry run over 3 files completed with counters equal to the shape, and scanned exactly 1,000 lines', pvB.status === 'Completed' && same(rowsOf(pvB), expRows(eB)) && (pvB.config as any).sourceStats.scanned === 1000, { got: rowsOf(pvB), st: (pvB.config as any).sourceStats });
  await W.backfillTick({ workerId: 'w-b' }); let mB = (await reload(realB.id))!; const cur1 = JSON.parse(mB.cursor!);
  check('the checkpoint is {snapshot identity, file index, lines consumed}: after the first chunk it is inside file 0', mB.chunksCompleted === 1 && cur1.v === 1 && cur1.id === (mB.config as any).identity && cur1.f === 0 && cur1.n > 0 && cur1.n < 400, mB.cursor);
  await J.controlJob(realB.id, 'pause', WHO); await W.backfillTick({ workerId: 'w-b' });
  mB = (await reload(realB.id))!; const savedCursor = mB.cursor;
  check('paused at a chunk boundary with its checkpoint saved', mB.status === 'Paused' && mB.inflight === null && mB.recordsFetched === 100);
  const cpDuring = await checkpoints();
  await J.controlJob(realB.id, 'resume', WHO); const fB = await work(realB.id, 'w-b');
  console.log(`  [info] Test B (1,000 works, 3 files): scanned ${(fB.config as any).sourceStats.scanned}, relevant ${fB.recordsFetched}, published ${fB.recordsPublished}, review ${fB.recordsReview}, refused ${fB.recordsRefused}, duplicates ${fB.recordsDuplicate} (enriched ${fB.recordsEnriched}, conflicting ${fB.recordsDuplicateConflicting}), failed ${fB.recordsFailed}; ${fB.chunksCompleted} chunks, ${Math.round((fB.config as any).activeMs)} ms of working time, ${(Number(fB.bytesProcessed) / 1048576).toFixed(1)} MB of source lines`);
  check('resume continues from that checkpoint and finishes: counters equal the shape exactly, scanned 1,000 (no line counted twice)', fB.status === 'Completed' && same(rowsOf(fB), expRows(eB)) && (fB.config as any).sourceStats.scanned === 1000 && (fB.config as any).sourceStats.notRelevant === eB.notRelevant, { got: rowsOf(fB), st: (fB.config as any).sourceStats });
  const endCur = fB.cursor ? JSON.parse(fB.cursor) : null;
  check('it crossed from file 0 to file 1 to file 2 and finished at the END of data (the last checkpoint is the end of the last file, or null), with no duplicate rows', (fB.config as any).finishedBecause === 'end of data' && (endCur === null || (endCur.f === 2 && endCur.n === 332)) && (await dupDois(SB)) === 0 && (await oaRows(SB)).length === eB.published + eB.review, fB.cursor);
  check('continuous-engine checkpoints did not move while pausing, resuming and finishing', same(cpDuring, await checkpoints()) && same(await checkpoints(), BEFORE_CP));

  // cancel mid-way keeps what was imported
  const SC = `c${RUN}`; await stage('c1000', 1000, 3, SC); await seedHeld(SC, 1000);
  const { real: realC } = await previewThenStart({ ...cfgOf('c1000'), accessPreference: 'OAFirst', maxRecords: 2000 });
  await W.backfillTick({ workerId: 'w-c' }); await W.backfillTick({ workerId: 'w-c' }); await J.controlJob(realC.id, 'cancel', WHO); await W.backfillTick({ workerId: 'w-c' });
  const cC = (await reload(realC.id))!; const keptC = (await oaRows(SC)).length;
  check('cancel stops at a chunk boundary and DELETES NOTHING already imported', cC.status === 'Cancelled' && cC.chunksCompleted === 2 && keptC > 0 && keptC === cC.recordsPublished + cC.recordsReview);
  await W.backfillTick({ workerId: 'w-c' }); check('…and no further work happens', (await reload(realC.id))!.chunksCompleted === 2 && (await oaRows(SC)).length === keptC);

  // real kill, mid-apply, in another process
  const SK = `x${RUN}`; await stage('x1000', 1000, 3, SK); await seedHeld(SK, 1000);
  const { real: realK } = await previewThenStart({ ...cfgOf('x1000', { verifyFiles: false }), accessPreference: 'OAFirst', maxRecords: 2000 });
  const child = spawn('npx', ['tsx', 'scripts/backfill-worker-child.ts', 'child-oa'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: TEST_URL, BACKFILL_TEST_CRASH: 'mid-apply:40' }, stdio: 'ignore' });
  const exit: any = await new Promise(res => child.on('exit', (code, signal) => res({ code, signal })));
  const kd = (await reload(realK.id))!;
  check('SIGKILL mid-apply (40 written): the process really died, the job is Running under the dead worker with its plan, counters still 0', (exit.signal === 'SIGKILL' || exit.code === 137) && kd.status === 'Running' && kd.claimedBy === 'child-oa' && !!kd.inflight && kd.recordsFetched === 0 && (await oaRows(SK)).length === 40, { exit, rows: (await oaRows(SK)).length });
  const inf: any = kd.inflight;
  check('…the plan holds the OpenAlex ids and one-letter outcomes only (no work, no title), and the page\'s resume position', inf.planned.every((p: any) => /^https:\/\/openalex\.org\/W\d+$/.test(p[0]) && /^[PRHUECXF]$/.test(p[1])) && !JSON.stringify(inf).includes('OpenAlex sample') && inf.expectedCursorAfter && JSON.parse(inf.expectedCursorAfter).id === (kd.config as any).identity && inf.meta.scanned > 0);
  await sleep(3300); const fK = await work(realK.id, 'w-recover');
  check('another process recovers it: the same page is verified, the 40 written are found, the counters equal an uninterrupted run, scanned counted ONCE, no duplicate rows', fK.status === 'Completed' && same(rowsOf(fK), expRows(eB)) && (fK.config as any).sourceStats.scanned === 1000 && (await dupDois(SK)) === 0 && (await oaRows(SK)).length === eB.published + eB.review, { got: rowsOf(fK), st: (fK.config as any).sourceStats });
  // in-process crash at each of the other points, on the multi-file sample
  for (const [point, key] of [['after-inflight', 'p'], ['after-apply', 'q']] as const) {
    const S2 = `${key}${RUN}`; await stage(`${key}1000`, 1000, 3, S2); await seedHeld(S2, 1000);
    const { real } = await previewThenStart({ ...cfgOf(`${key}1000`, { verifyFiles: false }), accessPreference: 'OAFirst', maxRecords: 2000 });
    H.__setCrash(point); try { await W.backfillTick({ workerId: 'w-dead' }); } catch { /* simulated */ }
    await goStale(real.id); const j = await work(real.id, 'w-recover');
    check(`crash ${point}: recovered with exact counters and scanned counted once`, j.status === 'Completed' && same(rowsOf(j), expRows(eB)) && (j.config as any).sourceStats.scanned === 1000 && (await dupDois(S2)) === 0, rowsOf(j));
  }

  // ═══════════════════════════════════════════════════════════════════════
  section('4. A snapshot that changes under a job');
  const SD = `s${RUN}`; await stage('s1000', 1000, 3, SD); await seedHeld(SD, 1000);
  const cfgS = { ...cfgOf('s1000', { verifyFiles: false }), accessPreference: 'OAFirst', maxRecords: 2000 };
  const pvS = await mkJob({ ...cfgS, dryRun: true }); await work(pvS.id);
  const mfPath = path.join(ROOT, 's1000/data/jsonl/works/manifest.json'); const mfText = fs.readFileSync(mfPath, 'utf8');
  fs.writeFileSync(mfPath, mfText.replace('"2026-10-14"', '"2027-01-13"'));
  check('a NEW release staged since the preview: a real start is refused (SOURCE_CHANGED_SINCE_PREVIEW) — run the preview again', await rejects(J.createJob({ provider: 'openalex', contentType: 'ARTICLE', ...cfgS, dryRun: false, previewJobId: pvS.id }, WHO), 'SOURCE_CHANGED_SINCE_PREVIEW'));
  fs.writeFileSync(mfPath, mfText);
  const realS = await mkJob({ ...cfgS, dryRun: false, previewJobId: pvS.id });
  await W.backfillTick({ workerId: 'w-s' }); await J.controlJob(realS.id, 'pause', WHO); await W.backfillTick({ workerId: 'w-s' });
  const beforeS = (await reload(realS.id))!; const rowsS = (await oaRows(SD)).length;
  check('the job is paused part-way with a checkpoint', beforeS.status === 'Paused' && beforeS.chunksCompleted === 1 && !!beforeS.cursor);
  fs.writeFileSync(mfPath, mfText.replace('"2026-10-14"', '"2027-01-13"'));                  // a different release is staged while it is paused
  await J.controlJob(realS.id, 'resume', WHO); await W.backfillTick({ workerId: 'w-s' });
  const afterS = (await reload(realS.id))!;
  check('on resume it STOPS: Failed with OPENALEX_SNAPSHOT_CHANGED, saying what happened', afterS.status === 'Failed' && String(afterS.lastError).startsWith('OPENALEX_SNAPSHOT_CHANGED'), afterS.lastError);
  check('…the checkpoint was NOT reset, nothing was written, no counter moved', afterS.cursor === beforeS.cursor && afterS.recordsFetched === beforeS.recordsFetched && (await oaRows(SD)).length === rowsS && afterS.chunksCompleted === 1);
  check('…and it is not retried (a person starts a new job with a new preview)', (await W.backfillTick({ workerId: 'w-s' })).reason === 'no-job');
  fs.writeFileSync(mfPath, mfText);
  // a part file altered in place (same release): the size no longer matches the manifest
  const SD2 = `t${RUN}`; await stage('t1000', 1000, 3, SD2);
  const { real: realT } = await previewThenStart({ ...cfgOf('t1000', { verifyFiles: false }), accessPreference: 'OAFirst', maxRecords: 2000 });
  await W.backfillTick({ workerId: 'w-t' }); await J.controlJob(realT.id, 'pause', WHO); await W.backfillTick({ workerId: 'w-t' });
  fs.appendFileSync(path.join(ROOT, 't1000/data/jsonl/works/updated_date=2026-03-02/part_0000.gz'), 'x');
  await J.controlJob(realT.id, 'resume', WHO); await W.backfillTick({ workerId: 'w-t' });
  const tj = (await reload(realT.id))!;
  check('a part file changed under a paused job (size no longer the manifest\'s): stopped the same way, cursor kept', tj.status === 'Failed' && String(tj.lastError).startsWith('OPENALEX_SNAPSHOT_CHANGED') && tj.chunksCompleted === 1);

  // ═══════════════════════════════════════════════════════════════════════
  section('5. Streaming and memory on a large file (no database, no job)');
  const big = path.join(ROOT, 'big'); const BIGN = 120_000;
  const tg = Date.now(); await makeSample({ dir: big, total: BIGN, files: 1, seed: 'big', journals: JOURNALS, foreignIssn: FOREIGN, padBytes: 700, extraLines: () => ['{"id":"https://openalex.org/Wtoolong","title":"' + 'x'.repeat(6 * 1024 * 1024) + '"}'] });
  const bigFile = path.join(big, 'data/jsonl/works/updated_date=2026-03-01/part_0000.gz'); const bigGz = fs.statSync(bigFile).size;
  const snap = SN.locate('big'); OA.__clearJournalCache();
  console.log(`  [info] staged ${BIGN.toLocaleString()} works (+ one 6 MB line): ${mb(bigGz)} MB compressed, generated in ${Math.round((Date.now() - tg) / 1000)} s`);
  global.gc?.(); const base = process.memoryUsage().rss; let peak = base; const t2 = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 10);
  const job: any = { id: 'x', provider: 'openalex', contentType: 'ARTICLE', dryRun: true, createdAt: new Date(), identity: null, windowStart: null, windowEnd: null, departments: [], accessPreference: 'OAFirst', maxRecords: 100, adapter: { path: 'big' } };
  const t0 = Date.now();
  const p1 = await OA.openalexAdapter.fetchPage(job, null, 100);
  const tFirst = Date.now() - t0;
  const deep = JSON.stringify({ v: 1, id: snap.identity, f: 0, n: 100_000 });
  const t1 = Date.now(); const p2 = await OA.openalexAdapter.fetchPage(job, deep, 100); const tDeep = Date.now() - t1;
  const t3 = Date.now(); const p3 = await OA.openalexAdapter.fetchPage(job, p2.nextCursor, 100); const tNext = Date.now() - t3;
  clearInterval(t2); SN.closeReaders();
  console.log(`  [info] first page ${tFirst} ms · cold resume at line 100,000 ${tDeep} ms (skips without parsing) · the next page on the open reader ${tNext} ms · peak RSS growth ${mb(peak - base)} MB`);
  check('the 6 MB line was counted and discarded, not loaded (tooLong 1) and the first page still filled', p1.meta!.tooLong === 1 && p1.records.length === 100 && p1.bytes > 6 * 1024 * 1024);
  check('a cold resume at line 100,000 reads from the checkpoint and returns a full page; the following page continues on the open reader without re-skipping', p2.records.length === 100 && p3.records.length === 100 && tNext < Math.max(300, tDeep / 5), { tDeep, tNext });
  check(`MEMORY: streaming a ${BIGN.toLocaleString()}-work file (~${mb(BIGN * 1000)} MB uncompressed) grew the process by under 80 MB (peak ${mb(peak - base)} MB)`, peak - base < 80 * 1048576, mb(peak - base));
  check('the cursor of the deep page points past it (file 0, line > 100,000) and is a bounded string', JSON.parse(p2.nextCursor!).n > 100_000 && p2.nextCursor!.length < 200);

  // ═══════════════════════════════════════════════════════════════════════
    if (FRAG && fs.existsSync(FRAG)) {
    section('6. Test C — a REAL OpenAlex fragment (two real partitions, read from disk)');
    const name = path.basename(FRAG); fs.cpSync(FRAG, path.join(ROOT, name), { recursive: true });      // staged by COPYING into the staged folder (a symlink out of it is refused, see section 1)
    // our journals for the fragment: the most frequent real journal ISSNs in it, as Accepted DOAJ-declared journals (test rows, removed at the end)
    const freq = new Map<string, { n: number; title: string }>(); const zlib = await import('node:zlib');
    for (const d of fs.readdirSync(path.join(FRAG, 'data/jsonl/works')).filter(x => x.startsWith('updated_date='))) for (const line of zlib.gunzipSync(fs.readFileSync(path.join(FRAG, 'data/jsonl/works', d, 'part_0000.gz'))).toString('utf8').split('\n')) {
      if (!line) continue; const w = JSON.parse(line); const s = w.primary_location?.source; if (w.type === 'article' && s?.type === 'journal' && w.open_access?.is_oa && s.issn_l) { const k = s.issn_l; const e = freq.get(k) ?? { n: 0, title: s.display_name }; e.n++; freq.set(k, e); }
    }
    const top = [...freq.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    for (const [issn, e] of top) await db.journal.create({ data: { title: `OAR ${RUN} ${e.title}`.slice(0, 200), issn, status: 'Accepted', rightsBasis: 'DOAJ declaration', licenceIsNC: false, domain: 'Computer / IT' } }).catch(() => {});
    await sleep(30); OA.__clearJournalCache();
    const realFrag = { ...cfgOf(name, { verifyFiles: false }), accessPreference: 'OAFirst', maxRecords: 2000 };
    const d0 = await J.describeSource('openalex', { path: name });
    const catC0 = await catalogue();
    const { pv: pvC, real: rC } = await previewThenStart(realFrag);
    const st = (pvC.config as any).sourceStats;
    console.log(`  [info] ${d0.summary}`);
    console.log(`  [info] real works scanned ${st.scanned}; relevant (open-access journal articles in the ${top.length} journals we hold) ${pvC.recordsFetched}; not relevant ${st.notRelevant}; unparseable ${st.unparseable}`);
    check('the dry run read every real line (1,851) and wrote nothing', pvC.status === 'Completed' && st.scanned === 1851 && same(await catalogue(), catC0), { st });
    const jC = await work(rC.id);
    const rowsC = await db.article.findMany({ where: { createdBy: `Backfill:${rC.id}` } });
    console.log(`  [info] real run: fetched ${jC.recordsFetched} · published ${jC.recordsPublished} · review ${jC.recordsReview} · refused ${jC.recordsRefused} · duplicates ${jC.recordsDuplicate} (enriched ${jC.recordsEnriched}, conflicting ${jC.recordsDuplicateConflicting}) · failed ${jC.recordsFailed}`);
    console.log(`  [info] ${rowsC.filter(r => !r.doi).length} of the ${rowsC.length} written real rows have no DOI (they dedupe by OpenAlex id and title + year, as before)`);
    check('the real run equals the real dry run, and every written row came from a REAL OpenAlex work in one of our journals', jC.status === 'Completed' && same(rowsOf(jC), rowsOf(pvC)) && rowsC.length === jC.recordsPublished + jC.recordsReview && rowsC.every(r => /^https:\/\/openalex\.org\/W\d+$/.test(r.sourceRecordId || '') && r.source === 'OpenAlex' && r.createdBy === `Backfill:${rC.id}`));
    check('RIGHTS (real data): nothing is ViewableHere (files not checked), and nothing was published whose licence is not an open one or whose journal does not declare one', rowsC.every(r => r.accessStatus !== 'ViewableHere') && rowsC.filter(r => r.status === 'Published').every(r => !r.licence || /^cc|^public/i.test(r.licence)));
    const catC1 = await catalogue();
    const { real: r2 } = await previewThenStart(realFrag); const j2 = await work(r2.id);
    check('IDEMPOTENT on real data: running it again creates no row; everything relevant that was written is now a duplicate', same(await catalogue(), catC1) && j2.recordsPublished === 0 && j2.recordsReview === 0, rowsOf(j2));
    check('real data did not move any continuous-engine checkpoint', same(await checkpoints(), BEFORE_CP));
  } else console.log('\n6. Test C (real fragment): skipped — OPENALEX_REAL_FRAGMENT not set');

  section('7. Nothing else moved');
  const AFTER_CAT = await catalogue(), AFTER_CP = await checkpoints();
  check('every continuous-engine checkpoint is byte-identical to before this suite: book harvest, sweeps, every journal\'s cursor and cooldown, engine settings and rotation, provider health', same(BEFORE_CP, AFTER_CP), { BEFORE_CP, AFTER_CP });
  check('no journal and no book was created by any backfill: the only new journals are the 4 test journals (+ the real-fragment test journals this suite made itself), and the only new publisher is the writer\'s own "Discovered" row for the sample\'s publisher name', AFTER_CAT.books === BEFORE_CAT.books && AFTER_CAT.journals === BEFORE_CAT.journals + 4 + (FRAG && fs.existsSync(FRAG) ? await db.journal.count({ where: { title: { startsWith: `OAR ${RUN}` } } }) : 0) && AFTER_CAT.publishers <= BEFORE_CAT.publishers + (FRAG && fs.existsSync(FRAG) ? 20 : 1), { BEFORE_CAT, AFTER_CAT });
  clearInterval(rssTimer);
  console.log(`\n  memory over the whole suite (1,000-work runs, kills, recoveries): start RSS ${mb(rss0)} MB, peak ${mb(peakRss)} MB (growth ${mb(peakRss - rss0)} MB)`);
  console.log(`  catalogue before : ${JSON.stringify(BEFORE_CAT)}\n  catalogue after  : ${JSON.stringify(AFTER_CAT)}   (differs by this suite's test journals and OpenAlex test rows, removed next)`);
} catch (e: any) {
  fail++; console.log('  FAIL  the suite crashed:', e?.stack || e);
} finally {
  clearInterval(rssTimer); SN.closeReaders();
  await db.article.deleteMany({ where: { OR: [{ source: 'BackfillTest' }, { createdBy: { startsWith: 'Backfill:' }, source: 'OpenAlex', doi: { startsWith: '10.8888/oa.' } }, { createdBy: { in: jobIds.map(i => `Backfill:${i}`) } }] } });
  await db.backfillJob.deleteMany({ where: { createdBy: WHO.email } });
  await db.publisher.deleteMany({ where: { source: 'OpenAlex', tieUpStatus: 'Discovered', createdAt: { gte: SUITE_START } } });      // the writer's own "Discovered" publisher rows (the sample's, and the real fragment's publishers)
  await db.journal.deleteMany({ where: { OR: [{ title: { startsWith: `OA test journal ${RUN}` } }, { title: { startsWith: `OAR ${RUN}` } }] } });
  const AFTER_CLEAN = await catalogue();
  console.log(`  catalogue cleaned: ${JSON.stringify(AFTER_CLEAN)}`);
  check('after cleanup the catalogue is exactly as it was before the suite', same(BEFORE_CAT, AFTER_CLEAN), { BEFORE_CAT, AFTER_CLEAN });
  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
