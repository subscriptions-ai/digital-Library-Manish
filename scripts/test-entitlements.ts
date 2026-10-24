/**
 * Department entitlement: ONE answer to "which departments may this account open?", and every surface that obeys it.
 *
 *   Part 1  the pure resolver (no database)
 *   Part 2  a real server on the throwaway database `stm_ingestion_test`: dashboards, library, search, filters, the full-text gate,
 *           and direct API manipulation. Every outbound request is blocked.
 *
 *   npx tsx scripts/test-entitlements.ts
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
const E = await import('../src/server/entitlements.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const FOUR = ['Law', 'Nursing', 'Management', 'Agriculture'];
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Part 1 — the resolver ──────────────────────────────────────────────────
section('Part 1 — the resolver');
const base = { role: 'Subscriber', institutionId: null as string | null, selected: [] as unknown, ownSubs: [] as any[], institutionSubs: [] as any[], institutionSelected: [] as unknown[] };
const R = (o: Partial<typeof base>) => E.resolveEntitlement({ ...base, ...o });
const sorted = (xs: string[]) => [...xs].sort();

check('individual, 4 selected, no plan → exactly those 4 (free preview)', eq(R({ selected: FOUR }).departments, sorted(FOUR)) && !R({ selected: FOUR }).all && R({ selected: FOUR }).source === 'selected');
check('individual, nothing selected, no plan → NO departments (never all)', R({}).departments.length === 0 && !R({}).all && R({}).source === 'none');
check('an empty selection is "none", not "all"', !R({ selected: [] }).all && R({ selected: [] }).departments.length === 0);
check('unknown names are not entitlements', R({ selected: ['Underwater Basket Weaving'] }).departments.length === 0);
check('a spelling variant resolves to the official name', eq(R({ selected: ['Biotechnology'] }).departments, ['Bio Technology']));
check('a plan naming departments → those, not the selection', eq(R({ selected: FOUR, ownSubs: [{ domains: ['Law'], userId: 'u' }] }).departments, ['Law']));
check('Premium does not grant everything: a one-department plan is one department', R({ ownSubs: [{ domains: ['Law'], userId: 'u' }] }).departments.length === 1);
check('a plan that lists no departments (a Pro approval) is NOT the whole catalogue: it applies to the selected ones', eq(R({ selected: FOUR, ownSubs: [{ domains: [], domainName: null, userId: 'u' }] }).departments, sorted(FOUR)) && !R({ selected: FOUR, ownSubs: [{ domains: [], domainName: null, userId: 'u' }] }).all);
check('…and with nothing selected it covers nothing', R({ ownSubs: [{ domains: [], domainName: null, userId: 'u' }] }).departments.length === 0 && !R({ ownSubs: [{ domains: [], domainName: null, userId: 'u' }] }).all);
check('a named plan beside an unlisted one: the named departments plus the selected ones', eq(R({ selected: ['Arts'], ownSubs: [{ domains: ['Law'], userId: 'u' }, { domains: [], userId: 'u' }] }).departments, ['Arts', 'Law']));
check('an institution plan that lists none covers the departments its administrator chose, not everything', eq(R({ ...{ institutionId: 'i1', role: 'Student' }, institutionSubs: [{ domains: [], institutionId: 'i1' }], institutionSelected: [FOUR] }).departments, sorted(FOUR)));
check('"All Domains" with no list is the one explicit way to hold everything', R({ ownSubs: [{ domains: [], domainName: 'All Domains', userId: 'u' }] }).all);
check('…and then there is no department list to filter by', R({ ownSubs: [{ domains: [], domainName: 'All Domains', userId: 'u' }] }).departments.length === 0);
check('upgrade adds a fifth department → five immediately', R({ ownSubs: [{ domains: [...FOUR, 'Arts'], userId: 'u' }] }).departments.length === 5);
check('staff roles hold every department', ['SuperAdmin', 'Admin', 'ContentManager'].every(role => R({ role }).all));
check('Free Preview does not make a registered account "all"', !R({ role: 'Subscriber', selected: FOUR }).all);
const inst = { institutionId: 'i1', role: 'Institution' };
check('institution owner, 4 chosen, no plan → 4 (not the whole catalogue)', eq(R({ ...inst, selected: FOUR, institutionSelected: [FOUR] }).departments, sorted(FOUR)) && !R({ ...inst, selected: FOUR, institutionSelected: [FOUR] }).all);
check('institution with a plan of 2 → 2, even though 4 were chosen at registration', eq(R({ ...inst, selected: FOUR, institutionSubs: [{ domains: ['Law', 'Nursing'], institutionId: 'i1' }], institutionSelected: [] }).departments, ['Law', 'Nursing']));
check('a member inherits the institution (4 chosen, no plan yet)', eq(R({ role: 'Student', institutionId: 'i1', selected: [], institutionSelected: [FOUR] }).departments, sorted(FOUR)));
check('a member never exceeds the institution plan, whatever they chose themselves', eq(R({ role: 'Student', institutionId: 'i1', selected: ['Arts', 'Law', 'Nursing'], institutionSubs: [{ domains: ['Law'], institutionId: 'i1' }] }).departments, ['Law']));
check('a member of an institution with nothing chosen and no plan → none', R({ role: 'Student', institutionId: 'i1' }).departments.length === 0);
check('a member’s own purchase adds to the institution’s, nothing else does', eq(R({ role: 'Student', institutionId: 'i1', institutionSubs: [{ domains: ['Law'], institutionId: 'i1' }], ownSubs: [{ domains: ['Arts'], userId: 'm' }] }).departments, ['Arts', 'Law']));
check('the member’s institution ceiling is reported', eq(R({ role: 'Student', institutionId: 'i1', institutionSubs: [{ domains: ['Law'], institutionId: 'i1' }] }).institutionCeiling?.departments, ['Law']));
const four = R({ selected: FOUR });
check('allows: a held department, any spelling', E.entitlementAllows(four, 'Law') && E.entitlementAllows(four, 'law'));
check('refuses: a department not held', !E.entitlementAllows(four, 'Arts'));
check('refuses: unclassified content (no department) for a scoped account', !E.entitlementAllows(four, null) && !E.entitlementAllows(four, ''));
check('staff are allowed unclassified content (review queue)', E.entitlementAllows(R({ role: 'SuperAdmin' }), null));
check('scope: undefined only for "all"; an empty list is an empty list', E.scopeOf(R({ role: 'Admin' })) === undefined && eq(E.scopeOf(R({})), []));
check('narrow: asking for a held department keeps it', eq(E.narrowToEntitlement(four, 'Law'), ['Law']));
check('narrow: asking for a department not held → refused (null)', E.narrowToEntitlement(four, 'Arts') === null);
check('narrow: a held and a not-held department → only the held one', eq(E.narrowToEntitlement(four, ['Law', 'Arts']), ['Law']));
check('narrow: no request → everything they may open', eq(E.narrowToEntitlement(four, undefined), sorted(FOUR)));

// ── Part 2 — a real server ─────────────────────────────────────────────────
section('Part 2 — seeding the throwaway database');
const PORT = 3107, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const KW = `zqxkeyword${RUN}`;
const DEPTS = ['Law', 'Nursing', 'Management', 'Agriculture', 'Arts', 'Medical Sciences'];
const created = { users: [] as string[], institutions: [] as string[], articles: [] as string[], books: [] as string[], contents: [] as string[], subs: [] as string[] };

const mkInst = async (name: string) => { const i = await db.institution.create({ data: { name: `${name} ${RUN}` } }); created.institutions.push(i.id); return i.id; };
const mkUser = async (tag: string, o: { role?: string; institutionId?: string | null; interested?: string[] } = {}) => {
  const role = o.role || 'Subscriber';
  const u = await db.user.create({ data: { email: `${tag}-${RUN}@entitlement-test.invalid`, password: 'x', role, institutionId: o.institutionId ?? null, interestedDomains: o.interested ?? [], displayName: tag } });
  created.users.push(u.id);
  const sid = `sid-ent-${RUN}-${tag}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return { id: u.id, role, token: jwt.sign({ uid: u.id, sid, role, email: u.email, institutionId: o.institutionId ?? undefined }, SECRET, { expiresIn: '1h' }) };
};
const mkSub = async (o: { userId?: string; institutionId?: string; domains: string[]; domainName?: string | null }) => {
  const s = await db.subscription.create({ data: { userId: o.userId ?? null, institutionId: o.institutionId ?? null, planName: 'Test plan', planType: 'Yearly', durationMonths: 12, status: 'Active',
    domains: o.domains, domainName: o.domainName ?? null, endDate: new Date(Date.now() + 200 * 864e5) } });
  created.subs.push(s.id); return s.id;
};

// Records: counts differ per department so a wrong scope cannot match by accident. Biotechnology/Bio Technology rows test the overlap rule.
const seedPlan: Record<string, { articles: number; books: number; contents: number }> = { Law: { articles: 3, books: 1, contents: 2 }, Nursing: { articles: 2, books: 0, contents: 1 },
  Management: { articles: 2, books: 1, contents: 0 }, Agriculture: { articles: 4, books: 2, contents: 1 }, Arts: { articles: 5, books: 0, contents: 2 }, 'Medical Sciences': { articles: 1, books: 0, contents: 1 } };
const idOf: Record<string, { article?: string; content?: string }> = {};
for (const [dom, n] of Object.entries(seedPlan)) {
  for (let i = 0; i < n.articles; i++) { const a = await db.article.create({ data: { title: `Ent article ${RUN} ${dom} ${i}${i === 0 ? ' ' + KW : ''}`, domain: dom, status: 'Published' } as any }); created.articles.push(a.id); if (i === 0) (idOf[dom] ||= {}).article = a.id; }
  for (let i = 0; i < n.books; i++) { const b = await db.book.create({ data: { title: `Ent book ${RUN} ${dom} ${i}`, domain: dom, status: 'Published' } as any }); created.books.push(b.id); }
  for (let i = 0; i < n.contents; i++) { const c = await db.content.create({ data: { title: `Ent content ${RUN} ${dom} ${i} ${KW}`, authors: 'Tester', contentType: 'Theses', domain: dom, status: 'Published', fileUrl: '/entitlement-test-missing.pdf' } as any }); created.contents.push(c.id); if (i === 0) (idOf[dom] ||= {}).content = c.id; }
}
// The same department spelled two ways: both rows count, each once.
for (const [dom, t] of [['Bio Technology', 'a'], ['Biotechnology', 'b']] as const) { const a = await db.article.create({ data: { title: `Ent bio ${RUN} ${t}`, domain: dom, status: 'Published' } as any }); created.articles.push(a.id); }
// Published and unclassified: nobody scoped may see it.
const unclassified = await db.article.create({ data: { title: `Ent unclassified ${RUN} ${KW}`, domain: null, status: 'Published' } as any }); created.articles.push(unclassified.id);

const instA = await mkInst('College A'), instB = await mkInst('College B'), instC = await mkInst('College C');
const indiv = await mkUser('individual', { interested: FOUR });
const nothing = await mkUser('nothing', { interested: [] });
const premiumOne = await mkUser('premium-one', { interested: FOUR }); await mkSub({ userId: premiumOne.id, domains: ['Law'] });
const explicitAll = await mkUser('explicit-all'); await mkSub({ userId: explicitAll.id, domains: [], domainName: 'All Domains' });
const emptyPlan = await mkUser('empty-plan', { interested: FOUR }); await mkSub({ userId: emptyPlan.id, domains: [], domainName: null });
const emptyPlanNoSelection = await mkUser('empty-plan-none'); await mkSub({ userId: emptyPlanNoSelection.id, domains: [], domainName: null });
const ownerA = await mkUser('owner-a', { role: 'Institution', institutionId: instA, interested: FOUR });
const studentA = await mkUser('student-a', { role: 'Student', institutionId: instA, interested: ['Arts', 'Medical Sciences'] });
const ownerB = await mkUser('owner-b', { role: 'Institution', institutionId: instB, interested: FOUR }); await mkSub({ institutionId: instB, domains: ['Law', 'Nursing'] });
const studentB = await mkUser('student-b', { role: 'Student', institutionId: instB });
const ownerC = await mkUser('owner-c', { role: 'Institution', institutionId: instC, interested: [] });
const staff = await mkUser('staff', { role: 'ContentManager' });
const admin = await mkUser('admin', { role: 'SuperAdmin' });

// Expected figures, counted straight from the tables with the department spellings.
const spell = (ds: string[]) => ds.flatMap(d => d === 'Bio Technology' ? ['Bio Technology', 'Biotechnology'] : [d]);
const expectTotal = async (ds: string[] | 'all') => {
  const where = ds === 'all' ? {} : { domain: { in: spell(ds) } };
  const [a, b, c] = await Promise.all([db.article.count({ where: { status: 'Published', ...where } as any }), db.book.count({ where: { status: 'Published', ...where } as any }), db.content.count({ where: { status: { not: 'Draft' }, ...where } as any })]);
  return a + b + c;
};

type Srv = { child: any; log: string };
const start = async (): Promise<Srv> => {
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'production', MEDIA_STORAGE_DRIVER: 'local-persistent', API_TEST_RUN: RUN, API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199', API_TEST_BLOCK_DELAY_MS: '50', DISABLE_HMR: 'true',
      AWS_S3_BUCKET: '', AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '' },
  });
  const srv: Srv = { child, log: '' };
  child.stdout.on('data', (d: any) => (srv.log += d)); child.stderr.on('data', (d: any) => (srv.log += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(`${BASE}/api/studio/posts`); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + srv.log.slice(-1500)); await sleep(600); }
  await sleep(800);
  return srv;
};
const stop = async (s: Srv | null) => { if (!s) return; try { process.kill(-s.child.pid!, 'SIGTERM'); } catch {} await sleep(1500); };
const call = async (path: string, who: { token: string } | null) => {
  const r = await fetch(BASE + path, { headers: who ? { Authorization: `Bearer ${who.token}` } : {} });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const names = (rows: any[]) => [...new Set(rows.map((r: any) => r.name))].sort();

let srv: Srv | null = null;
try {
  srv = await start();

  section('TEST 1 — individual with 4 departments');
  {
    const d = (await call('/api/user/dashboard', indiv)).data;
    check('"Your departments" is 4, and they are exactly the chosen four', d?.selectedDepartments === 4 && eq([...d.allowedDomains].sort(), sorted(FOUR)), [d?.selectedDepartments, d?.allowedDomains]);
    const want = await expectTotal(FOUR);
    check('"Open to you" counts only those four, from the tables — not the catalogue', d?.collection?.total === want && want < await expectTotal('all'), [d?.collection?.total, want]);
    check('the department chart lists only those four', d?.collection?.byDepartment.every((r: any) => FOUR.includes(r.name)) && d.collection.byDepartment.length === 4, names(d?.collection?.byDepartment || []));
    check('the entitlement block says where it comes from', d?.entitlement?.source === 'selected' && d.entitlement.all === false, d?.entitlement);
    const sc = (await call('/api/user/access-scope', indiv)).data;
    check('the department filter list is the four', sc?.all === false && eq([...sc.domains].sort(), sorted(FOUR)), sc);
    const fa = (await call('/api/user/available-facets', indiv)).data;
    const offered = [...(fa?.neu?.departments || []), ...(fa?.archived?.departments || []), ...(fa?.legacy?.departments || [])];
    check('available facets (the library dropdown) offer only those four', offered.length > 0 && offered.every((x: string) => FOUR.includes(x)), offered);
  }

  section('TEST 9/10 — distinct counts, overlapping spellings');
  {
    const bio = await mkUser('bio', { interested: ['Bio Technology'] });
    const d = (await call('/api/user/dashboard', bio)).data;
    const want = await expectTotal(['Bio Technology']);
    check('the two spellings of one department are counted once each (no double count)', d?.collection?.total === want && want >= 2, [d?.collection?.total, want]);
    check('…and are one line in the chart', d?.collection?.byDepartment.length === 1 && d.collection.byDepartment[0].name === 'Bio Technology', d?.collection?.byDepartment);
    const sum = (await call('/api/user/dashboard', indiv)).data.collection.byDepartment.reduce((n: number, r: any) => n + r.total, 0);
    check('the departments add up to the total — nothing counted twice', sum === (await call('/api/user/dashboard', indiv)).data.collection.total, sum);
  }

  section('No entitlement fails closed');
  {
    const d = (await call('/api/user/dashboard', nothing)).data;
    check('no departments chosen, no plan → "Open to you" is 0, not the catalogue', d?.collection?.total === 0 && d.allowedDomains.length === 0 && d.selectedDepartments === 0, [d?.collection?.total, d?.allowedDomains]);
    const lib = (await call('/api/library/articles?limit=50', nothing)).data;
    check('the library returns nothing', lib?.total === 0 && lib.data.length === 0, lib?.total);
    const ls = (await call('/api/content/list?limit=50', nothing)).data;
    check('the archive returns nothing', ls?.total === 0 && ls.data.length === 0, ls?.total);
    const s = (await call(`/api/search?q=${KW}`, nothing)).data;
    check('search returns nothing', s?.total === 0, s?.total);
    const e = (await call('/api/user/dashboard', emptyPlan)).data;
    check('a plan with no department list (a Pro approval) opens the departments chosen at registration — not the catalogue', e?.entitlement?.all === false && eq([...e.allowedDomains].sort(), sorted(FOUR)) && e.collection.total === await expectTotal(FOUR), e?.entitlement);
    const e2 = (await call('/api/user/dashboard', emptyPlanNoSelection)).data;
    check('…and with nothing chosen it opens nothing', e2?.collection?.total === 0 && e2.allowedDomains.length === 0 && e2.entitlement.all === false, e2?.entitlement);
  }

  section('TEST 6 — an explicit all-departments plan');
  {
    const d = (await call('/api/user/dashboard', explicitAll)).data;
    check('every department is open, and the dashboard says so', d?.entitlement?.all === true && d.collection.total === await expectTotal('all'), [d?.entitlement, d?.collection?.total]);
    const sc = (await call('/api/user/access-scope', explicitAll)).data;
    check('access-scope: all', sc?.all === true);
    const staffD = (await call('/api/user/dashboard', staff)).data;
    check('staff: all departments', staffD?.entitlement?.all === true && staffD.entitlement.source === 'staff');
  }

  section('Premium is not the whole catalogue');
  {
    const d = (await call('/api/user/dashboard', premiumOne)).data;
    check('a one-department Premium plan opens one department, though four were chosen at registration', eq(d?.allowedDomains, ['Law']) && d.collection.total === await expectTotal(['Law']), d?.allowedDomains);
    // TEST 8 — an upgrade adds a fifth department
    const premiumFive = await mkUser('premium-five', { interested: FOUR }); const subId = await mkSub({ userId: premiumFive.id, domains: FOUR });
    check('four departments bought → 4', (await call('/api/user/dashboard', premiumFive)).data.allowedDomains.length === 4);
    await db.subscription.update({ where: { id: subId }, data: { domains: [...FOUR, 'Arts'] } });
    const up = (await call('/api/user/dashboard', premiumFive)).data;
    check('TEST 8 — a fifth department is open at once, without a restart or a cache to clear', up.allowedDomains.length === 5 && up.collection.total === await expectTotal([...FOUR, 'Arts']), up.allowedDomains);
  }

  section('TEST 2 — institution with 4 departments');
  {
    const o = (await call('/api/institution/overview', ownerA)).data;
    check('the institution dashboard says 4 departments, not 29 and not "full access"', o?.subscription?.departments?.length === 4 && o.subscription.fullAccess === false && eq([...o.subscription.departments].sort(), sorted(FOUR)), o?.subscription);
    check('its collection is counted from those four only', o?.collection?.total === await expectTotal(FOUR) && o.collection.byDepartment.every((r: any) => FOUR.includes(r.name)), [o?.collection?.total, await expectTotal(FOUR)]);
    check('it is on the free preview until it subscribes', o?.subscription?.onFreeAllowance === true && o.subscription.source === 'institution-selected', o?.subscription);
    const owner = (await call('/api/user/dashboard', ownerA)).data;
    check('the librarian’s own dashboard agrees: 4, same total', owner?.selectedDepartments === 4 && owner.collection.total === o.collection.total, [owner?.selectedDepartments, owner?.collection?.total]);
    const bad = (await call('/api/institution/overview', ownerC)).data;
    check('an institution that chose nothing and holds no plan: 0 departments, not all', bad?.subscription?.departments?.length === 0 && bad.subscription.fullAccess === false && bad.collection.total === 0, bad?.subscription);
  }

  section('TEST 3/4 — institution members');
  {
    const sA = (await call('/api/user/dashboard', studentA)).data;
    check('a member of an institution that chose 4 inherits those 4 — not the 2 they listed themselves', sA?.allowedDomains.length === 4 && eq([...sA.allowedDomains].sort(), sorted(FOUR)), sA?.allowedDomains);
    check('…and cannot see Arts or Medical Sciences', !sA.allowedDomains.includes('Arts') && sA.collection.byDepartment.every((r: any) => FOUR.includes(r.name)));
    const sB = (await call('/api/user/dashboard', studentB)).data;
    check('a member of an institution on a 2-department plan gets those 2, never the 4 chosen at registration', eq([...sB.allowedDomains].sort(), ['Law', 'Nursing']), sB?.allowedDomains);
    const oB = (await call('/api/institution/overview', ownerB)).data;
    check('that institution’s dashboard says 2, subscribed', oB?.subscription?.departments?.length === 2 && oB.subscription.source === 'institution-subscription' && oB.subscription.onFreeAllowance === false, oB?.subscription);
  }

  section('TEST 5 — direct API manipulation');
  {
    const arts = idOf['Arts'].article!, law = idOf['Law'].article!;
    check('an article in a department they hold opens', (await call(`/api/library/article/${law}`, indiv)).status === 200);
    check('the same request for another department’s article is refused (403)', (await call(`/api/library/article/${arts}`, indiv)).status === 403);
    check('an unclassified article is refused to a scoped account', (await call(`/api/library/article/${unclassified.id}`, indiv)).status === 403);
    const forced = (await call('/api/library/articles?limit=50&domain=Arts', indiv)).data;
    check('?domain=Arts on the article list returns nothing', forced?.total === 0 && forced.data.length === 0, forced?.total);
    const mixed = (await call('/api/library/articles?limit=100', indiv)).data;
    check('the unfiltered article list holds only their departments', mixed.data.length > 0 && mixed.data.every((a: any) => FOUR.includes(a.domain)), mixed.data.map((a: any) => a.domain));
    check('…and its total is the table count for those four', mixed.total === (await db.article.count({ where: { status: 'Published', domain: { in: FOUR } } as any })), mixed.total);
    const books = (await call('/api/library/books?limit=100&domain=Arts', indiv)).data;
    check('?domain=Arts on books returns nothing', (books?.total ?? 0) === 0, books?.total);
    const lc = (await call('/api/content/list?limit=100&domain=Arts', indiv)).data;
    check('?domain=Arts on the archive returns nothing', lc?.total === 0 && lc.data.length === 0, lc?.total);
    const lc2 = (await call('/api/content/list?limit=100&domain=Arts,Law', indiv)).data;
    check('a mixed request keeps only the held department', lc2.data.length > 0 && lc2.data.every((c: any) => c.domain === 'Law'), lc2.data.map((c: any) => c.domain));
    const noFlag = (await call('/api/content/list?limit=100', indiv)).data;
    check('without "onlyUnlocked" the archive is still scoped (dropping a parameter does not widen it)', noFlag.data.every((c: any) => FOUR.includes(c.domain)), noFlag.data.map((c: any) => c.domain));
    const fl = (await call('/api/content/filters?domain=Arts', indiv)).data;
    check('archive filters for another department are empty', fl?.domains?.length === 0 && fl.subjects.length === 0);
    const trending = (await call('/api/library/trending?domains=Arts', indiv)).data;
    check('"trending" for a department not held does not name it', !(trending?.departments || []).some((d: any) => d.name === 'Arts' || d.department === 'Arts'), trending);
  }

  section('Full text: the gate on the document itself');
  {
    const arts = idOf['Arts'].content!, law = idOf['Law'].content!;
    const bad = await call(`/api/content/${arts}/view`, indiv);
    check('another department’s document is refused outright', bad.status === 403 && bad.data?.code === 'DEPARTMENT_NOT_ENTITLED', bad);
    const proxy = await call(`/api/content/${arts}/proxy-pdf`, indiv);
    check('…and so is the proxy that streams the bytes', proxy.status === 403 && proxy.data?.code === 'DEPARTMENT_NOT_ENTITLED', proxy);
    const ok = await call(`/api/content/${law}/view`, indiv);
    check('a held department’s document is not refused on department grounds', ok.data?.code !== 'DEPARTMENT_NOT_ENTITLED', ok);
    const stud = await call(`/api/content/${arts}/view`, studentA);
    check('a member cannot open the department their own list named but the institution does not hold', stud.status === 403 && stud.data?.code === 'DEPARTMENT_NOT_ENTITLED', stud);
  }

  section('TEST 11 — search');
  {
    const s = (await call(`/api/search?q=${KW}&limit=100`, indiv)).data;
    const doms = s.data.map((r: any) => r.domain);
    check('keyword search returns matches in their departments only', s.total > 0 && doms.every((d: string) => FOUR.includes(d)), doms);
    check('the Medical Sciences and Arts records that match the same keyword are not returned', !doms.includes('Medical Sciences') && !doms.includes('Arts'));
    const pub = (await call(`/api/search?q=${KW}&limit=100`, null)).data;
    check('the public (signed-out) search is unchanged: it can see them all', pub.data.some((r: any) => r.domain === 'Medical Sciences') && pub.data.some((r: any) => r.domain === 'Arts'));
    const forced = (await call(`/api/search?q=${KW}&domain=Medical%20Sciences`, indiv)).data;
    check('?domain= another department returns nothing', forced.total === 0, forced.total);
  }

  section('Admin: selected vs effective');
  {
    const a = (await call(`/api/admin/users/${studentB.id}/entitlement`, admin)).data;
    check('the inspector shows the institution ceiling and the effective list', a?.effectiveCount === 2 && eq([...a.effectiveDepartments].sort(), ['Law', 'Nursing']) && a.source === 'institution-subscription', a);
    const b = (await call(`/api/admin/users/${indiv.id}/entitlement`, admin)).data;
    check('selected 4, effective 4', b?.selectedCount === 4 && b.effectiveCount === 4, b);
    const c = (await call(`/api/admin/users/${explicitAll.id}/entitlement`, admin)).data;
    check('an all-departments plan is shown as ALL_DEPARTMENTS', c?.effectiveDepartments === 'ALL_DEPARTMENTS' && c.fullCatalogue === true, c);
    check('a reader cannot call it', (await call(`/api/admin/users/${indiv.id}/entitlement`, indiv)).status === 403);
    check('the inspector names the source and the exact selected names', b?.departmentSource === 'registration' && eq([...b.selectedDepartments].sort(), sorted(FOUR)) && b.selectedDepartmentCount === 4 && b.effectiveDepartmentCount === 4 && b.isInstitutionMember === false, b);
    check('an institution member is flagged as inheriting, with the institution named', a?.departmentSource === 'institution' && a.isInstitutionMember === true && typeof a.institutionName === 'string' && a.institutionName.length > 0, a);
    check('an explicit All Domains plan reports departmentSource all-domains-plan, selection kept separately', c?.departmentSource === 'all-domains-plan' && c.effectiveAll === true && Array.isArray(c.selectedDepartments), c);
  }

  section('Nothing was changed in anyone’s data');
  {
    const u = await db.user.findUnique({ where: { id: indiv.id }, select: { interestedDomains: true } });
    check('the account’s chosen departments are exactly as they were', eq(u?.interestedDomains, FOUR));
  }
} finally {
  await stop(srv);
  await db.subscription.deleteMany({ where: { id: { in: created.subs } } }).catch(() => {});
  await db.userSession.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.libraryEvent.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.studentActivity.deleteMany({ where: { userId: { in: created.users } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
  await db.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => {});
  await db.article.deleteMany({ where: { id: { in: created.articles } } }).catch(() => {});
  await db.book.deleteMany({ where: { id: { in: created.books } } }).catch(() => {});
  await db.content.deleteMany({ where: { id: { in: created.contents } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
