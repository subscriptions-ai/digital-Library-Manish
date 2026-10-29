/**
 * The admin content sections (Books, Periodicals, Magazines, Case Reports, Theses, Conference Proceedings, Educational Videos, Newsletters) in both
 * collections: the department counts, the table behind them, the cards, and who may see which.
 *
 *   npx tsx scripts/test-admin-content.ts
 *
 * Part 1 is pure (the address the table keeps, the units). Part 2 starts the real server on the throwaway database `stm_ingestion_test` (it refuses
 * any other) with every outbound request blocked. Every fixture carries a per-run tag and is removed afterwards; counts are taken with `q=<tag>` so
 * rows already in that database do not matter, and expected values are worked out here from the fixtures, not by the code under test.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { ADMIN_SECTIONS, SECTION_LABELS, NO_DEPARTMENT, isSection, parseSort, type AdminSection, type Collection } from '../src/lib/adminContent.js';
import { parseAdminList, toAdminParams, applyAdminPatch, DEFAULT_ADMIN_LIST, isNarrowed } from '../src/lib/adminContentUrl.js';
import { CANONICAL_NAMES } from '../src/lib/departmentRegistry.js';
import { CONTENT_TYPES } from '../src/constants.js';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const P = (q: string) => parseAdminList(new URLSearchParams(q));

// ── 1. Pure ─────────────────────────────────────────────────────────────────
section('1a. The sections and what one record is');
{
  check('the sections are exactly the content types of the library', JSON.stringify([...ADMIN_SECTIONS].sort()) === JSON.stringify(CONTENT_TYPES.map(c => c.name).sort()));
  check('every section says what one record is, in both collections', ADMIN_SECTIONS.every(s => SECTION_LABELS[s].unit.new && SECTION_LABELS[s].unit.archived && SECTION_LABELS[s].one && SECTION_LABELS[s].singular));
  check('Periodicals are said to be articles, never journal titles', /article/.test(SECTION_LABELS.Periodicals.unit.new) && /not a journal title/.test(SECTION_LABELS.Periodicals.unit.new) && !/journal title\b(?!\s*or)/.test(SECTION_LABELS.Periodicals.plural));
  check('"Add Thesis", not "Add These"', SECTION_LABELS.Theses.singular === 'Thesis' && SECTION_LABELS['Case Reports'].singular === 'Case Report');
  check('only the library\'s own sections are accepted', isSection('Magazines') && !isSection('Journals') && !isSection(undefined) && !isSection('books'));
  check('sort is whitelisted', parseSort('title') === 'title' && parseSort('oldest') === 'oldest' && parseSort('DROP TABLE') === 'added');
}
section('1b. The address of a table');
{
  const s = P('collection=archived&q=nursing&status=Draft&domain=Law&sort=title&page=4');
  check('every field is read', s.collection === 'archived' && s.q === 'nursing' && s.status === 'Draft' && s.domain === 'Law' && s.sort === 'title' && s.page === 4, s);
  check('serialise → parse is the identity', JSON.stringify(P(toAdminParams(s).toString())) === JSON.stringify(s));
  check('a pristine table has no parameters', toAdminParams(DEFAULT_ADMIN_LIST).toString() === '');
  const bad = P('collection=both&status=Archived&sort=x&page=0&visibility=private&domain=' + encodeURIComponent('a\u0000b'));
  check('unknown values are dropped', bad.collection === '' && bad.status === '' && bad.sort === 'added' && bad.page === 1 && bad.visibility === '', bad);
  check('Unassigned survives the address', P('domain=__none').domain === NO_DEPARTMENT && P(toAdminParams({ ...DEFAULT_ADMIN_LIST, domain: NO_DEPARTMENT }).toString()).domain === NO_DEPARTMENT);
  check('a department with "&" and "/" survives', P(toAdminParams({ ...DEFAULT_ADMIN_LIST, domain: 'Computer / IT' }).toString()).domain === 'Computer / IT' && P(toAdminParams({ ...DEFAULT_ADMIN_LIST, domain: 'Electronics & Telecommunication Engineering' }).toString()).domain === 'Electronics & Telecommunication Engineering');
  const cur = { ...DEFAULT_ADMIN_LIST, collection: 'new' as const, page: 6, domain: 'Law' };
  check('changing the department resets the page', applyAdminPatch(cur, { domain: 'Nursing' }).page === 1);
  check('searching, status, public-only, sort and collection reset the page', [{ q: 'x' }, { status: 'Draft' as const }, { visibility: 'public' as const }, { sort: 'title' as const }, { collection: 'archived' as const }].every(p => applyAdminPatch(cur, p).page === 1));
  check('moving between pages keeps the filters', (() => { const n = applyAdminPatch(cur, { page: 7 }); return n.page === 7 && n.domain === 'Law'; })());
  check('"public only" and a status do not coexist', applyAdminPatch({ ...cur, status: 'Draft' }, { visibility: 'public' }).status === '' && applyAdminPatch({ ...cur, visibility: 'public' }, { status: 'Draft' }).visibility === '');
  check('Rejected exists only in the New collection', applyAdminPatch({ ...cur, status: 'Rejected' }, { collection: 'archived' }).status === '');
  check('the collection and the sort are not "narrowing"', !isNarrowed({ ...DEFAULT_ADMIN_LIST, collection: 'archived', sort: 'title' }) && isNarrowed({ ...DEFAULT_ADMIN_LIST, domain: 'Law' }));
  check('an explicitly chosen collection stays in the address', toAdminParams({ ...DEFAULT_ADMIN_LIST, collection: 'new' }).get('collection') === 'new');
}

// ── 2. The server ───────────────────────────────────────────────────────────
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const RUN = Date.now().toString(36);
const TAG = `acv${RUN}`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const made = { users: [] as string[], articles: [] as string[], books: [] as string[], content: [] as string[], journals: [] as string[] };
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-${TAG}@api-test.invalid`, password: 'x', role } as any }); made.users.push(u.id);
  const sid = `sid-${TAG}-${role}`; await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};

// One shape of fixture per section and collection. Titles carry the tag so `q` isolates them.
type Fx = { domain: string | null; status: string; author?: string };
const FX = (c: Collection): Fx[] => [
  { domain: 'Nursing', status: 'Published', author: 'One, Two, Three, Four' },
  { domain: 'Nursing', status: 'Draft' },
  { domain: 'Law', status: 'Published' },
  { domain: null, status: 'Published' },
  { domain: '', status: 'Draft' },
  { domain: 'Engineering', status: c === 'archived' ? 'published' : 'Published' },   // not a department of the registry; archived rows carry a lower-case status
  ...(c === 'new' ? [{ domain: 'Law', status: 'Rejected' }] : []),
];
const journal = await (db as any).journal.create({ data: { title: `Journal ${TAG}`, issn: `9${RUN.slice(-3).padStart(3, '0')}-0000`, status: 'Accepted' } }).catch(() => null);
if (journal) made.journals.push(journal.id);
const expected: Record<string, Fx[]> = {};
let n = 0;
for (const sec of ADMIN_SECTIONS) {
  for (const c of ['new', 'archived'] as Collection[]) {
    const rows = FX(c);
    expected[`${sec}|${c}`] = rows;
    for (const f of rows) {
      const title = `${TAG} ${sec} ${c} #${++n}`;
      if (c === 'archived') {
        made.content.push((await db.content.create({ data: { title, authors: f.author || 'Solo Author', domain: f.domain, contentType: sec, status: f.status, accessType: 'Subscription', publishedAt: new Date(Date.now() - n * 1000) } as any })).id);
      } else if (sec === 'Books') {
        made.books.push((await (db as any).book.create({ data: { title, authors: f.author || 'Solo Author', domain: f.domain, status: f.status, accessType: 'OpenAccess', ownershipSource: 'AdminEntered', createdAt: new Date(Date.now() - n * 1000) } })).id);
      } else {
        made.articles.push((await (db as any).article.create({ data: { title, authors: f.author || 'Solo Author', domain: f.domain, contentType: sec, status: f.status, accessType: 'OpenAccess', ownershipSource: 'AdminEntered', createdAt: new Date(Date.now() - n * 1000), journalId: sec === 'Periodicals' && journal ? journal.id : null, journalName: sec === 'Periodicals' ? `Journal ${TAG}` : null } })).id);
      }
    }
  }
}
const tokens = { admin: await mkUser('SuperAdmin'), manager: await mkUser('SubscriptionManager'), reader: await mkUser('Subscriber'), student: await mkUser('Student') };

const PORT = 3119, BASE = `http://127.0.0.1:${PORT}`;
const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199', AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', DISABLE_HMR: 'true' },
});
let log = ''; child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));
const get = async (path: string, token: string | null = tokens.admin) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const t = await r.text(); let data: any = null; try { data = JSON.parse(t); } catch { }
  return { status: r.status, data };
};
const cleanup = async () => {
  try { process.kill(-child.pid!, 'SIGTERM'); } catch { }
  await sleep(1200);
  await (db as any).article.deleteMany({ where: { id: { in: made.articles } } }); await (db as any).book.deleteMany({ where: { id: { in: made.books } } });
  await db.content.deleteMany({ where: { id: { in: made.content } } }); await (db as any).journal.deleteMany({ where: { id: { in: made.journals } } }).catch(() => { });
  await db.userSession.deleteMany({ where: { userId: { in: made.users } } }); await db.user.deleteMany({ where: { id: { in: made.users } } });
};
const canon = (d: string | null) => (d && (CANONICAL_NAMES as readonly string[]).includes(d) ? d : null);
const listUrl = (sec: string, c: Collection, extra = '') => `${c === 'archived' ? '/api/admin/content' : '/api/admin/library/items'}?contentType=${encodeURIComponent(sec)}&search=${TAG}&limit=100${extra}`;
const ovUrl = (sec: string, c: Collection, extra = '') => `/api/admin/library/overview?contentType=${encodeURIComponent(sec)}&collection=${c}&q=${TAG}${extra}`;

try {
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch { } if (Date.now() - t0 > 120_000) throw new Error('server did not start\n' + log.slice(-1500)); await sleep(700); }
  await sleep(800);

  for (const sec of ADMIN_SECTIONS) {
    for (const c of ['new', 'archived'] as Collection[]) {
      section(`2. ${sec} · ${c === 'new' ? 'New' : 'Archived'} collection`);
      const fx = expected[`${sec}|${c}`];
      const isPublic = (f: Fx) => (c === 'new' ? f.status === 'Published' : f.status.toLowerCase() !== 'draft');
      const ov = (await get(ovUrl(sec, c))).data;
      check('the overview answers for this section and collection', ov?.section === sec && ov?.collection === c && !!ov.generatedAt, ov?.error);
      check('says what one record is', ov.unit === SECTION_LABELS[sec].unit[c], ov.unit);
      check('every department of the registry is listed, zero ones too', ov.departments.length === CANONICAL_NAMES.length && ov.departments.some((d: any) => d.total === 0));
      const want = (d: string) => fx.filter(f => canon(f.domain) === d);
      check('Nursing total and public are exact', (() => { const d = ov.departments.find((x: any) => x.name === 'Nursing'); return d.total === want('Nursing').length && d.public === want('Nursing').filter(isPublic).length; })(), ov.departments.find((x: any) => x.name === 'Nursing'));
      check('Law total and public are exact', (() => { const d = ov.departments.find((x: any) => x.name === 'Law'); return d.total === want('Law').length && d.public === want('Law').filter(isPublic).length; })());
      const un = fx.filter(f => !canon(f.domain));
      check('Unassigned = no department + blank + unrecognised', ov.unassigned.total === un.length && ov.unassigned.blank === fx.filter(f => !f.domain).length && ov.unassigned.unrecognised === fx.filter(f => f.domain === 'Engineering').length && ov.unassigned.public === un.filter(isPublic).length, ov.unassigned);
      check('the unrecognised name is listed so someone can decide', ov.unassigned.labels.some((l: any) => l.name === 'Engineering'));
      check('departments + Unassigned = the filtered total = the table total', ov.filteredTotal === fx.length && ov.reconciles === true && (await get(listUrl(sec, c))).data.total === fx.length, [ov.filteredTotal, fx.length]);
      check('…and for public only', ov.filteredPublic === fx.filter(isPublic).length && (await get(listUrl(sec, c, '&visibility=public'))).data.total === fx.filter(isPublic).length);
      // clicking a department filters the table to exactly that count
      const nur = await get(listUrl(sec, c, '&domain=Nursing'));
      check('Nursing: the table shows exactly its count', nur.data.total === want('Nursing').length && nur.data.data.every((r: any) => r.domain === 'Nursing'));
      check('Unassigned: the table shows exactly its count', (await get(listUrl(sec, c, `&domain=${NO_DEPARTMENT}`))).data.total === un.length);
      check('a zero-count department filters to an empty table, not an error', (await get(listUrl(sec, c, '&domain=Agriculture'))).data.total === 0);
      check('Nursing + public only', (await get(listUrl(sec, c, '&domain=Nursing&visibility=public'))).data.total === want('Nursing').filter(isPublic).length);
      // counts follow the other filters, and the other departments stay discoverable
      const dr = (await get(ovUrl(sec, c, '&status=Draft'))).data;
      const draftN = fx.filter(f => f.status === 'Draft').length;
      check('status=Draft: counts follow it, every department stays listed', dr.filteredTotal === draftN && dr.departments.length === CANONICAL_NAMES.length && (await get(listUrl(sec, c, '&status=Draft'))).data.total === draftN);
      check('status=Published matches the lower-case archived rows too', (await get(listUrl(sec, c, '&status=Published'))).data.total === fx.filter(f => f.status.toLowerCase() === 'published').length);
      const found = (await get(`${c === 'archived' ? '/api/admin/content' : '/api/admin/library/items'}?contentType=${encodeURIComponent(sec)}&search=${encodeURIComponent(TAG + ' ' + sec + ' ' + c + ' #')}&limit=100`)).data;
      check('search finds the section\'s own rows only', found.total === fx.length);
      // sort + paging
      const byTitle = (await get(listUrl(sec, c, '&sort=title'))).data.data.map((r: any) => r.title);
      check('sort=title orders by title', JSON.stringify(byTitle) === JSON.stringify([...byTitle].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0))));
      const newest = (await get(listUrl(sec, c, '&sort=added'))).data.data.map((r: any) => r.id), oldest = (await get(listUrl(sec, c, '&sort=oldest'))).data.data.map((r: any) => r.id);
      check('newest and oldest are opposite orders', newest.length > 1 && JSON.stringify([...newest].reverse()) === JSON.stringify(oldest));
      const p1 = (await get(listUrl(sec, c).replace('limit=100', 'limit=3'))).data, p2 = (await get(listUrl(sec, c).replace('limit=100', 'limit=3') + '&page=2')).data;
      check('paging: total stable, pages do not overlap', p1.total === p2.total && p1.data.length === 3 && !p1.data.some((x: any) => p2.data.some((y: any) => y.id === x.id)));
      // the whole-collection figures against independent queries on the same dataset
      const model = c === 'archived' ? (db as any).content : sec === 'Books' ? (db as any).book : (db as any).article;
      const baseWhere = c === 'archived' ? { contentType: sec } : sec === 'Books' ? {} : sec === 'Periodicals' ? { OR: [{ contentType: 'Periodicals' }, { contentType: null }] } : { contentType: sec };
      const wholeOv = (await get(`/api/admin/library/overview?contentType=${encodeURIComponent(sec)}&collection=${c}`)).data;
      const [rawTotal, rawDraft] = [await model.count({ where: baseWhere }), await model.count({ where: { AND: [baseWhere, c === 'archived' ? { status: { equals: 'Draft', mode: 'insensitive' } } : { status: 'Draft' }] } })];
      check('cards: total and draft equal an independent count', wholeOv.summary.total === rawTotal && wholeOv.summary.draft === rawDraft, [wholeOv.summary, rawTotal, rawDraft]);
      check('cards: total = departments + Unassigned (no filter)', wholeOv.filteredTotal === rawTotal && wholeOv.reconciles);
      check('cards: public + draft + rejected + other = total', wholeOv.summary.public + wholeOv.summary.draft + wholeOv.summary.rejected + wholeOv.summary.other === wholeOv.summary.total);
      const other: Collection = c === 'new' ? 'archived' : 'new';
      const otherModel = other === 'archived' ? (db as any).content : sec === 'Books' ? (db as any).book : (db as any).article;
      const otherBase = other === 'archived' ? { contentType: sec } : sec === 'Books' ? {} : sec === 'Periodicals' ? { OR: [{ contentType: 'Periodicals' }, { contentType: null }] } : { contentType: sec };
      check('the other collection\'s count is the other table\'s', wholeOv.collections[other].total === await otherModel.count({ where: otherBase }));
    }
  }

  section('3. Periodicals: records are articles — not journal titles, not issues');
  {
    const ov = (await get(ovUrl('Periodicals', 'new'))).data;
    const articlesInJournal = await (db as any).article.count({ where: { id: { in: made.articles }, contentType: 'Periodicals', journalId: journal?.id ?? '__x' } });
    check('the fixture journal holds several articles, and the count is of articles', ov.summary.total >= 1 && ov.filteredTotal === expected['Periodicals|new'].length && (!journal || articlesInJournal === expected['Periodicals|new'].length), [ov.filteredTotal, articlesInJournal]);
    check('the number is not the number of distinct journals (that is 1)', ov.filteredTotal > 1);
    check('the unit says so', /individual article \(not a journal title or an issue\)/.test(ov.unit));
    const whole = (await get('/api/admin/library/overview?contentType=Periodicals&collection=new')).data;
    const rawArticles = await (db as any).article.count({ where: { OR: [{ contentType: 'Periodicals' }, { contentType: null }] } });
    check('the card equals the Article count, not the Journal count', whole.summary.total === rawArticles && whole.summary.total !== await (db as any).journal.count());
    check('archived Periodicals are papers (Content rows), a different table', (await get('/api/admin/library/overview?contentType=Periodicals&collection=archived')).data.unit.includes('paper'));
  }

  section('4. Authorization and failure');
  {
    check('no sign-in: 401', (await get(ovUrl('Books', 'new'), null)).status === 401 && (await get(listUrl('Books', 'new'), null)).status === 401);
    check('a reader and a student are refused', (await get(ovUrl('Books', 'new'), tokens.reader)).status === 403 && (await get(ovUrl('Books', 'new'), tokens.student)).status === 403 && (await get(listUrl('Books', 'new'), tokens.reader)).status === 403);
    check('a subscription manager may read the New collection counts and list', (await get(ovUrl('Magazines', 'new'), tokens.manager)).status === 200 && (await get(listUrl('Magazines', 'new'), tokens.manager)).status === 200);
    check('…and sees no archived figures in them', (await get(ovUrl('Magazines', 'new'), tokens.manager)).data.collections.archived === null);
    check('…but not the archived collection', (await get(ovUrl('Magazines', 'archived'), tokens.manager)).status === 403 && (await get(listUrl('Magazines', 'archived'), tokens.manager)).status === 403);
    check('a super admin sees both', (await get(ovUrl('Magazines', 'new'))).data.collections.archived !== null);
    check('an unknown section is a clear 400, not an empty list', (await get('/api/admin/library/overview?contentType=Journals&collection=new')).status === 400 && (await get('/api/admin/library/items?contentType=Nope')).status === 400);
    check('a garbage collection falls back to New', (await get('/api/admin/library/overview?contentType=Books&collection=x')).data.collection === 'new');
    const mag = (await get('/api/admin/library/overview?contentType=Magazines&collection=new')).data;
    check('Magazines: New holds only the fixtures, Archived holds more than the fixtures — so "open the other collection" is truthful', mag.summary.total === expected['Magazines|new'].length && mag.collections.archived.total >= expected['Magazines|archived'].length);
  }
} finally {
  await cleanup().catch(e => console.log('cleanup:', e?.message));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
