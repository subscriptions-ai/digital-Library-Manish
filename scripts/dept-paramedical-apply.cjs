/**
 * Paramedical Sciences: INSERT-ONLY batch writer for NEW journals. Plain Node + @prisma/client, so it runs inside the app container with the plan travelling in the script text
 * (nothing is written on the server):
 *   (cat <(echo "var __PLAN__ = $(cat plan-batch.json);") scripts/dept-paramedical-apply.cjs) | ssh … 'docker exec -i -w /app <app> node -'
 *   add `--dry` as an argument to decide without writing.
 *
 * ONE transaction per batch:
 *   1. takes pg_advisory_xact_lock(2026103001), the key every department-insert session shares (waits up to 60 s, then stops: LOCK_TIMEOUT, nothing written);
 *   2. LIVE re-check inside the lock against the whole table: every ISSN of the candidate against BOTH issn and eissn (print/online swapped included), the normalised title
 *      (accent-folded, punctuation-free) against every held title. Any match => skipped and counted;
 *   3. if more than 10% of the batch is a same-title conflict, STOPs before inserting anything (SAME_TITLE_RATE);
 *   4. inserts MetadataOnly, openAccess false, no licence, rights basis "OpenAlex listing — OA unverified", domain "Paramedical Sciences", never Accepted;
 *   5. writes one IngestionAudit row (JOURNAL_SOURCE_IMPORT, meta.runId) listing every inserted id.
 * It never updates or deletes an existing row.
 */
const { PrismaClient } = require('@prisma/client');
const KEY = '2026103001', DEPT = 'Paramedical Sciences', LOCK_WAIT_MS = 60000, MAX_TITLE_RATE = 0.10;
const DRY = process.argv.includes('--dry');
const norm = (t) => String(t || '').normalize('NFKD').toLowerCase().replace(/[^\x00-\x7f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const plan = __PLAN__; const rows = plan.rows; const p = new PrismaClient();
  const out = { runId: plan.runId, dry: DRY, requested: rows.length, startedAt: new Date().toISOString(), inserted: [], skipped: { identifierHeld: [], titleHeld: [], race: [], inBatchDuplicate: [] }, lockWaitMs: 0, stopped: null };
  if (!rows.every((r) => r.domain === DEPT)) { console.error('REFUSED: every row must be in ' + DEPT); process.exit(3); }
  try {
    await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 60000");
      const t0 = Date.now(); let ok = false;
      while (Date.now() - t0 < LOCK_WAIT_MS) { ok = (await tx.$queryRawUnsafe(`select pg_try_advisory_xact_lock(${KEY}::bigint) ok`))[0].ok; if (ok) break; await sleep(1000); }
      out.lockWaitMs = Date.now() - t0;
      if (!ok) { out.stopped = 'LOCK_TIMEOUT'; throw new Error('LOCK_TIMEOUT'); } /* shared lock protocol (coordinator 2026-10-30): all three department insert locks, same order everywhere */ await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('dept-radiology-book-insert'))`);
      const all = await tx.$queryRawUnsafe('select issn, eissn, title from "Journal"');
      const heldIds = new Set(); const heldTitles = new Set();
      for (const j of all) { if (j.issn) heldIds.add(j.issn); if (j.eissn) heldIds.add(j.eissn); heldTitles.add(norm(j.title)); }
      const plannedIds = new Set(); const plannedTitles = new Set(); const toInsert = [];
      for (const r of rows) {
        const mine = [r.issn, r.eissn].filter(Boolean);
        if (mine.some((x) => heldIds.has(x))) { out.skipped.identifierHeld.push(r.title); continue; }
        if (heldTitles.has(norm(r.title))) { out.skipped.titleHeld.push(r.title); continue; }
        if (mine.some((x) => plannedIds.has(x)) || plannedTitles.has(norm(r.title))) { out.skipped.inBatchDuplicate.push(r.title); continue; }
        mine.forEach((x) => plannedIds.add(x)); plannedTitles.add(norm(r.title)); toInsert.push(r);
      }
      if (out.skipped.titleHeld.length / rows.length > MAX_TITLE_RATE) { out.stopped = 'SAME_TITLE_RATE'; throw new Error('SAME_TITLE_RATE'); }
      if (DRY) { out.inserted = toInsert.map((r) => ({ issn: r.issn, eissn: r.eissn || null, title: r.title })); return; }
      for (const r of toInsert) {
        const j = await tx.journal.create({
          data: { title: r.title, issn: r.issn, eissn: r.eissn || null, publisherName: r.publisherName || null, country: r.country || null, homepage: r.homepage || null,
                  domain: DEPT, subjects: [], openAccess: false, licence: null, licenceIsNC: null, rightsBasis: 'OpenAlex listing — OA unverified', rightsVerifiedAt: null, rightsVerifiedBy: null, status: 'MetadataOnly' },
          select: { id: true } });
        out.inserted.push({ id: j.id, issn: r.issn, eissn: r.eissn || null, title: r.title, dept: DEPT, sourceId: r.sourceId, evidence: r.evidence });
      }
      if (out.inserted.length) await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-source-import', action: 'JOURNAL_SOURCE_IMPORT',
        meta: { runId: plan.runId, source: 'OpenAlex', batch: plan.batch, at: new Date().toISOString(), status: 'MetadataOnly', openAccess: 'not verified', department: DEPT, inserted: out.inserted, skipped: { identifierHeld: out.skipped.identifierHeld.length, titleHeld: out.skipped.titleHeld.length, inBatchDuplicate: out.skipped.inBatchDuplicate.length } } } });
    }, { maxWait: 70000, timeout: 120000 });
  } catch (e) { out.error = String(e && e.message || e).slice(0, 300); if (!out.stopped) out.stopped = 'ERROR'; }
  out.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(out)); await p.$disconnect();
})().catch((e) => { console.error('APPLY FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
