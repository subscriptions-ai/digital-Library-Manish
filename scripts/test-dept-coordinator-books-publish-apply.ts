/**
 * The wrapper forms of the coordinator's book publisher and its rollback (scripts/dept-coordinator-books-publish-{apply,rollback}.cjs): Draft -> Published for exact ids,
 * only while each book is still what was judged, skipped on a published twin, reversible by run id. Private throwaway database `stm_optometry_articles_test` ONLY.
 *
 *   npx tsx scripts/test-dept-coordinator-books-publish-apply.ts
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_optometry_articles_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const DB = (await db.$queryRawUnsafe('select current_database() d') as any[])[0].d;
if (DB !== 'stm_optometry_articles_test') throw new Error('refusing to run against any other database');
await db.$executeRawUnsafe(`truncate table "Book", "IngestionAudit" restart identity cascade`);

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const dir = mkdtempSync(join(tmpdir(), 'books-publish-test-'));
const hex = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
const RUN = `dept-books-publish-2026-10-31-${hex()}`;
const spec = (domain: string, i: number) => ({ id: crypto.randomUUID(), domain, licence: null, licenceIsNC: null, rightsStatus: 'MetadataOnly', accessStatus: 'MetadataOnly', rightsBasis: null, year: 2020 + (i % 5), route: 'C: person-reviewed metadata-only entry (test)' });
const rows = [...Array(3)].map((_, i) => spec('Medical Laboratory Technology', i)).concat([...Array(2)].map((_, i) => spec('Optometry & Ophthalmology', i)), [...Array(2)].map((_, i) => spec('Paramedical Sciences', i)));
const seed = (r: any, extra: any = {}) => db.book.create({ data: { id: r.id, title: `Reviewed book ${r.id.slice(0, 6)}`, status: 'Draft', domain: r.domain, licence: r.licence, rightsStatus: r.rightsStatus, accessStatus: r.accessStatus, year: r.year, ownershipSource: 'Ingested', ...extra } as any });
for (const r of rows) await seed(r);
const twin = spec('Radiology', 0); (twin as any).domain = 'Medical Laboratory Technology';
await seed(twin, { doi: '10.5555/twin' }); await db.book.create({ data: { title: 'the already published twin', status: 'Published', domain: 'Radiology', doi: '10.5555/TWIN', ownershipSource: 'Ingested' } as any });
const changed = spec('Optometry & Ophthalmology', 9); await seed(changed);           // judged with licence null ...
await db.$executeRawUnsafe(`update "Book" set licence = 'CC BY' where id = $1`, changed.id);   // ... and changed afterwards
const gone = spec('Optometry & Ophthalmology', 8);                                   // in the plan, not in the database
const plan = { runId: RUN, rows: [...rows, twin, changed, gone] };
const planFile = join(dir, 'plan.json'); writeFileSync(planFile, JSON.stringify(plan));
const run = (flags: string[], file = planFile) => { const r = spawnSync('node', ['scripts/dept-coordinator-books-publish-apply.cjs', file, ...flags], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' }); let out: any = null; try { out = JSON.parse(r.stdout); } catch { /* none */ } return { status: r.status, out, err: r.stderr }; };
const rollback = (flags: string[]) => { const r = spawnSync('node', ['-', ...flags], { input: `var __RUN__ = ${JSON.stringify(RUN)};\n${readFileSync('scripts/dept-coordinator-books-publish-rollback.cjs', 'utf8')}`, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' }); let out: any = null; try { out = JSON.parse(r.stdout); } catch { /* none */ } return { status: r.status, out, err: r.stderr }; };
const status = async (id: string) => ((await db.$queryRawUnsafe(`select status, metadata from "Book" where id = $1`, id)) as any[])[0];
const published = async () => Number(((await db.$queryRawUnsafe(`select count(*)::int n from "Book" where status = 'Published' and metadata->'reviewPublication'->>'runId' = $1`, RUN)) as any[])[0].n);

console.log('1. dry run');
const d = run(['--dry', '--max=455', '--batch=100']);
check('dry: nothing written; the count (7) is the count the write produces; 3 skipped (twin, changed, missing)', d.status === 0 && d.out.published === 7 && d.out.skipped.length === 3 && (await published()) === 0, JSON.stringify({ s: d.status, p: d.out?.published, sk: d.out?.skipped?.map((x: any) => x.why) }));
console.log('2. execute needs the database name');
const noDb = run(['--max=455', '--batch=100']);
check('without --expect-db: refused (2), nothing written', noDb.status === 2 && (await published()) === 0);
const wrongDb = run(['--max=455', '--batch=100', '--expect-db=postgres']);
check('with another database name: refused (2)', wrongDb.status === 2 && (await published()) === 0);
console.log('3. execute');
const x = run(['--max=455', '--batch=100', `--expect-db=${DB}`]);
check('exit 0, 7 published, 3 skipped with their reasons', x.status === 0 && x.out.published === 7 && x.out.skipped.length === 3 && x.out.published === d.out.published, JSON.stringify({ s: x.status, p: x.out?.published, sk: x.out?.skipped?.map((s: any) => s.why), e: x.err.slice(0, 120) }));
const b0 = await status(rows[0].id);
check('a published book is stamped with the run id and prior status', b0.status === 'Published' && b0.metadata?.reviewPublication?.runId === RUN && b0.metadata?.reviewPublication?.priorStatus === 'Draft');
check('the changed book and the twin stay Draft', (await status(changed.id)).status === 'Draft' && (await status(twin.id)).status === 'Draft');
const aud = (await db.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'BOOK_SOURCE_PUBLISH' and meta->>'runId' = $1`, RUN)) as any[];
check('one audit row lists the published ids and the lock keys', aud.length === 1 && aud[0].meta.published.length === 7 && aud[0].meta.lock.keys.join() === '2026103001,stm.journal.insert,dept-radiology-book-insert');
const again = run(['--max=455', '--batch=100', `--expect-db=${DB}`]);
check('running it again publishes nothing more (alreadyDone 7)', again.status === 0 && again.out.published === 0 && again.out.alreadyDone === 7);
console.log('4. a row of another department is refused');
const badPlan = join(dir, 'bad.json'); writeFileSync(badPlan, JSON.stringify({ runId: RUN, rows: [{ ...rows[0], domain: 'Chemistry' }] }));
check('exit 3', run(['--dry', '--max=1'], badPlan).status === 3);
console.log('5. rollback by run id (default dry)');
const rd = rollback([]);
check('dry: 7 restoreable, nothing changed', rd.status === 0 && rd.out.restoreable === 7 && (await published()) === 7);
const rx = rollback(['--execute', `--expect-db=${DB}`]);
check('execute: all 7 back to Draft, the stamp removed, the changed book untouched', rx.status === 0 && rx.out.restoreable === 7 && (await published()) === 0 && (await status(rows[0].id)).status === 'Draft' && !(await status(rows[0].id)).metadata?.reviewPublication && (await status(changed.id)).status === 'Draft');
console.log('6. lock order');
for (const f of ['apply', 'rollback']) { const src = readFileSync(`scripts/dept-coordinator-books-publish-${f}.cjs`, 'utf8'); const o = [...src.matchAll(/select\s+pg_advisory_xact_lock\(((?:[^()]|\([^()]*\))*)\)/gi)].map((m) => (/2026103001/.test(m[1]) ? 1 : /stm\.journal\.insert/.test(m[1]) ? 2 : 3)).join(); check(`${f}: 2026103001 -> stm.journal.insert -> dept-radiology-book-insert`, o === '1,2,3', o); }
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect(); process.exit(fail ? 1 : 0);
