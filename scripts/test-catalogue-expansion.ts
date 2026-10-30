/**
 * Catalogue expansion: department Book coverage, the low-coverage priority engine, targeted Book ingestion, Bulk Catalogue Expansion,
 * and the growth report — against a fake network and the throwaway database `stm_ingestion_test` (refuses anything else).
 * Nothing here reaches the internet. The Book table of that database is emptied at the start; no other database is touched.
 *
 *   npx tsx scripts/test-catalogue-expansion.ts
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.INGESTION_ADAPTIVE_SCHEDULER = '0';        // this suite pins the previous static order and one-useful-turn-per-tick rule; the adaptive scheduler has its own (test-adaptive-scheduler.ts)
process.env.INGESTION_PRODUCTIVITY_BIAS = '0';           // this suite pins the plain 70/30 and round-robin rules; the productivity bias has its own suite (test-discovery-lanes.ts)
process.env.INGESTION_SOFT_BACKOFF_SECONDS = '0,0';
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const { __useFetchForTests, __useSleepForTests, sourceHealthState } = await import('../src/lib/ingestion/sourceHealth.js');
const { DEPARTMENT_PROFILES, profileOf } = await import('../src/lib/ingestion/books/departmentProfiles.js');
const { CANONICAL_NAMES, isAutoIngested } = await import('../src/lib/departmentRegistry.js');
const Cov = await import('../src/lib/ingestion/bookCoverage.js');
const T = await import('../src/lib/ingestion/targetedBooks.js');
const B = await import('../src/lib/ingestion/bulkCatalogue.js');
const G = await import('../src/lib/ingestion/catalogueGrowth.js');
const { ensureProviders, runEnginePass } = await import('../src/lib/ingestion/engine.js');
const { runRotationPass, setProviders, setTargetedPolicy, rotationStatus } = await import('../src/lib/ingestion/rotation.js');
const { installProviders } = await import('../src/lib/ingestion/providers.js');
const { __resetRotationState, loadRotationState, saveRotationState } = await import('../src/lib/ingestion/rotationState.js');
const { __resetProviderLocks, tryLockProvider, unlockProvider } = await import('../src/lib/ingestion/providerLocks.js');
const { lccFromOpenLibrary } = await import('../src/lib/ingestion/books/openLibrary.js');
const { writeJournalCandidates } = await import('../src/lib/ingestion/journalSources.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {}); T.__useTargetedDelayForTests(0); B.__useBulkDelayForTests(0);

const RUN = Date.now().toString(36);
const ISBN = ['9780306406157', '9783161484100', '9780198526636', '9780262033848', '9780131103627', '9780201633610', '9780596520687', '9780134685991', '9781491950357', '9780321125217', '9781449355739', '9780596007126'];
const ARCH = ['THEMA EDITEUR::A THE ARTS::AM ARCHITECTURE'];
const LAW = ['BIC BOOK INDUSTRY COMMUNICATION::L LAW::LA JURISPRUDENCE & GENERAL ISSUES'];

// ── fake network ───────────────────────────────────────────────────────────
const requests: { url: string; ua: string | null }[] = [];
const hits = (frag: string) => requests.filter(r => r.url.includes(frag)).length;
let olDocs: Record<string, any[]> = {};
let doab: any[] = [];
let oaSources: any[] = [];
let crossrefJournals: any[] = [];
let mode: Record<string, '503' | undefined> = {};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (v: string) => `<field name="value">${esc(v)}</field>`;
const rec = (s: any, host: string) => `<record><header><identifier>oai:${host}:${s.handle}</identifier><datestamp>2026-10-01T00:00:00Z</datestamp></header><metadata><metadata xmlns="http://www.lyncode.com/xoai">
<element name="dc"><element name="title"><element name="en_US">${f(s.title)}</element></element>
${s.author ? `<element name="contributor"><element name="author"><element name="none">${f(s.author)}</element></element></element>` : ''}
<element name="date"><element name="issued"><element name="none">${f(s.year || '2024-01-01')}</element></element></element>
<element name="language"><element name="en_US">${f('eng')}</element></element>
<element name="subject">${s.codes ? `<element name="classification"><element name="en_US">${s.codes.map(f).join('')}</element></element>` : ''}${s.kw ? `<element name="other"><element name="en_US">${f(s.kw.join('; '))}</element></element>` : ''}</element>
</element>
<element name="oapen">${s.isbn ? `<element name="relation"><element name="isbn"><element name="en_US">${f(s.isbn)}</element></element></element>` : ''}</element>
<element name="bundles"><element name="bundle"><field name="name">THUMBNAIL</field><element name="bitstreams"><element name="bitstream"><field name="format">image/jpeg</field><field name="url">https://x/cover.jpg</field>${s.rights ? `<field name="rights">${s.rights}</field>` : ''}</element></element></element></element>
<element name="linkedItemsMetadata"><element name="publisher.name">${f('Test Press')}</element></element>
</metadata></metadata></record>`;
const PAGE = 5;
const oaiPage = (cat: any[], host: string, url: string) => {
  const tok = new URL(url).searchParams.get('resumptionToken');
  const start = tok ? Number(tok.split('/').pop()) : 0;
  if (!cat.length) return new Response('<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><error code="noRecordsMatch">none</error></OAI-PMH>', { status: 200 });
  const more = start + PAGE < cat.length;
  return new Response(`<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><ListRecords>${cat.slice(start, start + PAGE).map(c => rec(c, host)).join('')}${more ? `<resumptionToken completeListSize="${cat.length}" cursor="${start}">xoai///set/${start + PAGE}</resumptionToken>` : `<resumptionToken completeListSize="${cat.length}"/>`}</ListRecords></OAI-PMH>`, { status: 200 });
};
const json = (o: any) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });

const fake = async (url: string, init?: any): Promise<Response> => {
  const ua = init?.headers?.['User-Agent'] ?? null;
  requests.push({ url, ua });
  const u = new URL(url); const h = u.hostname;
  if (h === 'openlibrary.org') {
    if (mode.openlibrary === '503') return new Response('down', { status: 503 });
    const q = /subject:"([^"]+)"/.exec(decodeURIComponent(u.searchParams.get('q') || ''))?.[1] || '';
    const page = Number(u.searchParams.get('page') || 1), size = Number(u.searchParams.get('limit') || 20);
    const all = olDocs[q] || [];
    return json({ numFound: all.length, start: (page - 1) * size, docs: all.slice((page - 1) * size, page * size) });
  }
  if (h === 'directory.doabooks.org') return oaiPage(doab, 'directory.doabooks.org', url);
  if (h === 'library.oapen.org') return oaiPage([], 'library.oapen.org', url);
  if (h === 'open.umn.edu') return json({ data: [], links: { total_pages: 1, total_count: 0 } });
  if (h === 'ftp.ncbi.nlm.nih.gov') return new Response('"File","Article Title","Publisher","Year","Accession","Updated"\n', { status: 200 });
  if (h === 'api.openalex.org' && u.pathname === '/sources') {
    const cur = u.searchParams.get('cursor') || '*'; const start = cur === '*' ? 0 : Number(cur); const per = Number(u.searchParams.get('per-page') || 200);
    const slice = oaSources.slice(start, start + per);
    return json({ results: slice, meta: { count: oaSources.length, next_cursor: start + per < oaSources.length ? String(start + per) : null } });
  }
  if (h === 'api.crossref.org' && u.pathname === '/journals') {
    const off = Number(u.searchParams.get('offset') || 0), rows = Number(u.searchParams.get('rows') || 100);
    return json({ status: 'ok', message: { 'total-results': crossrefJournals.length, items: crossrefJournals.slice(off, off + rows) } });
  }
  return new Response('unexpected host in test', { status: 404 });
};
__useFetchForTests(fake as any);

const dbBook = (title: string, department: string | null, o: any = {}) => ({
  title, authors: 'Test, Author', domain: department, status: o.status ?? 'Published', accessStatus: o.accessStatus ?? 'LinkOnly', rightsStatus: 'MetadataOnly', accessType: 'OpenAccess',
  source: o.source ?? 'DOAB', fingerprint: `qa:${RUN}:${title}`, isbn: o.isbn ?? null, year: 2022, metadata: o.suggested ? { harvest: { department: { suggested: o.suggested, band: 'review' } } } : {},
});
const seedBooks = async (department: string | null, n: number, o: any = {}) => { if (n) await db.book.createMany({ data: Array.from({ length: n }, (_, i) => dbBook(`${RUN} ${department ?? 'x'} ${o.tag ?? ''}${i}`, department, o)) }); };

const SETTING_KEYS = ['ingestion.books.targeting.v1', 'ingestion.books.priority.v1', 'ingestion.bulk.v1'];
const resetAll = async () => {
  await db.book.deleteMany({});                               // the throwaway database only
  await db.bookHarvestCheckpoint.deleteMany({});
  await db.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
  await db.ingestionSourceHealth.deleteMany({ where: { source: { in: ['DOAB', 'OAPEN', 'open.umn.edu', 'NCBI', 'OpenLibrary', 'OpenAlex', 'Crossref', 'Targeted'] } } });
  await db.journal.deleteMany({ where: { title: { startsWith: `${RUN} ` } } });
  await __resetRotationState(); __resetProviderLocks(); T.__resetTargetedJobsForTests(); B.__resetBulkForTests();
  requests.length = 0; olDocs = {}; doab = []; oaSources = []; crossrefJournals = []; mode = {};
  ensureProviders(); installProviders();
};
const checkpoints = async () => JSON.stringify(await db.bookHarvestCheckpoint.findMany({ orderBy: { provider: 'asc' } }));
const cov = async () => Cov.bookCoverageByDepartment(db);
const pubOf = (c: any, d: string) => c.departments.find((x: any) => x.department === d)?.published ?? -1;

try {
  // ═══════════════════════════════════════════════════════════════════════
  section('1. Department query profiles: one for every canonical department, none for anything else');
  check('every canonical department has a profile', CANONICAL_NAMES.every(n => !!profileOf(n)), `${CANONICAL_NAMES.length} departments`);
  check('and there is no profile for a department the registry does not know', Object.keys(DEPARTMENT_PROFILES).every(n => CANONICAL_NAMES.includes(n)));
  check('each department the engines work on has several phrases to ask for', CANONICAL_NAMES.filter(isAutoIngested).every(n => profileOf(n)!.queries.length >= 5));
  check('the four departments added 2026-10-30 have no phrases, so nothing is searched for them automatically', CANONICAL_NAMES.filter(n => !isAutoIngested(n)).length === 4 && CANONICAL_NAMES.filter(n => !isAutoIngested(n)).every(n => profileOf(n)!.queries.length === 0));
  check('the examples from the brief are present (Architecture, Mechanical Engineering, Computer / IT, Medical Sciences)',
    profileOf('Architecture')!.queries.includes('urban planning') && profileOf('Mechanical Engineering')!.queries.includes('thermodynamics') && profileOf('Computer / IT')!.queries.includes('cybersecurity') && profileOf('Medical Sciences')!.queries.includes('clinical medicine'));
  check('Open Library call numbers are read as the classifier reads them', lccFromOpenLibrary('NA-2520.00000000.J4 1946') === 'NA2520' && lccFromOpenLibrary('QA-0076.00000000') === 'QA76' && lccFromOpenLibrary('TK-7885.50000000') === 'TK7885.5', `${lccFromOpenLibrary('NA-2520.00000000.J4 1946')} ${lccFromOpenLibrary('QA-0076.00000000')} ${lccFromOpenLibrary('TK-7885.50000000')}`);

  // ═══════════════════════════════════════════════════════════════════════
  section('2. Book coverage by department, counted from the catalogue');
  await resetAll();
  await seedBooks('Law', 120, { accessStatus: 'LinkOnly' });
  await seedBooks('Nursing', 30, { accessStatus: 'MetadataOnly' });
  await seedBooks('Chemistry', 24);
  await seedBooks('Management', 25);
  await seedBooks('Energy', 49);
  await seedBooks('Commerce', 50);
  await seedBooks('Computer / IT', 99);
  await seedBooks('Pharmacy', 5, { accessStatus: 'ViewableHere' });
  await seedBooks('Biotechnology', 3, { tag: 'alias' });                          // a historical spelling of Bio Technology
  await seedBooks('Engineering', 7, { tag: 'stray' });                            // not a canonical department
  await seedBooks(null, 2, { status: 'Draft', suggested: 'Architecture', tag: 'draft-arch' });   // waiting for review; not public
  await seedBooks(null, 1, { status: 'Draft', tag: 'draft-none' });
  const c0 = await cov();
  const arch = c0.departments.find((d: any) => d.department === 'Architecture')!;
  check('all canonical departments are listed, none missing', c0.departments.length === CANONICAL_NAMES.length && CANONICAL_NAMES.every(n => c0.departments.some((d: any) => d.department === n)));
  check('Architecture holds ZERO published books, and says so', arch.published === 0 && arch.state === 'critical' && arch.label === 'Critical');
  check('its two review Drafts are counted as Review, not as public books', arch.review === 2 && arch.total === 2 && arch.published === 0, JSON.stringify(arch));
  check('sorted from lowest to highest', c0.departments.every((d: any, i: number, a: any[]) => i === 0 || a[i - 1].published <= d.published));
  const st = (n: string) => c0.departments.find((d: any) => d.department === n)!.state;
  check('states: 24 critical · 25 low · 49 low · 50 building · 99 building · 120 initial target met', st('Chemistry') === 'critical' && st('Management') === 'low' && st('Energy') === 'low' && st('Commerce') === 'building' && st('Computer / IT') === 'building' && st('Law') === 'target-met');
  check('Phase 1 (100) and Phase 2 (250) are reported per department', c0.departments.find((d: any) => d.department === 'Law')!.phase1Met === true && c0.departments.find((d: any) => d.department === 'Law')!.phase2Met === false);
  const pharm = c0.departments.find((d: any) => d.department === 'Pharmacy')!, nurse = c0.departments.find((d: any) => d.department === 'Nursing')!, lawr = c0.departments.find((d: any) => d.department === 'Law')!;
  check('Open/Readable, External and Metadata-only are counted apart', pharm.readable === 5 && lawr.external === 120 && nurse.metadataOnly === 30);
  check('a historical spelling is folded into its department (Biotechnology → Bio Technology)', pubOf(c0, 'Bio Technology') === 3);
  check('a stored label that is not a department ("Engineering") is NOT folded in anywhere — it is reported on its own', c0.departments.every((d: any) => d.department !== 'Engineering') && c0.other.some((o: any) => /Engineering/.test(o.label) && o.published === 7), JSON.stringify(c0.other));
  check('an unplaced Draft is Review with no department', c0.other.some((o: any) => /no confident department/.test(o.label) && o.review === 1));

  // ═══════════════════════════════════════════════════════════════════════
  section('3. The priority engine: zero first, then lowest; resting departments are skipped; nobody is starved');
  const state0: any = { turn: 0, depts: {}, positions: {} };
  check('the first department to work on is a zero-book department (alphabetically the first of them)', T.pickTargetDepartment(c0, state0, 100) === 'Agriculture', String(T.pickTargetDepartment(c0, state0, 100)));
  const zeros = c0.departments.filter((d: any) => d.published === 0).map((d: any) => d.department);
  check('every zero-book department comes before any department that has a book', c0.departments.slice(0, zeros.length).every((d: any) => d.published === 0));
  check('a department at the target is never chosen', (() => { const only = { ...c0, departments: c0.departments.filter((d: any) => d.published >= 100) }; return T.pickTargetDepartment(only as any, state0, 100) === null; })());
  check('a department without classification rules (the four added 2026-10-30) is never chosen by the engine, however empty it is', (() => { const only = { ...c0, departments: c0.departments.filter((d: any) => !isAutoIngested(d.department)) }; return only.departments.length === 4 && T.pickTargetDepartment(only as any, state0, 100) === null; })());
  { let msg = ''; try { await T.runTargeted({ department: 'Radiology', limit: 10, mode: 'manual' }); } catch (e: any) { msg = String(e?.message || e); }
    check('a targeted run for such a department is refused with a plain reason, before any provider is asked', /no automatic search or classification rules/.test(msg), msg); }
  const resting = { turn: 0, depts: { Agriculture: { zeroRuns: 1, nextEligibleAt: new Date(Date.now() + 3_600_000).toISOString(), lastRunAt: null, lastChecked: 0, lastAdded: 0, lastReview: 0 } }, positions: {} };
  check('a department resting after a run that found nothing is skipped, so the next-lowest gets the turn', T.pickTargetDepartment(c0, resting as any, 100) === 'Applied Mechanics', String(T.pickTargetDepartment(c0, resting as any, 100)));
  check('the rest grows with each empty run: 6 h, 12 h, 24 h … capped at a week', T.restHours(1) === 6 && T.restHours(2) === 12 && T.restHours(3) === 24 && T.restHours(10) === 168);
  const turns = Array.from({ length: 10 }, (_, i) => T.isTargetedTurn(i, 0.7));
  check('70% of Books turns are targeted, 30% are the ordinary rotation (7 of every 10)', turns.filter(Boolean).length === 7, turns.map(t => (t ? 'T' : '.')).join(''));
  check('at a 50% share it is 5 of 10', Array.from({ length: 10 }, (_, i) => T.isTargetedTurn(i, 0.5)).filter(Boolean).length === 5);
  let refused = 0;
  for (const bad of [{ share: 0.95 }, { share: 0.05 }, { target: 10 }, { target: 5000 }, { enabled: 'yes' as any }]) { try { await T.savePriorityConfig(bad as any, null); } catch (e) { if (e instanceof T.PriorityError) refused++; } }
  check('the priority settings are validated on the server (share 10–90%, target 25–1000, enabled true/false)', refused === 5, `${refused}/5 refused`);
  const cfg = await T.savePriorityConfig({ enabled: true, share: 0.7, target: 100 }, { email: 'qa@test' });
  check('and an accepted change is saved and audited', cfg.target === 100 && (await db.ingestionAudit.count({ where: { action: 'BOOK_PRIORITY_CHANGED' } })) >= 1);

  // 70/30 inside the scheduler, with stand-ins: the ordinary rotation still gets its 30%
  {
    const ran: string[] = [];
    const mk = (id: string) => ({ id, label: id, group: 'Books' as const, role: 't', tier: 'supplementary' as const, healthKey: `QA-${RUN}-${id}`, lock: `QA-${RUN}-${id}`,
      turn: async () => { ran.push(id); return { kind: 'ran' as const, checked: 1, added: 1, held: 0, enriched: 0, sentToReview: 0, skipped: 0, recordFailures: 0, useful: 1, more: true, ledger: {} }; } });
    setProviders([mk('doab'), mk('oapen'), mk('otl'), mk('targeted')] as any);
    await __resetRotationState();
    let n = 0; setTargetedPolicy(async () => T.isTargetedTurn(n++, 0.7));
    for (let i = 0; i < 20; i++) await runRotationPass({ only: 'books', wanted: [], narrowed: false, state: {} });
    check('over 20 Books turns: 14 targeted and 6 ordinary', ran.filter(x => x === 'targeted').length === 14 && ran.filter(x => x !== 'targeted').length === 6, `${ran.filter(x => x === 'targeted').length} targeted / ${ran.filter(x => x !== 'targeted').length} ordinary`);
    check('the ordinary 30% still goes round every provider (nobody is starved)', ['doab', 'oapen', 'otl'].every(id => ran.includes(id)), [...new Set(ran)].join(' '));
    await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `QA-${RUN}` } } });
    await __resetRotationState(); installProviders();
  }

  // ═══════════════════════════════════════════════════════════════════════
  section('4. Targeted ARCHITECTURE import: zero books → only valid Architecture books are counted');
  await resetAll();
  await seedBooks('Law', 120);                                                       // a well-covered department, to prove it is not the one chosen
  await db.book.create({ data: { ...dbBook(`${RUN} Held Elsewhere`, 'Arts', { isbn: ISBN[3] }) } });     // already held: the duplicate test
  const cpBefore = await checkpoints();
  const covBefore = await cov();
  check('before: Architecture has 0 published books, and is the first department chosen once the alphabet is out of the way', pubOf(covBefore, 'Architecture') === 0);

  // What Open Library will say for each of the department's phrases.
  const archBook = (n: number, extra: any = {}) => ({ key: `/works/OL${RUN.toUpperCase()}${n}W`, title: `${RUN} Principles of Architectural Design ${n}`, author_name: ['Wright, F.'], first_publish_year: 2018, isbn: [ISBN[n]], publisher: ['Design Press'], subject: ['Architecture', 'Architectural design', 'Building design'], lcc: ['NA-2520.00000000.W7'], language: ['eng'], ebook_access: 'public', ...extra });
  olDocs = {
    'architecture': [
      archBook(0), archBook(1),
      // uncertain: housing wording but no code that points at architecture
      { key: `/works/OL${RUN.toUpperCase()}9W`, title: `${RUN} Notes on Housing`, author_name: ['Smith, J.'], first_publish_year: 2015, isbn: [ISBN[9]], publisher: ['Civic Press'], subject: ['Building design'], lcc: [], language: ['eng'] },
      // irrelevant: a cookery book that matched the word "architecture" somewhere
      { key: `/works/OL${RUN.toUpperCase()}8W`, title: `${RUN} The Joy of Cooking Soups`, author_name: ['Cook, A.'], first_publish_year: 2011, isbn: [ISBN[8]], publisher: ['Kitchen Press'], subject: ['Cooking', 'Soups'], lcc: ['TX-0757.00000000'], language: ['eng'] },
      // a duplicate of a book already held (same ISBN)
      { key: `/works/OL${RUN.toUpperCase()}7W`, title: `${RUN} Held Elsewhere`, author_name: ['Test, Author'], first_publish_year: 2022, isbn: [ISBN[3]], publisher: ['Design Press'], subject: ['Architecture'], lcc: ['NA-1000.00000000'], language: ['eng'] },
    ],
  };
  // And what DOAB's feed holds: one real architecture title, one law title, and one that is already held.
  doab = [
    { handle: `20.500.12854/${RUN}a1`, title: `${RUN} Architecture and the City: urban design today`, author: 'Gehl, Jan', codes: ARCH, kw: ['architecture', 'urban design'], isbn: ISBN[5], rights: 'CC-BY' },
    { handle: `20.500.12854/${RUN}a2`, title: `${RUN} Constitutional Law Casebook`, author: 'Marshall, J.', codes: LAW, kw: ['constitutional law'], isbn: ISBN[6], rights: 'CC-BY' },
    { handle: `20.500.12854/${RUN}a3`, title: `${RUN} Held Elsewhere`, author: 'Test, Author', codes: ARCH, kw: ['architecture'], isbn: ISBN[3], rights: 'CC-BY' },
  ];

  const started = await T.beginTargetedImport('Architecture', 100, { email: 'qa@test', uid: 'qa' });
  for (let i = 0; i < 100 && T.getTargetedJob(started.id)!.status === 'running'; i++) await new Promise(r => setTimeout(r, 100));
  const job = T.getTargetedJob(started.id)!;
  check('the job finished', job.status === 'done', job.error || job.status);
  const r = job.result!;
  console.log(`      ${r.providers.map(p => `${p.label}: ${p.outcome}, ${p.checked} checked, ${p.added} added, ${p.review} review`).join(' | ')}`);

  const asked = requests.filter(q => q.url.includes('openlibrary.org')).map(q => decodeURIComponent(q.url));
  check('the department\'s query profile was sent: its own phrases, as subject searches', asked.some(u => u.includes('subject:"architecture"')) && asked.some(u => u.includes('subject:"urban planning"')) && asked.some(u => u.includes('subject:"landscape architecture"')), `${asked.length} requests`);
  check('Open Library was asked politely: our name and a contact in the User-Agent', requests.filter(q => q.url.includes('openlibrary.org')).every(q => /STM Digital Library \(mailto:.+\)/.test(q.ua || '')));
  check('the same book is never written twice: the held ISBN was recognised as a duplicate', (await db.book.count({ where: { isbn: ISBN[3] } })) === 1 && (await db.book.count({ where: { title: { contains: 'Held Elsewhere' } } })) === 1);

  const afterOl = await db.book.findMany({ where: { source: 'OpenLibrary' } });
  const olGood = afterOl.filter((b: any) => /Principles of Architectural Design/.test(b.title));
  check('Open Library\'s clearly-architectural books were classified Architecture — and are REVIEW-first: Drafts, not published', olGood.length === 2 && olGood.every((b: any) => b.status === 'Draft' && b.domain === null && (b.metadata?.harvest?.department?.suggested === 'Architecture')), JSON.stringify(olGood.map((b: any) => [b.status, b.domain, b.metadata?.harvest?.department?.suggested])));
  check('Open Library records claim nothing about rights: no licence, Metadata Only', afterOl.every((b: any) => !b.licence && b.rightsStatus === 'MetadataOnly' && b.accessStatus === 'MetadataOnly'));
  check('the cookery book was skipped: no row, and it was not filed under Architecture to fill the count', (await db.book.count({ where: { title: { contains: 'Cooking Soups' } } })) === 0);
  const uncertain = afterOl.find((b: any) => /Notes on Housing/.test(b.title));
  check('an uncertain book is not published and not given a department — at most it waits for a person', !uncertain || (uncertain.status === 'Draft' && uncertain.domain === null));

  const doabArch = await db.book.findFirst({ where: { title: { contains: 'Architecture and the City' } } });
  check('DOAB\'s architecture title was classified by the real classifier (code + title agree) and PUBLISHED as Architecture', doabArch?.status === 'Published' && doabArch?.domain === 'Architecture', `${doabArch?.status} ${doabArch?.domain}`);
  check('DOAB\'s law title was NOT published into Architecture (nor anywhere): a run is scoped to its department', (await db.book.count({ where: { title: { contains: 'Constitutional Law Casebook' } } })) === 0);
  const covAfter = await cov();
  check('the public Architecture count is exactly the one valid, published book — not the Drafts, not the skipped ones', pubOf(covAfter, 'Architecture') === 1, `published ${pubOf(covAfter, 'Architecture')}`);
  check('the Drafts are Review for Architecture, and are not public', covAfter.departments.find((d: any) => d.department === 'Architecture')!.review >= 2);
  check('the result says what was added TO Architecture', r.addedToDepartment === 1, `${r.addedToDepartment}`);
  check('no other department was filled by the run (Law is still 120)', pubOf(covAfter, 'Law') === 120);
  check('the continuous harvest checkpoints were not read, moved or created', (await checkpoints()) === cpBefore, await checkpoints());

  // rest after nothing more to find
  const again = await T.beginTargetedImport('Architecture', 100, null);
  for (let i = 0; i < 100 && T.getTargetedJob(again.id)!.status === 'running'; i++) await new Promise(r2 => setTimeout(r2, 100));
  const r2 = T.getTargetedJob(again.id)!.result!;
  check('asked again, it finds nothing new and writes nothing (every candidate is now a duplicate or already read)', r2.added === 0 && (await db.book.count({ where: { source: 'OpenLibrary' } })) === afterOl.length, `${r2.added} added`);
  await T.recordTargetedOutcome('Architecture', { ...r2, addedToDepartment: 0, sentToReview: 0, asked: true } as any);
  const stAfter = await T.loadState();
  check('a department that gave nothing rests (6 h or more) so another can have the turn', !!stAfter.depts.Architecture?.nextEligibleAt && new Date(stAfter.depts.Architecture.nextEligibleAt).getTime() > Date.now() + 5 * 3_600_000 && stAfter.depts.Architecture.zeroRuns >= 1, JSON.stringify(stAfter.depts.Architecture));

  // ═══════════════════════════════════════════════════════════════════════
  section('5. Targeted runs respect health, locks and cooldowns');
  await resetAll();
  olDocs = { architecture: [archBook(0)] };
  for (let i = 0; i < 3; i++) { const { recordSourceFailure } = await import('../src/lib/ingestion/sourceHealth.js'); await recordSourceFailure('OpenLibrary', 'The operation was aborted due to timeout'); }
  const olReq = hits('openlibrary.org');
  const rr = await T.runTargeted({ department: 'Architecture', limit: 50, mode: 'manual' });
  check('a resting source is not asked at all (Open Library is cooling down)', hits('openlibrary.org') === olReq && rr.providers.find(p => p.id === 'openlibrary')!.outcome.startsWith('resting'), rr.providers.find(p => p.id === 'openlibrary')!.outcome);
  check('the other sources were still asked (DOAB)', hits('directory.doabooks.org') > 0);
  await db.ingestionSourceHealth.deleteMany({ where: { source: 'OpenLibrary' } });
  requests.length = 0;
  await db.appSetting.deleteMany({ where: { key: 'ingestion.books.targeting.v1' } });       // forget that DOAB was read to its end above
  tryLockProvider('DOAB', 'continuous');
  const busy = await T.runTargeted({ department: 'Architecture', limit: 50, mode: 'manual' });
  unlockProvider('DOAB', 'continuous');
  check('a source the continuous engine is working on is left alone (busy)', busy.providers.find(p => p.id === 'doab')!.outcome === 'busy' && hits('directory.doabooks.org') === 0);
  mode.openlibrary = '503';
  await db.ingestionSourceHealth.deleteMany({ where: { source: 'OpenLibrary' } });
  await db.appSetting.deleteMany({ where: { key: 'ingestion.books.targeting.v1' } });
  for (let i = 0; i < 4; i++) await T.runTargeted({ department: 'Architecture', limit: 50, mode: 'manual' });
  const hOl = await sourceHealthState('OpenLibrary');
  check('Open Library failing is counted by the same breaker as every source: it rests after three failed requests and is then left alone', hOl.health === 'cooling' && hOl.failures === 3, `${hOl.health} ${hOl.failures}`);
  try { await T.beginTargetedImport('Not A Department', 100, null); check('an unknown department is refused', false); } catch (e) { check('an unknown department is refused', e instanceof T.TargetedError); }
  try { await T.beginTargetedImport('Law', 5, null); check('a silly limit is refused', false); } catch (e) { check('a silly limit is refused', e instanceof T.TargetedError); }

  // ═══════════════════════════════════════════════════════════════════════
  section('6. Provider refresh: "exhausted for now" stores when, and when it can be tried again');
  await resetAll();
  {
    const mk = (id: string, behaviour: () => any) => ({ id, label: id, group: 'Books' as const, role: 't', tier: 'supplementary' as const, healthKey: `QA-${RUN}-${id}`, lock: `QA-${RUN}-${id}`, turn: async () => behaviour() });
    let useful = false;
    const empty = () => ({ kind: 'ran' as const, checked: 10, added: 0, held: 10, enriched: 0, sentToReview: 0, skipped: 0, recordFailures: 0, useful: 0, more: true, ledger: {} });
    const gives = () => ({ kind: 'ran' as const, checked: 10, added: 5, held: 5, enriched: 0, sentToReview: 0, skipped: 0, recordFailures: 0, useful: 5, more: true, ledger: {} });
    setProviders([mk('only', () => (useful ? gives() : empty()))] as any); setTargetedPolicy(null);
    for (let i = 0; i < 3; i++) await runRotationPass({ only: 'books', wanted: [], narrowed: false, state: {} });
    const s1 = await loadRotationState();
    check('after three empty batches it stores exhaustedAt and refreshAfter', !!s1.providers.only.exhaustedAt && !!s1.providers.only.refreshAfter && new Date(s1.providers.only.refreshAfter!).getTime() > Date.now(), `${s1.providers.only.exhaustedAt} → ${s1.providers.only.refreshAfter}`);
    const rs = await rotationStatus();
    check('the screen can show both', !!rs.providers.find(p => p.id === 'only')!.exhaustedAt && !!rs.providers.find(p => p.id === 'only')!.refreshAfter && rs.providers.find(p => p.id === 'only')!.yield === 'exhausted');
    check('and its health is untouched', rs.providers.find(p => p.id === 'only')!.health.state === 'healthy');
    s1.providers.only.exhaustedUntil = new Date(Date.now() - 1000).toISOString(); s1.providers.only.refreshAfter = s1.providers.only.exhaustedUntil;
    s1.idle = null;      // time travel: the engine slept until this rest ended; moving the rest into the past must also end that sleep, as the clock would
    await saveRotationState(s1);
    useful = true;
    const back = await runRotationPass({ only: 'books', wanted: [], narrowed: false, state: {} }) as any;
    const s2 = await loadRotationState();
    check('after refreshAfter it is eligible again by itself — and a useful batch clears the exhausted marks', back.provider === 'only' && s2.providers.only.exhaustedAt === null && s2.providers.only.refreshAfter === null);
    await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `QA-${RUN}` } } });
    await __resetRotationState(); installProviders();
  }

  // ═══════════════════════════════════════════════════════════════════════
  section('7. Bulk Books sync: its own position, the same pipeline, no duplicates, continuous checkpoints untouched');
  await resetAll();
  doab = Array.from({ length: 12 }, (_, i) => ({ handle: `20.500.12854/${RUN}b${i}`, title: `${RUN} Contract Law Volume ${i}`, isbn: ISBN[i], codes: LAW, kw: ['contract law'], rights: 'CC-BY' }));
  await db.bookHarvestCheckpoint.create({ data: { provider: 'DOAB', cursor: 'xoai///set/777', harvestStartedAt: new Date('2026-10-01T00:00:00Z') } });
  const cpDoab = await checkpoints();
  const b1 = await B.runBulk('doab', { records: 7 });
  check('a bulk run reads what it was asked to (a page at a time) and publishes only what the classifier accepts', b1.discovered >= 7 && b1.discovered <= 10 && b1.published === b1.discovered && b1.newRecords === b1.published, JSON.stringify({ d: b1.discovered, p: b1.published, n: b1.newRecords }));
  check('the continuous DOAB checkpoint is exactly as it was (cursor 777 — not moved, not reset, not cleared)', (await checkpoints()) === cpDoab);
  const bs = (await B.bulkStatus()).find(s => s.id === 'doab')!;
  check('the bulk run kept its OWN position, and says where it is', bs.position === `xoai///set/${b1.discovered}` && !bs.completedAt, String(bs.position));
  const b2 = await B.runBulk('doab', { records: 50 });
  check('the next run carries on from there and reaches the end', b2.completed === true && b1.discovered + b2.discovered === 12, `${b1.discovered} + ${b2.discovered}`);
  check('all twelve are in the catalogue exactly once', (await db.book.count({ where: { title: { startsWith: `${RUN} Contract Law` } } })) === 12);
  check('the continuous checkpoint STILL has not moved', (await checkpoints()) === cpDoab);
  const b3 = await B.runBulk('doab', { records: 50 });
  check('a second full read adds nothing: every record is recognised as already held (duplicates are never counted as growth)', b3.published === 0 && b3.newRecords === 0 && b3.duplicates === 12 && (await db.book.count({ where: { title: { startsWith: `${RUN} Contract Law` } } })) === 12, JSON.stringify({ p: b3.published, d: b3.duplicates }));
  const ctr = (await B.bulkStatus()).find(s => s.id === 'doab')!.counters;
  check('the totals across runs are kept', ctr.runs === 3 && ctr.newRecords === 12 && ctr.duplicates >= 12, JSON.stringify(ctr));
  await db.ingestionSourceHealth.upsert({ where: { source: 'OAPEN' }, create: { source: 'OAPEN', consecutiveFailures: 3, pausedUntil: new Date(Date.now() + 3_600_000), lastError: 'timeout', lastErrorKind: 'timeout' }, update: { consecutiveFailures: 3, pausedUntil: new Date(Date.now() + 3_600_000), lastError: 'timeout', lastErrorKind: 'timeout' } });
  const before = hits('library.oapen.org');
  let refusedBulk = false; try { await B.runBulk('oapen', { records: 50 }); } catch (e) { refusedBulk = e instanceof B.BulkError; }
  check('a bulk run never asks a source that is resting', refusedBulk && hits('library.oapen.org') === before);

  // ═══════════════════════════════════════════════════════════════════════
  section('8. Bulk Journals sync: review-first, OA unverified, identity by ISSN-L → ISSN/eISSN → title + publisher');
  await resetAll();
  const held = await db.journal.create({ data: { title: `${RUN} Held Journal`, issn: '1111-1111', eissn: '2222-2222', publisherName: 'Held Press', status: 'Accepted', rightsBasis: 'DOAJ declaration', licence: 'CC BY', licenceIsNC: false, domain: 'Law' } });
  const heldNoIssn = await db.journal.create({ data: { title: `${RUN} Renamed Identifiers`, issn: '3333-3333', publisherName: 'Same Press', status: 'MetadataOnly', rightsBasis: 'DOAJ declaration', domain: 'Arts' } });
  const oaj = (n: number, extra: any = {}) => ({ display_name: `${RUN} Journal ${n}`, issn_l: `4${String(n).padStart(3, '0')}-0001`, issn: [`4${String(n).padStart(3, '0')}-0001`, `5${String(n).padStart(3, '0')}-0002`], host_organization_name: `Press ${n}`, country_code: 'IN', homepage_url: 'https://j.example', topics: [{ display_name: 'Engineering' }], is_in_doaj: false, ...extra });
  oaSources = [
    oaj(1), oaj(2), oaj(3),
    { display_name: `${RUN} Held Journal`, issn_l: '2222-2222', issn: ['2222-2222', '1111-1111'], host_organization_name: 'Held Press' },                      // held: matched by its eISSN / ISSN-L
    { display_name: `${RUN} Renamed Identifiers`, issn_l: '9999-0009', issn: ['9999-0009'], host_organization_name: 'Same Press' },                           // different ISSN, same title + publisher
    oaj(1),                                                                                                                                              // the same journal twice
  ];
  const jr = await B.runBulk('openalex-sources', { records: 100 });
  const newOnes = await db.journal.findMany({ where: { title: { startsWith: `${RUN} Journal ` } } });
  check('three new journals were discovered; the held one, the title+publisher match and the repeat were recognised', newOnes.length === 3 && jr.newRecords === 3 && jr.duplicates === 3, JSON.stringify({ n: jr.newRecords, d: jr.duplicates }));
  check('they are NeedsReview with open access UNVERIFIED — nothing is published, nothing is called open', newOnes.every((j: any) => j.status === 'NeedsReview' && j.openAccess === false && !j.licence && /OA unverified/.test(j.rightsBasis || '')), JSON.stringify(newOnes.map((j: any) => [j.status, j.rightsBasis])));
  check('journals we hold were not changed in status, licence or rights', (await db.journal.findUnique({ where: { id: held.id } })).status === 'Accepted' && (await db.journal.findUnique({ where: { id: held.id } })).licence === 'CC BY');
  check('the journal was not duplicated under a different ISSN (same title + publisher)', (await db.journal.count({ where: { title: `${RUN} Renamed Identifiers` } })) === 1);
  check('the bulk journal run says Review, not Published', jr.review === 3 && jr.published === 0 && jr.completed === true);
  // a journal listed by Crossref under an ISSN we already hold under its other ISSN
  crossrefJournals = [{ title: [`${RUN} Held Journal`], publisher: 'Held Press', ISSN: ['2222-2222'], 'issn-type': [{ value: '2222-2222', type: 'electronic' }] }];
  const jc = await B.runBulk('crossref-journals', { records: 100 });
  check('Crossref listing the held journal under its eISSN adds nothing', jc.newRecords === 0 && jc.duplicates === 1 && (await db.journal.count({ where: { title: `${RUN} Held Journal` } })) === 1);
  const w = await writeJournalCandidates('OpenAlex Sources', null, [{ source: 'OpenAlex Sources', title: `${RUN} Same Title`, issn: '6000-0001', eissn: null, issnL: '6000-0001', publisherName: 'P', country: null, homepage: null, subjects: [] }, { source: 'OpenAlex Sources', title: `${RUN} Same Title`, issn: '6000-0002', eissn: null, publisherName: 'P', country: null, homepage: null, subjects: [] }]);
  check('two spellings of one journal on one page count once', w.created === 1 && w.held === 1, JSON.stringify(w));

  // ═══════════════════════════════════════════════════════════════════════
  section('9. The growth report: ingestion EVENTS and CURRENT totals are separate numbers');
  const g = await G.catalogueGrowth('all', db);
  const pubNow = await db.book.count({ where: { status: 'Published' } });
  check('current Book total is read from the catalogue, not from the run log', g.books.current === pubNow, `${g.books.current} vs ${pubNow}`);
  check('events are summed from the run log and are not the same thing (duplicates are events, never growth)', g.books.duplicates >= 12 && g.books.newRecords >= 12 && g.books.current === pubNow);
  check('Journals: discovered, new, duplicates and review are reported from the bulk run', g.journals.discovered >= 6 && g.journals.newRecords >= 3 && g.journals.duplicates >= 3 && g.journals.review >= 3);
  check('Journals: current is the catalogue count', g.journals.current === await db.journal.count());
  check('the report has every column asked for', ['current', 'discovered', 'checked', 'newRecords', 'duplicates', 'review', 'published', 'metadataOnly', 'rejected', 'providerFailures'].every(k => k in g.books && k in g.journals));

  // ═══════════════════════════════════════════════════════════════════════
  section('10. Normal continuous ingestion still works, and keeps its own checkpoints');
  await resetAll();
  await T.savePriorityConfig({ enabled: false }, null);
  doab = Array.from({ length: 7 }, (_, i) => ({ handle: `20.500.12854/${RUN}c${i}`, title: `${RUN} Continuous Law ${i}`, isbn: ISBN[i], codes: LAW, kw: ['law'], rights: 'CC-BY' }));
  const bulkBefore = JSON.stringify((await B.bulkStatus()).map(s => s.position));
  const pass1 = await runEnginePass([], { force: true, only: 'books' }) as any;
  check('with the priority switch off, the ordinary rotation runs and publishes through the same pipeline', pass1.provider === 'doab' && pass1.added >= 1, `${pass1.provider} added ${pass1.added}`);
  check('and the CONTINUOUS checkpoint is the one that moved', (await db.bookHarvestCheckpoint.count({ where: { provider: 'DOAB' } })) === 1);
  check('while the bulk positions did not', JSON.stringify((await B.bulkStatus()).map(s => s.position)) === bulkBefore);
  check('no request was sent to Open Library while targeting is off', hits('openlibrary.org') === 0);
  await T.savePriorityConfig({ enabled: true }, null);
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}`);
} finally {
  await db.journal.deleteMany({ where: { title: { startsWith: `${RUN} ` } } });
  await db.ingestionSourceHealth.deleteMany({ where: { source: { startsWith: `QA-${RUN}` } } });
  await db.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
  await __resetRotationState();
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
