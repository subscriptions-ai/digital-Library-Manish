/**
 * scripts/book-department-assign.cjs: assigns a department to still-unchanged Drafts and nothing else; atomic batches; idempotent; audited.
 * Private throwaway database `stm_doaj_held_test` only.   npx tsx scripts/test-book-department-assign.ts
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
const T = `da${Date.now().toString(36)}`;
await db.book.deleteMany({});
await db.ingestionAudit.deleteMany({ where: { action: 'REVIEW_BATCH_ASSIGN' } });
const mk = (n: string, extra: any = {}) => db.book.create({ data: { title: `${T} ${n}`, status: 'Draft', ownershipSource: 'Ingested', licence: 'CC BY', licenceIsNC: false, accessStatus: 'LinkOnly', rightsStatus: 'MetadataOnly', source: 'NLMCatalog', year: 1995, fingerprint: `${T}-${n}`, metadata: { harvest: { keep: n }, other: 1 }, ...extra } });
const ok = await Promise.all(Array.from({ length: 30 }, (_, i) => mk(`ok${i}`)));
const published = await mk('published', { status: 'Published', domain: null });
const rejected = await mk('rejected', { rejectionNote: 'no' });
const placed = await mk('placed', { domain: 'Law' });
const edited = await mk('edited');
const manual = await mk('manual', { ownershipSource: 'Manual' });
const note = (d: string) => ({ department: d, basis: 'classifier', assignmentSource: 'batch-suggested', tier: 'high', topScore: 12, secondDepartment: null, secondScore: 0, margin: 12, classifier: 'v2', classifierVersion: 2, evidence: ['code', 'title'] });
const rowOf = (b: any, d = 'Dental') => ({ id: b.id, title: b.title, source: b.source, year: b.year, department: d, note: note(d) });
const plan = { runId: `test-${T}`, classifier: 'v2', tiers: ['high'], rows: [...ok.map(b => rowOf(b)), rowOf(published), rowOf(rejected), rowOf(placed), { ...rowOf(edited), title: `${T} edited BEFORE` }, rowOf(manual)] };
let lastStatus: number | null = 0; let lastErr = '';
const run = (pl: any, flags: string[], e: Record<string, string> = {}) => { const text = `var __PLAN__ = ${JSON.stringify(pl)};\n` + readFileSync(new URL('./book-department-assign.cjs', import.meta.url), 'utf8'); const r = spawnSync('node', ['-', ...flags], { input: text, env: { ...process.env, DATABASE_URL: TEST_URL, ...e }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, maxBuffer: 64 * 1024 * 1024 }); lastStatus = r.status; lastErr = r.stderr; try { return JSON.parse(r.stdout); } catch { return { error: r.stderr.slice(0, 400) }; } };
const snap = async (ids: string[]) => JSON.stringify((await db.book.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })).map((b: any) => { const { domain, updatedAt, metadata, ...rest } = b; const { reviewAssignment, ...m } = (metadata as any) || {}; return { ...rest, m }; }));
const keep = [...ok, published, rejected, placed, edited, manual].map((b: any) => b.id);
const before = await snap(keep);

run(plan, []); check('writing without --expect-db is refused and writes nothing', lastStatus === 2 && (await db.book.count({ where: { domain: 'Dental' } })) === 0);
run(plan, ['--expect-db=postgres']); check('the wrong database name is refused', lastStatus === 2);
const dry = run(plan, ['--dry']);
check('--dry writes nothing and says what it would do (30 assign, 5 skipped with reasons)', dry.dry && dry.assigned === 30 && dry.skipped === 5 && (await db.book.count({ where: { domain: 'Dental' } })) === 0, JSON.stringify({ a: dry.assigned, s: dry.skipped, r: dry.skippedReasons }));
const c = run(plan, ['--expect-db=stm_doaj_held_test', '--max=10', '--batch=10']);
check('--max bounds the run (a canary of 10)', c.attempted === 10 && c.assigned === 10 && (await db.book.count({ where: { domain: 'Dental' } })) === 10, JSON.stringify({ a: c.attempted, n: c.assigned }));
const r = run(plan, ['--expect-db=stm_doaj_held_test', '--batch=10']);
check('the rest are assigned; the 10 the canary did and the 5 changed books are skipped', r.assigned === 20 && r.skipped === 15 && (await db.book.count({ where: { domain: 'Dental', title: { startsWith: `${T} ok` } } })) === 30, JSON.stringify({ a: r.assigned, s: r.skipped, reasons: r.skippedReasons }));
check('a published, rejected, already-placed, retitled or manually-owned book was not touched', (await db.book.findUnique({ where: { id: published.id } }))!.domain === null && (await db.book.findUnique({ where: { id: rejected.id } }))!.domain === null && (await db.book.findUnique({ where: { id: placed.id } }))!.domain === 'Law' && (await db.book.findUnique({ where: { id: edited.id } }))!.domain === null && (await db.book.findUnique({ where: { id: manual.id } }))!.domain === null);
check('everything else on every book is exactly as it was (status stays Draft, licence, rights, access, source, year, fingerprint, other metadata)', (await snap(keep)) === before);
const one: any = await db.book.findUnique({ where: { id: ok[0].id } });
check('the note is the review-assignment note, with the run id and who applied it', one.metadata.reviewAssignment.department === 'Dental' && one.metadata.reviewAssignment.classifier === 'v2' && one.metadata.reviewAssignment.runId === plan.runId && one.metadata.reviewAssignment.performedBy === 'book-department-assign' && one.status === 'Draft');
const audits = await db.ingestionAudit.findMany({ where: { action: 'REVIEW_BATCH_ASSIGN' } });
check('one REVIEW_BATCH_ASSIGN audit entry per batch, in the shape Review History reads, listing exactly the assigned ids', audits.length === 5 && audits.every((a: any) => a.meta.publishes === false && a.meta.mode === 'suggested') && audits.reduce((n: number, a: any) => n + a.meta.ids.length, 0) === 30);
const again = run(plan, ['--expect-db=stm_doaj_held_test']);
check('running it again assigns nothing (idempotent)', again.assigned === 0 && again.skipped === 35);

// atomicity: a failing audit write rolls that whole batch back and stops the run
const more = await Promise.all(Array.from({ length: 20 }, (_, i) => mk(`more${i}`)));
const p2 = { ...plan, runId: `test2-${T}`, rows: more.map(b => rowOf(b, 'Law')) };
const at = run(p2, ['--expect-db=stm_doaj_held_test', '--batch=10'], { DEPT_ASSIGN_TEST_FAIL_BATCH: '2' });
check('a failure in batch 2 rolls that batch back, stops, and leaves batch 1 complete with its audit', lastStatus === 1 && at.stopped && (await db.book.count({ where: { domain: 'Law', title: { startsWith: `${T} more` } } })) === 10, JSON.stringify({ st: lastStatus, stopped: at.stopped }));
const undo = await db.$executeRawUnsafe(`update "Book" set domain = null, metadata = metadata - 'reviewAssignment' where metadata->'reviewAssignment'->>'runId' = $1 and status = 'Draft'`, `test2-${T}`);
check('the documented undo statement removes exactly that run\'s assignments', undo === 10 && (await db.book.count({ where: { domain: 'Law', title: { startsWith: `${T} more` } } })) === 0 && (await db.book.count({ where: { domain: 'Dental', title: { startsWith: `${T} ok` } } })) === 30);
await db.book.deleteMany({ where: { title: { startsWith: `${T} ` } } });
console.log(`\n${pass} passed, ${fail} failed`); await db.$disconnect(); process.exit(fail ? 1 : 0);
