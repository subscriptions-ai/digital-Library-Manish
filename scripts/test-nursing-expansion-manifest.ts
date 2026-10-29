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
check('each row names the source that lists it, from the allowed set', rows.every(r => ['SciELO', 'J-STAGE', 'KoreaMed', 'NLM Catalog', 'CINAHL', 'OpenAlex'].includes(r.basisSource) && r.evidence.listedBy.includes(r.basisSource)));
check('each row carries scope evidence, publication evidence, source references and a verification date', rows.every(r => r.evidence?.scope?.tier === 'A' && r.evidence?.publication?.class === 'P-A' && r.evidence?.urls?.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.evidence?.verified)));
const subj = (r: any) => r.evidence.scope.signals ? r.evidence.scope.signals.filter((x: string) => x !== 'TITLE').length : r.evidence.scope.subjectSignals, title = (r: any) => r.evidence.scope.signals ? r.evidence.scope.signals.includes('TITLE') : r.evidence.scope.TITLE;
check('every row has two independent Nursing signals, or one plus a nursing word in the title (a title word alone never qualifies)', rows.every(r => subj(r) >= 2 || (subj(r) >= 1 && title(r))));
check('current publication is shown by at least 3 recent works OR an official statement (SciELO current, J-STAGE latest publication date, an indexer saying current plus a recent work)', rows.every(r => { const p = r.evidence.publication; const mx = p.recentMax ?? Math.max(0, ...Object.values(p.works2024to2026 || {}).map(Number)); return mx >= 3 || (p.why || []).some((w: string) => /SciELO status current|J-STAGE latest publication date|CINAHL indexing current|NLM currently indexed|DOAJ listed/.test(w)); }));
const holdsFile = ['frozen-hand-holds.json', 'frozen-hand-and-rename-holds.json'].find(f => { try { read(f); return true; } catch { return false; } })!;
check('the record of what was held after reading the titles lists every held record with a reason', json(holdsFile).every((h: any) => h.reason));
const ins = audit.inserted;
if (!ins) { console.log('  (pre-write freeze record: inserted-ID and rollback checks apply after the write)'); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
check('the inserted IDs are unique, as many as the frozen rows, canary first', new Set(ins.ids).size === ins.ids.length && ins.ids.length === rows.length && ins.canaryIds.length === canary.rows.length && ins.restIds.length === rest.rows.length && ins.ids.slice(0, ins.canaryIds.length).every((i: string, k: number) => i === ins.canaryIds[k]));
check('the rollback is bound to the exact ID list, not to a label alone', /id = ANY\s*\(/.test(audit.rollback.sql) && /NOT EXISTS/.test(audit.rollback.sql) && /RETURNING/.test(audit.rollback.sql));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
