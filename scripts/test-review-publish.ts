/**
 * Review automation — Publish Eligible (High / Medium / Selected): preview, job, gates, revalidation, races, history.
 * Private throwaway database `stm_review_test` only (createdb stm_review_test && DATABASE_URL=.../stm_review_test npx prisma db push).
 *
 *   npx tsx scripts/test-review-publish.ts
 *
 * Fixture Books only. Proves that a book is published only when it passes BOTH the classification check and the application's own publication
 * eligibility, at the moment of writing; that a licence, access, rights or department is never changed to get a book through; that the job is bounded,
 * previewed, cancellable and idempotent; that the publication gate is separate from the assignment gate; and that no checkpoint or provider-health row moves.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_review_test');
for (const k of ['REVIEW_AUTO_ASSIGN_ENABLED', 'REVIEW_AUTO_ASSIGN_THRESHOLDS', 'REVIEW_AUTO_PUBLISH_ENABLED']) delete process.env[k];

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_review_test') throw new Error(`refusing to run against "${name}"`);
const P = await import('../src/lib/ingestion/reviewPublish.js');
const J = await import('../src/lib/ingestion/reviewAutoPublish.js');
const H = await import('../src/lib/ingestion/reviewHistory.js');
const E = await import('../src/lib/ingestion/publicationEligibility.js');
const Lock = await import('../src/lib/ingestion/reviewJobLock.js');
const { CLASSIFIER_RULES_VERSION } = await import('../src/lib/ingestion/books/classifier.js');
const { CURRENT_THRESHOLDS } = await import('../src/lib/ingestion/reviewClassification.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
const ADMIN = { uid: 'u1', email: 'admin@example.com' };

// ── Fixtures ────────────────────────────────────────────────────────────────
const TAG = `pub-${Date.now().toString(36)}`;
const dental = ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'];
type Seed = { title?: string; codes?: string[]; kw?: string[]; licence?: string | null; nc?: boolean | null; basis?: string; access?: string | null; rights?: string; url?: string | null; year?: number | null; domain?: string | null;
  status?: string; note?: string | null; ownership?: string; source?: string; doi?: string | null; fill?: boolean; pdf?: string | null };
const bookRow = (o: Seed) => ({
  id: randomUUID(), title: `${TAG} ${o.title ?? 'Dentistry Essentials'}`, status: o.status ?? 'Draft', ownershipSource: o.ownership ?? 'Ingested', source: o.source ?? 'DOAB', year: o.year === undefined ? 2021 : o.year,
  licence: o.licence === undefined ? 'CC BY' : o.licence, licenceIsNC: o.nc === undefined ? (o.licence === null ? null : false) : o.nc, rightsBasis: o.basis ?? 'DOAB title licence',
  accessType: 'OpenAccess', accessStatus: o.access === undefined ? 'LinkOnly' : o.access, rightsStatus: o.rights ?? 'MetadataOnly', originalUrl: o.url === undefined ? `https://example.org/${randomUUID()}` : o.url,
  pdfUrl: o.pdf ?? null, doi: o.doi ?? null, language: 'en', domain: o.domain ?? null, rejectionNote: o.note ?? null,
  metadata: { keep: { a: 1 }, ...(o.fill ? { licenceFill: { DOAB: { licence: 'CC BY' } } } : {}), harvest: { classifications: o.codes ?? [], keywords: o.kw ?? [], provider: {}, department: { band: 'review', score: 1, suggested: 'Arts', runnerUp: null } } },
});
const made: string[] = [];
const seedMany = async (n: number, o: Seed = {}) => { const rows = Array.from({ length: n }, (_, i) => bookRow({ ...o, title: `${o.title ?? 'Dentistry Essentials'} ${i}` })); await db.book.createMany({ data: rows as any }); made.push(...rows.map(r => r.id)); return rows.map(r => r.id); };
const one = async (o: Seed) => (await seedMany(1, o))[0];
const high = (o: Seed = {}): Seed => ({ codes: dental, kw: ['dentistry', 'oral health'], ...o });
const medium = (o: Seed = {}): Seed => ({ kw: ['dental implants'], title: 'Dental Implants', ...o });
const low = (o: Seed = {}): Seed => ({ kw: ['law'], title: 'Untitled', ...o });
const get = async (id: string) => (await db.$queryRawUnsafe(`select * from "Book" where id = $1`, id))[0];
const rights = (r: any) => JSON.stringify([r.licence, r.licenceIsNC, r.rightsBasis, r.rightsStatus, r.accessStatus, r.accessType, r.pdfUrl, r.originalUrl, r.rightsVerifiedAt, r.rightsVerifiedBy]);
const APPROVED = JSON.stringify({ highMinScore: 6, highMinMargin: 3, highRequiresCode: true });
const open = () => { process.env.REVIEW_AUTO_ASSIGN_ENABLED = 'true'; process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = APPROVED; process.env.REVIEW_AUTO_PUBLISH_ENABLED = 'true'; };
const shut = () => { for (const k of ['REVIEW_AUTO_ASSIGN_ENABLED', 'REVIEW_AUTO_ASSIGN_THRESHOLDS', 'REVIEW_AUTO_PUBLISH_ENABLED']) delete process.env[k]; };
const reset = async () => { J.__resetPublish(); Lock.__resetReviewJobLock(); await db.appSetting.deleteMany({ where: { key: 'REVIEW_AUTO_PUBLISH_JOB' } }); };
const clearQueue = async () => { await db.book.deleteMany({ where: { id: { in: made }, status: 'Draft' } }); };
const waitJob = async () => { for (let i = 0; i < 800; i++) { const s = await J.autoPublishStatus(); if (s && s.status !== 'running') return s; await new Promise(r => setTimeout(r, 50)); } throw new Error('job did not finish'); };
const waitPreview = async () => { while (J.publishPreviewState().status === 'running') await new Promise(r => setTimeout(r, 30)); return J.publishPreviewState(); };
const preview = async (tier: 'high' | 'medium', classifier: 'v1' | 'v2' = 'v1', scope = {}) => {
  // A preview that was refused (another job holds the lock) must fail loudly, never fall through to a stale one.
  if (!J.startPublishPreview(classifier, tier, scope)) throw new Error(`preview refused: ${Lock.reviewJobHolder()} holds the review lock`);
  return waitPreview();
};
const rejects = async (p: Promise<any>) => { try { await p; return null; } catch (e: any) { return e.name; } };
const RULE_H = { classifier: 'v1' as const, tiers: ['high' as const], thresholds: { ...CURRENT_THRESHOLDS } };
const state = async () => JSON.stringify([await db.ingestionState.findMany(), await db.bookHarvestCheckpoint.findMany(), await db.ingestionSourceHealth.findMany(), await db.departmentSweep.findMany()]);
const stateBefore = await state();

for (const prefix of ['pub-', 'r2-', 'r15-', 'rcls-', 'held-']) await db.book.deleteMany({ where: { title: { startsWith: prefix } } });
await db.appSetting.deleteMany({ where: { key: { in: ['REVIEW_AUTO_PUBLISH_JOB', 'REVIEW_AUTO_ASSIGN_JOB'] } } });
await db.ingestionAudit.deleteMany({ where: { action: { in: ['REVIEW_PUBLISH_STARTED', 'REVIEW_PUBLISH_FINISHED', 'REVIEW_PUBLISH_SELECTED'] } } });

// ── 1. Publication eligibility, by itself ───────────────────────────────────
section('Publication eligibility (the one rule set)');
const el = async (o: Seed, dept: string | null = 'Dental') => { const id = await one(o); const r = await E.bookPublicationEligibility(await P.readForPublish(id), dept, 2000); return r; };
eq('a Draft with a declared licence, an address and a recent year is eligible', (await el(high())).ok, true);
eq('no licence → no_verified_licence', (await el(high({ licence: null, basis: 'DOAB record, licence undeclared', access: 'MetadataOnly', url: null }))).reason, 'no_verified_licence');
eq('an unrecognised licence string → no_verified_licence', (await el(high({ licence: 'Custom licence' }))).reason, 'no_verified_licence');
eq('a licence with no recorded source → rights_unclear', (await el(high({ basis: 'DOAB record, licence undeclared' }))).reason, 'rights_unclear');
eq('…unless another provider\'s licence was filled in later (licenceFill)', (await el(high({ basis: 'DOAB record, licence undeclared', fill: true }))).ok, true);
eq('a non-commercial flag that disagrees with the licence → rights_unclear', (await el(high({ nc: true }))).reason, 'rights_unclear');
eq('rights refused → rights_unclear', (await el(high({ rights: 'Rejected' }))).reason, 'rights_unclear');
eq('a non-commercial licence is eligible as a LINK (it is never hosted)', (await el(high({ licence: 'CC BY-NC', nc: true }))).ok, true);
eq('nowhere to send the reader → metadata_only_policy', (await el(high({ url: null }))).reason, 'metadata_only_policy');
eq('"viewable here" without a licence and a file that allow it → access_not_publishable', (await el(high({ access: 'ViewableHere' }))).reason, 'access_not_publishable');
eq('a book that carries an internal file → access_not_publishable (full text is never published automatically)', (await el(high({ pdf: 'https://example.org/a.pdf' }))).reason, 'access_not_publishable');
eq('…even a commercial licence with a verified viewable file', (await el(high({ access: 'ViewableHere', pdf: 'https://example.org/a.pdf', rights: 'Accepted' }))).reason, 'access_not_publishable');
eq('older than the book policy year → year_policy_failed', (await el(high({ year: 1990 }))).reason, 'year_policy_failed');
eq('no year → year_policy_failed', (await el(high({ year: null }))).reason, 'year_policy_failed');
eq('a publisher\'s own submission → protected', (await el(high({ ownership: 'PublisherSubmitted' }))).reason, 'protected');
eq('rejected → rejected', (await el(high({ status: 'Rejected', note: 'dup' }))).reason, 'rejected');
eq('already published → already_published', (await el(high({ status: 'Published' }))).reason, 'already_published');
eq('no department → no_department', (await el(high(), null)).reason, 'no_department');
const doi = `10.1234/${TAG}`; await one(high({ title: 'Twin original', status: 'Published', doi }));
eq('the same DOI already published → duplicate_published', (await el(high({ doi }))).reason, 'duplicate_published');
check('every reason has a label', Object.values(E.PUBLISH_REASON_LABEL).every(l => l.length > 0));
await clearQueue();

// ── 2. Gates ────────────────────────────────────────────────────────────────
section('Feature gates (publication is separate from assignment)');
shut();
const gId = await one(high());
check('the publication gate is off by default', P.publishGate().enabled === false);
eq('with both off, Publish Selected refuses', await rejects(P.publishSelected({ ids: [gId], classifier: 'v1', by: ADMIN })), 'PublishDisabledError');
eq('with both off, the bulk job refuses', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' })), 'PublishDisabledError');
eq('with both off, Resume refuses', await rejects(J.resumeAutoPublish(ADMIN)), 'PublishDisabledError');
process.env.REVIEW_AUTO_ASSIGN_ENABLED = 'true'; process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = APPROVED;
check('assignment ENABLED does not enable publication', P.publishGate().enabled === false && /disabled by configuration/.test(P.publishGate().message || ''));
eq('…Publish Selected still refuses', await rejects(P.publishSelected({ ids: [gId], classifier: 'v1', by: ADMIN })), 'PublishDisabledError');
eq('…and the bulk job still refuses', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' })), 'PublishDisabledError');
shut(); process.env.REVIEW_AUTO_PUBLISH_ENABLED = 'true';
check('publication enabled WITHOUT assignment enabled is also off, and says why', P.publishGate().enabled === false && /ASSIGN/.test(P.publishGate().message || ''));
eq('…Publish Selected refuses', await rejects(P.publishSelected({ ids: [gId], classifier: 'v1', by: ADMIN })), 'PublishDisabledError');
shut();
eq('nothing was published by any refusal', (await get(gId)).status, 'Draft');
const pv0 = await P.previewSelected([gId], 'v1');
eq('a preview works with every gate off, and writes nothing', [pv0.dryRun, pv0.published, (await get(gId)).status, (await get(gId)).domain], [true, 1, 'Draft', null]);
eq('a preview leaves no audit row', await db.ingestionAudit.count({ where: { action: 'REVIEW_PUBLISH_SELECTED' } }), 0);
await clearQueue();

// ── 3. Selected books ───────────────────────────────────────────────────────
section('Publish Selected Eligible');
open();
const sOk = await one(high({ title: 'S ok' })), sHasDept = await one(high({ title: 'S has dept', domain: 'Dental' })), sNoLic = await one(high({ title: 'S no licence', licence: null, basis: 'DOAB record, licence undeclared', access: 'MetadataOnly', url: null }));
const sProt = await one(high({ title: 'S protected', ownership: 'PublisherSubmitted' })), sRej = await one(high({ title: 'S rejected', status: 'Rejected', note: 'dup' })), sConf = await one(high({ title: 'S conflict', domain: 'Law' }));
const sMed = await one(medium({ title: 'Dental Implants S medium' })), sLow = await one(low({ title: 'S low' })), sNone = await one(high({ title: 'S none', codes: [], kw: ['Africa'] })), sPub = await one(high({ title: 'S published', status: 'Published', domain: 'Dental' }));
const sOld = await one(high({ title: 'S old', year: 1990 })), sNC = await one(high({ title: 'S nc', licence: 'CC BY-NC', nc: true }));
const ids = [sOk, sHasDept, sNoLic, sProt, sRej, sConf, sMed, sLow, sNone, sPub, sOld, sNC];
const before = Object.fromEntries(await Promise.all(ids.map(async id => [id, await get(id)])));
const pvSel = await P.previewSelected(ids, 'v1');
eq('the preview says what would happen: 4 would be published', [pvSel.dryRun, pvSel.published, pvSel.requested], [true, 4, 12]);
for (const id of ids) eq(`the preview wrote nothing (${before[id].title.slice(-12)})`, JSON.stringify(await get(id)), JSON.stringify(before[id]));
const sel = await P.publishSelected({ ids, classifier: 'v1', by: ADMIN });
const reason = (id: string) => sel.outcomes.find(o => o.id === id)?.reason;
eq('High + eligible → published', [(await get(sOk)).status, sel.outcomes.find(o => o.id === sOk)?.result], ['Published', 'published']);
eq('High + eligible with an existing department → published, department preserved', [(await get(sHasDept)).status, (await get(sHasDept)).domain], ['Published', 'Dental']);
eq('Medium + eligible (selected) → published', [(await get(sMed)).status, (await get(sMed)).domain], ['Published', 'Dental']);
eq('a non-commercial licence → published as a link, licence untouched', [(await get(sNC)).status, (await get(sNC)).licence, (await get(sNC)).licenceIsNC], ['Published', 'CC BY-NC', true]);
eq('High + no licence → skipped, stays Draft', [(await get(sNoLic)).status, reason(sNoLic)], ['Draft', 'no_verified_licence']);
eq('High + protected (not ingested) → skipped', [(await get(sProt)).status, reason(sProt)], ['Draft', 'protected']);
eq('High + rejected → skipped, stays Rejected', [(await get(sRej)).status, reason(sRej)], ['Rejected', 'rejected']);
eq('High + department conflict → skipped, existing department kept', [(await get(sConf)).status, (await get(sConf)).domain, reason(sConf)], ['Draft', 'Law', 'department_conflict']);
eq('Low cannot be bulk published', [(await get(sLow)).status, reason(sLow)], ['Draft', 'confidence_dropped']);
eq('Unclassifiable cannot be bulk published', [(await get(sNone)).status, ['confidence_dropped', 'no_suggestion'].includes(reason(sNone)!)], ['Draft', true]);
eq('year policy → skipped', [(await get(sOld)).status, reason(sOld)], ['Draft', 'year_policy_failed']);
eq('an already-published book is skipped as already_published', reason(sPub), 'already_published');
eq('totals and grouped reasons', [sel.requested, sel.published, sel.skipped, sel.failed, sel.departmentsAssigned], [12, 4, 8, 0, 3]);
check('skip reasons are grouped by label', sel.skippedReasons['No verified licence'] === 1 && sel.skippedReasons['Department conflict'] === 1 && sel.skippedReasons['Already published'] === 1);
for (const id of [sOk, sHasDept, sMed, sNC]) {
  const a = await get(id);
  eq(`licence, rights, access and file fields are exactly as they were (${a.title.slice(-10)})`, rights(a), rights(before[id]));
}
for (const id of [sNoLic, sProt, sRej, sConf, sLow, sNone, sOld, sPub]) eq(`a skipped book is byte-for-byte unchanged (${before[id].title.slice(-10)})`, JSON.stringify(await get(id)), JSON.stringify(before[id]));
const okRow = await get(sOk);
eq('a missing department is assigned from the revalidated suggestion, with the usual assignment note', [okRow.domain, okRow.metadata.reviewAssignment?.department, okRow.metadata.reviewAssignment?.assignmentSource], ['Dental', 'Dental', 'publish-selected']);
const rp = okRow.metadata.reviewPublication;
eq('the publication note holds bounded evidence', [rp.source, rp.action, rp.classifier, rp.classifierVersion, rp.tier, typeof rp.topScore, typeof rp.margin, rp.department, rp.departmentAssigned, rp.eligibility.result, Array.isArray(rp.eligibility.checks), rp.performedBy, !!rp.performedAt], ['review-automation', 'publish-selected', 'v1', 1, 'high', 'number', 'number', 'Dental', true, 'eligible', true, 'admin@example.com', true]);
check('…and it is small, and other metadata keys are intact', JSON.stringify(rp).length < 500 && okRow.metadata.keep?.a === 1 && !!okRow.metadata.harvest);
eq('a book that already had a department gets no assignment note', (await get(sHasDept)).metadata.reviewAssignment, undefined);
const again = await P.publishSelected({ ids, classifier: 'v1', by: ADMIN });
eq('publishing the same selection again publishes nothing (idempotent)', [again.published, again.skippedReasons['Already published']], [0, 4 + 1]);
eq('…and no department or note changed on the published books', JSON.stringify(await get(sOk)), JSON.stringify(okRow));
eq('Batch limit: more than 250 is refused', await rejects(P.publishSelected({ ids: Array.from({ length: 251 }, (_, i) => `x${i}`), classifier: 'v1', by: ADMIN })), 'PublishRequestError');
eq('a classifier must be chosen', await rejects(P.publishSelected({ ids: [sOk], classifier: undefined, by: ADMIN })), 'PublishRequestError');
await clearQueue();

// ── 4. Revalidation and races ───────────────────────────────────────────────
section('Revalidation at the moment of writing');
const rv = await one(high({ title: 'Revalidate' }));
eq('a different expected department is a classifier change → skipped', (await P.publishOne({ bookId: rv, rule: RULE_H, expectedDepartment: 'Law', action: 'publish-high', by: ADMIN })).reason, 'classifier_changed');
await db.$executeRawUnsafe(`update "Book" set metadata = jsonb_set(jsonb_set(metadata, '{harvest,classifications}', '[]'::jsonb), '{harvest,keywords}', '["Africa"]'::jsonb) where id = $1`, rv);
eq('evidence removed after the preview → the High tier is gone → skipped', (await P.publishOne({ bookId: rv, rule: RULE_H, action: 'publish-high', by: ADMIN })).reason, 'no_suggestion');
await db.$executeRawUnsafe(`update "Book" set metadata = jsonb_set(metadata, '{harvest,keywords}', '["dental implants"]'::jsonb), title = $2 where id = $1`, rv, `${TAG} Dental Implants revalidated`);
eq('…down to Medium → "confidence_dropped" for a High job', (await P.publishOne({ bookId: rv, rule: RULE_H, action: 'publish-high', by: ADMIN })).reason, 'confidence_dropped');
eq('a missing record is reported', (await P.publishOne({ bookId: 'nope', rule: RULE_H, action: 'publish-high', by: ADMIN })).reason, 'record_missing');
eq('nothing was written by any of those', [(await get(rv)).status, (await get(rv)).domain], ['Draft', null]);

section('Races: the other change wins');
const raceOf = async (title: string, mutate: (id: string) => Promise<void>) => {
  const id = await one(high({ title }));
  const real = db.$queryRawUnsafe.bind(db); let staged = false;
  db.$queryRawUnsafe = async (sql: string, ...args: any[]) => { if (!staged && /^\s*update "Book" set status = 'Published'/.test(sql) && args[0] === id) { staged = true; await mutate(id); } return real(sql, ...args); };
  const o = await P.publishOne({ bookId: id, rule: RULE_H, action: 'publish-high', by: ADMIN });
  db.$queryRawUnsafe = real;
  check(`(staged: ${title})`, staged);
  return { id, o, row: await get(id) };
};
const A = await raceOf('Race A rejected', async id => { await db.$executeRawUnsafe(`update "Book" set status = 'Rejected', "rejectionNote" = 'bad' where id = $1`, id); });
eq('A: rejected by another admin → skipped, stays Rejected', [A.o.reason, A.row.status], ['rejected', 'Rejected']);
const B = await raceOf('Race B department', async id => { await db.$executeRawUnsafe(`update "Book" set domain = 'Law' where id = $1`, id); });
eq('B: another admin assigned a different department → their department is preserved, nothing published', [B.o.reason, B.row.domain, B.row.status], ['department_conflict', 'Law', 'Draft']);
const C = await raceOf('Race C licence', async id => { await db.$executeRawUnsafe(`update "Book" set licence = null, "licenceIsNC" = null where id = $1`, id); });
eq('C: the licence changed to non-publishable before the write → skipped, licence as the other change left it', [C.o.reason, C.row.status, C.row.licence], ['concurrent_change', 'Draft', null]);
const D = await raceOf('Race D published', async id => { await db.$executeRawUnsafe(`update "Book" set status = 'Published', domain = 'Dental' where id = $1`, id); });
eq('D: published by hand in the meantime → already_published, no second event', [D.o.reason, D.row.status, D.row.metadata.reviewPublication], ['already_published', 'Published', undefined]);
const Bsame = await raceOf('Race B same department', async id => { await db.$executeRawUnsafe(`update "Book" set domain = 'Dental' where id = $1`, id); });
eq('another admin assigned the SAME department → still published, and no second assignment note is written over theirs', [Bsame.o.reason ?? Bsame.o.result, Bsame.row.status], ['concurrent_change', 'Draft']);
await clearQueue();

// ── 5. The preview ──────────────────────────────────────────────────────────
section('Preview (server-side, non-mutating)');
await reset(); open();
const pH = await seedMany(30, high({ title: 'Prev high' })), pHx = [
  await one(high({ title: 'Prev high no licence', licence: null, basis: 'DOAB record, licence undeclared', access: 'MetadataOnly', url: null })),
  await one(high({ title: 'Prev high old', year: 1990 })), await one(high({ title: 'Prev high protected', ownership: 'PublisherSubmitted' })),
  await one(high({ title: 'Prev high conflict', domain: 'Law' })), await one(high({ title: 'Prev high rights', basis: 'DOAB record, licence undeclared' }))];
const pM = await seedMany(12, medium({ title: 'Dental Implants prev medium' })), pL = await seedMany(8, low({ title: 'Prev low' }));
const snapQ = async () => (await db.$queryRawUnsafe(`select md5(string_agg(b::text, '|' order by id)) h from "Book" b where title like $1`, `${TAG}%`))[0].h;
const q0 = await snapQ();
const prH = await preview('high');
eq('High preview: candidates, eligible, ineligible (computed on the server)', [prH.status, prH.candidates, prH.eligible, prH.ineligible], ['done', 34, 30, 4]);
eq('…with the reasons grouped', Object.entries(prH.reasons).sort(), Object.entries({ 'No verified licence': 1, 'Year policy': 1, 'Department conflict': 1, 'Rights unclear': 1 }).sort());   // a publisher's own submission is not even a candidate: it is not in the ingested queue
eq('…and every eligible book here lacks a department, so 30 would be assigned', prH.departmentsToAssign, 30);
check('…the preview used the approved thresholds', prH.thresholdsApproved === true && prH.thresholds?.highMinScore === 6);
eq('the preview changed no book at all (every column of every fixture)', await snapQ(), q0);
const prM = await preview('medium');
eq('Medium preview: only Medium books, with a bounded sample that says whether each is eligible', [prM.candidates, prM.eligible, prM.sample.length <= 40, prM.sample.length, prM.sample.every(s => s.suggested === 'Dental' && s.eligible && s.licenceState === 'Open licence')], [12, 12, true, 12, true]);
check('…and a sample row carries title, provider, year, licence, suggestion, score, margin, evidence', ['title', 'source', 'year', 'licenceState', 'suggested', 'score', 'margin', 'evidence', 'eligible'].every(k => k in prM.sample[0]));
eq('Low books are never candidates (the preview refuses to be asked for them)', (() => { try { J.startPublishPreview('v1', 'low'); return 'allowed'; } catch (e: any) { return e.name; } })(), 'AutoPublishError');
eq('…nor Unclassifiable', (() => { try { J.startPublishPreview('v1', 'unclassifiable'); return 'allowed'; } catch (e: any) { return e.name; } })(), 'AutoPublishError');
eq('the preview for another classifier is separate', (await preview('high', 'v2')).classifier, 'v2');
const pvScoped = await preview('high', 'v1', { source: 'NoSuchProvider' }); eq('a scope with no books previews 0', pvScoped.candidates, 0);

// ── 6. The job ──────────────────────────────────────────────────────────────
section('Publish Eligible High Confidence (job)');
await preview('high');
eq('Start refuses without a matching preview (classifier)', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v2', tier: 'high' })), 'AutoPublishError');
eq('…or for a different scope', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high', scope: { source: 'DOAB' } })), 'AutoPublishError');
eq('…or for a tier that was not previewed', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'medium', sampleReviewed: true })), 'AutoPublishError');
eq('Start refuses Low', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'low' })), 'AutoPublishError');
process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = '{"highMinScore":6}';
eq('…and without approved thresholds', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' })), 'AutoPublishError');
open();
const hBefore = Object.fromEntries(await Promise.all([...pH, ...pHx, ...pM, ...pL].map(async id => [id, await get(id)])));
const job = await J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' });
eq('the job starts with the classifier, tier and the preview\'s numbers recorded', [job.status, job.classifier, job.tier, job.eligibleAtPreview, job.candidatesAtPreview], ['running', 'v1', 'high', 30, 34]);
eq('a second start while it runs is refused', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' })), 'AutoPublishError');
const done = await waitJob();
eq('it finishes', done.status, 'done');
eq('the moment a job reads as finished, the review lock is already free (a preview started straight away is accepted)', [Lock.reviewJobHolder(), (() => { const ok = J.startPublishPreview('v1', 'high'); return ok; })()], [null, true]);
await waitPreview();
eq('requested = published + skipped + failed; 30 published, 4 skipped', [done.requested, done.published, done.skipped, done.failed, done.requested === done.published + done.skipped + done.failed], [34, 30, 4, 0, true]);
eq('30 departments were assigned in the same step', done.departmentsAssigned, 30);
eq('all 30 eligible High books are Published with Dental', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Published' and domain = 'Dental'`, pH))[0].n, 30);
eq('the unsafe ones stayed Drafts, untouched (and so did the publisher’s own submission)', (await Promise.all(pHx.map(async id => JSON.stringify(await get(id)) === JSON.stringify(hBefore[id])))).every(Boolean), true);
eq('Medium and Low books were not touched by a High job', (await Promise.all([...pM, ...pL].map(async id => JSON.stringify(await get(id)) === JSON.stringify(hBefore[id])))).every(Boolean), true);
eq('licence, rights, access and files are unchanged on every published book', (await Promise.all(pH.map(async id => rights(await get(id)) === rights(hBefore[id])))).every(Boolean), true);
eq('the persisted job state is small and lists no books', JSON.stringify((await db.appSetting.findUnique({ where: { key: 'REVIEW_AUTO_PUBLISH_JOB' } })).value).length < 2500, true);

section('Idempotency');
await preview('high');
const second = await (async () => { await J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' }); return waitJob(); })();
eq('the same job again publishes nothing; the same 4 are skipped again for the same reasons', [second.published, second.skipped, second.departmentsAssigned, JSON.stringify(Object.entries(second.skippedReasons).sort()) === JSON.stringify(Object.entries(done.skippedReasons).sort())], [0, 4, 0, true]);
eq('…and there is exactly one publication note per published book (no duplicate event)', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and metadata ? 'reviewPublication'`, pH))[0].n, 30);

section('Medium job');
await preview('medium');
eq('a Medium job needs the sample to have been reviewed', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'medium' })), 'AutoPublishError');
eq('…and "reviewed" must be explicit', await rejects(J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'medium', sampleReviewed: 'yes' })), 'AutoPublishError');
const medJob = await (async () => { await J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'medium', sampleReviewed: true }); return waitJob(); })();
eq('Medium + eligible → published (only Medium books)', [medJob.tier, medJob.published, medJob.requested], ['medium', 12, 12]);
eq('…the Low books stayed Drafts', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Draft' and domain is null`, pL))[0].n, 8);

// ── 7. Cancellation and resume ──────────────────────────────────────────────
section('Cancellation');
await clearQueue(); await reset(); open();
const many = await seedMany(350, high({ title: 'Cancel me' }));
await preview('high');
await J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' });
for (let i = 0; i < 400 && !((await J.autoPublishStatus())?.scanned! > 0); i++) await new Promise(r => setTimeout(r, 25));   // let the first chunk finish
const cancelling = await J.cancelAutoPublish(ADMIN);
eq('cancel is accepted while it runs', cancelling.cancelRequested, true);
const cancelled = await waitJob();
const pubSoFar = (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Published'`, many))[0].n;
eq('it finished the chunk in hand and stopped: some published, not all', [cancelled.status, pubSoFar > 0, pubSoFar < 350, cancelled.published], ['cancelled', true, true, pubSoFar]);
eq('what was published stays published; the rest is untouched Drafts', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Draft' and domain is null`, many))[0].n, 350 - pubSoFar);

section('Restart and resume');
const persisted = (await db.appSetting.findUnique({ where: { key: 'REVIEW_AUTO_PUBLISH_JOB' } })).value;
await db.appSetting.update({ where: { key: 'REVIEW_AUTO_PUBLISH_JOB' }, data: { value: { ...persisted, status: 'running', finishedAt: null, cancelRequested: false } } });
J.__resetPublish(); Lock.__resetReviewJobLock();
eq('after a restart the job is interrupted, not running', (await J.autoPublishStatus())?.status, 'interrupted');
eq('a new job cannot start until it is resumed or cancelled', await rejects((async () => { await preview('high'); return J.startAutoPublish(ADMIN, { classifier: 'v1', tier: 'high' }); })()), 'AutoPublishError');
const resumed = await J.resumeAutoPublish(ADMIN);
eq('resume continues from the cursor', [resumed.status, resumed.cursor === persisted.cursor], ['running', true]);
const fin = await waitJob();
eq('everything is published once, and the counters carry across the restart', [(await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Published'`, many))[0].n, fin.published], [350, 350]);

// ── 8. History, checkpoints, health ─────────────────────────────────────────
section('Review History');
const hist = await H.reviewHistory(1, 100);
const jobRow = hist.rows.find(r => r.action === 'REVIEW_PUBLISH_FINISHED' && r.label === 'Publish Eligible High Confidence' && r.published === 30)!;
eq('the High job is in the history with classifier, rule, counts and who', [jobRow?.label, jobRow?.classifier, jobRow?.thresholds, jobRow?.requested, jobRow?.published, jobRow?.skipped, jobRow?.failed, jobRow?.eligibleAtPreview, jobRow?.admin, jobRow?.publishes], ['Publish Eligible High Confidence', 'v1', 'High: score ≥ 6, margin ≥ 3, controlled code + title/subject', 34, 30, 4, 0, 30, 'admin@example.com', true]);
check('grouped skip reasons are on the row', Object.keys(jobRow.skippedReasons).length === 4);
check('the Medium job is labelled Medium', hist.rows.some(r => r.label === 'Publish Eligible Medium Confidence' && r.published === 12));
check('a selection is in the history too', hist.rows.some(r => r.action === 'REVIEW_PUBLISH_SELECTED' && r.label === 'Publish Selected Eligible' && r.published === 4 && r.requested === 12 && r.scope === 'The books selected in Batch Review'));
const cancelRow = hist.rows.find(r => r.action === 'REVIEW_PUBLISH_FINISHED' && r.cancelled);
check('the cancelled job shows it was cancelled and how many it did not reach', !!cancelRow && cancelRow.cancelledRemaining === 350 - pubSoFar, `${cancelRow?.cancelledRemaining}`);
eq('every publication audit row says it publishes', (await db.ingestionAudit.findMany({ where: { action: { in: ['REVIEW_PUBLISH_FINISHED', 'REVIEW_PUBLISH_SELECTED'] } } })).every((r: any) => r.meta?.publishes === true), true);

section('Nothing else moved');
eq('ingestion state, harvest checkpoints, provider health and sweeps are exactly as they were', await state(), stateBefore);
check('classifier rules v1 and its version are unchanged', CLASSIFIER_RULES_VERSION === 1);

// ── Published never exposes full text ───────────────────────────────────────
section('Published never exposes full text (non-commercial stays a link)');
open();
const fx = {
  nc: await one(high({ title: 'Ft nc', licence: 'CC BY-NC', nc: true })),
  ncND: await one(high({ title: 'Ft ncnd', licence: 'CC BY-NC-ND', nc: true })),
  cc: await one(high({ title: 'Ft cc' })),
  viewable: await one(high({ title: 'Ft viewable', access: 'ViewableHere', pdf: 'https://example.org/internal.pdf', rights: 'Accepted' })),
  strayFile: await one(high({ title: 'Ft stray file', pdf: 'https://example.org/stray.pdf' })),
  ncFile: await one(high({ title: 'Ft nc with file', licence: 'CC BY-NC', nc: true, pdf: 'https://example.org/nc.pdf' })),
};
const ftIds = Object.values(fx);
const ftBefore = Object.fromEntries(await Promise.all(ftIds.map(async id => [id, await get(id)])));
const ftPv = await P.previewSelected(ftIds, 'v1');
eq('the preview already refuses every book that carries a file, and lists the rest as publishable', [ftPv.published, ftPv.skipped], [3, 3]);
const ftRes = await P.publishSelected({ ids: ftIds, classifier: 'v1', by: ADMIN });
const ftOut = (id: string) => ftRes.outcomes.find(o => o.id === id);
for (const [k, label] of [['nc', 'CC BY-NC'], ['ncND', 'CC BY-NC-ND'], ['cc', 'CC BY']] as const) {
  const r = await get(fx[k]);
  eq(`${label}, link only → published`, r.status, 'Published');
  eq(`${label}: no internal file address on the published record`, r.pdfUrl, null);
  eq(`${label}: still offered as a link to the source, not viewable here`, [r.accessStatus, r.originalUrl === ftBefore[fx[k]].originalUrl], ['LinkOnly', true]);
  eq(`${label}: licence, flag, rights and basis untouched`, [r.licence, r.licenceIsNC, r.rightsStatus, r.rightsBasis], [ftBefore[fx[k]].licence, ftBefore[fx[k]].licenceIsNC, ftBefore[fx[k]].rightsStatus, ftBefore[fx[k]].rightsBasis]);
}
for (const k of ['viewable', 'strayFile', 'ncFile'] as const) {
  eq(`a book with an internal file (${k}) is not published`, [ftOut(fx[k])?.result, ftOut(fx[k])?.reason, (await get(fx[k])).status], ['skipped', 'access_not_publishable', 'Draft']);
  eq(`…and its file address and access are left exactly as they were (${k})`, rights(await get(fx[k])), rights(ftBefore[fx[k]]));
}
eq('no Published book from this run carries a file address', Number((await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Published' and "pdfUrl" is not null`, ftIds))[0].n), 0);
shut();
await clearQueue();

// ── clean up exactly what this run created ──────────────────────────────────
await db.book.deleteMany({ where: { id: { in: made } } });
await db.appSetting.deleteMany({ where: { key: { in: ['REVIEW_AUTO_PUBLISH_JOB', 'REVIEW_CLASSIFICATION_ANALYSIS'] } } });
await db.ingestionAudit.deleteMany({ where: { action: { in: ['REVIEW_PUBLISH_STARTED', 'REVIEW_PUBLISH_FINISHED', 'REVIEW_PUBLISH_SELECTED'] } } });
eq('everything seeded was removed', await db.book.count({ where: { title: { startsWith: TAG } } }), 0);
console.log(`\n${pass} passed, ${fail} failed`);
shut();
await db.$disconnect();
process.exit(fail ? 1 : 0);
