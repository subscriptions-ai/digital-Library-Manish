/**
 * Publication-year policy per kind of content: articles 2020+, books 2000+ (older → review, never refused), journal titles no rule.
 * Pure checks, plus the REAL book harvest against a fake feed on the throwaway database `stm_ingestion_test` (refuses anything else).
 *
 *   npx tsx scripts/test-year-policy.ts
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const Y = await import('../src/lib/ingestion/yearPolicy.js');
const { judgeArticle } = await import('../src/lib/ingestion/eligibility.js');
const { validateSettings } = await import('../src/lib/ingestion/settings.js');
const { harvestFeed, DOAB_OAI } = await import('../src/lib/ingestion/books/oaiHarvest.js');
const { fetchOpenLibraryPage } = await import('../src/lib/ingestion/books/openLibrary.js');
const { __useFetchForTests, __useSleepForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const { doajRowToJournal } = await import('../src/lib/doajCatalogue.js');
const { INGESTION_POLICY } = await import('../src/lib/ingestion/policy.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + JSON.stringify(detail).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {});
const RUN = Date.now().toString(36);

// ── the fake network ──
const requested: string[] = [];
let feed: any[] = [];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (v: string) => `<field name="value">${esc(v)}</field>`;
const rec = (s: any) => `<record><header><identifier>oai:doab:${s.handle}</identifier><datestamp>2026-10-01T00:00:00Z</datestamp></header><metadata><metadata xmlns="http://www.lyncode.com/xoai">
<element name="dc"><element name="title"><element name="en_US">${f(s.title)}</element></element>
<element name="contributor"><element name="author"><element name="none">${f('Gehl, Jan')}</element></element></element>
${s.year ? `<element name="date"><element name="issued"><element name="none">${f(s.year)}</element></element></element>` : ''}
<element name="language"><element name="en_US">${f('eng')}</element></element>
<element name="subject"><element name="classification"><element name="en_US">${f('THEMA EDITEUR::A THE ARTS::AM ARCHITECTURE')}</element></element><element name="other"><element name="en_US">${f('architecture; urban design')}</element></element></element>
</element>
<element name="oapen"><element name="relation"><element name="isbn"><element name="en_US">${f(s.isbn)}</element></element></element></element>
<element name="bundles"><element name="bundle"><field name="name">THUMBNAIL</field><element name="bitstreams"><element name="bitstream"><field name="format">image/jpeg</field><field name="url">https://x/cover.jpg</field><field name="rights">CC-BY</field></element></element></element></element>
<element name="linkedItemsMetadata"><element name="publisher.name">${f('Test Press')}</element></element>
</metadata></metadata></record>`;
__useFetchForTests((async (url: string) => {
  requested.push(url);
  if (url.includes('openlibrary.org')) return new Response(JSON.stringify({ numFound: 0, docs: [] }), { status: 200 });
  return new Response(`<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><ListRecords>${feed.map(rec).join('')}<resumptionToken completeListSize="${feed.length}"/></ListRecords></OAI-PMH>`, { status: 200 });
}) as any);

try {
  section('The rules, as functions');
  check('Article 2018: not eligible for the current article workflow', Y.articleYearVerdict(2018, 2020).outcome === 'too-old');
  check('Article 2024: eligible', Y.articleYearVerdict(2024, 2020).ok === true);
  check('Article with no year: review, never this year by default', Y.articleYearVerdict(null, 2020).outcome === 'no-year');
  for (const y of [2005, 2015, 2025]) check(`Book ${y}: eligible`, Y.bookYearVerdict(y, 2000).ok === true);
  check('Book 1995: review / manual exception — not refused', Y.bookYearVerdict(1995, 2000).outcome === 'older' && /approve/.test(Y.bookYearVerdict(1995, 2000).reason || ''));
  check('Book with no year: review', Y.bookYearVerdict(undefined, 2000).outcome === 'no-year');
  check('defaults: articles 2020, books 2000', Y.articleMinYear(null) === 2020 && Y.bookMinYear(null) === 2000 && Y.articleMinYear({ articleMinYear: 2021 }) === 2021);
  check('a saved value outside sense falls back to the default (never "no rule")', Y.articleMinYear({ articleMinYear: 'x' }) === 2020 && Y.bookMinYear({ bookMinYear: 3000 }) === 2000);

  section('Articles: the shared judge applies the article year');
  check('a 2018 article is not written (REJECTED, with the reason)', (() => { const d = judgeArticle({ title: 'Old paper', year: 2018, licence: 'CC BY' }, { minYear: 2020 }); return d.outcome === 'REJECTED' && /2018/.test(d.reasons.join(' ')); })());
  check('a 2024 article goes on to the normal checks', judgeArticle({ title: 'New paper', year: 2024, licence: 'CC BY' }, { minYear: 2020 }).outcome !== 'REJECTED');
  check('an article with no year waits for review as a Draft', (() => { const d = judgeArticle({ title: 'Undated', year: null, licence: 'CC BY' }, { minYear: 2020 }); return d.outcome === 'NEEDS_REVIEW' && d.status === 'Draft'; })());
  check('with no year passed in, the judge still uses the default (2020), never "no rule"', judgeArticle({ title: 'Old', year: 2019 }, {}).outcome === 'REJECTED');

  section('Journals: no year rule for the title itself');
  const j = doajRowToJournal({ 'Journal title': 'Founded In 1985 Review', 'Journal ISSN (print version)': '0123-4567', 'Journal license': 'CC BY', 'Keywords': 'law', 'LCC Codes': '' } as any);
  check('a journal founded in 1985 is a valid journal record (nothing in the journal path reads a founding year)', !!j && j.status === 'Accepted');
  check('its 2024 article is eligible under the article rule', judgeArticle({ title: 'A 2024 article', year: 2024, licence: 'CC BY' }, { journal: { licenceIsNC: false, rightsBasis: 'DOAJ declaration' }, minYear: 2020 }).outcome === 'ADD');

  section('Settings: two separate, validated values replace "Years to collect"');
  const cur = { enabled: false, articleMinYear: 2020, bookMinYear: 2000, journalsPerPass: 200, articlesPerPass: 100, booksPerPass: 200, articlesPerJournal: 30, discoverEvery: 5, batchSize: 100, departments: [] };
  const ok = validateSettings({ articleMinYear: 2021, bookMinYear: 1998 }, cur, []);
  check('both can be set, each on its own', ok.ok && (ok as any).data.articleMinYear === 2021 && (ok as any).data.bookMinYear === 1998);
  const bad = validateSettings({ articleMinYear: 1800, bookMinYear: 2.5 }, cur, []);
  check('out-of-range or fractional values are refused with their own names', !bad.ok && (bad as any).errors.some((e: string) => /article/i.test(e)) && (bad as any).errors.some((e: string) => /book/i.test(e)), (bad as any).errors);
  check('the old "Years to collect" is no longer a setting (sending it changes nothing)', (() => { const r = validateSettings({ yearsBack: 3 }, cur, []); return r.ok && !('yearsBack' in (r as any).data); })());
  check('the limits the screen shows come from the server', !!INGESTION_POLICY.settings.articleMinYear && !!INGESTION_POLICY.settings.bookMinYear);

  section('Books: the REAL harvest applies the book year (2000+), and holds older/undated books for review');
  await db.book.deleteMany({ where: { title: { startsWith: `${RUN} ` } } });
  await db.ingestionSourceHealth.deleteMany({ where: { source: 'DOAB' } });            // test database only: another suite may have left DOAB resting
  const isbns = ['9780306406157', '9783161484100', '9780198526636', '9780262033848', '9780131103627'];
  feed = [
    { handle: `20.500.12854/${RUN}1`, title: `${RUN} Architecture of Cities 2005`, year: '2005-01-01', isbn: isbns[0] },
    { handle: `20.500.12854/${RUN}2`, title: `${RUN} Architecture and Housing 2015`, year: '2015-01-01', isbn: isbns[1] },
    { handle: `20.500.12854/${RUN}3`, title: `${RUN} Architecture Now 2025`, year: '2025-01-01', isbn: isbns[2] },
    { handle: `20.500.12854/${RUN}4`, title: `${RUN} Classic Architecture Reference 1995`, year: '1995-01-01', isbn: isbns[3] },
    { handle: `20.500.12854/${RUN}5`, title: `${RUN} Undated Architecture Notes`, year: '', isbn: isbns[4] },
  ];
  const r = await harvestFeed(DOAB_OAI, { manual: true, ignoreCheckpoint: true, startToken: null, from: null, maxPages: 1, pageDelayMs: 0, bookMinYear: 2000 });
  console.log("      harvest:", JSON.stringify({ f: r.fetched, p: r.pages, e: r.sourceError, d: r.duplicates, a: r.added, q: r.queuedForReview, dep: r.department, os: r.outsideScope }));
  const got = async (t: string) => db.book.findFirst({ where: { title: `${RUN} ${t}` } });
  for (const [t, y] of [['Architecture of Cities 2005', 2005], ['Architecture and Housing 2015', 2015], ['Architecture Now 2025', 2025]] as const) {
    const b = await got(t);
    check(`Book ${y}: published the normal way (Architecture)`, b?.status === 'Published' && b?.domain === 'Architecture', b && { s: b.status, d: b.domain });
  }
  const old = await got('Classic Architecture Reference 1995');
  check('Book 1995: NOT refused — written as a Draft for review, with the reason the reviewer will see', old?.status === 'Draft' && old?.year === 1995 && (old?.metadata as any)?.harvest?.yearPolicy?.outcome === 'older', old && { s: old.status, y: old.year, m: (old.metadata as any)?.harvest?.yearPolicy });
  const undated = await got('Undated Architecture Notes');
  check('Book with no year: Draft for review — and no year was invented for it', undated?.status === 'Draft' && undated?.year === null && (undated?.metadata as any)?.harvest?.yearPolicy?.outcome === 'no-year');
  check('the report counts them as held for the year policy, apart from anything else', r.heldForYear.older === 1 && r.heldForYear.noYear === 1 && r.added === 3, r.heldForYear);
  check('a 25-year-old book is inside the policy (2001 in 2026)', Y.bookYearVerdict(new Date().getFullYear() - 25, 2000).ok === true);

  section('Book exception: a person can approve the 1995 classic without changing the policy');
  await db.book.update({ where: { id: old.id }, data: { status: 'Published', domain: 'Architecture' } });   // what the review queue's Approve does
  check('approved, it is published — and the policy year is still 2000', (await got('Classic Architecture Reference 1995'))?.status === 'Published' && Y.bookMinYear(await db.ingestionState.findUnique({ where: { id: 'singleton' } })) === 2000);

  section('Provider queries ask for the right years where the provider can filter');
  requested.length = 0;
  await fetchOpenLibraryPage('architecture', 1, 20, 2000);
  check('Open Library is asked for books first published 2000 onward', decodeURIComponent(requested[0] || '').includes('first_publish_year:[2000 TO *]'), requested[0]);
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}`);
} finally {
  await db.book.deleteMany({ where: { title: { startsWith: `${RUN} ` } } });
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
