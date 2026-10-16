/**
 * Why do NCBI Bookshelf books wait for review? Read-only: it reads the Drafts NCBI has produced and groups the reasons the pipeline wrote
 * on each one — Department confidence, rights, metadata, publication year, identifier, other. A book can have several.
 *
 *   npx tsx scripts/audit-ncbi-review.ts
 */
import { ingestionDb as db } from '../src/lib/ingestion/db.js';

const rows: any[] = await db.book.findMany({ where: { source: 'NCBIBookshelf', status: 'Draft' }, select: { title: true, licence: true, rightsStatus: true, accessStatus: true, year: true, isbn: true, doi: true, authors: true, description: true, metadata: true } });
const tally: Record<string, Record<string, number>> = { 'Department confidence': {}, 'Rights': {}, 'Metadata': {}, 'Publication year': {}, 'Identifier': {}, 'Other': {} };
const add = (g: string, k: string) => { tally[g][k] = (tally[g][k] || 0) + 1; };
const thisYear = new Date().getFullYear();
let wordsOnly = 0, closeCall = 0, thin = 0;
for (const b of rows) {
  const h = b.metadata?.harvest || {}, d = h.department || {}, nc = h.provider?.ncbi || {};
  const reasons: string[] = d.reasons || [];
  const last = String(reasons[reasons.length - 1] || '');
  if (d.band === 'review') {
    if (/words only/.test(last)) { add('Department confidence', 'words only — no controlled classification code agrees (the classifier never auto-publishes on words alone)'); wordsOnly++; }
    else if (/close to/.test(last)) { add('Department confidence', 'two departments close together'); closeCall++; }
    else { add('Department confidence', 'too little evidence'); thin++; }
  } else if (d.band === 'strong') add('Other', 'classified strongly — held for another reason');
  else add('Department confidence', `band ${d.band ?? 'unknown'}`);
  if (!b.licence) add('Rights', 'no licence declared'); else add('Rights', `licence declared: ${b.licence}`);
  if (nc.rights) add('Rights', `NCBI rights field: ${nc.rights}`);
  if (nc.tocRead === false) add('Metadata', 'archive could not be read — title and list only');
  if (!b.authors) add('Metadata', 'no authors'); if (!b.description) add('Metadata', 'no abstract');
  if (!b.year) add('Publication year', 'no year'); else if (b.year < thisYear - 20) add('Publication year', 'older than 20 years'); else add('Publication year', 'recent enough');
  if (!b.isbn && !b.doi) add('Identifier', 'no ISBN or DOI'); else add('Identifier', 'has an ISBN or DOI');
  if (h.access && h.access !== 'MetadataOnly') add('Other', `access judged ${h.access}`);
}
console.log(`NCBI Bookshelf drafts waiting for review: ${rows.length}`);
for (const [g, m] of Object.entries(tally)) { const e = Object.entries(m).sort((a, b) => b[1] - a[1]); if (!e.length) continue; console.log(`\n${g}`); for (const [k, n] of e) console.log(`  ${String(n).padStart(4)}  ${k}`); }
console.log(`\nDepartment reasons: words-only ${wordsOnly} · close call ${closeCall} · thin evidence ${thin}`);
await db.$disconnect();
