/**
 * Department evidence for the net-new journals of the pool (data/dept-coverage/work/pool.json), using the product's own classifiers and nothing else:
 *   topics   departmentFromTopics (openAlexDepartments.ts): what OpenAlex says the journal's articles are about; `high` needs two topics, half the works and a clear lead
 *   title    journalDepartment + auditTitleMapping: the engine's title rules, audited for generic/foreign words
 *   official officialListDepartment (officialListDepartment.ts): publisher / society catalogue evidence (IEEE, ASME, ...) read together with the title
 * Reads only. Writes data/dept-coverage/work/classified.json  { [firstIssn]: { topics, title, official, judge } }
 *
 *   npx tsx scripts/dept-coverage/classify.ts [pool.json] [classified.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { departmentFromTopics, scoreTopics } from '../../src/lib/ingestion/openAlexDepartments.js';
import { journalDepartment } from '../../src/lib/ingestion/journalDepartment.js';
import { auditTitleMapping } from '../../src/lib/ingestion/journalMappingAudit.js';
import { classifyJournal } from '../../src/lib/ingestion/journalClassification.js';
import { canonicalDepartmentName } from '../../src/lib/departmentRegistry.js';
import { titleTopicDepartment } from '../../src/lib/ingestion/titleTopicDepartment.js';
import { officialListDepartment } from '../../src/lib/ingestion/officialListDepartment.js';
import { departmentForDoajRow } from '../../src/lib/doajCatalogue.js';
import { nlmDepartment } from '../../src/lib/ingestion/nlmJournalDepartment.js';

const inp = process.argv[2] || 'data/dept-coverage/work/pool.json', out = process.argv[3] || 'data/dept-coverage/work/classified.json';
const pool = JSON.parse(readFileSync(inp, 'utf8'));
const res: Record<string, any> = {};
let n = 0;
for (const c of pool.clusters) {
  if (c.class !== 'net-new') continue;
  const oa = c.records.find((r: any) => r.src === 'OpenAlex');
  const publisher = c.records.map((r: any) => r.publisher).find(Boolean) || null;
  const listedBy = c.records.filter((r: any) => r.src === 'Crossref member').map((r: any) => String(r.member || r.group));
  const topics = oa ? (oa.topics || []).map((t: any) => ({ display_name: t.name, count: t.count, subfield: { display_name: t.subfield }, field: { display_name: t.field } })) : [];
  const topicDecision = oa ? departmentFromTopics({ display_name: c.title, topics }) : null;
  const ev = oa ? scoreTopics(c.title, topics) : null;
  const titleDept = canonicalDepartmentName(journalDepartment(c.title, []));
  const audit = titleDept ? auditTitleMapping(c.title, publisher, titleDept) : null;
  const judge = classifyJournal({ title: c.title, subjects: [] });
  const official = officialListDepartment({ title: c.title, publisher, listedBy, societies: oa?.societies || [], topicShares: ev ? ev.shares.map(s => ({ department: s.department, share: s.share, topics: s.topics })) : [], topicTotal: ev?.total || 0 });
  const dj = c.records.find((r: any) => r.src === 'DOAJ');
  const doaj = dj ? canonicalDepartmentName(departmentForDoajRow({ 'Journal title': c.title, Keywords: (dj.keywords || []).join(' | '), 'LCC Codes': dj.lcc || '' })) : null;
  const nl = c.records.find((r: any) => r.src === 'NLM Catalog');
  const nlm = nl ? nlmDepartment(c.title, publisher, nl.nlmSubjects || []) : null;
  const shares = ev ? ev.shares.map(s => ({ department: s.department, share: s.share, topics: s.topics })) : [];
  const tt = oa ? titleTopicDepartment({ title: c.title, topicShares: shares, topicTotal: ev?.total || 0 }) : null;
  const deptShares: Record<string, number> = {}; for (const sh of shares) deptShares[sh.department] = Math.round(sh.share * 100) / 100;
  res[c.ids[0]] = { deptShares, doaj, nlm, titleTopics: tt, topics: topicDecision, title: titleDept ? { dept: titleDept, verdict: audit!.verdict, reasons: audit!.reasons } : null, official, judge: { dept: judge.dept, tier: judge.tier } };
  n++;
}
writeFileSync(out, JSON.stringify(res));
console.log(`classified ${n} net-new journals -> ${out}`);
