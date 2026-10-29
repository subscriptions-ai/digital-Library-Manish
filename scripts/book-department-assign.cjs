/**
 * Give a department to Books that have none: "Assign Department, Stay Draft" for a frozen plan. Plain Node + @prisma/client, so it runs where the app runs.
 *
 *   (printf 'var __PLAN__ = %s;\n' "$(cat plan.json)"; cat scripts/book-department-assign.cjs) | node - --expect-db=postgres [--dry] [--batch=250] [--max=250]
 *
 * It decides nothing: the plan (scripts/build-assign-plan.ts) says which book gets which department and carries the note the application's own review
 * code would write. This script only applies it, and only to a book that is STILL exactly what the plan saw:
 *  - ONE conditional UPDATE per book: it matches only when the book is still a Draft, Ingested, with no department, no rejection and the same title. A book
 *    that was published, rejected, assigned or edited since the export matches nothing and is counted as skipped.
 *  - It changes `domain`, `updatedAt` and `metadata.reviewAssignment` and NOTHING else: status stays Draft, licence, rights, access, source, year, fingerprint,
 *    every other metadata key are untouched. It never creates or deletes a row and never reads or writes an ingestion checkpoint.
 *  - One transaction per batch writes the assignments AND one REVIEW_BATCH_ASSIGN audit entry (what Review History reads) listing the ids; a failure rolls
 *    that batch back and STOPS the run. Re-running skips what is already assigned (idempotent).
 *  - --expect-db=<name> is required to write and must match the connected database. --max bounds the rows attempted (a canary). --dry writes nothing.
 * Undo: update "Book" set domain = null, metadata = metadata - 'reviewAssignment' where metadata->'reviewAssignment'->>'runId' = '<runId>' and status = 'Draft'.
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DRY = process.argv.includes('--dry');
const BATCH = Math.min(500, Math.max(1, parseInt(arg('batch', '250'), 10) || 250));
const MAX = parseInt(arg('max', '0'), 10) || Infinity;
const EXPECT_DB = arg('expect-db', '');
(async () => {
  const plan = __PLAN__;
  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (!DRY && (!EXPECT_DB || EXPECT_DB !== db)) { console.error(`REFUSED: connected to "${db}", --expect-db is "${EXPECT_DB}"`); process.exit(2); }
  const out = { database: db, runId: plan.runId, dry: DRY, planRows: plan.rows.length, attempted: 0, assigned: 0, skipped: 0, skippedReasons: {}, failed: 0, firstError: null, batches: 0, byDepartment: {}, stopped: null };
  const todo = plan.rows.slice(0, MAX);
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    out.attempted += slice.length;
    if (DRY) {
      // Read-only: how many of these are still exactly what the plan saw.
      const live = await p.$queryRawUnsafe(`select id, title, status, "ownershipSource", domain, "rejectionNote" from "Book" where id = any($1::text[])`, slice.map(r => r.id));
      const by = new Map(live.map(r => [r.id, r]));
      for (const r of slice) {
        const b = by.get(r.id);
        const why = !b ? 'missing' : b.status !== 'Draft' ? 'not-a-draft' : b.ownershipSource !== 'Ingested' ? 'not-ingested' : (b.domain && b.domain.trim()) ? 'already-has-department' : b.rejectionNote ? 'rejected' : b.title !== r.title ? 'title-changed' : null;
        if (why) { out.skipped++; out.skippedReasons[why] = (out.skippedReasons[why] || 0) + 1; } else { out.assigned++; out.byDepartment[r.department] = (out.byDepartment[r.department] || 0) + 1; }
      }
      continue;
    }
    const batchNo = out.batches + 1; const done = []; const reasons = {};
    try {
      await p.$transaction(async (tx) => {
        for (const r of slice) {
          const note = { ...r.note, runId: plan.runId, performedBy: 'book-department-assign', performedAt: new Date().toISOString() };
          const res = await tx.$queryRawUnsafe(
            `update "Book" set domain = $2, "updatedAt" = now(), metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{reviewAssignment}', $3::jsonb, true)
              where id = $1 and status = 'Draft' and "ownershipSource" = 'Ingested' and (domain is null or btrim(domain) = '') and "rejectionNote" is null and title = $4
              returning id`, r.id, r.department, JSON.stringify(note), r.title);
          if (res.length) done.push({ id: r.id, department: r.department }); else reasons['changed-or-already-assigned'] = (reasons['changed-or-already-assigned'] || 0) + 1;
        }
        if (process.env.DEPT_ASSIGN_TEST_FAIL_BATCH === String(batchNo)) throw new Error('test: audit write failed');
        await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-department-assign', action: 'REVIEW_BATCH_ASSIGN', meta: {
          mode: 'suggested', classifier: plan.classifier, department: null, tiers: plan.tiers, requested: slice.length, assigned: done.length, skipped: slice.length - done.length, failed: 0,
          skippedReasons: reasons, publishes: false, runId: plan.runId, batch: batchNo, at: new Date().toISOString(), ids: done.map(d => d.id) } } });
      }, { timeout: 300000, maxWait: 20000 });
    } catch (e) {
      out.failed += slice.length; out.firstError = String((e && e.message) || e).slice(0, 300); out.stopped = `batch ${batchNo} rolled back; no further batch was attempted`; break;
    }
    out.batches = batchNo; out.assigned += done.length; out.skipped += slice.length - done.length;
    for (const [k, v] of Object.entries(reasons)) out.skippedReasons[k] = (out.skippedReasons[k] || 0) + v;
    for (const d of done) out.byDepartment[d.department] = (out.byDepartment[d.department] || 0) + 1;
    process.stderr.write(JSON.stringify({ committed: batchNo, assigned: done.length, ids: done.map(d => d.id) }) + '\n');
  }
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
  if (out.stopped) process.exit(1);
})().catch(e => { console.error('ASSIGN FAILED', String((e && e.message) || e).slice(0, 400)); process.exit(1); });
