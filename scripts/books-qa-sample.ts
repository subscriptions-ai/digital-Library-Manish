/**
 * Manual QA of the department classifier: ~100 books it called STRONG, with the evidence.
 *
 *   npx tsx scripts/books-qa-sample.ts [--n 100] [--provider DOAB|OAPEN] [--out docs/book-classifier-qa-doab-v3.csv [--seed N] [--pages N] [--shift N] [--exclude a.csv,b.csv]]
 *
 * Read-only: it reads the provider's feed and the catalogue (to skip books already held), and writes
 * one CSV file. It touches no catalogue row. Pages are taken at evenly spaced offsets through the
 * whole set, so the sample is not just the oldest records.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { DOAB_OAI, OAPEN_OAI, fetchPage, judgePage } from '../src/lib/ingestion/books/oaiHarvest.js';
import { ingestionDb } from '../src/lib/ingestion/db.js';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const want = Number(arg('--n', '100'));
const cfg = arg('--provider', 'DOAB') === 'OAPEN' ? OAPEN_OAI : DOAB_OAI;
const out = arg('--out', `docs/book-classifier-qa-${cfg.provider.toLowerCase()}-v2.csv`)!;

// Deterministic shuffle so a re-run gives the same sample.
let seed = Number(arg('--seed', '20261010'));
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

const first = await fetchPage(cfg, null, null);
if ('error' in first) { console.error('provider did not answer:', first.error); process.exit(1); }
const total = first.page.completeListSize || 0;
const pages = Number(arg('--pages', '30'));
const shift = Number(arg('--shift', '0'));
// Titles already reviewed in earlier rounds are left out, so a re-sample is genuinely fresh.
const seenTitles = new Set<string>();
for (const f of (arg('--exclude', '') || '').split(',').filter(Boolean)) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n').slice(1)) { const m = /^"((?:[^"]|"")*)"/.exec(line); if (m) seenTitles.add(m[1].replace(/""/g, '"').trim().toLowerCase()); }
}
const strong: any[] = [];
const tally = { examined: 0, strong: 0, review: 0, none: 0 };
for (let i = 0; i < pages; i++) {
  const offset = Math.floor((total / pages) * i) + shift;
  const got = i === 0 ? first : await fetchPage(cfg, `xoai///${cfg.set}/${offset}`, null);
  if ('error' in got || got.page.error) continue;
  const { judged } = await judgePage(cfg, got.page.records, ingestionDb);
  for (const j of judged) { if (j.match) continue; tally.examined++; tally[j.verdict.band as 'strong' | 'review' | 'none']++; if (j.verdict.band === 'strong' && !seenTitles.has(j.book.title.trim().toLowerCase())) strong.push(j); }
  await new Promise(r => setTimeout(r, 300));
}
for (let i = strong.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [strong[i], strong[k]] = [strong[k], strong[i]]; }
const sample = strong.slice(0, want);

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`;
const rows = [['title', 'subjects', 'classification_codes', 'assigned_department', 'score', 'runner_up', 'runner_up_score', 'margin', 'evidence_families', 'decision', 'reasons', 'precision_ok', 'review_note'].join(',')];
for (const j of sample) {
  const v = j.verdict;
  rows.push([q(j.book.title), q(j.book.subjects.slice(0, 14).join('; ')), q(j.book.classifications.slice(0, 3).join(' | ')), q(v.department), v.score,
    q(v.runnerUp?.department ?? ''), v.runnerUp?.score ?? 0, v.score - (v.runnerUp?.score ?? 0), q(v.families.join('+')), v.band, q(v.reasons.join('; ')), '', ''].join(','));
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rows.join('\n') + '\n');
const by: Record<string, number> = {};
sample.forEach(j => { by[j.verdict.department!] = (by[j.verdict.department!] || 0) + 1; });
console.log(JSON.stringify({ provider: cfg.provider, setSize: total, strongFound: strong.length, bands: tally, sampled: sample.length, byDepartment: by, file: out }, null, 2));
process.exit(0);
