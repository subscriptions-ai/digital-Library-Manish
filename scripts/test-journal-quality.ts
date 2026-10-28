/**
 * Department quality for imported journals: the title-only audit (weak / wrong / manual are never inserted) and the OpenAlex topic evidence. Pure: no database.
 *
 *   npx tsx scripts/test-journal-quality.ts
 *
 * Real titles that the first Crossref import got wrong ("Solar Revista de Filosofía Iberoamericana" → Energy, "Journal of Vocational Rehabilitation" → Physiotherapy, "International Journal of
 * Periodontal Rehabilitation" → Physiotherapy), real titles that are right, and topic evidence of every shape: strong, thin, tied, contradicted by the title, ambiguous, multidisciplinary.
 */
import { auditTitleMapping } from '../src/lib/ingestion/journalMappingAudit.js';
import { departmentFromTopics, scoreTopics, SUBFIELD_DEPARTMENT } from '../src/lib/ingestion/openAlexDepartments.js';
import { planCandidates } from '../src/lib/ingestion/journalSourceImport.js';
import { CANONICAL_NAMES as CANON } from '../src/lib/departmentRegistry.js';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? '  — ' + detail : ''}`); };
const eq = (n: string, got: any, want: any) => check(n, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? '' : `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const section = (t: string) => console.log(`\n${t}`);
const v = (title: string, dept: string) => auditTitleMapping(title, null, dept);

section('1. Title-only matches: the false positives the first import wrote');
eq('"Solar Revista de Filosofía Iberoamericana" → Energy is WRONG (a Spanish word, a humanities title)', v('Solar Revista de Filosofía Iberoamericana', 'Energy').verdict, 'wrong');
eq('"Journal of Vocational Rehabilitation" → Physiotherapy is wrong', v('Journal of Vocational Rehabilitation', 'Physiotherapy').verdict, 'wrong');
eq('"Psychiatric Rehabilitation Journal" → Physiotherapy is wrong', v('Psychiatric Rehabilitation Journal', 'Physiotherapy').verdict, 'wrong');
const perio = v('International Journal of Periodontal Rehabilitation', 'Physiotherapy');
check('"…Periodontal Rehabilitation" → Physiotherapy is wrong, and the title points to Dental', perio.verdict === 'wrong' && perio.betterDepartment === 'Dental');
eq('"Polymers from Renewable Resources" → Energy is wrong (polymers: Material Science)', [v('Polymers from Renewable Resources', 'Energy').verdict, v('Polymers from Renewable Resources', 'Energy').betterDepartment], ['wrong', 'Material Science']);
eq('"Current Water Management Reports" → Management is weak (management of water)', v('Current Water Management Reports', 'Management').verdict, 'weak');

section('2. Title-only matches that are right');
for (const [t, d] of [['Physical Therapy', 'Physiotherapy'], ['Journal of the Japanese Physical Therapy Association', 'Physiotherapy'], ['Dentistry Advanced Research', 'Dental'], ['Journal of Clinical Nursing Practice', 'Nursing'], ['Business Management Perspectives', 'Management'], ['European Journal of Marketing', 'Management'], ['Solar & Wind Technology', 'Energy'], ['Chinese Journal of Polymer Science', 'Material Science'], ['Revista de Marketing y Publicidad', 'Management'], ['Journal of Ayurveda and Integrative Medicine', 'Ayurveda'], ['Journal of Nanotechnology', 'Nano Technology']] as const)
  eq(`"${t}" → ${d} is good`, v(t, d).verdict, 'good');

section('3. Title-only matches that need a person');
for (const [t, d] of [['Clinical Rehabilitation', 'Physiotherapy'], ['Rehabilitation Research and Practice', 'Physiotherapy'], ['Electric Machines & Power Systems', 'Energy'], ['Journal of Health Management', 'Management']] as const)
  eq(`"${t}" → ${d} is weak (a generic word only)`, v(t, d).verdict, 'weak');
eq('a non-English title matched only on a short word is weak', v('Boletín de Gestión y Management', 'Management').verdict, 'weak');
eq('"Nanomaterials and Polymers Innovations" names two fields: a person decides', v('Nanomaterials and Polymers Innovations', 'Nano Technology').verdict, 'manual');

