/**
 * Rehearsal of a whole run for Radiology / Medical Laboratory Technology / Paramedical Sciences on the private throwaway database `stm_optometry_articles_test`: the REAL frozen plan, the real
 * generic writer, verifier and rollback, against a database seeded with the department's journals (same ids and ISSNs as production), some existing books and articles, and nothing else.
 * It refuses to run against any other database. Nothing here reaches production.
 *
 *   npx tsx scripts/test-dept-newfour-articles-rehearsal.ts <plan.json> <journals.json>
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_optometry_articles_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d') as any[])[0].d !== 'stm_optometry_articles_test') throw new Error('refusing to run against any other database');

const planPath = process.argv[2]; const journalsPath = process.argv[3];
if (!planPath || !journalsPath) throw new Error('usage: <plan.json> <journals.json>');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const DEPT = plan.department as string;
const scope = { journals: (JSON.parse(readFileSync(journalsPath, 'utf8')) as any[]).filter((j) => j.domain === DEPT).map((j) => ({ journalId: j.id, issn: j.issn, eissn: j.eissn, title: j.title })) };
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const node = (code: string, args: string[] = [], pre = '') => spawnSync('node', ['-', ...args], { input: `${pre}\n${code}`, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const verifySrc = readFileSync('scripts/dept-newfour-articles-verify.js', 'utf8');
const rollbackSrc = readFileSync('scripts/dept-newfour-articles-rollback.cjs', 'utf8');
const json = (r: any) => { try { return JSON.parse(r.stdout); } catch { return null; } };

console.log(`plan ${planPath}\n  ${DEPT}: runId ${plan.runId}, ${plan.rows.length} rows, ${plan.journals.length} journals`);
await db.$executeRawUnsafe(`truncate table "ArticleAuthor", "Author", "Article", "Book", "Journal", "IngestionAudit", "Content" restart identity cascade`);
for (const j of scope.journals) await db.$executeRawUnsafe(`insert into "Journal" (id, title, issn, eissn, domain, status, "openAccess", "publisherName", "createdAt", "updatedAt") values ($1,$2,$3,$4,$5,'MetadataOnly',false,'Test Publisher',now(),now())`, j.journalId, j.title, j.issn, j.eissn, DEPT);
for (let i = 0; i < 12; i++) await db.book.create({ data: { title: `Existing book ${i}`, status: 'Published', domain: DEPT, accessStatus: 'LinkOnly' } as any });
await db.$executeRawUnsafe(`insert into "Journal" (id, title, issn, domain, status, "openAccess", "createdAt", "updatedAt") values (gen_random_uuid(), 'Elsewhere', '9999-9993', 'Chemistry', 'Accepted', true, now(), now())`);
for (let i = 0; i < 25; i++) await db.article.create({ data: { title: `Existing chemistry article ${i}`, doi: `10.1111/existing.${i}`, status: 'Published', domain: 'Chemistry', fingerprint: `doi:10.1111/existing.${i}`, source: 'OpenAlex' } as any });

console.log('\n1. baseline (read-only)');
const planJids = [...new Set(plan.rows.map((r: any) => r.journalId))];
const basePre = `var __MODE__ = "baseline"; var __DEPARTMENT__ = ${JSON.stringify(DEPT)}; var __JOURNALS__ = ${JSON.stringify(planJids)};`;
const b = node(verifySrc, [], basePre); const base = json(b);
check('baseline taken', b.status === 0 && base?.mode === 'baseline', b.stderr.slice(0, 160));
const NJ = scope.journals.length;
check(`before: ${NJ} MetadataOnly journals, 12 books, page ${NJ + 12}, menu 12`, base.components.journalsByStatus.MetadataOnly === NJ && base.components.books === 12 && base.components.pageTotal === NJ + 12 && base.components.menuTotal === 12, JSON.stringify(base.components));

console.log('\n2. the writer on the real canary plan (local database only)');
const a = spawnSync('node', ['scripts/dept-newfour-articles-apply.cjs', planPath, '--batch=100', `--max=${plan.rows.length}`], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
const ao = json(a);
check(`exit 0, ${plan.rows.length} inserted, 0 rejected, 0 held`, a.status === 0 && ao?.inserted === plan.rows.length && ao.rejected === 0 && ao.skippedHeld === 0, JSON.stringify({ s: a.status, ins: ao?.inserted, rej: ao?.rejected, rbr: ao?.rejectedByReason, err: a.stderr.slice(-200) }));

console.log('\n3. the verifier after the run');
const expect = { rows: plan.rows.length, journalIds: planJids, baseline: base };
const pre = `var __MODE__ = "verify"; var __DEPARTMENT__ = ${JSON.stringify(DEPT)}; var __RUN__ = ${JSON.stringify(plan.runId)}; var __EXPECT__ = ${JSON.stringify(expect)};`;
const v = node(verifySrc, [], pre); const vo = json(v);
for (const c of vo?.checks || []) check(c.name.slice(0, 110), c.ok, c.detail.slice(0, 260));
check('verifier: allOk and exit 0', v.status === 0 && vo?.allOk === true);
check('after: page = before + rows - journals gaining a first article, menu = 12 + rows', vo.components.pageTotal === NJ + 12 + plan.rows.length - planJids.length && vo.components.menuTotal === 12 + plan.rows.length, JSON.stringify({ page: vo.components.pageTotal, menu: vo.components.menuTotal }));
console.log('     licence mix', JSON.stringify(vo.licenceMix), ' source', JSON.stringify(vo.sourceMix), ' version', JSON.stringify(vo.contentVersionMix));

console.log('\n4. the verifier notices damage');
const victim = (await db.$queryRawUnsafe(`select id from "Article" where "createdBy" = $1 order by id limit 3`, `ArticleBackfill:${plan.runId}`) as any[]).map((r) => r.id);
await db.$executeRawUnsafe(`update "Article" set abstract = 'added' where id = $1`, victim[0]);
await db.$executeRawUnsafe(`update "Article" set "accessStatus" = 'ViewableHere' where id = $1`, victim[1]);
await db.$executeRawUnsafe(`update "Journal" set status = 'NeedsReview' where id = (select "journalId" from "Article" where id = $1)`, victim[2]);
const dmg = json(node(verifySrc, [], pre));
check('check 3 and check 4 fail, exit code 4', dmg?.allOk === false && dmg.checks.filter((c: any) => !c.ok).map((c: any) => c.name[0]).join() === '3,4', dmg.checks.filter((c: any) => !c.ok).map((c: any) => c.name.slice(0, 40)).join(' | '));
await db.$executeRawUnsafe(`update "Article" set abstract = null, "accessStatus" = 'LinkOnly' where id = any($1::text[])`, victim);
await db.$executeRawUnsafe(`update "Journal" set status = 'MetadataOnly' where domain = $1`, DEPT);
const healed = json(node(verifySrc, [], pre));
check('after restoring it, everything is ok again', healed?.allOk === true);
await db.$executeRawUnsafe(`insert into "Article" (id, title, doi, status, domain, source, "createdAt", "updatedAt") values (gen_random_uuid(), 'a late twin', $1, 'Published', $2, 'Manual', now(), now())`, plan.rows[0].doi, DEPT);
const twin = json(node(verifySrc, [], pre));
check('a duplicate DOI is caught (check 2)', twin?.allOk === false && twin.checks.some((c: any) => c.name.startsWith('2.') && !c.ok));
await db.$executeRawUnsafe(`delete from "Article" where title = 'a late twin'`);

console.log('\n5. the rollback: dry run, then execute (local only)');
const rd = node(rollbackSrc, [], `var __RUN__ = ${JSON.stringify(plan.runId)};`); const rdo = json(rd);
check('dry: wouldDelete = rows, kept 0, nothing deleted', rd.status === 0 && rdo?.wouldDelete === plan.rows.length && rdo.kept === 0 && (await db.$queryRawUnsafe(`select count(*)::int n from "Article" where "createdBy" = $1`, `ArticleBackfill:${plan.runId}`) as any[])[0].n === plan.rows.length, JSON.stringify({ w: rdo?.wouldDelete, k: rdo?.kept }));
const rx = node(rollbackSrc, ['--execute'], `var __RUN__ = ${JSON.stringify(plan.runId)};`); const rxo = json(rx);
check('execute: all deleted, journals and books untouched', rx.status === 0 && rxo?.deleted === plan.rows.length && (await db.$queryRawUnsafe(`select count(*)::int n from "Journal" where domain = $1 and status = 'MetadataOnly'`, DEPT) as any[])[0].n === NJ, JSON.stringify({ del: rxo?.deleted, err: rx.stderr.slice(0, 120) }));
const afterRb = json(node(verifySrc, [], pre));
check('the verifier now says the run is gone (only check 1 fails; the journals, page count and existing rows are back as before)', afterRb?.allOk === false && afterRb.checks.filter((c: any) => !c.ok).map((c: any) => c.name[0]).join() === '1', afterRb.checks.filter((c: any) => !c.ok).map((c: any) => c.name.slice(0, 30)).join(' | '));
const back = json(node(verifySrc, [], basePre));
check('after rollback the department baseline hashes are the same as before the run', back.hashes.departmentArticles.h === base.hashes.departmentArticles.h && back.hashes.planJournals.h === base.hashes.planJournals.h && back.components.pageTotal === NJ + 12);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
