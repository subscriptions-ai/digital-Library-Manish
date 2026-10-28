/**
 * Move reviewed journals from NeedsReview to MetadataOnly, in bounded batches. Plain Node + @prisma/client only (it runs where the app runs).
 *
 *   (cat <(echo "var __PLAN__ = $(cat plan.json);") scripts/nursing-assessment/journal-status-apply.cjs) | node - [--batch=100] [--max=N] [--dry]
 *   node scripts/nursing-assessment/journal-status-apply.cjs plan.json --rollback [--dry]        (undo one run from its audit entries)
 *
 * plan = { runId, department, rows: [{ id, issn, eissn, title, publisherFill?: "<publisher>", evidence }] }
 *
 * It changes exactly two things, and only ever on a row that is still what the plan was made from:
 *   · status NeedsReview -> MetadataOnly            (never Accepted: licence, openAccess, rights and every other column are not touched)
 *   · publisherName, only when it is empty and the plan carries a publisher found under a matching title (fill-empty only)
 * Before each row it re-checks the live table, and skips (and counts) the row instead of guessing when
 *   the row is gone / is no longer NeedsReview / is no longer in the department / has a different ISSN, eISSN or title,
 *   another row now holds either identifier (any column), another PUBLIC row holds the same title, or it would still have no publisher.
 * One audit entry per batch (action JOURNAL_STATUS_TRANSITION) records, per journal, the values before and after; --rollback restores exactly those values for the rows
 * that still carry the values this run wrote, and writes its own audit entry. Nothing is deleted, nothing outside "Journal" and "IngestionAudit" is touched.
 */
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const DRY = process.argv.includes('--dry'), ROLLBACK = process.argv.includes('--rollback');
const BATCH = Math.min(100, Math.max(1, parseInt(arg('batch', '100'), 10) || 100));
const MAX = parseInt(arg('max', '0'), 10) || Infinity;
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const PUBLIC = ['Accepted', 'MetadataOnly'];

(async () => {
  const plan = typeof __PLAN__ !== 'undefined' ? __PLAN__ : JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  const out = { database: db, runId: plan.runId, mode: ROLLBACK ? 'rollback' : 'transition', dry: DRY, startedAt: new Date().toISOString(), requested: 0, changed: 0, skipped: {}, failed: 0, firstError: null, batches: 0, changedIds: [] };
  const skip = (why) => { out.skipped[why] = (out.skipped[why] || 0) + 1; };

  if (ROLLBACK) {
    const audits = await p.$queryRawUnsafe(`select id, meta from "IngestionAudit" where action = 'JOURNAL_STATUS_TRANSITION' and meta->>'runId' = $1 order by at`, plan.runId);
    const items = audits.flatMap(a => (a.meta && a.meta.changed) || []);
    out.requested = items.length;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH), done = [];
      for (const it of batch) {
        const cur = await p.journal.findUnique({ where: { id: it.id }, select: { id: true, status: true, publisherName: true } });
        if (!cur) { skip('row gone'); continue; }
        if (cur.status !== it.after.status || (cur.publisherName || null) !== (it.after.publisherName || null)) { skip('row changed since the run (left alone)'); continue; }
        if (DRY) { done.push({ id: it.id }); continue; }
        const r = await p.journal.updateMany({ where: { id: it.id, status: it.after.status }, data: { status: it.before.status, publisherName: it.before.publisherName } });
        r.count === 1 ? done.push({ id: it.id, from: it.after, to: it.before }) : skip('race');
      }
      out.changed += done.length; out.changedIds.push(...done.map(x => x.id)); out.batches++;
      if (!DRY && done.length) await p.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-status-apply', action: 'JOURNAL_STATUS_ROLLBACK', meta: { runId: plan.runId, batch: out.batches, at: new Date().toISOString(), restored: done } } }).catch(e => { out.firstError = out.firstError || 'audit: ' + String(e && e.message || e).slice(0, 200); });
    }
  } else {
    const rows = (plan.rows || []).slice(0, MAX); out.requested = rows.length; const seenIds = new Set();
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH), changed = [];
      for (const r of batch) {
        try {
          if (seenIds.has(r.id)) { skip('duplicate row in the plan'); continue; }
          seenIds.add(r.id);
          const cur = await p.journal.findUnique({ where: { id: r.id }, select: { id: true, title: true, issn: true, eissn: true, status: true, domain: true, publisherName: true } });
          if (!cur) { skip('row gone'); continue; }
          if (cur.status !== 'NeedsReview') { skip('no longer NeedsReview'); continue; }
          if (plan.department && cur.domain !== plan.department) { skip('no longer in the department'); continue; }
          if (cur.issn !== r.issn || (cur.eissn || null) !== (r.eissn || null) || cur.title !== r.title) { skip('identity changed since the plan'); continue; }
          const ids = [cur.issn, cur.eissn].filter(Boolean);
          const clash = await p.journal.findFirst({ where: { id: { not: cur.id }, OR: [{ issn: { in: ids } }, { eissn: { in: ids } }] }, select: { id: true } });
          if (clash) { skip('another row holds an identifier'); continue; }
          const titleClash = (await p.$queryRawUnsafe(`select id from "Journal" where id <> $1 and lower(btrim(title)) = lower(btrim($2)) and status = any($3::text[]) limit 1`, cur.id, cur.title, PUBLIC))[0];
          if (titleClash) { skip('a public row holds the same title'); continue; }
          const hadPublisher = !!String(cur.publisherName || '').trim();
          const fill = !hadPublisher && String(r.publisherFill || '').trim() ? String(r.publisherFill).trim() : null;
          if (!hadPublisher && !fill) { skip('no publisher'); continue; }
          const after = { status: 'MetadataOnly', publisherName: hadPublisher ? cur.publisherName : fill };
          if (DRY) { changed.push({ id: cur.id, issn: cur.issn, before: { status: cur.status, publisherName: cur.publisherName }, after }); continue; }
          const u = await p.journal.updateMany({ where: { id: cur.id, status: 'NeedsReview' }, data: after });
          if (u.count !== 1) { skip('race'); continue; }
          changed.push({ id: cur.id, issn: cur.issn, before: { status: cur.status, publisherName: cur.publisherName }, after, evidence: r.evidence || null });
        } catch (e) { out.failed++; out.firstError = out.firstError || String(e && e.message || e).slice(0, 300); }
      }
      out.changed += changed.length; out.changedIds.push(...changed.map(x => x.id)); out.batches++;
      if (!DRY && changed.length) await p.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-status-apply', action: 'JOURNAL_STATUS_TRANSITION', meta: { runId: plan.runId, batch: out.batches, at: new Date().toISOString(), department: plan.department || null, from: 'NeedsReview', to: 'MetadataOnly', changed } } }).catch(e => { out.firstError = out.firstError || 'audit: ' + String(e && e.message || e).slice(0, 200); });
      process.stderr.write(`batch ${out.batches}: ${DRY ? 'would change' : 'changed'} ${changed.length}\n`);
    }
  }
  out.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(out)); await p.$disconnect();
})().catch(e => { console.error('APPLY FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
