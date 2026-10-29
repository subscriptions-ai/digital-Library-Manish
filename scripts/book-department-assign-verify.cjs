/**
 * Verify a department assignment run. READ ONLY (one REPEATABLE READ, READ ONLY transaction). Plain Node + @prisma/client:
 *   (printf 'var __PLAN__ = %s;\n' "$(cat plan.json)"; cat scripts/book-department-assign-verify.cjs) | node -
 * For every plan row: if the book carries this run's note, its department is the planned one, it is still a Draft, and its note names the same department.
 * Counts audit coverage (every assigned id is in exactly one audit entry) and the books that were not assigned (and why). Writes nothing.
 */
const { PrismaClient } = require('@prisma/client');
(async () => {
  const p = new PrismaClient(); const plan = __PLAN__;
  const res = await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const q = async (sql, ...a) => JSON.parse(JSON.stringify(await tx.$queryRawUnsafe(sql, ...a), (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    const db = (await q('select current_database() d, now() at'))[0];
    const want = new Map(plan.rows.map((r) => [r.id, r.department]));
    const live = await q(`select id, domain, status, "ownershipSource", metadata->'reviewAssignment'->>'runId' run, metadata->'reviewAssignment'->>'department' note from "Book" where id = any($1::text[])`, [...want.keys()]);
    const problems = []; let assigned = 0; const notAssigned = {}; const byDept = {};
    for (const b of live) {
      if (b.run === plan.runId) {
        assigned++; byDept[b.domain] = (byDept[b.domain] || 0) + 1;
        if (b.domain !== want.get(b.id)) problems.push({ id: b.id, check: 'department', got: b.domain });
        if (b.note !== b.domain) problems.push({ id: b.id, check: 'note-disagrees', got: b.note });
        if (b.status !== 'Draft') problems.push({ id: b.id, check: 'status', got: b.status });
      } else { const why = b.domain ? 'has-other-department' : b.status !== 'Draft' ? 'not-a-draft' : 'unassigned'; notAssigned[why] = (notAssigned[why] || 0) + 1; }
    }
    const missing = want.size - live.length;
    const audits = await q(`select meta from "IngestionAudit" where action = 'REVIEW_BATCH_ASSIGN' and meta->>'runId' = $1`, plan.runId);
    const ids = audits.flatMap((a) => a.meta.ids || []); const set = new Set(ids);
    if (set.size !== ids.length) problems.push({ check: 'audit-duplicate-ids' });
    if (set.size !== assigned) problems.push({ check: 'audit-vs-assigned', audited: set.size, assigned });
    const strays = await q(`select count(*)::int n from "Book" where metadata->'reviewAssignment'->>'runId' = $1 and not (id = any($2::text[]))`, plan.runId, [...want.keys()]);
    if (strays[0].n) problems.push({ check: 'stray-rows-with-this-run', n: strays[0].n });
    return { ok: problems.length === 0, db: db.d, at: db.at, planRows: want.size, assigned, notAssigned, missing, auditEntries: audits.length, auditedIds: set.size, byDepartment: byDept, problems: problems.slice(0, 20), problemCount: problems.length };
  }, { timeout: 300000 });
  console.log(JSON.stringify(res)); await p.$disconnect();
})().catch((e) => { console.error('VERIFY FAILED', String((e && e.message) || e).slice(0, 300)); process.exit(1); });
