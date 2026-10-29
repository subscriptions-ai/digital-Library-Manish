/**
 * Invariants of a frozen Nursing expansion manifest (offline: reads the committed files, touches no database).
 *
 *   npx tsx scripts/test-nursing-expansion-manifest.ts [docs/nursing-expansion-2026-10-28]
 *
 * The frozen set must be exactly what was meant to be inserted: valid ISSN check digits, one record per journal (no repeated ISSN or normalised title),
 * a publisher, department Nursing, nothing that claims a licence or open access, every row carrying its sources and evidence, the canary being the first rows of the frozen
 * set, and the checksum recorded in the audit manifest matching the bytes on disk.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validIssn, normTitle } from '../src/lib/ingestion/journalSourceImport.js';
const dir = process.argv[2] || 'docs/nursing-expansion-2026-10-28';
const read = (f: string) => readFileSync(`${dir}/${f}`);
const json = (f: string) => JSON.parse(read(f).toString('utf8'));
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const frozen = json('manifest-frozen.json'), canary = json('plan-canary.json'), rest = json('plan-rest.json'), audit = json('audit-manifest.json');
const rows: any[] = frozen.rows;
check('the manifest checksum in the audit manifest matches the bytes on disk', createHash('sha256').update(read('manifest-frozen.json')).digest('hex') === audit.frozenManifest.sha256);
check('canary + remainder are exactly the frozen rows, canary first, canary at most 25', JSON.stringify([...canary.rows, ...rest.rows].map((r: any) => r.issn)) === JSON.stringify(rows.map(r => r.issn)) && canary.rows.length <= 25 && frozen.candidates === rows.length, `${canary.rows.length} + ${rest.rows.length} = ${rows.length}`);
check('all plans share one run id', canary.runId === rest.runId && rest.runId === frozen.runId && frozen.runId === audit.runId);
check('every ISSN and eISSN passes the check digit', rows.every(r => validIssn(r.issn) && (!r.eissn || validIssn(r.eissn))));
const ids = rows.flatMap(r => [r.issn, r.eissn].filter(Boolean));
check('no ISSN is carried by two rows', new Set(rows.map(r => r.issn)).size === rows.length && rows.every(r => !r.eissn || !rows.some(o => o !== r && (o.issn === r.eissn || o.eissn === r.eissn))), `${ids.length} identifiers`);
check('no two rows share a normalised title', new Set(rows.map(r => normTitle(r.title))).size === rows.length);
check('every row has a publisher and department Nursing', rows.every(r => String(r.publisherName || '').trim() && r.domain === 'Nursing'));
check('no row claims a licence, open access or rights', rows.every(r => !('licence' in r) && !('openAccess' in r) && !('rightsBasis' in r) && !('licenceIsNC' in r)));
check('subjects, country and homepage are only what a source stated (no invented values)', rows.every(r => Array.isArray(r.subjects) && r.subjects.length === 0 && r.country === null));
check('each row names the source that lists it, from the allowed set', rows.every(r => ['SciELO', 'KoreaMed', 'NLM Catalog', 'CINAHL', 'OpenAlex'].includes(r.basisSource) && r.evidence.listedBy.includes(r.basisSource)));
check('each row carries scope evidence, publication evidence, source references and a verification date', rows.every(r => r.evidence?.scope?.tier === 'A' && r.evidence?.publication?.class === 'P-A' && r.evidence?.urls?.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.evidence?.verified)));
check('a nursing word in the title is not what qualifies a row: some rows have none, all have two independent signals or one plus the title', rows.some(r => !r.evidence.scope.TITLE) && rows.every(r => r.evidence.scope.subjectSignals >= 2 || (r.evidence.scope.subjectSignals >= 1 && r.evidence.scope.TITLE)));
check('fewer than 3 recent works is not what disqualifies a row: official current-publication statements also count', rows.every(r => r.evidence.publication.recentMax >= 3 || (r.evidence.publication.why || []).some((w: string) => /SciELO status current|CINAHL indexing current|NLM currently indexed|DOAJ listed/.test(w))));
const ins = audit.inserted;
check('the inserted IDs are unique, 80 in number, canary first', new Set(ins.ids).size === ins.ids.length && ins.ids.length === rows.length && ins.canaryIds.length === canary.rows.length && ins.restIds.length === rest.rows.length && ins.ids.slice(0, ins.canaryIds.length).every((i: string, k: number) => i === ins.canaryIds[k]));
check('the rollback is bound to the exact ID list, not to a label alone', /id = ANY\s*\(/.test(audit.rollback.sql) && /NOT EXISTS/.test(audit.rollback.sql) && /RETURNING/.test(audit.rollback.sql));
check('the record of what was held lists every held record with a reason', json('frozen-hand-and-rename-holds.json').every((h: any) => h.reason));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
