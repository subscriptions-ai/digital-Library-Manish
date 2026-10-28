/**
 * Audit of what a TITLE-ONLY department match wrote: read only. Takes a plan file (rows with title, publisher, ISSNs, department) and sorts each row good / weak / wrong / manual
 * (src/lib/ingestion/journalMappingAudit.ts). Writes nothing; prints counts by department and bounded samples, and a CSV review list of every row that is not "good".
 *
 *   npx tsx scripts/journal-mapping-audit.ts --plan plan.json [--csv review.csv] [--show weak,wrong,manual]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { auditTitleMapping, type AuditVerdict } from '../src/lib/ingestion/journalMappingAudit.js';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const plan = JSON.parse(readFileSync(arg('plan')!, 'utf8'));
const rows: any[] = plan.rows;
const V: AuditVerdict[] = ['good', 'weak', 'wrong', 'manual'];
const by: Record<string, Record<string, number>> = {}; const all: Record<string, number> = { good: 0, weak: 0, wrong: 0, manual: 0 };
const results = rows.map(r => ({ r, a: auditTitleMapping(r.title, r.publisherName, r.domain) }));
for (const { r, a } of results) { (by[r.domain] ||= { good: 0, weak: 0, wrong: 0, manual: 0 })[a.verdict]++; all[a.verdict]++; }
console.log(`${rows.length} rows audited: ${V.map(v => `${v} ${all[v]}`).join(' · ')}\n`);
console.log(`${'Department'.padEnd(22)}${'rows'.padStart(6)}${'good'.padStart(7)}${'weak'.padStart(7)}${'wrong'.padStart(7)}${'manual'.padStart(8)}`);
for (const [d, c] of Object.entries(by).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) console.log(`${d.padEnd(22)}${String(c.good + c.weak + c.wrong + c.manual).padStart(6)}${String(c.good).padStart(7)}${String(c.weak).padStart(7)}${String(c.wrong).padStart(7)}${String(c.manual).padStart(8)}`);
for (const v of (arg('show', 'wrong,weak,manual')!.split(',') as AuditVerdict[])) {
  console.log(`\n— ${v} (first 14 of ${all[v]}):`);
  for (const { r, a } of results.filter(x => x.a.verdict === v).slice(0, 14)) console.log(`   ${String(r.title).slice(0, 66).padEnd(66)} → ${r.domain.padEnd(16)} ${a.betterDepartment ? '(better: ' + a.betterDepartment + ') ' : ''}${a.reasons[0].slice(0, 70)}`);
}
if (arg('csv')) {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  writeFileSync(arg('csv')!, ['verdict,title,issn,eissn,publisher,department_now,better_department,reason'].concat(results.filter(x => x.a.verdict !== 'good').map(({ r, a }) => [a.verdict, r.title, r.issn, r.eissn, r.publisherName, r.domain, a.betterDepartment, a.reasons.join('; ')].map(esc).join(','))).join('\n'));
  console.log(`\nreview list → ${arg('csv')}`);
}