section('4. The planner keeps weak, wrong and manual title-only matches out');
const issn = (n: number) => { const s = String(1000000 + n * 7).slice(0, 7); let sum = 0; for (let i = 0; i < 7; i++) sum += Number(s[i]) * (8 - i); const c = (11 - (sum % 11)) % 11; return `${s.slice(0, 4)}-${s.slice(4)}${c === 10 ? 'X' : c}`; };
const cand = (title: string, n: number, extra: any = {}) => ({ source: 'Crossref Journals' as const, title, issn: issn(n), eissn: null, publisherName: 'Pub', country: null, homepage: null, subjects: [] as string[], ...extra });
const cs = [cand('Journal of Clinical Nursing Practice', 1), cand('Journal of Vocational Rehabilitation', 2), cand('Clinical Rehabilitation', 3), cand('Solar Revista de Filosofía Iberoamericana', 4)];
const plan = planCandidates('Crossref Journals', cs as any, [], { targets: ['Nursing', 'Physiotherapy', 'Energy'] });
eq('only the good one is ready; the others are weak_mapping (review)', [plan.counts.ready, plan.counts.weak_mapping], [1, 3]);
check('the reason says why', (plan.samples.weak_mapping || []).every(p => /title-only match is (weak|wrong|manual)/.test(p.detail)));

