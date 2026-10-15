/**
 * Catalogue audit — read-only. Counts what the catalogue holds NOW (journals, books, books per canonical department, journal coverage, who
 * the catalogue came from) and nothing else. It writes nothing and reads no target: a department with no books prints 0.
 *
 *   npx tsx scripts/audit-catalogue.ts            # the database in .env
 *   DATABASE_URL=… npx tsx scripts/audit-catalogue.ts
 */
import { bookCoverageByDepartment, journalCoverageByDepartment, belowTarget } from '../src/lib/ingestion/bookCoverage.js';
import { providerCoverage } from '../src/lib/ingestion/catalogueGrowth.js';
import { ingestionDb as db } from '../src/lib/ingestion/db.js';

const n = (x: number) => x.toLocaleString('en-IN');
const [books, journals, providers] = await Promise.all([bookCoverageByDepartment(), journalCoverageByDepartment(), providerCoverage()]);
const jt: any = (await db.$queryRawUnsafe(`select count(*)::int total, (count(*) filter (where status='Accepted'))::int accepted, (count(*) filter (where status='MetadataOnly'))::int meta, (count(*) filter (where status='NeedsReview'))::int review from "Journal"`))[0];

console.log(`1. Journals            ${n(jt.total)}  (${n(jt.accepted)} verified open access · ${n(jt.meta)} metadata only · ${n(jt.review)} waiting for review)`);
console.log(`2. Books               ${n(books.totals.published)} published · ${n(books.totals.review)} waiting for review`);
console.log('\n3. Journals by basis'); for (const j of providers.journals) console.log(`   ${j.basis.padEnd(34)} ${j.status.padEnd(13)} ${n(j.n)}`);
console.log('\n4. Books by source'); for (const b of providers.books) console.log(`   ${b.source.padEnd(22)} ${n(b.published)} published · ${n(b.review)} review`);
console.log('\n5. Books per canonical department (lowest first)');
console.log(`   ${'Department'.padEnd(46)} ${'Total'.padStart(6)} ${'Publ'.padStart(6)} ${'Open'.padStart(5)} ${'Ext'.padStart(6)} ${'Meta'.padStart(5)} ${'Rev'.padStart(4)}  State`);
for (const d of books.departments) console.log(`   ${d.department.padEnd(46)} ${String(d.total).padStart(6)} ${String(d.published).padStart(6)} ${String(d.readable).padStart(5)} ${String(d.external).padStart(6)} ${String(d.metadataOnly).padStart(5)} ${String(d.review).padStart(4)}  ${d.label}`);
const list = (rows: any[]) => rows.map(d => `${d.department} (${d.published})`).join(', ') || 'none';
console.log(`\n6. Zero books:     ${list(books.departments.filter(d => d.published === 0))}`);
console.log(`7. Under 50:       ${list(books.departments.filter(d => d.published < 50))}`);
console.log(`8. Under 100:      ${list(belowTarget(books, 100))}`);
if (books.other.length) console.log(`   Not counted toward a department: ${books.other.map(o => `${o.label} — ${o.published} published, ${o.review} review`).join(' · ')}`);
console.log(`\n9. Journals — thin departments (under 100): ${journals.departments.filter(d => d.low).map(d => `${d.department} (${d.total})`).join(', ') || 'none'}`);
if (journals.other.length) console.log(`   Not counted toward a department: ${journals.other.map(o => `${o.label} — ${o.total}`).join(' · ')}`);
await db.$disconnect();
