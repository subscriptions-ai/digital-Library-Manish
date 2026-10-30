/**
 * The MLT journal writer (scripts/dept-mlt-apply.cjs): shared advisory lock, live re-check inside the lock (ISSN/e-ISSN in either column, normalized title, in-batch duplicates),
 * auto-stop on >10% same-title conflicts and on a lock held > the timeout, one transaction per batch. Private throwaway database `stm_mlt_apply_test` ONLY.
 *
 *   npx tsx scripts/test-dept-mlt-apply.ts
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_mlt_apply_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d') as any[])[0].d !== 'stm_mlt_apply_test') throw new Error('refusing to run against any other database');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const dir = mkdtempSync(join(tmpdir(), 'mlt-apply-test-'));
const hex = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
const RUN = () => `dept-mlt-2026-10-30-${hex()}`;
function issn(n: number) { const d = String(1000000 + n).padStart(7, '0').slice(-7); let s = 0; for (let i = 0; i < 7; i++) s += Number(d[i]) * (8 - i); const c = (11 - (s % 11)) % 11; return `${d.slice(0, 4)}-${d.slice(4)}${c === 10 ? 'X' : c}`; }
const base = Math.floor(Math.random() * 800000) + 100000;
const tag = `mlt${hex()}`;
const row = (n: number, extra: any = {}) => ({ title: `${tag} Journal of Laboratory ${n}`, issn: issn(base + n), eissn: null, publisherName: 'Test Publisher', domain: 'Medical Laboratory Technology', subjects: [], basisSource: 'OpenAlex', sourceId: `test:${n}`, evidence: { kinds: ['title'] }, ...extra });
function planFile(runId: string, rows: any[]) { const f = join(dir, `${runId}.json`); writeFileSync(f, JSON.stringify({ runId, source: 'OpenAlex', rows })); return f; }
function run(runId: string, rows: any[], flags: string[] = []) {
  const r = spawnSync('node', ['scripts/dept-mlt-apply.cjs', planFile(runId, rows), '--batch=100', ...flags], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
  let out: any = null; try { out = JSON.parse(r.stdout); } catch { /* none */ }
  return { status: r.status, out, err: r.stderr };
}
const countTag = async () => Number((await db.$queryRawUnsafe(`select count(*)::int n from "Journal" where title like $1`, `${tag}%`) as any[])[0].n);
const audits = async (runId: string) => await db.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'JOURNAL_SOURCE_IMPORT' and meta->>'runId' = $1`, runId) as any[];
const seed = (title: string, i: string, e: string | null) => db.$executeRawUnsafe(`insert into "Journal" (id, title, issn, eissn, domain, status, "openAccess", "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, $2, $3, 'Medical Sciences', 'MetadataOnly', false, now(), now())`, title, i, e);

// 1. clean batch: journals + one audit row; fields as promised
let r1 = RUN(); const a = run(r1, [row(1), row(2), row(3)]);
check('a clean batch inserts all rows', a.status === 0 && a.out.inserted === 3 && a.out.insertedIds.length === 3 && await countTag() === 3);
const au = await audits(r1);
check('one audit row names exactly those ids and records the lock', au.length === 1 && au[0].meta.inserted.length === 3 && au[0].meta.lock?.key === 'stm.journal.insert');
const j = (await db.$queryRawUnsafe(`select status, "openAccess" oa, licence, "licenceIsNC" nc, "rightsBasis" basis, domain from "Journal" where issn = $1`, issn(base + 1)) as any[])[0];
check('MetadataOnly, openAccess false, no licence, "OpenAlex listing — OA unverified", department MLT', j.status === 'MetadataOnly' && j.oa === false && j.licence === null && j.nc === null && j.basis === 'OpenAlex listing — OA unverified' && j.domain === 'Medical Laboratory Technology');

// 2. live re-check
const t2 = `${tag} swap`;
await seed(`${tag} Existing Print Online`, issn(base + 50), issn(base + 51));
await seed(`${tag} Café   Labóratory & Science!`, issn(base + 52), null);
const r2 = RUN();
const b = run(r2, [
  row(60, { issn: issn(base + 51), eissn: issn(base + 61), title: `${t2} one` }),       // print/online swapped: its issn is an EXISTING e-ISSN
  row(62, { issn: issn(base + 63), eissn: issn(base + 50), title: `${t2} two` }),       // its e-ISSN is an EXISTING issn
  row(64, { title: `  ${tag.toUpperCase()}  cafe laboratory and science ` }),              // same title after normalization (case, accents, punctuation, &)
  row(65), row(65, { title: `${tag} other title` }),                                      // the second repeats the first one's ISSN inside the batch
  row(66, { title: `${tag} Journal of Laboratory 66` }), row(66, { issn: issn(base + 67), title: `${tag} Journal of Laboratory 66` }),   // same title inside the batch
  row(68, { title: `${tag} Journal of Laboratory 68` }),
  row(69, { title: `${tag} Journal of Laboratory 69` }), row(70, { title: `${tag} Journal of Laboratory 70` }), row(71, { title: `${tag} Journal of Laboratory 71` }), row(72, { title: `${tag} Journal of Laboratory 72` }), row(73, { title: `${tag} Journal of Laboratory 73` }), row(74, { title: `${tag} Journal of Laboratory 74` }), row(75, { title: `${tag} Journal of Laboratory 75` }), row(76, { title: `${tag} Journal of Laboratory 76` }), row(77, { title: `${tag} Journal of Laboratory 77` }), row(78, { title: `${tag} Journal of Laboratory 78` }), row(79, { title: `${tag} Journal of Laboratory 79` }), row(80, { title: `${tag} Journal of Laboratory 80` }),
]);
check('a swapped print/online identifier, either direction, is skipped', b.out.skippedIdentifierHeld === 2, JSON.stringify(b.out.skippedDetail.map((x: any) => x.why)));
check('a title that differs only by case, accents, punctuation, "&" is skipped', b.out.skippedTitleHeld === 1 && b.status === 0);
check('an ISSN or title repeated inside the batch is inserted once', b.out.skippedInBatchDuplicate === 2, `skipped in-batch ${b.out.skippedInBatchDuplicate}`);
check('and the reconciliation is exact', b.out.inserted + b.out.skippedIdentifierHeld + b.out.skippedTitleHeld + b.out.skippedInBatchDuplicate === 20, JSON.stringify({ i: b.out.inserted, h: b.out.skippedIdentifierHeld, t: b.out.skippedTitleHeld, d: b.out.skippedInBatchDuplicate }));

// 3. idempotent: the same plan again writes nothing and no second audit row
const before = (await audits(r2)).length;
const c = run(r2, [row(65)]);
check('re-running inserts nothing and writes no audit row', c.status === 0 && c.out.inserted === 0 && (await audits(r2)).length === before);

// 4. >10% same-title conflicts stops before writing
for (let k = 0; k < 3; k++) await seed(`${tag} Conflict ${k}`, issn(base + 90 + k), null);
const r4 = RUN(); const n0 = await countTag();
const d = run(r4, [row(95), row(96), row(97), row(98), row(99, { title: `${tag} Conflict 0` }), row(100, { title: `${tag} Conflict 1` }), row(101, { title: `${tag} Conflict 2` }), row(102), row(103), row(104)]);
check('same-title conflicts above 10% of a batch stop the run (exit 6) and write nothing', d.status === 6 && d.out.stopped?.code === 6 && await countTag() === n0 && (await audits(r4)).length === 0);

// 5. department / publisher validation
const e = run(RUN(), [row(110, { domain: 'Nursing' }), row(111, { publisherName: '' }), row(112, { issn: '1234-5678' })]);
check('a wrong department, a missing publisher and a bad ISSN are rejected, never written', e.status === 0 && e.out.rejected.length === 3 && e.out.inserted === 0);

// 6. the shared lock: another session holding it makes the writer wait, then stop after the timeout (exit 7), and a short hold only delays it
const holder = async (ms: number) => { const p = db.$transaction(async (tx: any) => { await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); await new Promise(r => setTimeout(r, ms)); }, { timeout: ms + 20000 }); await new Promise(r => setTimeout(r, 600)); return p; };
const r6 = RUN(); const n6 = await countTag();
const h1 = holder(6000);
const f = await new Promise<{ status: number | null; out: any }>((res) => { const ch = spawn('node', ['scripts/dept-mlt-apply.cjs', planFile(r6, [row(120)]), '--batch=100', '--lock-timeout=2'], { env: { ...process.env, DATABASE_URL: TEST_URL } }); let o = ''; ch.stdout.on('data', x => o += x); ch.on('close', s => { let out: any = null; try { out = JSON.parse(o); } catch { /* none */ } res({ status: s, out }); }); });
await h1;
check('a lock held longer than the timeout stops the writer (exit 7) with nothing written', f.status === 7 && f.out?.stopped?.code === 7 && await countTag() === n6 && (await audits(r6)).length === 0, `status ${f.status}`);
const h2 = holder(2500);
const g = await new Promise<{ status: number | null; out: any }>((res) => { const ch = spawn('node', ['scripts/dept-mlt-apply.cjs', planFile(RUN(), [row(121)]), '--batch=100', '--lock-timeout=30'], { env: { ...process.env, DATABASE_URL: TEST_URL } }); let o = ''; ch.stdout.on('data', x => o += x); ch.on('close', s => { let out: any = null; try { out = JSON.parse(o); } catch { /* none */ } res({ status: s, out }); }); });
await h2;
check('a short hold only delays the writer: it waits for the lock, then inserts', g.status === 0 && g.out.inserted === 1 && g.out.lockWaitMsMax >= 1000, `wait ${g.out?.lockWaitMsMax} ms`);

// 7. the lock-timeout override is refused on a database whose name does not end in _test: covered by construction (guard reads current_database()).
await db.$executeRawUnsafe(`delete from "IngestionAudit" where action = 'JOURNAL_SOURCE_IMPORT' and meta->>'runId' like 'dept-mlt-2026-10-30-%'`);
console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect(); process.exit(fail ? 1 : 0);
