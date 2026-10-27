/**
 * Daily Ingestion Summary: the reporting window, what counts as "added", the department table, and the records behind each number.
 * Runs against the throwaway database `stm_ingestion_test` and refuses anything else.
 *
 *   npx tsx scripts/test-daily-summary.ts
 *
 * Every row it writes carries this run's tag and sits in a window in March 2021 that the test first proves is empty;
 * it removes exactly those rows afterwards. Nothing else in the database is read for a verdict or touched.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.INGEST_DAILY_LIVE_CACHE_MS = '0'; process.env.INGEST_DAILY_FINAL_CACHE_MS = '0';

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_ingestion_test') throw new Error(`refusing to run against "${name}"`);
const D = await import('../src/lib/ingestion/dailySummary.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);

// ── 1. The window, with no database ─────────────────────────────────────────
section('Reporting window (IST, 5:01 PM → 5:00 PM)');
const iso = (d: Date) => d.toISOString();
const w = D.dailyIngestionWindow('2026-10-26');
eq('report 26 Oct starts 25 Oct 17:01:00 IST (= 11:31:00Z)', iso(w.start), '2026-10-25T11:31:00.000Z');
eq('and ends, exclusive, at 26 Oct 17:01:00 IST (= 11:31:00Z)', iso(w.end), '2026-10-26T11:31:00.000Z');
eq('its last minute is 26 Oct 17:00 IST', iso(w.lastMinute), '2026-10-26T11:30:00.000Z');
eq('the next report starts exactly where this one ends (no gap, no overlap)', iso(D.dailyIngestionWindow('2026-10-27').start), iso(w.end));
const ist = (day: string, hms: string) => new Date(`${day}T${hms}+05:30`);
const at = (day: string, hms: string) => D.reportDateAt(ist(day, hms));
eq('16:59:59 belongs to that day\'s report', at('2026-10-26', '16:59:59'), '2026-10-26');
eq('17:00:00 belongs to that day\'s report', at('2026-10-26', '17:00:00'), '2026-10-26');
eq('17:00:59.999 belongs to that day\'s report', D.reportDateAt(ist('2026-10-26', '17:00:59.999')), '2026-10-26');
eq('17:01:00 belongs to the NEXT report', at('2026-10-26', '17:01:00'), '2026-10-27');
eq('17:01:01 belongs to the NEXT report', at('2026-10-26', '17:01:01'), '2026-10-27');
eq('00:00:00 IST is still the cycle ending that evening', at('2026-10-26', '00:00:00'), '2026-10-26');
eq('23:59:59 IST belongs to the next day\'s report', at('2026-10-26', '23:59:59'), '2026-10-27');
// Across month and year ends, and the timestamp-in-window check is the same predicate as the SQL (>= start, < end).
eq('31 Dec 17:01 rolls into the 1 Jan report', at('2026-12-31', '17:01:00'), '2027-01-01');
eq('1 Jan window starts 31 Dec 17:01 IST', iso(D.dailyIngestionWindow('2027-01-01').start), '2026-12-31T11:31:00.000Z');
const inWin = (win: any, t: Date) => t >= win.start && t < win.end;
eq('a record at 17:00:30 is in exactly one report', [inWin(w, ist('2026-10-26', '17:00:30')), inWin(D.dailyIngestionWindow('2026-10-27'), ist('2026-10-26', '17:00:30'))], [true, false]);
eq('a record at 17:01:00.000 is in exactly one report', [inWin(w, ist('2026-10-26', '17:01:00')), inWin(D.dailyIngestionWindow('2026-10-27'), ist('2026-10-26', '17:01:00'))], [false, true]);
eq('no instant is in two windows or none (hourly sweep over a week)', (() => { let bad = 0; for (let t = Date.parse('2026-10-20T00:00:00Z'); t < Date.parse('2026-10-27T00:00:00Z'); t += 60_000) { const r = D.reportDateAt(t); const win = D.dailyIngestionWindow(r); if (!(t >= +win.start && t < +win.end)) bad++; } return bad; })(), 0);

section('Current cycle and previous reports');
const now = ist('2026-10-26', '10:00:00');
eq('at 10:00 IST the live report is today\'s', D.resolveReportDate(undefined, now), { ok: true, reportDate: '2026-10-26' });
eq('at 17:00:30 it is still live', D.cycleState(D.dailyIngestionWindow('2026-10-26'), ist('2026-10-26', '17:00:30')), 'live');
eq('at 17:01:00 it is finalized', D.cycleState(D.dailyIngestionWindow('2026-10-26'), ist('2026-10-26', '17:01:00')), 'finalized');
eq('and the new live cycle is tomorrow\'s', D.resolveReportDate(undefined, ist('2026-10-26', '17:01:00')), { ok: true, reportDate: '2026-10-27' });
eq('previous reports run newest first from the live one', D.previousReportDates(now, 4), ['2026-10-26', '2026-10-25', '2026-10-24', '2026-10-23']);
eq('selecting 24 Oct gives 23 Oct 17:01 → 24 Oct 17:01 IST', [iso(D.dailyIngestionWindow('2026-10-24').start), iso(D.dailyIngestionWindow('2026-10-24').end)], ['2026-10-23T11:31:00.000Z', '2026-10-24T11:31:00.000Z']);
check('a future report is refused', !(D.resolveReportDate('2026-10-28', now) as any).ok);
check('the cycle that has not started is refused, the live one is not', !(D.resolveReportDate('2026-10-27', now) as any).ok && (D.resolveReportDate('2026-10-26', now) as any).ok);
check('a malformed date is refused', !(D.resolveReportDate('26-10-2026', now) as any).ok && !(D.resolveReportDate('2026-02-30', now) as any).ok);
check('a date before records began is refused', !(D.resolveReportDate('2019-12-31', now) as any).ok);

// ── 2. Against the database ─────────────────────────────────────────────────
const TAG = `dsum-${Date.now().toString(36)}`;
const DAY = '2021-03-15';                                   // the report under test: 14 Mar 17:01 IST → 15 Mar 17:01 IST
const EMPTY = '2021-03-25';
const OTHER = '2021-03-16';
const W = D.dailyIngestionWindow(DAY);
const mid = new Date(W.start.getTime() + 3 * 3600_000);
const made = { Article: [] as string[], Book: [] as string[], Journal: [] as string[], IngestionRun: [] as string[] };
let issnSeq = 0;
const issn = () => `9${String(Math.floor(Math.random() * 1e3)).padStart(3, '0')}-${String(++issnSeq).padStart(3, '0')}${'X'}`;

const article = async (o: any) => { const r = await db.article.create({ data: { title: `${TAG} article`, status: 'Published', ownershipSource: 'Ingested', source: 'OpenAlex', createdAt: mid, ...o } }); made.Article.push(r.id); return r; };
const book = async (o: any) => { const r = await db.book.create({ data: { title: `${TAG} book`, status: 'Published', ownershipSource: 'Ingested', source: 'DOAB', createdAt: mid, ...o } }); made.Book.push(r.id); return r; };
const journal = async (o: any) => { const r = await db.journal.create({ data: { title: `${TAG} journal`, status: 'Accepted', issn: issn(), rightsBasis: 'DOAJ declaration', createdAt: mid, ...o } }); made.Journal.push(r.id); return r; };
const run = async (o: any) => { const r = await db.ingestionRun.create({ data: { phase: 'Articles', source: 'OpenAlex', ...o } }); made.IngestionRun.push(r.id); return r; };

const cleanup = async () => {
  await db.article.deleteMany({ where: { id: { in: made.Article } } }); await db.book.deleteMany({ where: { id: { in: made.Book } } });
  await db.journal.deleteMany({ where: { id: { in: made.Journal } } }); await db.ingestionRun.deleteMany({ where: { id: { in: made.IngestionRun } } });
};

try {
  // The windows used must hold nothing before we start, or the expectations below would be about someone else's rows.
  for (const d of [DAY, EMPTY, OTHER]) {
    const s = await D.dailySummary(d, { fresh: true });
    if (s.totalAdded !== 0 || s.processing.runs !== 0) throw new Error(`the ${d} window is not empty in the scratch database; pick another`);
  }

  section('Zero activity');
  const zero = await D.dailySummary(EMPTY, { fresh: true });
  eq('a window with nothing added reports zero in every figure', [zero.totalAdded, zero.journalsAdded, zero.articlesAdded, zero.booksAdded, zero.departmentsWithActivity], [0, 0, 0, 0, 0]);
  eq('and lists no departments at all (no zero rows)', zero.departments, []);

  section('One department, one article');
  const a1 = await article({ domain: 'Agriculture' });
  let s = await D.dailySummary(DAY, { fresh: true });
  eq('one article → 1 added, 1 department', [s.totalAdded, s.articlesAdded, s.journalsAdded, s.booksAdded, s.departmentsWithActivity], [1, 1, 0, 0, 1]);
  eq('the department row', s.departments, [{ department: 'Agriculture', journals: 0, articles: 1, books: 0, total: 1 }]);

  section('One department with a journal, an article and a book; several departments');
  await journal({ domain: 'Agriculture' });
  await book({ domain: 'Agriculture' });
  for (let i = 0; i < 4; i++) await article({ domain: 'Agriculture' });                    // Agriculture: 1 journal, 5 articles, 1 book = 7
  await article({ domain: 'Medical' });                                                    // an old spelling…
  await article({ domain: 'Medical Sciences' });                                           // …and the official one: one department
  await book({ domain: 'Medical Sciences' });
  await journal({ domain: 'Computer / IT' });
  await article({ domain: null });                                                         // no department
  await book({ domain: '   ' });                                                           // blank is no department too
  s = await D.dailySummary(DAY, { fresh: true });
  const row = (n: string) => s.departments.find(r => r.department === n);
  eq('Agriculture holds all three kinds', row('Agriculture'), { department: 'Agriculture', journals: 1, articles: 5, books: 1, total: 7 });
  eq('"Medical" and "Medical Sciences" are one department', row('Medical Sciences'), { department: 'Medical Sciences', journals: 0, articles: 2, books: 1, total: 3 });
  check('there is no separate "Medical" row', !row('Medical'));
  eq('Computer / IT', row('Computer / IT'), { department: 'Computer / IT', journals: 1, articles: 0, books: 0, total: 1 });
  eq('records with no department are listed as Unassigned, not dropped', row(D.UNASSIGNED), { department: D.UNASSIGNED, journals: 0, articles: 1, books: 1, total: 2 });
  eq('ordered by total, then name', s.departments.map(r => r.department), ['Agriculture', 'Medical Sciences', D.UNASSIGNED, 'Computer / IT']);
  check('descending by total', s.departments.every((r, i) => i === 0 || s.departments[i - 1].total >= r.total));
  eq('only departments that received something appear', s.departments.length, 4);
  eq('departmentsWithActivity excludes Unassigned', s.departmentsWithActivity, 3);
  eq('top figures', [s.totalAdded, s.journalsAdded, s.articlesAdded, s.booksAdded], [13, 2, 8, 3]);

  section('Reconciliation');
  eq('Σ department totals = totalAdded', s.departments.reduce((n, r) => n + r.total, 0), s.totalAdded);
  eq('Σ journals = journalsAdded', s.departments.reduce((n, r) => n + r.journals, 0), s.journalsAdded);
  eq('Σ articles = articlesAdded', s.departments.reduce((n, r) => n + r.articles, 0), s.articlesAdded);
  eq('Σ books = booksAdded', s.departments.reduce((n, r) => n + r.books, 0), s.booksAdded);
  eq('totalAdded = journals + articles + books', s.totalAdded, s.journalsAdded + s.articlesAdded + s.booksAdded);
  const direct = async (t: string, where: string) => (await db.$queryRawUnsafe(`select count(*)::int n from "${t}" where ${where} and title like $1`, `${TAG}%`))[0].n;
  eq('and the figures match a direct count of the rows (articles)', s.articlesAdded, await direct('Article', `status = 'Published' and "ownershipSource" = 'Ingested'`));

  section('Not counted as added');
  await article({ domain: 'Law', status: 'Draft' });                                     // sent to review
  await book({ domain: 'Law', status: 'Draft' });
  await journal({ domain: 'Law', status: 'NeedsReview' });
  await journal({ domain: 'Law', status: 'Rejected' });                                   // refused
  await journal({ domain: 'Law', status: 'MetadataOnly' });                               // catalogued, nowhere to read
  await article({ domain: 'Law', status: 'Rejected' });
  await article({ domain: 'Law', ownershipSource: 'AdminEntered' });                       // typed in by hand, not ingested
  await book({ domain: 'Law', ownershipSource: 'PublisherSubmitted' });
  const s2 = await D.dailySummary(DAY, { fresh: true });
  eq('review, refused, metadata-only and hand-entered records change nothing', [s2.totalAdded, s2.departments.length], [s.totalAdded, s.departments.length]);
  check('Law does not appear at all', !s2.departments.some(r => r.department === 'Law'));
  eq('metadata-only journals are reported on their own', s2.journalsMetadataOnly, 1);

  // A duplicate is a write that fails on the unique fingerprint: no row, so nothing to count.
  const fp = `${TAG}-fp`; await article({ domain: 'Chemistry', fingerprint: fp });
  const before = (await D.dailySummary(DAY, { fresh: true })).totalAdded;
  let dup = ''; try { await article({ domain: 'Chemistry', fingerprint: fp }); } catch (e: any) { dup = e?.code; }
  eq('a duplicate (same fingerprint) is refused by the database', dup, 'P2002');
  eq('and adds nothing to the day', (await D.dailySummary(DAY, { fresh: true })).totalAdded, before);

  // An enrichment edits a record already held, whose createdAt is older: it stays in the day it was created.
  const old = await article({ domain: 'Chemistry', createdAt: new Date(W.start.getTime() - 3 * 86_400_000) });
  const b4 = (await D.dailySummary(DAY, { fresh: true })).totalAdded;
  await db.article.update({ where: { id: old.id }, data: { licence: 'CC BY', accessStatus: 'ViewableHere' } });
  eq('enriching an older record does not make it new', (await D.dailySummary(DAY, { fresh: true })).totalAdded, b4);

  section('Boundaries in the database');
  const t = (hms: string) => ist('2021-03-15', hms);                // the report day itself
  const prev = (hms: string) => ist('2021-03-14', hms);
  const edge: [string, Date, 'in' | 'out'][] = [
    ['14 Mar 17:00:59 (before the window)', prev('17:00:59'), 'out'], ['14 Mar 17:01:00.000 (first instant)', prev('17:01:00'), 'in'], ['14 Mar 17:01:01', prev('17:01:01'), 'in'],
    ['15 Mar 16:59:59', t('16:59:59'), 'in'], ['15 Mar 17:00:00', t('17:00:00'), 'in'], ['15 Mar 17:00:59', t('17:00:59'), 'in'], ['15 Mar 17:01:00.000 (next report)', t('17:01:00'), 'out'], ['15 Mar 17:01:01', t('17:01:01'), 'out'],
  ];
  const tagFor = (n: number) => `${TAG}-edge-${n}`;
  const baseline = (await D.dailySummary(DAY, { fresh: true })).articlesAdded;
  const baselineOther = (await D.dailySummary(OTHER, { fresh: true })).articlesAdded;
  for (let i = 0; i < edge.length; i++) await article({ domain: 'Edge Dept', title: tagFor(i), createdAt: edge[i][1] });
  const got = await D.dailyContent({ reportDate: DAY, department: 'Edge Dept', type: 'article', pageSize: 100 });
  const gotNext = await D.dailyContent({ reportDate: OTHER, department: 'Edge Dept', type: 'article', pageSize: 100 });
  for (let i = 0; i < edge.length; i++) {
    const inDay = got.rows.some(r => r.title === tagFor(i)), inNext = gotNext.rows.some(r => r.title === tagFor(i));
    // The 15 Mar 17:01 records belong to the 16 Mar report; the 14 Mar 17:00:59 record to the 14 Mar report (neither is asked for here).
    check(`${edge[i][0]} → ${edge[i][2] === 'in' ? 'this report' : 'not this report'}`, inDay === (edge[i][2] === 'in'));
    if (edge[i][0].startsWith('15 Mar 17:01')) check(`${edge[i][0]} → is the first of the next report`, inNext);
  }
  check('the 14 Mar 17:00:59 record belongs to the 14 Mar report', (await D.dailyContent({ reportDate: '2021-03-14', department: 'Edge Dept', type: 'article' })).rows.some(r => r.title === tagFor(0)));
  eq('the summary agrees with the list at the edges', (await D.dailySummary(DAY, { fresh: true })).articlesAdded - baseline, edge.filter(e => e[2] === 'in').length);
  eq('and the next report took exactly its two', (await D.dailySummary(OTHER, { fresh: true })).articlesAdded - baselineOther, 2);

  section('Previous report selection');
  const sOther = await D.dailySummary(OTHER, { fresh: true });
  check('another day shows its own records, not this day\'s', sOther.departments.every(r => r.department === 'Edge Dept'));

  section('Clicked records');
  s = await D.dailySummary(DAY, { fresh: true });
  const agr = await D.dailyContent({ reportDate: DAY, department: 'Agriculture', type: 'all', pageSize: 200 });
  eq('Agriculture (all) returns every kind it was counted for', [agr.total, agr.rows.length], [7, 7]);
  eq('…journals, articles, books', ['journal', 'article', 'book'].map(k => agr.rows.filter(r => r.type === k).length), [1, 5, 1]);
  const agrA = await D.dailyContent({ reportDate: DAY, department: 'Agriculture', type: 'article' });
  eq('the article count returns articles only', [agrA.total, agrA.rows.every(r => r.type === 'article')], [5, true]);
  const agrJ = await D.dailyContent({ reportDate: DAY, department: 'Agriculture', type: 'journal' });
  eq('the journal count returns journals only', [agrJ.total, agrJ.rows.every(r => r.type === 'journal')], [1, true]);
  const agrB = await D.dailyContent({ reportDate: DAY, department: 'Agriculture', type: 'book' });
  eq('the book count returns books only', [agrB.total, agrB.rows.every(r => r.type === 'book')], [1, true]);
  const med = await D.dailyContent({ reportDate: DAY, department: 'Medical Sciences', type: 'article' });
  eq('a department listed under its official name includes records stored under an old spelling', med.rows.length, 2);
  const medOld = await D.dailyContent({ reportDate: DAY, department: 'Medical', type: 'all' });
  eq('and asking by the old spelling gives the same department', medOld.total, 3);
  const un = await D.dailyContent({ reportDate: DAY, department: D.UNASSIGNED, type: 'all' });
  eq('Unassigned lists the records with no department', un.total, 2);
  check('every listed record carries its department and an added-at inside the window', agr.rows.every(r => r.department === 'Agriculture' && new Date(r.addedAt) >= W.start && new Date(r.addedAt) < W.end));
  eq('articles carry their provider, journals their rights basis', [agrA.rows[0].provider, agrJ.rows[0].provider, agrB.rows[0].provider], ['OpenAlex', 'DOAJ declaration', 'DOAB']);
  eq('every row is "Added"', new Set(agr.rows.map(r => r.status)).size, 1);
  for (const r of s.departments) {
    const all = await D.dailyContent({ reportDate: DAY, department: r.department, type: 'all' });
    check(`${r.department}: clicked total (${all.total}) = table total (${r.total})`, all.total === r.total);
    for (const k of ['journal', 'article', 'book'] as const) {
      const n = (r as any)[k + 's']; const c = await D.dailyContent({ reportDate: DAY, department: r.department, type: k });
      if (c.total !== n) check(`${r.department} ${k}s: list ${c.total} ≠ table ${n}`, false);
    }
  }
  const everything = await D.dailyContent({ reportDate: DAY, type: 'all', pageSize: 200 });
  eq('with no department the list is the whole report', everything.total, s.totalAdded);

  section('Pagination');
  const p1 = await D.dailyContent({ reportDate: DAY, type: 'all', page: 1, pageSize: 5 });
  const p2 = await D.dailyContent({ reportDate: DAY, type: 'all', page: 2, pageSize: 5 });
  const p4 = await D.dailyContent({ reportDate: DAY, type: 'all', page: 4, pageSize: 5 });
  eq('pages report the same total', [p1.total, p2.total], [s.totalAdded, s.totalAdded]);
  eq('a full page has pageSize rows', [p1.rows.length, p2.rows.length], [5, 5]);
  check('pages do not overlap', !p1.rows.some(a => p2.rows.some(b => b.id === a.id)));
  eq('the last page holds the remainder', p4.rows.length, s.totalAdded - 15 > 5 ? 5 : s.totalAdded - 15);
  const walked = new Set<string>(); for (let pg = 1; pg <= Math.ceil(s.totalAdded / 5); pg++) (await D.dailyContent({ reportDate: DAY, type: 'all', page: pg, pageSize: 5 })).rows.forEach(r => walked.add(r.id));
  eq('walking every page yields every record exactly once', walked.size, s.totalAdded);
  eq('a page beyond the end is empty, not an error', (await D.dailyContent({ reportDate: DAY, type: 'all', page: 99, pageSize: 5 })).rows.length, 0);
  eq('pageSize is capped', (await D.dailyContent({ reportDate: DAY, type: 'all', pageSize: 100000 })).pageSize, D.MAX_PAGE_SIZE);
  eq('an unknown department is an empty list', (await D.dailyContent({ reportDate: DAY, department: 'Nonexistent Dept', type: 'all' })).total, 0);

  section('Injection safety');
  eq('a hostile department is data, not SQL', (await D.dailyContent({ reportDate: DAY, department: `x'; drop table "Article"; --`, type: 'all' })).total, 0);
  check('the table survived', (await db.article.count()) > 0);

  section('Processing activity (run log, kept apart)');
  const pre = await D.dailySummary(DAY, { fresh: true });
  await run({ at: mid, added: 3, skippedHeld: 20, needsReview: 4, enriched: 2, skippedRejected: 5, skippedFailed: 1 });
  await run({ at: mid, added: 0, skippedHeld: 0, error: 'Provider request failed: fetch failed' });
  await run({ at: new Date(W.end.getTime() + 1000), skippedHeld: 999 });                      // the next cycle
  const proc = (await D.dailySummary(DAY, { fresh: true })).processing;
  eq('runs inside the window are summed, runs outside are not', [proc.runs, proc.alreadyHeld, proc.sentToReview, proc.enriched, proc.refused, proc.failedWrites, proc.providerFailures], [2, 20, 4, 2, 5, 1, 1]);
  eq('run-log "added" never changes the catalogue figures', (await D.dailySummary(DAY, { fresh: true })).totalAdded, pre.totalAdded);

  section('Cache');
  process.env.INGEST_DAILY_LIVE_CACHE_MS = '0';
  const c1 = await D.dailySummary(DAY, { fresh: true });
  check('the clock decides live vs finalized on every call (a 2021 cycle is finalized)', c1.isFinalized && !c1.isCurrentCycle && c1.state === 'finalized');
  const liveNow = D.reportDateAt(new Date());
  const live = await D.dailySummary(liveNow);
  check('today\'s cycle is live and ends at its own 5:01 PM', live.isCurrentCycle && !live.isFinalized && live.windowEnd === D.dailyIngestionWindow(liveNow).end.toISOString());
} finally {
  await cleanup();
  const left = (await db.$queryRawUnsafe(`select (select count(*) from "Article" where title like $1) + (select count(*) from "Book" where title like $1) + (select count(*) from "Journal" where title like $1) n`, `${TAG}%`))[0].n;
  check('the test removed every row it wrote', Number(left) === 0);
  await db.$disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
