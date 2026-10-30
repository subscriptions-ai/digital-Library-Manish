/**
 * Medical Laboratory Technology, Phase B/C: classify the OpenAlex source pool into a mutually exclusive waterfall and write the insert candidates. READ-ONLY, offline.
 * Inputs : OpenAlex sources NDJSON (scripts/dept-mlt-fetch-openalex.py), NLM subject serials JSON (scripts/dept-mlt-fetch-nlm.py), the production export (scripts/dept-mlt-export.js).
 * Outputs: <out>/classified.ndjson (every pool record + its single waterfall outcome), <out>/waterfall.json, <out>/candidates.json (eligible rows, strongest first).
 *
 *   npx tsx scripts/dept-mlt-classify.ts --openalex a.ndjson[,b.ndjson] --nlm nlm.json --export export.ndjson --out <dir>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { decide, norm, type Topic } from './dept-mlt-rules';

const arg = (k: string) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : ''; };
const out = arg('out'); if (!out || /^\/tmp\b/.test(out) || out.startsWith(process.cwd())) { console.error('--out must be outside /tmp and outside the repository'); process.exit(2); }
mkdirSync(out, { recursive: true });

function validIssn(v: unknown) {
  const s = String(v ?? '').toUpperCase(); if (!/^\d{4}-\d{3}[\dX]$/.test(s)) return false;
  const d = s.replace('-', ''); let sum = 0; for (let i = 0; i < 7; i++) sum += Number(d[i]) * (8 - i);
  const c = (11 - (sum % 11)) % 11; return d[7] === (c === 10 ? 'X' : String(c));
}

// ── The live catalogue (identifiers in BOTH columns, normalized titles) ─────────────────────────────────────────
const heldIssn = new Set<string>(), heldTitle = new Set<string>(); let catalogue = 0;
for (const line of readFileSync(arg('export'), 'utf8').split('\n')) {
  if (!line.startsWith('{"t":"cat"')) continue; const o = JSON.parse(line); catalogue++;
  for (const k of [o.issn, o.eissn]) if (k) heldIssn.add(String(k).toUpperCase());
  heldTitle.add(norm(o.title));
}
// ── NLM subjects by ISSN ───────────────────────────────────────────────────────────────────────────────────────
const nlmByIssn = new Map<string, string[]>();
if (arg('nlm') && existsSync(arg('nlm'))) for (const x of JSON.parse(readFileSync(arg('nlm'), 'utf8'))) for (const [i] of x.issn || []) nlmByIssn.set(String(i).toUpperCase(), x.subjects);

// optional publisher fill (Crossref /journals by ISSN) for records whose OpenAlex source has no host organization
const publisherFill = new Map<string, string>();
if (arg('publishers') && existsSync(arg('publishers'))) for (const [k, v] of Object.entries(JSON.parse(readFileSync(arg('publishers'), 'utf8')))) publisherFill.set(k, String(v));

// Rows a reader judged doubtful after reading the whole eligible list (Phase B review, 2026-10-30). They are NOT inserted; they are reported with the reason.
const HAND_HOLD: Record<string, string> = {
  '0023-6837': 'Laboratory Investigation: experimental pathology research journal, not laboratory practice',
  '0104-8384': 'Revista Newslab: laboratory-industry trade magazine, 8 works in 2024-26',
  '2373-9282': 'Annals of Clinical Pathology: 8 works in 2024-26 and no topic evidence; scope unclear',
  '2578-501X': 'Haematology International Journal: clinical hematology (hemoglobinopathies), not laboratory practice',
  '2251-0060': 'Annals of Tropical Pathology: tropical medicine / parasitology mix, no title evidence',
  '2768-0487': 'Journal of Clinical and Laboratory Research: generic clinical-research journal, "laboratory" in the title only',
};

type Out = { outcome: string; id: string; title: string; issns: string[]; decision?: any; row?: any };
const waterfall: Record<string, number> = {}; const bump = (k: string) => (waterfall[k] = (waterfall[k] || 0) + 1);
const classified: Out[] = []; const candidates: any[] = [];
const seenSource = new Set<string>(), seenIssn = new Set<string>(), seenTitle = new Set<string>();
let pool = 0;
const files = arg('openalex').split(',').filter(Boolean);
for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n')) {
  if (!line.trim()) continue; const s = JSON.parse(line); pool++;
  const id = String(s.id); const title = String(s.display_name || '').trim();
  const issns: string[] = [...new Set<string>([s.issn_l, ...(s.issn || [])].filter(Boolean).map((x: string) => x.toUpperCase()))];
  const done = (outcome: string, extra: Partial<Out> = {}) => { bump(outcome); classified.push({ outcome, id, title, issns, ...extra }); };
  if (seenSource.has(id)) { done('duplicate record in the pool'); continue; } seenSource.add(id);
  if (s.type && s.type !== 'journal') { done('not a journal (OpenAlex type)'); continue; }
  const valid = issns.filter(validIssn);
  if (!title || !valid.length) { done('no title or no valid ISSN'); continue; }
  if (issns.some(i => heldIssn.has(i))) { done('already held (ISSN/e-ISSN, either column)'); continue; }
  const titles = [title, ...(s.alternate_titles || [])].map(norm).filter(Boolean);
  if (titles.some(t => heldTitle.has(t))) { done('same normalized title as an existing journal'); continue; }
  if (valid.some(i => seenIssn.has(i))) { done('duplicate record in the pool (same ISSN)'); continue; }
  valid.forEach(i => seenIssn.add(i));
  let publisher = String(s.host_organization_name || '').trim();
  // publication evidence (the earlier runs' rule): >=3 works 2024-26, >=1 in 2025-26, works in >=2 of the 3 years
  const cby: Record<number, number> = {}; for (const c of s.counts_by_year || []) cby[c.year] = c.works_count || 0;
  const w = [2024, 2025, 2026].map(y => cby[y] || 0);
  const pubOk = w.reduce((a, b) => a + b, 0) >= 3 && (w[1] + w[2]) >= 1 && w.filter(x => x > 0).length >= 2;
  const topics: Topic[] = (s.topics || []).map((t: any) => ({ name: t.name, count: t.count, subfield: t.subfield, field: t.field }));
  const nlmSubjects = valid.flatMap(i => nlmByIssn.get(i) || []);
  const d = decide({ title, topics, nlmSubjects, publisher });
  if (d.tier === 'NONE') { done('no laboratory evidence', { decision: d }); continue; }
  if (d.tier === 'EXCLUDED') { done(`excluded: ${d.excludedAs}`, { decision: d }); continue; }
  if (!pubOk) { done('evidence ok but publication evidence fails (inactive)', { decision: d }); continue; }
  if (!d.include) { done('only one kind of evidence', { decision: d }); continue; }
  if (!publisher) publisher = (publisherFill.get(valid[0]) || valid.map(i => publisherFill.get(i)).find(Boolean) || '').trim();
  if (!publisher) { done('evidence ok but no publisher on the source record', { decision: d }); continue; }
  const hold = valid.map(i => HAND_HOLD[i]).find(Boolean);
  if (hold) { done('held by reviewer (doubtful scope)', { decision: { ...d, reason: hold } }); continue; }
  if (titles.some(t => seenTitle.has(t))) { done('same title as another candidate in this run'); continue; }
  titles.forEach(t => seenTitle.add(t));
  const row = {
    title, issn: valid.includes((s.issn_l || '').toUpperCase()) ? String(s.issn_l).toUpperCase() : valid[0], eissn: null as string | null, publisherName: publisher, country: s.country_code || null, homepage: s.homepage_url || null,
    subjects: [] as string[], domain: 'Medical Laboratory Technology', basisSource: 'OpenAlex', sourceId: `OpenAlex:${id}`,
    evidence: { tier: d.tier, kinds: d.kinds, topicCoreShare: d.topicCoreShare, nlmSubjects, topTopics: topics.slice(0, 5).map(t => `${t.name} (${t.count})`), publication: { works2024_26: w.reduce((a, b) => a + b, 0), works2025_26: w[1] + w[2], byYear: { 2024: w[0], 2025: w[1], 2026: w[2] } }, listedBy: ['OpenAlex'], url: `https://api.openalex.org/sources/${id.split('/').pop()}` },
  };
  row.eissn = valid.find(i => i !== row.issn) || null;
  candidates.push({ tier: d.tier, row });
  done(`ELIGIBLE ${d.tier}`, { decision: d, row });
}
candidates.sort((a, b) => (a.tier === b.tier ? (b.row.evidence.topicCoreShare - a.row.evidence.topicCoreShare) : a.tier === 'HIGH' ? -1 : 1));
writeFileSync(`${out}/classified.ndjson`, classified.map(c => JSON.stringify(c)).join('\n'));
writeFileSync(`${out}/waterfall.json`, JSON.stringify({ at: new Date().toISOString(), catalogueRows: catalogue, poolRecords: pool, total: Object.values(waterfall).reduce((a, b) => a + b, 0), waterfall }, null, 1));
writeFileSync(`${out}/candidates.json`, JSON.stringify(candidates, null, 1));
console.log(JSON.stringify({ catalogueRows: catalogue, poolRecords: pool, waterfall, eligible: candidates.length }, null, 1));
