/**
 * Same-title conflicts of a source import, read only: every candidate whose TITLE is a held journal's (or another candidate's) under different identifiers, compared with the held
 * journal the way DOAJ Identity Conflicts compares (publisher, ISSN numbers issued close together; this source gives no country or address), with a recommended decision.
 *
 *   npx tsx scripts/journal-source-conflicts.ts --cands cands.json --held held.json [--csv out.csv]
 *
 * It RECOMMENDS and records nothing. "Accept as distinct", "Keep blocked" and "Hold" are an administrator's decisions; none of these is inserted until one says distinct.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { planCandidates, normTitle } from '../src/lib/ingestion/journalSourceImport.js';
import { classifyConflict, type DoajSide, type HeldSide } from '../src/lib/ingestion/doajConflicts.js';
import { originOf } from '../src/lib/ingestion/journalReviewAnalysis.js';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const c = JSON.parse(readFileSync(arg('cands')!, 'utf8')); const held = JSON.parse(readFileSync(arg('held')!, 'utf8')).journals;
const plan = planCandidates(c.source, c.items, held, { keep: ['conflict'] });
const rows = plan.kept.conflict || [];
const byTitle = new Map<string, any[]>(); for (const h of held) { const k = normTitle(h.title); (byTitle.get(k) || byTitle.set(k, []).get(k)!).push(h); }
const sides = (rowsOf: any[]): HeldSide[] => rowsOf.map(h => ({ id: h.id, title: h.title, issn: h.issn, eissn: h.eissn, status: h.status, publisher: h.publisher ?? null, country: null, homepage: null, department: h.domain ?? null, origin: originOf(h.basis) }));
const out: any[] = [];
for (const p of rows) {
  const cand = p.candidate; const heldSame = byTitle.get(normTitle(cand.title)) || [];
  if (!heldSame.length) { out.push({ cand, verdict: 'ambiguous', why: 'the same title as another NEW candidate in this batch', held: [] }); continue; }
  const d: DoajSide = { title: cand.title, issn: cand.issn!, eissn: cand.eissn ?? null, publisher: cand.publisherName, country: null, homepage: null, doajUrl: null, alternativeTitle: null, continues: [], continuedBy: [] };
  const r = classifyConflict(d, sides(heldSame));
  out.push({ cand, verdict: r.verdict, why: r.reasons.join('; '), held: r.held, against: r.against, evidence: r.evidence });
}
const tally = (v: string) => out.filter(o => o.verdict === v).length;
console.log(`Same-title conflicts: ${out.length}   likely distinct ${tally('distinct')}   likely duplicate/renamed ${tally('duplicate')}   ambiguous ${tally('ambiguous')}\n`);
const rec = (v: string) => v === 'distinct' ? 'Accept as distinct (admin to confirm)' : v === 'duplicate' ? 'Keep blocked' : 'Hold';
for (const v of ['duplicate', 'ambiguous', 'distinct']) {
  console.log(`— ${v} (first 8 of ${tally(v)}):`);
  for (const o of out.filter(x => x.verdict === v).slice(0, 8)) { const h = o.held.find((x: any) => x.id === o.against) || o.held[0]; console.log(`   "${String(o.cand.title).slice(0, 48)}" ${o.cand.issn} · ${String(o.cand.publisherName || '—').slice(0, 30)}  vs held ${h ? `${h.issn || ''} · ${String(h.publisher || '—').slice(0, 30)} · ${h.status}` : '(none)'}  | ${o.why.slice(0, 70)}`); }
}
if (arg('csv')) {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  writeFileSync(arg('csv')!, ['recommended_decision,verdict,title,issn,eissn,publisher,department_if_new,held_issn,held_eissn,held_publisher,held_status,reason'].concat(out.map(o => { const h = o.held.find((x: any) => x.id === o.against) || o.held[0] || {}; return [rec(o.verdict), o.verdict, o.cand.title, o.cand.issn, o.cand.eissn, o.cand.publisherName, p_dept(rows, o.cand), h.issn, h.eissn, h.publisher, h.status, o.why].map(esc).join(','); })).join('\n'));
  console.log(`\nreview list → ${arg('csv')}`);
}
function p_dept(all: any[], cand: any) { return all.find(p => p.candidate === cand)?.department ?? ''; }
