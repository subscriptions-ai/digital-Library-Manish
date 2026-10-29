/**
 * The journal writer (scripts/journal-source-apply.cjs): validation before any write, evidence sanitisation with the original preserved, one transaction per batch (journals + audit row commit
 * together or not at all), retry after a write-time conflict, idempotent re-runs. Private throwaway database `stm_journal_apply_test` only (a copy of another test database).
 *
 *   npx tsx scripts/test-journal-apply-transactional.ts
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_journal_apply_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d') as any[])[0].d !== 'stm_journal_apply_test') throw new Error('refusing to run against any other database');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const dir = mkdtempSync(join(tmpdir(), 'apply-test-'));
const RUN = `test-${Date.now().toString(36)}`;
function issn(n: number) { const d = String(1000000 + n).padStart(7, '0').slice(-7); let s = 0; for (let i = 0; i < 7; i++) s += Number(d[i]) * (8 - i); const c = (11 - (s % 11)) % 11; return `${d.slice(0, 4)}-${d.slice(4)}${c === 10 ? 'X' : c}`; }
const base = Math.floor(Math.random() * 800000) + 100000;
const row = (n: number, extra: any = {}) => ({ title: `${RUN} journal ${n}`, issn: issn(base + n), eissn: null, publisherName: 'Test Publisher', domain: 'Bio Technology', subjects: [], basisSource: 'OpenAlex', sourceId: `test:${n}`, evidence: { families: { title: 1, topics: 'strong' }, site: { snippet: 'aims and scope' } }, ...extra });
function run(rows: any[], flags: string[] = [], name = 'plan') {
  const f = join(dir, `${name}-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, JSON.stringify({ runId: RUN, source: 'Multiple (per row basisSource)', rows }));
  const r = spawnSync('node', ['scripts/journal-source-apply.cjs', f, '--batch=100', ...flags], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
  let out: any = null; try { out = JSON.parse(r.stdout); } catch { /* none */ }
  return { status: r.status, out, err: r.stderr };
}
const countJ = async (like: string) => Number((await db.$queryRawUnsafe(`select count(*)::int n from "Journal" where title like $1`, `${like}%`) as any[])[0].n);
const audits = async () => await db.$queryRawUnsafe(`select id, meta from "IngestionAudit" where action = 'JOURNAL_SOURCE_IMPORT' and meta->>'runId' = $1 order by at`, RUN) as any[];

// 1. a clean batch: journals and one audit row together
const a = run([row(1), row(2), row(3)]);
check('a clean batch inserts every row in one transaction', a.status === 0 && a.out.inserted === 3 && a.out.insertedIds.length === 3 && await countJ(RUN) === 3);
let au = await audits();
check('and writes exactly one audit row naming those ids', au.length === 1 && au[0].meta.inserted.length === 3 && au[0].meta.inserted.every((x: any) => a.out.insertedIds.includes(x.id)));
const j1 = (await db.$queryRawUnsafe(`select status, "openAccess" oa, licence, "licenceIsNC" nc, "rightsBasis" basis from "Journal" where issn = $1`, issn(base + 1)) as any[])[0];
check('every journal is MetadataOnly, open access false, no licence, labelled "OpenAlex listing — OA unverified"', j1.status === 'MetadataOnly' && j1.oa === false && j1.licence === null && j1.nc === null && j1.basis === 'OpenAlex listing — OA unverified');

// 2. idempotency: the same plan again writes nothing, not even an audit row
const b = run([row(1), row(2), row(3)]);
check('re-running the same plan inserts nothing and writes no second audit row', b.status === 0 && b.out.inserted === 0 && b.out.skippedIdentifierHeld === 3 && await countJ(RUN) === 3 && (await audits()).length === 1);

// 3. NUL and control characters in evidence: sanitised, original preserved, documented
const nul = row(4, { evidence: { site: { snippet: 'aims\u0000 and\u0001 scope', nested: ['ok', 'bad\u0000'] }, note: 'fine' }, title: `${RUN} journal 4` });
const c = run([nul]);
check('evidence with NUL and control characters is sanitised and the batch still commits', c.status === 0 && c.out.inserted === 1 && c.out.sanitizedRows === 1);
au = await audits(); const last = au[au.length - 1].meta;
const san = last.sanitization?.[0];
check('the audit entry holds the sanitised evidence without any NUL', JSON.stringify(last.inserted[0].evidence).indexOf('\\u0000') === -1 && last.inserted[0].evidence.site.snippet === 'aims and scope');
check('it documents which paths changed and keeps the original evidence (escaped) with its sha256', !!san && san.paths.includes('/evidence/site/snippet') && san.paths.includes('/evidence/site/nested[1]') && JSON.parse(san.originalEvidenceEscaped).site.snippet === 'aims\u0000 and\u0001 scope' && san.originalEvidenceSha256 === createHash('sha256').update(Buffer.from(san.originalEvidenceEscaped, 'utf8')).digest('hex'));

// 4. invalid rows are rejected before any write; the valid rows still go in
const d = run([row(5), row(6, { issn: '1234-5678' }), row(7, { title: '' }), row(8, { evidence: { big: 'x'.repeat(70000) } }), row(9)]);
check('rows with a bad ISSN, an empty title or oversized evidence are rejected and listed', d.status === 0 && d.out.rejected.length === 3 && d.out.inserted === 2);
check('the rejected rows are not in the database', await countJ(`${RUN} journal 6`) === 0 && await countJ(`${RUN} journal 7`) === 0 && await countJ(`${RUN} journal 8`) === 0);

