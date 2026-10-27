/**
 * DOAJ identity conflicts, read only: every DOAJ journal whose ISSN and e-ISSN we do not hold but whose TITLE is a held journal's, with the evidence compared
 * (publisher, country, web address, continuity) and a verdict: likely distinct, likely duplicate or renamed, or ambiguous.
 *
 *   npx tsx scripts/doaj-identity-conflicts.ts [--csv /path/doaj.csv] [--json out.json]
 *
 * Writes nothing. The verdict is a reading aid; no Journal is created or changed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { findConflicts, summarise } from '../src/lib/ingestion/doajConflicts.js';
import { ingestionDb as db } from '../src/lib/ingestion/db.js';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const before = await db.journal.count();
const list = await findConflicts(arg('--csv') ? readFileSync(arg('--csv')!, 'utf8') : undefined);
const s = summarise(list);
console.log(`DOAJ identity conflicts: ${s.total}   likely distinct ${s.distinct}   likely duplicate/renamed ${s.duplicate}   ambiguous ${s.ambiguous}\n`);
for (const c of list) {
  console.log(`[${c.verdict.toUpperCase()}] "${c.doaj.title}"  DOAJ ${c.doaj.issn}${c.doaj.eissn ? ' / ' + c.doaj.eissn : ''} · ${c.doaj.publisher || '—'} · ${c.doaj.country || '—'} · ${c.doaj.homepage || '—'}`);
  for (const h of c.held) console.log(`     held ${h.id === c.against ? '►' : ' '} ${h.issn || '—'}${h.eissn ? ' / ' + h.eissn : ''} · ${h.status} · ${h.publisher || '—'} · ${h.country || '—'} · ${h.homepage || '—'} · ${h.origin}`);
  console.log(`     why: ${c.reasons.join('; ')}\n`);
}
if (arg('--json')) writeFileSync(arg('--json')!, JSON.stringify({ summary: s, conflicts: list }, null, 2));
console.log(`Nothing was written: journals ${before} → ${await db.journal.count()}`);
await db.$disconnect();
