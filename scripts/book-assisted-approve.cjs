/**
 * Approve a person-reviewed list of Draft Books exactly as the admin "Approve" button does (src: server.ts reviewAction): status Published, the chosen department, rejectionNote cleared, and
 * one CONTENT_PUBLISHED audit event per book that actually moved (the Daily Summary counts publication from it). Plain Node + @prisma/client, so it can run where the app runs.
 *
 *   (cat <(echo "var __PLAN__ = $(cat plan.json);") scripts/book-assisted-approve.cjs) | node - [--dry] [--batch=50] [--max=N]
 *
 * plan.rows[]: { id, department, pins: { licence, licenceIsNC, rightsStatus, accessStatus, rightsBasis, year, doi, isbn, fingerprint } }. Before each book it re-reads the live row and publishes it only if it
 * is STILL what the person reviewed: a Draft, ingested, not rejected, no department yet, no file address, not viewable-here, the same licence / non-commercial flag / rights / access / year, and no
 * OTHER published book with the same DOI, ISBN or fingerprint. The UPDATE repeats those conditions, so a change made in between means no row matches and the other change wins. It only ever
 * updates status, domain, rejectionNote and updatedAt of the books on the list; it creates nothing but the audit rows; it deletes nothing.
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const DRY = process.argv.includes('--dry'); const BATCH = Math.min(100, parseInt(arg('batch', '50'), 10) || 50); const MAX = parseInt(arg('max', '0'), 10) || Infinity;
(async () => {
  const plan = __PLAN__; const rows = plan.rows.slice(0, MAX); const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  const out = { database: db, runId: plan.runId, dry: DRY, requested: rows.length, published: 0, skipped: {}, failed: 0, firstError: null, publishedIds: [], byDepartment: {} };
  const skip = (why) => { out.skipped[why] = (out.skipped[why] || 0) + 1; };
  for (let i = 0; i < rows.length; i += BATCH) {
    const moved = [];
    for (const r of rows.slice(i, i + BATCH)) {
      try {
        const [b] = await p.$queryRawUnsafe(`select id, status, "ownershipSource", "rejectionNote", domain, licence, "licenceIsNC", "rightsStatus", "accessStatus", "rightsBasis", year, "pdfUrl", doi, isbn, fingerprint from "Book" where id = $1`, r.id);
        if (!b) { skip('record missing'); continue; }
        if (b.status !== 'Draft' || b.ownershipSource !== 'Ingested' || b.rejectionNote) { skip('no longer a Draft / rejected / not ingested'); continue; }
        if (b.domain && b.domain !== '') { skip('a department was set meanwhile'); continue; }
        if (b.pdfUrl || b.accessStatus === 'ViewableHere') { skip('carries a file / viewable here'); continue; }
        const k = r.pins;
        const same = (a, c) => (a ?? null) === (c ?? null);
        if (!same(b.licence, k.licence) || !same(b.licenceIsNC, k.licenceIsNC) || !same(b.rightsStatus, k.rightsStatus) || !same(b.accessStatus, k.accessStatus) || !same(b.rightsBasis, k.rightsBasis) || !same(b.year, k.year)) { skip('licence / rights / access / year changed since review'); continue; }
        const twin = (await p.$queryRawUnsafe(`select 1 from "Book" where status = 'Published' and id <> $1 and (($2::text is not null and doi = $2) or ($3::text is not null and isbn = $3) or ($4::text is not null and fingerprint = $4)) limit 1`, r.id, b.doi, b.isbn, b.fingerprint))[0];
        if (twin) { skip('an identical book is already published'); continue; }
        if (DRY) { out.published++; out.byDepartment[r.department] = (out.byDepartment[r.department] || 0) + 1; continue; }
        const done = await p.$queryRawUnsafe(
          `update "Book" set status = 'Published', domain = $2, "rejectionNote" = null, "updatedAt" = now()
            where id = $1 and status = 'Draft' and "ownershipSource" = 'Ingested' and "rejectionNote" is null and (domain is null or domain = '') and "pdfUrl" is null
              and licence is not distinct from $3::text and "licenceIsNC" is not distinct from $4::boolean and "rightsStatus" is not distinct from $5::text
              and "accessStatus" is not distinct from $6::text and "rightsBasis" is not distinct from $7::text and year is not distinct from $8::int
            returning id`, r.id, r.department, b.licence, b.licenceIsNC, b.rightsStatus, b.accessStatus, b.rightsBasis, b.year);
        if (!done.length) { skip('changed while publishing'); continue; }
        out.published++; out.publishedIds.push(r.id); out.byDepartment[r.department] = (out.byDepartment[r.department] || 0) + 1; moved.push(r);
      } catch (e) { out.failed++; out.firstError = out.firstError || String(e && e.message || e).slice(0, 300); }
    }
    if (!DRY && moved.length) {
      await p.ingestionAudit.createMany({ data: moved.map(r => ({ adminId: null, adminEmail: plan.by || 'assisted-approve', action: 'CONTENT_PUBLISHED', meta: { type: 'book', id: r.id, method: 'manual', via: 'approve', department: r.department, runId: plan.runId, assisted: true } })) })
        .catch(e => { out.firstError = out.firstError || 'audit: ' + String(e && e.message || e).slice(0, 200); });
    }
    process.stderr.write(`batch: +${moved.length || (DRY ? 'dry' : 0)}\n`);
  }
  process.stdout.write(JSON.stringify(out)); await p.$disconnect();
})().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
