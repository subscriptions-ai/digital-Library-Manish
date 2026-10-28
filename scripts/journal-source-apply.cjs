/**
 * Insert the NEW journals a plan marked ready (src/lib/ingestion/journalSourceImport.ts), in bounded batches. Plain Node + @prisma/client only, so it can run where the app
 * runs (it needs nothing the production image does not have).
 *
 *   node scripts/journal-source-apply.cjs plan.json [--batch=100] [--max=N] [--dry]
 *   (cat <(echo "var __PLAN__ = $(cat plan.json);") scripts/journal-source-apply.cjs) | node - --batch=100   (the plan travels in the script text: nothing is written to the machine it runs on)
 *
 * Every journal it creates is MetadataOnly, open access NOT verified (openAccess false, no licence, no non-commercial verdict, rights basis "<source> listing — OA unverified"),
 * never Accepted, with no articles. It only ever CREATES: no existing journal is updated or deleted, and nothing outside "Journal" and "IngestionAudit" is touched.
 *
 * Before each insert it re-checks the live table: any identifier already held in either column, or the same title, means the candidate is skipped and counted
 * (someone else wrote it since the plan). A unique-ISSN collision is skipped the same way. One audit entry per batch lists what was inserted and why.
 */
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const DRY = process.argv.includes('--dry');
const BATCH = Math.min(100, Math.max(1, parseInt(arg('batch', '100'), 10) || 100));
const MAX = parseInt(arg('max', '0'), 10) || Infinity;
const file = process.argv.slice(2).find(a => !a.startsWith('--'));

(async () => {
  const plan = typeof __PLAN__ !== 'undefined' ? __PLAN__ : JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = (plan.rows || []).slice(0, MAX);
  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  const startedAt = new Date().toISOString();
  const out = { database: db, runId: plan.runId, source: plan.source, dry: DRY, startedAt, requested: rows.length, inserted: 0, skippedIdentifierHeld: 0, skippedTitleHeld: 0, skippedRace: 0, failed: 0, firstError: null, batches: 0, insertedIds: [] };
  const basis = `${plan.source === 'OpenAlex Sources' ? 'OpenAlex' : plan.source === 'ROAD' ? 'ROAD' : 'Crossref'} listing — OA unverified`;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const ids = [...new Set(batch.flatMap(r => [r.issn, r.eissn].filter(Boolean)))];
    const held = ids.length ? await p.journal.findMany({ where: { OR: [{ issn: { in: ids } }, { eissn: { in: ids } }] }, select: { id: true, issn: true, eissn: true } }) : [];
    const heldIds = new Set(held.flatMap(h => [h.issn, h.eissn].filter(Boolean)));
    const titles = [...new Set(batch.map(r => String(r.title).toLowerCase().trim()))];
    const heldTitles = new Set((await p.$queryRawUnsafe('select lower(btrim(title)) t from "Journal" where lower(btrim(title)) = any($1::text[])', titles)).map(r => r.t));
    const inserted = [], skipped = { identifierHeld: 0, titleHeld: 0, race: 0 };
    const seenNow = new Set();
    for (const r of batch) {
      const mine = [r.issn, r.eissn].filter(Boolean);
      if (mine.some(x => heldIds.has(x) || seenNow.has(x))) { skipped.identifierHeld++; continue; }
      if (heldTitles.has(String(r.title).toLowerCase().trim())) { skipped.titleHeld++; continue; }
      if (DRY) { inserted.push({ issn: r.issn, eissn: r.eissn || null, dept: r.domain, title: String(r.title).slice(0, 80) }); mine.forEach(x => seenNow.add(x)); continue; }
      try {
        const j = await p.journal.create({
          data: {
            title: r.title, issn: r.issn, eissn: r.eissn || null, publisherName: r.publisherName || null, country: r.country || null, homepage: r.homepage || null,
            domain: r.domain, subjects: r.subjects || [],
            // Nothing is claimed that has not been checked.
            openAccess: false, licence: null, licenceIsNC: null, rightsBasis: basis, rightsVerifiedAt: null, rightsVerifiedBy: null,
            status: 'MetadataOnly',
          },
          select: { id: true },
        });
        inserted.push({ id: j.id, issn: r.issn, eissn: r.eissn || null, dept: r.domain, sourceId: r.sourceId || r.issn, evidence: r.evidence || null });
        mine.forEach(x => seenNow.add(x)); heldTitles.add(String(r.title).toLowerCase().trim());
      } catch (e) {
        if (e && e.code === 'P2002') skipped.race++;
        else { out.failed++; out.firstError = out.firstError || String(e && e.message || e).slice(0, 300); }
      }
    }
    out.inserted += inserted.length; out.skippedIdentifierHeld += skipped.identifierHeld; out.skippedTitleHeld += skipped.titleHeld; out.skippedRace += skipped.race; out.batches++;
    out.insertedIds.push(...inserted.filter(x => x.id).map(x => x.id));
    if (!DRY && inserted.length) {
      await p.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-source-import', action: 'JOURNAL_SOURCE_IMPORT', meta: { runId: plan.runId, source: plan.source, batch: out.batches, at: new Date().toISOString(), status: 'MetadataOnly', openAccess: 'not verified', inserted, skipped } } })
        .catch(e => { out.firstError = out.firstError || 'audit: ' + String(e && e.message || e).slice(0, 200); });
    }
    process.stderr.write(`batch ${out.batches}: +${inserted.length} (held ${skipped.identifierHeld}, title ${skipped.titleHeld}, race ${skipped.race})\n`);
  }
  out.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
})().catch(e => { console.error('APPLY FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
