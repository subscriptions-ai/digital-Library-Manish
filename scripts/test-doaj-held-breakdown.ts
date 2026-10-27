/**
 * DOAJ "Already held" — what a held journal is, and whether it is public. Classification, inspection, and the guarantees around them.
 * Private throwaway database `stm_doaj_held_test` only (createdb stm_doaj_held_test && DATABASE_URL=.../stm_doaj_held_test npx prisma db push).
 *
 *   npx tsx scripts/test-doaj-held-breakdown.ts
 *
 * Fixture journals only. Covers: the same ISSN held as Published/public, Accepted with no article, NeedsReview, Draft and Rejected; a journal that shares a TITLE but not an
 * ISSN; a genuinely new journal; an e-ISSN match; an online-only journal; two journals sharing an e-ISSN; an identifier that belongs to two journals; a row listed twice;
 * a row with no ISSN. Proves that the check writes nothing, that every row ends in exactly one category, that the legacy counts are what they always were, that an import adds
 * only the new journals and changes no status, licence or department of any held one (and publishes nothing), and that the rows behind every count can be opened.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_doaj_held_test');
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const name = (await db.$queryRawUnsafe('select current_database() d'))[0].d;
if (name !== 'stm_doaj_held_test') throw new Error(`refusing to run against "${name}"`);
const { checkDoajCatalogue, importCheckedJournals, titlesAgree } = await import('../src/lib/doajCatalogue.js');
const I = await import('../src/lib/ingestion/doajInspection.js');

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);

// ── Fixtures ────────────────────────────────────────────────────────────
await db.$executeRawUnsafe(`truncate table "Article", "Journal", "IngestionPreview", "AdminAuditLog" restart identity cascade`).catch(async () => { await db.article.deleteMany({}); await db.journal.deleteMany({}); await db.ingestionPreview.deleteMany({}); });
const TAG = `dh${Date.now().toString(36)}`;
let seq = 1000;
const issn = () => { const d = String(++seq).padStart(4, '0') + String(Math.floor(Math.random() * 900) + 100); return `${d.slice(0, 4)}-${d.slice(4, 7)}${(seq % 10)}`; };
type J = { title: string; issn: string | null; eissn?: string | null; status: string; articles?: number; licence?: string | null; domain?: string | null };
const mk = async (j: J) => {
  const row = await db.journal.create({ data: { title: j.title, issn: j.issn || undefined, eissn: j.eissn ?? null, status: j.status, licence: j.licence ?? 'CC BY', domain: j.domain ?? 'Law', rightsBasis: 'DOAJ declaration', publisherName: `Pub ${TAG}` } });
  for (let i = 0; i < (j.articles || 0); i++) await db.article.create({ data: { title: `${j.title} article ${i}`, status: 'Published', journalId: row.id, fingerprint: `${row.id}-${i}`, doi: `10.9999/${TAG}.${row.id.slice(0, 6)}.${i}` } });
  return row;
};

const S = { pub: issn(), noArt: issn(), review: issn(), draft: issn(), rej: issn(), titleHeld: issn(), onlineOnly: issn(), eMatch: issn(), shared1: issn(), shared2: issn(), shared: issn(), amb: issn(), ambB: issn(), differs: issn() };
const NEW = { genuine: issn(), sameTitle: issn(), dup: issn(), eRow: issn(), draftTitle: issn(), listedTwice: issn() };

const jPub = await mk({ title: `${TAG} Published Journal`, issn: S.pub, status: 'Accepted', articles: 2 });
const jNoArt = await mk({ title: `${TAG} Catalogued Journal`, issn: S.noArt, status: 'MetadataOnly' });
const jReview = await mk({ title: `${TAG} Review Journal`, issn: S.review, status: 'NeedsReview', domain: null });
const jDraft = await mk({ title: `${TAG} Draft Journal`, issn: S.draft, status: 'Draft', domain: null });
const jRej = await mk({ title: `${TAG} Rejected Journal`, issn: S.rej, status: 'Rejected', licence: null });
const jTitle = await mk({ title: `${TAG} Revista de Derecho`, issn: S.titleHeld, status: 'Accepted', articles: 1 });       // another journal holds this title
const jOnline = await mk({ title: `${TAG} Online Only`, issn: S.onlineOnly, eissn: S.onlineOnly, status: 'Accepted' });  // the same value as ISSN and e-ISSN
const jEHeld = await mk({ title: `${TAG} Held By Online ISSN`, issn: S.eMatch, status: 'MetadataOnly' });
const jS1 = await mk({ title: `${TAG} Shared A`, issn: S.shared1, eissn: S.shared, status: 'Accepted' });                      // two journals that share an e-ISSN
const jS2 = await mk({ title: `${TAG} Shared B`, issn: S.shared2, eissn: S.shared, status: 'Rejected' });
const jAmbA = await mk({ title: `${TAG} Amb A`, issn: S.amb, status: 'Accepted' });                                              // B carries A's ISSN as its e-ISSN
const jAmbB = await mk({ title: `${TAG} Amb B`, issn: S.ambB, eissn: S.amb, status: 'MetadataOnly' });
const jDiffers = await mk({ title: `${TAG} Entirely Unrelated Name`, issn: S.differs, status: 'Accepted' });

const H = 'Journal title,Journal URL,Journal ISSN (print version),Journal EISSN (online version),Publisher,Country of publisher,Languages in which the journal accepts manuscripts,Subjects,LCC Codes,Keywords,Journal license,License attributes';
const line = (t: string, p: string, e: string, lic = 'CC BY') => [t, 'https://j.example', p, e, 'Pub', 'India', 'EN', 'Medicine', '', '', lic, ''].map(x => `"${x}"`).join(',');
const csv = [H,
  line(`${TAG} Published Journal`, S.pub, ''),                                  // 1 held, public
  line(`${TAG} Catalogued Journal`, S.noArt, ''),                               // 2 held, no article yet
  line(`${TAG} Review Journal`, S.review, ''),                                  // 3 held, NeedsReview
  line(`${TAG} Draft Journal`, S.draft, ''),                                    // 4 held, Draft
  line(`${TAG} Rejected Journal`, S.rej, ''),                                   // 5 held, Rejected
  line(`${TAG} Revista de Derecho`, NEW.sameTitle, ''),                         // 6 same TITLE as a held journal, different ISSN → reported, never held, never imported
  line(`${TAG} A Genuinely New Journal`, NEW.genuine, '', 'CC BY'),             // 7 new
  line(`${TAG} Brand New But Not Open`, NEW.dup, '', 'CC BY-NC'),                // 8 new (metadata only)
  line(`${TAG} Online Only`, '', S.onlineOnly),                                 // 9 online-only, held (not "two journals")
  line(`${TAG} Another Title For A Held Online ISSN`, NEW.eRow, S.eMatch),      // 10 held by its e-ISSN
  line(`${TAG} Shared A`, S.shared1, S.shared),                                 // 11 shares an e-ISSN with another journal: told apart by print ISSN
  line(`${TAG} Shared B`, S.shared2, S.shared),                                 // 12 … the other one (Rejected)
  line(`${TAG} Amb A`, S.amb, ''),                                              // 13 its ISSN is also another journal's e-ISSN → ambiguous
  line(`Quantum Hydrology Letters ${TAG.slice(2)}`, S.differs, ''),                // 14 same ISSN, title shares nothing → held, flagged
  line(`${TAG} No Identifier`, '', ''),                                         // 15 unusable
  line(`${TAG} Listed Twice`, NEW.listedTwice, ''), line(`${TAG} Listed Twice`, NEW.listedTwice, ''),  // 16, 17 new, then repeat
].join('\n');

const snapshot = async () => JSON.stringify({
  j: (await db.journal.findMany({ orderBy: { id: 'asc' } })).map((x: any) => ({ ...x, updatedAt: 0 })),
  a: await db.article.count(),
});
const before = await snapshot();
const preCounts = { j: await db.journal.count(), a: await db.article.count(), p: await db.ingestionPreview.count() };

// ════════════════════════════════════════════════════════════════════════
section('1. Every row of the file ends in exactly one category');
const c = await checkDoajCatalogue({ csvText: csv });
const b = c.breakdown, s = c.summary;
check('the check wrote nothing to the catalogue', (await snapshot()) === before && (await db.journal.count()) === preCounts.j && (await db.article.count()) === preCounts.a);
eq('checked = rows in the file', b.checked, 17);
eq('new: the genuinely new, the new non-open one, and the first of the twice-listed', b.new, 3);
eq('held — public: same ISSN, status Accepted, a published article', b.heldPublic, 1);
eq('held — catalogued, no published article yet (Accepted or Metadata Only, matched by ISSN, by e-ISSN, online-only, shared e-ISSN, differing title)', b.heldNoArticles, 5);
eq('held — draft / review (NeedsReview and Draft)', b.heldReview, 2);
eq('held — rejected (the same ISSN, and the one that shares an e-ISSN)', b.heldRejected, 2);
eq('skipped / conflicting, by reason', b.skipped, { unusable: 1, sameTitle: 1, ambiguous: 1, listedTwice: 1 });
eq('skipped / conflicting total', b.skippedConflicting, 4);
eq('every row is in exactly one category (nothing lost, nothing counted twice)', b.new + b.heldPublic + b.heldNoArticles + b.heldReview + b.heldRejected + b.skippedConflicting + b.outsideScope + b.beyondLimit, b.checked);
eq('the exact status of every held journal a row matched', b.heldByStatus, { Accepted: 5, MetadataOnly: 3, NeedsReview: 1, Draft: 1, Rejected: 2 });
eq('a held match whose title shares nothing with DOAJ\'s is flagged (and only that one)', b.titleDiffers, 1);
const total = Object.values(c.inspect.categories).reduce((a, es) => a + (es || []).length, 0);
eq('every row has an entry behind its count', total, 17);

section('2. The rules are unchanged: legacy counts are what they always were');
eq('already held (legacy) = every row that matched an identifier, plus a repeat inside the file', s.alreadyHeld, 12);
eq('a title shared with a held journal under other ISSNs is "needs review", not "held"', s.needsReview, 1);
eq('rows with no ISSN or title are "rejected" (legacy name)', s.rejected, 1);
eq('new, and its licence split', [s.new, s.fullTextEligible, s.metadataOnly], [3, 2, 1]);
check('same TITLE, different ISSN: not held, not new, not importable — and listed for a person', !c.newIssns.includes(NEW.sameTitle) && c.reviewSample.some(r => r.issn === NEW.sameTitle) && b.skipped.sameTitle === 1);
check('the genuinely new journal is new', c.newIssns.includes(NEW.genuine) && c.newIssns.includes(NEW.dup));
check('matching is by identifier: a journal whose ISSN appears only as another\'s e-ISSN is held (as it always was)', (c.inspect.categories.heldNoArticles || []).some(e => e.i === NEW.eRow && e.by === 'eissn'));
check('an online-only journal (same value as ISSN and e-ISSN) is one journal, not an "ambiguous" match', (c.inspect.categories.heldNoArticles || []).some(e => e.i === S.onlineOnly && (e.j || []).length === 1));
check('two journals that share an e-ISSN are told apart by their own ISSN', (c.inspect.categories.heldNoArticles || []).some(e => e.i === S.shared1 && e.by === 'both') && (c.inspect.categories.heldRejected || []).some(e => e.i === S.shared2));
check('an ISSN that is also another journal\'s e-ISSN is reported as matching two journals', (c.inspect.categories.ambiguous || []).length === 1 && (c.inspect.categories.ambiguous![0].j || []).length === 2);

section('3. Importing adds only the new journals and changes nothing that is held');
const imp = await importCheckedJournals(c.newIssns, { csvText: csv });
eq('exactly the three new journals are added', [imp.added, imp.accepted, imp.metadataOnly], [3, 2, 1]);
const after = await db.journal.findMany({ orderBy: { id: 'asc' } });
const newRows = after.filter((x: any) => c.newIssns.includes(x.issn));
const heldAfter = JSON.stringify(after.filter((x: any) => !c.newIssns.includes(x.issn)).map((x: any) => ({ ...x, updatedAt: 0 })));
const heldBefore = JSON.stringify(JSON.parse(before).j);
check('every held journal is byte-for-byte as it was: status, licence, department, ISSN, e-ISSN, title (Published, Draft, NeedsReview, Rejected)', heldAfter === heldBefore);
check('no Draft, NeedsReview or Rejected journal changed status', [jReview, jDraft, jRej, jS2].every(j => after.find((x: any) => x.id === j.id)?.status === j.status));
check('no journal was published or promoted, and no article was written', (await db.article.count()) === preCounts.a && newRows.every((x: any) => ['Accepted', 'MetadataOnly'].includes(x.status)));
check('the same-title journal was NOT created: no duplicate title', (await db.journal.count({ where: { title: `${TAG} Revista de Derecho` } })) === 1);
const dupIssn: any[] = await db.$queryRawUnsafe(`select issn, count(*)::int n from "Journal" where issn is not null group by 1 having count(*) > 1`);
check('no duplicate ISSN anywhere', dupIssn.length === 0);
const again = await importCheckedJournals(c.newIssns, { csvText: csv });
check('running the import again adds nothing (idempotent)', again.added === 0 && (await db.journal.count()) === preCounts.j + 3);
// After the import the same file: the three are now held; still nothing new.
const c2 = await checkDoajCatalogue({ csvText: csv });
// The five held without an article, plus the four rows of the three journals just added (one of them is listed twice in the file).
eq('a second check: nothing is new any more, and the added journals are held (no articles yet)', [c2.breakdown.new, c2.breakdown.heldNoArticles], [0, 9]);

section('4. Inspecting the rows behind each count');
const prev = await db.ingestionPreview.create({ data: { kind: 'DOAJ_CATALOGUE', expiresAt: new Date(Date.now() + 3600_000), params: {}, summary: {}, items: I.checkItems(c) as any } });
const list = (category: string, o: any = {}) => I.listInspection(prev.id, { category, ...o });
const snapA = await snapshot();
const pub = await list('heldPublic');
check('held — public: one journal, Accepted, two published articles, public', pub.total === 1 && pub.rows[0].journals[0].status === 'Accepted' && pub.rows[0].journals[0].publishedArticles === 2 && pub.rows[0].journals[0].public === true && pub.rows[0].journals[0].issn === S.pub);
const noArt = await list('heldNoArticles');
check('held — no article yet: five journals, none public, each with its ISSN, e-ISSN and status', noArt.total === 5 && noArt.rows.every(r => r.journals.length === 1 && !r.journals[0].public && r.journals[0].publishedArticles === 0));
const rev = await list('heldReview');
check('held — draft / review lists NeedsReview and Draft with their exact status', rev.total === 2 && rev.rows.map(r => r.journals[0].status).sort().join() === 'Draft,NeedsReview');
const rej = await list('heldRejected');
check('held — rejected lists the Rejected journals', rej.total === 2 && rej.rows.every(r => r.journals[0].status === 'Rejected'));
const st = await list('sameTitle');
check('same title, different ISSN: the DOAJ row, with no held journal attached (it matched by title only)', st.total === 1 && st.rows[0].doaj.issn === NEW.sameTitle && st.rows[0].journals.length === 0);
check('new: the three journals that would be added', (await list('new')).total === 3);
check('unusable: the row with no identifier', (await list('unusable')).total === 1);
check('listed twice: the repeat', (await list('listedTwice')).total === 1);
const amb = await list('ambiguous');
check('ambiguous: both journals are shown', amb.total === 1 && amb.rows[0].journals.length === 2);
const td = await list('titleDiffers');
check('"matched by ISSN but the title differs" shows the one journal, flagged', td.total === 1 && td.rows[0].titleDiffers && td.rows[0].journals[0].issn === S.differs);
eq('all held: public + no article + review + rejected + ambiguous', (await list('allHeld')).total, 11);
check('search by ISSN finds one journal; by title too', (await list('heldReview', { q: S.draft })).total === 1 && (await list('heldNoArticles', { q: 'online only' })).total === 1);
const p1 = await list('heldNoArticles', { take: 2, page: 1 }), p3 = await list('heldNoArticles', { take: 2, page: 3 });
check('paging: 2 + 2 + 1', p1.rows.length === 2 && p3.rows.length === 1 && p1.total === 5);
check('reading the rows wrote nothing', (await snapshot()) === snapA);
// Status is read live, not from the check.
await db.journal.update({ where: { id: jNoArt.id }, data: { status: 'NeedsReview' } });
const live = await list('heldNoArticles', { q: S.noArt });
check('the status shown is the catalogue\'s today, not the check\'s', live.rows[0].journals[0].status === 'NeedsReview');
await db.journal.update({ where: { id: jNoArt.id }, data: { status: 'MetadataOnly' } });
const bad = async (fn: () => Promise<any>) => { try { await fn(); return 0; } catch (e: any) { return e?.status || -1; } };
eq('an unknown category is refused', await bad(() => list('everything')), 400);
eq('no check id is refused', await bad(() => I.listInspection('', { category: 'new' })), 400);
eq('an unknown check is a 404', await bad(() => I.listInspection('nope', { category: 'new' })), 404);
const oneOff = await db.ingestionPreview.create({ data: { kind: 'ONE_OFF', expiresAt: new Date(Date.now() + 3600_000), params: {}, summary: {}, items: [] } });
eq('a preview of another kind cannot be read as a DOAJ check', await bad(() => I.listInspection(oneOff.id, { category: 'new' })), 404);
const bare = await db.ingestionPreview.create({ data: { kind: 'DOAJ_CATALOGUE', expiresAt: new Date(Date.now() + 3600_000), params: {}, summary: {}, items: { newIssns: [] } } });
eq('a check that did not keep its rows says so', await bad(() => I.listInspection(bare.id, { category: 'new' })), 404);
await db.ingestionPreview.update({ where: { id: prev.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
eq('an expired check is a 410', await bad(() => list('new')), 410);

section('5. A Quick Import\'s snapshot can be read but never imported from');
const qid = await I.saveInspection(c, { email: 'a@example.com' });
check('the snapshot is saved', !!qid);
const qrow = await db.ingestionPreview.findUnique({ where: { id: qid! } });
check('it is its own kind, so no import route will accept it', qrow.kind === 'DOAJ_INSPECTION' && !(qrow.items as any).newIssns);
const { loadPreview } = await import('../src/lib/ingestion/importService.js');
eq('the mass-import loader refuses it', await bad(() => loadPreview(qid!, 'DOAJ_CATALOGUE')), 404);
eq('but its rows can be listed', (await I.listInspection(qid!, { category: 'heldRejected' })).total, 2);

section('6. Title agreement is forgiving of renames and strict about strangers');
check('the same title agrees; a renamed one with shared words agrees', titlesAgree('Revista de Derecho', 'Revista de Derecho') && titlesAgree('Journal of Applied Physics', 'Journal of Applied Physics Letters'));
check('an unrelated title does not', !titlesAgree('Quantum Hydrology Letters', 'Law Review of Peru'));
check('nothing to compare is not a disagreement', titlesAgree('', 'Anything'));

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
