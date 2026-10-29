/**
 * Classify an export of department-less books (scripts/export-unassigned-books.cjs) with the application's own classifier and report, per status and
 * source, how many land in each tier and department. Reads the NDJSON file only; no database, nothing is written but the report files.
 *   npx tsx scripts/analyse-unassigned-books.ts data/unassigned-2026-10-29 [out-dir]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { judge } from '../src/lib/ingestion/reviewClassification.js';

const dir = process.argv[2]; if (!dir) { console.error('usage: analyse-unassigned-books.ts <dir>'); process.exit(2); }
const rows = readFileSync(join(dir, 'unassigned.ndjson'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] || 0) + 1; };
const sortObj = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
const seg = (r: any) => `${r.status}${r.rejectionNote ? ' (rejected-note)' : ''}${r.ownershipSource && r.ownershipSource !== 'Ingested' ? ` [${r.ownershipSource}]` : ''}`;

const out: any = { total: rows.length, bySegment: {}, v1: {}, v2: {}, bySource: {}, flips: 0 };
const results: any[] = [];
for (const r of rows) {
  const a = judge(r, 'v1'), b = judge(r, 'v2');
  bump(out.bySegment, seg(r)); bump(out.bySource, `${r.source || 'none'} / ${r.status}`);
  for (const [k, j] of [['v1', a], ['v2', b]] as const) { out[k][seg(r)] ||= { tiers: {}, depts: {} }; bump(out[k][seg(r)].tiers, j.tier); if (j.tier === 'high' || j.tier === 'medium') bump(out[k][seg(r)].depts, `${j.tier}:${j.dept}`); }
  if (a.dept !== b.dept) out.flips++;
  results.push({ id: r.id, title: r.title, status: r.status, source: r.source, year: r.year, licence: a.licence, v1: { dept: a.dept, tier: a.tier, score: a.score, margin: a.margin, next: a.next }, v2: { dept: b.dept, tier: b.tier, score: b.score, margin: b.margin, next: b.next } });
}
for (const k of ['v1', 'v2']) for (const s of Object.keys(out[k])) { out[k][s].depts = sortObj(out[k][s].depts); out[k][s].tiers = sortObj(out[k][s].tiers); }
out.bySegment = sortObj(out.bySegment); out.bySource = sortObj(out.bySource);
writeFileSync(join(dir, 'classification-results.json'), JSON.stringify(results));
writeFileSync(join(dir, 'classification-summary.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ total: out.total, bySegment: out.bySegment, flips_v1_vs_v2: out.flips }, null, 2));
for (const k of ['v1', 'v2']) for (const s of Object.keys(out[k])) console.log(`\n== ${k} · ${s}\n tiers ${JSON.stringify(out[k][s].tiers)}\n depts ${JSON.stringify(out[k][s].depts)}`);
console.log('\nbySource', JSON.stringify(out.bySource));
