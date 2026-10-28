/**
 * Controlled import of NEW journals from Crossref (OpenAlex only with OPENALEX_API_KEY): fetch, then plan. Neither step writes a Journal.
 *
 *   DATABASE_URL=<a scratch database> npx tsx scripts/journal-source-import.ts fetch --out cands.json [--depts "Nursing,Dental"]
 *   npx tsx scripts/journal-source-import.ts plan --cands cands.json --held held.json [--decisions d.json] --out plan.json
 *
 * `fetch` asks Crossref's journal list for each department's search terms (a term is only a way to find journals: the department comes from the journal's own title and
 * subjects, never from the term). It records its source health in the database it is pointed at, so point it at a scratch database, not the live catalogue.
 * `plan` sorts every candidate against a snapshot of the journals held (held.json: id, title, issn, eissn, status, publisher) and prints the preview. The rows marked ready are
 * written to plan.json, which scripts/journal-source-apply.cjs inserts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const cmd = process.argv[2];
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const n = (v: number) => v.toLocaleString('en-IN');

/** Departments with fewer than 1,000 public journals (production, 2026-10-27), in the order they were asked for. */
export const TARGETS = ['Physiotherapy', 'Ayurveda', 'Nano Technology', 'Chemical Engineering', 'Architecture', 'Applied Mechanics', 'Electrical Engineering', 'Mechanical Engineering',
  'Electronics & Telecommunication Engineering', 'Dental', 'Pharmacy', 'Bio Technology', 'Material Science', 'Multidisciplinary', 'Energy', 'Nursing', 'Computer / IT', 'Chemistry', 'Management', 'Commerce',
  'Applied Sciences', 'Life Sciences', 'Agriculture', 'Civil / Construction Engineering'];

/** Extra WORDS to find journals with, beside the engine's own search terms. They decide what is asked for, never which department a journal gets. */
const EXTRA: Record<string, string[]> = {
  Physiotherapy: ['physiotherapy', 'physical therapy', 'rehabilitation'], Ayurveda: ['ayurveda', 'unani', 'siddha', 'homeopathy'], 'Nano Technology': ['nanotechnology', 'nanomaterials'],
  'Chemical Engineering': ['chemical engineering', 'process engineering'], Architecture: ['architecture', 'urban design'], 'Applied Mechanics': ['applied mechanics', 'solid mechanics', 'fluid mechanics'],
  'Electrical Engineering': ['electrical engineering', 'power systems', 'power electronics'], 'Mechanical Engineering': ['mechanical engineering', 'manufacturing', 'robotics'],
  'Electronics & Telecommunication Engineering': ['electronics', 'telecommunication', 'signal processing', 'wireless'], Dental: ['dentistry', 'dental', 'oral health', 'orthodontics'],
  Pharmacy: ['pharmacy', 'pharmaceutical', 'pharmacology'], 'Bio Technology': ['biotechnology', 'bioengineering'], 'Material Science': ['materials science', 'metallurgy', 'polymer'],
  Multidisciplinary: ['multidisciplinary', 'interdisciplinary'], Energy: ['energy', 'renewable energy', 'solar'], Nursing: ['nursing', 'midwifery'], 'Computer / IT': ['computer science', 'information technology', 'software engineering', 'data science'],
  Chemistry: ['chemistry', 'analytical chemistry'], Management: ['management', 'operations management', 'human resource'], Commerce: ['commerce', 'accounting', 'finance', 'marketing', 'economics'],
  'Applied Sciences': ['applied sciences', 'engineering sciences'], 'Life Sciences': ['life sciences', 'biology', 'ecology'], Agriculture: ['agriculture', 'agronomy', 'horticulture', 'veterinary'],
  'Civil / Construction Engineering': ['civil engineering', 'construction', 'structural engineering'],
};

