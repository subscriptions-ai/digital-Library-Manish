/**
 * The Optometry & Ophthalmology article writer and its rollback (scripts/dept-optometry-ophthalmology-articles-{apply,rollback}.cjs).
 * Private throwaway database `stm_optometry_articles_test` ONLY: it refuses to run against any other.
 *
 *   npx tsx scripts/test-dept-optometry-articles-apply.ts
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_optometry_articles_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d') as any[])[0].d !== 'stm_optometry_articles_test') throw new Error('refusing to run against any other database');
// the database is private to this test (guarded above): start from empty so a re-run does not meet the last run's journals
await db.$executeRawUnsafe(`truncate table "ArticleAuthor", "Author", "Article", "Journal", "IngestionAudit" restart identity cascade`);
const { judgeArticle } = await import('../src/lib/ingestion/eligibility.js');
const require = createRequire(import.meta.url);
const W = require('./dept-optometry-ophthalmology-articles-apply.cjs');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const dir = mkdtempSync(join(tmpdir(), 'opt-articles-test-'));
const hex = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
const RUN = () => `dept-optometry-ophthalmology-articles-2026-10-31-${hex()}`;
const DEPT = 'Optometry & Ophthalmology';
const tag = hex();
const jr = { id: crypto.randomUUID(), title: `Test Journal of Ophthalmology ${tag}`, issn: '1234-5679', eissn: '2345-6780' };
const jr2 = { id: crypto.randomUUID(), title: `Test Eye Journal ${tag}`, issn: '3456-7891', eissn: null as string | null };
const seedJournal = (j: any, domain = DEPT, status = 'MetadataOnly') => db.$executeRawUnsafe(
  `insert into "Journal" (id, title, issn, eissn, domain, status, "openAccess", "publisherName", "createdAt", "updatedAt") values ($1,$2,$3,$4,$5,$6,false,'Test Publisher',now(),now())`, j.id, j.title, j.issn, j.eissn, domain, status);
await seedJournal(jr); await seedJournal(jr2);
const planJournals = [jr, jr2].map((j) => ({ journalId: j.id, issn: j.issn, eissn: j.eissn, status: 'MetadataOnly' }));
let n = 0;
const row = (extra: any = {}) => { n++; const doi = `10.9999/${tag}.${n}`; return { doi, title: `A study of the cornea ${tag} ${n}`, authors: 'Doe J, Roe R', year: 2024, volume: '12', issue: '3', journalId: jr.id,
  licence: 'cc-by', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', licenceUrlSource: 'Crossref', licenceContentVersion: 'vor', licenceStart: '2021-01-01', licenceDelayDays: 0,
  licenceSource: 'Crossref', source: 'Crossref', sourceRecordId: `crossref:${doi}`, ...extra }; };
const planFile = (runId: string, rows: any[], journals = planJournals) => { const f = join(dir, `${runId}.json`); writeFileSync(f, JSON.stringify({ runId, department: DEPT, source: 'Crossref+EuropePMC', journals, rows })); return f; };
const apply = (runId: string, rows: any[], flags: string[] = [], journals = planJournals) => {
  const r = spawnSync('node', ['scripts/dept-optometry-ophthalmology-articles-apply.cjs', planFile(runId, rows, journals), '--batch=100', `--max=${rows.length || 1}`, ...flags], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
  let out: any = null; try { out = JSON.parse(r.stdout); } catch { /* none */ }
  return { status: r.status, out, err: r.stderr };
};
const rollback = (runId: string, flags: string[] = []) => {
  const code = readFileSync('scripts/dept-optometry-ophthalmology-articles-rollback.cjs', 'utf8');
  const r = spawnSync('node', ['-', ...flags], { input: `var __RUN__ = ${JSON.stringify(runId)};\n${code}`, env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
  let out: any = null; try { out = JSON.parse(r.stdout); } catch { /* none */ }
  return { status: r.status, out, err: r.stderr };
};
const count = async (sql: string, ...a: any[]) => Number(((await db.$queryRawUnsafe(sql, ...a)) as any[])[0].n);
const byRun = (runId: string) => count(`select count(*)::int n from "Article" where "createdBy" = $1`, `ArticleBackfill:${runId}`);

console.log('\n1. the rule is the existing judge\'s');
{
  const lic = ['cc-by', 'cc-by-sa', 'cc-by-nd', 'cc0', 'public domain', 'public-domain', 'cc by', 'cc by-sa', 'CC BY', 'cc-by-nc', 'cc-by-nc-nd', 'cc-by-nc-sa', 'cc by-nc', 'other-oa', '', null, "publisher's own", 'cc-by-4.0'];
  const years = [2019, 2020, 2024, 2027, 2040, null];
  let agree = 0, total = 0;
  const planJ = new Map([['j', {}]]);
  for (const l of lic) for (const y of years) for (const t of ['A title', ' ', 'Untitled']) {
    // A Crossref row carries the licence URL (and says so); a Europe PMC row carries only the licence string.
    const tok = W.licenceToken(l);
    const url = /^cc-by(-(sa|nd|nc))*$/.test(tok) ? `https://creativecommons.org/licenses/${tok.slice(3)}/4.0/` : tok === 'cc0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : tok === 'public domain' ? 'https://creativecommons.org/publicdomain/mark/1.0/' : null;
    const mine = W.judgeRow({ journalId: 'j', source: 'Crossref', doi: '10.1000/x', title: t, year: y, licence: l, licenceUrl: url ?? (l ? 'https://example.org/not-a-cc-url' : null), licenceUrlSource: 'Crossref', licenceContentVersion: 'vor', licenceStart: '2021-01-01', licenceDelayDays: 0 }, planJ, 2020, 2026);
    const theirs = judgeArticle({ title: t, doi: '10.1000/x', pdfUrl: null, licence: l, year: y }, { minYear: 2020 });
    // The judge also ADDs a record whose licence is merely unverifiable (as a LinkOnly catalogue record); this writer is stricter by design: it needs the licence.
    const judgeSaysServe = theirs.outcome === 'ADD' && theirs.status === 'Published' && theirs.licenceVerdict === 'allows-commercial';
    total++; if (Boolean(mine.row) === judgeSaysServe || (!mine.row && !judgeSaysServe)) agree++;
    if (Boolean(mine.row) && !judgeSaysServe) { check(`writer accepted what the judge would not serve (${l}, ${y}, "${t}")`, false); }
  }
  check('never accepts a record the existing judge would not serve as allows-commercial', agree === total, `${agree}/${total}`);
  check('accessTypeFor follows the licence', W.accessTypeFor('cc-by') === 'OpenAccess' && W.accessTypeFor('cc-by-nc') === 'Subscription' && W.accessTypeFor('') === 'Subscription');
}

console.log('\n2. a clean batch');
const r1 = RUN(); const rows1 = [row(), row({ journalId: jr2.id, licence: 'cc0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', licenceContentVersion: 'unspecified' }), row({ source: 'EuropePMC', licence: 'cc by', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', licenceSource: 'EuropePMC', sourceRecordId: 'PMC1' })];
const jBefore = (await db.$queryRawUnsafe(`select "articleCount" c, "updatedAt"::text u, status s from "Journal" where id = $1`, jr.id) as any[])[0];
const a1 = apply(r1, rows1);
check('exit 0, 3 inserted', a1.status === 0 && a1.out?.inserted === 3, JSON.stringify({ s: a1.status, e: a1.err.slice(0, 120) }));
const art = (await db.article.findMany({ where: { createdBy: `ArticleBackfill:${r1}` } })) as any[];
const x = art.find((a) => a.doi === rows1[0].doi)!;
check('every field as promised', !!x && x.status === 'Published' && x.accessStatus === 'LinkOnly' && x.pdfUrl === null && x.abstract === null && x.accessType === 'OpenAccess' && x.licenceIsNC === false
  && x.licence === 'cc-by' && x.domain === DEPT && x.journalName === jr.title && x.journalIssn === jr.issn && x.fingerprint === `doi:${rows1[0].doi}` && x.originalUrl === `https://doi.org/${rows1[0].doi}`
  && x.parentKind === 'Journal' && x.parentId === jr.id && x.source === 'Crossref' && x.authors === 'Doe J, Roe R' && x.year === 2024 && x.publisherName === 'Test Publisher');
check('licence URL, licence source and run id are in metadata', x.metadata?.licenceUrl === rows1[0].licenceUrl && x.metadata?.licenceSource === 'Crossref' && x.metadata?.backfillRunId === r1);
check('the Europe PMC row keeps its own licence string; its URL is Crossref\'s and says so', art.some((a) => a.source === 'EuropePMC' && a.licence === 'cc by' && a.metadata?.licenceUrl === 'https://creativecommons.org/licenses/by/4.0/' && a.metadata?.licenceUrlSource === 'Crossref' && a.metadata?.licenceSource === 'EuropePMC'));
check('version and start are stored with the licence', x.metadata?.licenceContentVersion === 'vor' && x.metadata?.licenceStart === '2021-01-01');
const aud = (await db.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'ARTICLE_BACKFILL_IMPORT' and meta->>'runId' = $1`, r1) as any[]);
check('one audit row lists every inserted id and the lock order', aud.length === 1 && aud[0].meta.inserted.length === 3 && aud[0].meta.lock.order.join() === '2026103001,stm.journal.insert,dept-radiology-book-insert');
const jAfter = (await db.$queryRawUnsafe(`select "articleCount" c, "updatedAt"::text u, status s from "Journal" where id = $1`, jr.id) as any[])[0];
check('the journal row is untouched', JSON.stringify(jBefore) === JSON.stringify(jAfter));
check('department Published count reported before/after', a1.out.departmentPublishedBefore === 0 && a1.out.departmentPublishedAfter === 3);
check('sample, licence mix and per-journal counts are reported', a1.out.sample20.length === 3 && a1.out.licenceMix['cc-by'] === 1 && a1.out.licenceMix['cc by'] === 1 && Object.keys(a1.out.byJournal).length === 2);

console.log('\n3. dry run');
const r3 = RUN(); const a3 = apply(r3, [row(), row()], ['--dry']);
check('dry reports 2 and writes nothing', a3.status === 0 && a3.out.inserted === 2 && a3.out.dry === true && (await byRun(r3)) === 0 && (await count(`select count(*)::int n from "IngestionAudit" where meta->>'runId' = $1`, r3)) === 0);

console.log('\n4. running the same plan again');
const a4 = apply(r1, rows1);
check('every DOI is held, nothing is written, auto-stop 6', a4.status === 6 && a4.out.stopped.code === 6 && a4.out.skippedHeld === 3 && (await byRun(r1)) === 3);

console.log('\n5. what is rejected, and not stored');
const r5 = RUN();
const bad = [row({ licence: 'cc-by-nc', licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' }), row({ licence: '', licenceUrl: null }), row({ licence: 'other-oa', licenceUrl: null, source: 'EuropePMC' }), row({ year: 2019 }), row({ year: null }),
  row({ doi: 'not-a-doi' }), row({ journalId: crypto.randomUUID() }), row({ source: 'OpenAlex' }), row({ title: '  ' }), row({ licence: 'cc-by', licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' }), row({ licenceUrl: null }),
  row({ licenceContentVersion: 'tdm' }), row({ licenceContentVersion: 'am' }), row({ licenceContentVersion: null }), row({ licenceDelayDays: 90 }), row({ licenceDelayDays: undefined }), row({ licenceStart: '2999-01-01' }), row({ licenceStart: null }),
  row({ source: 'EuropePMC', licence: 'cc by', licenceUrl: null, licenceSource: 'EuropePMC' }), row({ source: 'EuropePMC', licence: 'cc by', licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/', licenceSource: 'EuropePMC' }),
  row({ source: 'EuropePMC', licence: 'cc by', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', licenceUrlSource: 'EuropePMC', licenceSource: 'EuropePMC' })];
const a5 = apply(r5, bad);
check('all 21 rejected (NC, no licence, tdm/am/unstated version, embargo, future start, EPMC without a Crossref URL), 0 inserted, exit 0', a5.status === 0 && a5.out.rejected === 21 && a5.out.inserted === 0 && (await byRun(r5)) === 0, JSON.stringify(a5.out?.rejectedByReason));
check('a stated-NC licence is not rescued by a CC BY label (URL must agree)', Object.keys(a5.out.rejectedByReason).some((k) => /does not match its URL/.test(k)));

check('an Europe PMC "cc by" with Crossref\'s by/4.0 URL and an entry in force is accepted', W.judgeRow(row({ source: 'EuropePMC', licence: 'cc by', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', licenceSource: 'EuropePMC' }), new Map([[jr.id, {}]]), 2020, 2026).row?.licence === 'cc by');
check('"unspecified" is accepted; a licence that starts today is accepted', !!W.judgeRow(row({ licenceContentVersion: 'unspecified', licenceStart: '2026-10-31' }), new Map([[jr.id, {}]]), 2020, 2026, '2026-10-31').row);

console.log('\n6. the journal changed after the plan was frozen');
const jr3 = { id: crypto.randomUUID(), title: `Moved ${tag}`, issn: '4567-8902', eissn: null as string | null }; await seedJournal(jr3, 'Medical Sciences');
const jr4 = { id: crypto.randomUUID(), title: `Review ${tag}`, issn: '5678-9013', eissn: null as string | null }; await seedJournal(jr4, DEPT, 'NeedsReview');
const pj = [...planJournals, { journalId: jr3.id, issn: jr3.issn, eissn: null, status: 'MetadataOnly' }, { journalId: jr4.id, issn: jr4.issn, eissn: null, status: 'MetadataOnly' }];
const r6 = RUN(); const a6 = apply(r6, [row(), row({ journalId: jr3.id }), row({ journalId: jr4.id }), row({ journalId: jr.id }), row(), row(), row(), row(), row(), row()], [], pj);
check('rows of a moved or re-statused journal are skipped, the rest go in', a6.out.skippedJournalChanged === 2 && a6.out.inserted === 8, JSON.stringify({ moved: a6.out?.skippedJournalChanged, ins: a6.out?.inserted }));

console.log('\n7. DOI dedupe is made inside the locks, by fingerprint and by the doi column, any case');
const d7 = `10.9999/${tag}.held`; const d7b = `10.9999/${tag}.held2`;
await db.article.create({ data: { title: 'already here', doi: d7.toUpperCase(), journalId: jr.id, status: 'Published', fingerprint: 'x-other', source: 'DOAJ' } as any });
await db.article.create({ data: { title: 'already here 2', doi: null, journalId: jr.id, status: 'Published', fingerprint: `doi:${d7b}`, source: 'OpenAlex' } as any });
const r7 = RUN(); const rows7 = [row({ doi: d7 }), row({ doi: d7b }), ...Array.from({ length: 28 }, () => row())];
const a7 = apply(r7, rows7);
check('the two held DOIs are skipped (2 of 30 < 10%), 28 inserted', a7.status === 0 && a7.out.skippedHeld === 2 && a7.out.inserted === 28);
console.log('\n8. a DOI twice in one plan');
const dd = row(); const r8 = RUN(); const a8 = apply(r8, [dd, { ...dd }, row(), row(), row(), row(), row(), row(), row(), row(), row(), row()]);
check('inserted once', a8.out.skippedInBatchDuplicate === 1 && a8.out.inserted === 11 && (await count(`select count(*)::int n from "Article" where lower(doi) = $1`, dd.doi)) === 1);

console.log('\n9. batches');
const r9 = RUN(); const a9 = spawnSync('node', ['scripts/dept-optometry-ophthalmology-articles-apply.cjs', planFile(r9, Array.from({ length: 5 }, () => row())), '--batch=2', '--max=5'], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
check('5 rows, batch 2: 3 transactions and 3 audit rows', JSON.parse(a9.stdout).batches === 3 && (await count(`select count(*)::int n from "IngestionAudit" where action = 'ARTICLE_BACKFILL_IMPORT' and meta->>'runId' = $1`, r9)) === 3);
console.log('\n10. --max');
const r10 = RUN(); const a10 = spawnSync('node', ['scripts/dept-optometry-ophthalmology-articles-apply.cjs', planFile(r10, Array.from({ length: 6 }, () => row())), '--max=4'], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8' });
check('only the first 4 are considered', JSON.parse(a10.stdout).requested === 4 && (await byRun(r10)) === 4);

console.log('\n11. another writer holds the locks');
{
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; }); let held!: () => void; const ready = new Promise<void>((r) => { held = r; });
  const holder = db.$transaction(async (tx: any) => { await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); held(); await gate; }, { timeout: 60000 });
  await ready;
  const r11 = RUN(); const t0 = Date.now(); const a11 = apply(r11, [row(), row()], ['--lock-timeout=2']);
  release(); await holder;
  check('waits, then auto-stops with 7 and writes nothing', a11.status === 7 && a11.out.stopped.code === 7 && (await byRun(r11)) === 0 && Date.now() - t0 >= 1800, `${Date.now() - t0} ms`);
}

console.log('\n12. rollback: default is a dry run');
const before12 = await byRun(r1);
const d12 = rollback(r1);
check('lists 3 and deletes nothing', d12.status === 0 && d12.out.wouldDelete === 3 && d12.out.executed === false && (await byRun(r1)) === before12);
console.log('\n13. rollback --execute deletes only what the run wrote, still as written');
// r7 inserted 28: make three of them no longer pristine
const mine = (await db.article.findMany({ where: { createdBy: `ArticleBackfill:${r7}` }, take: 4 })) as any[];
await db.$executeRawUnsafe(`update "Article" set views = 5 where id = $1`, mine[0].id);
await db.$executeRawUnsafe(`update "Article" set abstract = 'added by a person' where id = $1`, mine[1].id);
await db.$executeRawUnsafe(`update "Article" set "createdBy" = 'someone' where id = $1`, mine[2].id);
const au = await db.author.create({ data: { name: `Author ${tag}`, nameNormalised: `author ${tag}` } as any }) as any;
await db.$executeRawUnsafe(`insert into "ArticleAuthor" ("articleId", "authorId", position) values ($1,$2,0)`, mine[3].id, au.id);
const other = await byRun(r1);
const x13 = rollback(r7, ['--execute']);
check('exit 0 and the 24 pristine rows are deleted', x13.status === 0 && x13.out.deleted === 24, JSON.stringify({ del: x13.out?.deleted, kept: x13.out?.kept, err: x13.err.slice(0, 150) }));
check('the viewed, edited, re-owned and author-linked rows are kept with their reasons', x13.out.kept === 4 && x13.out.keptDetail.some((k: any) => /view/.test(k.why.join())) && x13.out.keptDetail.some((k: any) => /abstract/.test(k.why.join())) && x13.out.keptDetail.some((k: any) => /createdBy/.test(k.why.join())));
check('another run is untouched, and the import audit rows are still there', (await byRun(r1)) === other && (await count(`select count(*)::int n from "IngestionAudit" where action = 'ARTICLE_BACKFILL_IMPORT' and meta->>'runId' = $1`, r7)) === 1);
check('one rollback audit row', (await count(`select count(*)::int n from "IngestionAudit" where action = 'ARTICLE_BACKFILL_ROLLBACK' and meta->>'runId' = $1`, r7)) === 1);
const again = rollback(r7, ['--execute']);
check('a second rollback finds nothing more to delete and writes no audit row', again.out.deleted === 0 && (await count(`select count(*)::int n from "IngestionAudit" where action = 'ARTICLE_BACKFILL_ROLLBACK' and meta->>'runId' = $1`, r7)) === 1);
const none = rollback(`dept-optometry-ophthalmology-articles-2026-10-31-${'0'.repeat(8)}`, ['--execute']);
check('a run id that never existed: 0 listed, 0 deleted, no audit row', none.status === 0 && none.out.listedByRun === 0 && none.out.deleted === 0);
const badId = rollback('dept-mlt-2026-10-30-c673ab67');
check('a run id of another department is refused', badId.status === 3);

console.log('\n14. lock order in the two files (what prod-run.sh checks)');
for (const f of ['apply', 'rollback']) {
  const src = readFileSync(`scripts/dept-optometry-ophthalmology-articles-${f}.cjs`, 'utf8');
  const calls = [...src.matchAll(/select\s+pg_advisory_xact_lock\(((?:[^()]|\([^()]*\))*)\)/gi)].map((m) => (/2026103001/.test(m[1]) ? 1 : /stm\.journal\.insert/.test(m[1]) ? 2 : /dept-radiology-book-insert/.test(m[1]) ? 3 : 9));
  check(`${f}: 2026103001 -> stm.journal.insert -> dept-radiology-book-insert`, calls.join() === '1,2,3', calls.join());
}

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
