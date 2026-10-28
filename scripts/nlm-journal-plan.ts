/**
 * Plan NEW journals from the NLM Catalog (the National Library of Medicine's serial catalogue), using the subject NLM itself assigned as the department evidence. Reads only.
 *
 *   npx tsx scripts/nlm-journal-plan.ts --serials subject-serials.json --held held.json [--extra plan1.json,plan2.json] --public public.json --out plan-nlm.json
 *
 * `serials`: records fetched from E-utilities (db=nlmcatalog, "<subject>"[Subject] AND serial[Type]), each tagged with the subjects it was found under.
 * A serial is placed only when exactly ONE of our departments is named by its NLM subjects (Rehabilitation counts for Physiotherapy only with Physical Therapy or a physio term in
 * the title); several departments, or a title that points elsewhere, is review. Everything then goes through the same planner as every other source: held identifier / title
 * conflicts, a publisher, and the journal classifier must not contradict. Every journal is MetadataOnly, open access NOT verified.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { planCandidates } from '../src/lib/ingestion/journalSourceImport.js';
import { auditTitleMapping } from '../src/lib/ingestion/journalMappingAudit.js';
import { normaliseIssn } from '../src/lib/ingestionWorker.js';
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const n = (x: number) => x.toLocaleString('en-IN');

/** NLM subject → our department. 'Engineering' is deliberately absent: too broad to place a journal. */
const SUBJECT_DEPARTMENT: Record<string, string> = {
  'Nursing': 'Nursing', 'Dentistry': 'Dental', 'Pharmacy': 'Pharmacy', 'Physical Therapy Modalities': 'Physiotherapy', 'Biotechnology': 'Bio Technology',
  'Nanotechnology': 'Nano Technology', 'Complementary Therapies': 'Ayurveda', 'Medicine, Traditional': 'Ayurveda', 'Architecture': 'Architecture',
  'Chemical Engineering': 'Chemical Engineering', 'Energy-Generating Resources': 'Energy',
};
const PHYSIO_TITLE = /physiotherap|physical therap|physical medicine|rehabilitation medicine|neurorehabilitation|sports (medicine|therap)|physio/i;
const NON_LATIN = /(?!\p{Script=Latin})\p{L}/u;

const serials: any[] = JSON.parse(readFileSync(arg('serials')!, 'utf8'));
const held = JSON.parse(readFileSync(arg('held')!, 'utf8')); const heldRows: any[] = held.journals ?? held;
for (const f of (arg('extra') || '').split(',').filter(Boolean)) for (const r of JSON.parse(readFileSync(f, 'utf8')).rows) heldRows.push({ id: 'new', title: r.title, issn: r.issn, eissn: r.eissn || null, status: 'MetadataOnly' });
const pubNow: Record<string, number> = JSON.parse(readFileSync(arg('public')!, 'utf8'));

const bySerial = new Map<string, any>(); const cands: any[] = []; let skipped = 0;
for (const s of serials) {
  const title = String(s.title || '').trim();
  const print = (s.issn || []).find((x: any) => x[1] === 'Print')?.[0], elec = (s.issn || []).find((x: any) => x[1] === 'Electronic')?.[0];
  const issn = normaliseIssn(print || elec), eissn = print && elec ? normaliseIssn(elec) : null;
  if (!title || !issn || NON_LATIN.test(title)) { skipped++; continue; }
  const c = { source: 'NLM Catalog' as const, title, issn, eissn, issnL: null, publisherName: String(s.publisher || '').trim() || null, country: null, homepage: null, subjects: s.subjects, hint: 'NLM Catalog serial; open access not verified here' };
  cands.push(c); bySerial.set(issn, s);
}
const deptOf = (c: any) => {
  const subs: string[] = bySerial.get(c.issn).subjects;
  const depts = new Set<string>();
  for (const s of subs) if (SUBJECT_DEPARTMENT[s]) depts.add(SUBJECT_DEPARTMENT[s]);
  if (subs.includes('Rehabilitation') && PHYSIO_TITLE.test(c.title)) depts.add('Physiotherapy');
  if (depts.size === 0) return { dept: null, confidence: 'low' as const, reason: 'no NLM subject maps to a department' };
  if (depts.size > 1) return { dept: [...depts][0], confidence: 'low' as const, reason: `NLM subjects span ${[...depts].join(' / ')}` };
  const dept = [...depts][0]; const a = auditTitleMapping(c.title, c.publisherName, dept);
  if (a.verdict === 'wrong' || a.verdict === 'manual') return { dept, confidence: 'low' as const, reason: `title contradicts: ${a.reasons[0]}` };
  return { dept, confidence: 'high' as const, evidence: { basis: 'nlm-subject', subjects: subs, audit: a.verdict } };
};
const targets = Object.values(SUBJECT_DEPARTMENT).filter((d, i, a) => a.indexOf(d) === i);
const plan = planCandidates('NLM Catalog', cands as any, heldRows, { targets, skippedAtFetch: skipped, deptOf, keep: ['conflict', 'weak_mapping'] });
const k = plan.counts;
console.log(`PREVIEW — NLM Catalog (${n(serials.length)} serials read)\n  checked ${n(plan.checked)} | no ISSN / non-Latin / malformed ${n(k.malformed)} | already held ${n(k.duplicate)} | title conflicts ${n(k.conflict)} | weak/multi-subject ${n(k.weak_mapping)} | no publisher ${n(k.no_publisher)} | classifier disagrees ${n(k.classifier_disagrees)} | no department ${n(k.no_department)}\n  READY ${n(k.ready)}\n`);
console.log(`${'Department'.padEnd(26)}${'now'.padStart(6)}${'ready'.padStart(7)}${'after'.padStart(7)}`);
for (const d of targets) { const r = plan.byDepartment[d]?.ready || 0; console.log(`${d.padEnd(26)}${String(pubNow[d] || 0).padStart(6)}${String(r).padStart(7)}${String((pubNow[d] || 0) + r).padStart(7)}`); }
const rows = plan.ready.map(p => { const s = bySerial.get(p.candidate.issn!); return { title: p.candidate.title, issn: p.candidate.issn, eissn: p.candidate.eissn || null, publisherName: p.candidate.publisherName, subjects: p.candidate.subjects, domain: p.department, country: s?.country || null, homepage: null, sourceId: `nlm:${s?.uid}`, issued: s?.issued || '', evidence: p.evidence }; });
writeFileSync(arg('out') || 'plan-nlm.json', JSON.stringify({ runId: `nlm-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`, source: 'NLM Catalog', planned: { counts: k, byDepartment: plan.byDepartment }, rows, review: { weak: (plan.kept.weak_mapping || []).map(p => ({ title: p.candidate.title, issn: p.candidate.issn, dept: p.department, why: p.detail })), conflicts: (plan.kept.conflict || []).map(p => ({ title: p.candidate.title, issn: p.candidate.issn, why: p.detail })) } }));
console.log(`\n${n(rows.length)} rows → ${arg('out') || 'plan-nlm.json'}`);
