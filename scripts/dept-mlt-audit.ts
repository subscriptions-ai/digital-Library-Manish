/**
 * Medical Laboratory Technology, Phase A: what production already holds under other departments that may belong in MLT. READ-ONLY and offline: it reads the NDJSON from
 * scripts/dept-mlt-export.js and writes CSV/JSON outside the repository. It moves nothing and writes to no database (Phase D, a move, is a dry-run proposal only and needs an explicit GO).
 *
 *   npx tsx scripts/dept-mlt-audit.ts <export.ndjson> --out <dir>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decide } from './dept-mlt-rules';

const args = process.argv.slice(2); const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : ''; const input = args.find((a, i) => a !== '--out' && i !== oi + 1);
if (!out || !input) { console.error('usage: dept-mlt-audit.ts <export.ndjson> --out <dir>'); process.exit(2); }
if (/^\/tmp\b/.test(out) || out.startsWith(process.cwd())) { console.error('write outside /tmp and outside the repository'); process.exit(2); }
mkdirSync(out, { recursive: true });
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : typeof v === 'string' && v ? [v] : []);
const csv = (rows: any[], cols: string[]) => [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

let meta: any = null; const rows: any[] = [];
for (const line of readFileSync(input, 'utf8').split('\n')) {
  if (!line.trim()) continue; const o = JSON.parse(line);
  if (o.t === 'meta') meta = o;
  if (o.t !== 'journal') continue;
  const labels = [...arr(o.subject), ...arr(o.subjects)];
  const d = decide({ title: o.title, labels, topics: [] });
  rows.push({ id: o.id, issn: o.issn, eissn: o.eissn, title: o.title, currentDepartment: o.domain, status: o.status, articles: o.articles, tier: d.tier, include: d.include, kinds: d.kinds.join('; '), reason: d.reason, excludedAs: d.excludedAs || '' });
}
const by = (t: string) => rows.filter(r => r.tier === t);
// Only HIGH/MEDIUM that currently sit elsewhere are "may belong in MLT"; with no topic data in the export, MEDIUM = one strong kind + a supportive one.
const move = rows.filter(r => r.include && r.currentDepartment !== 'Medical Laboratory Technology');
const summary = { at: new Date().toISOString(), prod: meta, examined: rows.length, tiers: Object.fromEntries(['HIGH', 'MEDIUM', 'LOW', 'EXCLUDED', 'NONE'].map(t => [t, by(t).length])), mayBelongInMLT: move.length,
  byCurrentDepartment: move.reduce((m: any, r) => (m[r.currentDepartment] = (m[r.currentDepartment] || 0) + 1, m), {}), byStatus: move.reduce((m: any, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {}),
  excludedWaterfall: by('EXCLUDED').reduce((m: any, r) => (m[r.excludedAs] = (m[r.excludedAs] || 0) + 1, m), {}) };
const cols = ['id', 'issn', 'eissn', 'title', 'currentDepartment', 'status', 'articles', 'tier', 'kinds', 'reason', 'excludedAs'];
for (const t of ['HIGH', 'MEDIUM', 'LOW', 'EXCLUDED']) writeFileSync(`${out}/audit-${t.toLowerCase()}.csv`, csv(by(t), cols));
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
// a reproducible 30-row sample of the "may belong" set for a human to read
const sample = [...move].sort((a, b) => a.id.localeCompare(b.id)).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 30)) === 0).slice(0, 30);
writeFileSync(`${out}/sample-30.csv`, csv(sample, cols));
console.log(JSON.stringify(summary, null, 1));
