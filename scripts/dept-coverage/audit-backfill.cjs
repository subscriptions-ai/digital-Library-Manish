/**
 * Writes the ONE missing IngestionAudit row of a batch whose journals were inserted but whose audit write failed. Create-only: it inserts nothing into "Journal", refuses to run if an audit row
 * for this run and batch already exists, and takes the inserted ids from the database itself (journals with the plan's ISSNs created inside the run window), not from position.
 * Inputs set in front of the script: var __PLAN__ = {runId, source, rows:[...]}; var __BATCH__ = 1; var __NOTE__ = "...".
 */
const { PrismaClient } = require('@prisma/client');
(async () => { const p = new PrismaClient();
  const exists = await p.$queryRawUnsafe(`select count(*)::int n from "IngestionAudit" where action='JOURNAL_SOURCE_IMPORT' and meta->>'runId'=$1 and meta->>'batch'=$2`, __PLAN__.runId, String(__BATCH__));
  if (exists[0].n) { console.error('an audit row for this run and batch already exists: nothing written'); process.exit(2); }
  const issns = __PLAN__.rows.map(r => r.issn);
  const js = await p.journal.findMany({ where: { issn: { in: issns } }, select: { id: true, issn: true, eissn: true, domain: true, status: true, rightsBasis: true, createdAt: true } });
  if (js.length !== __PLAN__.rows.length) { console.error('expected', __PLAN__.rows.length, 'journals, found', js.length, ': nothing written'); process.exit(3); }
  const byIssn = new Map(js.map(j => [j.issn, j]));
  const inserted = __PLAN__.rows.map(r => { const j = byIssn.get(r.issn); return { id: j.id, issn: r.issn, eissn: r.eissn || null, dept: r.domain, sourceId: r.sourceId || r.issn, evidence: r.evidence || null }; });
  await p.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-source-import', action: 'JOURNAL_SOURCE_IMPORT', meta: { runId: __PLAN__.runId, source: __PLAN__.source, batch: __BATCH__, at: new Date().toISOString(), status: 'MetadataOnly', openAccess: 'not verified', inserted, skipped: { identifierHeld: 0, titleHeld: 0, race: 0 }, note: __NOTE__ } } });
  process.stdout.write(JSON.stringify({ written: 1, ids: inserted.map(x => x.id) })); await p.$disconnect(); })().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
