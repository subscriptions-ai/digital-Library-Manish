/**
 * Validate a frozen NLM manifest before it is written anywhere. Reads only.
 *
 *   npx tsx scripts/nlm-journal-validate.ts --manifest manifest.json --evidence evidence.json --out-dir dir
 *
 * A candidate passes only if ALL hold: valid ISSN check digits; an NLM id, title and publisher; a department from nlmJournalDepartment (strict, title evidence for the broad
 * ones); and CURRENT publication evidence from outside NLM: Crossref has at least 3 DOIs issued 2024–2026 for the ISSN under a title that matches (so the ISSN is that journal), or PubMed
 * has at least 3 articles of 2024–2026 for the ISSN, or OpenAlex counts at least 3 works of 2024–2026 for that ISSN under a matching title. An open-ended NLM date is never evidence by itself. Anything else is HELD with its reason; nothing is relaxed to reach a number.
 * Writes passed.json (the rows to insert, evidence embedded), held.json (reason per row) and summary.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validIssn } from '../src/lib/ingestion/journalSourceImport.js';
import { nlmDepartment } from '../src/lib/ingestion/nlmJournalDepartment.js';
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const dir = arg('out-dir')!;
const manifest = JSON.parse(readFileSync(arg('manifest')!, 'utf8')); const evidence: Record<string, any> = JSON.parse(readFileSync(arg('evidence')!, 'utf8'));
const passed: any[] = [], held: any[] = []; const reasons: Record<string, number> = {};
for (const r of manifest.rows) {
  const why: string[] = [];
  if (![r.issn, r.eissn].filter(Boolean).every(validIssn)) why.push('an ISSN fails the check digit');
  if (!/^nlm:\d+$/.test(String(r.sourceId || ''))) why.push('no NLM identifier recorded');
  if (!String(r.title || '').trim()) why.push('no title');
  if (!String(r.publisherName || '').trim()) why.push('no publisher');
  const subjects: string[] = r.evidence?.subjects || r.subjects || [];
  const d = nlmDepartment(r.title, r.publisherName, subjects);
  if (d.confidence !== 'high' || d.dept !== r.domain) why.push(`department: ${d.reason || `strict mapping gives ${d.dept}, not ${r.domain}`}`);
  const ev = evidence[r.issn]; const cr = ev?.crossref, pm = ev?.pubmed, oa = ev?.openalex;
  const MIN = 3;   // one or two stray records are not evidence that a journal still publishes
  const crossrefOk = !!cr && cr.doisIssued2024to2026 >= MIN && cr.titleOverlap >= 0.5, pubmedOk = !!pm && pm.articles2024to2026 >= MIN, openalexOk = !!oa && oa.works2024to2026 >= MIN && oa.titleOverlap >= 0.5;
  if (!crossrefOk && !pubmedOk && !openalexOk) why.push(!cr && !pm && !oa ? 'no external publication evidence found (not in Crossref, PubMed or OpenAlex)' : cr && cr.doisIssued2024to2026 >= MIN && cr.titleOverlap < 0.5 ? 'Crossref has recent DOIs under a different title (identity not confirmed)' : 'fewer than 3 articles issued 2024–2026 in Crossref, PubMed or OpenAlex (possibly ceased)');
  if (why.length) { held.push({ title: r.title, issn: r.issn, domain: r.domain, nlm: r.sourceId, reasons: why }); for (const w of why) reasons[w.split(':')[0]] = (reasons[w.split(':')[0]] || 0) + 1; continue; }
  passed.push({ ...r, evidence: { ...(r.evidence || {}), nlmUid: r.sourceId, currentPublication: { basis: crossrefOk ? 'crossref' : pubmedOk ? 'pubmed' : 'openalex', crossref: cr || null, pubmed: pm || null, openalex: oa || null, checkedAt: new Date().toISOString().slice(0, 10) } } });
}
const byDept: Record<string, number> = {}; for (const p of passed) byDept[p.domain] = (byDept[p.domain] || 0) + 1;
const out = { runId: manifest.runId, source: 'NLM Catalog', rows: passed };
const bytes = JSON.stringify(out); writeFileSync(`${dir}/passed.json`, bytes); writeFileSync(`${dir}/held.json`, JSON.stringify(held, null, 1));
const summary = { runId: manifest.runId, candidates: manifest.rows.length, passed: passed.length, held: held.length, byDept, holdReasons: reasons, passedSha256: createHash('sha256').update(bytes).digest('hex') };
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 1)); console.log(JSON.stringify(summary, null, 1));
