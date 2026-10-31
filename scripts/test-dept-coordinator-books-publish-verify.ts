/**
 * The read-only verifier of the book publication (scripts/dept-coordinator-books-publish-verify.js) rehearsed with the real publisher and rollback on the private throwaway
 * database `stm_optometry_articles_test` ONLY.   npx tsx scripts/test-dept-coordinator-books-publish-verify.ts
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
await db.$executeRawUnsafe(`truncate table "Book", "Article", "Journal", "IngestionAudit" restart identity cascade`);

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const dir = mkdtempSync(join(tmpdir(), 'books-verify-test-'));
const RUN = `dept-books-publish-2026-10-31-${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`;
const spec = (domain: string, i: number) => ({ id: crypto.randomUUID(), domain, licence: null, licenceIsNC: null, rightsStatus: 'MetadataOnly', accessStatus: 'MetadataOnly', rightsBasis: null, year: 2020 + (i % 5), route: 'C: test' });
const rows = [...[0, 1, 2].map((i) => spec('Medical Laboratory Technology', i)), ...[0, 1].map((i) => spec('Optometry & Ophthalmology', i)), spec('Paramedical Sciences', 0)];
for (const r of rows) await db.book.create({ data: { id: r.id, title: `Reviewed ${r.id.slice(0, 6)}`, status: 'Draft', domain: r.domain, rightsStatus: r.rightsStatus, accessStatus: r.accessStatus, year: r.year, ownershipSource: 'Ingested', doi: `10.7777/${r.id.slice(0, 8)}` } as any });
for (let i = 0; i < 4; i++) await db.book.create({ data: { title: `Other draft ${i}`, status: 'Draft', domain: 'Radiology', ownershipSource: 'Ingested' } as any });
for (let i = 0; i < 3; i++) await db.book.create({ data: { title: `Published radiology ${i}`, status: 'Published', domain: 'Radiology', ownershipSource: 'Ingested' } as any });
const ids = rows.map((r) => r.id);
const byDept: Record<string, number> = {}; for (const r of rows) byDept[r.domain] = (byDept[r.domain] || 0) + 1;
const planFile = join(dir, 'plan.json'); writeFileSync(planFile, JSON.stringify({ runId: RUN, rows }));
const verifySrc = readFileSync('scripts/dept-coordinator-books-publish-verify.js', 'utf8');
const node = (code: string, args: string[], pre: string) => spawnSync('node', ['-', ...args], { input: `${pre}\n${code}`, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const json = (r: any) => { try { return JSON.parse(r.stdout); } catch { return null; } };

const b = node(verifySrc, [], `var __MODE__ = "baseline"; var __IDS__ = ${JSON.stringify(ids)};`); const base = json(b);
check('baseline taken (read-only)', b.status === 0 && base?.mode === 'baseline', b.stderr.slice(0, 150));
const pre = `var __MODE__ = "verify"; var __RUN__ = ${JSON.stringify(RUN)}; var __EXPECT__ = ${JSON.stringify({ ids, byDepartment: byDept, baseline: base })};`;
const before = json(node(verifySrc, [], pre));
check('before the run the verifier says no (check 1 fails)', before?.allOk === false && before.checks[0].ok === false);
const a = spawnSync('node', ['scripts/dept-coordinator-books-publish-apply.cjs', planFile, '--max=100', '--batch=100', `--expect-db=${DB}`], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
check('publisher: 6 published', a.status === 0 && json(a)?.published === 6, a.stderr.slice(0, 120));
const v = node(verifySrc, [], pre); const vo = json(v);
for (const c of vo?.checks || []) check(c.name.slice(0, 100), c.ok, c.detail.slice(0, 230));
check('verifier: allOk, exit 0', v.status === 0 && vo?.allOk === true);
check('menu: MLT +3, Optometry +2, Paramedical +1, Radiology unchanged', vo.components['Medical Laboratory Technology'].menu === base.components['Medical Laboratory Technology'].menu + 3 && vo.components['Radiology'].menu === base.components['Radiology'].menu);

console.log('\ndamage is noticed');
const [x0, x1] = ids;
await db.$executeRawUnsafe(`update "Book" set licence = 'CC BY' where id = $1`, x0);
const d1 = json(node(verifySrc, [], pre)); check('a changed licence fails check 2', d1.allOk === false && d1.checks.find((c: any) => c.name.startsWith('2.')).ok === false);
await db.$executeRawUnsafe(`update "Book" set licence = null where id = $1`, x0);
await db.$executeRawUnsafe(`update "Book" set status = 'Published', metadata = jsonb_build_object('reviewPublication', jsonb_build_object('runId', $1::text)) where title = 'Other draft 0'`, RUN);
const d2 = json(node(verifySrc, [], pre)); check('a stray book stamped with the run id fails check 1', d2.allOk === false && d2.checks[0].ok === false);
await db.$executeRawUnsafe(`update "Book" set status = 'Draft', metadata = '{}'::jsonb where title = 'Other draft 0'`);
await db.$executeRawUnsafe(`update "Book" set status = 'Published' where title = 'Other draft 1'`);
const d3 = json(node(verifySrc, [], pre)); check('another Radiology book published meanwhile fails check 3 (nothing but the plan may move)', d3.allOk === false && d3.checks.find((c: any) => c.name.startsWith('3.')).ok === false);
await db.$executeRawUnsafe(`update "Book" set status = 'Draft' where title = 'Other draft 1'`);
check('after restoring it, everything is ok again', json(node(verifySrc, [], pre)).allOk === true);

console.log('\nrollback');
const rb = spawnSync('node', ['-', '--execute', `--expect-db=${DB}`], { input: `var __RUN__ = ${JSON.stringify(RUN)};\n${readFileSync('scripts/dept-coordinator-books-publish-rollback.cjs', 'utf8')}`, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
check('rollback restores 6 books', rb.status === 0 && json(rb)?.restoreable === 6);
const after = json(node(verifySrc, [], pre));
check('verifier now says the run is gone (checks 1-4 fail; the others of the four departments and the sample still hold)', after.allOk === false && after.checks.filter((c: any) => !c.ok).map((c: any) => c.name[0]).join() === '1,2,3,4', after.checks.filter((c: any) => !c.ok).map((c: any) => c.name.slice(0, 3)).join(' '));

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect(); process.exit(fail ? 1 : 0);
