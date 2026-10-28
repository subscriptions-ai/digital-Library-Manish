/**
 * Controlled import of new journals from Crossref / OpenAlex — the plan (duplicate and conflict protection, department, publisher) and the insert script.
 * Private throwaway database `stm_doaj_held_test` only (createdb stm_doaj_held_test && DATABASE_URL=.../stm_doaj_held_test npx prisma db push).
 *
 *   npx tsx scripts/test-journal-source-import.ts
 *
 * Fixture journals only. Proves: an identifier held in EITHER column is a duplicate (ISSN↔ISSN, e-ISSN↔e-ISSN, ISSN↔e-ISSN, e-ISSN↔ISSN, ISSN-L); the same title under other identifiers is a
 * conflict that is never inserted (unless a "distinct" decision exists); no department, no publisher, a bad check digit and a non-target department are held out; and that the insert script
 * creates only MetadataOnly, open-access-not-verified journals, never Accepted, touches no existing row, re-checks the live table (a candidate taken since the plan is skipped), is bounded,
 * idempotent, honours --dry and --max, and writes an audit entry per batch.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_doaj_held_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_doaj_held_test') throw new Error(`refusing to run against "${name}"`);
const P = await import('../src/lib/ingestion/journalSourceImport.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);

// A valid ISSN from seven digits (the check digit is computed).
const mkIssn = (seven: string) => { let s = 0; for (let i = 0; i < 7; i++) s += Number(seven[i]) * (8 - i); const c = (11 - (s % 11)) % 11; return `${seven.slice(0, 4)}-${seven.slice(4)}${c === 10 ? 'X' : c}`; };
let seq = 4_000_000;
const issn = () => mkIssn(String((1_000_000 + ++seq * 7) % 10_000_000).padStart(7, '0'));
const TAG = `js${Date.now().toString(36)}`;

section('1. ISSN check digit');
check('real ISSNs are valid', P.validIssn('0317-8471') && P.validIssn('2049-3630') && P.validIssn('1050-124X'));
check('a wrong check digit, a short value and text are not', !P.validIssn('0317-8472') && !P.validIssn('0317-847') && !P.validIssn('abcd-efgh') && !P.validIssn(null));
check('a generated ISSN is valid', P.validIssn(issn()));

section('2. The plan');
const held = [
  { id: 'h1', title: `${TAG} Held Exact`, issn: issn(), eissn: issn(), status: 'Accepted' },
  { id: 'h2', title: `${TAG} Held Cross One`, issn: issn(), eissn: null, status: 'NeedsReview' },
  { id: 'h3', title: `${TAG} Held Cross Two`, issn: issn(), eissn: issn(), status: 'MetadataOnly' },
  { id: 'h4', title: `${TAG} Revista de Derecho`, issn: issn(), eissn: null, status: 'Accepted' },
  { id: 'h5', title: `${TAG} Rejected One`, issn: issn(), eissn: null, status: 'Rejected' },
];
const cand = (o: any) => ({ source: 'Crossref Journals' as const, title: `${TAG} X`, issn: issn(), eissn: null, publisherName: 'Some Publisher', country: null, homepage: null, subjects: [] as string[], ...o });
const NURS = { subjects: ['Nursing'] };
const new1 = cand({ title: `${TAG} Journal of Clinical Nursing Practice`, ...NURS });
const dupIssn = cand({ title: `${TAG} Other Name`, issn: held[0].issn, ...NURS });
const dupEissn = cand({ title: `${TAG} Another Name`, issn: issn(), eissn: held[0].eissn, ...NURS });
const crossA = cand({ title: `${TAG} Cross A Nursing Journal`, issn: issn(), eissn: held[1].issn, ...NURS });         // candidate e-ISSN = held ISSN
const crossB = cand({ title: `${TAG} Cross B Nursing Journal`, issn: held[2].eissn, eissn: null, ...NURS });          // candidate ISSN = held e-ISSN
const issnL = cand({ title: `${TAG} Linked Nursing Journal`, issn: issn(), issnL: held[0].issn, ...NURS });              // the linking ISSN names a held journal
const rejHeld = cand({ title: `${TAG} Rejected Again Nursing`, issn: held[4].issn, ...NURS });                           // a Rejected journal's identifier is still held
const sameTitle = cand({ title: `${TAG} Revista de Derecho`, ...NURS });
const sameTitlePunct = cand({ title: `${TAG}  REVISTA, de Derecho!`, ...NURS });
const noDept = cand({ title: `${TAG} Quarterly Review`, subjects: [] });
const noPub = cand({ title: `${TAG} Nursing Quarterly`, publisherName: null, ...NURS });
const badDigit = cand({ title: `${TAG} Bad Digit Nursing`, issn: '0317-8472', ...NURS });
const noIssn = cand({ title: `${TAG} No Issn Nursing`, issn: null, ...NURS });
const outside = cand({ title: `${TAG} Law Review of Contracts`, subjects: ['Law'] });
const twinA = cand({ title: `${TAG} Twin Nursing Journal`, issn: issn(), ...NURS });
const twinSame = { ...twinA, title: `${TAG} Twin Nursing Journal (copy)` };                                           // the same ISSN again in the batch
const twinTitle = cand({ title: `${TAG} Twin Nursing Journal`, issn: issn(), ...NURS });                                // the same title, other identifiers, in the batch
const all = [new1, dupIssn, dupEissn, crossA, crossB, issnL, rejHeld, sameTitle, sameTitlePunct, noDept, noPub, badDigit, noIssn, outside, twinA, twinSame, twinTitle];
const plan = P.planCandidates('Crossref Journals', all as any, held as any, { targets: ['Nursing', 'Dental'], skippedAtFetch: 2 });
const out = (c: any) => plan.samples && [...Object.values(plan.samples)].flat().find((p: any) => p.candidate === c)?.outcome;
const of = (c: any) => { for (const o of Object.keys(plan.counts)) for (const p of (plan.samples as any)[o] || []) if (p.candidate === c) return o; return null; };
eq('a genuinely new journal in a target department is ready', of(new1), 'ready');
eq('same ISSN as a held journal → duplicate', of(dupIssn), 'duplicate');
eq('same e-ISSN as a held journal → duplicate', of(dupEissn), 'duplicate');
eq('its e-ISSN is a held ISSN (cross-match) → duplicate', of(crossA), 'duplicate');
eq('its ISSN is a held e-ISSN (cross-match) → duplicate', of(crossB), 'duplicate');
eq('its ISSN-L names a held journal → duplicate', of(issnL), 'duplicate');
eq('an identifier held by a Rejected journal is still held → duplicate', of(rejHeld), 'duplicate');
eq('the same title under other identifiers → conflict, NOT inserted', of(sameTitle), 'conflict');
eq('…whatever the case or punctuation', of(sameTitlePunct), 'conflict');
eq('no department → review, not inserted', of(noDept), 'no_department');
eq('no publisher → not inserted', of(noPub), 'no_publisher');
eq('a bad check digit → malformed', of(badDigit), 'malformed');
eq('no usable ISSN → malformed', of(noIssn), 'malformed');
eq('a department that is not a target → reported, not inserted', of(outside), 'outside_target');
eq('the same ISSN twice in a batch → the second is a duplicate', of(twinSame), 'duplicate_in_batch');
eq('the same title twice in a batch, other identifiers → the second is a conflict', of(twinTitle), 'conflict');
eq('the counts add up to everything checked', Object.values(plan.counts).reduce((a: number, b: any) => a + b, 0), plan.checked);
eq('only the genuinely new one is in the ready list (and the first twin)', plan.ready.map((p: any) => p.candidate.title).sort(), [new1.title, twinA.title].sort());
const heldNursing = { id: 'h6', title: `${TAG} Nursing Review International`, issn: issn(), eissn: null, status: 'Accepted' };
const sameTitleNursing = cand({ title: heldNursing.title, ...NURS });
const heldPlus = [...held, heldNursing];
check('(control) without a decision it is a conflict', P.planCandidates('Crossref Journals', [sameTitleNursing] as any, heldPlus as any, { targets: ['Nursing'] }).counts.conflict === 1);
const withDecision = P.planCandidates('Crossref Journals', [sameTitleNursing] as any, heldPlus as any, { targets: ['Nursing'], decisions: [{ issn: sameTitleNursing.issn!, decision: 'distinct' }] });
check('a recorded "Accept as distinct" is the only thing that lets a same-title journal through', withDecision.counts.ready === 1);
check('"Keep blocked" and "Hold" do not', P.planCandidates('Crossref Journals', [sameTitleNursing] as any, heldPlus as any, { targets: ['Nursing'], decisions: [{ issn: sameTitleNursing.issn!, decision: 'blocked' }] }).counts.ready === 0);
check('every ready row carries department evidence (mapping and classifier view)', plan.ready.every((p: any) => p.department === 'Nursing' && p.evidence?.mapping === 'Nursing' && 'classifier' in p.evidence));

// ════════════════════════════════════════════════════════════════════════
section('3. The insert script, on a real database');
await db.$executeRawUnsafe(`truncate table "Article", "Journal", "IngestionAudit" restart identity cascade`).catch(async () => { await db.article.deleteMany({}); await db.journal.deleteMany({}); });
const mk = (j: any) => db.journal.create({ data: { title: j.title, issn: j.issn, eissn: j.eissn ?? null, status: j.status, licence: j.licence ?? 'CC BY', domain: j.domain ?? 'Law', publisherName: 'Held Pub', rightsBasis: 'DOAJ declaration', licenceIsNC: j.licenceIsNC ?? false } });
const H = [await mk({ title: `${TAG} Accepted Held`, issn: issn(), status: 'Accepted' }), await mk({ title: `${TAG} Review Held`, issn: issn(), status: 'NeedsReview', domain: null, licence: null }), await mk({ title: `${TAG} Rejected Held`, issn: issn(), status: 'Rejected', licence: null }), await mk({ title: `${TAG} Metadata Held`, issn: issn(), eissn: issn(), status: 'MetadataOnly', licenceIsNC: true })];
await db.article.create({ data: { title: 'held article', status: 'Published', journalId: H[0].id, fingerprint: `${TAG}-a`, doi: `10.9999/${TAG}` } });
const snap = async () => JSON.stringify((await db.journal.findMany({ where: { id: { in: H.map((h: any) => h.id) } }, orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 })));
const before = await snap(); const artBefore = await db.article.count();

const rows = Array.from({ length: 250 }, (_, i) => ({ title: `${TAG} New Nursing Journal ${i}`, issn: issn(), eissn: i % 2 ? issn() : null, publisherName: 'New Pub', subjects: ['Nursing'], domain: 'Nursing', sourceId: `s${i}`, evidence: { mapping: 'Nursing', classifier: { dept: 'Nursing', tier: 'medium', families: ['title'] } } }));
const dir = mkdtempSync(join(tmpdir(), 'jsi-'));
const run = (planObj: any, ...flags: string[]) => {
  const f = join(dir, `plan-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, JSON.stringify(planObj));
  const r = spawnSync('node', ['scripts/journal-source-apply.cjs', f, ...flags], { env: { ...process.env, DATABASE_URL: TEST_URL }, encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  try { return JSON.parse(r.stdout); } catch { return { error: r.stderr.slice(0, 400) }; }
};
const base = { runId: `test-${TAG}`, source: 'Crossref Journals' };
const dry = run({ ...base, rows }, '--dry');
check('--dry writes nothing and reports what it would insert', dry.dry === true && dry.inserted === 250 && (await db.journal.count({ where: { title: { startsWith: `${TAG} New Nursing` } } })) === 0, JSON.stringify(dry).slice(0, 200));
const r1 = run({ ...base, rows }, '--max=120');
check('--max bounds the run (120 of 250, in batches of at most 100)', r1.inserted === 120 && r1.batches === 2, JSON.stringify({ i: r1.inserted, b: r1.batches, e: r1.error }));
const r2 = run({ ...base, rows });
check('the rest go in, and rows already inserted are skipped, never duplicated (idempotent)', r2.inserted === 130 && r2.skippedIdentifierHeld === 120 && (await db.journal.count({ where: { title: { startsWith: `${TAG} New Nursing` } } })) === 250, JSON.stringify(r2).slice(0, 220));
const r3 = run({ ...base, rows });
check('running it again inserts nothing', r3.inserted === 0 && r3.skippedIdentifierHeld === 250);
const ins = await db.journal.findMany({ where: { title: { startsWith: `${TAG} New Nursing` } } });
check('EVERY inserted journal is MetadataOnly — none Accepted, none NeedsReview', ins.length === 250 && ins.every((j: any) => j.status === 'MetadataOnly'));
check('open access is NOT verified: openAccess false, no licence, no non-commercial verdict, no verifier, basis says so', ins.every((j: any) => j.openAccess === false && j.licence === null && j.licenceIsNC === null && j.rightsVerifiedBy === null && j.rightsVerifiedAt === null && j.rightsBasis === 'Crossref listing — OA unverified'));
check('each has its department, publisher, subjects and import time', ins.every((j: any) => j.domain === 'Nursing' && j.publisherName === 'New Pub' && Array.isArray(j.subjects) && j.createdAt));
check('no existing journal changed (status, licence, rights, department, ISSN, e-ISSN, title)', (await snap()) === before);
check('no article was created or changed', (await db.article.count()) === artBefore);
const dupIss: any[] = await db.$queryRawUnsafe(`select issn, count(*)::int n from "Journal" where issn is not null group by 1 having count(*) > 1`);
const crossDup: any[] = await db.$queryRawUnsafe(`select a.id from "Journal" a join "Journal" b on a.id < b.id and (a.issn = b.eissn or a.eissn = b.issn or (a.eissn is not null and a.eissn = b.eissn))`);
check('no duplicate ISSN, and no ISSN↔e-ISSN or e-ISSN↔e-ISSN collision was created', dupIss.length === 0 && crossDup.length === 0);
const audits = await db.ingestionAudit.findMany({ where: { action: 'JOURNAL_SOURCE_IMPORT' }, orderBy: { at: 'asc' } });
check('one audit entry per batch that inserted something (2 + 2), naming source, run, ids and department evidence', audits.length === 4 && audits.every((a: any) => (a.meta as any).source === 'Crossref Journals' && (a.meta as any).runId === base.runId && (a.meta as any).status === 'MetadataOnly' && Array.isArray((a.meta as any).inserted)) && (audits[0].meta as any).inserted.length === 100 && (audits[0].meta as any).inserted[0].evidence?.mapping === 'Nursing');

section('4. A candidate taken since the plan is skipped, not overwritten');
const late = [
  { title: `${TAG} Late Fresh`, issn: issn(), eissn: null, publisherName: 'P', subjects: [], domain: 'Dental' },
  { title: `${TAG} Late IssnTaken`, issn: H[0].issn, eissn: null, publisherName: 'P', subjects: [], domain: 'Dental' },
  { title: `${TAG} Late EissnTaken`, issn: issn(), eissn: H[3].eissn, publisherName: 'P', subjects: [], domain: 'Dental' },
  { title: `${TAG} Late CrossTaken`, issn: H[3].eissn, eissn: null, publisherName: 'P', subjects: [], domain: 'Dental' },
  { title: `${TAG} Accepted Held`, issn: issn(), eissn: null, publisherName: 'P', subjects: [], domain: 'Dental' },        // the same title as a held journal, other identifiers
];
const r4 = run({ ...base, rows: late });
eq('only the genuinely new one is inserted; three identifier collisions and one title collision are skipped', [r4.inserted, r4.skippedIdentifierHeld, r4.skippedTitleHeld, r4.failed], [1, 3, 1, 0]);
check('the held journals are still exactly as they were', (await snap()) === before);
check('a journal inserted by the script is hidden from nobody but is still MetadataOnly: the Dental one', (await db.journal.findFirst({ where: { title: `${TAG} Late Fresh` } }))?.status === 'MetadataOnly');

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
