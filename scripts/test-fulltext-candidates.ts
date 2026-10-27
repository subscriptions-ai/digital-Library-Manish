/**
 * Phase 2G: the full-text CANDIDATE REVIEW — the saved candidate list, a person's Approve / Hold / Reject, and the real HTTP routes. No network (the two services are a fake transport) and
 * no file is ever asked for: the suite fails if the fake sees any request that is not Open Library's JSON API or the Archive's metadata JSON.
 *
 *   npx tsx scripts/test-fulltext-candidates.ts
 *
 * Private throwaway database `stm_ol_fulltext_test` only (createdb stm_ol_fulltext_test && DATABASE_URL=…/stm_ol_fulltext_test npx prisma db push). A Postgres tripwire records every
 * INSERT, UPDATE and DELETE on "Book" for the whole run; nothing here may cause one after the Books are seeded.
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

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== TEST_DB) throw new Error(`refusing to run against anything but ${TEST_DB}`);
const A = await import('../src/lib/ingestion/books/olFulltextAudit.js');
const S = await import('../src/lib/ingestion/books/fulltextCandidates.js');
const { World, fx, isbn13, olEntry, withPdf } = await import('./ol-test-world.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const rejects = async (p: Promise<any>, code: string) => { try { await p; return false; } catch (e: any) { return e?.code === code; } };
const RUN = Date.now().toString(36);

const w = new World();
const created: string[] = []; let n = 0;
const iaNew = fx('ia-NewSpaceShip1'), iaPd = fx('ia-the-daily-life-of-a-stalker'), iaNc = fx('ia-BuchzusammenfassungNr.1HandbuchDerTransa'), iaFlag = fx('ia-suiprincipiidir00alimgoog'), iaBorrow = fx('ia-basicsofelectrot0000khat');
const seed = async (o: { avail: string | null; ia?: any; domain?: string; authors?: string; year?: number; isbn?: string; recordId?: string }) => {
  const k = ++n; const isbn = o.isbn ?? isbn13(5000 + k); const oc = `g-item-${k}`;
  const b = await db.book.create({ data: { title: `Candidate book ${k} ${RUN}`, authors: o.authors ?? `Author ${k}`, year: o.year ?? 2001 + k, isbn, source: 'OpenLibraryDump', sourceRecordId: o.recordId ?? `OL${5000 + k}M`, originalUrl: `https://openlibrary.org/books/OL${5000 + k}M`, domain: o.domain ?? null, status: 'Draft', rightsStatus: 'MetadataOnly', accessStatus: 'MetadataOnly', licenceIsNC: true, rightsBasis: 'OpenLibrary record, licence undeclared' } });
  created.push(b.id);
  w.editions.set(`OLID:OL${5000 + k}M`, olEntry(5000 + k, isbn, o.avail === null ? null : oc, o.avail ?? 'full'));
  if (o.ia) w.ia.set(oc, o.ia);
  return { id: b.id, k, oc, isbn, olNum: 5000 + k };
};
const WATCH: [string, string][] = [
  ['every Book column', `select md5(coalesce(string_agg(b::text, E'\\n' order by id), '')) h from "Book" b`],
  ['provider health', `select md5(coalesce(string_agg(s::text, E'\\n' order by source), '')) h from "IngestionSourceHealth" s`],
  ['engine settings and checkpoints', `select md5(coalesce(string_agg(concat_ws('|', key, value::text), E'\\n' order by key), '')) h from "AppSetting" where key not like 'fulltext.%' and key <> 'uploads.storage.v1'`],       // the server's own boot-time storage check writes uploads.storage.v1 (not ours; removed below)
  ['other counts', `select (select count(*) from "Article")::text || '/' || (select count(*) from "Journal")::text || '/' || (select count(*) from "Chapter")::text || '/' || (select count(*) from "Publisher")::text h`],
];
const fingerprint = async () => { const o: string[] = []; for (const [, sql] of WATCH) o.push((await db.$queryRawUnsafe<any[]>(sql))[0].h); return o; };
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const users: string[] = []; const sessions: string[] = [];
const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-ftc-${RUN}@api-test.invalid`, password: 'x', role } }); users.push(u.id);
  const sid = `sid-ftc-${RUN}-${role}`; await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } }); sessions.push(sid);
  return { token: jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' }), email: u.email };
};

await db.$executeRawUnsafe(`create table if not exists "_ftc_test_book_events" (id text, op text, at timestamptz default now())`);
await db.$executeRawUnsafe(`truncate "_ftc_test_book_events"`);
await db.$executeRawUnsafe(`create or replace function _ftc_test_book_event() returns trigger language plpgsql as $$ begin if tg_op = 'DELETE' then insert into "_ftc_test_book_events"(id, op) values (old.id, 'DELETE'); return old; end if; insert into "_ftc_test_book_events"(id, op) values (new.id, tg_op); return new; end $$`);
await db.$executeRawUnsafe(`drop trigger if exists _ftc_test_book_event on "Book"`);
await db.$executeRawUnsafe(`create trigger _ftc_test_book_event after insert or update or delete on "Book" for each row execute function _ftc_test_book_event()`);
const BEFORE_ROWS = (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Book")::int b, (select count(*) from "AppSetting")::int s, (select count(*) from "BackfillJob")::int j, (select count(*) from "User")::int u`))[0];
const admin = { email: `reviewer-${RUN}@test.invalid` };
let server: any = null;

try {
  section('1. The audit hands the review screen complete candidate rows');
  const pd = await seed({ avail: 'full', ia: withPdf(iaPd, 0, { openlibrary_edition: undefined }), domain: 'Law' });
  w.ia.set(pd.oc, withPdf(iaPd, pd.olNum)); w.ia.get(pd.oc).metadata.identifier = pd.oc;
  const ccby = await seed({ avail: 'full', domain: 'Law' }); w.ia.set(ccby.oc, { ...withPdf(iaNew, ccby.olNum), metadata: { ...withPdf(iaNew, ccby.olNum).metadata, identifier: ccby.oc } });
  const bysa = await seed({ avail: 'full', domain: 'Management' }); w.ia.set(bysa.oc, { ...withPdf(iaNew, bysa.olNum, { licenseurl: 'http://creativecommons.org/licenses/by-sa/4.0/', identifier: bysa.oc }) });
  const borrow = await seed({ avail: 'borrow', ia: iaBorrow, domain: 'Law' });
  const unknown = await seed({ avail: 'full', domain: 'Law' }); w.ia.set(unknown.oc, withPdf(iaNew, unknown.olNum, { licenseurl: undefined, identifier: unknown.oc }));
  const wrongEd = await seed({ avail: 'full', domain: 'Law' }); w.ia.set(wrongEd.oc, withPdf(iaNew, 1, { openlibrary_edition: 'OL99999999M', isbn: undefined, identifier: wrongEd.oc }));
  const nc = await seed({ avail: 'full', domain: 'Law' }); w.ia.set(nc.oc, withPdf(iaNc, nc.olNum, { identifier: nc.oc }));
  const flag = await seed({ avail: 'full', domain: 'Law' }); w.ia.set(flag.oc, withPdf(iaFlag, flag.olNum, { identifier: flag.oc }));
  const dupI = isbn13(9999); const dupA = await seed({ avail: 'full', isbn: dupI, domain: 'Law' }), dupB = await seed({ avail: 'full', isbn: dupI, domain: 'Law' });
  const books = created.slice();
  const fp0 = await fingerprint();
  const r1 = await A.runAudit(db as any, w.opts({ sources: ['OpenLibraryDump'] }));
  const ids = new Set(r1.candidates.map(c => c.bookId));
  check('candidates are exactly the Public Domain, CC BY and CC BY-SA items: not borrow-only, not unknown licence, not a wrong edition, not NC, not the "possibly out of copyright" flag alone, not a shared ISBN', ids.size === 3 && ids.has(pd.id) && ids.has(ccby.id) && ids.has(bysa.id), { counts: r1.counts });
  check('each candidate row carries everything the reviewer needs: title, author, year, ISBN, Open Library id, Archive id, department, licence, licence address, access, format, landing page, evidence', r1.candidates.every(c => c.title && c.authors && c.year && c.isbn && c.olId && c.ocaid && c.department && c.licence && c.licenceUrl && c.access === 'full' && /^(PDF|EPUB)$/.test(c.format) && c.landingUrl === `https://archive.org/details/${c.ocaid}` && c.evidence.identityBasis && c.sourceFingerprint), r1.candidates[0]);
  check('the evidence says HOW the edition was matched: through the Open Library edition id and the Archive item\'s own record of that edition', r1.candidates.every(c => c.evidence.via === 'edition' && c.evidence.identityBasis === 'edition' && c.evidence.olAvailability === 'full' && c.evidence.archiveRestricted === false));
  check('the rights breakdown names each licence, and candidates are counted by department and by provider', r1.licences['Public Domain'] === 1 && r1.licences['CC BY'] === 1 && r1.licences['CC BY-SA'] === 1 && r1.candidatesByDepartment.Law === 2 && r1.candidatesByDepartment.Management === 1 && r1.candidatesBySource.OpenLibraryDump === 3, { l: r1.licences, d: r1.candidatesByDepartment, s: r1.candidatesBySource });
  check('the other verdicts are as the rules say (borrow-only, unknown licence, wrong edition → ambiguous, NC → restricted, flag → unknown, shared ISBN → ambiguous ×2)', r1.verdicts[borrow.id].c === 'borrowOnly' && r1.verdicts[unknown.id].c === 'readableLicenceUnknown' && r1.verdicts[wrongEd.id].c === 'ambiguous' && r1.verdicts[nc.id].c === 'readableLicenceRestricted' && r1.verdicts[flag.id].c === 'readableLicenceUnknown' && r1.verdicts[dupA.id].c === 'ambiguous' && r1.verdicts[dupB.id].c === 'ambiguous');
  check('no file was ever asked for: every request the fake saw was Open Library\'s JSON API or the Archive\'s metadata JSON', w.log.length > 0 && w.log.every(l => /^https:\/\/openlibrary\.org\/(api\/books|search\.json)\?/.test(l.url) || /^https:\/\/archive\.org\/metadata\/[^/]+$/.test(l.url)) && !w.log.some(l => /\/download\/|\.pdf|\.epub|\/stream\//i.test(l.url)), w.log.map(l => l.url).filter(u => /download|pdf|epub|stream/i.test(u)));

  section('2. Saving candidates writes AppSetting rows only');
  const sv1 = await S.saveCandidates(db as any, r1 as any, admin);
  const rows = await db.appSetting.count({ where: { key: { startsWith: S.PREFIX } } });
  check('three candidate rows and one run summary were saved; no Book was written', sv1.added === 3 && rows === 3 && !!(await db.appSetting.findUnique({ where: { key: S.RUN_KEY } })) && same((await fingerprint()), fp0));
  const list0 = await S.listCandidates(db as any, {});
  check('the list reports the saved audit (when, how many audited, candidates) and every candidate starts as "to review"', list0.run?.booksAudited === 10 && list0.summary.total === 3 && list0.summary.byState.pending === 3 && list0.run?.incomplete === false, list0.run);
  check('filters work: by department, by search text (title / ISBN / Open Library id / Archive id), by state; and pages are bounded', (await S.listCandidates(db as any, { department: 'Management' })).total === 1 && (await S.listCandidates(db as any, { q: pd.isbn })).total === 1 && (await S.listCandidates(db as any, { q: pd.oc })).total === 1 && (await S.listCandidates(db as any, { state: 'approved' })).total === 0 && (await S.listCandidates(db as any, { pageSize: 2 })).items.length === 2 && (await S.listCandidates(db as any, { pageSize: 9999 })).pageSize === 100);

  section('3. A person decides: Approve, Hold, Reject — a record, nothing more');
  const logBefore = w.log.length; const evBefore = (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "_ftc_test_book_events"`))[0].n; const auditBefore = await db.ingestionAudit.count();
  const ap = await S.decide(db as any, pd.id, 'approve', admin, 'Public Domain Mark; checked the title page');
  check('APPROVE records the decision, who, when and the note, against the evidence fingerprint — and nothing was asked of any source (no download)', ap.state === 'approved' && ap.decision?.by === admin.email && ap.decision?.note === 'Public Domain Mark; checked the title page' && ap.decision?.evidenceFingerprint === r1.candidates.find(c => c.bookId === pd.id)!.sourceFingerprint && w.log.length === logBefore);
  check('an audit entry says who decided what; the Book was not changed (every Book column identical)', (await db.ingestionAudit.count()) === auditBefore + 1 && (await db.ingestionAudit.findFirst({ where: { action: 'FULLTEXT_CANDIDATE_DECISION' as any }, orderBy: { at: 'desc' } }))?.meta?.decision === 'approve' && same(await fingerprint(), fp0));
  const hd = await S.decide(db as any, ccby.id, 'hold', admin, 'want to see the title page first');
  check('HOLD is always possible and is recorded', hd.state === 'hold' && hd.decision?.decision === 'hold');
  check('REJECT needs a reason: without one it is refused; with one it is recorded', await rejects(S.decide(db as any, bysa.id, 'reject', admin), 'BAD_REQUEST') && (await S.decide(db as any, bysa.id, 'reject', admin, 'a different edition on the shelf')).state === 'rejected');
  check('an unknown decision word is refused; a Book that is not a candidate is not found', await rejects(S.decide(db as any, pd.id, 'publish', admin), 'BAD_REQUEST') && await rejects(S.decide(db as any, borrow.id, 'approve', admin), 'NOT_FOUND'));
  const again = await S.decide(db as any, pd.id, 'approve', admin, 'Public Domain Mark; checked the title page');
  check('repeating the same decision changes nothing (no extra history, no extra audit entry)', again.unchanged === true && again.history.length === 0 && (await db.ingestionAudit.count()) === auditBefore + 3);
  const re = await S.decide(db as any, pd.id, 'hold', admin, 'second thoughts');
  check('changing a decision keeps the earlier one in a bounded history', re.state === 'hold' && re.history.length === 1 && re.history[0].decision === 'approve');
  await S.decide(db as any, pd.id, 'approve', admin, 'confirmed with the library');

  section('4. Approve is refused unless the evidence is complete');
  const stored = async (id: string) => (await db.appSetting.findUnique({ where: { key: S.keyOf(id) } })).value;
  const tamper = async (id: string, f: (s: any) => void) => { const s = await stored(id); f(s); await db.appSetting.update({ where: { key: S.keyOf(id) }, data: { value: s } }); };
  const restore = async (id: string, s0: any) => db.appSetting.update({ where: { key: S.keyOf(id) }, data: { value: s0 } });
  const s0 = await stored(ccby.id);
  const cases: [string, (s: any) => void][] = [
    ['the edition match is not confirmed', s => { s.row.evidence.identityBasis = null; }],
    ['a licence that does not allow our use (non-commercial)', s => { s.row.licence = 'CC BY-NC'; }],
    ['no licence at all', s => { s.row.licence = ''; }],
    ['no licence address', s => { s.row.licenceUrl = null; }],
    ['the Archive item is access-restricted (lending)', s => { s.row.evidence.archiveRestricted = true; }],
    ['Open Library does not say "full" (borrowable)', s => { s.row.evidence.olAvailability = 'borrow'; }],
    ['no PDF or EPUB', s => { s.row.format = 'MOBI'; }],
    ['stale (the latest audit no longer finds it a candidate)', s => { s.stale = true; }],
  ];
  for (const [why, f] of cases) {
    await tamper(ccby.id, f);
    const refused = await rejects(S.decide(db as any, ccby.id, 'approve', admin, 'x'), 'NOT_ELIGIBLE'); const held = await S.decide(db as any, ccby.id, 'hold', admin, 'unclear');
    check(`APPROVE refused — ${why} — but HOLD still works`, refused && held.state === 'hold');
    await restore(ccby.id, s0);
  }
  check('Approve is refused when the Book\'s ISBN or Open Library id changed since the audit', await (async () => { await db.$executeRawUnsafe(`update "Book" set isbn = $1 where id = $2`, isbn13(123456), ccby.id); const r = await rejects(S.decide(db as any, ccby.id, 'approve', admin, 'x'), 'NOT_ELIGIBLE'); await db.$executeRawUnsafe(`update "Book" set isbn = $1 where id = $2`, ccby.isbn, ccby.id); return r; })());
  check('a decision made on facts that have since changed is refused as CHANGED (the reviewer must look again)', await rejects(S.decide(db as any, ccby.id, 'approve', admin, 'x', 'not-the-fingerprint'), 'CHANGED'));
  check('with complete evidence Approve works (CC BY, edition confirmed through its Open Library edition id)', (await S.decide(db as any, ccby.id, 'approve', admin, 'ok')).state === 'approved');

  section('5. Repeating the audit keeps decisions; a changed source is noticed');
  const r2 = await A.runAudit(db as any, w.opts({ sources: ['OpenLibraryDump'] }));
  const sv2 = await S.saveCandidates(db as any, r2 as any, admin);
  check('REPEATED audit: same report hash, no new candidate, no flag, and every decision is kept', r2.reportHash === r1.reportHash && sv2.added === 0 && sv2.updated === 3 && sv2.flagged === 0 && (await S.listCandidates(db as any, {})).summary.byState.approved === 2 && (await S.listCandidates(db as any, {})).summary.byState.rejected === 1);
  // the Archive changes what it says about the Public Domain item (its file is replaced) and the CC BY item loses its licence
  w.ia.set(pd.oc, { ...withPdf(iaPd, pd.olNum, { identifier: pd.oc }), files: [{ name: `${pd.oc}.pdf`, format: 'Text PDF', size: '999' }] });
  w.ia.set(ccby.oc, withPdf(iaNew, ccby.olNum, { licenseurl: 'http://creativecommons.org/licenses/by-nc/4.0/', identifier: ccby.oc }));
  const r3 = await A.runAudit(db as any, w.opts({ sources: ['OpenLibraryDump'] }));
  const sv3 = await S.saveCandidates(db as any, r3 as any, admin);
  const l3 = await S.listCandidates(db as any, { state: 'all' }); const byId = new Map(l3.items.map((i: any) => [i.row.bookId, i]));
  check('CHANGED SOURCE: the Public Domain item\'s file changed → its approval is flagged "look again"; the CC BY item is no longer a candidate → stale, its approval kept but flagged', sv3.flagged === 1 && sv3.madeStale === 1 && byId.get(pd.id).state === 'approvedNeedsReview' && byId.get(pd.id).sourceChangedSinceDecision === true && byId.get(ccby.id).stale === true && byId.get(ccby.id).state === 'approvedNeedsReview', { sv3, st: [...byId.values()].map((i: any) => i.state) });
  check('a stale candidate cannot be approved again; the Public Domain one can be re-approved against the new facts, which clears the flag', await rejects(S.decide(db as any, ccby.id, 'approve', admin, 'x'), 'NOT_ELIGIBLE') && (await S.decide(db as any, pd.id, 'approve', admin, 're-checked the new file')).state === 'approved');
  const partial = await A.runAudit(db as any, w.opts({ sources: ['OpenLibraryDump'], limit: 1 }));
  const sv4 = await S.saveCandidates(db as any, partial as any, admin);
  check('a PARTIAL audit (a limit) never marks the candidates it did not look at as stale', sv4.madeStale === 0 && partial.wholeScope === false);
  const w2 = new World(); w2.editions = w.editions; w2.ia = w.ia; w2.hook = () => ({ status: 503 });
  const down = await A.runAudit(db as any, w2.opts({ sources: ['OpenLibraryDump'], breakAfter: 2 }));
  const sv5 = await S.saveCandidates(db as any, down as any, admin);
  const meta = (await S.listCandidates(db as any, {})).run!;
  check('SOURCE FAILURE: an incomplete audit saves no candidate, marks nothing stale, and says it is incomplete', down.candidates.length === 0 && sv5.madeStale === 0 && meta.incomplete === true && (await S.listCandidates(db as any, { state: 'all' })).summary.total === 3);
  const wl = new World(); wl.editions = w.editions; wl.ia = w.ia; let first = true; wl.hook = u => (first && /api\/books/.test(u) ? ((first = false), { status: 429, headers: { 'retry-after': '2' } }) : null);
  const rl = await A.runAudit(db as any, wl.opts({ sources: ['OpenLibraryDump'] }));
  check('RATE LIMIT: a 429 with Retry-After is waited out and the audit completes with the same candidates', wl.sleeps.includes(2000) && rl.candidates.length === r3.candidates.length && rl.reportHash === r3.reportHash);

  section('6. The real HTTP routes');
  const adm = await mkUser('SuperAdmin'), rdr = await mkUser('Subscriber');
  const PORT = 3104, BASE = `http://127.0.0.1:${PORT}`;
  const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], { cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development' } });
  let log = ''; child.stdout!.on('data', d => (log += d)); child.stderr!.on('data', d => (log += d)); server = child;
  const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => { const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {} return { status: r.status, data, text }; };
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/books/fulltext-candidates', { token: adm.token }); if (r.status) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start: ' + log.slice(-400)); await new Promise(r => setTimeout(r, 500)); }
  const P = '/api/admin/books/fulltext-candidates';
  check('no token → 401; a reader → 403; for both the list and a decision', (await call(P)).status === 401 && (await call(P, { token: rdr.token })).status === 403 && (await call(`${P}/${pd.id}/decision`, { method: 'POST', token: rdr.token, body: { decision: 'approve' } })).status === 403 && (await call(`${P}/${pd.id}/decision`, { method: 'POST', body: { decision: 'approve' } })).status === 401);
  const lst = await call(`${P}?state=all&pageSize=10`, { token: adm.token });
  check('the admin list returns the saved audit, the summary and the candidates with their evidence', lst.status === 200 && lst.data.summary.total === 3 && lst.data.items.length === 3 && lst.data.items[0].row.evidence.identityBasis && Array.isArray(lst.data.items[0].problems), lst.text.slice(0, 200));
  const cs = (await call(`${P}?state=all`, { token: adm.token })).data.items.find((i: any) => i.row.bookId === ccby.id);
  const bad = await call(`${P}/${ccby.id}/decision`, { method: 'POST', token: adm.token, body: { decision: 'approve', note: 'x' } });
  check('Approve of a stale candidate over HTTP → 409 NOT_ELIGIBLE with the reasons, and the Book is untouched', bad.status === 409 && bad.data.code === 'NOT_ELIGIBLE' && bad.data.problems.length > 0 && !!cs?.stale);
  const hold = await call(`${P}/${ccby.id}/decision`, { method: 'POST', token: adm.token, body: { decision: 'hold', note: 'licence changed at the source' } });
  const rej = await call(`${P}/${bysa.id}/decision`, { method: 'POST', token: adm.token, body: { decision: 'reject' } });
  const nf = await call(`${P}/${borrow.id}/decision`, { method: 'POST', token: adm.token, body: { decision: 'hold' } });
  check('Hold → 200 and recorded under the signed-in admin; Reject with no reason → 400; a non-candidate → 404', hold.status === 200 && hold.data.state === 'hold' && hold.data.decision.by === adm.email && rej.status === 400 && nf.status === 404);
  const ok = await call(`${P}/${pd.id}/decision`, { method: 'POST', token: adm.token, body: { decision: 'approve', note: 'again', expectedFingerprint: (await stored(pd.id)).row.sourceFingerprint } });
  check('Approve of a complete candidate over HTTP → 200 approved; a stale fingerprint → 409 CHANGED', ok.status === 200 && ok.data.state === 'approved' && (await call(`${P}/${pd.id}/decision`, { method: 'POST', token: adm.token, body: { decision: 'hold', note: 'x', expectedFingerprint: 'stale' } })).data?.code === 'CHANGED');

  section('7. Nothing about any Book moved');
  const evAfter = (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from "_ftc_test_book_events"`))[0].n;
  const fp1 = await fingerprint();
  check('every Book column — status, department, licence, access, rights, file address, source address — is byte-identical after every audit, save and decision (and HTTP call)', fp0[0] === fp1[0]);
  check('provider health, engine settings and checkpoints, and the Article / Journal / Chapter / Publisher counts are identical', same(fp0.slice(1), fp1.slice(1)), WATCH.map(([l], i) => fp0[i] === fp1[i] ? null : l).filter(Boolean));
  check('TRIPWIRE: Postgres recorded no UPDATE, INSERT or DELETE on "Book" after the seeding (the one write the suite itself made is the ISBN change and its restore, 2 events per Book edited)', evAfter - evBefore === 2, { evBefore, evAfter });
  check('no Book was created and no ISBN gained a second Book (apart from the deliberately shared one)', (await db.book.count()) === books.length + BEFORE_ROWS.b && (await db.$queryRawUnsafe<any[]>(`select count(*)::int n from (select isbn from "Book" where isbn is not null group by isbn having count(*) > 1) x`))[0].n === 1);
  check('no file was asked for at any point in the suite', !w.log.concat(w2.log, wl.log).some(l => /\/download\/|\.pdf|\.epub|\/stream\//i.test(l.url)));
} catch (e: any) {
  fail++; console.log('  FAIL  the suite crashed:', e?.stack || e);
} finally {
  try { if (server) process.kill(-server.pid, 'SIGTERM'); } catch {}
  await db.appSetting.deleteMany({ where: { OR: [{ key: { startsWith: S.PREFIX } }, { key: S.RUN_KEY }, { key: 'uploads.storage.v1' }] } });
  await db.ingestionAudit.deleteMany({ where: { action: 'FULLTEXT_CANDIDATE_DECISION' as any } });
  await db.userSession.deleteMany({ where: { sessionId: { in: sessions } } }); await db.user.deleteMany({ where: { id: { in: users } } });
  await db.book.deleteMany({ where: { id: { in: created } } });
  const AFTER = (await db.$queryRawUnsafe<any[]>(`select (select count(*) from "Book")::int b, (select count(*) from "AppSetting")::int s, (select count(*) from "BackfillJob")::int j, (select count(*) from "User")::int u`))[0];
  check('after cleanup the private database is as it was (Book, AppSetting, BackfillJob and User counts)', same(BEFORE_ROWS, AFTER), { BEFORE_ROWS, AFTER });
  await db.$executeRawUnsafe(`drop trigger if exists _ftc_test_book_event on "Book"`); await db.$executeRawUnsafe(`drop function if exists _ftc_test_book_event()`); await db.$executeRawUnsafe(`drop table if exists "_ftc_test_book_events"`);
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
}
