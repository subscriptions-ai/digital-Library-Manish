/**
 * Invariants of the frozen department-coverage manifest (offline: reads the committed files, touches no database).
 *
 *   npx tsx scripts/test-dept-coverage-manifest.ts [docs/dept-coverage-2026-10-29]
 *
 * The frozen set must be exactly what was meant to be inserted: valid ISSN check digits, one record per journal (no repeated identifier or normalised title), a publisher, one of the
 * eleven target departments (never the generic "Engineering"), nothing that claims a licence or open access, every row carrying its sources and evidence, the canary being the first
 * rows of the frozen set, and (once the run has executed) the checksum and inserted ids recorded in the audit manifest matching the files on disk.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validIssn, normTitle } from '../src/lib/ingestion/journalSourceImport.js';
const dir = process.argv[2] || 'docs/dept-coverage-2026-10-29';
const read = (f: string) => readFileSync(`${dir}/${f}`);
const json = (f: string) => JSON.parse(read(f).toString('utf8'));
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const TARGETS = ['Electrical Engineering', 'Electronics & Telecommunication Engineering', 'Mechanical Engineering', 'Applied Mechanics', 'Pharmacy', 'Bio Technology', 'Chemical Engineering', 'Nano Technology', 'Architecture', 'Physiotherapy', 'Ayurveda'];

const frozen = json('manifest-frozen.json'), canary = json('plan-canary.json'), rest = json('plan-rest.json');
const rows: any[] = frozen.rows;
check('canary + remainder are exactly the frozen rows, canary first, canary at most 25', JSON.stringify([...canary.rows, ...rest.rows].map((r: any) => r.issn)) === JSON.stringify(rows.map(r => r.issn)) && canary.rows.length <= 25 && frozen.candidates === rows.length, `${canary.rows.length} + ${rest.rows.length} = ${rows.length}`);
check('all plans share one run id', canary.runId === rest.runId && rest.runId === frozen.runId);
check('every ISSN and eISSN passes the check digit', rows.every(r => validIssn(r.issn) && (!r.eissn || validIssn(r.eissn))));
const ids = rows.flatMap(r => [r.issn, r.eissn].filter(Boolean));
check('no identifier is carried by two rows (either column)', new Set(ids).size === ids.length, `${ids.length} identifiers`);
check('no two rows share a normalised title', new Set(rows.map(r => normTitle(r.title))).size === rows.length);
check('every row has a publisher and one of the eleven target departments (never "Engineering")', rows.every(r => String(r.publisherName || '').trim() && TARGETS.includes(r.domain)));
check('no row claims a licence, open access or rights', rows.every(r => !('licence' in r) && !('openAccess' in r) && !('rightsBasis' in r) && !('licenceIsNC' in r)));
check('subjects are empty and country is only a code a source stated', rows.every(r => Array.isArray(r.subjects) && r.subjects.length === 0 && (r.country === null || /^[A-Z]{2}$/.test(r.country))));
check('each row names a source label the writer knows and lists it as a source', rows.every(r => ['Crossref', 'NLM Catalog', 'OpenAlex'].includes(r.basisSource) && r.evidence.listedBy.length > 0));
check('each row carries a department route, publication evidence, source references and a verification date', rows.every(r => r.evidence?.route && r.evidence?.publication?.class === 'P-A' && r.evidence?.urls?.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.evidence?.verified)));
check('no row rests on one kind of department evidence (topics alone)', rows.every(r => r.evidence.route !== 'topics'));
check('a department name in the title is not required: some rows have none', rows.some(r => r.evidence.route === 'official-list' && !/electr|mechan|commun|circuit|power|device/i.test(r.title)) || rows.some(r => r.evidence.route === 'nlm-subject'));
check('the hand holds are all recorded with a reason', json('hand-holds.json').every((h: any) => h.reason && h.title));
if (existsSync(`${dir}/audit-manifest.json`)) {
  const audit = json('audit-manifest.json');
  check('the manifest checksum in the audit manifest matches the bytes on disk', createHash('sha256').update(read('manifest-frozen.json')).digest('hex') === audit.frozenManifest.sha256);
  const ins = audit.inserted;
  check('the inserted ids are unique, equal the frozen count, canary first', new Set(ins.ids).size === ins.ids.length && ins.ids.length === rows.length && ins.canaryIds.length === canary.rows.length && ins.restIds.length === rest.rows.length && ins.ids.slice(0, ins.canaryIds.length).every((i: string, k: number) => i === ins.canaryIds[k]));
  check('the rollback is bound to the exact id list, not to a label alone, and was not executed', /id = ANY\s*\(/.test(audit.rollback.sql) && /NOT EXISTS/.test(audit.rollback.sql) && /RETURNING/.test(audit.rollback.sql) && audit.rollback.executed === false);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
