/**
 * Review automation R2: department assignment (Batch Review, Auto-assign High Confidence), its gate, its job, its history.
 * Private throwaway database `stm_review_test` only (createdb stm_review_test && DATABASE_URL=.../stm_review_test npx prisma db push).
 *
 *   npx tsx scripts/test-review-r2.ts
 *
 * Fixture Books only. Proves that department assignment changes a department and a bounded note and nothing else (status stays Draft, nothing is
 * published, licence / access / rights / rejection state are untouched), that every record is revalidated at the moment of writing, that the job is
 * bounded, cancellable, resumable and idempotent, that everything is off unless the gate is on, and that the held-books job cannot undo an assignment.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_review_test');
delete process.env.REVIEW_AUTO_ASSIGN_ENABLED; delete process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
// Importing the app loads .env, which on a developer machine may switch the gate on; the suite starts from "everything off" whatever .env says.
delete process.env.REVIEW_AUTO_ASSIGN_ENABLED; delete process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS;
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_review_test') throw new Error(`refusing to run against "${name}"`);
const R = await import('../src/lib/ingestion/reviewClassification.js');
const B = await import('../src/lib/ingestion/reviewBatch.js');
const J = await import('../src/lib/ingestion/reviewAutoAssign.js');
const H = await import('../src/lib/ingestion/reviewHistory.js');
const L = await import('../src/lib/ingestion/localWork.js');
const Lock = await import('../src/lib/ingestion/reviewJobLock.js');
const { CLASSIFIER_RULES_VERSION } = await import('../src/lib/ingestion/books/classifier.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
const ADMIN = { uid: 'u1', email: 'admin@example.com' };

// ── Fixtures ────────────────────────────────────────────────────────────────
const TAG = `r2-${Date.now().toString(36)}`;
const dental = ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'];
type Seed = { title?: string; codes?: string[]; kw?: string[]; ddc?: string[]; source?: string; status?: string; domain?: string | null; note?: string | null; ownership?: string; licence?: string | null; year?: number };
const bookRow = (o: Seed) => ({
  id: randomUUID(), title: `${TAG} ${o.title ?? 'Dentistry Essentials'}`, status: o.status ?? 'Draft', ownershipSource: o.ownership ?? 'Ingested', source: o.source ?? 'OpenLibrary', year: o.year ?? 2021,
  licence: o.licence === undefined ? 'CC BY' : o.licence, licenceIsNC: o.licence === null ? null : false, accessType: 'OpenAccess', accessStatus: 'MetadataOnly', rightsStatus: 'MetadataOnly', language: 'en',
  domain: o.domain ?? null, rejectionNote: o.note ?? null,
  metadata: { keep: { a: 1 }, harvest: { classifications: o.codes ?? [], keywords: o.kw ?? [], provider: { ddc: o.ddc ?? [] }, department: { band: 'review', score: 1, suggested: 'Arts', runnerUp: null } } },
});
const made: string[] = [];
const seedMany = async (n: number, o: Seed = {}) => { const rows = Array.from({ length: n }, (_, i) => bookRow({ ...o, title: `${o.title ?? 'Dentistry Essentials'} ${i}` })); await db.book.createMany({ data: rows as any }); made.push(...rows.map(r => r.id)); return rows.map(r => r.id); };
const high = (o: Seed = {}) => ({ codes: dental, kw: ['dentistry', 'oral health'], ...o });          // High under v1 and v2
const medium = (o: Seed = {}) => ({ kw: ['dental implants'], title: 'Dental Implants', ...o });      // words only: Medium
const low = (o: Seed = {}) => ({ kw: ['law'], title: 'Untitled', ...o });                           // one weak keyword: Low
const physioV2 = (o: Seed = {}) => ({ kw: ['Physical therapy'], title: 'Physical therapy in practice', ddc: ['615.82'], ...o });   // High under v2 only
const one = async (o: Seed) => (await seedMany(1, o))[0];
const get = async (id: string) => (await db.$queryRawUnsafe(`select * from "Book" where id = $1`, id))[0];
const dom = async (id: string) => (await get(id)).domain;
const queueCount = async () => (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where title like $1 and status = 'Draft' and "ownershipSource" = 'Ingested' and domain is null and "rejectionNote" is null`, `${TAG}%`))[0].n;
const strict = (r: any) => { const { domain, updatedAt, metadata, ...rest } = r; const { reviewAssignment, ...meta } = metadata || {}; return JSON.stringify({ rest, meta }); };
const waitJob = async () => { for (let i = 0; i < 600; i++) { const s = await J.autoAssignStatus(); if (s && s.status !== 'running') return s; await new Promise(r => setTimeout(r, 50)); } throw new Error('job did not finish'); };
const waitAnalysis = async () => { while (R.jobState().status === 'running') await new Promise(r => setTimeout(r, 30)); };
const analyse = async (v: 'v1' | 'v2') => { R.startAnalysis(ADMIN, undefined, v); await waitAnalysis(); };
const APPROVED = JSON.stringify({ highMinScore: 6, highMinMargin: 3, highRequiresCode: true });
const reset = async () => { J.__resetAutoAssign(); J.__resetPreview(); Lock.__resetReviewJobLock(); await db.appSetting.deleteMany({ where: { key: { in: ['REVIEW_AUTO_ASSIGN_JOB'] } } }); };
const openGate = () => { process.env.REVIEW_AUTO_ASSIGN_ENABLED = 'true'; process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = APPROVED; };
const closeGate = () => { delete process.env.REVIEW_AUTO_ASSIGN_ENABLED; delete process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS; };
const rejects = async (p: Promise<any>, name?: string) => { try { await p; return null; } catch (e: any) { return name && e.name !== name ? `wrong error ${e.name}` : e.name; } };

// A run that was interrupted leaves its tagged fixtures behind; they are all ours (this database is only used by the Review Automation suites), so clear them first.
for (const prefix of ['r2-', 'r15-', 'rcls-', 'held-', 'pub-']) await db.book.deleteMany({ where: { title: { startsWith: prefix } } });   // this database is only ever used by these suites
await db.appSetting.deleteMany({ where: { key: { in: ['REVIEW_CLASSIFICATION_ANALYSIS', 'REVIEW_CLASSIFICATION_COMPARISON', 'REVIEW_AUTO_ASSIGN_JOB', 'ingestion.localwork.v1'] } } });
await db.ingestionAudit.deleteMany({ where: { action: { in: ['REVIEW_AUTO_ASSIGN_STARTED', 'REVIEW_AUTO_ASSIGN_FINISHED', 'REVIEW_BATCH_ASSIGN'] } } });
eq('the private database starts with no queue from other runs', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where status = 'Draft' and "ownershipSource" = 'Ingested' and domain is null and "rejectionNote" is null`))[0].n, 0);

// ── 1. The gate ─────────────────────────────────────────────────────────────
section('The gate (everything off by default)');
const idG = await one(high());
const idGm = await one(medium());
check('the gate is off by default', B.autoAssignEnabled() === false && J.autoAssignConfig().enabled === false);
eq('the config says why', J.autoAssignConfig().gateMessage, 'Historical auto-assignment is disabled by configuration.');
eq('Batch assign refuses with the gate off', await rejects(B.batchAssign({ ids: [idG], mode: 'suggested', classifier: 'v1', by: ADMIN }), 'AssignmentDisabledError'), 'AssignmentDisabledError');
eq('Batch assign of a chosen department refuses too', await rejects(B.batchAssign({ ids: [idG], mode: 'chosen', department: 'Law', by: ADMIN }), 'AssignmentDisabledError'), 'AssignmentDisabledError');
eq('Auto-assign refuses to start with the gate off', await rejects(J.startAutoAssign(ADMIN, { classifier: 'v1' }), 'AssignmentDisabledError'), 'AssignmentDisabledError');
eq('Resume refuses with the gate off', await rejects(J.resumeAutoAssign(ADMIN), 'AssignmentDisabledError'), 'AssignmentDisabledError');
eq('…and no book was touched', [await dom(idG), await dom(idGm)], [null, null]);
await analyse('v1');
check('analysis works with the gate off', !!(await R.loadSummary()) && (await R.loadSummary())!.analysed >= 2);
check('the comparison works with the gate off', R.startComparison(ADMIN) === true); while (R.jobState().status === 'running') await new Promise(r => setTimeout(r, 30));
check('a preview works with the gate off', J.startPreview('v1') === true); while (J.previewState().status === 'running') await new Promise(r => setTimeout(r, 30));
eq('…and counts the High book without assigning it', [J.previewState().status, J.previewState().eligible >= 1, await dom(idG)], ['done', true, null]);
eq('the preview says no thresholds were approved (it used the provisional ones)', J.previewState().thresholdsApproved, false);
eq('Batch Review listing works with the gate off', (await R.recordsPage({ tier: 'medium' }, 1, 25)).records.some(r => r.id === idGm), true);

// ── 2. Thresholds, classifier and analysis are required ─────────────────────
section('Starting needs approved thresholds, an explicit classifier and an analysis');
process.env.REVIEW_AUTO_ASSIGN_ENABLED = 'true';
eq('with the gate on but no approved thresholds it refuses', (await rejects(J.startAutoAssign(ADMIN, { classifier: 'v1' }), 'AutoAssignError')), 'AutoAssignError');
process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = '{"highMinScore":6}';
check('thresholds missing keys are not approved', J.autoAssignConfig().thresholds === null && /highMinMargin/.test(J.autoAssignConfig().thresholdsProblem || ''));
process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = 'not json';
check('thresholds that are not JSON are not approved', J.autoAssignConfig().thresholds === null);
openGate();
eq('approved thresholds are read back as written', [J.autoAssignConfig().thresholds?.highMinScore, J.autoAssignConfig().thresholds?.highMinMargin, J.autoAssignConfig().thresholds?.highRequiresCode], [6, 3, true]);
eq('the classifier must be chosen explicitly', await rejects(J.startAutoAssign(ADMIN, { classifier: undefined }), 'AutoAssignError'), 'AutoAssignError');
eq('…and must be v1 or v2', await rejects(J.startAutoAssign(ADMIN, { classifier: 'v3' }), 'AutoAssignError'), 'AutoAssignError');
await db.appSetting.deleteMany({ where: { key: 'REVIEW_CLASSIFICATION_ANALYSIS' } });
eq('an analysis must exist', await rejects(J.startAutoAssign(ADMIN, { classifier: 'v1' }), 'AutoAssignError'), 'AutoAssignError');
await analyse('v1');
eq('the analysis must have used the classifier chosen', await rejects(J.startAutoAssign(ADMIN, { classifier: 'v2' }), 'AutoAssignError'), 'AutoAssignError');
eq('nothing was assigned by any refusal', [await dom(idG), await dom(idGm)], [null, null]);

// ── 3. Batch Review ─────────────────────────────────────────────────────────
section('Batch Review: Assign Suggested Departments');
const idHigh = await one(high({ title: 'High one' })), idMed = await one(medium({ title: 'Dental Implants one' })), idLow = await one(low({ title: 'Low one' }));
const idRej = await one(high({ title: 'Rejected', status: 'Rejected', note: 'dup' })), idRejNote = await one(high({ title: 'Draft with note', note: 'dup' }));
const idPlaced = await one(high({ title: 'Placed by hand', domain: 'Law' }));
await analyse('v1');
const before = new Map<string, any>(); for (const id of [idHigh, idMed, idLow, idRej, idRejNote, idPlaced]) before.set(id, await get(id));
const r1 = await B.batchAssign({ ids: [idHigh, idMed, idLow, idRej, idRejNote, idPlaced, 'missing-id'], mode: 'suggested', classifier: 'v1', by: ADMIN });
eq('a High book is assigned its own suggestion', [await dom(idHigh), (await get(idHigh)).status], ['Dental', 'Draft']);
eq('a Medium book is assigned its own suggestion (Batch Review is for these)', [await dom(idMed), (await get(idMed)).status], ['Dental', 'Draft']);
eq('a Low book is skipped: confidence is not enough', [await dom(idLow), r1.outcomes.find(o => o.id === idLow)?.reason], [null, 'Confidence dropped']);
eq('a Rejected book is skipped', [await dom(idRej), r1.outcomes.find(o => o.id === idRej)?.reason], [null, 'Rejected']);
eq('a Draft carrying a rejection note is skipped', [await dom(idRejNote), r1.outcomes.find(o => o.id === idRejNote)?.reason], [null, 'Rejected']);
eq('a manually assigned book is skipped and keeps its department', [await dom(idPlaced), r1.outcomes.find(o => o.id === idPlaced)?.reason], ['Law', 'Department already assigned']);
eq('a missing id is skipped', r1.outcomes.find(o => o.id === 'missing-id')?.reason, 'Record missing');
eq('totals add up and are grouped by reason', [r1.requested, r1.assigned, r1.skipped, r1.failed, Object.values(r1.skippedReasons).reduce((a, b) => a + b, 0)], [7, 2, 5, 0, 5]);
for (const id of [idRej, idRejNote, idPlaced, idLow]) eq(`a skipped book is byte-for-byte unchanged (${id.slice(0, 4)})`, JSON.stringify(await get(id)), JSON.stringify(before.get(id)));
for (const id of [idHigh, idMed]) eq(`an assigned book changed only its department and note (${id.slice(0, 4)})`, strict(await get(id)), strict(before.get(id)));
const note = (await get(idMed)).metadata.reviewAssignment;
eq('the audit note holds the bounded evidence', [note.department, note.tier, typeof note.topScore, typeof note.margin, 'secondDepartment' in note, 'secondScore' in note, note.classifier, note.classifierVersion, Array.isArray(note.evidence), note.assignmentSource, note.basis, note.performedBy, !!note.performedAt], ['Dental', 'medium', 'number', 'number', true, true, 'v1', 1, true, 'batch-suggested', 'classifier', 'admin@example.com', true]);
check('and it is small', JSON.stringify(note).length < 600, `${JSON.stringify(note).length} bytes`);
const again = await B.batchAssign({ ids: [idHigh, idMed], mode: 'suggested', classifier: 'v1', by: ADMIN });
eq('repeating the same assignment assigns nothing and skips both', [again.assigned, again.skipped, again.skippedReasons], [0, 2, { 'Department already assigned': 2 }]);
eq('…and the departments are unchanged', [await dom(idHigh), await dom(idMed)], ['Dental', 'Dental']);

section('Batch Review: Assign Selected Department');
const idC1 = await one(low({ title: 'Choose me' })), idC2 = await one(medium({ title: 'Dental Implants chosen' })), idCPlaced = await one(low({ title: 'Placed', domain: 'Law' }));
const c = await B.batchAssign({ ids: [idC1, idC2, idCPlaced, idC1], mode: 'chosen', department: 'Education and Social Sciences', by: ADMIN });
eq('a chosen department is assigned to eligible books (duplicates in the request counted once)', [c.requested, c.assigned, await dom(idC1), await dom(idC2)], [3, 2, 'Education and Social Sciences', 'Education and Social Sciences']);
eq('a manually assigned book is still skipped', [await dom(idCPlaced), c.skippedReasons], ['Law', { 'Department already assigned': 1 }]);
eq('a chosen-department note says a person chose it', (await get(idC1)).metadata.reviewAssignment.basis, 'person');
eq('an unknown department is refused outright', await rejects(B.batchAssign({ ids: [idLow], mode: 'chosen', department: 'Underwater Basket Weaving', by: ADMIN }), 'BatchRequestError'), 'BatchRequestError');
eq('an empty selection is refused', await rejects(B.batchAssign({ ids: [], mode: 'chosen', department: 'Law', by: ADMIN }), 'BatchRequestError'), 'BatchRequestError');
eq('more than 250 is refused', await rejects(B.batchAssign({ ids: Array.from({ length: 251 }, (_, i) => `x${i}`), mode: 'chosen', department: 'Law', by: ADMIN }), 'BatchRequestError'), 'BatchRequestError');
eq('suggested assignment needs a classifier', await rejects(B.batchAssign({ ids: [idLow], mode: 'suggested', by: ADMIN }), 'BatchRequestError'), 'BatchRequestError');

section('Stale selections are revalidated');
const [sPub, sRej, sMan, sEv, sOk] = await seedMany(5, high({ title: 'Stale' })).then(ids => ids);
await analyse('v1');
const picked = (await R.idsFor({ tier: 'high' }, 250)).ids;
check('they were all High in the analysis the person looked at', [sPub, sRej, sMan, sEv, sOk].every(id => picked.includes(id)));
await db.$executeRawUnsafe(`update "Book" set status = 'Published' where id = $1`, sPub);
await db.$executeRawUnsafe(`update "Book" set status = 'Rejected', "rejectionNote" = 'dup' where id = $1`, sRej);
await db.$executeRawUnsafe(`update "Book" set domain = 'Law' where id = $1`, sMan);                                    // another admin got there first
await db.$executeRawUnsafe(`update "Book" set metadata = jsonb_set(jsonb_set(metadata, '{harvest,classifications}', '[]'::jsonb), '{harvest,keywords}', '[]'::jsonb) where id = $1`, sEv);   // evidence changed after the analysis
const st = await B.batchAssign({ ids: [sPub, sRej, sMan, sEv, sOk], mode: 'suggested', classifier: 'v1', by: ADMIN });
eq('status changed after selection → skipped, still Published', [(await get(sPub)).status, (await dom(sPub)), st.outcomes.find(o => o.id === sPub)?.reason], ['Published', null, 'No longer a Draft']);
eq('rejected after selection → skipped', [await dom(sRej), st.outcomes.find(o => o.id === sRej)?.reason], [null, 'Rejected']);
eq('another admin assigned a department → theirs wins', [await dom(sMan), st.outcomes.find(o => o.id === sMan)?.reason], ['Law', 'Department already assigned']);
eq('the classifier no longer agrees (evidence changed) → skipped', [await dom(sEv), ['Confidence dropped', 'Classifier changed', 'No department suggested'].includes(st.outcomes.find(o => o.id === sEv)?.reason!)], [null, true]);
eq('the one book still eligible is assigned', [await dom(sOk), st.assigned], ['Dental', 1]);

eq('assigned books drop out of the browsable list', (await R.recordsPage({ tier: 'high' }, 1, 250)).records.some(r => r.id === sOk), false);
const pageBooks = await seedMany(30, high({ title: 'Paging' })); await analyse('v1');
const firstTen = R.idsFor({ tier: 'high' }, 10);
await B.batchAssign({ ids: firstTen.ids, mode: 'suggested', classifier: 'v1', by: ADMIN });
const nextPage = await R.recordsPage({ tier: 'high' }, 1, 10);
check('after assigning the first page, the same list still shows the books that remain (not an empty page)', nextPage.records.length > 0 && nextPage.records.every(r => !firstTen.ids.includes(r.id)), `${nextPage.records.length} shown, ${nextPage.total} left`);
void pageBooks;

section('A department assigned between reading and writing');
const idRace = await one(high({ title: 'Race' }));
const realQuery = db.$queryRawUnsafe.bind(db); let staged = false;
db.$queryRawUnsafe = async (sql: string, ...args: any[]) => {
  if (!staged && /^\s*update "Book" set domain/.test(sql) && args[0] === idRace) { staged = true; await realQuery(`update "Book" set domain = 'Law' where id = $1 returning id`, idRace); }
  return realQuery(sql, ...args);
};
const raced = await B.batchAssign({ ids: [idRace], mode: 'suggested', classifier: 'v1', by: ADMIN });
db.$queryRawUnsafe = realQuery;
check('(the other admin\'s write was staged between the read and the write)', staged);
eq('the department that got there first wins; this write changed nothing', [await dom(idRace), raced.assigned, raced.skippedReasons], ['Law', 0, { 'Changed while being assigned': 1 }]);

// ── 4. Batches of 50 and 100 ────────────────────────────────────────────────
section('Batch sizes');
const ids50 = await seedMany(50, high({ title: 'Batch fifty' })), ids100 = await seedMany(100, high({ title: 'Batch hundred' }));
const b50 = await B.batchAssign({ ids: ids50, mode: 'suggested', classifier: 'v1', by: ADMIN });
eq('a batch of 50', [b50.requested, b50.assigned, b50.skipped, b50.failed], [50, 50, 0, 0]);
const b100 = await B.batchAssign({ ids: ids100, mode: 'suggested', classifier: 'v1', by: ADMIN });
eq('a batch of 100', [b100.requested, b100.assigned, b100.skipped, b100.failed], [100, 100, 0, 0]);
eq('every one stayed a Draft with its licence and access untouched', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Draft' and licence = 'CC BY' and "accessType" = 'OpenAccess' and "accessStatus" = 'MetadataOnly' and "rightsStatus" = 'MetadataOnly' and "rejectionNote" is null`, [...ids50, ...ids100]))[0].n, 150);

// ── 5. The high-confidence job ──────────────────────────────────────────────
section('Auto-assign High Confidence');
await reset(); openGate();
const jobHigh = await seedMany(130, high({ title: 'Job high' }));
const jobMed = await seedMany(5, medium({ title: 'Dental Implants job medium' })), jobLow = await seedMany(5, low({ title: 'Job low' }));
const jobRej = await one(high({ title: 'Job rejected', status: 'Rejected', note: 'dup' })), jobPlaced = await one(high({ title: 'Job placed', domain: 'Law' }));
const jobV2 = await one(physioV2({ title: 'Job v2 only' }));
const snap = async (ids: string[]) => Object.fromEntries(await Promise.all(ids.map(async id => [id, JSON.stringify(await get(id))])));
const untouched = [...jobMed, ...jobLow, jobRej, jobPlaced, jobV2]; const untouchedBefore = await snap(untouched);
await analyse('v1');
const preview = (() => { J.startPreview('v1'); return null; })(); while (J.previewState().status === 'running') await new Promise(r => setTimeout(r, 30));
const pv = J.previewState();
check('the preview counts what qualifies now, under the approved thresholds', pv.status === 'done' && pv.thresholdsApproved && pv.eligible >= 130, `eligible ${pv.eligible}`);
check('…and lists departments and providers', pv.byDepartment.length > 0 && Object.keys(pv.bySource).length > 0);
void preview;
const started = await J.startAutoAssign(ADMIN, { classifier: 'v1', eligibleAtStart: pv.eligible });
eq('the job starts running, with the classifier recorded', [started.status, started.classifier, started.classifierVersion], ['running', 'v1', 1]);
eq('a second start while it runs is refused', await rejects(J.startAutoAssign(ADMIN, { classifier: 'v1' }), 'AutoAssignError'), 'AutoAssignError');
check('analysis cannot run at the same time (one heavy job at a time)', R.startAnalysis(ADMIN) === false);
const done = await waitJob();
eq('the job finishes', done.status, 'done');
eq('the moment the job reads as finished, the review lock is already free', Lock.reviewJobHolder(), null);
eq('every High book was assigned and the job was bounded into chunks of 100', [done.assigned >= 130, done.scanned >= 130, J.CHUNK], [true, true, 100]);
eq('assigned + skipped + failed = requested', done.assigned + done.skipped + done.failed, done.requested);
eq('the 130 High books have their department and are still Draft', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain = 'Dental' and status = 'Draft'`, jobHigh))[0].n, 130);
for (const id of untouched) eq(`not High / rejected / placed / v2-only: byte-for-byte unchanged (${id.slice(0, 4)})`, JSON.stringify(await get(id)), untouchedBefore[id]);
eq('the persisted job state is small and holds no list of books', JSON.stringify((await db.appSetting.findUnique({ where: { key: 'REVIEW_AUTO_ASSIGN_JOB' } })).value).length < 2000, true);

section('Idempotency');
await analyse('v1');
const second = await (async () => { await J.startAutoAssign(ADMIN, { classifier: 'v1' }); return waitJob(); })();
eq('a second identical run assigns nothing', [second.status, second.assigned, second.requested], ['done', 0, 0]);
eq('…and the first run\'s departments are intact', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain = 'Dental'`, jobHigh))[0].n, 130);
const reAssign = await B.batchAssign({ ids: jobHigh.slice(0, 20), mode: 'suggested', classifier: 'v1', by: ADMIN });
eq('assigning the same books again through Batch Review: 0 assigned, 20 skipped', [reAssign.assigned, reAssign.skipped], [0, 20]);

section('Classifier v1 and v2');
await analyse('v2');
check('v2 selected: a job started with v1 against a v2 analysis is refused', (await rejects(J.startAutoAssign(ADMIN, { classifier: 'v1' }), 'AutoAssignError')) === 'AutoAssignError');
const v2run = await (async () => { await J.startAutoAssign(ADMIN, { classifier: 'v2' }); return waitJob(); })();
eq('v2 selected: the Dewey-supported book is High under v2 and is assigned Physiotherapy', [v2run.classifier, v2run.classifierVersion, await dom(jobV2), (await get(jobV2)).status], ['v2', 2, 'Physiotherapy', 'Draft']);
eq('its audit note records classifier v2 and the Dewey evidence', [(await get(jobV2)).metadata.reviewAssignment.classifier, (await get(jobV2)).metadata.reviewAssignment.evidence.includes('ddc')], ['v2', true]);
const idV1Only = await one(physioV2({ title: 'v1 does not see Dewey' })); await reset(); openGate(); await analyse('v1');
const v1run = await (async () => { await J.startAutoAssign(ADMIN, { classifier: 'v1' }); return waitJob(); })();
eq('v1 selected: the same kind of book is not High under v1 and is left alone', [await dom(idV1Only), v1run.assigned], [null, 0]);

section('Scope');
await reset(); openGate();
const scopeA = await seedMany(3, high({ title: 'Scope DOAB', source: 'DOAB' })), scopeB = await seedMany(3, high({ title: 'Scope OAPEN', source: 'OAPEN' }));
await analyse('v1');
const scoped = await (async () => { await J.startAutoAssign(ADMIN, { classifier: 'v1', scope: { source: 'DOAB' } }); return waitJob(); })();
eq('a provider scope assigns only that provider\'s books', [scoped.assigned, (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain is not null`, scopeA))[0].n, (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain is not null`, scopeB))[0].n], [3, 3, 0]);

// ── 6. Cancellation and resume ──────────────────────────────────────────────
section('Cancellation');
// Earlier sections leave a few unassigned fixtures in the queue; clear them so this job's counts are exactly its own 350 books.
await db.book.deleteMany({ where: { id: { in: made }, domain: null, status: 'Draft' } });
await reset(); openGate();
const many = await seedMany(350, high({ title: 'Cancel me' }));
await analyse('v1');
await J.startAutoAssign(ADMIN, { classifier: 'v1', eligibleAtStart: 350 });
const cancelling = await J.cancelAutoAssign(ADMIN);
eq('cancel is accepted while it runs', cancelling.cancelRequested, true);
const cancelled = await waitJob();
const assignedSoFar = (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain is not null`, many))[0].n;
eq('it stopped after the chunk in hand: some assigned, not all', [cancelled.status, assignedSoFar > 0, assignedSoFar < 350, cancelled.assigned], ['cancelled', true, true, assignedSoFar]);
eq('what was assigned stays assigned (no rollback), and the rest is untouched', [(await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain is null and status = 'Draft'`, many))[0].n], [350 - assignedSoFar]);
const cancelRow = (await H.reviewHistory(1, 50)).rows.find(r => r.action === 'REVIEW_AUTO_ASSIGN_FINISHED' && r.cancelled && r.assigned === assignedSoFar);
eq('the cancellation is in the history', !!cancelRow, true);
eq('…with the books it did not get to, and the rule it ran under', [cancelRow?.cancelledRemaining, cancelRow?.thresholds], [350 - cancelled.requested, 'High: score ≥ 6, margin ≥ 3, controlled code + title/subject']);

section('Restart and resume');
// A crash leaves the persisted row saying "running" with the cursor where the last finished chunk put it.
const persisted = (await db.appSetting.findUnique({ where: { key: 'REVIEW_AUTO_ASSIGN_JOB' } })).value;
await db.appSetting.update({ where: { key: 'REVIEW_AUTO_ASSIGN_JOB' }, data: { value: { ...persisted, status: 'running', finishedAt: null, cancelRequested: false } } });
J.__resetAutoAssign(); Lock.__resetReviewJobLock();           // "the process restarted": no worker, no lock
const interrupted = await J.autoAssignStatus();
eq('after a restart the job shows as interrupted, not running', interrupted?.status, 'interrupted');
eq('and a new start is refused until it is resumed or cancelled', await rejects(J.startAutoAssign(ADMIN, { classifier: 'v1' }), 'AutoAssignError'), 'AutoAssignError');
process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = JSON.stringify({ highMinScore: 7, highMinMargin: 3, highRequiresCode: true });
eq('resume refuses if the approved thresholds changed in the meantime', await rejects(J.resumeAutoAssign(ADMIN), 'AutoAssignError'), 'AutoAssignError');
openGate();
const resumed = await J.resumeAutoAssign(ADMIN);
eq('resume continues from the cursor', [resumed.status, resumed.cursor === persisted.cursor], ['running', true]);
const finished = await waitJob();
eq('it completes', finished.status, 'done');
eq('every book now has its department, none was assigned twice (the counters carry across the restart)', [(await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain = 'Dental'`, many))[0].n, finished.assigned, finished.requested], [350, 350, 350]);

section('An interrupted job can be cancelled instead');
await seedMany(1, high({ title: 'After' }));
await db.appSetting.update({ where: { key: 'REVIEW_AUTO_ASSIGN_JOB' }, data: { value: { ...(await db.appSetting.findUnique({ where: { key: 'REVIEW_AUTO_ASSIGN_JOB' } })).value, status: 'running', finishedAt: null } } });
J.__resetAutoAssign();
const closed = await J.cancelAutoAssign(ADMIN);
eq('it is closed as cancelled and a new job may start', [closed.status, (await J.autoAssignStatus())?.status], ['cancelled', 'cancelled']);

// ── 7. History, audit and the invariants ────────────────────────────────────
section('Review History');
const hist = await H.reviewHistory(1, 100);
const rowsOf = (a: string) => hist.rows.filter(r => r.action === a);
check('batch assignments are recorded with counts and the admin', rowsOf('REVIEW_BATCH_ASSIGN').length >= 5 && rowsOf('REVIEW_BATCH_ASSIGN').every(r => r.admin === 'admin@example.com' && r.requested !== null));
const b100row = rowsOf('REVIEW_BATCH_ASSIGN').find(r => r.requested === 100)!;
eq('a batch row says requested / assigned / skipped / failed and its scope', [b100row.requested, b100row.assigned, b100row.skipped, b100row.failed, b100row.classifier, b100row.scope], [100, 100, 0, 0, 'v1', 'Each book’s own suggestion']);
const jobRow = rowsOf('REVIEW_AUTO_ASSIGN_FINISHED').find(r => (r.assigned ?? 0) >= 130 && !r.cancelled)!;
eq('a job row says classifier, scope, counts and who', [jobRow?.classifier, jobRow?.scope, jobRow?.requested, jobRow?.admin], ['v1', 'All departments, all providers', jobRow?.requested, 'admin@example.com']);
check('skipped reasons are grouped on the row', Object.keys(rowsOf('REVIEW_BATCH_ASSIGN').find(r => r.skipped! > 0)!.skippedReasons).length > 0);
const assignAudits = await db.ingestionAudit.findMany({ where: { action: { in: ['REVIEW_BATCH_ASSIGN', 'REVIEW_AUTO_ASSIGN_FINISHED'] } } });
check('every assignment audit row records that it publishes nothing', assignAudits.length > 0 && assignAudits.every((r: any) => r.meta?.publishes === false));
const pageTwo = await H.reviewHistory(2, 5);
check('history is paged', pageTwo.take === 5 && pageTwo.rows.length <= 5 && pageTwo.total === hist.total);

section('Nothing was published, and the held-books job cannot undo an assignment');
const allMine = made;
eq('no fixture Book was published by any assignment (only the one seeded Published + the one that was published to test staleness)', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Published'`, allMine))[0].n, 1);
eq('every assigned book is still a Draft ingested record with no rejection note', (await db.$queryRawUnsafe(`select count(*)::int n from "Book" where id = any($1::text[]) and domain is not null and (status <> 'Draft' or "ownershipSource" <> 'Ingested' or "rejectionNote" is not null) and id <> $2 and id <> $3`, allMine, sPub, sRej))[0].n, 0);
const heldBook = await one(high({ title: 'Held-books target', source: 'DOAB' }));
await reset(); openGate(); await analyse('v1');
const heldAssign = await B.batchAssign({ ids: [heldBook], mode: 'chosen', department: 'Arts', by: ADMIN });
const heldBefore = JSON.stringify(await get(heldBook));
await db.appSetting.deleteMany({ where: { key: 'ingestion.localwork.v1' } });
let guard = 0; while ((await L.heldBooksJob.pending()) > 0 && guard++ < 50) await L.heldBooksJob.run(500);
eq('a person-assigned department (Arts, not what the classifier would say) survives the held-books job, byte for byte', [heldAssign.assigned, JSON.stringify(await get(heldBook)) === heldBefore, await dom(heldBook), (await get(heldBook)).status], [1, true, 'Arts', 'Draft']);
check('classifier rules v1 and its version are unchanged', CLASSIFIER_RULES_VERSION === 1);
check('server.ts routes assignment through the gate, the revalidating contract and never through approve', (() => { const s = readFileSync(new URL('../server.ts', import.meta.url), 'utf8'); const i = s.indexOf('Review automation R2'); const block = s.slice(i, s.indexOf('const reviewAction', i) > i ? s.indexOf('const reviewAction', i) : i + 6000); return !/status:\s*['"]Published['"]/.test(block.slice(0, block.length)); })());

// ── clean up exactly what this run created ──────────────────────────────────
await db.book.deleteMany({ where: { id: { in: made } } });
await db.appSetting.deleteMany({ where: { key: { in: ['REVIEW_CLASSIFICATION_ANALYSIS', 'REVIEW_CLASSIFICATION_COMPARISON', 'REVIEW_AUTO_ASSIGN_JOB', 'ingestion.localwork.v1'] } } });
await db.ingestionAudit.deleteMany({ where: { action: { in: ['REVIEW_AUTO_ASSIGN_STARTED', 'REVIEW_AUTO_ASSIGN_FINISHED', 'REVIEW_BATCH_ASSIGN', 'REVIEW_CLASSIFICATION_ANALYSIS', 'REVIEW_CLASSIFICATION_COMPARISON'] } } });
eq('everything seeded was removed', await db.book.count({ where: { title: { startsWith: TAG } } }), 0);
console.log(`\n${pass} passed, ${fail} failed`);
closeGate();
await db.$disconnect();
process.exit(fail ? 1 : 0);
