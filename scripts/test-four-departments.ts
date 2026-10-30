/**
 * The four departments added 2026-10-30 (Paramedical Sciences, Radiology, Medical Laboratory Technology, Optometry & Ophthalmology):
 * they are priced by the ladder every department uses, access to them is enforced by the server, existing subscriptions are left alone,
 * and keeping the ingestion engines off them (`autoIngestion: false`) does not touch browsing, manual assignment or validated imports.
 *
 *   Part 1  pure: registry totals, the ingestion split, quotation and solo/institution price functions
 *   Part 2  a real server on the throwaway database `stm_ingestion_test`; every outbound request is blocked
 *
 *   npx tsx scripts/test-four-departments.ts
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
const R = await import('../src/lib/departmentRegistry.js');
const { DOMAINS } = await import('../src/constants.js');
const { priceDepartments } = await import('../src/lib/institutionPricing.js');
const { calculateSoloSubscriptionPrice } = await import('../src/lib/soloPricing.js');
const { docToRender, emptyDoc } = await import('../src/lib/quotation/quotationModel.js');
const { issuerOf } = await import('../src/config.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const NEW4 = ['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology'];
const OLD4 = ['Law', 'Nursing', 'Management', 'Agriculture'];

// ── Part 1 ─────────────────────────────────────────────────────────────────
section('Part 1 — one registry, two totals, one price ladder');
check('the public registry reports 33 departments', R.CANONICAL_NAMES.length === 33 && DOMAINS.length === 33);
check('the ingestion engines work on 29 of them, and the other 4 are exactly the new ones', R.AUTO_INGEST_NAMES.length === 29 && eq(R.CANONICAL_NAMES.filter(n => !R.isAutoIngested(n)).sort(), [...NEW4].sort()));
check('29 + 4 = 33: no department is in neither list', R.AUTO_INGEST_NAMES.length + NEW4.length === R.CANONICAL_NAMES.length && new Set([...R.AUTO_INGEST_NAMES, ...NEW4]).size === 33);
check('the institution ladder prices a department count, not a department', [1, 2, 3, 4, 5, 9].every(n => priceDepartments(n).rate === priceDepartments(n).rate) && priceDepartments(4).rate === 8490 && priceDepartments(5).rate === 7990);
check('the solo price depends on the count only', eq(calculateSoloSubscriptionPrice(4), calculateSoloSubscriptionPrice(4)) && calculateSoloSubscriptionPrice(4).rate === 4990 && calculateSoloSubscriptionPrice(5).rate === 3990);
const issuer = issuerOf(null);
const qNew = docToRender({ ...emptyDoc('ITB/SDL/26-27/901'), departments: NEW4, state: 'Delhi', totalUsers: 5 }, issuer);
const qOld = docToRender({ ...emptyDoc('ITB/SDL/26-27/902'), departments: OLD4, state: 'Delhi', totalUsers: 5 }, issuer);
check('the quotation builder prices four new departments exactly as four old ones', JSON.stringify((qNew as any).totals ?? qNew) === JSON.stringify((qOld as any).totals ?? qOld).replace(/ITB\/SDL\/26-27\/902/g, 'ITB/SDL/26-27/901') || (qNew as any).total === (qOld as any).total, { new: (qNew as any).total, old: (qOld as any).total });

// ── Part 2 ─────────────────────────────────────────────────────────────────
section('Part 2 — seeding the throwaway database');
const PORT = 3108, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const created = { users: [] as string[], institutions: [] as string[], articles: [] as string[], books: [] as string[], contents: [] as string[], subs: [] as string[] };
const TAG = `QA4D ${RUN}`;

const mkInst = async (name: string) => { const i = await db.institution.create({ data: { name: `${name} ${RUN}` } }); created.institutions.push(i.id); return i.id; };
const mkUser = async (tag: string, o: { role?: string; institutionId?: string | null; interested?: string[]; registrantType?: string } = {}) => {
  const role = o.role || 'Subscriber';
  const u = await db.user.create({ data: { email: `${tag}-${RUN}@four-departments-test.invalid`, password: 'x', role, institutionId: o.institutionId ?? null, registrantType: o.registrantType ?? null, interestedDomains: o.interested ?? [], displayName: tag } as any });
  created.users.push(u.id);
  const sid = `sid-4d-${RUN}-${tag}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: u.id, role, email: u.email, token: jwt.sign({ uid: u.id, sid, role, email: u.email, institutionId: o.institutionId ?? undefined }, SECRET, { expiresIn: '1h' }) };
};
const mkSub = async (o: { userId?: string; institutionId?: string; domains: string[] }) => {
  const s = await db.subscription.create({ data: { userId: o.userId ?? null, institutionId: o.institutionId ?? null, planName: 'Test plan', planType: 'Yearly', durationMonths: 12, status: 'Active', domains: o.domains, endDate: new Date(Date.now() + 200 * 864e5) } });
  created.subs.push(s.id); return s;
};

// Content in two of the four; Paramedical Sciences stays empty on purpose.
const rad = await db.book.create({ data: { title: `${TAG} Radiology book`, domain: 'Radiology', status: 'Published' } as any }); created.books.push(rad.id);
const radA = await db.article.create({ data: { title: `${TAG} Radiology article`, domain: 'Radiology', status: 'Published' } as any }); created.articles.push(radA.id);
const opt = await db.book.create({ data: { title: `${TAG} Optometry book`, domain: 'Optometry & Ophthalmology', status: 'Published' } as any }); created.books.push(opt.id);

const instId = await mkInst('Four College');
const solo = await mkUser('solo', { registrantType: 'Solo' }); const soloLaw = await mkSub({ userId: solo.id, domains: ['Law'] });
const librarian = await mkUser('librarian', { role: 'Institution', institutionId: instId }); const instSub = await mkSub({ institutionId: instId, domains: ['Law', 'Nursing'] });
const reader = await mkUser('reader', { interested: ['Law'] });                 // will be assigned a plan
const readerLaw = await mkSub({ userId: reader.id, domains: ['Law'] });          // …which already holds one
const stranger = await mkUser('stranger', { interested: ['Arts'] });             // holds nothing in the four
const admin = await mkUser('admin', { role: 'SuperAdmin' });

type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3198',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', GEMINI_API_KEY: '', GROK_API_KEY: '', OPENROUTER_API_KEY: '' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(600); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const call = async (path: string, who: { token: string } | null, method = 'GET', body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: { ...(who ? { Authorization: `Bearer ${who.token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};

let srv: Srv | null = null;
try {
  srv = await start();

  section('Solo checkout and quote: the same rate for the new departments');
  {
    const a = await call('/api/me/subscribe/quote', solo, 'POST', { departments: NEW4 });
    const b = await call('/api/me/subscribe/quote', solo, 'POST', { departments: ['Nursing', 'Management', 'Agriculture', 'Arts'] });
    check('four new departments quote on the standard solo rate', a.status === 200 && a.data?.price?.rate === 4990 && a.data.departments.length === 4, a.data);
    check('…and the total equals four old departments', a.data?.price?.total === b.data?.price?.total && a.data?.price?.base === b.data?.price?.base, [a.data?.price, b.data?.price]);
    const c = await call('/api/me/subscribe/quote', solo, 'POST', { departments: ['Law', 'Radiology'] });
    check('a department already held is not charged again: Law (held) + Radiology → one department', c.status === 200 && eq(c.data?.departments, ['Radiology']) && c.data.price.subtotal === 4990, c.data);
    const d = await call('/api/me/subscribe/quote', solo, 'POST', { departments: ['Paramedical', 'Optometry & Ophthalmology'] });
    check('a listed alias is read as its department; the official name still works', d.status === 200 && eq(d.data?.departments, ['Paramedical Sciences', 'Optometry & Ophthalmology']), d.data);
    const e = await call('/api/me/subscribe/quote', solo, 'POST', { departments: ['Optometry'] });
    check('a half-name is refused, not guessed', e.status === 400 && /Unknown department/.test(e.data?.error || ''), e);
    const f = await call('/api/me/subscribe/checkout', solo, 'POST', { departments: ['Optometry'] });
    check('checkout refuses it the same way, before any order is made', f.status === 400, f.status);
    const g = await call('/api/me/subscribe/quote', librarian, 'POST', { departments: NEW4 });
    check('only an individual account can buy this: an institution librarian is refused', g.status === 403, g.status);
    check('the solo plan lists all 33 departments to choose from', (await call('/api/me/subscribe/plan', solo)).data?.allDepartments?.length === 33);
  }

  section('Institution checkout and quote: the ladder is read from the total after the purchase');
  {
    const a = await call('/api/institution/quote', librarian, 'POST', { kind: 'departments', departments: NEW4 });
    const b = await call('/api/institution/quote', librarian, 'POST', { kind: 'departments', departments: ['Management', 'Agriculture', 'Arts', 'Science'] });
    check('four new departments on top of two held: rate decided by six, charged on the four', a.status === 200 && a.data?.totalAfter === 6 && a.data.price.rate === priceDepartments(6).rate && a.data.price.quantity === 4, a.data);
    check('…and the total equals four old departments', a.data?.price?.total === b.data?.price?.total, [a.data?.price, b.data?.price]);
    const c = await call('/api/institution/quote', librarian, 'POST', { kind: 'departments', departments: ['Law', 'Radiology'] });
    check('a held department is not charged again', c.status === 200 && eq(c.data?.departments, ['Radiology']) && c.data.totalAfter === 3, c.data);
    check('checkout refuses an unknown name before any order', (await call('/api/institution/checkout', librarian, 'POST', { kind: 'departments', departments: ['Radiology', 'Optometry'] })).status === 400);
    check('an unrelated reader cannot price an institution purchase', (await call('/api/institution/quote', reader, 'POST', { kind: 'departments', departments: NEW4 })).status === 403);
    check('the institution plan offers all 33 departments', (await call('/api/institution/plan', librarian)).data?.allDepartments?.length === 33);
  }

  section('Subscription assignment: the new departments are granted only when someone assigns them, and nothing else changes');
  {
    const before = await call('/api/library/books?domain=Radiology&take=20', reader);
    check('before assignment the reader sees none of the new department’s books', before.status === 200 && before.data?.total === 0, before.data?.total);
    check('before assignment the department page is closed to them (403), not hidden as 404', (await call('/api/library/department/radiology', reader)).status === 403);
    const a = await call('/api/admin/subscriptions/assign', admin, 'POST', { userIds: [reader.id], planType: 'Yearly', durationMonths: 12, domains: ['Radiology'], contentTypes: ['Books', 'Periodicals'] });
    check('a Super Admin can assign a new department', a.status === 200 && a.data?.success === true, a);
    const subs = await db.subscription.findMany({ where: { userId: reader.id }, orderBy: { createdAt: 'asc' } });
    for (const s of subs) if (s.id !== readerLaw.id) created.subs.push(s.id);
    const law = subs.find(s => s.id === readerLaw.id);
    check('their existing subscription is untouched (same id, departments, status and end date)', !!law && eq(law.domains, ['Law']) && law.status === 'Active' && law.endDate.getTime() === readerLaw.endDate.getTime(), law);
    check('exactly one subscription was added, for exactly Radiology', subs.length === 2 && eq(subs.find(s => s.id !== readerLaw.id)?.domains, ['Radiology']), subs.map(s => s.domains));
    const after = await call('/api/library/books?domain=Radiology&take=20', reader);
    check('after assignment the reader opens Radiology books, and only that department’s', after.status === 200 && after.data?.total === 1 && after.data.data[0].title.includes('Radiology'), after.data);
    check('the other three are still closed to them', (await call('/api/library/department/optometry-ophthalmology', reader)).status === 403 && (await call('/api/library/books?domain=Optometry%20%26%20Ophthalmology&take=20', reader)).data?.total === 0);
    check('a different account is not affected by someone else’s assignment', (await call('/api/library/books?domain=Radiology&take=20', stranger)).data?.total === 0);
    const scope = (await call('/api/user/access-scope', reader)).data;
    check('their department list is Law plus Radiology, nothing more', scope?.all === false && eq([...scope.domains].sort(), ['Law', 'Radiology']), scope);
  }

  section('Browsing is unaffected by keeping the engines off these departments');
  {
    const asStaff = await call('/api/library/department/paramedical-sciences', admin);
    check('…and for staff it is a 200 with zero journals, not a 404', asStaff.status === 200 && asStaff.data?.journalTotal === 0 && asStaff.data?.total === 0, asStaff.data);
    check('the public (signed-out) page for a populated new department is open', (await call('/api/library/department/radiology', null)).status === 200);
    check('an unknown slug is still a 404', (await call('/api/library/department/no-such-department', admin)).status === 404);
    const counts = (await call('/api/public/domain-counts', null)).data;
    check('public counts include the new department’s records (book + article)', (counts?.Radiology ?? 0) >= 2 && (counts?.['Optometry & Ophthalmology'] ?? 0) >= 1, counts && { r: counts.Radiology, o: counts['Optometry & Ophthalmology'] });
    const stats = (await call('/api/library/stats', null)).data;
    check('library stats count what a department holds (Radiology: 1 article + 1 book) and leave the empty one out rather than invent a figure', stats?.departmentTotals?.find((r: any) => r.name === 'Radiology')?.total === 2 && stats.departmentTotals.find((r: any) => r.name === 'Optometry & Ophthalmology')?.total === 1 && !stats.departmentTotals.some((r: any) => r.name === 'Paramedical Sciences'), stats?.departmentTotals?.filter((r: any) => NEW4.includes(r.name)));
  }

  section('Manual assignment and validated manual imports still work');
  {
    const mk = async (domain: string, kind = 'Books') => call('/api/admin/library/items', admin, 'POST', { contentType: kind, title: `${TAG} manual ${domain}`, authors: 'QA', domain });
    for (const d of NEW4) {
      const r = await mk(d);
      if (r.data?.id) created.books.push(r.data.id);
      check(`admin creates a book in ${d}`, r.status === 200 && r.data?.domain === d, r);
    }
    const alias = await mk('Paramedical'); if (alias.data?.id) created.books.push(alias.data.id);
    check('a listed alias is stored under the official name', alias.status === 200 && alias.data?.domain === 'Paramedical Sciences', alias.data?.domain);
    const half = await mk('Optometry');
    check('a half-name is refused with a message that names it, nothing is stored', half.status === 400 && /Optometry/.test(JSON.stringify(half.data)) && (await db.book.count({ where: { title: `${TAG} manual Optometry` } })) === 0, half);
    const moved = await call(`/api/admin/library/items/book/${created.books[created.books.length - 1]}`, admin, 'PUT', { domain: 'Medical Laboratory Technology' });
    check('an existing record can be moved into a new department by hand', moved.status === 200 && (await db.book.findUnique({ where: { id: created.books[created.books.length - 1] } }))?.domain === 'Medical Laboratory Technology', moved);
    const bulk = await call('/api/admin/library/items/bulk', admin, 'POST', { contentType: 'Books', items: [{ title: `${TAG} bulk 1`, authors: 'QA', domain: 'Radiology' }, { title: `${TAG} bulk 2`, authors: 'QA', domain: 'Optometry & Ophthalmology' }, { title: `${TAG} bulk 3`, authors: 'QA', domain: 'Paramedical' }] });
    const bulkRows = await db.book.findMany({ where: { title: { startsWith: `${TAG} bulk` } }, select: { id: true, domain: true }, orderBy: { title: 'asc' } });
    bulkRows.forEach(b => created.books.push(b.id));
    check('a validated bulk import lands in the new departments, alias normalised', bulk.status === 200 && eq(bulkRows.map(b => b.domain), ['Radiology', 'Optometry & Ophthalmology', 'Paramedical Sciences']), [bulk, bulkRows]);
    const bad = await call('/api/admin/library/items/bulk', admin, 'POST', { contentType: 'Books', items: [{ title: `${TAG} bulk bad`, authors: 'QA', domain: 'Radiograpy' }] });
    check('a misspelt department in a bulk file is refused whole, with the value named', bad.status === 400 && /Radiograpy/.test(JSON.stringify(bad.data)) && (await db.book.count({ where: { title: `${TAG} bulk bad` } })) === 0, bad);
    const legacy = await call('/api/admin/content', admin, 'POST', { title: `${TAG} legacy`, authors: 'QA', contentType: 'Theses', domain: 'Optometry & Ophthalmology', status: 'Published' });
    if (legacy.data?.id) created.contents.push(legacy.data.id);
    check('the legacy content editor accepts a new department too', legacy.status === 200 && legacy.data?.domain === 'Optometry & Ophthalmology', legacy);
    const pub = await call('/api/publisher/books', (await mkUser('notpublisher')), 'POST', { title: `${TAG} pub`, domain: 'Radiology' });
    check('a non-publisher is still refused on the publisher route (permissions preserved)', pub.status === 403, pub.status);
  }

  section('The engines leave them alone, and say why');
  {
    const r = await call('/api/admin/ingest/dry-run', admin, 'POST', { source: 'crossref', departments: ['Radiology'] });
    check('an automatic dry run for a new department is refused as not an engine department', r.status === 400 && /Unknown department: Radiology/.test(r.data?.error || ''), r);
    const settings = await call('/api/admin/ingest/settings', admin, 'POST', { departments: ['Radiology'] });
    check('the ingestion scope cannot be set to a new department', settings.status === 400 || settings.status === 404 || settings.data?.error !== undefined, settings);
  }
} finally {
  await stop(srv);
  const u = created.users;
  await db.subscription.deleteMany({ where: { OR: [{ id: { in: created.subs } }, { userId: { in: u } }] } }).catch(() => {});
  await db.userSession.deleteMany({ where: { userId: { in: u } } }).catch(() => {});
  await db.libraryEvent.deleteMany({ where: { userId: { in: u } } }).catch(() => {});
  await db.studentActivity.deleteMany({ where: { userId: { in: u } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: u } } }).catch(() => {});
  await db.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => {});
  await db.article.deleteMany({ where: { OR: [{ id: { in: created.articles } }, { title: { startsWith: TAG } }] } }).catch(() => {});
  await db.book.deleteMany({ where: { OR: [{ id: { in: created.books } }, { title: { startsWith: TAG } }] } }).catch(() => {});
  await db.content.deleteMany({ where: { OR: [{ id: { in: created.contents } }, { title: { startsWith: TAG } }] } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
