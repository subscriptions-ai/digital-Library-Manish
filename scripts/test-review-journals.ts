/**
 * Review automation R3B — Journal review: classification analysis, tiers, controlled department assignment, gate, protection, races, idempotency, history.
 * Private throwaway database `stm_review_test` only (createdb stm_review_test && DATABASE_URL=.../stm_review_test npx prisma db push).
 *
 *   npx tsx scripts/test-review-journals.ts
 *
 * Fixture Journals only. Proves that the analysis writes nothing; that an assignment changes the department and NOTHING else (status, licence, rights, ISSN and eISSN,
 * title, publisher and every scheduling field are identical afterwards); that a department, a Rejected journal, a partner publisher's journal and a hand-verified one
 * are never overwritten or touched; that a change made between the read and the write wins; that the gate is off by default and separate from the Book gates; and that
 * nothing is published.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_review_test');
const GATES = ['REVIEW_JOURNAL_ASSIGN_ENABLED', 'REVIEW_JOURNAL_ASSIGN_THRESHOLDS', 'REVIEW_AUTO_ASSIGN_ENABLED', 'REVIEW_AUTO_PUBLISH_ENABLED', 'REVIEW_INGEST_ROUTING_ENABLED'];
for (const k of GATES) delete process.env[k];

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_review_test') throw new Error(`refusing to run against "${name}"`);
const C = await import('../src/lib/ingestion/journalClassification.js');
const A = await import('../src/lib/ingestion/journalReviewAnalysis.js');
const S = await import('../src/lib/ingestion/journalReviewAssign.js');
const H = await import('../src/lib/ingestion/reviewHistory.js');
const Lock = await import('../src/lib/ingestion/reviewJobLock.js');
const { autoAssignEnabled } = await import('../src/lib/ingestion/reviewBatch.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
const ADMIN = { uid: 'u1', email: 'admin@example.com' };

// ── Fixtures ────────────────────────────────────────────────────────────────
const TAG = `jr-${Date.now().toString(36)}`;
type Seed = { title: string; subjects?: string[]; subject?: string | null; status?: string; domain?: string | null; publisherId?: string | null; verifiedBy?: string | null; basis?: string; licence?: string | null };
let n = 0;
const issn = () => { n++; return `${String(1000 + (Date.now() % 8000)).slice(0, 4)}-${String(1000 + n).padStart(4, '0')}`; };
const made: string[] = [];
const J = async (o: Seed) => {
  const id = randomUUID();
  await db.journal.create({ data: {
    id, title: `${TAG} ${o.title}`, issn: issn(), eissn: issn(), publisherName: 'Fixture Press', subject: o.subject ?? null, subjects: o.subjects ?? [], status: o.status ?? 'NeedsReview', domain: o.domain ?? null,
    publisherId: o.publisherId ?? null, rightsVerifiedBy: o.verifiedBy ?? null, rightsBasis: o.basis ?? 'Crossref listing — OA unverified', licence: o.licence === undefined ? 'CC BY' : o.licence, licenceIsNC: false, homepage: 'https://example.org/j',
    articleCount: 7, failureCount: 2, noChangeCount: 3, lastIngestionStatus: 'nochange',
  } as any });
  made.push(id); return id;
};
const get = async (id: string) => (await db.$queryRawUnsafe(`select * from "Journal" where id = $1`, id))[0];
// Everything about a journal except the two columns an assignment may change.
const frozen = (r: any) => JSON.stringify({ ...r, domain: undefined, updatedAt: undefined });
const THRESH = JSON.stringify({ highMinScore: 8, highMinMargin: 4, highRequiresBoth: true });
const open = () => { process.env.REVIEW_JOURNAL_ASSIGN_ENABLED = 'true'; process.env.REVIEW_JOURNAL_ASSIGN_THRESHOLDS = THRESH; };
const shut = () => { for (const k of GATES) delete process.env[k]; };
const rejects = async (p: Promise<any>) => { try { await p; return 'resolved'; } catch (e: any) { return e.name; } };
const waitAnalysis = async () => { for (let i = 0; i < 800 && A.journalJobState().status === 'running'; i++) await new Promise(r => setTimeout(r, 25)); return A.journalJobState(); };

await db.journal.deleteMany({ where: { title: { startsWith: 'jr-' } } });
await db.publisher.deleteMany({ where: { name: { startsWith: 'jr-' } } });
await db.ingestionAudit.deleteMany({ where: { action: { in: ['REVIEW_JOURNAL_ASSIGNED', 'REVIEW_JOURNAL_BATCH_ASSIGN', 'REVIEW_JOURNAL_ANALYSIS'] } } });
const pub = await db.publisher.create({ data: { name: `${TAG} Publisher` } as any });

// ── 1. The classifier ───────────────────────────────────────────────────────
section('Journal classification: High / Medium / Low / Unclassifiable');
const hi = C.classifyJournal({ title: 'Journal of Dental Research', subjects: ['Dentistry', 'Oral health'] });
eq('title and subject agree → High, Dental, both families', [hi.tier, hi.dept, hi.families.sort()], ['high', 'Dental', ['subject', 'title']]);
const me = C.classifyJournal({ title: 'Dental Implants Journal', subjects: [] });
eq('the title alone → Medium', [me.tier, me.dept, me.families], ['medium', 'Dental', ['title']]);
const lo = C.classifyJournal({ title: 'Annals of Things', subjects: ['law'] });
eq('one weak subject → Low', [lo.tier, lo.families], ['low', ['subject']]);
const un = C.classifyJournal({ title: 'Annals of Things', subjects: [] });
eq('no evidence → Unclassifiable, no department', [un.tier, un.dept, un.score], ['unclassifiable', null, 0]);
const tie = C.classifyJournal({ title: 'Journal of Nursing and Dental Care', subjects: ['Nursing', 'Dentistry'] });
check('two departments close → never High', tie.tier !== 'high', `${tie.tier} ${tie.score}/${tie.margin}`);
eq('the engine\'s own import-time rule is kept beside the suggestion', [hi.legacy, lo.legacy], ['Dental', null]);
eq('the broad departments are not inferred from wording alone', C.judgeJournal({ title: 'Science', subjects: ['Science'] }).dept === 'Science', false);
eq('a stricter rule lowers a tier', C.classifyJournal({ title: 'Journal of Dental Research', subjects: ['Dentistry', 'Oral health'] }, { ...C.CURRENT_JOURNAL_THRESHOLDS, highMinScore: 30 }).tier, 'medium');
check('the classifier is bounded: 500 subjects of 10 kB read as at most 20 of 120 characters', C.subjectsOf({ subjects: Array.from({ length: 500 }, (_, i) => 'x'.repeat(10_000) + i) }).length <= 20 && C.subjectsOf({ subjects: ['y'.repeat(10_000)] })[0].length === 120);

// ── 2. The queue and the analysis ───────────────────────────────────────────
section('Analysis: reads only, bounded, protected journals are not in the queue');
const q = {
  high: await J({ title: 'Journal of Dental Research', subjects: ['Dentistry', 'Oral health'] }),
  medium: await J({ title: 'Dental Implants Journal' }),
  low: await J({ title: 'Annals of Things', subjects: ['law'] }),
  none: await J({ title: 'Annals of Things' }),
  accepted: await J({ title: 'Journal of Dental Surgery', subjects: ['Dentistry', 'Oral health'], status: 'Accepted', basis: 'DOAJ declaration', verifiedBy: 'ingestion' }),
};
const prot = {
  hasDept: await J({ title: 'Journal of Dental Care', subjects: ['Dentistry'], domain: 'Law' }),
  rejected: await J({ title: 'Journal of Dental Rejects', subjects: ['Dentistry'], status: 'Rejected' }),
  publisher: await J({ title: 'Journal of Dental Partner', subjects: ['Dentistry'], publisherId: pub.id }),
  manual: await J({ title: 'Journal of Dental Manual', subjects: ['Dentistry'], verifiedBy: 'admin@example.com' }),
};
const allIds = [...Object.values(q), ...Object.values(prot)];
const snap = async () => JSON.stringify(await Promise.all(allIds.map(get)));
const before = await snap();
const counts0 = JSON.stringify(await Promise.all([db.book.count(), db.article.count(), db.journal.count()]));
const bookAudit = () => db.ingestionAudit.count({ where: { action: { in: ['REVIEW_BATCH_ASSIGN', 'REVIEW_PUBLISH_SELECTED', 'REVIEW_AUTO_ASSIGN_STARTED', 'REVIEW_AUTO_ASSIGN_FINISHED', 'REVIEW_INGEST_ROUTING'] } } });
const bookAudit0 = await bookAudit();
const assignedRows = async (ids: string[]) => Number((await db.$queryRawUnsafe(`select count(*)::int n from "IngestionAudit" where action = 'REVIEW_JOURNAL_ASSIGNED' and meta->>'journalId' = any($1::text[])`, ids))[0].n);
A.__resetJournalAnalysis(); Lock.__resetReviewJobLock();
check('the analysis starts', A.startJournalAnalysis(ADMIN) === true);
check('a second start while it runs is refused', A.startJournalAnalysis(ADMIN) === false);
const st = await waitAnalysis();
eq('it finishes', st.status, 'done');
eq('the moment it reads as finished the review lock is free', Lock.reviewJobHolder(), null);
const summary = (await A.loadJournalSummary())!;
const mineRecs = (t?: string) => A.journalRecords({ q: TAG, tier: t as any }, 1, 100);
eq('my five queue journals are analysed; the four protected ones are not offered', mineRecs().total, 5);
eq('tiers: 2 High (Dental, one Accepted), 1 Medium, 1 Low, 1 Unclassifiable', ['high', 'medium', 'low', 'unclassifiable'].map(t => mineRecs(t).total), [2, 1, 1, 1]);
check('the summary carries counts, departments, origins and the engine-rule comparison', summary.tiers.high >= 2 && summary.byDepartment.some(d => d.department === 'Dental') && !!summary.byOrigin.Crossref && summary.againstEngineRule.same >= 2);
check('samples are bounded (at most 25 per tier) and carry only an id, title, ISSN, origin, suggestion, score, margin and the evidence', Object.values(summary.samples).every(l => l.length <= 25) && summary.samples.high.every(s => Object.keys(s).length === 8));
eq('the analysis wrote nothing: every journal row is identical', await snap(), before);
eq('…and no Book, Article or Journal was created or removed', JSON.stringify(await Promise.all([db.book.count(), db.article.count(), db.journal.count()])), counts0);
check('the persisted summary is small', JSON.stringify(summary).length < 60_000, String(JSON.stringify(summary).length));
const filtered = A.journalRecords({ q: TAG, department: 'Dental', origin: 'Crossref' }, 1, 100);
eq('records can be filtered by department and origin (the DOAJ one is excluded)', [filtered.records.every(r => r.dept === 'Dental' && r.origin === 'Crossref'), filtered.total], [true, 2]);
eq('a page is at most 100 records', A.journalRecords({}, 1, 5000).records.length <= 100, true);
eq('records without an analysis are reported as unavailable, not as empty', (() => { A.__resetJournalAnalysis(); const r = A.journalRecords({}); return [r.available, r.total]; })(), [false, 0]);
A.startJournalAnalysis(ADMIN); await waitAnalysis();

// ── 3. The gate ─────────────────────────────────────────────────────────────
section('Feature gate: off by default, separate from the Book gates');
shut();
check('the journal gate is off by default', S.journalAssignEnabled() === false && S.journalAssignConfig().enabled === false);
eq('with it off, a batch refuses', await rejects(S.batchAssignJournals({ ids: [q.high], mode: 'suggested', by: ADMIN })), 'JournalAssignDisabledError');
process.env.REVIEW_AUTO_ASSIGN_ENABLED = 'true'; process.env.REVIEW_INGEST_ROUTING_ENABLED = 'true'; process.env.REVIEW_AUTO_PUBLISH_ENABLED = 'true';
eq('enabling the Book assignment, routing and publication gates does not enable journals', await rejects(S.batchAssignJournals({ ids: [q.high], mode: 'suggested', by: ADMIN })), 'JournalAssignDisabledError');
shut(); process.env.REVIEW_JOURNAL_ASSIGN_ENABLED = 'true';
check('enabling the journal gate does not enable the Book gates', autoAssignEnabled() === false);
eq('…and with it on but no approved rule the batch still works, under the provisional thresholds, and says so', (await S.batchAssignJournals({ ids: [q.high], mode: 'suggested', by: ADMIN }, { dryRun: true })).thresholdsApproved, false);
shut();
const pv = await S.batchAssignJournals({ ids: [q.high, q.medium, q.low, q.none], mode: 'suggested', by: ADMIN }, { dryRun: true });
eq('a preview works with the gate off: High and Medium would be assigned, Low and Unclassifiable would not', pv.outcomes.map(o => o.result), ['would_assign', 'would_assign', 'skipped', 'skipped']);
eq('…and says why', pv.skippedReasons, { 'Confidence dropped': 1, 'No department suggested': 1 });
eq('a preview wrote nothing and left no audit row', [await snap(), await db.ingestionAudit.count({ where: { action: { in: ['REVIEW_JOURNAL_ASSIGNED', 'REVIEW_JOURNAL_BATCH_ASSIGN'] } } })], [before, 0]);
check('an approved rule must be complete', (() => { process.env.REVIEW_JOURNAL_ASSIGN_THRESHOLDS = '{"highMinScore":8}'; const r = S.approvedJournalThresholds(); shut(); return r.thresholds === null && /must give/.test(r.problem || ''); })());

// ── 4. Assign Department, Stay Current Status ───────────────────────────────
section('Assign: the department and nothing else');
open();
const b4 = Object.fromEntries(await Promise.all([q.high, q.medium, q.low, q.none, q.accepted].map(async id => [id, await get(id)])));
const r4 = await S.batchAssignJournals({ ids: [q.high, q.medium, q.low, q.none, q.accepted], mode: 'suggested', by: ADMIN });
eq('suggested: High, Medium and the Accepted one assigned; Low and Unclassifiable skipped', [r4.assigned, r4.skipped, r4.failed, r4.requested], [3, 2, 0, 5]);
for (const [k, d] of [['high', 'Dental'], ['medium', 'Dental'], ['accepted', 'Dental']] as const) eq(`${k}: department ${d}`, (await get(q[k])).domain, d);
for (const k of ['high', 'medium', 'accepted'] as const) eq(`${k}: every other column is identical (status, licence, rights, ISSN and eISSN, title, publisher, coverage, scheduling)`, frozen(await get(q[k])), frozen(b4[q[k]]));
eq('the status each journal had is the status it keeps', [(await get(q.high)).status, (await get(q.accepted)).status], ['NeedsReview', 'Accepted']);
eq('ISSN and eISSN are unchanged', [(await get(q.high)).issn, (await get(q.high)).eissn], [b4[q.high].issn, b4[q.high].eissn]);
for (const k of ['low', 'none'] as const) eq(`${k}: not assigned, row unchanged`, JSON.stringify(await get(q[k])), JSON.stringify(b4[q[k]]));
const chosen = await S.batchAssignJournals({ ids: [q.low, q.none], mode: 'chosen', department: 'Law', by: ADMIN });
eq('chosen: a person may place a Low or Unclassifiable journal', [chosen.assigned, (await get(q.low)).domain, (await get(q.none)).domain], [2, 'Law', 'Law']);
eq('…and still nothing but the department changed', [frozen(await get(q.low)) === frozen(b4[q.low]), frozen(await get(q.none)) === frozen(b4[q.none])], [true, true]);
eq('nothing was published: no Book or Article was created, none changed', JSON.stringify(await Promise.all([db.book.count(), db.article.count(), db.journal.count()])), counts0);

// ── 5. Protected journals ───────────────────────────────────────────────────
section('Existing decisions are never overwritten');
const pb = Object.fromEntries(await Promise.all(Object.values(prot).map(async id => [id, JSON.stringify(await get(id))])));
const pr = await S.batchAssignJournals({ ids: Object.values(prot), mode: 'chosen', department: 'Nursing', by: ADMIN });
eq('a chosen department is refused for all four: already placed, Rejected, publisher-linked, manually verified', [pr.assigned, pr.skipped], [0, 4]);
eq('with the reasons named', Object.keys(pr.skippedReasons).sort(), ['Department already assigned', 'Publisher-linked or manually verified', 'Rejected']);
for (const [k, id] of Object.entries(prot)) eq(`${k}: untouched`, JSON.stringify(await get(id)), pb[id]);
const ps = await S.batchAssignJournals({ ids: Object.values(prot), mode: 'suggested', by: ADMIN });
eq('their own suggestion is refused too', ps.assigned, 0);
eq('an unknown department is refused', await rejects(S.batchAssignJournals({ ids: [q.high], mode: 'chosen', department: 'Astrology', by: ADMIN })), 'JournalBatchError');
eq('the batch limit is enforced', await rejects(S.batchAssignJournals({ ids: Array.from({ length: 251 }, (_, i) => `x${i}`), mode: 'suggested', by: ADMIN })), 'JournalBatchError');
eq('an empty selection is refused', await rejects(S.batchAssignJournals({ ids: [], mode: 'suggested', by: ADMIN })), 'JournalBatchError');
eq('an unknown action is refused', await rejects(S.batchAssignJournals({ ids: [q.high], mode: 'publish', by: ADMIN })), 'JournalBatchError');
eq('a missing journal is skipped, not an error', (await S.batchAssignJournals({ ids: [randomUUID()], mode: 'chosen', department: 'Law', by: ADMIN })).skippedReasons, { 'Record missing': 1 });

// ── 6. Revalidation and races ───────────────────────────────────────────────
section('Revalidated at the moment of writing; the other change wins');
const T = C.CURRENT_JOURNAL_THRESHOLDS;
const rule = { tiers: ['high', 'medium'] as any, thresholds: T };
{
  const id = await J({ title: 'Journal of Dental Research', subjects: ['Dentistry', 'Oral health'] });
  const wrong = await S.assignJournalStayCurrent({ journalId: id, department: 'Law', basis: 'classifier', rule, source: 'test', by: ADMIN });
  eq('the classifier names a different department than the one asked for → skipped, nothing written', [wrong.result, (wrong as any).reason, (await get(id)).domain], ['skipped', 'classification-changed', null]);
  const strict = await S.assignJournalStayCurrent({ journalId: id, department: 'Dental', basis: 'classifier', rule: { tiers: ['high'], thresholds: { ...T, highMinScore: 30 } }, source: 'test', by: ADMIN });
  eq('confidence below the rule → skipped', [strict.result, (strict as any).reason, (await get(id)).domain], ['skipped', 'below-rule', null]);
  eq('a classifier basis with no rule is refused', ((await S.assignJournalStayCurrent({ journalId: id, department: 'Dental', basis: 'classifier', source: 'test', by: ADMIN })) as any).reason, 'rule-required');
}
// A deterministic interleaving: the competing change lands right after the journal is read and before the write.
const origQ = (db as any).$queryRawUnsafe.bind(db);
let hook: null | (() => Promise<any>) = null;
(db as any).$queryRawUnsafe = async (sql: string, ...a: any[]) => { const r = await origQ(sql, ...a); if (hook && /from "Journal" where id = \$1/.test(sql)) { const h = hook; hook = null; await h(); } return r; };
const race = async (title: string, change: (id: string) => Promise<any>) => {
  const id = await J({ title, subjects: ['Dentistry', 'Oral health'] });
  hook = () => change(id);
  const o: any = await S.assignJournalStayCurrent({ journalId: id, department: 'Dental', basis: 'classifier', rule, source: 'test', by: ADMIN });
  return { o, row: await get(id), id };
};
{
  const a = await race('Journal of Dental Research A', id => db.journal.update({ where: { id }, data: { domain: 'Law' } }));
  eq('A: a person placed it in between → their department stands', [a.o.reason, a.row.domain], ['changed-during-assignment', 'Law']);
  const b = await race('Journal of Dental Research B', id => db.journal.update({ where: { id }, data: { status: 'Rejected' } }));
  eq('B: rejected in between → no department written, still Rejected', [b.o.reason, b.row.domain, b.row.status], ['changed-during-assignment', null, 'Rejected']);
  const c = await race('Journal of Dental Research C', id => db.journal.update({ where: { id }, data: { publisherId: pub.id } }));
  eq('C: linked to a partner publisher in between → untouched', [c.o.reason, c.row.domain], ['changed-during-assignment', null]);
  const d = await race('Journal of Dental Research D', id => db.journal.update({ where: { id }, data: { title: `${TAG} Annals of Things`, subjects: [] } }));
  eq('D: the title the decision rested on changed → no department written', [d.o.reason, d.row.domain], ['changed-during-assignment', null]);
  const e = await race('Journal of Dental Research E', id => db.journal.update({ where: { id }, data: { status: 'Accepted' } }));
  eq('E: the status changed in between → no write on a stale reading, and the new status is untouched', [e.o.reason, e.row.domain, e.row.status], ['changed-during-assignment', null, 'Accepted']);
  const f = await race('Journal of Dental Research F', id => db.journal.update({ where: { id }, data: { rightsVerifiedBy: 'admin@example.com' } }));
  eq('F: verified by hand in between → untouched', [f.o.reason, f.row.domain], ['changed-during-assignment', null]);
}
(db as any).$queryRawUnsafe = origQ;
{
  const id = await J({ title: 'Journal of Dental Research G', subjects: ['Dentistry', 'Oral health'] });
  const res = await Promise.all([1, 2, 3].map(() => S.assignJournalStayCurrent({ journalId: id, department: 'Dental', basis: 'classifier', rule, source: 'test', by: ADMIN })));
  eq('three simultaneous requests for one journal: exactly one writes', res.filter(r => r.result === 'assigned').length, 1);
  check('…the others were refused rather than overwriting', res.filter(r => r.result !== 'assigned').every((r: any) => ['already-has-department', 'changed-during-assignment'].includes(r.reason)));
  eq('…and exactly one audit row was written for it', await assignedRows([id]), 1);
}

// ── 7. Idempotency ──────────────────────────────────────────────────────────
section('Idempotent');
{
  const a = await J({ title: 'Journal of Dental Research H1', subjects: ['Dentistry', 'Oral health'] }), b = await J({ title: 'Dental Implants Journal H2' });
  const first = await S.batchAssignJournals({ ids: [a, b], mode: 'suggested', by: ADMIN });
  const frozenNow = JSON.stringify([await get(a), await get(b)]);
  const second = await S.batchAssignJournals({ ids: [a, b], mode: 'suggested', by: ADMIN });
  eq('the same batch again assigns nothing and changes nothing', [first.assigned, second.assigned, second.skipped, JSON.stringify([await get(a), await get(b)]) === frozenNow], [2, 0, 2, true]);
  eq('…reported as "already assigned"', second.skippedReasons, { 'Department already assigned': 2 });
  eq('…and there is still exactly one assignment row per journal', await assignedRows([a, b]), 2);
}

// ── 8. Evidence and history ─────────────────────────────────────────────────
section('Audit evidence and Review History');
const one = (await db.ingestionAudit.findMany({ where: { action: 'REVIEW_JOURNAL_ASSIGNED', meta: { path: ['journalId'], equals: q.high } } }))[0];
const m = one.meta as any;
eq('per-journal evidence: department, basis, tier, classifier, version, who', [m.department, m.basis, m.tier, m.classifier, m.classifierVersion, one.adminEmail], ['Dental', 'classifier', 'high', 'journal-rules', 1, 'admin@example.com']);
check('…with score, margin and the evidence families, and publishes:false', typeof m.score === 'number' && typeof m.margin === 'number' && Array.isArray(m.evidence) && m.publishes === false && m.issn === b4[q.high].issn);
check('…and is small (no title, no subjects, no description)', JSON.stringify(m).length < 500 && !('title' in m), String(JSON.stringify(m).length));
const batchRow = (await db.ingestionAudit.findMany({ where: { action: 'REVIEW_JOURNAL_BATCH_ASSIGN' }, orderBy: { at: 'asc' } }))[0];
eq('the batch summary: mode, counts, thresholds, publishes:false', [(batchRow.meta as any).mode, (batchRow.meta as any).requested, (batchRow.meta as any).assigned, (batchRow.meta as any).thresholdsApproved, (batchRow.meta as any).publishes], ['suggested', 5, 3, true, false]);
const hist = await H.reviewHistory(1, 100);
const jh = hist.rows.filter(r => r.action === 'REVIEW_JOURNAL_BATCH_ASSIGN');
check('Review History lists the journal batches, with counts and scope', jh.length >= 2 && jh.every(r => r.assigns && !r.publishes && r.label === 'Journal batch assignment') && jh.some(r => /Journals/.test(r.scope) && r.assigned === 3));
check('per-journal rows do not flood the history', !hist.rows.some(r => r.action === 'REVIEW_JOURNAL_ASSIGNED'));
await db.ingestionAudit.create({ data: { action: 'REVIEW_JOURNAL_ANALYSIS', adminEmail: ADMIN.email, meta: { catalogueChanged: false, analysed: 5 } } as any });
check('the analysis appears too', (await H.reviewHistory(1, 100)).rows.some(r => r.action === 'REVIEW_JOURNAL_ANALYSIS' && /journals analysed/.test(r.detail || '')));

// ── 9. Nothing else moved ───────────────────────────────────────────────────
section('Nothing else moved');
eq('no Book or Article was created or removed by any of this', JSON.stringify(await Promise.all([db.book.count(), db.article.count()])), JSON.stringify(JSON.parse(counts0).slice(0, 2)));
eq('no checkpoint, provider-health or sweep row was created', JSON.stringify(await Promise.all([db.bookHarvestCheckpoint.count(), db.ingestionSourceHealth.count(), db.departmentSweep.count()])), JSON.stringify([0, 0, 0]));
eq('no Book assignment, publication or routing audit row was written', await bookAudit(), bookAudit0);

// ── clean up exactly what this run created ──────────────────────────────────
await db.journal.deleteMany({ where: { OR: [{ id: { in: made } }, { title: { startsWith: TAG } }] } });
await db.publisher.deleteMany({ where: { id: pub.id } });
await db.appSetting.deleteMany({ where: { key: 'REVIEW_JOURNAL_ANALYSIS' } });
await db.ingestionAudit.deleteMany({ where: { action: { in: ['REVIEW_JOURNAL_ASSIGNED', 'REVIEW_JOURNAL_BATCH_ASSIGN', 'REVIEW_JOURNAL_ANALYSIS'] } } });
eq('everything seeded was removed', await db.journal.count({ where: { title: { startsWith: TAG } } }), 0);
console.log(`\n${pass} passed, ${fail} failed`);
shut();
await db.$disconnect();
process.exit(fail ? 1 : 0);
