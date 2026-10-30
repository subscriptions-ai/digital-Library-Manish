/**
 * Prepares (never applies) the manifests for existing records that may belong in Radiology, Optometry & Ophthalmology, Medical Laboratory
 * Technology or Paramedical Sciences. Reads a read-only export (NDJSON), writes JSON + CSV outside the repository. Touches no database.
 *
 *   npx tsx scripts/four-department-manifest.ts <export.ndjson> [more.ndjson …] --out <dir>
 *
 * The rules and the reasons are in src/lib/ingestion/fourDepartmentEvidence.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { manifestRow, ACCESS_PRESERVATION_MECHANISM, type ManifestRow } from '../src/lib/ingestion/fourDepartmentEvidence';

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args[oi + 1] : '';
const inputs = args.filter((a, i) => a !== '--out' && i !== oi + 1);
if (!out || !inputs.length) { console.error('usage: four-department-manifest.ts <export.ndjson …> --out <dir>'); process.exit(2); }
if (/^\/tmp\b/.test(out) || out.startsWith(process.cwd())) { console.error('the output directory must be outside /tmp and outside the repository'); process.exit(2); }
mkdirSync(out, { recursive: true });

let access: any = null; const rows: ManifestRow[] = []; let books = 0, journals = 0, bookStats: any[] = [], journalStats: any[] = [];
for (const f of inputs) for (const line of readFileSync(f, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const o = JSON.parse(line);
  if (o.t === 'access') access = o;
  else if (o.t === 'bookStats') bookStats = o.rows;
  else if (o.t === 'journalStats') journalStats = o.rows;
  else if (o.t === 'book') { books++; rows.push(manifestRow('book', { id: o.id, title: o.title, domain: o.domain, status: o.status, subject: o.subject, source: o.source, kw: o.kw, nlm: o.nlm })); }
  else if (o.t === 'journal') { journals++; rows.push(manifestRow('journal', { id: o.id, title: o.title, domain: o.domain, status: o.status, subject: o.subject, subjects: o.subjects })); }
}

const by = (d: ManifestRow['decision']) => rows.filter(r => r.decision === d);
const tally = (rs: ManifestRow[]) => { const t: Record<string, number> = {}; for (const r of rs) { const k = `${r.kind} · ${r.currentDepartment ?? '(none)'} → ${r.proposedDepartment ?? '—'} · ${r.status}`; t[k] = (t[k] || 0) + 1; } return Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1])); };
const csv = (rs: ManifestRow[]) => ['kind,id,title,currentDepartment,status,decision,proposedDepartment,evidence,conflicts,reason'].concat(rs.map(r =>
  [r.kind, r.id, r.title, r.currentDepartment ?? '', r.status ?? '', r.decision, r.proposedDepartment ?? '', r.evidence.join(' + '), r.conflicts.join('; '), r.reason].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\n');

const ready = by('ready'), heldAccess = by('held-access'), heldAmb = by('held-ambiguous');
writeFileSync(`${out}/manifest-ready.json`, JSON.stringify(ready, null, 1)); writeFileSync(`${out}/manifest-ready.csv`, csv(ready));
writeFileSync(`${out}/manifest-held-access.json`, JSON.stringify(heldAccess, null, 1)); writeFileSync(`${out}/manifest-held-access.csv`, csv(heldAccess));
// Ambiguous rows are the bulk and mostly "one family"; keep the ones that had SOME evidence, with the reason, and count the rest.
const withSome = heldAmb.filter(r => r.evidence.length || r.conflicts.length);
writeFileSync(`${out}/manifest-held-ambiguous.json`, JSON.stringify(withSome, null, 1)); writeFileSync(`${out}/manifest-held-ambiguous.csv`, csv(withSome));
// A fixed-seed sample of what is marked ready, for a person to read before anything is approved: "ready" means the rules found nothing
// against it, not that nobody needs to look.
const seeded = (n: number) => { let x = 2463534242 + n; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const rnd = seeded(7); const sample = [...ready].sort(() => rnd() - 0.5).slice(0, 60);
writeFileSync(`${out}/review-sample-ready.csv`, csv(sample));
const summary = {
  generatedFor: 'existing records that might belong in Radiology, Optometry & Ophthalmology, Medical Laboratory Technology, Paramedical Sciences',
  applied: false, accessPreservationMechanism: ACCESS_PRESERVATION_MECHANISM,
  scanned: { books, journals, note: 'a broad capture of records whose title, subject, MeSH or NLM class touches the fields; the rules below decide, the capture does not' },
  counts: { ready: ready.length, heldForAccess: heldAccess.length, heldAmbiguous: heldAmb.length, heldAmbiguousWithSomeEvidence: withSome.length, heldAmbiguousNoEvidence: heldAmb.length - withSome.length },
  readyByMove: tally(ready), heldForAccessByMove: tally(heldAccess),
  heldAmbiguousReasons: Object.fromEntries(Object.entries(heldAmb.reduce((m: Record<string, number>, r) => { const k = r.reason.replace(/\(.*?\)/g, '()'); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12)),
  accessFacts: access, bookStats: bookStats.slice(0, 15), journalStats: journalStats.slice(0, 15),
};
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ counts: summary.counts, readyByMove: summary.readyByMove, heldForAccessByMove: summary.heldForAccessByMove, reasons: summary.heldAmbiguousReasons }, null, 1));
