/**
 * "Already held" versus "public": where every journal in DOAJ's file stands in OUR catalogue. Read only.
 *
 *   npx tsx scripts/doaj-held-audit.ts                    # downloads DOAJ's journal list
 *   npx tsx scripts/doaj-held-audit.ts --csv /path/doaj.csv
 *   npx tsx scripts/doaj-held-audit.ts --json out.json
 *
 * Prints: the Journal table by status; how many are on the public catalogue (the one public definition, publicJournals.ts: Accepted or Metadata Only AND a
 * published article); how every row of DOAJ's file ended (new, held public / not yet public / in review / rejected, skipped or in conflict); the exact status
 * of every held journal a row matched; who put those journals there (rightsBasis); and samples of the matches that deserve a second look (same ISSN, different
 * title; an ISSN shared by two journals). It writes nothing: the Journal and Article counts are compared before and after.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import { ingestionDb as db } from '../src/lib/ingestion/db.js';
import { checkDoajCatalogue, doajRowToJournal } from '../src/lib/doajCatalogue.js';
import { publicJournalCount } from '../src/lib/publicJournals.js';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const n = (v: number) => v.toLocaleString('en-IN');
const counts = async () => ({ journals: await db.journal.count(), articles: await db.article.count() });

const dbName = (await db.$queryRawUnsafe('select current_database() d') as any[])[0].d;
console.log(`Database: ${dbName}\n`);
const before = await counts();

// ── 1. The Journal table ─────────────────────────────────────────────────
const byStatus: any[] = await db.$queryRawUnsafe(`select status, count(*)::int n, count(*) filter (where "rightsBasis" = 'DOAJ declaration')::int doaj from "Journal" group by 1 order by 2 desc`);
const total = byStatus.reduce((a, r) => a + r.n, 0);
const publicStatus = byStatus.filter(r => r.status === 'Accepted' || r.status === 'MetadataOnly').reduce((a, r) => a + r.n, 0);
const pub = await publicJournalCount(db);
console.log('1. Journal rows in the database');
for (const r of byStatus) console.log(`   ${r.status.padEnd(14)} ${n(r.n).padStart(8)}   (${n(r.doaj)} from DOAJ's declaration)`);
console.log(`   ${'All rows'.padEnd(14)} ${n(total).padStart(8)}`);
console.log(`   With a public status (Accepted or Metadata Only): ${n(publicStatus)}`);
console.log(`   Public catalogue (public status AND a published article): ${n(pub)}`);
console.log(`   In the database with a public status but no published article: ${n(publicStatus - pub)}\n`);

// ── 2. DOAJ's file against it ────────────────────────────────────────────
const csv = arg('--csv');
const check = await checkDoajCatalogue(csv ? { csvText: readFileSync(csv, 'utf8') } : {});
const b = check.breakdown;
const heldTotal = b.heldPublic + b.heldNoArticles + b.heldReview + b.heldRejected;
console.log(`2. DOAJ's file: ${n(b.checked)} rows`);
const line = (l: string, v: number) => console.log(`   ${l.padEnd(58)} ${n(v).padStart(8)}`);
line('New (would be added)', b.new);
line('Already held — public, with published articles', b.heldPublic);
line('Already held — public, no published article yet', b.heldNoArticles);
line('Already held — draft / review / other', b.heldReview);
line('Already held — rejected', b.heldRejected);
line('Skipped / conflicting', b.skippedConflicting);
line('   same title, different ISSN', b.skipped.sameTitle);
line('   no usable ISSN or title', b.skipped.unusable);
line('   ISSN and e-ISSN belong to two held journals', b.skipped.ambiguous);
line('   listed twice in the file', b.skipped.listedTwice);
const sum = b.new + heldTotal + b.skippedConflicting + b.outsideScope + b.beyondLimit;
console.log(`   ${'(sum of the above)'.padEnd(58)} ${n(sum).padStart(8)}   ${sum === b.checked ? '= checked: every row accounted for' : `!= checked (${n(b.checked)})`}`);
console.log(`   Exact status of the held journals matched: ${JSON.stringify(b.heldByStatus)}\n`);

// ── 3. Who holds them, and could any match be wrong? ────────────────────
const matchedIds = [...new Set(Object.entries(check.inspect.categories).filter(([c]) => c.startsWith('held') || c === 'ambiguous').flatMap(([, es]) => (es || []).flatMap(e => e.j || [])))];
const basis: any[] = matchedIds.length ? await db.$queryRawUnsafe(`select coalesce("rightsBasis", '(none)') b, count(*)::int n from "Journal" where id = any($1::text[]) group by 1 order by 2 desc`, matchedIds) : [];
console.log(`3. The ${n(matchedIds.length)} distinct held journals DOAJ's rows matched, by where they came from`);
for (const r of basis) console.log(`   ${String(r.b).padEnd(34)} ${n(r.n).padStart(8)}`);
console.log(`   Journals held but matched by no DOAJ row: ${n(total - matchedIds.length)}\n`);

const all = Object.entries(check.inspect.categories).filter(([c]) => c.startsWith('held') || c === 'ambiguous').flatMap(([, es]) => es || []);
const differs = all.filter(e => e.d);
console.log(`4. Matches to look at twice (identifier matches, titles share little): ${n(differs.length)}`);
const sampleIds = differs.slice(0, 12).flatMap(e => e.j || []);
const sample: any[] = sampleIds.length ? await db.journal.findMany({ where: { id: { in: sampleIds } }, select: { id: true, title: true, issn: true, eissn: true, status: true } }) : [];
const by = new Map(sample.map(j => [j.id, j]));
for (const e of differs.slice(0, 12)) { const j = by.get((e.j || [])[0]); console.log(`   DOAJ "${e.t}" (${e.i}${e.e ? ' / ' + e.e : ''})  ↔  held "${j?.title}" (${j?.issn || '—'}${j?.eissn ? ' / ' + j.eissn : ''}, ${j?.status})`); }
const amb = check.inspect.categories.ambiguous || [];
console.log(`\n5. DOAJ rows whose identifiers belong to two different held journals: ${n(amb.length)}`);
for (const e of amb.slice(0, 8)) console.log(`   DOAJ "${e.t}" (${e.i}${e.e ? ' / ' + e.e : ''}) → ${(e.j || []).length} journals`);
const st = check.inspect.categories.sameTitle || [];
console.log(`\n6. Same title as a held journal, different ISSN (never imported, reported): ${n(st.length)}`);
// Is it the same journal under another ISSN, or a different journal that shares a name? The publisher is the best evidence the file and the catalogue both carry.
{
  const rows = Papa.parse<Record<string, string>>(readFileSync(csv || '/dev/null', 'utf8'), { header: true, skipEmptyLines: true }).data;
  const pubOf = new Map<string, { publisher: string | null; country: string | null }>();
  for (const r of csv ? rows : []) { const j = doajRowToJournal(r); if (j) pubOf.set(j.issn, { publisher: j.publisherName, country: j.country }); }
  const norm = (s: unknown) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let samePub = 0, diffPub = 0, unknown = 0; const eg: string[] = [];
  const heldByTitle: any[] = st.length ? await db.$queryRawUnsafe(`select lower(btrim(title)) t, "publisherName" p, issn, status from "Journal" where lower(btrim(title)) = any($1::text[])`, [...new Set(st.map(e => e.t.toLowerCase().trim()))]) : [];
  for (const e of st) {
    const d = pubOf.get(e.i); const held = heldByTitle.filter(h => h.t === e.t.toLowerCase().trim());
    if (!d?.publisher || !held.some(h => h.p)) { unknown++; continue; }
    if (held.some(h => norm(h.p) === norm(d.publisher))) samePub++; else { diffPub++; if (eg.length < 6) eg.push(`   "${e.t}" (${e.i}) by ${d.publisher}  vs held ${held.map(h => `${h.issn} by ${h.p}`).join(' | ')}`); }
  }
  console.log(`   same publisher as the held journal (likely the same journal): ${n(samePub)};  different publisher (likely a different journal that shares a name): ${n(diffPub)};  cannot compare: ${n(unknown)}`);
  for (const l of eg) console.log(l);
}

const after = await counts();
console.log(`\nNothing was written: journals ${n(before.journals)} → ${n(after.journals)}, articles ${n(before.articles)} → ${n(after.articles)}${before.journals === after.journals && before.articles === after.articles ? ' (unchanged)' : '  ** CHANGED **'}`);
if (arg('--json')) writeFileSync(arg('--json')!, JSON.stringify({ database: dbName, byStatus, total, publicStatus, public: pub, breakdown: b, basis, matched: matchedIds.length }, null, 2));
await db.$disconnect();
