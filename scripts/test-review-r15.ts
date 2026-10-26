/**
 * Review automation R1.5: classifier v2 (analysis only), the v1-vs-v2 comparison, and the "Assign Department, Stay Draft" contract.
 * Private throwaway database `stm_review_test` only (same schema; the shared stm_ingestion_test is written by other suites at the same time, so whole-table checks cannot be exact there). Create it once: createdb stm_review_test && DATABASE_URL=.../stm_review_test npx prisma db push.
 *
 *   npx tsx scripts/test-review-r15.ts
 *
 * Proves, in order: v1 is exactly what it was (the engine's behaviour is unchanged); DDC is read conservatively; "rehabilitation" alone is no longer
 * Physiotherapy in v2; the comparison counts what it should, over the database, without changing a book; and the assignment action changes a
 * department and nothing else, revalidates at the moment of writing, and is not reachable from any route. Removes exactly what it created.
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
const C = await import('../src/lib/ingestion/books/classifier.js');
const D = await import('../src/lib/ingestion/ddc.js');
const R = await import('../src/lib/ingestion/reviewClassification.js');
const A = await import('../src/lib/ingestion/reviewAssignment.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
const wait = async () => { while (R.jobState().status === 'running') await new Promise(r => setTimeout(r, 40)); };

// ── 1. v1 is unchanged ──────────────────────────────────────────────────────
section('Classifier v1 is unchanged');
const FIXED = [
  { title: 'Gestational Diabetes', classifications: ['THEMA EDITEUR::M MEDICINE AND NURSING::MJ CLINICAL AND INTERNAL MEDICINE::MJG ENDOCRINOLOGY'], subjects: ['diabetes'] },
  { title: 'Dental Implants', subjects: ['dental implants'] }, { title: 'Dentistry Essentials', classifications: ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'], subjects: ['dentistry', 'oral health'] },
  { title: 'The Rehabilitation of Sexual Offenders', subjects: ['Sex offenders', 'Criminals, rehabilitation, great britain', 'Rehabilitation'] },
  { title: 'A Man Like Mac', subjects: ['Rehabilitation', 'Romance', 'Women runners'] }, { title: 'Physical agents in rehabilitation', subjects: ['Physical Therapy Modalities', 'Rehabilitation'] },
  { title: 'Soro Soke', subjects: ['Current affairs', 'Africa'] }, { title: 'Salud pública y odontología sostenible', subjects: ['odontología'] },
  { title: 'Contract Law', subjects: ['law', 'legal'], description: 'A treatise on the law of contract and litigation.' }, { title: 'Introduction to Algorithms', subjects: ['algorithms', 'programming'], classifications: ['UY'] },
  { title: 'Tidy\'s physiotherapy', subjects: ['Physical therapy'], lcc: ['RM700'] }, { title: 'Nursing', nlm: ['WY 100 W686f'], subjects: ['Nursing Care'] },
  { title: 'Wildlife rehabilitation', subjects: ['Wildlife rehabilitation', 'Wildlife rehabilitators'] },
];
const v1Hash = createHash('sha256').update(JSON.stringify(FIXED.map(i => C.classifyDepartment(i as any)))).digest('hex').slice(0, 16);
// Pinned from the classifier as it stood before R1.5 (the same file also matched byte-for-byte on 6,796 real books in both databases).
eq('v1 verdicts for a fixed set are byte-identical to the pre-R1.5 classifier', v1Hash, 'c54d942f59e28338');
eq('v1 does not read Dewey numbers', JSON.stringify(C.classifyDepartment({ title: 'A book', ddc: ['615.82'] })), JSON.stringify(C.classifyDepartment({ title: 'A book' })));
eq('v1 still reads "rehabilitation" as Physiotherapy (documented, unchanged for the engine)', C.classifyDepartment({ title: 'The Rehabilitation of Sexual Offenders', subjects: ['Rehabilitation'] }).suggested, 'Physiotherapy');
eq('the rules version the engine keys on is still 1', C.CLASSIFIER_RULES_VERSION, 1);
eq('no variant given = v1', JSON.stringify(C.classifyDepartment(FIXED[0] as any)), JSON.stringify(C.classifyDepartment(FIXED[0] as any, { variant: 'v1' })));

// ── 2. DDC ──────────────────────────────────────────────────────────────────
section('Dewey support');
eq('a clean number is read', D.normaliseDdc('615.82'), { code: '615.82', digits: '61582' });
eq('slash segmentation is read', D.normaliseDdc('813/.54'), { code: '813.54', digits: '81354' });
eq('whitespace is tolerated', D.normaliseDdc(' 005.133 ')?.code, '005.133');
for (const bad of ['FIC', '[E]', 'B', '61', '6150', '615.', '615.8x', 'abc', '', '12345', '615,82', '615.82 B', null, undefined, {}]) eq(`malformed ${JSON.stringify(bad)} is ignored`, D.normaliseDdc(bad as any), null);
const dep = (v: any) => D.ddcEvidence(v).department;
eq('615.82 → Physiotherapy', dep(['615.82']), 'Physiotherapy');
eq('615.822076 → Physiotherapy (a subdivision of 615.82)', dep(['615.822076']), 'Physiotherapy');
eq('617.6 → Dental', dep(['617.6']), 'Dental');
eq('610.73 → Nursing', dep(['610.73']), 'Nursing');
eq('615.1 → Pharmacy', dep(['615.1']), 'Pharmacy');
eq('613.71 → Medical Sciences (medicine, broader)', dep(['613.71']), 'Medical Sciences');
eq('005.133 → Computer / IT', dep(['005.133']), 'Computer / IT');
eq('340 → Law', dep(['340']), 'Law');
eq('657 → Commerce (accounting)', dep(['657']), 'Commerce');
eq('658.4 → Management', dep(['658.4']), 'Management');
eq('813.54 → Arts (literature)', dep(['813.54']), 'Arts');
eq('721 → Architecture', dep(['721']), 'Architecture');
eq('639.9 → Life Sciences (conservation, not farming)', dep(['639.9']), 'Life Sciences');
eq('636 → Agriculture', dep(['636']), 'Agriculture');
eq('910 (geography) is known but not a department', [dep(['910']), D.ddcEvidence(['910']).unmapped], [null, 1]);
eq('a specific code beats a broad one: 616.7062 + 615.82076 → Physiotherapy', dep(['616.7062', '615.82076']), 'Physiotherapy');
eq('equally specific codes that disagree are ambiguous → no department', [dep(['340', '370']), D.ddcEvidence(['340', '370']).ambiguous], [null, true]);
eq('a malformed value beside a good one does not spoil it', [dep(['FIC', '615.82']), D.ddcEvidence(['FIC', '615.82']).malformed], ['Physiotherapy', 1]);
eq('only malformed values → nothing, counted', [dep(['FIC', 'B']), D.ddcEvidence(['FIC', 'B']).malformed], [null, 2]);
eq('grade follows specificity', [D.ddcEvidence(['615.82']).grade, D.ddcEvidence(['340']).grade, D.ddcEvidence(['813']).grade], ['specific', 'mid', 'broad']);

section('Dewey in classifier v2');
const physio = { title: 'Physical agents in rehabilitation', subjects: ['Physical Therapy Modalities', 'Physical therapy'], ddc: ['615.82'] };
const v2p = C.classifyDepartment(physio, { variant: 'v2' }), v1p = C.classifyDepartment(physio);
check('v2 counts the Dewey number as a code', v2p.reasons.some(r => r.startsWith('DDC 615.82')) && v2p.families.includes('code'));
check('v1 does not', !v1p.reasons.some(r => r.startsWith('DDC')));
eq('DDC + wording is corroborated: Physiotherapy is strong in v2, words-only in v1', [v2p.band, v1p.band], ['strong', 'review']);
const alone = C.classifyDepartment({ title: 'A book', ddc: ['615.82'] }, { variant: 'v2' });
check('a Dewey number alone is not enough to be strong (nothing corroborates it)', alone.band !== 'strong' && alone.suggested === 'Physiotherapy', JSON.stringify([alone.band, alone.score]));
eq('malformed Dewey data changes nothing', JSON.stringify(C.classifyDepartment({ title: 'Soro Soke', subjects: ['Africa'], ddc: ['FIC', 'B'] }, { variant: 'v2' })), JSON.stringify(C.classifyDepartment({ title: 'Soro Soke', subjects: ['Africa'] }, { variant: 'v2' })));
check('ambiguous Dewey data adds no evidence', !C.classifyDepartment({ title: 'A book', ddc: ['340', '370'] }, { variant: 'v2' }).reasons.some(r => r.startsWith('DDC')));
check('a generic Dewey class (6xx general) counts for the least', C.classifyDepartment({ title: 'A book', ddc: ['602'] }, { variant: 'v2' }).score === 1);

// ── 3. "rehabilitation" ─────────────────────────────────────────────────────
section('Rehabilitation regressions (v2)');
const v2 = (i: any) => C.classifyDepartment(i, { variant: 'v2' });
for (const [label, i] of Object.entries({
  'rehabilitation of sexual offenders': { title: 'The Rehabilitation of Sexual Offenders', subjects: ['Sex offenders', 'Criminals, rehabilitation, great britain', 'Rehabilitation'] },
  'social rehabilitation': { title: 'Social rehabilitation after conflict', subjects: ['Social rehabilitation', 'Peace-building'] },
  'romance fiction tagged rehabilitation': { title: 'A Man Like Mac', subjects: ['Rehabilitation', 'Romance', 'Women runners', 'Fiction, romance, contemporary'] },
  'wildlife rehabilitation': { title: 'Wildlife rehabilitation', subjects: ['Wildlife rehabilitation', 'Wildlife rehabilitators'] },
  'prisoner rehabilitation': { title: 'Prisoner rehabilitation programmes', subjects: ['Rehabilitation'], description: 'Rehabilitation and rehabilitation again.' },
})) check(`${label} is not Physiotherapy`, v2(i).suggested !== 'Physiotherapy', JSON.stringify([v2(i).suggested, v2(i).score]));
for (const [label, i] of Object.entries({
  physiotherapy: { title: 'Principles of Physiotherapy' }, 'physical rehabilitation': { title: 'Physical rehabilitation after stroke' },
  'musculoskeletal rehabilitation': { title: 'Musculoskeletal rehabilitation' }, neurorehabilitation: { title: 'Neurorehabilitation' }, 'neuro-rehabilitation': { title: 'Advances in neuro-rehabilitation' },
  'sports rehabilitation': { title: 'Sports rehabilitation handbook' }, 'physical therapy as a subject': { title: 'Tidy\'s physiotherapy', subjects: ['Physical Therapy Modalities'] },
})) check(`${label} is still Physiotherapy`, v2(i).suggested === 'Physiotherapy', JSON.stringify([v2(i).suggested, v2(i).score]));
// "physical therapy" also contains the word "therapy", which Medical Sciences matches, so the two tie on a title alone (v1 does the same); it stays a candidate.
const pt = v2({ title: 'Introduction to physical therapy' });
check('"physical therapy" is still Physiotherapy wording (a candidate, tied with Medical Sciences exactly as in v1)', [pt.suggested, pt.runnerUp?.department].includes('Physiotherapy') && pt.score === C.classifyDepartment({ title: 'Introduction to physical therapy' }).score);
check('v1 gave the false positive (so the fix is what changed it)', C.classifyDepartment({ title: 'A Man Like Mac', subjects: ['Rehabilitation', 'Romance'] }).suggested === 'Physiotherapy');

// ── 4. The comparison, with no database ─────────────────────────────────────
section('Comparison arithmetic');
const row = (o: any): any => ({ id: 'x', dept: 'Law', score: 8, margin: 4, next: null, nextScore: 0, fam: 3, tier: 'high', ddcUsed: false, source: 'S', year: 2021, licence: 'Open licence', lang: 'en', storedDept: null, storedScore: null, ...o });
const pair = (v1: any, v2: any, extra: any = {}) => ({ v1: row({ id: Math.random().toString(36), ...v1 }), v2: row({ id: Math.random().toString(36), ...v2 }), title: 'T', ddcValues: [], rehabText: '', ...extra });
const pairs = [
  pair({ tier: 'low', dept: 'Arts' }, { tier: 'high', dept: 'Arts', ddcUsed: true }, { ddcValues: ['813'] }),
  pair({ tier: 'medium', dept: 'Law' }, { tier: 'high', dept: 'Law' }),
  pair({ tier: 'unclassifiable', dept: null, score: 0 }, { tier: 'high', dept: 'Dental', ddcUsed: true }),
  pair({ tier: 'high', dept: 'Physiotherapy', source: 'OL' }, { tier: 'low', dept: 'Arts', source: 'OL' }, { rehabText: 'Rehabilitation of offenders' }),
  pair({ tier: 'medium', dept: 'Law' }, { tier: 'medium', dept: 'Arts' }),
  pair({ tier: 'medium', dept: 'Law' }, { tier: 'medium', dept: 'Law' }, { ddcValues: ['FIC', '615.82'] }),
  pair({ tier: 'high', dept: 'Law' }, { tier: 'low', dept: 'Law', score: 5 }),
];
const cmp = R.compareJudgements(pairs, { startedAt: new Date(), queueTotal: 7 });
eq('v1 tiers', cmp.v1Tiers, { high: 2, medium: 3, low: 1, unclassifiable: 1 });
eq('v2 tiers', cmp.v2Tiers, { high: 3, medium: 2, low: 2, unclassifiable: 0 });
eq('upgraded, upgraded to High, and from Low/Medium specifically', [cmp.upgraded, cmp.upgradedToHigh, cmp.upgradedToHighFromLowOrMedium], [3, 3, 2]);
eq('downgraded', cmp.downgraded, 2);
eq('suggested department changed', cmp.changedDepartment, 3);
eq('transitions add up to analysed', Object.values(cmp.transitions).reduce((a: number, t: any) => a + Object.values(t).reduce((x: number, y: any) => x + y, 0), 0), 7);
eq('DDC-supported classifications and those changed because of it', [cmp.ddc.supportedClassifications, cmp.ddc.changedBecauseOfDdc], [2, 1]);
eq('records carrying Dewey data, and malformed ones', [cmp.ddc.withDdc, cmp.ddc.malformed], [2, 1]);
eq('rehabilitation false positives removed', cmp.rehabilitation.falsePositivesRemoved, 1);
eq('provider breakdown', [cmp.byProvider.OL.analysed, cmp.byProvider.OL.rehabilitationRemoved, cmp.byProvider.S.v2High], [1, 1, 3]);
check('department moves list the biggest first', cmp.departmentMoves.length > 0 && cmp.departmentMoves.every((m, i, a) => i === 0 || a[i - 1].n >= m.n));
const many = R.compareJudgements(Array.from({ length: 200 }, () => pair({ tier: 'low', dept: 'Arts' }, { tier: 'high', dept: 'Arts' })), { startedAt: new Date(), queueTotal: 200 });
eq('the sample is bounded per kind', many.sample.length, 20);

// ── 5. Against the database ─────────────────────────────────────────────────
section('Comparison over the database');
const TAG = `r15-${Date.now().toString(36)}`;
const made: string[] = [];
const seed = async (title: string, o: any = {}) => {
  const b = await db.book.create({ data: { title: `${TAG} ${title}`, status: o.status ?? 'Draft', ownershipSource: o.ownership ?? 'Ingested', source: o.source ?? 'OpenLibrary', year: 2021, licence: o.licence ?? 'CC BY', licenceIsNC: false,
    accessType: 'OpenAccess', accessStatus: 'MetadataOnly', rightsStatus: 'MetadataOnly', language: 'en', domain: o.domain ?? null, rejectionNote: o.note ?? null,
    metadata: { sourceKeep: { a: 1 }, harvest: { classifications: o.codes || [], keywords: o.kw || [], provider: { ddc: o.ddc || [], ...(o.provider || {}) }, department: { band: 'review', score: 1, suggested: 'Arts', runnerUp: null } } } } });
  made.push(b.id); return b.id;
};
const dental = ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'];
const idRehab = await seed('The Rehabilitation of Sexual Offenders', { kw: ['Sex offenders', 'Rehabilitation'] });
const idDdc = await seed('Physical agents in rehabilitation', { kw: ['Physical Therapy Modalities', 'Physical therapy'], ddc: ['615.82'] });
const idBad = await seed('A book of poems', { kw: ['poetry'], ddc: ['FIC', 'B'] });
const idDental = await seed('Dentistry Essentials', { codes: dental, kw: ['dentistry', 'oral health'], source: 'DOAB' });

const strip = async () => {
  const rows: any[] = await db.$queryRawUnsafe(`select id, title, status, domain, licence, "licenceIsNC", "accessType", "accessStatus", "rightsStatus", "rejectionNote", metadata::text m from "Book" order by id`);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
};
const baseline = await strip();
const counts0 = (await db.$queryRawUnsafe(`select (select count(*)::int from "Book") b, (select count(*)::int from "Journal") j, (select count(*)::int from "Article") a`))[0];
const stateBefore = JSON.stringify(await db.ingestionState.findMany());

R.__resetClassification();
check('the comparison starts', R.startComparison({ email: 't@example.com' }) === true);
check('and refuses a second run (or an analysis) while it is going', R.startComparison(null) === false && R.startAnalysis(null) === false);
eq('the job says what it is doing', R.jobState().mode, 'comparison');
await wait();
eq('the job finished', R.jobState().status, 'done');
const K = (await R.loadComparison())!;
check('the comparison is persisted', !!K && K.analysed > 0);
const [direct] = await db.$queryRawUnsafe(`select count(*)::int n from "Book" where status='Draft' and "ownershipSource"='Ingested' and domain is null and "rejectionNote" is null`);
eq('analysed = a direct count of the queue', K.analysed, direct.n);
eq('v1 tiers add up to analysed', Object.values(K.v1Tiers).reduce((a: number, b: any) => a + b, 0), K.analysed);
eq('v2 tiers add up to analysed', Object.values(K.v2Tiers).reduce((a: number, b: any) => a + b, 0), K.analysed);
check('the seeded rehabilitation false positive was found and removed', K.rehabilitation.falsePositivesRemoved >= 1);
check('the seeded Dewey book is counted as Dewey-supported', K.ddc.supportedClassifications >= 1);
check('the seeded malformed Dewey values are counted', K.ddc.malformed >= 1);
check('the sample is bounded and carries both verdicts and v2\'s reasons', K.sample.length <= 100 && K.sample.every(s => s.v1 && s.v2 && Array.isArray(s.why)) && K.sample.some(s => s.why.length > 0));
const physioSample = K.sample.find(s => s.id === idDdc);
check('the Dewey physio book moved up under v2', !!physioSample ? physioSample.v2.tier === 'high' || physioSample.v2.score > physioSample.v1.score : K.upgraded >= 1);
check('the summary is a bounded size, not a dump of the queue', JSON.stringify(K).length < 120_000, `${JSON.stringify(K).length} bytes`);
eq('no Book changed in department, status, licence, access, rights, rejection note or metadata', await strip(), baseline);
const counts1 = (await db.$queryRawUnsafe(`select (select count(*)::int from "Book") b, (select count(*)::int from "Journal") j, (select count(*)::int from "Article") a`))[0];
eq('no Book, Journal or Article added or removed', counts1, counts0);
eq('the ingestion state is untouched', JSON.stringify(await db.ingestionState.findMany()), stateBefore);

// ── 6. Assign Department, Stay Draft ────────────────────────────────────────
section('Assign Department, Stay Draft');
const HIGH = { classifier: 'v1' as const, tiers: ['high' as const] };
const row1 = async (id: string) => (await db.$queryRawUnsafe(`select * from "Book" where id = $1`, id))[0];
const strict = (r: any) => { const { domain, updatedAt, metadata, ...rest } = r; const { reviewAssignment, ...meta } = metadata || {}; return JSON.stringify({ rest, meta }); };
const by = { email: 'admin@example.com' };

const before = await row1(idDental);
const dry = await A.assignDepartmentStayDraft({ bookId: idDental, department: 'Dental', basis: 'classifier', rule: HIGH, source: 'test', by }, { dryRun: true });
eq('a dry run says it would assign…', [dry.result, (dry as any).tier], ['assigned', 'high']);
eq('…and writes nothing', (await row1(idDental)).domain, null);

const done = await A.assignDepartmentStayDraft({ bookId: idDental, department: 'Dental', basis: 'classifier', rule: HIGH, source: 'high-confidence', by });
eq('a high-confidence book is assigned', [done.result, (done as any).department], ['assigned', 'Dental']);
const after = await row1(idDental);
eq('department is set', after.domain, 'Dental');
eq('it STAYS a Draft (not published)', after.status, 'Draft');
eq('licence, access, rights and rejection state are exactly as they were', [after.licence, after.licenceIsNC, after.accessType, after.accessStatus, after.rightsStatus, after.rejectionNote], [before.licence, before.licenceIsNC, before.accessType, before.accessStatus, before.rightsStatus, before.rejectionNote]);
eq('every other column and metadata key is untouched', strict(after), strict(before));
const ra = after.metadata.reviewAssignment;
eq('the assignment records score, tier, classifier, version, source and who', [ra.department, ra.tier, typeof ra.score, ra.classifier, ra.source, ra.by, !!ra.at], ['Dental', 'high', 'number', { variant: 'v1', version: 1 }, 'high-confidence', 'admin@example.com', true]);
eq('assigning again is refused: it already has a department', (await A.assignDepartmentStayDraft({ bookId: idDental, department: 'Law', basis: 'person', source: 'single', by })), { bookId: idDental, result: 'skipped', reason: 'already-has-department', detail: 'Dental' });

const refused = async (label: string, req: any, reason: string) => { const o: any = await A.assignDepartmentStayDraft({ source: 'test', by, ...req }); eq(label, [o.result, o.reason], ['skipped', reason]); };
await refused('a book that does not exist is skipped', { bookId: 'nope', department: 'Dental', basis: 'person' }, 'not-found');
await refused('an unknown department is refused', { bookId: idBad, department: 'Underwater Basket Weaving', basis: 'person' }, 'unknown-department');
await refused('a classifier assignment with no approved rule is refused', { bookId: idBad, department: 'Arts', basis: 'classifier' }, 'rule-required');
const idPub = await seed('Published already', { status: 'Published', kw: ['dentistry'], codes: dental });
await refused('a Published book is never touched', { bookId: idPub, department: 'Dental', basis: 'person' }, 'not-a-draft');
const idRej = await seed('Rejected', { status: 'Rejected', note: 'dup' });
await refused('a Rejected book is never touched', { bookId: idRej, department: 'Dental', basis: 'person' }, 'rejected');
const idNote = await seed('Draft with a note', { note: 'dup' });
await refused('a Draft carrying a rejection note is never touched', { bookId: idNote, department: 'Dental', basis: 'person' }, 'rejected');
const idPubl = await seed('Publisher submission', { ownership: 'PublisherSubmitted' });
await refused('a publisher\'s own submission is never touched', { bookId: idPubl, department: 'Dental', basis: 'person' }, 'not-ingested');
const idMan = await seed('Placed by hand', { domain: 'Law' });
await refused('a manually assigned department is never overwritten', { bookId: idMan, department: 'Dental', basis: 'person' }, 'already-has-department');
eq('…and it is still Law', (await row1(idMan)).domain, 'Law');

// Stale analysis: judged High earlier, evidence gone now.
const idStale = await seed('Dentistry Essentials 2', { codes: dental, kw: ['dentistry', 'oral health'] });
eq('before: it is High', R.judge(await R.readOneForJudging(idStale)).tier, 'high');
await db.$executeRawUnsafe(`update "Book" set metadata = jsonb_set(metadata, '{harvest,classifications}', '[]'::jsonb) where id = $1`, idStale);
await refused('a book whose evidence changed since the analysis no longer qualifies', { bookId: idStale, department: 'Dental', basis: 'classifier', rule: HIGH }, 'below-rule');
eq('…and nothing was written', (await row1(idStale)).domain, null);
await refused('asking for a department the classifier no longer suggests is skipped', { bookId: idDdc, department: 'Law', basis: 'classifier', rule: { classifier: 'v2', tiers: ['high', 'medium', 'low'] } }, 'classification-changed');
const lowV1 = await A.assignDepartmentStayDraft({ bookId: idDdc, department: 'Physiotherapy', basis: 'classifier', rule: HIGH, source: 'test', by }, { dryRun: true });
eq('the rule is about a classifier: this book is not High under v1…', (lowV1 as any).reason, 'below-rule');
const hiV2 = await A.assignDepartmentStayDraft({ bookId: idDdc, department: 'Physiotherapy', basis: 'classifier', rule: { classifier: 'v2', tiers: ['high'] }, source: 'test', by }, { dryRun: true });
eq('…but is High under v2 (analysis classifier), if v2 is the approved rule', (hiV2 as any).result, 'assigned');
const person = await A.assignDepartmentStayDraft({ bookId: idBad, department: 'Arts', basis: 'person', source: 'batch-chosen', by });
eq('a department chosen by a person is assigned without a classifier gate, and recorded as such', [person.result, (await row1(idBad)).metadata.reviewAssignment.basis, (await row1(idBad)).status], ['assigned', 'person', 'Draft']);
const idRace = await seed('Dentistry Essentials 3', { codes: dental, kw: ['dentistry', 'oral health'] });
const race = await Promise.all([1, 2, 3].map(() => A.assignDepartmentStayDraft({ bookId: idRace, department: 'Dental', basis: 'classifier', rule: HIGH, source: 'test', by })));
eq('three simultaneous requests for one book: exactly one writes', race.filter(o => o.result === 'assigned').length, 1);
check('…and the others were refused rather than overwriting', race.filter(o => o.result === 'skipped').every((o: any) => ['already-has-department', 'changed-during-assignment'].includes(o.reason)));
eq('the ingestion state is still untouched after all assignments', JSON.stringify(await db.ingestionState.findMany()), stateBefore);
eq('no book was published by any of it', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Published'`, made))[0].n, 1 /* only the one seeded as Published */);
check('nothing in server.ts can call it (not wired to any route)', !/reviewAssignment/.test(readFileSync(new URL('../server.ts', import.meta.url), 'utf8')));

// ── clean up exactly what this run created ──────────────────────────────────
await db.book.deleteMany({ where: { id: { in: made } } });
await db.appSetting.deleteMany({ where: { key: { in: ['REVIEW_CLASSIFICATION_ANALYSIS', 'REVIEW_CLASSIFICATION_COMPARISON'] } } });
eq('everything seeded was removed', await db.book.count({ where: { title: { startsWith: TAG } } }), 0);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