section('5. OpenAlex topics as department evidence');
const T = (sub: string, count: number, field = 'X') => ({ display_name: `topic ${sub}`, count, subfield: { display_name: sub }, field: { display_name: field } });
const strong = departmentFromTopics({ display_name: 'Journal of Applied Pharma', topics: [T('Pharmaceutical Science', 60), T('Pharmacology', 25), T('Drug Discovery', 10), T('Surgery', 5)] });
check('three pharmacy topics holding 95% of its works → Pharmacy, high', strong.dept === 'Pharmacy' && strong.confidence === 'high');
const oneTopic = departmentFromTopics({ display_name: 'Some Journal', topics: [T('Pharmaceutical Science', 100)] });
check('a single supporting topic is not enough → low, review', oneTopic.dept === 'Pharmacy' && oneTopic.confidence === 'low');
const tie = departmentFromTopics({ display_name: 'Some Journal', topics: [T('Software', 40), T('Artificial Intelligence', 30), T('Accounting', 35), T('Marketing', 30)] });
check('two departments level → low (no margin)', tie.confidence === 'low');
const unmapped = departmentFromTopics({ display_name: 'Some Journal', topics: [T('Psychiatry and Mental health', 50), T('Surgery', 30)] });
check('topics that map to no department → none, low', unmapped.dept === null && unmapped.confidence === 'low');
const contra = departmentFromTopics({ display_name: 'Journal of Dental Research', topics: [T('Software', 50), T('Artificial Intelligence', 30), T('Information Systems', 20)] });
check('the title names Dental but the topics say Computer / IT → low (contradiction)', contra.confidence === 'low' && /names Dental/.test(contra.reason || ''));
const elec = departmentFromTopics({ display_name: 'Journal of Electrical Machines and Drives', topics: [T('Electrical and Electronic Engineering', 70), T('Control and Systems Engineering', 20), T('Energy Engineering and Power Technology', 5)] });
check('electrical/electronic topics, an "electrical machines and drives" title → Electrical Engineering', elec.dept === 'Electrical Engineering' && elec.confidence === 'high');
const tele = departmentFromTopics({ display_name: 'IEEE Wireless Communications Letters', topics: [T('Electrical and Electronic Engineering', 60), T('Signal Processing', 25), T('Computer Networks and Communications', 10)] });
check('the same subfield with a wireless/communications title → Electronics & Telecommunication', tele.dept === 'Electronics & Telecommunication Engineering' && tele.confidence === 'high');
const amb = departmentFromTopics({ display_name: 'Journal of Engineering Research', topics: [T('Electrical and Electronic Engineering', 80), T('Control and Systems Engineering', 10)] });
check('electrical vs electronics with a title that does not say → no department, low', amb.dept === null && amb.confidence === 'low');
const both = departmentFromTopics({ display_name: 'Journal of Power Electronics', topics: [T('Electrical and Electronic Engineering', 90), T('Control and Systems Engineering', 5)] });
check('a title with both "power" and "electronics" does not say which → low', both.dept === null && both.confidence === 'low');
const multi = departmentFromTopics({ display_name: 'International Journal of Multidisciplinary Research', topics: [T('Software', 20, 'Computer Science'), T('Accounting', 20, 'Business'), T('Plant Science', 20, 'Agri'), T('Pharmacology', 20, 'Pharm'), T('Education', 20, 'Social')] });
check('"multidisciplinary" in the title AND five fields of topics → Multidisciplinary, high', multi.dept === 'Multidisciplinary' && multi.confidence === 'high');
const multiOneField = departmentFromTopics({ display_name: 'Interdisciplinary Studies in Musicology', topics: [T('Music', 60, 'Arts and Humanities'), T('Literature and Literary Theory', 10, 'Arts and Humanities'), T('Education', 10, 'Social Sciences'), T('History', 10, 'Arts and Humanities'), T('Sociology and Political Science', 10, 'Social Sciences')] });
check('"interdisciplinary" in the title with one field holding most of its works is NOT Multidisciplinary', multiOneField.dept !== 'Multidisciplinary');
const sport = departmentFromTopics({ display_name: 'Jurnal Ilmu Olahraga dan Kesehatan', topics: [T('Physical Therapy, Sports Therapy and Rehabilitation', 40), T('Physical Therapy, Sports Therapy and Rehabilitation', 25), T('Orthopedics and Sports Medicine', 20), T('Education', 10)] });
check('a sports-education journal on the physical-therapy subfield is low, not Physiotherapy', sport.confidence === 'low' && /sport/.test(sport.reason || ''));
const sportNoWord = departmentFromTopics({ display_name: 'Jurnal Prestasi', topics: [T('Physical Therapy, Sports Therapy and Rehabilitation', 50), T('Physical Therapy, Sports Therapy and Rehabilitation', 30), T('Education', 10)] });
check('a title with no therapy word on that subfield is low (sports science is filed there)', sportNoWord.confidence === 'low');
const sportRehab = departmentFromTopics({ display_name: 'Journal of Sport Rehabilitation', topics: [T('Physical Therapy, Sports Therapy and Rehabilitation', 70), T('Orthopedics and Sports Medicine', 15), T('Rehabilitation', 5)] });
check('…but a sport REHABILITATION journal is Physiotherapy, high', sportRehab.dept === 'Physiotherapy' && sportRehab.confidence === 'high');
const lis = departmentFromTopics({ display_name: 'International Journal of Library and Information Services', topics: [T('Information Systems', 60), T('Library and Information Sciences', 20, 'Social Sciences'), T('Software', 5)] });
check('a library-science journal on information-systems topics is low, not Computer / IT', lis.confidence === 'low' && /library/.test(lis.reason || ''));
const infoTech = departmentFromTopics({ display_name: 'Journal of Library Automation Software', topics: [T('Information Systems', 60), T('Software', 25), T('Computer Science Applications', 10)] });
check('…unless the title also says computing', infoTech.dept === 'Computer / IT' && infoTech.confidence === 'high');
const multiTitleOnly = departmentFromTopics({ display_name: 'Multidisciplinary Journal of Chemistry', topics: [T('Organic Chemistry', 70), T('Inorganic Chemistry', 20)] });
check('"multidisciplinary" in the title with chemistry topics → Chemistry (the word alone is not evidence)', multiTitleOnly.dept === 'Chemistry');
const sc = scoreTopics('x', [T('Software', 10), T('Not A Real Subfield', 90)]);
check('a topic with an unknown subfield counts toward the total and supports nothing', sc.total === 100 && sc.shares[0].share === 0.1);
check('every department the table names is one of this product\'s departments', Object.values(SUBFIELD_DEPARTMENT).every(d => d === 'ELECTRICAL_OR_ELECTRONICS' || CANON.includes(d)), Object.values(SUBFIELD_DEPARTMENT).filter(d => d !== 'ELECTRICAL_OR_ELECTRONICS' && !CANON.includes(d)).join(', '));
const planOA = planCandidates('OpenAlex Sources', [cand('Zeta Pharma Letters', 20)] as any, [], { targets: ['Pharmacy'], deptOf: () => strong });
check('through the planner, high topic evidence is ready with the topics as evidence', planOA.counts.ready === 1 && (planOA.ready[0].evidence as any)?.basis === 'topics');
const planLow = planCandidates('OpenAlex Sources', [cand('Zeta Pharma Letters', 21)] as any, [], { targets: ['Pharmacy'], deptOf: () => oneTopic });
check('low topic evidence is review (weak_mapping), not inserted', planLow.counts.ready === 0 && planLow.counts.weak_mapping === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
