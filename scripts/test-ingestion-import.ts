/**
 * Ingestion import & settings tests (dry run, one-off write, mass DOAJ import, settings validation).
 * Runs ONLY against the throwaway database `stm_ingestion_test` — it refuses to start against anything else.
 *
 *   npx tsx scripts/test-ingestion-import.ts
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const dbName = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const { classifyCandidates, summarise, createPreview, loadPreview, commitOneOff, previewToCsv, PreviewError } = await import('../src/lib/ingestion/importService.js');
const { checkDoajCatalogue, importCheckedJournals } = await import('../src/lib/doajCatalogue.js');
const { validateSettings } = await import('../src/lib/ingestion/settings.js');
const { judgeArticle } = await import('../src/lib/ingestion/eligibility.js');
const { canonicalFingerprint, legacyFingerprint } = await import('../src/lib/ingestion/dedup.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const RUN = Date.now().toString(36);
// ISSNs are unique in the database and the test database is never wiped, so each run draws its own.
const rnd4 = () => String(Math.floor(Math.random() * 9000) + 1000);
const B8 = rnd4(), ISSN_A = `${rnd4()}-5678`, ISSN_B1 = `${rnd4()}-1110`, ISSN_B2 = `${rnd4()}-2229`;
const admin = { uid: 'test-admin', email: 'admin@test.invalid' };
const counts = async () => ({ article: await db.article.count(), journal: await db.journal.count(), book: await db.book.count(), publisher: await db.publisher.count() });
const YEAR = new Date().getFullYear();

const cand = (n: number, over: any = {}) => ({
  source: 'OpenAlex', sourceRecordId: `https://openalex.org/${RUN}c${n}`, title: `${RUN} candidate ${n}`, authors: 'A. Author', doi: `10.8888/${RUN}.${n}`,
  pdfUrl: `https://example.org/${RUN}${n}.pdf`, journalName: `Import Journal ${RUN}`, issn: ISSN_A, publisherName: `Import Publisher ${RUN}`,
  volume: 1, issue: 2, year: YEAR, subject: 'Test', openAccess: true, licence: 'cc-by', department: 'Law', fileOpensHere: true, ...over,
});

// ═════════════════════════════════════════════════════════════════════════
section('E. A dry run writes nothing to the catalogue');
const candidates = [
  cand(1), cand(2),
  cand(3, { licence: null }),                               // licence not verifiable → metadata only
  cand(4, { licence: 'cc-by-nc' }),                         // non-commercial → metadata only
  cand(5, { fileOpensHere: false }),                        // file cannot open here → metadata only
  cand(6, { title: 'Untitled' }),                           // refused
  cand(7, { doi: 'not-a-doi' }),                            // malformed identifier → needs review
  cand(8, { year: YEAR + 40 }),                             // implausible year → needs review
];
const before = await counts();
const classified = await classifyCandidates(candidates);
const summary = summarise(classified);
const row = await createPreview('ONE_OFF', admin, { source: 'openalex', departments: ['Law'] }, summary, classified as any);
const after = await counts();
check('no article, journal, book or publisher was created', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
check('only the preview snapshot and an audit entry exist', !!(await db.ingestionPreview.findUnique({ where: { id: row.id } })) && !!(await db.ingestionAudit.findFirst({ where: { action: 'DRY_RUN_CREATED' } })));
check('summary counts are right', summary.found === 8 && summary.eligible === 5 && summary.rejected === 1 && summary.needsReview === 2 && summary.alreadyHeld === 0, JSON.stringify(summary));
check('only the verified, open, licensed record is marked as viewable', summary.viewable === 2 && summary.metadataOnly === 3, `viewable ${summary.viewable}, metadata-only ${summary.metadataOnly}`);

section('H. Rights: what cannot be verified is never served');
const byN = (n: number) => classified.find(c => c.title.endsWith(`candidate ${n}`) || c.doi?.endsWith(`.${n}`))!;
check('commercial-use licence + file that opens → viewable', byN(1).access === 'ViewableHere');
check('licence not verifiable → catalogued with a link only', byN(3).access === 'LinkOnly' && byN(3).licenceVerdict === 'not-verifiable');
check('non-commercial licence → link only', byN(4).access === 'LinkOnly' && byN(4).licenceVerdict === 'non-commercial');
check('a file that does not open from here is not served', byN(5).access === 'LinkOnly');
check('a record with no usable title is refused', byN(6).outcome === 'REJECTED');
check('a malformed DOI goes to review, not into the catalogue', byN(7).outcome === 'NEEDS_REVIEW' && byN(7).status === 'Draft');
check('an implausible year goes to review', byN(8).outcome === 'NEEDS_REVIEW');
check('the CSV carries every row with its outcome and reason', previewToCsv(classified as any).split('\n').length === 9 && /malformed DOI/.test(previewToCsv(classified as any)));
check('a CSV cell that starts like a formula is neutralised', previewToCsv([{ ...(classified[0] as any), title: '=HYPERLINK("x")' }] as any).includes(`"'=HYPERLINK`));

section('F. The one-off import writes only what the preview showed, and checks again first');
// Between the preview and the write, someone adds candidate 2 by another route.
await db.article.create({ data: { title: 'added meanwhile', doi: candidates[1].doi, fingerprint: `doi:${candidates[1].doi}`, status: 'Published', source: 'Admin' } });
const sum = await commitOneOff(row.id, admin, {});
const written = await db.article.findMany({ where: { sourceRecordId: { startsWith: `https://openalex.org/${RUN}c` } } });
check('only the still-eligible records were added', sum.added === 4 && written.length === 4, JSON.stringify(sum));
check('the record someone else added meanwhile was held, not duplicated', sum.held === 1 && (await db.article.count({ where: { doi: candidates[1].doi } })) === 1);
check('records needing review were not written by the one-off import', sum.skippedNeedsReview === 2 && !written.some(w => w.doi === 'not-a-doi'));
check('new records carry source, source id and licence verdict', written.every(w => w.source === 'OpenAlex' && w.sourceRecordId && typeof w.licenceIsNC === 'boolean'));
check('viewable only where it was verified', written.filter(w => w.accessStatus === 'ViewableHere').length === 1 && written.filter(w => w.accessStatus === 'LinkOnly').length === 3, JSON.stringify(written.map(w => w.accessStatus)));
check('every new article got its journal', written.every(w => w.journalId));
check('one journal was created for them, not one per record', (await db.journal.count({ where: { issn: ISSN_A } })) === 1);
let second = ''; try { await commitOneOff(row.id, admin, {}); } catch (e: any) { second = `${e.status}: ${e.message}`; }
check('ingesting the same preview twice is refused (and would add nothing anyway)', /^409/.test(second), second);
check('the audit log records the import', !!(await db.ingestionAudit.findFirst({ where: { action: 'ONE_OFF_IMPORT_STARTED' } })));

section('F2. A failed record can be retried safely; nothing else is touched');
{
  const c2 = await classifyCandidates([cand(20), cand(21)]);
  const r2 = await createPreview('ONE_OFF', admin, { source: 'openalex', departments: ['Law'] }, summarise(c2), c2 as any);
  await commitOneOff(r2.id, admin, {});
  // Pretend the write of the second record had failed, and remove its row so the retry has something to do.
  const items: any[] = (await db.ingestionPreview.findUnique({ where: { id: r2.id } })).items;
  items[1].result = 'failed';
  await db.ingestionPreview.update({ where: { id: r2.id }, data: { items } });
  await db.article.updateMany({ where: { sourceRecordId: items[1].sourceRecordId }, data: { status: 'Rejected' } });   // leave it present but held
  const articles = await db.article.count();
  const retry = await commitOneOff(r2.id, admin, { retryFailed: true });
  check('the retry looked at only the failed record', retry.attempted === 1, JSON.stringify(retry));
  check('the retry added no duplicate', (await db.article.count()) === articles && retry.held === 1);
}

section('G. Already-held records are recognised by every key, and never overwritten');
{
  const d = '10.7777/' + RUN;
  await db.article.create({ data: { title: 'Original title', doi: d, fingerprint: `doi:${d}`, status: 'Published', source: 'OpenAlex', subject: 'KEEP ME' } });
  const noDoi = { title: `${RUN} legacy keyed record`, authors: 'Some Author', year: YEAR };
  await db.article.create({ data: { title: noDoi.title, fingerprint: legacyFingerprint({ source: 'x', ...noDoi })!, status: 'Published', source: 'OpenAlex' } });
  await db.article.create({ data: { title: 'known only by source id', sourceRecordId: `https://openalex.org/${RUN}known`, source: 'OpenAlex', fingerprint: `t:${RUN} known only|${YEAR}`, status: 'Published' } });
  const c3 = await classifyCandidates([
    cand(30, { doi: d, title: 'A different title for the same DOI' }),
    cand(31, { doi: null, title: noDoi.title, authors: noDoi.authors, year: noDoi.year, sourceRecordId: null }),
    cand(32, { sourceRecordId: `https://openalex.org/${RUN}known`, doi: null, title: 'renamed since' }),
  ]);
  check('same DOI → held, whatever the title says', c3[0].outcome === 'HELD');
  check('the one-off import\'s older key is still recognised (no cross-path duplicate)', c3[1].outcome === 'HELD', c3[1].reasons.join());
  check('the source\'s own id is recognised even if title and DOI differ', c3[2].outcome === 'HELD', c3[2].reasons.join());
  check('the held record was not changed by being seen again', (await db.article.findFirst({ where: { doi: d } }))!.subject === 'KEEP ME');
  check('canonical key for a DOI record is the engine\'s existing form', canonicalFingerprint({ source: 'x', doi: 'https://doi.org/10.1/AbC' }) === 'doi:10.1/abc');
}

section('G2. A journal is found by either of its ISSNs, so print and online do not become two journals');
{
  const j = await db.journal.create({ data: { title: `Two ISSNs ${RUN}`, issn: ISSN_B1, eissn: ISSN_B2, status: 'Accepted' } });
  const before2 = await db.journal.count();
  const c4 = await classifyCandidates([cand(40, { issn: ISSN_B2, journalName: `Two ISSNs ${RUN}` })]);
  const r4 = await createPreview('ONE_OFF', admin, { source: 'openalex', departments: ['Law'] }, summarise(c4), c4 as any);
  await commitOneOff(r4.id, admin, {});
  const a = await db.article.findFirst({ where: { sourceRecordId: c4[0].sourceRecordId } });
  check('the article attached to the existing journal', a?.journalId === j.id);
  check('no second journal row was created', (await db.journal.count()) === before2);
}

section('Preview tokens: missing, expired and wrong-kind previews are refused');
{
  const errs: string[] = [];
  for (const id of ['', 'no-such-id']) { try { await loadPreview(id, 'ONE_OFF'); } catch (e: any) { errs.push(String(e.status)); } }
  const old = await db.ingestionPreview.create({ data: { kind: 'ONE_OFF', expiresAt: new Date(Date.now() - 1000), params: {}, summary: {}, items: [] } });
  try { await loadPreview(old.id, 'ONE_OFF'); } catch (e: any) { errs.push(String(e.status)); }
  try { await loadPreview(row.id, 'DOAJ_CATALOGUE'); } catch (e: any) { errs.push(String(e.status)); }
  check('no preview → 400, unknown → 404, expired → 410, wrong kind → 404', errs.join() === '400,404,410,404', errs.join());
}

// ═════════════════════════════════════════════════════════════════════════
section('Mass DOAJ import: check first, then import exactly what the check found');
{
  const H = 'Journal title,Journal ISSN (print version),Journal EISSN (online version),Publisher,Country of publisher,Languages in which the journal accepts manuscripts,Keywords,Subjects,LCC Codes,Journal URL,Journal license,License attributes';
  const line = (t: string, p: string, e: string, lic: string, attr = 'Attribution') => `"${t}",${p},${e},"Pub",Norway,English,,,"TA1-2040",https://x.example,"${lic}","${attr}"`;
  const tag = `m${RUN}`;
  const [i1, i2, i3, i4] = [`7${RUN.slice(-3).replace(/\D/g, '1').padEnd(3, '1')}`, '', '', ''];
  const csv = [
    H,
    line(`New Open Journal ${tag}`, (B8 + '-0011'), (B8 + '-002X'), 'CC BY'),
    line(`New NC Journal ${tag}`, (B8 + '-0037'), '', 'CC BY-NC'),
    line(`Already Held ${tag}`, ISSN_B1, '', 'CC BY'),                       // held by ISSN (created above)
    line(`Two ISSNs ${RUN}`, (B8 + '-0054'), '', 'CC BY'),                           // same TITLE as a held journal, different ISSN
    line(`No ISSN ${tag}`, '', '', 'CC BY'),                                      // unusable
    line(`Dup In File ${tag}`, (B8 + '-0078'), '', 'CC BY'), line(`Dup In File ${tag}`, (B8 + '-0078'), '', 'CC BY'),
  ].join('\n');
  const jBefore = await db.journal.count(); const aBefore = await db.article.count();
  const check1 = await checkDoajCatalogue({ csvText: csv });
  const s = check1.summary;
  check('the check writes nothing', (await db.journal.count()) === jBefore && (await db.article.count()) === aBefore);
  check('classification is reported with real counts', s.inFile === 7 && s.new === 3 && s.alreadyHeld === 2 && s.rejected === 1 && s.needsReview === 1 && s.fullTextEligible === 2 && s.metadataOnly === 1, JSON.stringify({ ...s, byDepartment: undefined }));
  check('"already held" means the same ISSN — a same-named journal is surfaced for review, not hidden', check1.reviewSample.some(r => r.issn === (B8 + '-0054')) && !check1.newIssns.includes((B8 + '-0054')));
  const imp = await importCheckedJournals(check1.newIssns, { csvText: csv });
  check('the import adds exactly the journals the check reported as new', imp.added === 3 && imp.alreadyHeldNow === 0 && (await db.journal.count()) === jBefore + 3, JSON.stringify(imp));
  check('journals the check refused were not added', (await db.journal.count({ where: { issn: { in: [(B8 + '-0054'), ISSN_B1] } } })) === 1);
  const again = await importCheckedJournals(check1.newIssns, { csvText: csv });
  check('running it again adds nothing and changes nothing (idempotent)', again.added === 0 && again.alreadyHeldNow === 3 && (await db.journal.count()) === jBefore + 3);
  const nc = await db.journal.findUnique({ where: { issn: (B8 + '-0037') } });
  check('a non-commercial journal is catalogued as metadata only', nc.status === 'MetadataOnly' && nc.licenceIsNC === true);
  // someone adds a journal between the check and the import
  const csv2 = csv + '\n' + line(`Late Arrival ${tag}`, (B8 + '-0095'), '', 'CC BY');
  const c2 = await checkDoajCatalogue({ csvText: csv2 });
  await db.journal.create({ data: { title: `Taken meanwhile`, issn: (B8 + '-0095'), status: 'MetadataOnly' } });
  const imp2 = await importCheckedJournals(c2.newIssns, { csvText: csv2 });
  check('a journal taken between the check and the import is left exactly as it was', imp2.added === 0 && imp2.alreadyHeldNow === 1 && (await db.journal.findUnique({ where: { issn: (B8 + '-0095') } })).title === 'Taken meanwhile');
}

// ═════════════════════════════════════════════════════════════════════════
section('Settings are validated on the server; clearing a box can no longer change what is saved');
{
  const cur = { enabled: false, yearsBack: 7, batchSize: 200, articlesPerJournal: 30, discoverEvery: 5, focus: 'auto', departments: ['Law'] };
  const D = ['Law', 'Dental', 'Nursing'];
  const bad = (body: any, c = cur) => validateSettings(body, c, D) as any;
  check('NaN is refused', bad({ yearsBack: NaN }).ok === false);
  check('an empty value is refused (it used to become 7)', bad({ yearsBack: '' }).ok === false && bad({ yearsBack: null }).ok === false);
  check('a number as text is refused', bad({ batchSize: '50' }).ok === false);
  check('negative values are refused', bad({ articlesPerJournal: -1 }).ok === false && bad({ discoverEvery: 0 }).ok === false);
  check('a decimal is refused', bad({ yearsBack: 3.5 }).ok === false);
  check('out-of-range values are refused with the range', /between 1 and 50/.test(bad({ yearsBack: 99 }).errors[0]));
  check('"no limit" must be asked for deliberately (0), never reached by clearing a box', bad({ articlesPerJournal: 0 }).ok === true);
  check('unknown focus / unknown department are refused', bad({ focus: 'everything' }).ok === false && bad({ departments: ['Nope'] }).ok === false);
  const run = { ...cur, enabled: true };
  const blocked = bad({ yearsBack: 5 }, run);
  check('tuning is read-only while the engine runs, with the instruction', blocked.ok === false && blocked.status === 409 && blocked.errors[0] === 'Pause the engine to edit ingestion settings.');
  check('…but pausing and editing in one request is allowed', bad({ enabled: false, yearsBack: 5 }, run).ok === true);
  const scope = bad({ departments: ['Law', 'Dental'] }, run);
  check('changing scope while running needs confirmation', scope.ok === false && scope.needsConfirmation === 'SCOPE_CHANGE');
  const ok = bad({ departments: ['Law', 'Dental'], confirmScopeChange: true }, run);
  check('…and is accepted once confirmed, with the change recorded', ok.ok === true && ok.scope.to.length === 2 && ok.changes.departments);
  check('a request that changes nothing changes nothing', Object.keys(bad({ yearsBack: 7, focus: 'auto' }).data).length === 0);
  check('"Use all departments" is an explicit empty scope, not a default', bad({ departments: [] }).ok === true && bad({ departments: [] }).data.departments.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
