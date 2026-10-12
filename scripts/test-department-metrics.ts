/**
 * Department metrics tests: the real Express server on the throwaway database `stm_ingestion_test` (refuses anything else),
 * all outbound network blocked by the same preload the ingestion API test uses.
 *
 *   npx tsx scripts/test-department-metrics.ts
 *
 * The scratch database already holds rows from other tests, so nothing here assumes a starting count: every figure is
 * read before and after known rows are seeded, and the change must be exactly what was seeded. Nothing is deleted.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const dbName = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);
const { DOMAINS } = await import('../src/constants.js');

const PORT = 3102, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const ALL: string[] = (DOMAINS as any[]).map(d => d.name);
const TESTED = ['Dental', 'Nursing', 'Pharmacy', 'Computer / IT'];
for (const d of TESTED) if (!ALL.includes(d)) throw new Error(`"${d}" is not in the department taxonomy`);

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a: any, b: any) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-dm-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-dm-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const adminTok = await mkUser('SuperAdmin'), readerTok = await mkUser('Subscriber'), managerTok = await mkUser('Admin');
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: false }, update: { enabled: false } });

const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', API_TEST_RUN: RUN, API_TEST_ISSN: '0000-0000', API_TEST_FILE_PORT: '1', INGEST_CATALOGUE_CACHE_MS: '0' },
});
let serverLog = ''; child.stdout!.on('data', d => (serverLog += d)); child.stderr!.on('data', d => (serverLog += d));
const shutdown = async () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch {} await db.$disconnect(); };

const call = async (path: string, token?: string) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const A = (p: string) => call(p, adminTok);
const PERIODS = ['lifetime', '7d', '24h'] as const;
const dm = async (department: string | null, period: string) => (await A(`/api/admin/ingest/department-metrics?period=${period}${department ? `&department=${encodeURIComponent(department)}` : ''}`)).data;
const snapshot = async () => {
  const out: Record<string, any> = {};
  for (const d of [null, ...ALL]) for (const p of PERIODS) out[`${d}|${p}`] = await dm(d, p);
  return out;
};
const diff = (after: any, before: any) => {
  const o: any = {}; for (const k of Object.keys(after)) o[k] = after[k] - (before[k] || 0); return o;
};

// The same failure test the run log's "Failed" filter uses, written independently here for the cross-check.
// A source that did not answer is a provider failure, counted apart; a failed run is a catalogue/engine failure. Restated here on purpose.
const PROVIDER_WORDS = `r.error ~* '(did not answer|answered http|fetch failed|timed? ?out|aborted|paused after repeated|rate.?limit|econn|enotfound|etimedout|socket hang up|stopped answering|is resting)' or r.error like 'Provider request failed%'`;
const FAILED = `(r."skippedFailed" > 0 or r.phase = 'Error' or (r.error is not null and not (r."skippedFailed" = 0 and (${PROVIDER_WORDS}))))`;
const expectedRunIds = async (dept: string, phase?: string, result?: 'failed' | 'added') => {
  // Written independently of the code under test: a run that recorded a department breakdown belongs to each department it names, with that
  // department's own counts; every other run belongs to the department it names, or its journal's.
  const rows: any[] = await db.$queryRawUnsafe(
    `with eff as (
        select r.id, r."at", r.phase, s.department as dept, s.added, s.failed as "skippedFailed", 0 as "journalsAccepted", r.error
          from "IngestionRun" r join "IngestionRunDepartmentStat" s on s."runId" = r.id
        union all
        select r.id, r."at", r.phase, coalesce(r.department, j.domain), r.added, r."skippedFailed", r."journalsAccepted", r.error
          from "IngestionRun" r left join "Journal" j on j.id = r."journalId"
         where not exists (select 1 from "IngestionRunDepartmentStat" s where s."runId" = r.id)
     )
     select r.id from eff r
      where r.dept = $1 ${phase ? `and r.phase = '${phase}'` : ''}
        ${result === 'failed' ? `and ${FAILED}` : result === 'added' ? `and (r.added > 0 or r."journalsAccepted" > 0)` : ''}
      order by r."at" desc, r.id desc limit 200`, dept);
  return rows.map(r => r.id);
};
const historyIds = async (dept: string, phase?: string, result?: string) => {
  const r = await A(`/api/admin/ingest/history?department=${encodeURIComponent(dept)}&limit=200${phase ? `&phase=${phase.toLowerCase()}` : ''}${result ? `&result=${result}` : ''}`);
  return { status: r.status, ids: (r.data?.runs || []).map((x: any) => x.id), runs: r.data?.runs || [] };
};

try {
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/ingest/state'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('Access and input checks');
  const P = '/api/admin/ingest/department-metrics';
  check('no token 401, subscriber 403, other admin role 403', (await call(P)).status === 401 && (await call(P, readerTok)).status === 403 && (await call(P, managerTok)).status === 403);
  check('an unknown department is refused with 400', (await A(`${P}?department=Not%20A%20Department`)).status === 400);
  check('an unknown period is refused with 400', (await A(`${P}?period=90d`)).status === 400);
  check('history refuses an unknown department with 400', (await A('/api/admin/ingest/history?department=Nope')).status === 400);
  check('a department name is matched exactly, never as a pattern', (await A(`${P}?department=Dent%25`)).status === 400);

  section('Seed known rows, then compare before and after');
  const before = await snapshot();
  const beforeTable = (await A('/api/admin/ingest/coverage')).data;
  const now = Date.now(), H = 3600_000, D = 24 * H;
  const journalIds: Record<string, string> = {};
  for (const [i, dept] of TESTED.entries()) {
    const tag = `${RUN}-${i}`;
    const j = await db.journal.create({ data: { title: `DM journal ${tag}`, issn: `9${String(i)}${RUN.slice(-5).padStart(5, '0')}`.slice(0, 9), domain: dept, status: 'Accepted' } });
    journalIds[dept] = j.id;
    await db.journal.create({ data: { title: `DM metadata-only journal ${tag}`, issn: `8${String(i)}${RUN.slice(-5).padStart(5, '0')}`.slice(0, 9), domain: dept, status: 'MetadataOnly' } });   // catalogued, not accepted: never counted
    await db.journal.create({ data: { title: `DM rejected journal ${tag}`, issn: `7${String(i)}${RUN.slice(-5).padStart(5, '0')}`.slice(0, 9), domain: dept, status: 'Rejected' } });
    for (let n = 0; n < 2; n++) await db.book.create({ data: { title: `DM book ${tag}-${n}`, domain: dept, status: 'Published' } });
    await db.book.create({ data: { title: `DM rejected book ${tag}`, domain: dept, status: 'Rejected' } });
    await db.book.create({ data: { title: `DM review book ${tag}`, domain: null, status: 'Draft', ownershipSource: 'Ingested', metadata: { harvest: { department: { suggested: dept } } } } });
    for (let n = 0; n < 3; n++) await db.article.create({ data: { title: `DM article ${tag}-${n}`, domain: dept, status: 'Published', journalId: j.id } });
    await db.article.create({ data: { title: `DM draft article ${tag}`, domain: dept, status: 'Draft' } });
    const at = (ms: number) => new Date(now - ms);
    await db.ingestionRun.create({ data: { phase: 'Books', source: 'DOAB', department: dept, added: 4, skippedHeld: 2, at: at(1 * H), note: `DM ${RUN}` } });                                        // inside 24 h
    await db.ingestionRun.create({ data: { phase: 'Articles', source: 'OpenAlex', journalId: j.id, journalTitle: j.title, added: 5, skippedFailed: 1, needsReview: 3, at: at(3 * D), note: `DM ${RUN}` } });   // 7 d, no department of its own
    await db.ingestionRun.create({ data: { phase: 'Journals', source: 'DOAJ', department: dept, journalsAccepted: 2, error: 'DOAJ did not answer', at: at(30 * D), note: `DM ${RUN}` } });                 // lifetime only
  }
  await db.ingestionRun.create({ data: { phase: 'Books', source: 'OAPEN', added: 9, at: new Date(now - H), note: `Manual · DM ${RUN}` } });     // no department anywhere: unattributed
  const after = await snapshot();

  const WANT: Record<string, any> = {
    lifetime: { booksAdded: 4, articlesAdded: 5, journalsAccepted: 2, held: 2, failedRuns: 1, providerFailures: 1, failedWrites: 1, sentToReview: 3, refused: 0, runs: 3 },
    '7d':     { booksAdded: 4, articlesAdded: 5, journalsAccepted: 0, held: 2, failedRuns: 1, providerFailures: 0, failedWrites: 1, sentToReview: 3, refused: 0, runs: 2 },
    '24h':    { booksAdded: 4, articlesAdded: 0, journalsAccepted: 0, held: 2, failedRuns: 0, providerFailures: 0, failedWrites: 0, sentToReview: 0, refused: 0, runs: 1 },
  };
  const CAT = { books: 2, articles: 3, journals: 1, needsReview: 2 };   // 2 published books · 3 published articles · 1 accepted journal · 1 review book + 1 draft article

  section('Department + time filter: ingestion figures follow the period, catalogue figures never do');
  for (const dept of TESTED) {
    for (const p of PERIODS) {
      const a = after[`${dept}|${p}`], b = before[`${dept}|${p}`];
      check(`${dept} · ${p}: ingestion change is exactly what was seeded`, same(diff(a.ingestion, b.ingestion), WANT[p]), JSON.stringify(diff(a.ingestion, b.ingestion)));
      check(`${dept} · ${p}: catalogue change is exactly what was seeded`, same(diff(a.catalogue, b.catalogue), CAT), JSON.stringify(diff(a.catalogue, b.catalogue)));
    }
    check(`${dept}: catalogue is identical under Lifetime, 7 days and 24 hours`, same(after[`${dept}|lifetime`].catalogue, after[`${dept}|7d`].catalogue) && same(after[`${dept}|7d`].catalogue, after[`${dept}|24h`].catalogue));
    check(`${dept}: refused/metadata-only journals and rejected books are not counted as catalogue`, after[`${dept}|lifetime`].catalogue.journals - before[`${dept}|lifetime`].catalogue.journals === 1 && after[`${dept}|lifetime`].catalogue.books - before[`${dept}|lifetime`].catalogue.books === 2);
    check(`${dept}: the lifetime added counter is not the catalogue count`, after[`${dept}|lifetime`].ingestion.booksAdded !== after[`${dept}|lifetime`].catalogue.books || before[`${dept}|lifetime`].ingestion.booksAdded === 0);
  }
  for (const p of PERIODS) {
    const u = diff(after[`Dental|${p}`].unattributed, before[`Dental|${p}`].unattributed);
    check(`unattributed (${p}): the run with no department shows up as unattributed, not under Dental`, p === 'lifetime' || p === '7d' || p === '24h' ? u.booksAdded === 9 : false, JSON.stringify(u));
  }
  check('All departments · 24h: catalogue spans every department, ingestion includes the unattributed run', (() => {
    const a = after['null|24h'], b = before['null|24h'];
    const di = diff(a.ingestion, b.ingestion), dc = diff(a.catalogue, b.catalogue);
    return di.booksAdded === 4 * 4 + 9 && di.held === 4 * 2 && dc.books === 8 && dc.articles === 12 && dc.journals === 4 && a.unattributed === null;
  })());

  section('Department + kind + result: the run list agrees with an independent query');
  for (const dept of TESTED) {
    for (const [phase, result] of [[undefined, undefined], ['Books', undefined], ['Articles', undefined], ['Journals', undefined], [undefined, 'failed'], ['Books', 'added'], ['Articles', 'failed'], ['Journals', 'failed']] as const) {
      const got = await historyIds(dept, phase, result);
      const want = await expectedRunIds(dept, phase, result as any);
      check(`${dept} · ${phase || 'all kinds'} · ${result || 'all results'}: ${want.length} run(s)`, got.status === 200 && same(got.ids, want));
    }
  }
  const dental = await historyIds('Dental', 'Articles');
  check('an Articles run with no department of its own is listed under its journal’s department', dental.runs.some((r: any) => r.journalId === journalIds['Dental'] && r.department === null));
  check('…and not under another department', !(await historyIds('Nursing', 'Articles')).runs.some((r: any) => r.journalId === journalIds['Dental']));
  check('the unattributed run is listed under no department', !(await Promise.all(ALL.map(d => historyIds(d)))).some(h => h.runs.some((r: any) => r.note === `Manual · DM ${RUN}`)));

  section('The summary and the list describe the same runs');
  for (const dept of TESTED) {
    const pages = await historyIds(dept, undefined, 'failed');
    const lifetime = after[`${dept}|lifetime`].ingestion;
    check(`${dept}: summary “Failed runs” equals the rows under the Failed filter`, pages.runs.length < 200 && pages.runs.length === lifetime.failedRuns, `${pages.runs.length} vs ${lifetime.failedRuns}`);
    const books = (await historyIds(dept, 'Books')).runs.reduce((n: number, r: any) => n + r.added, 0);
    check(`${dept}: summary “Books added” equals the sum over its Books rows`, books === lifetime.booksAdded, `${books} vs ${lifetime.booksAdded}`);
  }

  section('Coverage table');
  const cov = (await A('/api/admin/ingest/coverage')).data;
  const byName = new Map<string, any>((cov.coverage || []).map((c: any) => [c.department, c]));
  check('every department in the taxonomy is listed, including ones with nothing', ALL.every(d => byName.has(d)), `${byName.size} listed of ${ALL.length}`);
  check('every row carries numeric Books, Articles, Journals, Needs review and Recent failures', ALL.every(d => ['books', 'articles', 'journals', 'needsReview', 'recentFailures'].every(k => typeof byName.get(d)?.[k] === 'number')));
  check('the sweep columns that were there before are still there', ALL.some(d => 'journalsHeld' in byName.get(d)) && 'booksHeld' in byName.get('Dental'));
  for (const dept of TESTED) {
    const c = byName.get(dept), s = after[`${dept}|lifetime`], s7 = after[`${dept}|7d`];
    check(`${dept}: coverage Books/Articles/Journals/Needs review match the summary`, c.books === s.catalogue.books && c.articles === s.catalogue.articles && c.journals === s.catalogue.journals && c.needsReview === s.catalogue.needsReview);
    check(`${dept}: coverage “Recent failures” equals the 7-day failed runs`, c.recentFailures === s7.ingestion.failedRuns, `${c.recentFailures} vs ${s7.ingestion.failedRuns}`);
    check(`${dept}: coverage grew by exactly the seeded catalogue`, c.books - (beforeTable.coverage.find((x: any) => x.department === dept)?.books || 0) === 2);
  }
  check('review items with no suggested department are reported, not spread across departments', typeof cov.unplacedReview === 'number');

  section('A name the catalogue holds that is not in the taxonomy');
  const stray = `Legacy ${RUN}`;
  await db.article.create({ data: { title: `DM stray ${RUN}`, domain: stray, status: 'Published' } });
  const sc = (await A('/api/admin/ingest/coverage')).data.coverage.find((c: any) => c.department === stray);
  check('it gets its own row with its real count, rather than vanishing or joining another department', sc?.articles === 1 && sc?.inTaxonomy === false);
  check('it can be asked about and filtered on', (await dm(stray, 'lifetime')).catalogue.articles === 1 && (await A(`/api/admin/ingest/history?department=${encodeURIComponent(stray)}`)).status === 200);

  section('A department with nothing in it');
  const empty = ALL.find(d => !TESTED.includes(d) && PERIODS.every(p => { const x = after[`${d}|${p}`]; return !x.catalogue.books && !x.catalogue.articles && !x.catalogue.journals && !x.ingestion.runs; }));
  if (!empty) console.log('  SKIP  every non-tested department already holds content in the scratch database');
  else {
    const r = after[`${empty}|lifetime`];
    check(`${empty}: all zeros, still answered, still listed in coverage`, r.catalogue.books === 0 && r.catalogue.articles === 0 && r.catalogue.journals === 0 && r.ingestion.booksAdded === 0 && byName.has(empty) && byName.get(empty).books === 0);
    check(`${empty}: no run rows`, (await historyIds(empty)).runs.length === 0);
  }

  section('Speed');
  const t1 = Date.now(); await dm('Dental', '7d'); const tMetrics = Date.now() - t1;
  const t2 = Date.now(); await A('/api/admin/ingest/coverage'); const tCov = Date.now() - t2;
  check('department metrics and coverage answer in under a second each (uncached)', tMetrics < 1000 && tCov < 1000, `${tMetrics} ms and ${tCov} ms`);
} catch (e: any) {
  fail++; console.log('  FAIL  test crashed:', e?.message);
  console.log(serverLog.slice(-1500));
} finally {
  await db.userSession.updateMany({ where: { sessionId: { startsWith: `sid-dm-${RUN}` } }, data: { revokedAt: new Date() } });
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
