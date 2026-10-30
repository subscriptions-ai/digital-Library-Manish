/** READ-ONLY: run the application's own publication eligibility (src/lib/ingestion/publicationEligibility.ts) over the MLT Draft books read from production.
 *  npx tsx scripts/dept-mlt-books-publish-check.ts <prod-rows.json> <out.json>   (no database is written; duplicates were checked at insert time) */
import { readFileSync, writeFileSync } from 'node:fs';
import { bookPublicationEligibility, PUBLISH_REASON_LABEL } from '../src/lib/ingestion/publicationEligibility.js';
const d = JSON.parse(readFileSync(process.argv[2], 'utf8')); const minYear = d.bookMinYear ?? 2001;
const out: any = { minYear, eligible: [], skipped: {} as Record<string, number>, detail: [] };
for (const b of d.rows) {
  const r = await bookPublicationEligibility(b, 'Medical Laboratory Technology', minYear, { checkDuplicates: false });
  if (r.ok) out.eligible.push({ id: b.id, title: b.title, licence: b.licence, checks: r.checks }); else { const k = PUBLISH_REASON_LABEL[r.reason!]; out.skipped[k] = (out.skipped[k] || 0) + 1; out.detail.push({ id: b.id, title: b.title, reason: r.reason, detail: r.detail }); }
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(JSON.stringify({ minYear, rows: d.rows.length, eligible: out.eligible.length, skipped: out.skipped }, null, 1));
for (const e of out.eligible) console.log(' ELIGIBLE', e.licence, '|', e.title.slice(0, 80));
process.exit(0);
