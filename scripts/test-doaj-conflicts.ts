/**
 * DOAJ identity conflicts — a DOAJ journal whose ISSN and e-ISSN we do not hold but whose TITLE is a held journal's: the comparison, the verdict, and the recorded decision.
 * Private throwaway database `stm_doaj_held_test` only (createdb stm_doaj_held_test && DATABASE_URL=.../stm_doaj_held_test npx prisma db push).
 *
 *   npx tsx scripts/test-doaj-conflicts.ts
 *
 * Fixture journals only. Proves the evidence is read correctly (a country code and a country name are one country; "BMC" and "BioMed Central" are one publisher; one
 * university's name inside another's is not the same publisher; ISSNs issued close together count, a shared national block does not), that a thin held record never alone proves a
 * journal "distinct", that a decision is a record that creates and changes NO journal, that it is audited, refused when the evidence changed, and shown as "look again" afterwards.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_doaj_held_test');
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_doaj_held_test') throw new Error(`refusing to run against "${name}"`);
const C = await import('../src/lib/ingestion/doajConflicts.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
const status = async (fn: () => Promise<any>) => { try { await fn(); return 0; } catch (e: any) { return e?.status || -1; } };

// ════════════════════════════════════════════════════════════════════════
section('1. Reading the evidence');
eq('a country code and a country name are one country', [C.sameCountryName('UY', 'Uruguay'), C.sameCountryName('MD', 'Moldova, Republic of'), C.sameCountryName('PE', 'Peru'), C.sameCountryName('PE', 'Brazil'), C.sameCountryName(null, 'Peru')], [true, true, true, false, null]);
eq('"BMC" and "BioMed Central" are one publisher; so are "MDPI" and "MDPI AG"', [C.comparePublishers('BMC', 'BioMed Central').same, C.comparePublishers('MDPI', 'MDPI AG').same], [true, true]);
eq('the same name with a corporate suffix is the same publisher', C.comparePublishers('Dove Medical Press', 'Dove Medical Press Ltd').same, true);
const uni = C.comparePublishers('Universidad de Concepción', 'Universidad Católica de la Santísima Concepción');
check('one university\'s name inside another\'s is NOT the same publisher (similar, so it is shown as ambiguous)', uni.same === false && uni.similar === true);
check('unrelated publishers are neither the same nor similar', (() => { const r = C.comparePublishers('Alpha University', 'Beta Institute'); return r.same === false && r.similar === false; })());
check('a missing publisher is unknown, not different', C.comparePublishers(null, 'Beta').same === null);
const same = C.hostAndPath('https://www.Journal.example/ojs/index.php/'); const same2 = C.hostAndPath('http://journal.example/ojs/index.php');
check('web addresses compare by host and path, not by scheme, "www" or a trailing index', JSON.stringify(same) === JSON.stringify(same2));

// ════════════════════════════════════════════════════════════════════════
section('2. The verdicts (fixtures through the real check)');
await db.$executeRawUnsafe(`truncate table "Article", "Journal", "IngestionPreview", "AppSetting" restart identity cascade`).catch(async () => { await db.article.deleteMany({}); await db.journal.deleteMany({}); await db.ingestionPreview.deleteMany({}); });
const TAG = `dc${Date.now().toString(36)}`;
let seq = 2000;
const issn = () => { seq += 137; const d = String(seq).padStart(7, '0'); return `${d.slice(0, 4)}-${d.slice(4, 7)}${seq % 10}`; };
type H = { title: string; issn: string; eissn?: string | null; publisher?: string | null; country?: string | null; homepage?: string | null; basis?: string; status?: string };
const mk = (h: H) => db.journal.create({ data: { title: h.title, issn: h.issn, eissn: h.eissn ?? null, publisherName: h.publisher ?? null, country: h.country ?? null, homepage: h.homepage ?? null, status: h.status ?? 'Accepted', rightsBasis: h.basis ?? 'DOAJ declaration', licence: 'CC BY', domain: 'Law' } });
const CROSSREF = 'Crossref listing — OA unverified';

const H_HEAD = 'Journal title,Journal URL,URL in DOAJ,Alternative title,Journal ISSN (print version),Journal EISSN (online version),Keywords,Languages in which the journal accepts manuscripts,Publisher,Country of publisher,Journal license,License attributes,Continues,Continued By,LCC Codes,Subjects';
const row = (title: string, p: string, e: string, o: { pub?: string; country?: string; url?: string; continues?: string } = {}) => [title, o.url ?? 'https://x.example/j', `https://doaj.org/toc/${p.replace('-', '')}`, '', p, e, '', 'EN', o.pub ?? 'Pub', o.country ?? 'India', 'CC BY', '', o.continues ?? '', '', '', 'Law'].map(x => `"${x}"`).join(',');

const T = (n: number) => `${TAG} Title ${n}`;
const I = Object.fromEntries(['dupPub', 'cont', 'distinct', 'weak', 'alias', 'near', 'nearHeld', 'farHeld', 'far', 'overlapHeld', 'overlap', 'multiA', 'multiB', 'noPub', 'homeHeld', 'home', 'contHeld', 'news', 'heldBy'].map(k => [k, issn()]));
const N = Object.fromEntries(['dupPub', 'cont', 'distinct', 'weak', 'alias', 'near', 'far', 'overlap', 'multi', 'noPub', 'home', 'fresh'].map(k => [k, issn()]));
const near = (s: string) => { const body = Number(s.replace('-', '').slice(0, 7)) + 8; const d = String(body).padStart(7, '0'); return `${d.slice(0, 4)}-${d.slice(4)}1`; };    // 8 numbers on

const jDup = await mk({ title: T(1), issn: I.dupPub, publisher: 'Acme Press', country: 'GB' });
const jCont = await mk({ title: T(2), issn: I.cont, eissn: I.contHeld, publisher: 'Old House', country: 'US' });
const jDistinct = await mk({ title: T(3), issn: I.distinct, publisher: 'Alpha University', country: 'PE' });
const jWeak = await mk({ title: T(4), issn: I.weak, publisher: 'Old Pub', basis: CROSSREF, status: 'NeedsReview' });
const jAlias = await mk({ title: T(5), issn: I.alias, publisher: 'BioMed Central', basis: CROSSREF, status: 'NeedsReview' });
const jNear = await mk({ title: T(6), issn: I.nearHeld, publisher: 'First Publisher', basis: CROSSREF, status: 'NeedsReview' });
const jFar = await mk({ title: T(7), issn: I.farHeld.replace(/^\d{4}/, '1510'), publisher: 'Universidad Catolica del Uruguay', country: 'UY' });
const jOver = await mk({ title: T(8), issn: I.overlapHeld, publisher: 'Universidad de Concepción', country: 'CL' });
const jMultiA = await mk({ title: T(9), issn: I.multiA, publisher: 'Unrelated Society', country: 'ZA' });
const jMultiB = await mk({ title: T(9), issn: I.multiB, publisher: 'Gamma Press', country: 'KE' });
const jNoPub = await mk({ title: T(10), issn: I.noPub, publisher: null, country: 'PE' });
const jHome = await mk({ title: T(11), issn: I.homeHeld, publisher: 'Some Society', country: 'AU', homepage: 'http://www.homepage.example/journal/' });
const nearIssn = near(I.nearHeld);
const farIssn = '1510-5172';

const csv = [H_HEAD,
  row(T(1), N.dupPub, '', { pub: 'Acme Press Ltd', country: 'United Kingdom' }),                                        // 1 same publisher, same country → duplicate
  row(T(2), N.cont, '', { pub: 'New House', country: 'United States', continues: I.cont }),                                // 2 DOAJ says it continues a held ISSN → duplicate
  row(T(3), N.distinct, '', { pub: 'Beta Institute', country: 'Brazil' }),                                                // 3 different publisher and country, held is from DOAJ → distinct
  row(T(4), N.weak, '', { pub: 'New Pub', country: 'India' }),                                                           // 4 different publisher, but the held record is a thin listing → ambiguous
  row(T(5), N.alias, '', { pub: 'BMC', country: 'United Kingdom' }),                                                      // 5 BMC = BioMed Central → duplicate
  row(T(6), nearIssn, '', { pub: 'Second Publisher', country: 'India' }),                                                 // 6 ISSN eight numbers on, thin held record → duplicate
  row(T(7), farIssn, '', { pub: 'Universidad de Montevideo', country: 'Uruguay' }),                                       // 7 same national block 1510-, far apart, both Uruguay → distinct
  row(T(8), N.overlap, '', { pub: 'Universidad Católica de la Santísima Concepción', country: 'Chile' }),                 // 8 overlapping university names → ambiguous
  row(T(9), N.multi, '', { pub: 'Gamma Press', country: 'Kenya' }),                                                       // 9 two held with this title: one is the same publisher → duplicate, against the second
  row(T(10), N.noPub, '', { pub: 'Delta', country: 'Chile', url: 'https://delta.example/j' }),                            // 10 held has no publisher → ambiguous
  row(T(11), N.home, '', { pub: 'Other Body', country: 'Canada', url: 'https://homepage.example/journal' }),              // 11 the very same web address → duplicate
  row(`${TAG} A New Title`, N.fresh, '', {}),                                                                             // not a conflict: nothing held under this title
  row(T(1), I.dupPub, '', {}),                                                                                            // not a conflict: held by ISSN
].join('\n');

const before = JSON.stringify((await db.journal.findMany({ orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 })));
const nJournals = await db.journal.count();
const list = await C.findConflicts(csv);
const by = (t: string) => list.find(c => c.doaj.title === t);
check('reading the conflicts wrote nothing', JSON.stringify((await db.journal.findMany({ orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 }))) === before && (await db.journal.count()) === nJournals);
eq('eleven conflicts: a new title and an ISSN match are not conflicts', list.length, 11);
eq('same publisher + same country → duplicate', [by(T(1))?.verdict, by(T(1))?.evidence.samePublisher, by(T(1))?.evidence.sameCountry], ['duplicate', true, true]);
eq('DOAJ "continues" a held ISSN → duplicate, by continuity', [by(T(2))?.verdict, by(T(2))?.evidence.continuity], ['duplicate', true]);
eq('different publisher and country, held record from DOAJ → distinct', by(T(3))?.verdict, 'distinct');
eq('different publisher but a thin held listing → ambiguous, never "distinct"', by(T(4))?.verdict, 'ambiguous');
check('…and it says why', /little evidence/.test((by(T(4))?.reasons || []).join(' ')));
eq('"BMC" against "BioMed Central" → duplicate', by(T(5))?.verdict, 'duplicate');
eq('ISSNs issued eight numbers apart → duplicate', [by(T(6))?.verdict, by(T(6))?.evidence.issnBlock], ['duplicate', true]);
eq('the same national block but far apart (two Uruguayan universities) → distinct, not duplicate', [by(T(7))?.verdict, by(T(7))?.evidence.issnBlock, by(T(7))?.evidence.sameCountry], ['distinct', false, true]);
eq('overlapping university names → ambiguous', by(T(8))?.verdict, 'ambiguous');
eq('two held with one title: the strongest evidence of sameness wins, and names the journal it rests on', [by(T(9))?.verdict, by(T(9))?.against === jMultiB.id, by(T(9))?.held.length], ['duplicate', true, 2]);
eq('a held journal with no publisher → ambiguous, and says so', [by(T(10))?.verdict, /no publisher recorded/.test((by(T(10))?.reasons || []).join(' '))], ['ambiguous', true]);
eq('the very same web address → duplicate', [by(T(11))?.verdict, by(T(11))?.evidence.sameHomepage], ['duplicate', true]);
eq('the summary adds up', C.summarise(list), { total: 11, distinct: 2, duplicate: 6, ambiguous: 3 });
check('every conflict carries its DOAJ identifier and both sides\' ISSN, publisher and country', list.every(c => /^https:\/\/doaj\.org\/toc\//.test(c.doaj.doajUrl || '') && c.held.every(h => h.status && 'publisher' in h && 'country' in h && 'issn' in h)));

// ════════════════════════════════════════════════════════════════════════
section('3. A decision is a record: it creates and changes no journal');
const auditCount = async () => (await db.ingestionAudit.count({ where: { action: 'DOAJ_CONFLICT_DECISION' } }));
const a0 = await auditCount();
const admin = { uid: 'u1', email: 'admin@example.com' };
const fp = by(T(3))!.fingerprint;
const r1 = await C.decideConflict(admin, N.distinct, 'distinct', 'Different journals', fp, { csvText: csv });
check('"Accept as distinct" is recorded with who, when and the note', r1.decision?.decision === 'distinct' && r1.decision.by === admin.email && r1.decision.note === 'Different journals' && r1.unchanged === false);
check('it created and changed NO journal', (await db.journal.count()) === nJournals && JSON.stringify((await db.journal.findMany({ orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 }))) === before);
check('no journal with that ISSN exists (accepting as distinct imports nothing)', (await db.journal.count({ where: { issn: N.distinct } })) === 0);
eq('one audit entry was written', (await auditCount()) - a0, 1);
const r2 = await C.decideConflict(admin, N.distinct, 'distinct', 'Different journals', fp, { csvText: csv });
check('the same decision again is a no-op (no second audit entry)', r2.unchanged === true && (await auditCount()) - a0 === 1);
await C.decideConflict(admin, N.weak, 'hold', null, undefined, { csvText: csv });
await C.decideConflict(admin, N.dupPub, 'blocked', 'Same journal, other ISSN', undefined, { csvText: csv });
const L = await C.listConflicts({ csvText: csv });
eq('the list carries each decision and the tallies', [L.decisions.distinct, L.decisions.hold, L.decisions.blocked, L.decisions.undecided, L.decisions.lookAgain], [1, 1, 1, 8, 0]);
check('a decided item shows its decision; the rest show none', L.items.find(i => i.doaj.issn === N.distinct)?.decision?.decision === 'distinct' && L.items.find(i => i.doaj.issn === N.alias)?.decision === null);
eq('a decision can be changed, and the previous one is in the audit entry', (await C.decideConflict(admin, N.weak, 'blocked', 'Keep it out', undefined, { csvText: csv })).decision?.decision, 'blocked');
const last = await db.ingestionAudit.findFirst({ where: { action: 'DOAJ_CONFLICT_DECISION' }, orderBy: { at: 'desc' } });
check('the audit entry names the journal, the verdict and the previous decision', (last?.meta as any)?.previous === 'hold' && (last?.meta as any)?.decision === 'blocked' && (last?.meta as any)?.verdict === 'ambiguous');

section('4. Refusals, and evidence that changes');
eq('an unknown decision is refused', await status(() => C.decideConflict(admin, N.alias, 'import', null, undefined, { csvText: csv })), 400);
eq('a malformed ISSN is refused', await status(() => C.decideConflict(admin, 'nope', 'hold', null, undefined, { csvText: csv })), 400);
eq('a journal that is not a conflict is a 404', await status(() => C.decideConflict(admin, '9999-9999', 'hold', null, undefined, { csvText: csv })), 404);
eq('a decision made on a stale fingerprint is refused (409)', await status(() => C.decideConflict(admin, N.alias, 'hold', null, 'an old fingerprint', { csvText: csv })), 409);
check('there is no way to ask for an import: only three decisions exist', JSON.stringify(C.DECISIONS) === JSON.stringify(['distinct', 'blocked', 'hold']));
// The held journal changes after the decision: the decision is shown as "look again".
await db.journal.update({ where: { id: jDistinct.id }, data: { eissn: issn() } });
const L2 = await C.listConflicts({ csvText: csv });
const changed = L2.items.find(i => i.doaj.issn === N.distinct)!;
check('after the held journal changes, the old decision is flagged "look again"', changed.changedSinceDecision === true && changed.decision?.decision === 'distinct' && L2.decisions.lookAgain === 1);
check('re-deciding on the new evidence clears the flag', (await C.decideConflict(admin, N.distinct, 'distinct', null, changed.fingerprint, { csvText: csv })).changedSinceDecision === false);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
