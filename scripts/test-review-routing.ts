/**
 * Review automation R3A — future-ingestion routing: gate, classification tiers, mutation safety, races, audit evidence, metrics, and the real harvest path.
 * Private throwaway database `stm_review_test` only (createdb stm_review_test && DATABASE_URL=.../stm_review_test npx prisma db push).
 *
 *   npx tsx scripts/test-review-routing.ts
 *
 * Fixture Books only. Proves that a newly written Draft is given a department only when it is High confidence under the approved rule AND still an undecided
 * ingested Draft with no department at the moment of writing; that Medium / Low / Unclassifiable books are left exactly as they were; that nothing is ever
 * published and no licence, access, rights, file or address changes; that the routing gate is separate from the assignment gate; and that the harvest's own
 * accounting and checkpoint behave the same with routing on and off.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_review_test');
for (const k of ['REVIEW_AUTO_ASSIGN_ENABLED', 'REVIEW_AUTO_ASSIGN_THRESHOLDS', 'REVIEW_AUTO_PUBLISH_ENABLED', 'REVIEW_INGEST_ROUTING_ENABLED', 'REVIEW_INGEST_ROUTING_CLASSIFIER']) delete process.env[k];
process.env.INGESTION_ADAPTIVE_SCHEDULER = '0';

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_review_test') throw new Error(`refusing to run against "${name}"`);
const R = await import('../src/lib/ingestion/reviewIngestRouting.js');
const { autoAssignEnabled } = await import('../src/lib/ingestion/reviewBatch.js');
const { harvestOai, DOAB_OAI } = await import('../src/lib/ingestion/books/oaiHarvest.js');
const { __useFetchForTests, __useSleepForTests } = await import('../src/lib/ingestion/sourceHealth.js');
const { CLASSIFIER_RULES_VERSION, ANALYSIS_CLASSIFIER_V2 } = await import('../src/lib/ingestion/books/classifier.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
__useSleepForTests(async () => {});

// ── Fixtures ────────────────────────────────────────────────────────────────
const TAG = `rt-${Date.now().toString(36)}`;
const dental = ['THEMA EDITEUR::M MEDICINE AND NURSING::MK MEDICAL SPECIALTIES::MKG DENTISTRY'];
type Seed = { title?: string; codes?: string[]; kw?: string[]; licence?: string | null; domain?: string | null; status?: string; note?: string | null; ownership?: string; source?: string; pdf?: string | null; year?: number | null };
const bookRow = (o: Seed) => ({
  id: randomUUID(), title: `${TAG} ${o.title ?? 'Dentistry Essentials'}`, status: o.status ?? 'Draft', ownershipSource: o.ownership ?? 'Ingested', source: o.source ?? 'DOAB', year: o.year === undefined ? 1995 : o.year,
  licence: o.licence === undefined ? 'CC BY' : o.licence, licenceIsNC: o.licence === 'CC BY-NC', rightsBasis: 'DOAB title licence', accessType: 'OpenAccess', accessStatus: 'LinkOnly', rightsStatus: 'MetadataOnly',
  originalUrl: `https://example.org/${randomUUID()}`, pdfUrl: o.pdf ?? null, language: 'en', domain: o.domain ?? null, rejectionNote: o.note ?? null,
  metadata: { keep: { a: 1 }, harvest: { classifications: o.codes ?? [], keywords: o.kw ?? [], provider: {}, department: { band: 'review', score: 1, suggested: 'Arts', runnerUp: null } } },
});
const made: string[] = [];
const one = async (o: Seed = {}) => { const r = bookRow(o); await db.book.create({ data: r as any }); made.push(r.id); return r.id; };
const high = (o: Seed = {}): Seed => ({ codes: dental, kw: ['dentistry', 'oral health'], ...o });
const medium = (o: Seed = {}): Seed => ({ kw: ['dental implants'], title: 'Dental Implants', ...o });
const low = (o: Seed = {}): Seed => ({ kw: ['law'], title: 'Untitled', ...o });
const none = (o: Seed = {}): Seed => ({ codes: [], kw: ['Africa'], title: 'Soro Soke', ...o });
const get = async (id: string) => (await db.$queryRawUnsafe(`select * from "Book" where id = $1`, id))[0];
const rights = (r: any) => JSON.stringify([r.status, r.licence, r.licenceIsNC, r.rightsBasis, r.rightsStatus, r.accessStatus, r.accessType, r.pdfUrl, r.originalUrl, r.rightsVerifiedAt, r.rightsVerifiedBy, r.source, r.year, r.rejectionNote]);
const APPROVED = JSON.stringify({ highMinScore: 6, highMinMargin: 3, highRequiresCode: true });
const on = (classifier = 'v1') => { process.env.REVIEW_INGEST_ROUTING_ENABLED = 'true'; process.env.REVIEW_INGEST_ROUTING_CLASSIFIER = classifier; process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = APPROVED; };
const off = () => { for (const k of ['REVIEW_AUTO_ASSIGN_ENABLED', 'REVIEW_AUTO_ASSIGN_THRESHOLDS', 'REVIEW_AUTO_PUBLISH_ENABLED', 'REVIEW_INGEST_ROUTING_ENABLED', 'REVIEW_INGEST_ROUTING_CLASSIFIER']) delete process.env[k]; };
const STATS = 'REVIEW_INGEST_ROUTING_STATS';
const resetStats = async () => { await db.appSetting.deleteMany({ where: { key: STATS } }); await db.ingestionAudit.deleteMany({ where: { action: 'REVIEW_INGEST_ROUTING' } }); };
const route = async (id: string, provider = 'DOAB') => { const s = R.routingSession(provider); await s.route(id); return s; };

await db.book.deleteMany({ where: { title: { startsWith: 'rt-' } } });
await resetStats();

// ── 1. The gate ─────────────────────────────────────────────────────────────
section('Feature gate');
off();
check('routing is off by default', R.routingConfig().enabled === false && R.routingConfig().ready === false);
const gId = await one(high());
const gBefore = JSON.stringify(await get(gId));
await route(gId);
eq('gate OFF: a High book is left exactly as it was', JSON.stringify(await get(gId)), gBefore);
process.env.REVIEW_AUTO_ASSIGN_ENABLED = 'true'; process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = APPROVED;
check('enabling historical ASSIGNMENT does not enable routing, and says the routing gate is off', R.routingConfig().ready === false && /disabled by configuration/.test(R.routingConfig().message || ''));
await route(gId);
eq('…and still nothing is routed', JSON.stringify(await get(gId)), gBefore);
off(); process.env.REVIEW_INGEST_ROUTING_ENABLED = 'true';
check('routing enabled alone is not enough: no classifier chosen', !R.routingConfig().ready && /classifier/.test(R.routingConfig().message || ''));
process.env.REVIEW_INGEST_ROUTING_CLASSIFIER = 'v3';
check('…and a classifier other than v1 or v2 is not a choice', !R.routingConfig().ready);
process.env.REVIEW_INGEST_ROUTING_CLASSIFIER = 'v1';
check('…and no approved thresholds: not ready, says why', !R.routingConfig().ready && /threshold/i.test(R.routingConfig().message || ''));
await route(gId);
eq('…so a High book is still untouched', JSON.stringify(await get(gId)), gBefore);
check('routing enabled does not enable historical assignment', autoAssignEnabled() === false);
on();
check('gate + classifier + approved thresholds → ready', R.routingConfig().ready === true && R.routingConfig().message === null);
off();

// ── 2. Tiers ────────────────────────────────────────────────────────────────
section('High → department assigned, stays Draft; everything else queued');
on(); await resetStats();
const t = { h: await one(high({ title: 'Tier high' })), m: await one(medium({ title: 'Dental Implants tier medium' })), l: await one(low({ title: 'Tier low' })), u: await one(none({ title: 'Tier none' })) };
const before = Object.fromEntries(await Promise.all(Object.entries(t).map(async ([k, id]) => [k, await get(id)])));
const sess = R.routingSession('DOAB');
for (const id of Object.values(t)) await sess.route(id);
await sess.flush();
const hh = await get(t.h);
eq('High: the suggested department was assigned', hh.domain, 'Dental');
eq('High: it is still a Draft', hh.status, 'Draft');
for (const k of ['m', 'l', 'u'] as const) eq(`${{ m: 'Medium', l: 'Low', u: 'Unclassifiable' }[k]}: no department, row unchanged`, JSON.stringify(await get(t[k])), JSON.stringify(before[k]));
const note = hh.metadata.reviewAssignment;
eq('evidence: action, classifier, version, tier, department, provider', [note.assignmentSource, note.classifier, note.classifierVersion, note.tier, note.department, note.provider], ['future-ingestion-routing', 'v1', CLASSIFIER_RULES_VERSION, 'high', 'Dental', 'DOAB']);
check('evidence: score and margin recorded', typeof note.topScore === 'number' && note.topScore >= 6 && typeof note.margin === 'number' && note.margin >= 3);
check('evidence: who and when', note.performedBy === 'system:ingestion-routing' && !Number.isNaN(Date.parse(note.performedAt)));
check('evidence: bounded (the whole note is small)', JSON.stringify(note).length < 700, String(JSON.stringify(note).length));
eq('every other metadata key is preserved', [hh.metadata.keep, hh.metadata.harvest.classifications], [{ a: 1 }, dental]);
eq('licence, access, rights, file, source and address are unchanged', rights(hh), rights(before.h));
eq('no publication: not Published, no publication note', [hh.status, 'reviewPublication' in hh.metadata], ['Draft', false]);
const tl = sess.tally!;
eq('metrics: classified 4, routed 1, medium 1, low 1, unclassifiable 1', [tl.classified, tl.routedHigh, tl.mediumQueued, tl.lowQueued, tl.unclassifiableQueued], [4, 1, 1, 1, 1]);
eq('metrics: nothing skipped, raced or failed', [tl.skipped, tl.races, tl.failed], [0, 0, 0]);

section('Statistics and audit');
const st = await R.routingStats();
eq('statistics were persisted for the page', [st!.totals.classified, st!.totals.routedHigh, st!.byProvider.DOAB.routedHigh, Object.values(st!.daily)[0].routedHigh], [4, 1, 1, 1]);
const aud = await db.ingestionAudit.findMany({ where: { action: 'REVIEW_INGEST_ROUTING' } });
eq('one bounded audit row for the page', aud.length, 1);
eq('…with counts, classifier and thresholds, and publishes:false', [aud[0].meta.routedHigh, aud[0].meta.classifier, aud[0].meta.classifierVersion, aud[0].meta.publishes, aud[0].meta.thresholds.highMinScore, aud[0].meta.action], [1, 'v1', 1, false, 6, 'future-ingestion-routing']);
check('…and carries no book titles or ids', !JSON.stringify(aud[0].meta).includes(TAG) && !JSON.stringify(aud[0].meta).includes(t.h));
const s2 = R.routingSession('DOAB'); await s2.route(await one(medium({ title: 'Dental Implants stats' }))); await s2.flush();
eq('a page with no assignment adds statistics but writes no audit row', [(await R.routingStats())!.totals.classified, await db.ingestionAudit.count({ where: { action: 'REVIEW_INGEST_ROUTING' } })], [5, 1]);

// ── 3. Never overwrite ──────────────────────────────────────────────────────
section('Existing decisions are never overwritten');
on(); await resetStats();
const p = {
  dept: await one(high({ title: 'Has dept', domain: 'Law' })), rej: await one(high({ title: 'Rejected', status: 'Rejected', note: 'dup' })), rejDraft: await one(high({ title: 'Draft with a note', note: 'dup' })),
  prot: await one(high({ title: 'Publisher', ownership: 'PublisherSubmitted' })), admin: await one(high({ title: 'Admin entered', ownership: 'AdminEntered' })), pub: await one(high({ title: 'Published', status: 'Published', domain: 'Dental' })),
};
const pb = Object.fromEntries(await Promise.all(Object.entries(p).map(async ([k, id]) => [k, JSON.stringify(await get(id))])));
const ps = R.routingSession('DOAB');
for (const id of Object.values(p)) await ps.route(id);
for (const [k, id] of Object.entries(p)) eq(`${k}: unchanged`, JSON.stringify(await get(id)), pb[k]);
eq('all six were skipped, none classified or assigned', [ps.tally!.skipped, ps.tally!.classified, ps.tally!.routedHigh], [6, 0, 0]);
eq('skip reasons are structured', Object.keys(ps.tally!.skippedReasons).sort(), ['already-has-department', 'not-a-draft', 'protected', 'rejected']);

// ── 4. Mutation-time safety ─────────────────────────────────────────────────
section('Revalidated at the moment of writing');
const cfg = R.routingConfig();
const plan = async (id: string) => (await R.classifyNewDraft(id, 'DOAB', cfg)) as any;
{
  const id = await one(high({ title: 'Race manual' }));
  const pl = await plan(id);
  eq('the plan is High → Dental', [pl.tier, pl.department], ['high', 'Dental']);
  await db.book.update({ where: { id }, data: { domain: 'Law' } });          // a person places it between the read and the write
  const o = await R.applyRouting(pl);
  eq('a manual assignment made in between wins; the routing is a race, nothing overwritten', [o.result, (await get(id)).domain, (await get(id)).metadata.reviewAssignment], ['race', 'Law', undefined]);
}
{
  const id = await one(high({ title: 'Changed classifier' }));
  const pl = await plan(id);
  await db.$executeRawUnsafe(`update "Book" set metadata = jsonb_set(metadata, '{harvest,classifications}', '[]'::jsonb) where id = $1`, id);   // the evidence the classification rested on is gone
  await db.$executeRawUnsafe(`update "Book" set title = 'Untitled', metadata = jsonb_set(metadata, '{harvest,keywords}', '["law"]'::jsonb) where id = $1`, id);
  const o: any = await R.applyRouting(pl);
  eq('the classification changed before the write → skipped, no department', [o.result, (await get(id)).domain], ['skipped', null]);
  check('…with a reason', typeof o.reason === 'string' && o.reason.length > 0, o.reason);
}
{
  const id = await one(high({ title: 'Rejected between' }));
  const pl = await plan(id);
  await db.book.update({ where: { id }, data: { status: 'Rejected', rejectionNote: 'bad' } });
  const o = await R.applyRouting(pl);
  eq('rejected in between → no department written', [o.result, (await get(id)).domain, (await get(id)).status], ['skipped', null, 'Rejected']);
}
{
  const id = await one(high({ title: 'Published between' }));
  const pl = await plan(id);
  await db.book.update({ where: { id }, data: { status: 'Published' } });
  const o = await R.applyRouting(pl);
  eq('published in between → no department written', [o.result, (await get(id)).domain], ['skipped', null]);
}
{
  const id = await one(high({ title: 'Simultaneous' }));
  const pl = await plan(id);
  const res = await Promise.all([1, 2, 3].map(() => R.applyRouting(pl)));
  eq('three simultaneous routings of one book: exactly one writes', res.filter(r => r.result === 'routed').length, 1);
  check('…the others were refused rather than overwriting', res.filter(r => r.result !== 'routed').every(r => r.result === 'race' || r.result === 'skipped'));
}

// ── 5. Idempotency ──────────────────────────────────────────────────────────
section('Idempotent');
{
  const id = await one(high({ title: 'Twice' }));
  await route(id);
  const first = JSON.stringify(await get(id));
  const s = await route(id);
  eq('routing the same book again changes nothing (note and time identical)', JSON.stringify(await get(id)), first);
  eq('…and is reported as skipped, not as a second assignment', [s.tally!.routedHigh, s.tally!.skipped, s.tally!.skippedReasons['already-has-department']], [0, 1, 1]);
}

// ── 6. Thresholds and classifier ────────────────────────────────────────────
section('Same configuration as Review Automation');
{
  process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = JSON.stringify({ highMinScore: 40, highMinMargin: 3, highRequiresCode: true });
  const id = await one(high({ title: 'Stricter rule' }));
  await route(id);
  eq('a stricter approved rule routes less: this book is no longer High', (await get(id)).domain, null);
  process.env.REVIEW_AUTO_ASSIGN_THRESHOLDS = APPROVED;
  process.env.REVIEW_INGEST_ROUTING_CLASSIFIER = 'v2';
  const id2 = await one(high({ title: 'Classifier two' }));
  await route(id2);
  const n = (await get(id2)).metadata.reviewAssignment;
  eq('the chosen classifier and its version are what is recorded (v2)', [n?.classifier, n?.classifierVersion], ['v2', ANALYSIS_CLASSIFIER_V2]);
  process.env.REVIEW_INGEST_ROUTING_CLASSIFIER = 'v1';
  eq('v1 stays version 1', CLASSIFIER_RULES_VERSION, 1);
}

// ── 7. The real harvest path ────────────────────────────────────────────────
section('Through the harvest (fake DOAB)');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f = (v: string) => `<field name="value">${esc(v)}</field>`;
type Spec = { handle: string; title: string; codes?: string[]; kw?: string[]; year?: string };
const rec = (s: Spec) => `<record><header><identifier>oai:directory.doabooks.org:${s.handle}</identifier><datestamp>2026-10-01T00:00:00Z</datestamp></header><metadata><metadata xmlns="http://www.lyncode.com/xoai">
<element name="dc"><element name="title"><element name="en_US">${f(s.title)}</element></element>
<element name="date"><element name="issued"><element name="none">${f(s.year || '2024-01-01')}</element></element></element>
<element name="language"><element name="en_US">${f('eng')}</element></element>
<element name="subject">${s.codes ? `<element name="classification"><element name="en_US">${s.codes.map(f).join('')}</element></element>` : ''}${s.kw ? `<element name="other"><element name="en_US">${f(s.kw.join('; '))}</element></element>` : ''}</element>
</element>
<element name="oapen"></element>
<element name="bundles"><element name="bundle"><field name="name">THUMBNAIL</field><element name="bitstreams"><element name="bitstream"><field name="format">image/jpeg</field><field name="url">https://x/cover.jpg</field><field name="rights">http://creativecommons.org/licenses/by/4.0/</field></element></element></element></element>
<element name="linkedItemsMetadata"><element name="publisher.name">${f('Test Press')}</element></element>
</metadata></metadata></record>`;
let catalogue: Spec[] = [];
const fake = async (url: string): Promise<Response> => {
  const tok = new URL(url).searchParams.get('resumptionToken');
  const start = tok ? Number(tok.split('/').pop()) : 0;
  if (!catalogue.length) return new Response('<OAI-PMH><error code="noRecordsMatch">none</error></OAI-PMH>', { status: 200 });
  const slice = catalogue.slice(start, start + 4);
  const more = start + 4 < catalogue.length;
  return new Response(`<OAI-PMH><ListRecords>${slice.map(rec).join('')}${more ? `<resumptionToken completeListSize="${catalogue.length}" cursor="${start}">xoai///set/${start + 4}</resumptionToken>` : `<resumptionToken completeListSize="${catalogue.length}"/>`}</ListRecords></OAI-PMH>`, { status: 200 });
};
__useFetchForTests(fake as any);
const H = (o: any = {}) => harvestOai(DOAB_OAI, { pageDelayMs: 0, sleep: async () => {}, ...o });
const cleanHarvest = async () => { await db.bookHarvestCheckpoint.deleteMany({ where: { provider: 'DOAB' } }); await db.ingestionSourceHealth.deleteMany({ where: { source: 'DOAB' } }); };
const mine = async () => db.book.findMany({ where: { title: { startsWith: `${TAG} H ` } }, orderBy: { title: 'asc' } });
const set = (suffix: string): Spec[] => [
  { handle: `${TAG}/${suffix}1`, title: `${TAG} H ${suffix} high old`, codes: dental, kw: ['dentistry', 'oral health'], year: '1990-01-01' },     // strong, but older than the policy year → a Draft
  { handle: `${TAG}/${suffix}2`, title: `${TAG} H ${suffix} high new`, codes: dental, kw: ['dentistry', 'oral health'], year: '2024-01-01' },     // strong and in policy → published by the harvest itself
  { handle: `${TAG}/${suffix}3`, title: `${TAG} H ${suffix} Dental Implants`, kw: ['dental implants'], year: '2024-01-01' },                         // words only → review (Medium)
  { handle: `${TAG}/${suffix}4`, title: `${TAG} H ${suffix} weak`, codes: ['THEMA EDITEUR::C LANGUAGE AND LINGUISTICS::CF LINGUISTICS'], kw: ['Syntaxe'], year: '2024-01-01' },
  { handle: `${TAG}/${suffix}5`, title: `${TAG} H ${suffix} old high two`, codes: dental, kw: ['dentistry', 'oral health'], year: '1985-01-01' },
];
await cleanHarvest();
off(); await resetStats();
catalogue = set('a');
const repOff = await H();
const rowsOff = await mine();
const counts = (r: any) => [r.added, r.queuedForReview, r.enriched, r.failed, r.newCandidates, r.accounting?.ok, r.completed];
const draftsOff = rowsOff.filter((b: any) => b.status === 'Draft');
check('gate OFF: the harvest wrote Published and Draft books as before', rowsOff.some((b: any) => b.status === 'Published') && draftsOff.length >= 2, `${rowsOff.length} rows, ${draftsOff.length} drafts`);
eq('gate OFF: no Draft has a department, no routing note, and the report has no routing section', [draftsOff.every((b: any) => !b.domain && !(b.metadata as any).reviewAssignment), repOff.routing], [true, undefined]);
eq('gate OFF: no routing statistics were written', await R.routingStats(), null);

// The books written while the gate was off are historical to routing: seeing them again never routes them.
on();
const repAgain = await H({ ignoreCheckpoint: true });
const dd = (b: any) => JSON.stringify([b.status, b.domain, (b.metadata as any).reviewAssignment ?? null]);
eq('gate ON, same records again: they are already held, so none is routed', [(await mine()).every((b: any) => dd(b) === dd(rowsOff.find((r: any) => r.id === b.id))), repAgain.routing?.routedHigh ?? 0], [true, 0]);

await cleanHarvest();
catalogue = set('b');
const repOn = await H();
const rowsB = (await mine()).filter((b: any) => b.title.includes(' b '));
const rowsA = await mine().then(rs => rs.filter((b: any) => b.title.includes(' a ')));
const byTitle = (rs: any[], s: string) => rs.find((b: any) => b.title.includes(s));
eq('gate ON: the High Drafts were given Dental and stay Drafts', [byTitle(rowsB, 'high old').domain, byTitle(rowsB, 'high old').status, byTitle(rowsB, 'old high two').domain, byTitle(rowsB, 'old high two').status], ['Dental', 'Draft', 'Dental', 'Draft']);
eq('gate ON: the evidence note names future-ingestion routing and the provider', [byTitle(rowsB, 'high old').metadata.reviewAssignment.assignmentSource, byTitle(rowsB, 'high old').metadata.reviewAssignment.provider], ['future-ingestion-routing', 'DOAB']);
eq('gate ON: the book the harvest published itself is not touched by routing', [byTitle(rowsB, 'high new').status, byTitle(rowsB, 'high new').metadata.reviewAssignment], ['Published', undefined]);
eq('gate ON: the Medium and weak Drafts are in the review queue with no department', [byTitle(rowsB, 'Dental Implants').status, byTitle(rowsB, 'Dental Implants').domain, byTitle(rowsB, 'weak')?.domain ?? null], ['Draft', null, null]);
eq('gate ON: the books written while it was OFF were not routed', rowsA.filter((b: any) => b.status === 'Draft').every((b: any) => !b.domain), true);
eq('the harvest\'s own counts are the same with routing on and off', counts(repOn), counts(repOff));
eq('…and the report carries the routing tally', [repOn.routing?.routedHigh, repOn.routing?.mediumQueued], [2, 1]);
const stH = await R.routingStats();
check('…and the statistics and one audit row for the page exist', stH?.totals.routedHigh === 2 && (await db.ingestionAudit.count({ where: { action: 'REVIEW_INGEST_ROUTING' } })) >= 1);
const shape = (b: any) => JSON.stringify([b.licence, b.licenceIsNC, b.rightsBasis, b.rightsStatus, b.accessStatus, b.accessType, b.pdfUrl, b.status, b.year, b.source]);
eq('a routed Draft differs from its un-routed twin (same record, gate off) only in its department and note: licence, access, rights, file, status, year and source are identical', [byTitle(rowsB, 'high old'), byTitle(rowsB, 'old high two')].map(shape), [byTitle(rowsA, 'high old'), byTitle(rowsA, 'old high two')].map(shape));
check('no book the harvest wrote is both routed and published', rowsB.every((b: any) => !(b.status === 'Published' && b.metadata.reviewAssignment)));
const cpOn = await db.bookHarvestCheckpoint.findUnique({ where: { provider: 'DOAB' } });
check('the checkpoint advanced exactly as in a normal run (completed, no cursor left)', repOn.completed === true && cpOn?.cursor == null && !!cpOn?.lastSuccessfulSyncAt);

// A failure in routing must not fail the harvest.
await cleanHarvest(); catalogue = set('c');
const realUpdate = db.book.update;
const origQuery = (db as any).$queryRawUnsafe.bind(db);
(db as any).$queryRawUnsafe = async (sql: string, ...a: any[]) => { if (/from "Book" where id = \$1/.test(sql) && /metadata->'harvest'->'classifications'/.test(sql)) throw new Error('boom'); return origQuery(sql, ...a); };
const repBoom = await H();
(db as any).$queryRawUnsafe = origQuery;
void realUpdate;
eq('routing that cannot read a book is counted as skipped and the harvest still completes with the same counts', [counts(repBoom).slice(0, 4), repBoom.completed, repBoom.routing?.routedHigh], [counts(repOff).slice(0, 4), true, 0]);
off();

// ── 8. Nothing else moved ───────────────────────────────────────────────────
section('Nothing else moved');
check('routing writes no publication audit and starts no review job', (await db.ingestionAudit.count({ where: { action: { in: ['REVIEW_PUBLISH_STARTED', 'REVIEW_PUBLISH_SELECTED', 'REVIEW_AUTO_ASSIGN_STARTED'] } } })) === 0);
check('classifier rules v1 and its version are unchanged', CLASSIFIER_RULES_VERSION === 1);

// ── clean up exactly what this run created ──────────────────────────────────
await db.book.deleteMany({ where: { OR: [{ id: { in: made } }, { title: { startsWith: TAG } }] } });
await cleanHarvest(); await resetStats();
eq('everything seeded was removed', await db.book.count({ where: { title: { startsWith: TAG } } }), 0);
console.log(`\n${pass} passed, ${fail} failed`);
off();
await db.$disconnect();
process.exit(fail ? 1 : 0);
