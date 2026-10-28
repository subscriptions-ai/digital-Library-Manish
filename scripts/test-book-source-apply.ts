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
const run = (plan: any, ...flags: string[]) => { const text = `var __PLAN__ = ${JSON.stringify(plan)};\n` + readFileSync(new URL('./book-source-apply.cjs', import.meta.url), 'utf8'); const r = spawnSync('node', ['-', ...flags], { input: text, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, maxBuffer: 64 * 1024 * 1024 }); try { return JSON.parse(r.stdout); } catch { return { error: r.stderr.slice(0, 500) }; } };   // the plan travels in the script text, exactly as it does in production
const plan = { runId: `test-${TAG}`, rows };

const dry = run(plan, '--dry');
check('--dry writes nothing and says what it would insert', dry.dry === true && dry.inserted === 250 && (await db.book.count({ where: { title: { startsWith: `${TAG} New Book` } } })) === 0, JSON.stringify(dry).slice(0, 200));
const r1 = run(plan, '--max=120');
check('--max bounds the run, in batches of at most 100', r1.requested === 120 && r1.batches === 2, JSON.stringify({ req: r1.requested, b: r1.batches, e: r1.error }));
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

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
