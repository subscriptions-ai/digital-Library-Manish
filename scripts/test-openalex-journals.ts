/**
 * OpenAlex journal discovery: parsing, tiers, deduplication, enrichment limits, the checkpoint, 429, restart, completion.
 * Runs against the throwaway database `stm_ingestion_test` and refuses anything else. No network: pages and DOAJ answers are fixtures.
 *
 *   npx tsx scripts/test-openalex-journals.ts
 *
 * Every Journal it writes is tagged with this run's id and removed afterwards; the checkpoint row is the scratch database's own and is cleared.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
delete process.env.OPENALEX_API_KEY;
delete process.env.OPENALEX_JOURNALS_HISTORICAL;

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const O = await import('../src/lib/ingestion/openAlexJournals.js');
const { SourceError } = await import('../src/lib/ingestion/articleSources.js');
// Loading the ingestion database reads .env, which may now hold a real key; these tests are about the case with none, and must never send a real key anywhere.
delete process.env.OPENALEX_API_KEY;

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);

const TAG = `oaj${Date.now().toString(36)}`;
let seq = 0;
const issn = () => { const n = String(1000000 + (Date.now() % 800000) * 7 + ++seq * 13).slice(-7); return `${n.slice(0, 4)}-${n.slice(4)}X`; };
const made: string[] = [];
const hold = async (o: any) => { const r = await db.journal.create({ data: { title: `${TAG} held ${seq}`, status: 'Accepted', rightsBasis: 'DOAJ declaration', licence: 'CC BY', licenceIsNC: false, openAccess: true, ...o } }); made.push(r.id); return r; };
const raw = (o: any = {}) => ({
  id: `https://openalex.org/S${++seq}`, type: 'journal', display_name: `${TAG} source ${seq}`, issn_l: null, issn: [], host_organization_name: 'Test Press', country_code: 'IN',
  homepage_url: 'https://example.org', is_oa: true, is_in_doaj: false, works_count: 120, oa_works_count: 120, first_publication_year: 2001, last_publication_year: 2025,
  topics: [{ display_name: 'Test topic' }], updated_date: '2026-10-25T10:00:00', ...o,
});
const cand = (o: any = {}) => O.parseSources([raw(o)]).candidates[0];
const page = (results: any[], next: string | null, total = 1000) => { const { candidates, skips } = O.parseSources(results); return { candidates, fetched: results.length, skips, total, next } as any; };
const noVerify: any = async () => ({ found: false });
const clearState = () => db.appSetting.deleteMany({ where: { key: 'ingestion.openalex-journals.v1' } });
const snapshot = async () => JSON.stringify((await db.journal.findMany({ where: { id: { in: made } }, orderBy: { id: 'asc' } })).map((j: any) => ({ ...j, updatedAt: 0 })));

try {
  await clearState();

  section('Reading a page');
  const mixed = O.parseSources([
    raw({ issn_l: '1111-2222', issn: ['1111-2222'] }), raw({ type: 'repository', issn_l: '3333-4444', issn: ['3333-4444'] }), raw({ is_oa: false, issn_l: '5555-6666', issn: ['5555-6666'] }),
    raw({ issn_l: null, issn: [] }), raw({ display_name: '  ', issn_l: '7777-8888', issn: ['7777-8888'] }), raw({ is_oa: false, is_in_doaj: true, issn_l: '9999-0000', issn: ['9999-0000'] }),
  ]);
  eq('only the journal with a usable title, ISSN and openness is a candidate', mixed.candidates.map((c: any) => c.issnL), ['1111-2222', '9999-0000']);
  eq('a repository is counted as not-a-journal, never read as one', mixed.skips.notJournal, 1);
  eq('a non-open-access source is counted and dropped (tier C)', mixed.skips.notOa, 1);
  eq('a source with no ISSN is counted and dropped', mixed.skips.noIssn, 1);
  eq('a source with no title is counted and dropped', mixed.skips.noTitle, 1);
  eq('tiers: DOAJ-listed is A, open access only is B, neither is C', [O.tierOf({ isOa: true, isInDoaj: true }), O.tierOf({ isOa: true, isInDoaj: false }), O.tierOf({ isOa: false, isInDoaj: false })], ['A', 'B', 'C']);
  eq('ISSN-L and other ISSNs are normalised and de-duplicated', cand({ issn_l: '1234 5678', issn: ['1234-5678', '8765–4321'] }).issns, ['1234-5678', '8765-4321']);
  eq('the query is the journal-source query, by cursor, 100 a page', [O.OA_FILTER, O.PAGE_SIZE], ['type:journal,is_oa:true,has_issn:true', 100]);

  section('Deduplication — nothing held is created twice or overwritten');
  const a = issn(), e = issn(), p = issn();
  const byL = await hold({ issn: a, title: `${TAG} Alpha Journal`, publisherName: 'Held Press', homepage: 'https://held.example' });
  let plan = await O.planPage([cand({ display_name: `${TAG} Alpha Journal`, issn_l: a, issn: [a] })], { verify: noVerify });
  eq('ISSN-L duplicate → duplicate, not new', [plan[0].kind, (plan[0] as any).existingId === byL.id], ['duplicate', true]);
  const both = await hold({ issn: p, eissn: e, title: `${TAG} Beta Review` });
  plan = await O.planPage([cand({ display_name: `${TAG} Beta Review`, issn_l: issn(), issn: [e] })], { verify: noVerify });
  eq('eISSN duplicate → matched on the held eissn', [plan[0].kind, (plan[0] as any).existingId === both.id], ['duplicate', true]);
  plan = await O.planPage([cand({ display_name: `${TAG} Beta Review`, issn_l: e, issn: [e, p] })], { verify: noVerify });
  eq('pISSN duplicate → matched on the held issn', [plan[0].kind, (plan[0] as any).existingId === both.id], ['duplicate', true]);
  const byTitle = await hold({ issn: issn(), title: `${TAG} Gamma Studies`, publisherName: 'Gamma Press' });
  plan = await O.planPage([cand({ display_name: `${TAG} Gamma Studies`, host_organization_name: 'Gamma Press', issn_l: issn(), issn: [] })], { verify: noVerify });
  eq('same title + publisher under unknown ISSNs → held (cautious fallback), never created', [plan[0].kind, (plan[0] as any).by, (plan[0] as any).existingId === byTitle.id], ['duplicate', 'title', true]);
  eq('…and a title match writes nothing to the held journal', (plan[0] as any).enrich, {});
  plan = await O.planPage([cand({ display_name: `${TAG} Gamma Studies`, host_organization_name: 'Someone Else', issn_l: issn(), issn: [] })], { verify: noVerify });
  eq('the same title from a different publisher is NOT treated as the same journal', plan[0].kind, 'new');
  const ids = [raw({ issn_l: issn(), issn: [] })]; ids.push({ ...ids[0] });
  plan = await O.planPage(O.parseSources(ids.map((r, i) => ({ ...r, issn: [], issn_l: ids[0].issn_l }))).candidates, { verify: noVerify });
  eq('the same journal twice on one page is created once', plan.map((d: any) => d.kind), ['new', 'skip']);

  section('Tiers — what is written for a new journal');
  const verdictAccept: any = async () => ({ found: true, status: 'Accepted', licence: 'CC BY', licenceIsNC: false, subjects: ['Medicine'], publisherName: 'DOAJ Press' });
  const verdictNC: any = async () => ({ found: true, status: 'MetadataOnly', licence: 'CC BY-NC', licenceIsNC: true, subjects: [] });
  plan = await O.planPage([cand({ is_in_doaj: true, display_name: `${TAG} Delta Medical Journal`, issn_l: issn(), issn: [] })], { verify: verdictAccept });
  eq('tier A confirmed by DOAJ with a commercial-use licence → Accepted by the DOAJ rule', [(plan[0] as any).row.status, (plan[0] as any).row.rightsBasis, (plan[0] as any).doajConfirmed], ['Accepted', 'DOAJ declaration', true]);
  plan = await O.planPage([cand({ is_in_doaj: true, issn_l: issn(), issn: [] })], { verify: verdictNC });
  eq('tier A confirmed but non-commercial → MetadataOnly, never Accepted', [(plan[0] as any).row.status, (plan[0] as any).row.licenceIsNC], ['MetadataOnly', true]);
  plan = await O.planPage([cand({ is_in_doaj: true, issn_l: issn(), issn: [] })], { verify: noVerify });
  eq('tier A that DOAJ cannot confirm → treated as OA-unverified, never Accepted', [(plan[0] as any).row.status === 'Accepted', (plan[0] as any).row.rightsBasis, (plan[0] as any).row.openAccess], [false, 'OpenAlex listing — OA unverified', false]);
  plan = await O.planPage([cand({ display_name: `${TAG} Epsilon Nursing Journal`, issn_l: issn(), issn: [] })], { verify: verdictAccept });
  eq('tier B (open access, not DOAJ) is never Accepted and never asks DOAJ', [(plan[0] as any).row.status === 'Accepted', (plan[0] as any).doajConfirmed], [false, false]);
  eq('tier B with title, ISSN, publisher and a supported department → MetadataOnly, OA unverified', [(plan[0] as any).row.status, (plan[0] as any).row.openAccess, (plan[0] as any).department], ['MetadataOnly', false, 'Nursing']);
  plan = await O.planPage([cand({ host_organization_name: null, display_name: `${TAG} Zeta Nursing Journal`, issn_l: issn(), issn: [] })], { verify: noVerify });
  eq('tier B with no publisher → NeedsReview', (plan[0] as any).row.status, 'NeedsReview');
  plan = await O.planPage([cand({ display_name: `${TAG} Eta Quarterly`, topics: [], issn_l: issn(), issn: [] })], { verify: noVerify });
  eq('no department the evidence supports → unassigned (domain null) and held for review, not guessed', [(plan[0] as any).department, (plan[0] as any).row.domain, (plan[0] as any).row.status], [null, null, 'NeedsReview']);
  const tierC = { ...cand({ issn_l: issn(), issn: [] }), tier: 'C' as const, isOa: false };
  eq('a tier-C candidate that somehow reaches the planner is skipped', (await O.planPage([tierC], { verify: noVerify }))[0].kind, 'skip');

  section('Conflicts and enrichment limits');
  const k = issn();
  const rich = await hold({ issn: k, title: `${TAG} Theta Journal`, publisherName: 'Real Publisher', country: 'GB', homepage: null, eissn: null, subjects: [], domain: null });
  plan = await O.planPage([cand({ display_name: `${TAG} Theta Journal`, issn_l: k, issn: [k, issn()], host_organization_name: 'Other Name', country_code: 'US', homepage_url: 'https://theta.example', topics: [{ display_name: 'Nursing practice' }, { display_name: 'Nursing education' }] })], { verify: noVerify });
  const en = (plan[0] as any).enrich;
  eq('only empty fields are filled (eissn, homepage, subjects, department)', Object.keys(en).sort(), ['domain', 'eissn', 'homepage', 'subjects']);
  check('a held publisher and country are never overwritten', !('publisherName' in en) && !('country' in en));
  check('status, licence and access are never in an enrichment', !('status' in en) && !('licence' in en) && !('openAccess' in en) && !('rightsBasis' in en) && !('startYear' in en));
  plan = await O.planPage([cand({ display_name: `Completely Different Name ${TAG}`, issn_l: k, issn: [k] })], { verify: noVerify });
  eq('ISSN matches but the titles disagree → a conflict, and NOTHING is enriched', [(plan[0] as any).conflict !== null, (plan[0] as any).enrich], [true, {}]);
  const x1 = issn(), x2 = issn(); await hold({ issn: x1, title: `${TAG} Iota One` }); await hold({ issn: x2, title: `${TAG} Iota Two` });
  plan = await O.planPage([cand({ display_name: `${TAG} Iota One`, issn_l: x1, issn: [x1, x2] })], { verify: noVerify });
  eq('ISSNs matching two different held journals → a conflict, nothing changed', [(plan[0] as any).conflict, (plan[0] as any).enrich], ['its ISSNs match two different journals we hold', {}]);
  const ours = await hold({ issn: issn(), title: `${TAG} Kappa Ours`, rightsBasis: 'our own', homepage: null });
  plan = await O.planPage([cand({ display_name: `${TAG} Kappa Ours`, issn_l: ours.issn, issn: [ours.issn] })], { verify: noVerify });
  eq('a journal we own by agreement is never enriched', (plan[0] as any).enrich, {});

  section('Writing a plan: held journals are untouched except empty fields');
  const w1 = issn(); const target = await hold({ issn: w1, title: `${TAG} Lambda Journal`, homepage: null, publisherName: 'Keep Me', status: 'Accepted' });
  const before = await db.journal.findUnique({ where: { id: target.id } });
  const wp = page([raw({ display_name: `${TAG} Lambda Journal`, issn_l: w1, issn: [w1], homepage_url: 'https://lambda.example', host_organization_name: 'Overwrite Attempt', is_in_doaj: false })], null);
  const wc = await O.applyPlan(await O.planPage(wp.candidates, { verify: noVerify }), wp);
  const after = await db.journal.findUnique({ where: { id: target.id } });
  eq('the empty homepage was filled', after.homepage, 'https://lambda.example');
  eq('the held publisher was kept', after.publisherName, 'Keep Me');
  eq('an Accepted journal stays Accepted, licence and access untouched', [after.status, after.licence, after.openAccess, after.rightsBasis], [before.status, before.licence, before.openAccess, before.rightsBasis]);
  eq('counted as one enrichment, no new journal', [wc.enriched, wc.createdAccepted + wc.createdMetadataOnly + wc.createdNeedsReview], [1, 0]);
  const np = page([raw({ display_name: `${TAG} Mu Nursing Journal`, issn_l: issn(), issn: [] })], null);
  const nc = await O.applyPlan(await O.planPage(np.candidates, { verify: noVerify }), np);
  const created = await db.journal.findFirst({ where: { title: `${TAG} Mu Nursing Journal` } }); if (created) made.push(created.id);
  eq('a new tier-B journal is written MetadataOnly with its basis stated', [created?.status, created?.rightsBasis, created?.openAccess, nc.newReview], ['MetadataOnly', 'OpenAlex listing — OA unverified', false, 1]);

  section('The checkpoint: resume, duplicates, 429, restart, completion');
  await clearState();
  const dupIssn = issn(); const dupHeld = await hold({ issn: dupIssn, title: `${TAG} Nu Held`, homepage: 'https://nu.example', publisherName: 'P', country: 'IN', eissn: null, subjects: ['x'], domain: 'Nursing' });
  const dupPage = (next: string | null) => page([raw({ display_name: `${TAG} Nu Held`, issn_l: dupIssn, issn: [dupIssn], is_in_doaj: true })], next);
  const newPage = (next: string | null, n = 2) => page(Array.from({ length: n }, () => raw({ display_name: `${TAG} Nursing Journal ${++seq}`, issn_l: issn(), issn: [] })), next);
  const calls: (string | null)[] = [];
  const pages: Record<string, any> = { '': dupPage('c1'), c1: dupPage('c2'), c2: newPage(null) };
  const fetchPage = async (cur: string | null) => { calls.push(cur); return pages[cur ?? '']; };
  const common = { fetchPage, verify: noVerify, paceMs: 0, sleep: async () => {} };
  let r = await O.runHistorical({ ...common, maxPages: 1 });
  eq('the first page is read from the start (no cursor)', calls, [null]);
  eq('a page that is 100% duplicates still moves the cursor on', (await O.loadState(db)).baseline.cursor, 'c1');
  eq('…and counted as duplicates, nothing new', [r.counters.existing, r.counters.createdMetadataOnly + r.counters.createdNeedsReview + r.counters.createdAccepted], [1, 0]);
  const restartCalls: (string | null)[] = [];
  r = await O.runHistorical({ ...common, fetchPage: async (c: string | null) => { restartCalls.push(c); return pages[c ?? '']; }, maxPages: 1 });
  eq('after a "restart" (new run, state only in the database) it resumes at c1, not at the start', restartCalls, ['c1']);
  eq('the cursor is now c2 and the walk is not complete', [(await O.loadState(db)).baseline.cursor, r.completed], ['c2', false]);

  // 429 with Retry-After: no movement, cooldown, then it waits exactly that long.
  const retryAt = new Date(Date.now() + 10 * 60_000);
  const throttled = async () => { throw Object.assign(new SourceError('OpenAlex', 'OpenAlex answered HTTP 429 (rate limited)', 'rate_limited', 429), { retryAt }); };
  r = await O.runHistorical({ ...common, fetchPage: throttled, maxPages: 1 });
  let st = await O.loadState(db);
  eq('a 429 stops the run without moving the cursor', [r.status, st.baseline.cursor], ['rate-limited', 'c2']);
  eq('…and the cooldown is the Retry-After the source gave', new Date(st.nextEligibleAt!).getTime(), retryAt.getTime());
  const spy: (string | null)[] = [];
  r = await O.runHistorical({ ...common, fetchPage: async (c: string | null) => { spy.push(c); return pages[c ?? '']; }, maxPages: 1 });
  eq('while cooling down it makes no request at all', [r.status, spy.length], ['cooling', 0]);
  r = await O.runHistorical({ ...common, now: new Date(retryAt.getTime() + 1000), maxPages: 1 });
  eq('after the cooldown it carries on from the same place and finishes the sweep', [r.status, r.completed, calls[calls.length - 1]], ['ran', true, 'c2']);
  st = await O.loadState(db);
  check('a full sweep records a completed baseline', !!st.baseline.completedAt && st.baseline.cursor === null);
  const baselineAt = st.baseline.completedAt;
  eq('the new journals on the last page were created', r.counters.createdMetadataOnly + r.counters.createdNeedsReview, 2);
  for (const j of await db.journal.findMany({ where: { title: { startsWith: `${TAG} Nursing Journal` } }, select: { id: true } })) made.push(j.id);

  const idle: (string | null)[] = [];
  r = await O.runHistorical({ ...common, fetchPage: async (c: string | null) => { idle.push(c); return pages[c ?? '']; }, maxPages: 5 });
  eq('after completion it does NOT start again from page 1: monitoring, no request', [r.status, idle.length], ['monitoring', 0]);
  const stat = await O.historicalStatus(db);
  eq('and the card says so, not "exhausted for now"', stat.headline, 'Historical journal discovery complete — incremental monitoring active');
  const later = new Date(Date.now() + 31 * 86_400_000);
  const inc: (string | null)[] = [];
  r = await O.runHistorical({ ...common, now: later, fetchPage: async (c: string | null) => { inc.push(c); return page([], null); }, maxPages: 1 });
  st = await O.loadState(db);
  eq('a later incremental pass walks from the start on its own checkpoint', [r.status, r.walk, inc], ['ran', 'incremental', [null]]);
  eq('the baseline is never reset by it', st.baseline.completedAt, baselineAt);
  eq('the incremental pass is recorded', [st.incremental.runs, !!st.incremental.lastCompletedAt], [1, true]);

  section('Refusals that must not restart or spam');
  await clearState();
  r = await O.runHistorical({ ...common, fetchPage: async () => { throw new SourceError('OpenAlex', 'OpenAlex answered HTTP 400', 'unavailable', 400); }, maxPages: 1 });
  eq('a cursor OpenAlex refuses stops the walk for a person (it never restarts from the first page)', [r.status, !!(await O.loadState(db)).needsAttention], ['needs-attention', true]);
  const gate: (string | null)[] = [];
  r = await O.runHistorical({ ...common, fetchPage: async (c: string | null) => { gate.push(c); return pages['']; }, maxPages: 1 });
  eq('and stays stopped on the next call, with no request', [r.status, gate.length], ['needs-attention', 0]);
  await clearState();
  r = await O.runHistorical({ maxPages: 1, db });
  eq('with no OpenAlex API key the walk does not start and makes no request', [r.status, !!r.error], ['needs-key', true]);
  eq('the status says what is missing', (await O.historicalStatus(db)).state, 'needs-key');
  await O.setPaused(true, db);
  eq('a paused walk makes no request', (await O.runHistorical({ ...common, maxPages: 1 })).status, 'paused');
  await clearState();
  r = await O.runHistorical({ ...common, fetchPage: async () => { throw new SourceError('OpenAlex', 'OpenAlex did not answer', 'unavailable', 503); }, maxPages: 1 });
  eq('a source outage backs off and moves nothing', [r.status, (await O.loadState(db)).baseline.cursor, !!(await O.loadState(db)).nextEligibleAt], ['failed', null, true]);
  eq('the engine uses the historical mode only when switched on', O.historicalEnabled(), false);

  section('No existing Journal was changed beyond empty fields');
  const frozen = await db.journal.findUnique({ where: { id: dupHeld.id } });
  eq('the journal the duplicate-only pages kept meeting is unchanged', [frozen.title, frozen.status, frozen.licence, frozen.homepage, frozen.publisherName, frozen.domain], [dupHeld.title, 'Accepted', 'CC BY', 'https://nu.example', 'P', 'Nursing']);
  const acc = await db.journal.findMany({ where: { id: { in: made }, rightsBasis: 'DOAJ declaration', status: 'Accepted' }, select: { id: true } });
  check('every journal this test held as Accepted is still Accepted', acc.length >= 8, `${acc.length} still Accepted`);
} finally {
  await clearState();
  await db.journal.deleteMany({ where: { title: { startsWith: TAG } } });
  const left = await db.journal.count({ where: { title: { startsWith: TAG } } });
  check('the test removed every journal it wrote', left === 0);
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
