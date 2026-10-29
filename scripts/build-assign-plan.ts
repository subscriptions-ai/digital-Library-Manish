/**
 * Freeze the department assignments for an export of department-less books (scripts/export-unassigned-books.cjs) as a checksummed plan for
 * scripts/book-department-assign.cjs. Judges each book with the application's classifier (the rule is named on the command line) and keeps only the
 * tiers asked for; the note each book will carry is built by the application's own assignmentRecord(), so it is the note Review Automation writes.
 *   npx tsx scripts/build-assign-plan.ts <dir> --classifier v2 --tiers high [--run <runId>]
 * Reads <dir>/unassigned.ndjson; writes <dir>/assign-plan.json.gz, assign-plan.sha256, assign-plan-summary.json and assign-sample.csv. No database is read or written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { judge, famNames, type Tier } from '../src/lib/ingestion/reviewClassification.js';
import { assignmentRecord } from '../src/lib/ingestion/reviewAssignment.js';
import { canonicalDepartmentName } from '../src/lib/departmentRegistry.js';

const dir = process.argv[2];
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const classifier = arg('--classifier') as 'v1' | 'v2'; const tiers = (arg('--tiers') || '').split(',').filter(Boolean) as Tier[];
if (!dir || !['v1', 'v2'].includes(classifier) || !tiers.length) { console.error('usage: build-assign-plan.ts <dir> --classifier v1|v2 --tiers high[,medium] [--sources A,B] [--min-margin n] [--run id]'); process.exit(2); }
const onlySources = (arg('--sources') || '').split(',').filter(Boolean); const minMargin = Number(arg('--min-margin') || 0);
const runId = arg('--run') || `book-dept-assign-${new Date().toISOString().slice(0, 10)}-${createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 8)}`;

const rows: any[] = []; const skipped: Record<string, number> = {}; const byDept: Record<string, number> = {}; const byTier: Record<string, number> = {};
for (const l of readFileSync(join(dir, 'unassigned.ndjson'), 'utf8').split('\n')) {
  if (!l) continue; const b = JSON.parse(l);
  const why = b.status !== 'Draft' ? 'not a Draft' : b.ownershipSource !== 'Ingested' ? 'not ingested' : b.rejectionNote ? 'rejected' : null;
  if (why) { skipped[why] = (skipped[why] || 0) + 1; continue; }
  const j = judge(b, classifier);
  if (onlySources.length && !onlySources.includes(b.source)) { skipped[`source ${b.source || 'none'} (tier ${j.tier})`] = (skipped[`source ${b.source || 'none'} (tier ${j.tier})`] || 0) + 1; continue; }
  if (j.margin < minMargin) { skipped[`margin below ${minMargin} (tier ${j.tier})`] = (skipped[`margin below ${minMargin} (tier ${j.tier})`] || 0) + 1; continue; }
  if (!tiers.includes(j.tier)) { skipped[`tier ${j.tier}`] = (skipped[`tier ${j.tier}`] || 0) + 1; continue; }
  const dept = canonicalDepartmentName(j.dept || '');
  if (!dept) { skipped['no canonical department'] = (skipped['no canonical department'] || 0) + 1; continue; }
  const note = assignmentRecord({ department: dept, basis: 'classifier', source: 'batch-suggested', tier: j.tier, score: j.score, margin: j.margin, second: { department: j.next, score: j.nextScore },
    evidence: [...famNames(j.fam), ...(j.ddcUsed ? ['ddc'] : [])], classifier, by: null });
  delete (note as any).performedBy; delete (note as any).performedAt;
  rows.push({ id: b.id, title: b.title, source: b.source, year: b.year, department: dept, note });
  byDept[dept] = (byDept[dept] || 0) + 1; byTier[j.tier] = (byTier[j.tier] || 0) + 1;
}
const plan = { runId, classifier, tiers, createdAt: new Date().toISOString(), count: rows.length, rows };
const json = JSON.stringify(plan), sha = createHash('sha256').update(json).digest('hex');
writeFileSync(join(dir, 'assign-plan.json.gz'), gzipSync(json));
writeFileSync(join(dir, 'assign-plan.sha256'), `${sha}  assign-plan.json (uncompressed JSON, ${json.length} bytes, ${rows.length} rows)\n`);
writeFileSync(join(dir, 'assign-plan-summary.json'), JSON.stringify({ runId, sha256: sha, classifier, tiers, assigned: rows.length, byDepartment: Object.fromEntries(Object.entries(byDept).sort((a, b) => b[1] - a[1])), byTier, notAssigned: skipped }, null, 2));
writeFileSync(join(dir, 'assign-sample.csv'), ['id,department,source,year,title', ...rows.slice().sort((a, b) => a.id.localeCompare(b.id)).filter((_, i) => i % 12 === 0).map(r => [r.id, r.department, r.source, r.year ?? '', `"${String(r.title).replace(/"/g, '""')}"`].join(','))].join('\n'));
console.log(JSON.stringify({ runId, sha256: sha, assigned: rows.length, byDepartment: byDept, notAssigned: skipped }, null, 2));
