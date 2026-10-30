/**
 * COORDINATOR book publication writer: Draft -> Published for a frozen list of exact ids, nothing else. Header sets
 *   var __ROWS__ = [ {id, domain, licence, licenceIsNC, rightsStatus, accessStatus, rightsBasis, year, route}, ... ];   var __RUN__ = "dept-books-publish-2026-10-30-<8 hex>";
 * Per batch ONE transaction: all three department insert locks (2026103001, hashtext('stm.journal.insert'), hashtext('dept-radiology-book-insert')) in a fixed order with a 60 s bound
 * (LOCK_TIMEOUT stops the run, nothing written), then, per book, ONE conditional UPDATE that matches only while the book is still exactly what was judged: Draft, Ingested, no rejection,
 * no file, in the named department, and the same licence / rights / access / basis / year. It changes status and stamps metadata.reviewPublication (with the prior status) and nothing else:
 * no licence, access, rights, department or file field is written. A twin already Published (same DOI / ISBN / fingerprint) is skipped. One IngestionAudit row (BOOK_SOURCE_PUBLISH) per batch
 * lists the published ids and the prior status. --dry reports; --expect-db=<name> is required to write; --max bounds the number attempted (canary); batches are at most 100.
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DRY = process.argv.includes('--dry'); const MAX = parseInt(arg('max', '0'), 10) || Infinity; const BATCH = Math.min(100, parseInt(arg('batch', '100'), 10) || 100);
const DEPTS = new Set(['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology']);
(async () => {
  const p = new PrismaClient(); const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (!DRY && arg('expect-db', '') !== db) { console.error(`REFUSED: connected to "${db}", --expect-db is "${arg('expect-db', '')}"`); process.exit(2); }
  if (!/^dept-books-publish-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(__RUN__)) { console.error('bad run id'); process.exit(3); }
  if (__ROWS__.some(r => !DEPTS.has(r.domain))) { console.error('REFUSED: a row names a department outside the four'); process.exit(3); }
  const prior = await p.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'BOOK_SOURCE_PUBLISH' and meta->>'runId' = $1`, __RUN__);
  const done = new Set(prior.flatMap(a => a.meta.published || []));
  const rows = __ROWS__.filter(r => !done.has(r.id)).slice(0, MAX);
  const out = { database: db, runId: __RUN__, dry: DRY, requested: __ROWS__.length, alreadyDone: done.size, attempted: 0, published: 0, skipped: [], publishedIds: [], stopped: null, lockWaitMsMax: 0 };
  for (let i = 0; i < rows.length && !out.stopped; i += BATCH) {
    const part = rows.slice(i, i + BATCH);
    try {
      await p.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '60s'`); const t0 = Date.now();
        await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(2026103001::bigint)`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('dept-radiology-book-insert'))`);
        const wait = Date.now() - t0; out.lockWaitMsMax = Math.max(out.lockWaitMsMax, wait);
        const ok = [];
        for (const r of part) {
          out.attempted++;
          const twin = await tx.$queryRawUnsafe(`select 1 from "Book" b join "Book" c on c.id <> b.id and c.status = 'Published' and ((b.doi is not null and lower(c.doi) = lower(b.doi)) or (b.fingerprint is not null and c.fingerprint = b.fingerprint)) where b.id = $1 limit 1`, r.id);
          if (twin.length) { out.skipped.push({ id: r.id, why: 'a published twin exists' }); continue; }
          if (DRY) { const m = await tx.$queryRawUnsafe(`select id from "Book" where id = $1 and status = 'Draft' and domain = $2`, r.id, r.domain); if (m.length) ok.push(r.id); else out.skipped.push({ id: r.id, why: 'no longer a matching Draft' }); continue; }
          const stamp = JSON.stringify({ source: 'dept-coordinator', runId: __RUN__, route: r.route, priorStatus: 'Draft', performedBy: 'coordinator (user-authorised)', performedAt: new Date().toISOString() });
          const u = await tx.$queryRawUnsafe(
            `update "Book" set status = 'Published', "updatedAt" = now(), metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{reviewPublication}', $2::jsonb, true)
              where id = $1 and status = 'Draft' and "ownershipSource" = 'Ingested' and "rejectionNote" is null and "pdfUrl" is null and domain = $3
                and licence is not distinct from $4::text and "licenceIsNC" is not distinct from $5::boolean and "rightsStatus" is not distinct from $6::text
                and "accessStatus" is not distinct from $7::text and "rightsBasis" is not distinct from $8::text and year is not distinct from $9::int returning id`,
            r.id, stamp, r.domain, r.licence, r.licenceIsNC, r.rightsStatus, r.accessStatus, r.rightsBasis, r.year);
          if (u.length) ok.push(r.id); else out.skipped.push({ id: r.id, why: 'changed since it was judged' });
        }
        out.published += ok.length; out.publishedIds.push(...ok);
        if (!DRY && ok.length) await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: 'BOOK_SOURCE_PUBLISH', meta: { runId: __RUN__, at: new Date().toISOString(), lock: { keys: ['2026103001', 'stm.journal.insert', 'dept-radiology-book-insert'], waitMs: wait }, priorStatus: 'Draft', published: ok } } });
      }, { timeout: 150000, maxWait: 20000 });
    } catch (e) { const m = String(e && e.message || e).slice(0, 300); out.stopped = /lock timeout|55P03/i.test(m) ? 'LOCK_TIMEOUT: another writer held the insert lock for more than a minute' : 'batch rolled back: ' + m; }
  }
  process.stdout.write(JSON.stringify(out)); await p.$disconnect(); if (out.stopped) process.exit(1);
})().catch(e => { console.error('PUBLISH FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
