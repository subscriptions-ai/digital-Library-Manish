/**
 * The journal status-transition script (scripts/nursing-assessment/journal-status-apply.cjs): NeedsReview -> MetadataOnly only, live re-checks, fill-empty publisher,
 * audited with before/after values, bounded, idempotent and reversible. Private throwaway database `stm_doaj_held_test` only.
 *
 *   npx tsx scripts/test-journal-status-apply.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
const T = `st${Date.now().toString(36)}`;
const mk = (n: string, extra: any = {}) => db.journal.create({ data: { title: `${T} ${n}`, issn: `${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`, domain: 'Nursing', publisherName: 'Pub', status: 'NeedsReview', openAccess: false, licence: null, rightsBasis: 'Crossref listing — OA unverified', ...extra } });

const ok1 = await mk('ok one'), ok2 = await mk('ok two (no publisher, fill)', { publisherName: null });
const gone = await mk('already public', { status: 'MetadataOnly' });
const wrongDept = await mk('wrong department', { domain: 'Dental' });
const idChanged = await mk('identity changed');
const holder = await mk('holds an identifier', { status: 'Accepted', licence: 'CC BY', licenceIsNC: false });
const clash = await mk('identifier clash', { eissn: `7${Math.floor(100 + Math.random() * 899)}-${Math.floor(1000 + Math.random() * 8999)}` });
await db.journal.update({ where: { id: holder.id }, data: { eissn: clash.eissn } });
const pubTitle = await mk('same title as a public row', { status: 'MetadataOnly', title: `${T} Shared Title` });
const titleClash = await mk('title clash', { title: `${T} shared title ` });
const noPub = await mk('no publisher no fill', { publisherName: '' });
const bystander = await mk('bystander', { status: 'NeedsReview' });
const auditsOf = async (action: string) => (await db.ingestionAudit.findMany({ where: { action } })).filter((a: any) => String(a.meta?.runId || '').startsWith(T));
const snap = async (ids: string[]) => JSON.stringify((await db.journal.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 })));
const guarded = [gone, wrongDept, holder, pubTitle, titleClash, noPub, bystander, clash].map(x => x.id);
const before = await snap(guarded);

const rowOf = (j: any, extra: any = {}) => ({ id: j.id, issn: j.issn, eissn: j.eissn, title: j.title, evidence: { ref: 'test' }, ...extra });
const plan = { runId: `${T}-run`, department: 'Nursing', rows: [rowOf(ok1), rowOf(ok2, { publisherFill: 'Filled Publisher' }), rowOf(gone), rowOf(wrongDept), rowOf(idChanged, { issn: '0000-0000' }), rowOf(clash), rowOf(titleClash), rowOf(noPub), rowOf(ok1)] };
const run = (p: any, ...flags: string[]) => { const text = `var __PLAN__ = ${JSON.stringify(p)};\n` + readFileSync(new URL('./nursing-assessment/journal-status-apply.cjs', import.meta.url), 'utf8'); const r = spawnSync('node', ['-', ...flags], { input: text, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }); try { return JSON.parse(r.stdout); } catch { throw new Error(`script output: ${r.stdout} ${r.stderr}`); } };

const dry = run(plan, '--dry', '--batch=2');
check('a dry run reports what would change and writes nothing', dry.dry && dry.changed === 2 && (await db.journal.findUnique({ where: { id: ok1.id } }))!.status === 'NeedsReview' && (await auditsOf('JOURNAL_STATUS_TRANSITION')).length === 0, JSON.stringify(dry.skipped));
const r1 = run(plan, '--batch=2');
check('exactly the two clean rows changed (the duplicate row in the plan is not applied twice)', r1.changed === 2 && r1.requested === 9, `changed ${r1.changed}, skipped ${JSON.stringify(r1.skipped)}`);
const a = await db.journal.findUnique({ where: { id: ok1.id } }), b = await db.journal.findUnique({ where: { id: ok2.id } });
check('status is MetadataOnly, never Accepted', a!.status === 'MetadataOnly' && b!.status === 'MetadataOnly');
check('the empty publisher was filled, an existing publisher kept', b!.publisherName === 'Filled Publisher' && a!.publisherName === 'Pub');
check('licence, openAccess, rights and identifiers are untouched', a!.licence === null && a!.openAccess === false && a!.rightsBasis === 'Crossref listing — OA unverified' && a!.rightsVerifiedAt === null && a!.issn === ok1.issn);
check('every other row is byte-for-byte unchanged', (await snap(guarded)) === before);
const why = r1.skipped;
check('each refusal is counted by reason', why['duplicate row in the plan'] === 1 && why['no longer NeedsReview'] === 1 && why['no longer in the department'] === 1 && why['identity changed since the plan'] === 1 && why['another row holds an identifier'] === 1 && why['a public row holds the same title'] === 1 && why['no publisher'] === 1, JSON.stringify(why));
const audits = await auditsOf('JOURNAL_STATUS_TRANSITION');
check('one audit entry per batch with before and after values', audits.length === 1 && (audits[0].meta as any).changed.length === 2 && (audits[0].meta as any).changed[0].before.status === 'NeedsReview' && (audits[0].meta as any).changed[0].after.status === 'MetadataOnly', `entries ${audits.length}`);
const r2 = run(plan, '--batch=2');
check('running it again changes nothing (idempotent)', r2.changed === 0 && r2.skipped['no longer NeedsReview'] >= 2 && r2.skipped['duplicate row in the plan'] === 1);
const capped = run({ ...plan, runId: `${T}-cap`, rows: [rowOf(bystander)] }, '--max=0', '--dry');
check('the batch size is capped at 100', run({ ...plan, rows: Array.from({ length: 3 }, () => rowOf(gone)) }, '--batch=500', '--dry').batches === 1 && capped.requested === 1);

await db.journal.update({ where: { id: ok2.id }, data: { publisherName: 'Edited by a person' } });
const rbDry = run(plan, '--rollback', '--dry');
check('rollback dry run changes nothing', rbDry.mode === 'rollback' && (await db.journal.findUnique({ where: { id: ok1.id } }))!.status === 'MetadataOnly');
const rb = run(plan, '--rollback');
const a2 = await db.journal.findUnique({ where: { id: ok1.id } }), b2 = await db.journal.findUnique({ where: { id: ok2.id } });
check('rollback restores the row nobody touched', rb.changed === 1 && a2!.status === 'NeedsReview' && a2!.publisherName === 'Pub');
check('rollback leaves a row that was edited since alone, and says so', b2!.status === 'MetadataOnly' && b2!.publisherName === 'Edited by a person' && rb.skipped['row changed since the run (left alone)'] === 1);
check('rollback is audited and the original audit entry is kept', (await auditsOf('JOURNAL_STATUS_ROLLBACK')).length === 1 && (await auditsOf('JOURNAL_STATUS_TRANSITION')).length === 1);

// The insert script labels each journal with the source that listed it (per row for merged plans), never claims open access.
{
  const mkIssn = () => { const d = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)); const sum = d.reduce((a, x, i) => a + x * (8 - i), 0); const c = (11 - (sum % 11)) % 11; return `${d.slice(0, 4).join('')}-${d.slice(4).join('')}${c === 10 ? 'X' : c}`; };
  const rowsI = ['SciELO', 'CINAHL', undefined].map((src, i) => ({ title: `${T} labelled ${i}`, issn: mkIssn(), eissn: null, publisherName: 'P', subjects: [], domain: 'Nursing', country: null, homepage: null, basisSource: src, sourceId: `x${i}` }));
  const text = `var __PLAN__ = ${JSON.stringify({ runId: `${T}-label`, source: 'OpenAlex Sources', rows: rowsI })};\n` + readFileSync(new URL('./journal-source-apply.cjs', import.meta.url), 'utf8');
  const r = spawnSync('node', ['-', '--batch=100'], { input: text, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  const got = await db.journal.findMany({ where: { title: { startsWith: `${T} labelled` } }, orderBy: { title: 'asc' } });
  check('inserted journals carry the label of the source that listed them', got.map((g: any) => g.rightsBasis).join('|') === 'SciELO listing — OA unverified|CINAHL listing — OA unverified|OpenAlex listing — OA unverified', got.map((g: any) => g.rightsBasis).join('|'));
  check('and are MetadataOnly, open access not claimed, no licence', got.length === 3 && got.every((g: any) => g.status === 'MetadataOnly' && g.openAccess === false && g.licence === null), String(r.stderr).slice(0, 80));
}

console.log(`\n${pass} passed, ${fail} failed`); await db.$disconnect(); process.exit(fail ? 1 : 0);
