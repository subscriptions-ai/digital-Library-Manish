/**
 * COORDINATOR remediation writer (reversible, exact ids, current-value guarded). Two kinds, chosen by the header:
 *   var __KIND__ = "books";    var __ROWS__ = [ {id, domain, reason, category, licence, rightsStatus, accessStatus, year}, ... ];  Published -> Draft
 *   var __KIND__ = "journals"; var __ROWS__ = [ {id, reason} ... ];                                                                MetadataOnly -> NeedsReview
 *   var __RUN__  = "dept-remediate-2026-10-30-<8 hex>";   var __MODE__ = "apply" | "restore";
 * apply  : per batch ONE transaction under all three department insert locks (60 s bound); one conditional UPDATE per record that matches only while the record is still exactly what was judged
 *          (books: Published, Ingested, no file, same department, same licence/rights/access/year; journals: MetadataOnly, MLT, no articles). It changes ONLY status and appends metadata.reviewRemediation
 *          {runId, reason, category, priorStatus, priorPublication} for books (metadata, source evidence, licences, files, reviewPublication and audit history are preserved; nothing is deleted or moved to another
 *          department). Journals have no metadata column: the reason and prior status live in the audit row. One IngestionAudit row per batch (BOOK_SOURCE_REMEDIATE / JOURNAL_STATUS_REMEDIATE).
 * restore: puts back exactly the ids that run's audit rows list, only where the record is still in the state the run left (books: Draft with this run's reviewRemediation; journals: NeedsReview).
 * --dry reports; --expect-db=<name> required to write; --max bounds the number attempted (canary); batches at most 100.
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DRY = process.argv.includes('--dry'), MAX = parseInt(arg('max', '0'), 10) || Infinity, BATCH = Math.min(100, parseInt(arg('batch', '100'), 10) || 100);
const BOOKS = __KIND__ === 'books', ACTION = BOOKS ? 'BOOK_SOURCE_REMEDIATE' : 'JOURNAL_STATUS_REMEDIATE';
const DEPTS = new Set(['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology']);
(async () => {
  const p = new PrismaClient(); const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (!DRY && arg('expect-db', '') !== db) { console.error('REFUSED: --expect-db does not match'); process.exit(2); }
  if (!/^dept-remediate-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(__RUN__)) { console.error('bad run id'); process.exit(3); }
  if (BOOKS && __ROWS__.some(r => !DEPTS.has(r.domain))) { console.error('REFUSED: department outside the four'); process.exit(3); }
  const prior = await p.$queryRawUnsafe(`select meta from "IngestionAudit" where action = $1 and meta->>'runId' = $2`, ACTION, __RUN__);
  const doneIds = new Set(prior.flatMap(a => a.meta.applied || []));
  const out = { database: db, kind: __KIND__, mode: __MODE__, runId: __RUN__, dry: DRY, requested: __ROWS__.length, attempted: 0, changed: 0, skipped: [], changedIds: [], stopped: null };
  const locks = async (tx) => { await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '60s'`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(2026103001::bigint)`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`); await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('dept-radiology-book-insert'))`); };
  try {
    if (__MODE__ === 'restore') {
      await p.$transaction(async (tx) => { if (!DRY) await locks(tx);
        const ids = [...doneIds];
        for (const id of ids) {
          if (DRY) { const m = BOOKS ? await tx.$queryRawUnsafe(`select id from "Book" where id=$1 and status='Draft' and metadata->'reviewRemediation'->>'runId'=$2`, id, __RUN__) : await tx.$queryRawUnsafe(`select id from "Journal" where id=$1 and status='NeedsReview'`, id); (m.length ? out.changedIds : out.skipped).push(m.length ? id : { id, why: 'changed since the run' }); continue; }
          const u = BOOKS ? await tx.$queryRawUnsafe(`update "Book" set status='Published', "updatedAt"=now(), metadata = metadata - 'reviewRemediation' where id=$1 and status='Draft' and metadata->'reviewRemediation'->>'runId'=$2 returning id`, id, __RUN__)
                          : await tx.$queryRawUnsafe(`update "Journal" set status='MetadataOnly', "updatedAt"=now() where id=$1 and status='NeedsReview' returning id`, id);
          if (u.length) out.changedIds.push(id); else out.skipped.push({ id, why: 'changed since the run' });
        }
        out.changed = out.changedIds.length;
        if (!DRY && out.changed) await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: ACTION + '_RESTORE', meta: { runId: __RUN__, at: new Date().toISOString(), restored: out.changedIds, skipped: out.skipped } } });
      }, { timeout: 150000, maxWait: 20000 });
    } else {
      const rows = __ROWS__.filter(r => !doneIds.has(r.id)).slice(0, MAX);
      for (let i = 0; i < rows.length; i += BATCH) {
        const part = rows.slice(i, i + BATCH);
        await p.$transaction(async (tx) => { if (!DRY) await locks(tx); const ok = [];
          for (const r of part) {
            out.attempted++;
            if (DRY) { const m = BOOKS ? await tx.$queryRawUnsafe(`select id from "Book" where id=$1 and status='Published' and domain=$2`, r.id, r.domain) : await tx.$queryRawUnsafe(`select id from "Journal" j where id=$1 and status='MetadataOnly' and domain='Medical Laboratory Technology' and not exists (select 1 from "Article" a where a."journalId"=j.id)`, r.id); if (m.length) ok.push(r.id); else out.skipped.push({ id: r.id, why: 'no longer matches' }); continue; }
            let u;
            if (BOOKS) {
              const note = JSON.stringify({ runId: __RUN__, category: r.category, reason: r.reason, priorStatus: 'Published', performedBy: 'coordinator (user-authorised)', performedAt: new Date().toISOString() });
              u = await tx.$queryRawUnsafe(`update "Book" set status='Draft', "updatedAt"=now(), metadata = jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb), '{reviewRemediation}', $2::jsonb, true), '{reviewRemediation,priorPublication}', coalesce(metadata->'reviewPublication','null'::jsonb), true)
                where id=$1 and status='Published' and "ownershipSource"='Ingested' and "pdfUrl" is null and domain=$3 and licence is not distinct from $4::text and "rightsStatus" is not distinct from $5::text and "accessStatus" is not distinct from $6::text and year is not distinct from $7::int returning id`,
                r.id, note, r.domain, r.licence, r.rightsStatus, r.accessStatus, r.year);
            } else {
              u = await tx.$queryRawUnsafe(`update "Journal" j set status='NeedsReview', "updatedAt"=now() where id=$1 and status='MetadataOnly' and domain='Medical Laboratory Technology' and not exists (select 1 from "Article" a where a."journalId"=j.id) returning id`, r.id);
            }
            if (u.length) ok.push(r.id); else out.skipped.push({ id: r.id, why: 'changed since it was judged' });
          }
          out.changed += ok.length; out.changedIds.push(...ok);
          if (!DRY && ok.length) await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: ACTION, meta: { runId: __RUN__, at: new Date().toISOString(), priorStatus: BOOKS ? 'Published' : 'MetadataOnly', newStatus: BOOKS ? 'Draft' : 'NeedsReview', applied: ok, reasons: Object.fromEntries(part.filter(r => ok.includes(r.id)).map(r => [r.id, r.reason])) } } });
        }, { timeout: 150000, maxWait: 20000 });
      }
    }
  } catch (e) { const m = String(e && e.message || e).slice(0, 300); out.stopped = /lock timeout|55P03/i.test(m) ? 'LOCK_TIMEOUT' : 'rolled back: ' + m; }
  process.stdout.write(JSON.stringify(out)); await p.$disconnect(); if (out.stopped) process.exit(1);
})().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