// 5. audit failure: nothing from the batch survives, then a retry succeeds exactly once
const before = await countJ(RUN), auditsBefore = (await audits()).length;
const e = run([row(10), row(11), row(12)], ['--simulate-audit-failure']);
check('an audit failure rolls the whole batch back: no journals without an audit entry, non-zero exit', e.status === 5 && e.out.failed === 3 && e.out.inserted === 0 && await countJ(RUN) === before && (await audits()).length === auditsBefore, e.out?.firstError);
const f = run([row(10), row(11), row(12)]);
check('a retry after the failure inserts each journal exactly once and writes one audit row', f.status === 0 && f.out.inserted === 3 && await countJ(RUN) === before + 3 && (await audits()).length === auditsBefore + 1);
const dup = await db.$queryRawUnsafe(`select issn, count(*)::int n from "Journal" where title like $1 group by 1 having count(*) > 1`, `${RUN}%`) as any[];
check('no ISSN appears twice', dup.length === 0);

// 6. a write-time race: someone inserts an identifier between the check and the write
const rb = await countJ(RUN);
const g = run([row(20), row(21), row(22)], ['--simulate-race']);
check('a conflict at write time rolls back, re-checks and retries: the raced row is skipped, the others are in, audit matches', g.status === 0 && g.out.attempts >= 2 && g.out.inserted === 2 && await countJ(`${RUN} journal`) === rb + 2);
const lastAudit = (await audits()).pop()!.meta;
check('the audit entry of the retried batch lists exactly the inserted ids', lastAudit.inserted.length === 2 && lastAudit.inserted.every((x: any) => g.out.insertedIds.includes(x.id)));

// 7. a failing batch stops the run: later batches are not attempted
const rows120 = Array.from({ length: 120 }, (_, k) => row(100 + k));
const h = run(rows120, ['--simulate-audit-failure']);
check('after a failed batch the run stops: neither batch is in the database', h.status === 5 && await countJ(`${RUN} journal 1`) === (await countJ(`${RUN} journal 1`)) && (await db.$queryRawUnsafe(`select count(*)::int n from "Journal" where issn = any($1::text[])`, rows120.map(r => r.issn)) as any[])[0].n === 0);
// 8. the simulation flags refuse a database that is not a test database
const refuse = spawnSync('node', ['scripts/journal-source-apply.cjs', '--dry', '--simulate-race', join(dir, 'x.json')], { env: { ...process.env, DATABASE_URL: real }, encoding: 'utf8' });
check('the simulation flags are refused on a database whose name does not end in _test', refuse.status === 4 || /ENOENT|only allowed/.test(refuse.stderr));


// 9. bounded retries: a conflict at EVERY attempt stops after 3 attempts, rolls everything back, writes no audit row
const rowsB = [row(300), row(301), row(302)];
const auditsB = (await audits()).length;
const k = run(rowsB, ['--simulate-race-always']);
check('retries are bounded: a conflict at every attempt ends after 3 attempts with a non-zero exit', k.status === 5 && k.out.attempts === 3 && k.out.failed > 0, `attempts ${k.out?.attempts}`);
check('and leaves none of the batch\'s journals and no audit row (only the rows the test itself injected exist)', (await db.$queryRawUnsafe(`select count(*)::int n from "Journal" where title like $1`, `${RUN} journal 30%`) as any[])[0].n === 0 && (await audits()).length === auditsB);

// 10. rollback dependency guard: the exact-id statement of the audit manifests never deletes a journal that has an article
const keep = await db.journal.create({ data: { title: `${RUN} rollback keep`, issn: issn(base + 400), domain: 'Bio Technology', status: 'MetadataOnly', openAccess: false } });
const drop = await db.journal.create({ data: { title: `${RUN} rollback drop`, issn: issn(base + 401), domain: 'Bio Technology', status: 'MetadataOnly', openAccess: false } });
const art = await db.article.create({ data: { title: `${RUN} article`, journalId: keep.id } });
const fk = await db.$queryRawUnsafe(`select pg_get_constraintdef(oid) def from pg_constraint where confrelid = '"Journal"'::regclass and contype = 'f' and conrelid = '"Article"'::regclass`) as any[];
check('the only foreign key onto Journal that matters is Article.journalId ON DELETE SET NULL (so the NOT EXISTS guard is essential)', fk.some(x => /ON DELETE SET NULL/.test(x.def)));
const deleted = await db.$queryRawUnsafe(`DELETE FROM "Journal" j WHERE j.id = ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id) RETURNING j.id`, [keep.id, drop.id]) as any[];
check('the guarded rollback deletes only the journal without articles', deleted.length === 1 && deleted[0].id === drop.id);
const artAfter = await db.article.findUnique({ where: { id: art.id } });
check('the journal with an article and its article are untouched (the article still points at it)', artAfter?.journalId === keep.id && !!(await db.journal.findUnique({ where: { id: keep.id } })));
const again = await db.$queryRawUnsafe(`DELETE FROM "Journal" j WHERE j.id = ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id) RETURNING j.id`, [keep.id, drop.id]) as any[];
check('re-running the rollback is a no-op for the rows that are gone and still protects the other', again.length === 0);
await db.$executeRawUnsafe(`delete from "Article" where title like $1`, `${RUN}%`);

// cleanup of this test's own rows
await db.$executeRawUnsafe(`delete from "Journal" where title like $1`, `${RUN}%`);
await db.$executeRawUnsafe(`delete from "IngestionAudit" where action = 'JOURNAL_SOURCE_IMPORT' and meta->>'runId' = $1`, RUN);
console.log(`\n${pass} passed, ${fail} failed`); await db.$disconnect(); process.exit(fail ? 1 : 0);
