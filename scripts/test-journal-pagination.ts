/**
 * The public journal lists are paged and searched on the server (src/lib/journalPaging.ts).
 *
 *   npx tsx scripts/test-journal-pagination.ts
 *
 * A real server on the throwaway database `stm_ingestion_test`. It seeds two publishers' worth of journals in one department (237 public,
 * 9 hidden) and checks the department, publisher and subject lists: first, next and final partial page, a page past the end, no journal
 * repeated or skipped across pages, one total order whatever the page size, server-side search (literal % and _), page-size limits, the
 * figures that describe the WHOLE list (not the page), the public count, and that journal detail, the article-search filter and the
 * access rules did not change. Every outbound request is blocked.
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
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 260) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const PORT = 3113, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const DEPT = 'Ayurveda';
const PUB_A = `PG Publisher A ${RUN}`, PUB_B = `PG Publisher B ${RUN}`;
const SUBJECT = `PG Subject ${RUN}`, ODD = `PG Odd & Name (x) ${RUN}`;
const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad = (n: number) => String(n).padStart(3, '0');

type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(700); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const get = async (path: string, token?: string) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
};
/** Every page of a list, in order. */
const walk = async (path: string, limit: number, extra = '', token?: string) => {
  const pages: any[] = [];
  for (let page = 1; page < 500; page++) {
    const r = await get(`${path}?limit=${limit}&page=${page}${extra}`, token);
    pages.push(r.data); if (!r.data?.hasMore) break;
  }
  return pages;
};
const ids = (pages: any[]) => pages.flatMap(p => (p?.journals || []).map((j: any) => j.id));

