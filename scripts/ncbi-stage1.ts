/**
 * NCBI Bookshelf, Stage 1 only: the official file list through the title shortlist. Downloads no archive and writes
 * no Book (the only write is the usual source-health bookkeeping for the list request itself).
 *
 *   npx tsx scripts/ncbi-stage1.ts [--out docs/ncbi-stage1-shortlist.csv]
 */
import { writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import { fetchSourceJson } from '../src/lib/ingestion/sourceHealth.js';
import { parseNcbiList, buildQueue, departmentOrder, departmentCoverage, NCBI_LIST_URL, NCBI_CONNECT_TIMEOUT_MS, NCBI_RULES } from '../src/lib/ingestion/books/ncbi.js';

const i = process.argv.indexOf('--out');
const out = i > -1 ? process.argv[i + 1] : 'docs/ncbi-stage1-shortlist.csv';

const r = await fetchSourceJson(NCBI_LIST_URL, { source: 'NCBI', encoding: 'windows-1252', timeoutMs: 120_000, attempts: 3, connectTimeoutMs: NCBI_CONNECT_TIMEOUT_MS });
if (!r.ok) { console.error(`could not read the list: ${r.error}`); process.exit(1); }
const rows = parseNcbiList(String(r.json));
const coverage = await departmentCoverage();
const order = departmentOrder(coverage);
const queue = buildQueue(rows, order);

const tally = (f: (q: typeof queue[number]) => string) => queue.reduce<Record<string, number>>((m, q) => { const k = f(q); m[k] = (m[k] || 0) + 1; return m; }, {});
const terms: Record<string, Record<string, number>> = {};
for (const q of queue) for (const e of q.evidence) { const m = /^"(.+)" \+3$/.exec(e); if (m) { const t = (terms[q.department] ||= {}); t[m[1]] = (t[m[1]] || 0) + 1; } }
const top = Object.fromEntries(Object.entries(terms).map(([d, t]) => [d, Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} (${n})`)]));

writeFileSync(out, Papa.unparse(queue.map((q, n) => ({
  priority: n + 1, tier: q.tier, suggested_department: q.department, title_relevance: q.score, evidence: q.evidence.join('; '),
  accession: q.row.accession, year: q.row.year ?? '', publisher: q.row.publisher, title: q.row.title,
}))));
console.log(JSON.stringify({
  listRows: rows.length, candidates: queue.length, notShortlisted: rows.length - queue.length,
  byDepartment: Object.fromEntries(order.map(d => [d, tally(q => q.department)[d] || 0])),
  byTier: tally(q => `tier ${q.tier}`),
  catalogueCoverage: Object.fromEntries(NCBI_RULES.map(x => [x.department, coverage[x.department] ?? 0])),
  departmentOrder: order, mostCommonTerms: top, file: out,
}, null, 2));
process.exit(0);