if (cmd === 'fetch') {
  const { fetchCrossrefJournals } = await import('../src/lib/ingestion/journalSources.js');
  const { searchTermsFor } = await import('../src/lib/ingestionWorker.js');
  const depts = (arg('depts') ? arg('depts')!.split(',').map(s => s.trim()) : TARGETS);
  const ROWS = 1000; const items = new Map<string, any>(); let skipped = 0; const queries: any[] = [];
  const seenTerms = new Set<string>();
  for (const dep of depts) {
    for (const term of [...new Set([...searchTermsFor(dep), ...(EXTRA[dep] || [])])]) {
      if (seenTerms.has(term)) continue; seenTerms.add(term);
      let offset = 0, total: number | null = null, got = 0, added = 0;
      for (;;) {
        const page = await fetchCrossrefJournals(term, offset, ROWS);
        total = page.total; got += page.fetched; skipped += page.skipped;
        for (const it of page.items) if (!items.has(it.issn!)) { items.set(it.issn!, it); added++; }
        offset += ROWS;
        await new Promise(r => setTimeout(r, 400));
        if (page.fetched < ROWS || (total != null && offset >= total) || offset >= 10_000) break;
      }
      queries.push({ department: dep, term, total, fetched: got, newToThisRun: added });
      console.log(`  ${dep.padEnd(44)} "${term}": ${n(got)} of ${n(total ?? got)} fetched, ${n(added)} new to this run`);
    }
  }
  writeFileSync(arg('out', 'cands.json')!, JSON.stringify({ source: 'Crossref Journals', fetchedAt: new Date().toISOString(), skippedAtFetch: skipped, queries, items: [...items.values()] }));
  console.log(`\nCrossref: ${n(items.size)} distinct journals with an ISSN (${n(skipped)} records dropped for having no title or no ISSN) → ${arg('out', 'cands.json')}`);
} else if (cmd === 'plan') {
  const { planCandidates } = await import('../src/lib/ingestion/journalSourceImport.js');
  const c = JSON.parse(readFileSync(arg('cands')!, 'utf8'));
  const held = JSON.parse(readFileSync(arg('held')!, 'utf8'));
  const decisions = arg('decisions') ? JSON.parse(readFileSync(arg('decisions')!, 'utf8')) : [];
  const targets = arg('targets') ? arg('targets')!.split(',') : TARGETS;
  const plan = planCandidates(c.source, c.items, held.journals ?? held, { targets, decisions, skippedAtFetch: c.skippedAtFetch });
  const k = plan.counts;
  console.log(`PREVIEW — ${plan.source}\n  candidates checked                 ${n(plan.checked)}\n  malformed identifiers / no ISSN    ${n(k.malformed)}\n  duplicates (identifier already held) ${n(k.duplicate)}\n  duplicates inside this batch       ${n(k.duplicate_in_batch)}\n  same-title conflicts (review)       ${n(k.conflict)}\n  no department (review)             ${n(k.no_department)}\n  classifier disagrees (review)      ${n(k.classifier_disagrees)}\n  no publisher (review)              ${n(k.no_publisher)}\n  mapped outside the target depts    ${n(k.outside_target)}\n  READY TO INSERT                    ${n(k.ready)}\n`);
  console.log(`${'Department'.padEnd(44)}${'ready'.padStart(7)}${'dup'.padStart(7)}${'conflict'.padStart(10)}${'no pub'.padStart(8)}${'disagree'.padStart(10)}`);
  for (const d of TARGETS) { const r = plan.byDepartment[d]; if (r) console.log(`${d.padEnd(44)}${String(r.ready).padStart(7)}${String(r.duplicate + r.duplicate_in_batch).padStart(7)}${String(r.conflict).padStart(10)}${String(r.no_publisher).padStart(8)}${String(r.classifier_disagrees).padStart(10)}`); }
  for (const o of ['ready', 'conflict', 'no_department', 'classifier_disagrees', 'duplicate'] as const) {
    console.log(`\nSample — ${o}:`); for (const p of (plan.samples[o] || []).slice(0, 5)) console.log(`   ${String(p.candidate.title).slice(0, 62).padEnd(62)} ${p.candidate.issn}${p.candidate.eissn ? '/' + p.candidate.eissn : ''}  ${p.department || '—'}  | ${p.detail}`);
  }
  const rows = plan.ready.map(p => ({ title: p.candidate.title, issn: p.candidate.issn, eissn: p.candidate.eissn || null, publisherName: p.candidate.publisherName, subjects: p.candidate.subjects, domain: p.department, country: p.candidate.country || null, homepage: p.candidate.homepage || null, sourceId: p.candidate.issn, evidence: { ...p.evidence, subjects: p.candidate.subjects.slice(0, 6) } }));
  writeFileSync(arg('out', 'plan.json')!, JSON.stringify({ runId: `crossref-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`, source: plan.source, planned: { counts: k, byDepartment: plan.byDepartment }, rows }));
  console.log(`\n${n(rows.length)} rows → ${arg('out', 'plan.json')}`);
} else {
  console.error('usage: journal-source-import.ts fetch|plan …'); process.exit(2);
}