const created = { users: [] as string[] };
let srv: Srv | null = null;
try {
  // ── seed ───────────────────────────────────────────────────────────────
  const publicBefore = Number((await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "Journal" where status in ('Accepted','MetadataOnly')`))[0].n);
  let articlesA = 0, articlesB = 0, yMin = 9999, yMax = 0;
  const jrows: any[] = []; const arows: any[] = [];
  const add = (title: string, status: string, pub: string, subjects: string[], published = 0, drafts = 0, issn?: string) => {
    const id = crypto.randomUUID();
    jrows.push({ id, title, issn: issn ?? `pg-${RUN}-${jrows.length}`, status, domain: DEPT, publisherName: pub, subjects });
    for (let k = 0; k < published; k++) { const y = 2019 + ((arows.length + k) % 6); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); arows.push({ title: `PG art ${RUN} ${arows.length}`, journalId: id, domain: DEPT, status: 'Published', volume: '1', issue: '1', year: y }); pub === PUB_A ? articlesA++ : articlesB++; }
    for (let k = 0; k < drafts; k++) arows.push({ title: `PG draft ${RUN} ${arows.length}`, journalId: id, domain: DEPT, status: 'Draft', year: 2024 });
    return id;
  };
  const hidden: string[] = [];
  for (let i = 0; i < 150; i++) {
    const twin = i >= 100 && i < 130;
    const title = twin ? `PG ${RUN} Twin` : `PG ${RUN} Journal ${pad(i)}`;
    const subjects = i < 80 ? [SUBJECT] : i < 90 ? [ODD] : [];
    add(title, i % 2 ? 'Accepted' : 'MetadataOnly', PUB_A, subjects, twin ? (i < 110 ? 2 : 0) : i % 5 === 0 ? 1 + (i % 3) : 0, i % 7 === 0 ? 1 : 0);
  }
  for (let i = 0; i < 84; i++) add(`PG ${RUN} Other ${pad(i)}`, 'Accepted', PUB_B, i < 40 ? [SUBJECT] : [], i % 9 === 0 ? 2 : 0);
  add(`PG ${RUN} 100% Sure`, 'Accepted', PUB_B, []);
  add(`PG ${RUN} a_b`, 'Accepted', PUB_B, []);
  add(`PG ${RUN} a1b`, 'Accepted', PUB_B, [], 0, 0, `pg-${RUN}-issn-marker`);
  for (let i = 0; i < 6; i++) hidden.push(add(`PG ${RUN} Review ${i}`, 'NeedsReview', PUB_A, [SUBJECT], 1));
  for (let i = 0; i < 2; i++) hidden.push(add(`PG ${RUN} Rejected ${i}`, 'Rejected', PUB_B, [SUBJECT], 1));
  hidden.push(add(`PG ${RUN} Draft`, 'Draft', PUB_A, [SUBJECT]));
  // the hidden journals' published articles must not count anywhere
  const hiddenArticles = hidden.length; void hiddenArticles;
  const PUBLIC_A = 150, PUBLIC_B = 87, PUBLIC = PUBLIC_A + PUBLIC_B;
  await db.journal.createMany({ data: jrows as any });
  for (let i = 0; i < arows.length; i += 500) await db.article.createMany({ data: arows.slice(i, i + 500) as any });
  // published articles of hidden journals were added by `add` under whichever publisher; correct the expected totals for them
  const pubCountA = Number((await db.$queryRawUnsafe<any[]>(`select count(a.id)::int n from "Article" a join "Journal" j on j.id=a."journalId" where j."publisherName"=$1 and j.status in ('Accepted','MetadataOnly') and a.status='Published'`, PUB_A))[0].n);
  const pubCountB = Number((await db.$queryRawUnsafe<any[]>(`select count(a.id)::int n from "Article" a join "Journal" j on j.id=a."journalId" where j."publisherName"=$1 and j.status in ('Accepted','MetadataOnly') and a.status='Published'`, PUB_B))[0].n);
  void articlesA; void articlesB; void yMin; void yMax;

  const admin = await db.user.create({ data: { email: `pg-sub-${RUN}@pg-test.invalid`, password: 'x', role: 'Subscriber', displayName: 'pg subscriber' } as any });
  created.users.push(admin.id);
  const sid = `sid-pg-${RUN}`;
  await db.userSession.create({ data: { userId: admin.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  const subTok = jwt.sign({ uid: admin.id, sid, role: 'Subscriber', email: admin.email }, SECRET, { expiresIn: '1h' });
  srv = await start();
  const headline = async () => (await get('/api/public/content-type-counts')).data?.Journals as number;

  const DP = `/api/library/department/${DEPT.toLowerCase()}`;
  const PA = `/api/library/publisher/${slugOf(PUB_A)}`, PB = `/api/library/publisher/${slugOf(PUB_B)}`;

  // ── department: first / next / last page ───────────────────────────────
  section('Department list: pages');
  const first = (await get(DP)).data;
  const walked = await walk(DP, 100);
  const all = ids(walked);
  {
    check('the default page is 100 journals', first.limit === 100 && first.journals.length === 100 && first.page === 1, [first.limit, first.journals?.length]);
    check('total is returned separately from the rows, and is the whole department', first.journalTotal === first.total && first.total >= PUBLIC && first.total === all.length, [first.total, all.length]);
    check('"hasMore" is true on page 1 and "pages" is ceil(total/100)', first.hasMore === true && first.pages === Math.ceil(first.total / 100), [first.hasMore, first.pages]);
    const p2 = (await get(`${DP}?page=2`)).data;
    check('the next page is the next 100', p2.page === 2 && p2.journals.length === Math.min(100, first.total - 100) && p2.journals[0].id !== first.journals[0].id);
    const last = walked[walked.length - 1];
    const expectLast = first.total - 100 * (first.pages - 1);
    check('the final page is the partial remainder, and says there is no more', last.journals.length === expectLast && expectLast > 0 && last.hasMore === false, [last.journals.length, expectLast]);
    const beyond = (await get(`${DP}?page=${first.pages + 5}`)).data;
    check('a page past the end is empty, with the same total, and not an error', beyond.journals.length === 0 && beyond.total === first.total && beyond.hasMore === false);
    check('no journal is repeated across pages', new Set(all).size === all.length, [new Set(all).size, all.length]);
    check('every public journal seeded appears exactly once, and no hidden one does', (() => {
      const set = new Set(all); return jrows.filter(j => ['Accepted', 'MetadataOnly'].includes(j.status)).every(j => set.has(j.id)) && hidden.every(h => !set.has(h));
    })());
    const w200 = ids(await walk(DP, 200));
    check('one total order, whatever the page size: 100 per page and 200 per page give the same sequence', JSON.stringify(w200) === JSON.stringify(all));
    check('and asking twice gives the same page (stable)', JSON.stringify((await get(DP)).data.journals.map((j: any) => j.id)) === JSON.stringify(first.journals.map((j: any) => j.id)));
    const counts = walked.flatMap(p => p.journals.map((j: any) => j.articleCount));
    check('default order: the journals holding the most published articles come first', counts.every((c, i) => i === 0 || counts[i - 1] >= c));
    const byTitle = ids(await walk(DP, 100, '&sort=title'));
    check('sort=title returns the same journals in another order, still without repeats', byTitle.length === all.length && new Set(byTitle).size === all.length && JSON.stringify(byTitle) !== JSON.stringify(all));
  }

  section('Limits');
  {
    const big = (await get(`${DP}?limit=5000`)).data;
    check('the page size is capped: limit=5000 is 200', big.limit === 200 && big.journals.length === 200, [big.limit, big.journals?.length]);
    check('a nonsense limit falls back to 100 (0, -5, abc)', (await Promise.all(['0', '-5', 'abc'].map(async l => (await get(`${DP}?limit=${l}`)).data.limit))).every(l => l === 100));
    check('a nonsense page falls back to page 1 (0, -2, abc)', (await Promise.all(['0', '-2', 'abc'].map(async p => (await get(`${DP}?page=${p}&limit=5`)).data.page))).every(p => p === 1));
    const five = (await get(`${DP}?limit=5`)).data;
    check('limit=5 returns five rows and the same totals (the explorer asks for five)', five.journals.length === 5 && five.total === first.total && five.journalTotal === first.journalTotal);
  }

  // ── department: figures describe the whole list ─────────────────────────
  section('Whole-department figures do not depend on the page');
  {
    const a = (await get(`${DP}?limit=5&page=1`)).data, b = (await get(`${DP}?limit=200&page=2`)).data;
    check('years, articles, books and publisher counts are identical on any page', [a.firstYear, a.lastYear, a.articles, a.books, a.publisherTotal].join() === [b.firstYear, b.lastYear, b.articles, b.books, b.publisherTotal].join(), [a, b].map(x => [x.firstYear, x.lastYear, x.articles, x.publisherTotal]));
    check('the publisher list is the biggest fifty at most, with the true count beside it', a.publishers.length <= 50 && a.publisherTotal >= 2);
    check('both seeded publishers are counted', a.publisherTotal >= 2);
  }

  // ── search ─────────────────────────────────────────────────────────────
  section('Search, on the server');
  {
    const twins = (await get(`${PA}?q=${encodeURIComponent(`${RUN} TWIN`.toUpperCase())}`)).data;
    check('search is case-insensitive and finds the 30 twins; total counts the matches', twins.total === 30 && twins.journals.length === 30 && twins.journalTotal === PUBLIC_A, [twins.total, twins.journalTotal]);
    const byPub = (await get(`${DP}?q=${encodeURIComponent(PUB_B.toLowerCase())}&limit=200`)).data;
    check('search reaches the publisher name', byPub.total === PUBLIC_B && byPub.journals.every((j: any) => j.publisherName === PUB_B), [byPub.total]);
    const byIssn = (await get(`${DP}?q=${encodeURIComponent(`issn-marker`)}`)).data;
    check('search reaches the ISSN', byIssn.total === 1 && byIssn.journals[0].title === `PG ${RUN} a1b`, byIssn.total);
    const pct = (await get(`${PB}?q=${encodeURIComponent('100%')}`)).data;
    check('a typed % is a character, not a wildcard', pct.total === 1 && pct.journals[0].title === `PG ${RUN} 100% Sure`, pct.total);
    const und = (await get(`${PB}?q=${encodeURIComponent(`${RUN} a_b`)}`)).data;
    check('a typed _ is a character, not a wildcard ("a_b" does not match "a1b")', und.total === 1 && und.journals[0].title === `PG ${RUN} a_b`, und.total);
    const none = (await get(`${PB}?q=${encodeURIComponent('zzz-no-such-journal')}`)).data;
    check('no match is an empty page with total 0 (not an error), and the list size is still reported', none.total === 0 && none.journals.length === 0 && none.journalTotal === PUBLIC_B);
    const wide = await walk(PB, 20, `&q=${encodeURIComponent(RUN)}`);
    const wideIds = ids(wide);
    check('a search pages like a list: 87 matches in pages of 20, no repeats, last page partial', wideIds.length === PUBLIC_B && new Set(wideIds).size === PUBLIC_B && wide.length === 5 && wide[4].journals.length === 7, [wideIds.length, wide.length]);
    check('the search never reaches a hidden journal', !wideIds.some((id: string) => hidden.includes(id)));
    check('sort works with a search', (await get(`${PB}?q=${encodeURIComponent('Other')}&sort=title&limit=5`)).data.journals.length === 5);
  }

  // ── publisher ──────────────────────────────────────────────────────────
  section('Publisher list');
  {
    const pagesA = await walk(PA, 100), idsA = ids(pagesA);
    check('publisher A: 150 public journals in two pages (100 + 50), none repeated', idsA.length === PUBLIC_A && new Set(idsA).size === PUBLIC_A && pagesA.length === 2 && pagesA[1].journals.length === 50, [idsA.length, pagesA.length]);
    check('the hidden journals of that publisher are not listed', !idsA.some((id: string) => hidden.includes(id)));
    const truth: any[] = await db.$queryRawUnsafe(`select j.id from "Journal" j left join "Article" a on a."journalId"=j.id and a.status='Published' where j."publisherName"=$1 and j.status in ('Accepted','MetadataOnly') group by j.id order by count(a.id) desc, j.title asc, j.id asc`, PUB_A);
    check('the order is exactly: most articles, then title, then id (checked against SQL)', JSON.stringify(idsA) === JSON.stringify(truth.map(r => r.id)));
    const titleTruth: any[] = await db.$queryRawUnsafe(`select j.id from "Journal" j where j."publisherName"=$1 and j.status in ('Accepted','MetadataOnly') order by j.title asc, j.id asc`, PUB_A);
    check('sort=title is exactly: title, then id (checked against SQL)', JSON.stringify(ids(await walk(PA, 40, '&sort=title'))) === JSON.stringify(titleTruth.map(r => r.id)));
    const a = pagesA[0];
    check('the publisher\'s article total covers all its journals, not the page', a.articles === pubCountA && pagesA[1].articles === pubCountA, [a.articles, pubCountA]);
    check('its department breakdown counts all of its journals', (a.departments || []).some((d: any) => d.name === DEPT && d.journals === PUBLIC_A), a.departments);
    check('the span of years covers all of its articles', a.firstYear >= 2019 && a.lastYear <= 2024 && a.firstYear <= a.lastYear);
    const b = (await get(PB)).data;
    check('publisher B is a separate list of 87', b.journalTotal === PUBLIC_B && b.articles === pubCountB, [b.journalTotal, b.articles]);
  }

  // ── subject ────────────────────────────────────────────────────────────
  section('Subject list');
  {
    const SUBJ = `/api/library/subject/${slugOf(SUBJECT)}`;
    const pages = await walk(SUBJ, 50), sid2 = ids(pages);
    const expected = jrows.filter(j => ['Accepted', 'MetadataOnly'].includes(j.status) && j.subjects.includes(SUBJECT)).length;
    check(`a subject lists the ${expected} public journals under it, in pages, with no repeats`, sid2.length === expected && new Set(sid2).size === expected && pages[0].journalTotal === expected, [sid2.length, expected]);
    check('NeedsReview, Rejected and Draft journals of that subject are not listed', !sid2.some((id: string) => hidden.includes(id)));
    check('the subject name is returned', pages[0].subject === SUBJECT);
    const subArticles = Number((await db.$queryRawUnsafe<any[]>(`select count(a.id)::int n from "Journal" j join "Article" a on a."journalId"=j.id and a.status='Published' where j.status in ('Accepted','MetadataOnly') and j.subjects ? $1`, SUBJECT))[0].n);
    check('the subject\'s article total covers every journal under it, not the page', pages[0].articles === subArticles && pages[pages.length - 1].articles === subArticles, [pages[0].articles, subArticles]);
    const odd = (await get(`/api/library/subject/${slugOf(ODD)}`)).data;
    check('a subject with punctuation ("& (x)") is found by its slug: the SQL fold equals the app\'s', odd?.subject === ODD && odd.journalTotal === 10, odd?.subject);
    check('an unknown subject is still 404', (await get(`/api/library/subject/no-such-subject-${RUN}`)).status === 404);
    const sq = (await get(`${SUBJ}?q=${encodeURIComponent('Other 00')}`)).data;
    check('a subject can be searched too', sq.total === 10 && sq.journalTotal === expected, [sq.total, sq.journalTotal]);
  }

  // ── department filter ──────────────────────────────────────────────────
  section('Department filter');
  {
    const other = ids(await walk('/api/library/department/nursing', 200));
    check('another department\'s list does not contain these journals', !other.some((id: string) => all.includes(id)) && other.length > 0 && new Set(other).size === other.length, other.length);
  }

  // ── what must not change ───────────────────────────────────────────────
  section('Unchanged: public count, journal detail, article filter, access');
  {
    const now = await headline();
    check('the public count is the same query as before: it equals the SQL count and rose by exactly the 237 public journals seeded', now === publicBefore + PUBLIC && now === Number((await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "Journal" where status in ('Accepted','MetadataOnly')`))[0].n), [now, publicBefore + PUBLIC]);
    const pick = jrows.find(j => j.status === 'Accepted')!, hid = hidden[0];
    check('journal detail still opens a public journal, and 404s a hidden one', (await get(`/api/library/journal/${pick.id}`)).status === 200 && (await get(`/api/library/journal/${hid}`)).status === 404);
    const flt = await get(`/api/library/journals?domain=${encodeURIComponent(DEPT)}`);
    check('the article-search journal filter is unchanged: a plain array, only journals that hold a published article, not paged', Array.isArray(flt.data) && flt.data.length > 0 && flt.data.every((j: any) => j.articleCount > 0) && !('hasMore' in (flt.data as any)));
    check('a member with no plan is still refused (403) on a department page, and on page 2', (await get(DP, subTok)).status === 403 && (await get(`${DP}?page=2`, subTok)).status === 403);
    const small = (await get(`${DP}?limit=100`)).text.length, full = (await get(`${DP}?limit=200`)).text.length;
    console.log(`  info  department payload: page of 100 = ${small} bytes, page of 200 = ${full} bytes, ${all.length} journals in all`);
    check('the default response is bounded: it does not grow with the department', small < full);
  }
} finally {
  await stop(srv);
  const ids2 = (await db.$queryRawUnsafe<any[]>(`select id from "Journal" where title like $1 or "publisherName" like $2`, `PG ${RUN}%`, `PG Publisher _ ${RUN}`)).map(r => r.id);
  await db.article.deleteMany({ where: { journalId: { in: ids2 } } }).catch(() => {});
  await db.journal.deleteMany({ where: { id: { in: ids2 } } }).catch(() => {});
  await db.userSession.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
