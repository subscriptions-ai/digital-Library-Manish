/**
 * The Book insert script (scripts/book-source-apply.cjs): creates only, skips what is already held, bounded, idempotent, audited.
 * Private throwaway database `stm_doaj_held_test` only.
 *
 *   npx tsx scripts/test-book-source-apply.ts
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_doaj_held_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d') as any[])[0].d !== 'stm_doaj_held_test') throw new Error('refusing to run against any other database');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const TAG = `bs${Date.now().toString(36)}`;
await db.$executeRawUnsafe(`truncate table "Article", "Book", "IngestionAudit" restart identity cascade`).catch(async () => { await db.book.deleteMany({}); });

const held = await Promise.all([
  db.book.create({ data: { title: `${TAG} held doi`, doi: `10.1234/${TAG}.a`, status: 'Published', licence: 'CC BY', domain: 'Law' } }),
  db.book.create({ data: { title: `${TAG} held isbn`, isbn: '978-3-16-148410-0', status: 'Published', licence: 'CC BY', domain: 'Law' } }),
  db.book.create({ data: { title: `${TAG} held pid`, source: 'DOAB', sourceRecordId: `${TAG}-pid`, status: 'Draft', domain: 'Arts' } }),
  db.book.create({ data: { title: `${TAG} held fp`, fingerprint: `${TAG}-fp`, status: 'Published', licence: 'CC BY', domain: 'Arts' } }),
]);
const snap = async () => JSON.stringify((await db.book.findMany({ orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 })));
const before = await snap();
const row = (n: number, extra: any = {}) => ({ source: 'DOAB', sourceRecordId: `${TAG}-${n}`, doi: `10.9999/${TAG}.${n}`, fingerprint: `${TAG}-f${n}`, row: { title: `${TAG} New Book ${n}`, authors: 'A. Author', doi: `10.9999/${TAG}.${n}`, isbn: null, year: 2022, domain: 'Education and Social Sciences', status: 'Published', ownershipSource: 'Ingested', source: 'DOAB', sourceRecordId: `${TAG}-${n}`, fingerprint: `${TAG}-f${n}`, licence: 'CC BY', licenceIsNC: false, rightsStatus: 'MetadataOnly', accessStatus: 'LinkOnly', accessType: 'OpenAccess', rightsBasis: 'DOAB declared licence', pdfUrl: null, originalUrl: `https://example.org/${n}`, metadata: { harvest: { note: 'test' } }, columnTheLiveTableDoesNotHave: 1, ...extra } });
const rows = [
  { source: 'DOAB', doi: `https://doi.org/10.1234/${TAG}.A`, fingerprint: null, sourceRecordId: null, row: { title: 'dup by DOI (resolver form, upper case)', status: 'Published', domain: 'Law', source: 'DOAB' } },
  { source: 'DOAB', doi: null, isbn: '9783161484100', fingerprint: null, sourceRecordId: null, row: { title: 'dup by ISBN', isbn: '9783161484100', status: 'Published', domain: 'Law', source: 'DOAB' } },
  { source: 'DOAB', doi: null, fingerprint: null, sourceRecordId: `${TAG}-pid`, row: { title: 'dup by provider id', status: 'Published', domain: 'Law', source: 'DOAB', sourceRecordId: `${TAG}-pid` } },
  { source: 'DOAB', doi: null, fingerprint: `${TAG}-fp`, sourceRecordId: null, row: { title: 'dup by fingerprint', status: 'Published', domain: 'Law', source: 'DOAB', fingerprint: `${TAG}-fp` } },
  ...Array.from({ length: 250 }, (_, i) => row(i)),
  row(0),                                                                                                   // the same new book twice in one plan
];
const run = (plan: any, ...flags: string[]) => { const withDb = flags.some(f => f.startsWith('--expect-db')) ? flags : [...flags, '--expect-db=stm_doaj_held_test']; return runRaw(plan, withDb); };
let lastStderr = ''; let lastStatus: number | null = 0;
const runRaw = (plan: any, flags: string[], env: Record<string, string> = {}) => { const text = `var __PLAN__ = ${JSON.stringify(plan)};\n` + readFileSync(new URL('./book-source-apply.cjs', import.meta.url), 'utf8'); const r = spawnSync('node', ['-', ...flags], { input: text, env: { ...process.env, DATABASE_URL: TEST_URL, ...env }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, maxBuffer: 64 * 1024 * 1024 }); lastStderr = r.stderr; lastStatus = r.status; try { return JSON.parse(r.stdout); } catch { return { error: r.stderr.slice(0, 500) }; } };   // the plan travels in the script text, exactly as it does in production
const plan = { runId: `test-${TAG}`, rows };

const dry = run(plan, '--dry');
check('--dry writes nothing and says what it would insert', dry.dry === true && dry.inserted === 250 && (await db.book.count({ where: { title: { startsWith: `${TAG} New Book` } } })) === 0, JSON.stringify(dry).slice(0, 200));
const r1 = run(plan, '--max=120');
check('--max bounds the run, in batches of at most 100', r1.attempted === 120 && r1.batches === 2, JSON.stringify({ req: r1.attempted, b: r1.batches, e: r1.error }));
const r2 = run(plan);
const total = await db.book.count({ where: { title: { startsWith: `${TAG} New Book` } } });
check('the rest go in; already-inserted rows are skipped, never duplicated', total === 250 && r2.inserted === 134, JSON.stringify({ ins: r2.inserted, skipped: r2.skipped, total }));
check('held DOI (even in resolver form and upper case), ISBN (hyphens), provider id and fingerprint are each skipped', r2.skipped.doi >= 1 && r2.skipped.isbn === 1 && r2.skipped.providerId === 1 && r2.skipped.fingerprint >= 1, JSON.stringify(r2.skipped));
const r3 = run(plan);
check('running it again inserts nothing (idempotent)', r3.inserted === 0 && (await db.book.count({ where: { title: { startsWith: `${TAG} New Book` } } })) === 250);
const ins = await db.book.findMany({ where: { title: { startsWith: `${TAG} New Book` } } });
check('every inserted book is exactly what the plan said (Published, LinkOnly, licence, department, no file)', ins.every((b: any) => b.status === 'Published' && b.accessStatus === 'LinkOnly' && b.licence === 'CC BY' && b.domain === 'Education and Social Sciences' && b.pdfUrl === null && b.ownershipSource === 'Ingested'));
check('a column the live table does not have is dropped, not an error', (r1.droppedColumns || []).includes('columnTheLiveTableDoesNotHave') && r1.failed === 0);
const after = JSON.stringify((await db.book.findMany({ where: { id: { in: held.map((h: any) => h.id) } }, orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 })));
check('the books that were already there are exactly as they were', JSON.stringify(JSON.parse(before)) === after || JSON.parse(before).every((b: any) => JSON.parse(after).some((a: any) => a.id === b.id && JSON.stringify(a) === JSON.stringify(b))));
check('no article was created', (await db.article.count()) === 0);
const audits = await db.ingestionAudit.findMany({ where: { action: 'BOOK_SOURCE_IMPORT' } });
check('one audit entry per batch that inserted, with the ids (rollback)', audits.length >= 3 && audits.reduce((n: number, a: any) => n + ((a.meta as any).inserted?.length || 0), 0) === 250);


// ── the hardening: guard, atomic batches, idempotent retry, twins in both collections ────────────────────────────────────────────────────
const T2 = `${TAG}x`;
const mk = (n: number, extra: any = {}, top: any = {}) => ({ source: 'DOAB', sourceRecordId: `${T2}-${n}`, doi: null, isbn: null, fingerprint: `${T2}-f${n}`, ...top, row: { title: `${T2} Unique Title ${n}`, authors: `Writer${n}, A.`, year: 2021, domain: 'Law', status: 'Published', ownershipSource: 'Ingested', source: 'DOAB', sourceRecordId: `${T2}-${n}`, fingerprint: `${T2}-f${n}`, licence: 'CC BY', licenceIsNC: false, rightsStatus: 'MetadataOnly', accessStatus: 'LinkOnly', accessType: 'OpenAccess', pdfUrl: null, originalUrl: `https://example.org/${T2}/${n}`, metadata: {}, ...extra } });
const small = { runId: `test2-${T2}`, rows: Array.from({ length: 30 }, (_, i) => mk(i)) };
const noGuard = runRaw(small, []); const wrongDb = runRaw(small, ['--expect-db=postgres']);
check('writing without --expect-db, or with the wrong database name, is refused and writes nothing', lastStatus === 2 && (await db.book.count({ where: { title: { startsWith: `${T2} ` } } })) === 0 && !!noGuard && !!wrongDb, `${lastStatus}`);
const atomic = runRaw(small, ['--expect-db=stm_doaj_held_test', '--batch=10'], { BOOK_APPLY_TEST_FAIL_AUDIT_BATCH: '2' });
const afterFail = await db.book.count({ where: { title: { startsWith: `${T2} ` } } });
check('an audit failure rolls that batch back and stops: batch 1 is there with its audit, batch 2 left no rows, batch 3 was never tried', lastStatus === 1 && afterFail === 10 && atomic.stopped && atomic.failed === 10, JSON.stringify({ status: lastStatus, afterFail, stopped: atomic.stopped }));
const committedLines = lastStderr.split('\n').filter(l => l.startsWith('{"committed"')).map(l => JSON.parse(l));
const auditRows = await db.ingestionAudit.findMany({ where: { action: 'BOOK_SOURCE_IMPORT' } });
const auditedIds = new Set(auditRows.flatMap((a: any) => ((a.meta as any).inserted || []).map((x: any) => x.id)));
check('the ids of the committed batch were printed as it committed, and are the ones in the audit', committedLines.length === 1 && committedLines[0].ids.every((id: string) => auditedIds.has(id)) && committedLines[0].ids.length === 10);
const retry = runRaw(small, ['--expect-db=stm_doaj_held_test', '--batch=10']);
check('a retry recognises its own committed work by derived id, inserts only the remaining 20, duplicates nothing', retry.alreadyDone === 10 && retry.inserted === 20 && (await db.book.count({ where: { title: { startsWith: `${T2} ` } } })) === 30, JSON.stringify({ done: retry.alreadyDone, ins: retry.inserted }));
const allAudited = new Set((await db.ingestionAudit.findMany({ where: { action: 'BOOK_SOURCE_IMPORT' } })).flatMap((a: any) => ((a.meta as any).inserted || []).map((x: any) => x.id)));
const mine = await db.book.findMany({ where: { title: { startsWith: `${T2} ` } }, select: { id: true } });
check('every inserted row is in exactly one audit entry (audit completeness)', mine.every((b: any) => allAudited.has(b.id)));

// Twins: the same book as another manifestation (different ISBN) or in the legacy collection is not a new title; a new edition is.
await db.book.create({ data: { title: `${T2} Twin Print Edition`, authors: 'Marsh, J.', year: 2020, isbn: '978-0-306-40615-7', status: 'Published', domain: 'Arts', edition: '1st' } });
await db.book.create({ data: { title: `${T2} Draft Held Elsewhere`, authors: 'Nolan, K.', year: 2019, status: 'Draft', domain: null } });
await db.content.create({ data: { title: `${T2} Legacy Held Title`, authors: 'Okafor, N.', contentType: 'Books', status: 'Draft' } });
const twins = { runId: `test3-${T2}`, rows: [
  mk(100, { title: `${T2} Twin Print Edition`, authors: 'J. Marsh', year: 2020, isbn: '9781234567897', edition: '1st' }, { isbn: '9781234567897' }),         // electronic manifestation, other ISBN: same book
  mk(101, { title: `${T2} Twin Print Edition`, authors: 'J. Marsh', year: 2023, isbn: '9781234567897', edition: '2nd' }, { isbn: '9781234567897' }),          // a later edition: a different book
  mk(102, { title: `${T2} Draft Held Elsewhere`, authors: 'K. Nolan', year: 2019 }),                                                 // held as a Draft: still held
  mk(103, { title: `${T2} Legacy Held Title`, authors: 'N. Okafor' }),                                                              // held in the legacy collection
  mk(104, { title: `${T2} Legacy Held Title`, authors: 'Someone, Else' }),                                                          // same title, a different author: not the same book
  mk(105, { title: `${T2} ISBN ten`, isbn: '0-306-40615-2' }, { isbn: '0-306-40615-2' }),                                                                      // ISBN-10 of the held 978-0-306-40615-7
] };
const tw = run(twins);
const gotTitles = new Set((await db.book.findMany({ where: { title: { startsWith: `${T2} ` } }, select: { title: true, edition: true, authors: true } })).map((b: any) => `${b.title}|${b.edition || ''}|${b.authors || ''}`));
check('same title/author/year as a held manifestation is skipped (twin); a 2nd edition is inserted', tw.skipped.title >= 3 && gotTitles.has(`${T2} Twin Print Edition|2nd|J. Marsh`) && !gotTitles.has(`${T2} Twin Print Edition||J. Marsh`), JSON.stringify(tw.skipped));
check('a book held as a Draft, and one held in the legacy collection, are not inserted again', !gotTitles.has(`${T2} Draft Held Elsewhere||K. Nolan`) && !gotTitles.has(`${T2} Legacy Held Title||N. Okafor`));
check('the same title with a different author is a different book and is inserted', gotTitles.has(`${T2} Legacy Held Title||Someone, Else`));
check('an ISBN-10 is recognised as the held ISBN-13 (hyphens or not)', tw.skipped.isbn === 1 && !gotTitles.has(`${T2} ISBN ten||`) && !(await db.book.count({ where: { title: `${T2} ISBN ten` } })));
// The 2026-10-29 import let ~155 twins in because "Nico Cloete, Peter Maassen" and "Cloete, Nico" were compared as different authors.
await db.book.create({ data: { title: `${T2} Author Order Twin`, authors: 'Cloete, Nico', year: 2018, status: 'Published', domain: 'Arts' } });
await db.content.create({ data: { title: `${T2} Author Order Legacy`, authors: 'Maassen, Peter; Cloete, Nico', contentType: 'Books', status: 'Published' } });
const order = run({ runId: `test5-${T2}`, rows: [
  mk(300, { title: `${T2} Author Order Twin`, authors: 'Nico Cloete, Peter Maassen', year: 2018 }),    // same book, names written given-name-first
  mk(301, { title: `${T2} Author Order Legacy`, authors: 'Nico Cloete, Peter Maassen' }),               // legacy twin, other order
  mk(302, { title: `${T2} Author Order Twin`, authors: 'Jane Different', year: 2018 }),                // same title, no shared name: a different book
] });
check('authors written "First Last, First Last" and "Last, First" are the same author (twin skipped, in both collections); a different author is kept', order.skipped.title === 2 && order.inserted === 1 && (await db.book.count({ where: { title: `${T2} Author Order Twin`, authors: 'Jane Different' } })) === 1, JSON.stringify({ sk: order.skipped, ins: order.inserted }));
check('a dry run still writes nothing and says what it would do', run({ runId: `test4-${T2}`, rows: [mk(200)] }, '--dry').inserted === 1 && (await db.book.count({ where: { title: `${T2} Unique Title 200` } })) === 0);
const verify = (pl: any, runId: string) => { const text = `var __PLAN__ = ${JSON.stringify(pl)};\nvar __RUN__ = ${JSON.stringify(runId)};\n` + readFileSync(new URL('./book-import-verify.cjs', import.meta.url), 'utf8'); const r = spawnSync('node', ['-'], { input: text, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, maxBuffer: 64 * 1024 * 1024 }); try { return JSON.parse(r.stdout); } catch { return { ok: false, error: r.stderr.slice(0, 300) }; } };
const vOk = verify(small, small.runId);
check('the verifier (read-only) accepts a clean run: 30 rows, all audited, rights shape and fields as frozen, no copies', vOk.ok === true && vOk.rowsFound === 30 && vOk.auditedIds === 30 && vOk.problems.length === 0, JSON.stringify(vOk.problems?.slice(0, 2) || vOk.error));
const beforeTamper = await db.book.count();
await db.book.updateMany({ where: { title: `${T2} Unique Title 3` }, data: { pdfUrl: 'https://example.org/file.pdf', domain: 'Arts' } });
const vBad = verify(small, small.runId);
check('and flags a row that no longer matches (a file address appeared, the department changed)', vBad.ok === false && vBad.problems.some((x: any) => x.check === 'rights:file_address') && vBad.problems.some((x: any) => x.check === 'department'), JSON.stringify(vBad.problems?.map((x: any) => x.check)));
check('the verifier wrote nothing', (await db.book.count()) === beforeTamper);
await db.book.deleteMany({ where: { title: { startsWith: `${T2} ` } } }); await db.content.deleteMany({ where: { title: { startsWith: `${T2} ` } } });

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
