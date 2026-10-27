/**
 * Daily Ingestion Summary — PUBLISHED: records counted in the cycle in which they BECAME PUBLIC (not the one they were created in).
 * Private throwaway database `stm_ol_fulltext_test` only (empty schema; the shared stm_ingestion_test is written by other suites at the same time):
 *
 *   npx tsx scripts/test-daily-published.ts
 *
 * Section 1–3 seed fixtures in a window in March 2021 that the test first proves is empty, and read the report straight from the code.
 * Section 4 starts the real server and approves records over HTTP (single and bulk), then reads the live report. Every row it writes carries this
 * run's tag or id and is removed afterwards.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_DB = 'stm_ol_fulltext_test';
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, `/${TEST_DB}`);
process.env.DATABASE_URL = TEST_URL; delete process.env.NODE_ENV;
process.env.INGEST_DAILY_LIVE_CACHE_MS = '0'; process.env.INGEST_DAILY_FINAL_CACHE_MS = '0';

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== TEST_DB) throw new Error(`refusing to run against anything but ${TEST_DB}`);
const D = await import('../src/lib/ingestion/dailySummary.js');
const P = await import('../src/lib/ingestion/dailyPublished.js');
const E = await import('../src/lib/ingestion/publicationEvents.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
const RUN = Date.now().toString(36);
const TAG = `dpub-${RUN}`;

const DAY = '2021-03-15', PREV = '2021-03-14', NEXT = '2021-03-16';
const W = D.dailyIngestionWindow(DAY);
const mid = new Date(W.start.getTime() + 3 * 3600_000);
const priorCycle = new Date(W.start.getTime() - 2 * 3600_000);                       // inside the PREVIOUS report
const longAgo = new Date(W.start.getTime() - 5 * 86_400_000);
const iso = (d: Date) => d.toISOString();

const made = { Article: [] as string[], Book: [] as string[], Journal: [] as string[] };
const article = async (o: any) => { const r = await db.article.create({ data: { title: `${TAG} article`, status: 'Published', ownershipSource: 'Ingested', source: 'OpenAlex', createdAt: mid, ...o } }); made.Article.push(r.id); return r; };
const book = async (o: any) => { const r = await db.book.create({ data: { title: `${TAG} book`, status: 'Published', ownershipSource: 'Ingested', source: 'DOAB', createdAt: mid, ...o } }); made.Book.push(r.id); return r; };
let issnSeq = 0; const issn = () => `8${String(Math.floor(Math.random() * 1e3)).padStart(3, '0')}-${String(++issnSeq).padStart(3, '0')}X`;
const journal = async (o: any) => { const r = await db.journal.create({ data: { title: `${TAG} journal`, status: 'Accepted', issn: issn(), rightsBasis: 'DOAJ declaration', createdAt: mid, ...o } }); made.Journal.push(r.id); return r; };
const held = (band = 'review', extra: any = {}) => ({ harvest: { department: { band, score: 4 }, ...extra } });
const event = (type: 'article' | 'book', r: any, at: Date, via: 'approve' | 'bulk-approve' = 'approve') => E.recordPublications({ email: `${TAG}@test.invalid` }, [{ type, id: r.id, department: r.domain ?? null, via }], { at });
const hashRows = async () => (await db.$queryRawUnsafe<any[]>(`select md5(coalesce((select string_agg(b::text, '|' order by id) from "Book" b where title like $1), '') || coalesce((select string_agg(a::text, '|' order by id) from "Article" a where title like $1), '') || coalesce((select string_agg(j::text, '|' order by id) from "Journal" j where title like $1), '')) h`, `${TAG}%`))[0].h;

const users: string[] = []; const sessions: string[] = [];
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-${TAG}@api-test.invalid`, password: 'x', role } }); users.push(u.id);
  const sid = `sid-${TAG}-${role}`; await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } }); sessions.push(sid);
  return { token: jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' }), email: u.email };
};
let server: any = null;
const BEFORE = (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Book")::int b, (select count(*) from "Article")::int a, (select count(*) from "Journal")::int j, (select count(*) from "User")::int u,
  (select count(*) from "IngestionAudit" where action = 'CONTENT_PUBLISHED')::int ev`))[0];

try {
  // ── 0. The windows hold nothing yet ──────────────────────────────────────
  section('Starting point');
  for (const d of [PREV, DAY, NEXT]) { const s = await D.dailySummary(d, { fresh: true }); eq(`the ${d} report is empty before the fixtures`, [s.totalAdded, s.published.total], [0, 0]); }
  const baseNotRecorded = (await D.dailySummary(DAY, { fresh: true })).published.notRecorded;

  // ── 1. Fixtures: every way a record becomes public ───────────────────────
  const a1 = await article({ domain: 'Physiotherapy' });                                                                    // created and published today, by ingestion
  const aManual = await article({ domain: 'Nursing', createdAt: new Date(W.start.getTime() - 2 * 86_400_000), status: 'Published', ownershipSource: 'Ingested' });
  await event('article', aManual, mid);                                                                                      // created 2 days ago, approved today
  const aBoundaryIn = await article({ domain: 'Nursing', createdAt: longAgo }); await event('article', aBoundaryIn, new Date(W.end.getTime() - 30_000));   // 17:00:30 IST -> this report
  const aBoundaryOut = await article({ domain: 'Nursing', createdAt: longAgo }); await event('article', aBoundaryOut, W.end);                              // 17:01:00 IST -> the NEXT report
  const aAdmin = await article({ domain: 'Nursing', ownershipSource: 'AdminEntered' });                                      // admin-entered, no event: neither added nor published

  const bYesterday = await book({ source: 'OpenLibrary', domain: 'Physiotherapy', createdAt: longAgo, metadata: held() });       // held, created days ago, approved today
  await event('book', bYesterday, mid);
  const bDraftToday = await book({ status: 'Draft', domain: 'Physiotherapy', metadata: held() });                           // created today, still a Draft
  const bEditedToday = await book({ source: 'OpenLibrary', domain: 'Nursing', createdAt: longAgo, updatedAt: mid, metadata: held() });   // published in the PREVIOUS cycle, edited today
  await event('book', bEditedToday, priorCycle);
  const bRepeat = await book({ source: 'OpenLibrary', domain: 'Nursing', createdAt: longAgo, metadata: held() });             // approved, withdrawn, approved again
  await event('book', bRepeat, priorCycle); await event('book', bRepeat, mid);
  const bDup = await book({ source: 'OpenLibrary', domain: 'Nursing', createdAt: longAgo, metadata: held() });                // the same approval recorded twice
  await event('book', bDup, mid); await event('book', bDup, new Date(mid.getTime() + 60_000));
  const bRa = await book({ source: 'OpenLibrary', domain: 'Physiotherapy', createdAt: longAgo, metadata: { ...held(), reviewPublication: { source: 'review-automation', performedAt: iso(mid) } } });
  const bRaPrev = await book({ source: 'OpenLibrary', domain: 'Physiotherapy', createdAt: longAgo, metadata: { ...held(), reviewPublication: { source: 'review-automation', performedAt: iso(priorCycle) } } });
  const bImm = await book({ source: 'DOAB', domain: 'Physiotherapy', metadata: held('strong') });                            // created public by ingestion
  const bUnrecorded = await book({ source: 'OpenLibrary', domain: 'Physiotherapy', metadata: held() });                        // held, public now, nobody recorded when: added, not published
  const bYearHold = await book({ source: 'DOAB', domain: 'Physiotherapy', metadata: held('strong', { yearPolicy: { outcome: 'older' } }) });
  const bRejected = await book({ status: 'Rejected', domain: 'Physiotherapy', createdAt: longAgo, metadata: held() }); await event('book', bRejected, mid);
  const bPublisher = await book({ ownershipSource: 'PublisherSubmitted', source: null, domain: 'Nursing', createdAt: longAgo }); await event('book', bPublisher, mid);
  const j1 = await journal({ domain: 'Physiotherapy' });
  const j2 = await journal({ status: 'MetadataOnly', domain: 'Physiotherapy' });
  const jOld = await journal({ domain: 'Physiotherapy', createdAt: longAgo });                                                // created long ago: public in an old cycle, not this one
  void bDraftToday; void aAdmin; void j2; void jOld; void bRejected; void bYearHold; void bUnrecorded;

  const before = await hashRows();
  const sDay = await D.dailySummary(DAY, { fresh: true });
  const pDay = sDay.published;

  section('Created today and published today / created earlier and published today');
  eq('Published today: 3 articles, 6 books, 1 journal', [pDay.articles, pDay.books, pDay.journals, pDay.total], [3, 6, 1, 10]);
  eq('by method: ingestion 3, manual 6, review automation 1', pDay.byMethod, { ingestion: 3, manual: 6, 'review-automation': 1 });
  eq('"New records added" is unchanged and separate: 1 article, 3 books, 1 journal', [sDay.articlesAdded, sDay.booksAdded, sDay.journalsAdded, sDay.totalAdded], [1, 3, 1, 5]);
  const list = await D.dailyPublishedContent({ reportDate: DAY, type: 'all', pageSize: 100 });
  const rowOf = (r: any) => list.rows.find((x: any) => x.id === r.id);
  check('a record created today and published today is in both reports', !!rowOf(a1) && rowOf(a1).method === 'ingestion' && iso(new Date(rowOf(a1).publishedAt)) === iso(mid));
  check('a record created 5 days ago and approved today is in Published but not in Added', !!rowOf(bYesterday) && rowOf(bYesterday).method === 'manual'
    && !(await D.dailyContent({ reportDate: DAY, type: 'all', pageSize: 100 })).rows.some((r: any) => r.id === bYesterday.id));
  check('its publication time is the approval time, not createdAt', rowOf(bYesterday) && iso(new Date(rowOf(bYesterday).publishedAt)) === iso(mid) && iso(new Date(rowOf(bYesterday).publishedAt)) !== iso(longAgo));
  check('a record created today that is still a Draft is in neither report', !rowOf(bDraftToday) && !(await D.dailyContent({ reportDate: DAY, type: 'all', pageSize: 100 })).rows.some((r: any) => r.id === bDraftToday.id));
  check('a journal created today is published today (ingestion); a metadata-only journal is not', !!rowOf(j1) && rowOf(j1).method === 'ingestion' && !rowOf(j2));
  check('an old journal is not in today\'s Published', !rowOf(jOld));

  section('Published yesterday, edited today; repeated publication');
  check('published in the previous cycle and edited today (updatedAt in this window): NOT in today\'s Published', !rowOf(bEditedToday));
  const pPrev = await D.dailyPublishedContent({ reportDate: PREV, type: 'all', pageSize: 100 });
  check('…it is in the previous cycle\'s Published, where it was published', pPrev.rows.some((r: any) => r.id === bEditedToday.id));
  eq('the previous report holds exactly that and the earlier Review Automation book', pPrev.rows.map((r: any) => r.id).sort(), [bEditedToday.id, bRaPrev.id].sort());
  check('approved, withdrawn and approved again: counted once, in the cycle of its LATEST publication', list.rows.filter((r: any) => r.id === bRepeat.id).length === 1 && !pPrev.rows.some((r: any) => r.id === bRepeat.id));
  check('the same approval recorded twice is one record in the list and one in the count', list.rows.filter((r: any) => r.id === bDup.id).length === 1);
  eq('list total equals the summary total', list.total, pDay.total);

  section('Review Automation, immediate ingestion, and what has no recorded time');
  check('Review Automation: the time is the one it stamped on the Book, method review-automation', rowOf(bRa)?.method === 'review-automation' && iso(new Date(rowOf(bRa).publishedAt)) === iso(mid));
  check('a Book the engine created already public (strong, self-publishing source) is Published at createdAt, method ingestion', rowOf(bImm)?.method === 'ingestion' && iso(new Date(rowOf(bImm).publishedAt)) === iso(mid));
  check('a held Book that is public now with no event and no stamp is NOT counted by cycle (not guessed from createdAt)', !rowOf(bUnrecorded) && !rowOf(bYearHold));
  eq('…it is reported once, separately, as "not recorded"', pDay.notRecorded - baseNotRecorded, 2);
  check('…while "added" still counts it (created today and public)', (await D.dailyContent({ reportDate: DAY, type: 'book', pageSize: 100 })).rows.some((r: any) => r.id === bUnrecorded.id));
  check('a rejected record with an event is not "published"', !rowOf(bRejected));
  check('an admin-entered record created public has no publication event and is not counted', !rowOf(aAdmin));
  check('a publisher-submitted Book approved by hand is counted (manual)', rowOf(bPublisher)?.method === 'manual');

  section('Boundaries');
  check('an approval at 5:00:30 PM belongs to this report', !!rowOf(aBoundaryIn));
  check('an approval at exactly 5:01:00 PM belongs to the NEXT report only', !rowOf(aBoundaryOut) && (await D.dailyPublishedContent({ reportDate: NEXT, type: 'all' })).rows.some((r: any) => r.id === aBoundaryOut.id));

  section('Reconciliation: tiles, department table and clicked lists agree');
  eq('departments sum to the total', pDay.departments.reduce((n: number, r: any) => n + r.total, 0), pDay.total);
  eq('rows hold journals/articles/books that sum to the totals', [0, 1, 2].map(i => pDay.departments.reduce((n: number, r: any) => n + [r.journals, r.articles, r.books][i], 0)), [pDay.journals, pDay.articles, pDay.books]);
  let agree = true; const bad: string[] = [];
  for (const r of pDay.departments) for (const t of ['journal', 'article', 'book'] as const) {
    const want = r[`${t}s` as 'journals']; const got = (await D.dailyPublishedContent({ reportDate: DAY, department: r.department, type: t })).total;
    if (want !== got) { agree = false; bad.push(`${r.department}/${t}: ${want} vs ${got}`); }
  }
  check('every department × type count equals its clicked list', agree, bad.join('; '));
  for (const t of ['journal', 'article', 'book'] as const) eq(`type tile for ${t}s equals its list`, (await D.dailyPublishedContent({ reportDate: DAY, type: t })).total, (pDay as any)[`${t}s`]);
  const fields = rowOf(bRa);
  check('each row carries title, type, department, provider, published at and method', !!(fields.title && fields.type === 'book' && fields.department === 'Physiotherapy' && fields.provider === 'OpenLibrary' && fields.publishedAt && fields.methodLabel === 'Review Automation'), JSON.stringify(fields));
  check('an unknown department filter lists nothing, and Unassigned works', (await D.dailyPublishedContent({ reportDate: DAY, department: 'No Such Dept' })).total === 0);
  const pg = await D.dailyPublishedContent({ reportDate: DAY, type: 'all', pageSize: 4, page: 2 });
  eq('pagination: page 2 of 4 holds 4 rows, newest first and stable', [pg.rows.length, pg.total], [4, 10]);
  check('injection through the department filter is harmless', (await D.dailyPublishedContent({ reportDate: DAY, department: `x'; drop table "Book"; --` })).total === 0);

  section('Reading changes nothing; previous reports use the same logic');
  eq('no fixture row was modified by building either report', await hashRows(), before);
  const again = await D.dailySummary(DAY, { fresh: true });
  eq('rebuilding the same report gives the same Published', again.published, pDay);
  eq('the next report counts only the record approved at 17:01:00', (await D.dailySummary(NEXT, { fresh: true })).published.total, 1);
  const cached = await D.dailySummary(PREV, { fresh: true });
  eq('a previous report is the same function over its own window', cached.published.total, 2);

  // ── 2. Pure folding ───────────────────────────────────────────────────────
  section('Folding');
  const f = P.foldPublished({ journal: [], article: [{ domain: null, method: 'manual', n: 2 }], book: [{ domain: 'Physio Therapy', method: 'ingestion', n: 1 }, { domain: 'Physiotherapy', method: 'review-automation', n: 1 }] } as any, 3);
  eq('an old department spelling folds into the official one, no-department is Unassigned, and Unassigned is not a department', [f.departments.map((r: any) => [r.department, r.total]), f.departmentsWithActivity, f.notRecorded], [[['Physiotherapy', 2], ['(unassigned)', 2]], 1, 3]);

  // ── 3. Source contracts ───────────────────────────────────────────────────
  section('Where the publication time comes from');
  const rp = readFileSync(new URL('../src/lib/ingestion/reviewPublish.ts', import.meta.url), 'utf8');
  check('Review Automation stamps metadata.reviewPublication.performedAt in the same statement that publishes the Book', /status = 'Published'[\s\S]{0,400}reviewPublication/.test(rp) && /performedAt: at/.test(rp));
  const srv = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  check('the single and bulk manual Approve routes both record a publication event', (srv.match(/recordPublications\(req\.user/g) || []).length === 2);
  check('…and only when the record was not already public', /wasPublic/.test(srv) && /status !== 'Published'/.test(srv));

  // ── 4. The real HTTP routes, live cycle ───────────────────────────────────
  section('Manual approval over HTTP (live cycle)');
  const adm = await mkUser('SuperAdmin'), rdr = await mkUser('Subscriber');
  const PORT = 3106, BASE = `http://127.0.0.1:${PORT}`;
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], { cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development' } });
  let log = ''; child.stdout!.on('data', d => (log += d)); child.stderr!.on('data', d => (log += d)); server = child;
  const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => { const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {} return { status: r.status, data, text }; };
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/ingest/daily-summary', { token: adm.token }); if (r.status) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start: ' + log.slice(-400)); await new Promise(r => setTimeout(r, 500)); }
  const sum = async () => (await call('/api/admin/ingest/daily-summary?fresh=1', { token: adm.token })).data;
  const S = '/api/admin/ingest/daily-summary';
  check('no token → 401; a reader → 403 (summary and published list)', (await call(S)).status === 401 && (await call(S, { token: rdr.token })).status === 403 && (await call(`${S}/content?basis=published`, { token: rdr.token })).status === 403);

  const base = await sum();
  check('the summary carries both blocks: totalAdded and published', typeof base.totalAdded === 'number' && base.published && typeof base.published.total === 'number' && base.published.byMethod && Array.isArray(base.published.departments));
  const d1 = await book({ status: 'Draft', domain: 'Physiotherapy', createdAt: longAgo, metadata: held() });
  const d2 = await book({ status: 'Draft', domain: 'Nursing', createdAt: longAgo, metadata: held() });
  const d3 = await book({ status: 'Draft', domain: 'Nursing', createdAt: longAgo, metadata: held() });
  const already = await book({ source: 'DOAB', domain: 'Nursing', createdAt: longAgo, metadata: held('strong') });             // public long ago
  const art = await article({ status: 'Draft', domain: 'Physiotherapy', createdAt: longAgo });
  const noDept = await book({ status: 'Draft', domain: null, createdAt: longAgo, metadata: held() });
  const evCount = async (ids: string[]) => (await db.$queryRawUnsafe<any[]>(`select meta->>'id' id, count(*)::int n from "IngestionAudit" where action = 'CONTENT_PUBLISHED' and meta->>'id' = any($1::text[]) group by 1`, ids));

  const r1 = await call(`/api/admin/review/book/${d1.id}`, { method: 'POST', token: adm.token, body: { action: 'approve' } });
  check('single Approve of a Book → 200 and the Book is Published', r1.status === 200 && r1.data.status === 'Published');
  const r1b = await call(`/api/admin/review/book/${d1.id}`, { method: 'POST', token: adm.token, body: { action: 'approve' } });
  check('Approve again → 200, and still exactly ONE publication event (idempotent)', r1b.status === 200 && (await evCount([d1.id])).map((x: any) => x.n).join() === '1');
  const ev1 = (await db.ingestionAudit.findMany({ where: { action: 'CONTENT_PUBLISHED' } as any })).find((x: any) => x.meta?.id === d1.id) as any;
  check('the event records who, what, which department, and that it was a manual approval', ev1?.adminEmail === adm.email && ev1.meta.type === 'book' && ev1.meta.method === 'manual' && ev1.meta.via === 'approve' && ev1.meta.department === 'Physiotherapy');
  const ra = await call(`/api/admin/review/article/${art.id}`, { method: 'POST', token: adm.token, body: { action: 'approve' } });
  check('single Approve of an Article → 200 and an event', ra.status === 200 && (await evCount([art.id])).length === 1);
  const nd = await call(`/api/admin/review/book/${noDept.id}`, { method: 'POST', token: adm.token, body: { action: 'approve' } });
  check('an Approve that is refused (ingested Book with no department) → 400, no event, still a Draft', nd.status === 400 && !(await evCount([noDept.id])).length && (await db.book.findUnique({ where: { id: noDept.id } }))!.status === 'Draft');
  const bulk = await call('/api/admin/review/bulk', { method: 'POST', token: adm.token, body: { model: 'book', ids: [d2.id, d3.id, already.id], action: 'approve' } });
  eq('bulk Approve → 200, count 3', [bulk.status, bulk.data?.count], [200, 3]);
  eq('…but events only for the two that were not public already', (await evCount([d2.id, d3.id, already.id])).map((x: any) => x.id).sort(), [d2.id, d3.id].sort());
  const bulk2 = await call('/api/admin/review/bulk', { method: 'POST', token: adm.token, body: { model: 'book', ids: [d2.id, d3.id], action: 'approve' } });
  check('the same bulk Approve again writes no further events', bulk2.status === 200 && (await evCount([d2.id, d3.id])).every((x: any) => x.n === 1));
  const rej = await call('/api/admin/review/bulk', { method: 'POST', token: adm.token, body: { model: 'book', ids: [noDept.id], action: 'reject', note: 'no' } });
  check('a bulk Reject writes no publication event', rej.status === 200 && !(await evCount([noDept.id])).length);

  const after = await sum();
  eq('Published rose by exactly the 4 records that became public (3 Books, 1 Article), all manual', [after.published.total - base.published.total, after.published.books - base.published.books, after.published.articles - base.published.articles, after.published.byMethod.manual - base.published.byMethod.manual], [4, 3, 1, 4]);
  eq('"New records added" did not move (they were created long ago)', [after.totalAdded - base.totalAdded], [0]);
  const live = await call(`${S}/content?basis=published&type=all&pageSize=100`, { token: adm.token });
  const mine = (live.data?.rows || []).filter((r: any) => [d1.id, d2.id, d3.id, art.id].includes(r.id));
  check('the clicked list shows them with method "Manual approval" and a publication time of now', mine.length === 4 && mine.every((r: any) => r.method === 'manual' && r.methodLabel === 'Manual approval' && Math.abs(Date.now() - Date.parse(r.publishedAt)) < 120_000), JSON.stringify(mine.map((r: any) => [r.type, r.method])));
  check('…and the already-public Book is not in it', !(live.data?.rows || []).some((r: any) => r.id === already.id));
  const addedList = await call(`${S}/content?type=all&pageSize=100`, { token: adm.token });
  check('without basis the list is still the "added" list (none of these were created in this cycle)', addedList.status === 200 && !(addedList.data.rows || []).some((r: any) => mine.some((m: any) => m.id === r.id)) && !addedList.data.basis);
  check('an unknown basis falls back to added rather than failing', (await call(`${S}/content?basis=bogus&type=all`, { token: adm.token })).status === 200);
  eq('the clicked list total equals the tile', (await call(`${S}/content?basis=published&type=book`, { token: adm.token })).data.total, after.published.books);

  await db.book.update({ where: { id: d1.id }, data: { title: `${TAG} edited` } });
  await db.$executeRawUnsafe(`update "Book" set "updatedAt" = now() where id = $1`, d2.id);
  const edited = await sum();
  eq('editing or re-saving a published record afterwards does not count it again', [edited.published.total, edited.published.books], [after.published.total, after.published.books]);

  const aud = await call('/api/admin/ingest/audit?limit=100', { token: adm.token });
  check('the per-record events stay out of the default Audit view but can be asked for', aud.status === 200 && !(aud.data.events || []).some((e: any) => e.action === 'CONTENT_PUBLISHED')
    && (await call('/api/admin/ingest/audit?limit=100&action=CONTENT_PUBLISHED', { token: adm.token })).data.events.some((e: any) => e.action === 'CONTENT_PUBLISHED'));
} catch (e: any) {
  fail++; console.log('  FAIL  the suite crashed:', e?.stack || e);
} finally {
  try { if (server) process.kill(-server.pid, 'SIGTERM'); } catch {}
  const ids = [...made.Book, ...made.Article];
  await db.$executeRawUnsafe(`delete from "IngestionAudit" where action = 'CONTENT_PUBLISHED' and meta->>'id' = any($1::text[])`, ids);
  await db.article.deleteMany({ where: { id: { in: made.Article } } }); await db.book.deleteMany({ where: { id: { in: made.Book } } }); await db.journal.deleteMany({ where: { id: { in: made.Journal } } });
  await db.appSetting.deleteMany({ where: { key: 'uploads.storage.v1' } });
  await db.userSession.deleteMany({ where: { sessionId: { in: sessions } } }); await db.user.deleteMany({ where: { id: { in: users } } });
  const AFTER = (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Book")::int b, (select count(*) from "Article")::int a, (select count(*) from "Journal")::int j, (select count(*) from "User")::int u,
    (select count(*) from "IngestionAudit" where action = 'CONTENT_PUBLISHED')::int ev`))[0];
  check('after cleanup the private database is as it was (Book, Article, Journal, User and publication-event counts)', JSON.stringify(AFTER) === JSON.stringify(BEFORE), JSON.stringify({ BEFORE, AFTER }));
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
