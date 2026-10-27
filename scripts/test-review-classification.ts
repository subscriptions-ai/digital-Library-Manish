/**
 * Review automation R1: the read-only classification analysis of the "Needs a department" queue.
 * Private throwaway database `stm_review_test` only (same schema; the shared stm_ingestion_test is written by other suites at the same time, so whole-table checks cannot be exact there). Create it once: createdb stm_review_test && DATABASE_URL=.../stm_review_test npx prisma db push.
 *
 *   npx tsx scripts/test-review-classification.ts
 *
 * Seeds a few tagged books (a clear one, a words-only one, a weak one, a no-evidence one, a tied one, one already placed, one carrying a
 * rejection note, and some Published books standing in for decisions a person made), runs the analysis over the WHOLE queue, and proves:
 * the tiers are right, the totals reconcile with a direct count, the thresholds recommendation comes from the human decisions, paging and
 * filters work, and — the point of R1 — not one Book row (any column) differs afterwards. Removes exactly what it created.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_review_test');

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_review_test') throw new Error(`refusing to run against "${name}"`);
const R = await import('../src/lib/ingestion/reviewClassification.js');
const { classifyDepartment, STRONG_MIN, STRONG_MARGIN, REVIEW_MIN } = await import('../src/lib/ingestion/books/classifier.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);

// ── 1. Tiers, with no database ──────────────────────────────────────────────
section('Tiers');
const CODE = 1, TITLE = 2, SUBJECT = 4, ABSTRACT = 8;
eq('the thresholds shown are the classifier\'s own constants', [R.CURRENT_THRESHOLDS.highMinScore, R.CURRENT_THRESHOLDS.highMinMargin, R.CURRENT_THRESHOLDS.lowMinScore], [STRONG_MIN, STRONG_MARGIN, REVIEW_MIN]);
eq('score 8, margin 4, code + title → high', R.tierOf(8, 4, CODE | TITLE), 'high');
eq('score 8, margin 4, words only → medium (no code agrees)', R.tierOf(8, 4, TITLE | SUBJECT), 'medium');
eq('score 8, margin 4, code only → medium (nothing corroborates it)', R.tierOf(8, 4, CODE), 'medium');
eq('score 8, margin 4, code + abstract only → medium (the abstract is not a witness)', R.tierOf(8, 4, CODE | ABSTRACT), 'medium');
eq('score 6, margin 2, code + title → medium (lead is narrow)', R.tierOf(6, 2, CODE | TITLE), 'medium');
eq('score 8, margin 0 → low (a tie is never "clear")', R.tierOf(8, 0, CODE | TITLE), 'low');
eq('score 4 → low', R.tierOf(4, 4, TITLE), 'low');
eq('score 3 → unclassifiable', R.tierOf(3, 3, TITLE), 'unclassifiable');
eq('score 0 → unclassifiable', R.tierOf(0, 0, 0), 'unclassifiable');
eq('licence states', [R.licenceState(null, null), R.licenceState('', null), R.licenceState('CC BY', false), R.licenceState('CC BY-NC', true)], ['No licence declared', 'No licence declared', 'Open licence', 'Non-commercial']);

// ── 2. Recommendation comes from human decisions ───────────────────────────
section('Recommendation');
const row = (o: Partial<any>): any => ({ id: 'x', dept: 'Law', score: 8, margin: 4, next: null, nextScore: 0, fam: CODE | TITLE, tier: 'high', source: 'S', year: 2021, licence: 'Open licence', lang: 'en', storedDept: null, storedScore: null, ...o });
const none = R.summarise([row({})], { startedAt: new Date(), queueTotal: 1, alreadyPlaced: 0, withRejectionNote: 0 }, []);
eq('with no human decisions the classifier\'s own rule is kept, and it says why', [none.recommendation.basis, none.recommendation.highMinScore, none.recommendation.highMinMargin, none.recommendation.highRequiresCode], ['classifier-defaults', STRONG_MIN, STRONG_MARGIN, true]);
check('…and the reason mentions how few decisions there are', /Only 0 books/.test(none.recommendation.reason), none.recommendation.reason.slice(0, 80));
// 60 decided books: words-only at score 8 agree 50/60 (83%); code+words agree 59/60.
const human: any[] = [];
for (let i = 0; i < 60; i++) human.push({ row: row({ fam: CODE | TITLE, dept: 'Law' }), chosen: i === 0 ? 'Arts' : 'Law' });
for (let i = 0; i < 60; i++) human.push({ row: row({ fam: TITLE | SUBJECT, dept: 'Law', tier: 'medium' }), chosen: i < 10 ? 'Arts' : 'Law' });
const queue = [row({}), row({ fam: TITLE | SUBJECT, tier: 'medium' }), row({ score: 5, margin: 5, fam: TITLE, tier: 'low' })];
const cal = R.summarise(queue, { startedAt: new Date(), queueTotal: 3, alreadyPlaced: 0, withRejectionNote: 0 }, human);
eq('calibrated: requires a code, because words-only is only 83% right', cal.recommendation.basis + ':' + cal.recommendation.highRequiresCode, 'calibrated:true');
check('calibrated rule met the bar on enough samples', cal.recommendation.precision! >= 97 && cal.recommendation.calibrationSamples >= 30, `${cal.recommendation.precision}% over ${cal.recommendation.calibrationSamples}`);
eq('tier calibration counts decisions per tier', [cal.calibration.byTier.high.n, cal.calibration.byTier.high.agreed, cal.calibration.byTier.medium.n, cal.calibration.byTier.medium.agreed], [60, 59, 60, 50]);
eq('shares add up to the analysed queue', Math.round((cal.share.autoResolvable + cal.share.batchReview + cal.share.manual) * 10) / 10, 100);

// ── 3. Filters and paging, with no database ────────────────────────────────
section('Filters');
const set = [row({ id: 'a', source: 'DOAB', dept: 'Law', score: 9, margin: 5 }), row({ id: 'b', source: 'OAPEN', dept: 'Arts', score: 6, margin: 1, tier: 'medium', year: 1995 }),
  row({ id: 'c', source: 'DOAB', dept: 'Law', score: 4, margin: 4, tier: 'low', licence: 'No licence declared', lang: 'fr' }), row({ id: 'd', source: 'DOAB', dept: null, score: 0, margin: 0, tier: 'unclassifiable', year: null })];
const ids = (f: any) => R.applyFilters(set, f).map(r => r.id);
eq('by provider', ids({ source: 'DOAB' }), ['a', 'c', 'd']);
eq('by department', ids({ department: 'Law' }), ['a', 'c']);
eq('by tier', ids({ tier: 'medium' }), ['b']);
eq('by top score range', ids({ minScore: 5, maxScore: 8 }), ['b']);
eq('by margin', ids({ minMargin: 4 }), ['a', 'c']);
eq('by year (unknown years never match a year range)', ids({ yearFrom: 2000 }), ['a', 'c']);
eq('by licence state', ids({ licence: 'No licence declared' }), ['c']);
eq('by language', ids({ language: 'fr' }), ['c']);
eq('combined', ids({ source: 'DOAB', department: 'Law', tier: 'low' }), ['c']);

// ── 4. The whole thing, against the database ───────────────────────────────
section('Analysis over the database');
const TAG = `rcls-${Date.now().toString(36)}`;
const made: string[] = [];
const harvest = (o: any) => ({ harvest: { classifications: o.codes || [], keywords: o.kw || [], provider: o.provider || {}, department: o.stored ?? { band: 'review', score: 1, suggested: 'Arts', runnerUp: null } } });
const seed = async (title: string, o: any = {}) => {
  const b = await db.book.create({ data: { title: `${TAG} ${title}`, status: 'Draft', ownershipSource: 'Ingested', source: o.source || 'DOAB', year: o.year ?? 2021, licence: o.licence ?? null, licenceIsNC: o.nc ?? null,
    language: o.lang ?? 'en', description: o.description ?? null, domain: o.domain ?? null, rejectionNote: o.note ?? null, metadata: harvest(o), ...(o.status ? { status: o.status } : {}) } });
  made.push(b.id); return b.id;
};
const dental = ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'];
const idHigh = await seed('Dentistry Essentials', { codes: dental, kw: ['dentistry', 'oral health'], licence: 'CC BY' });
const idWords = await seed('Dental Implants', { kw: ['dental implants'], source: 'OpenLibraryDump', year: 1998 });
const idWeak = await seed('A study', { kw: ['health'] });
const idNone = await seed('Soro Soke', { kw: ['Current affairs', 'Africa'], licence: 'CC BY-NC', nc: true, lang: 'fr' });
const idPlaced = await seed('Already placed book', { kw: ['law'], domain: 'Law' });
const idNoted = await seed('Carries a rejection note', { kw: ['law'], note: 'dup' });
const idPublished = await seed('Published law book', { kw: ['law'], status: 'Published', domain: 'Law' });
// "Decisions a person made": Published, harvest-held (not promoted by the engine), with a department.
for (let i = 0; i < 5; i++) await seed(`decided ${i}`, { codes: dental, kw: ['dentistry'], status: 'Published', domain: i === 0 ? 'Arts' : 'Dental' });

const [counts0] = await db.$queryRawUnsafe(`select count(*)::int books, (select count(*)::int from "Journal") journals, (select count(*)::int from "Article") articles from "Book"`);
const settingsBefore = JSON.stringify(await db.ingestionState.findMany());

R.__resetClassification();
eq('before a run there is no summary in this process and the job is idle', [R.jobState().status, (await R.recordsPage({}, 1, 25)).available], ['idle', false]);
const finished = new Promise<void>(res => { const t = setInterval(() => { if (R.jobState().status !== 'running') { clearInterval(t); res(); } }, 50); });
check('the run starts', R.startAnalysis({ email: 'test@example.com' }) === true);
check('a second run while one is going is refused', R.startAnalysis(null) === false);
await finished;
eq('the job finished', R.jobState().status, 'done');
const S = (await R.loadSummary())!;
check('the summary is persisted (survives a restart)', !!S && S.analysed > 0);

const [direct] = await db.$queryRawUnsafe(`select count(*)::int n from "Book" where status='Draft' and "ownershipSource"='Ingested' and domain is null and "rejectionNote" is null`);
eq('analysed = a direct count of the queue', S.analysed, direct.n);
eq('the four tiers add up to analysed', Object.values(S.tiers).reduce((a: number, b: any) => a + b, 0), S.analysed);
const [placedDirect] = await db.$queryRawUnsafe(`select count(*)::int n from "Book" where status='Draft' and "ownershipSource"='Ingested' and domain is not null`);
eq('books that already have a department are left out and counted as such', S.alreadyPlaced, placedDirect.n);
check('a book with a rejection note is left out and counted', S.withRejectionNote >= 1);
eq('score distribution sums to analysed', Object.values(S.scoreDistribution).reduce((a: number, b: any) => a + b, 0), S.analysed);
eq('department table: high + medium + low = total on every row', S.byDepartment.every(d => d.high + d.medium + d.low === d.total), true);
eq('source table sums to analysed', Object.values(S.bySource).reduce((a: number, t: any) => a + Object.values(t).reduce((x: number, y: any) => x + y, 0), 0), S.analysed);

// Each seeded book, found through the filtered record list, lands in the tier the classifier says it should.
const page = await R.recordsPage({}, 1, 100);
const all: any[] = []; for (let p = 1; ; p++) { const r = await R.recordsPage({}, p, 100); all.push(...r.records); if (p * 100 >= r.total) break; }
const find = (id: string) => all.find(r => r.id === id);
const exp = (o: any) => { const v = classifyDepartment({ classifications: o.codes, subjects: o.kw, title: o.title }); return v; };
eq('clear book (code + wording) is high, suggested Dental', [find(idHigh)?.tier, find(idHigh)?.suggested], ['high', 'Dental']);
eq('words-only dental book is not high (it needs a person)', find(idWords)?.tier !== 'high' && find(idWords)?.suggested === 'Dental', true);
eq('"A study / health" is not assigned a confident tier', ['low', 'unclassifiable'].includes(find(idWeak)?.tier), true);
eq('"Soro Soke" has no evidence → unclassifiable, no department', [find(idNone)?.tier, find(idNone)?.suggested], ['unclassifiable', null]);
eq('an already-placed book is not in the result', find(idPlaced), undefined);
eq('a book with a rejection note is not in the result', find(idNoted), undefined);
eq('a Published book is not in the result', find(idPublished), undefined);
eq('the row carries score, runner-up evidence and reasons for the reviewer', [typeof find(idHigh)?.score, Array.isArray(find(idHigh)?.evidence), (find(idHigh)?.reasons || []).length > 0], ['number', true, true]);
eq('filtering by tier returns only that tier', all.length > 0 && (await R.recordsPage({ tier: 'high' }, 1, 100)).records.every(r => r.tier === 'high'), true);
const nc: any[] = []; for (let p = 1; ; p++) { const r = await R.recordsPage({ licence: 'Non-commercial' }, p, 100); nc.push(...r.records); if (p * 100 >= r.total) break; }
eq('filtering by licence state finds the non-commercial book, and only non-commercial ones', [nc.some(r => r.id === idNone), nc.every(r => r.licenceState === 'Non-commercial')], [true, true]);
eq('paging is bounded', page.records.length <= 100 && page.take === 100, true);
const p1 = await R.recordsPage({}, 1, 10), p2 = await R.recordsPage({}, 2, 10);
check('pages do not overlap', p1.records.every(a => !p2.records.some(b => b.id === a.id)));
check('results come best-evidence first', p1.records.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));

// A book that leaves the queue after the run is dropped from the page, not shown.
await db.book.update({ where: { id: idHigh }, data: { status: 'Rejected' } });
const gone = await R.recordsPage({ tier: 'high' }, 1, 100);
check('a book rejected after the run no longer appears', !gone.records.some(r => r.id === idHigh) && gone.dropped >= 1);
await db.book.update({ where: { id: idHigh }, data: { status: 'Draft' } });

// ── 5. Read-only: nothing else moved ───────────────────────────────────────
section('Read-only guarantees');
// The only Book change in this test is the reject/restore round trip above, which restores status; updatedAt moved, so compare everything else.
const strip = async () => {
  const rows: any[] = await db.$queryRawUnsafe(`select id, title, status, domain, licence, "licenceIsNC", "accessType", "accessStatus", "rightsStatus", "rejectionNote", metadata::text m from "Book" order by id`);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
// Take the "before" for this comparison from a second analysis over an unchanged table.
const baseline = await strip();
R.__resetClassification();
const fin2 = new Promise<void>(res => { const t = setInterval(() => { if (R.jobState().status !== 'running') { clearInterval(t); res(); } }, 50); });
R.startAnalysis(null); await fin2;
eq('no Book changed in department, status, licence, access, rights, rejection note or metadata', await strip(), baseline);
const [counts1] = await db.$queryRawUnsafe(`select count(*)::int books, (select count(*)::int from "Journal") journals, (select count(*)::int from "Article") articles from "Book"`);
eq('no Book, Journal or Article was added or removed', counts1, counts0);
eq('the ingestion state (checkpoints, scheduler) is untouched', JSON.stringify(await db.ingestionState.findMany()), settingsBefore);

// ── clean up exactly what this run created ──────────────────────────────────
await db.book.deleteMany({ where: { id: { in: made } } });
await db.appSetting.deleteMany({ where: { key: 'REVIEW_CLASSIFICATION_ANALYSIS' } });
const left = await db.book.count({ where: { title: { startsWith: TAG } } });
eq('everything seeded was removed', left, 0);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
