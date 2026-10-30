/**
 * Medical Laboratory Technology: create-only journal writer (derived from the transactional writer of scripts/journal-source-apply.cjs, commit 31da70b), plus the shared
 * insert lock the four department sessions agreed to use.
 *
 *   (printf 'var __PLAN__ = %s;\n' "$(cat plan.json)"; cat scripts/dept-mlt-apply.cjs) | docker exec -i -w /app <app> node - --batch=100 [--dry]
 *
 * Every journal is MetadataOnly, openAccess false, no licence, rights basis "<source> listing — OA unverified", never Accepted, no articles. It only CREATES: nothing existing is
 * updated or deleted, and nothing outside "Journal" and "IngestionAudit" is touched.
 *
 * Per batch, ONE transaction:
 *   1. SET LOCAL lock_timeout = 60s, then pg_advisory_xact_lock(hashtext('stm.journal.insert')) - the one key every department session uses, so two sessions never insert at once;
 *   2. INSIDE the lock, read the live table and re-check every candidate: ISSN and e-ISSN against BOTH columns (print/online swapped), normalized title, same title inside the batch;
 *      any match = the candidate is skipped and counted;
 *   3. AUTO-STOP before writing when the same-title skips are more than 10% of the batch (exit 6), or when the lock could not be had within a minute (exit 7);
 *   4. createMany + the IngestionAudit row, committed together or not at all.
 * A stopped run rolls nothing back (nothing partial exists) and reports; it does not retry past the stop.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const LOCK_SQL_KEY = 'stm.journal.insert';           // pg_advisory_xact_lock(hashtext('stm.journal.insert'))
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const DRY = process.argv.includes('--dry');
const BATCH = Math.min(100, Math.max(1, parseInt(arg('batch', '100'), 10) || 100));
const MAX = parseInt(arg('max', '0'), 10) || Infinity;
const TITLE_CONFLICT_STOP = 0.10;
let LOCK_TIMEOUT_S = 60;                                   // overridable only on a database whose name ends in _test (see below)
const MAX_EVIDENCE_BYTES = 64 * 1024;
const file = process.argv.slice(2).find(a => !a.startsWith('--'));

const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();   // same as scripts/dept-mlt-rules.ts, Unicode-safe
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const cleanString = (s) => s.replace(CTRL, '').replace(LONE_SURROGATE, '�');
function sanitize(value, path = '', changed = []) {
  if (typeof value === 'string') { const c = cleanString(value); if (c !== value) changed.push(path || '/'); return c; }
  if (Array.isArray(value)) return value.map((v, i) => sanitize(v, `${path}[${i}]`, changed));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [cleanString(k), sanitize(v, `${path}/${k}`, changed)]));
  if (typeof value === 'number' && !Number.isFinite(value)) { changed.push(path || '/'); return null; }
  return value;
}
function validIssn(v) {
  const s = String(v ?? '').toUpperCase(); if (!/^\d{4}-\d{3}[\dX]$/.test(s)) return false;
  const d = s.replace('-', ''); let sum = 0; for (let i = 0; i < 7; i++) sum += Number(d[i]) * (8 - i);
  const c = (11 - (sum % 11)) % 11; return d[7] === (c === 10 ? 'X' : String(c));
}
function prepare(r) {
  const problems = [], changed = [], row = { ...r };
  for (const k of ['title', 'publisherName', 'country', 'homepage', 'domain', 'sourceId', 'basisSource']) if (typeof row[k] === 'string') { const c = cleanString(row[k]).trim(); if (c !== row[k].trim()) changed.push('/' + k); row[k] = c; }
  const originalEvidence = r.evidence ?? null;
  row.evidence = sanitize(originalEvidence, '/evidence', changed);
  row.subjects = Array.isArray(r.subjects) ? sanitize(r.subjects, '/subjects', changed) : [];
  if (!row.title) problems.push('empty title');
  if (!validIssn(row.issn)) problems.push('ISSN fails the format or check digit');
  if (row.eissn && !validIssn(row.eissn)) problems.push('e-ISSN fails the format or check digit');
  if (row.domain !== 'Medical Laboratory Technology') problems.push('department is not Medical Laboratory Technology');
  if (!row.publisherName) problems.push('no publisher');
  let size = 0; try { size = Buffer.byteLength(JSON.stringify(row.evidence ?? null)); } catch { problems.push('evidence is not serialisable'); }
  if (size > MAX_EVIDENCE_BYTES) problems.push(`evidence is ${size} bytes (limit ${MAX_EVIDENCE_BYTES})`);
  const sanitization = changed.length ? { paths: changed.slice(0, 20), changedCount: changed.length, originalEvidenceEscaped: JSON.stringify(originalEvidence), originalEvidenceSha256: crypto.createHash('sha256').update(Buffer.from(JSON.stringify(originalEvidence) ?? 'null', 'utf8')).digest('hex') } : null;
  return { row, problems, sanitization };
}

(async () => {
  const plan = typeof __PLAN__ !== 'undefined' ? __PLAN__ : JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!/^dept-mlt-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(plan.runId || '')) { console.error('runId must look like dept-mlt-<date>-<8 hex>'); process.exit(3); }
  const rawRows = (plan.rows || []).slice(0, MAX);
  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (arg('lock-timeout', '') && /_test$/.test(db)) LOCK_TIMEOUT_S = Math.max(1, parseInt(arg('lock-timeout', '60'), 10) || 60);
  const startedAt = new Date().toISOString();
  const out = { database: db, runId: plan.runId, source: plan.source, dry: DRY, startedAt, requested: rawRows.length, inserted: 0, skippedIdentifierHeld: 0, skippedTitleHeld: 0, skippedInBatchDuplicate: 0, rejected: [], failed: 0, firstError: null, batches: 0, attempts: 0,
    stopped: null, lockWaitMsMax: 0, skippedDetail: [], insertedIds: [] };
  const LABEL = { 'OpenAlex': 'OpenAlex', 'Crossref': 'Crossref' };
  const basisFor = (r) => { const src = r.basisSource || plan.source; return `${LABEL[src] || src} listing — OA unverified`; };

  const prepared = [];
  for (const r of rawRows) { const x = prepare(r); if (x.problems.length) out.rejected.push({ issn: r.issn || null, title: String(r.title || '').slice(0, 80), problems: x.problems }); else prepared.push(x); }

  for (let i = 0; i < prepared.length && !out.stopped; i += BATCH) {
    const slice = prepared.slice(i, i + BATCH);
    out.batches++;
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done && !out.stopped; attempt++) {
      out.attempts++;
      try {
        await p.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT_S}s'`);
          const t0 = Date.now();
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('${LOCK_SQL_KEY}'))`);
          const lockWaitMs = Date.now() - t0; out.lockWaitMsMax = Math.max(out.lockWaitMsMax, lockWaitMs);
          // ---- inside the lock: the LIVE re-check ------------------------------------------------------------------------------------------------------
          const live = await tx.$queryRawUnsafe('select issn, eissn, title from "Journal"');
          const heldIds = new Set(), heldTitles = new Set();
          for (const l of live) { if (l.issn) heldIds.add(String(l.issn).toUpperCase()); if (l.eissn) heldIds.add(String(l.eissn).toUpperCase()); heldTitles.add(norm(l.title)); }
          const todo = [], skipped = { identifierHeld: 0, titleHeld: 0, inBatchDuplicate: 0 }, detail = [], seenIds = new Set(), seenTitles = new Set();
          for (const x of slice) {
            const r = x.row, mine = [r.issn, r.eissn].filter(Boolean).map(s => String(s).toUpperCase()), t = norm(r.title);
            if (mine.some(k => heldIds.has(k))) { skipped.identifierHeld++; detail.push({ issn: r.issn, title: r.title, why: 'identifier held (either column)' }); continue; }
            if (heldTitles.has(t)) { skipped.titleHeld++; detail.push({ issn: r.issn, title: r.title, why: 'same normalized title held' }); continue; }
            if (mine.some(k => seenIds.has(k)) || seenTitles.has(t)) { skipped.inBatchDuplicate++; detail.push({ issn: r.issn, title: r.title, why: 'duplicate inside the batch' }); continue; }
            todo.push(x); mine.forEach(k => seenIds.add(k)); seenTitles.add(t);
          }
          out.skippedDetail.push(...detail);
          if (skipped.titleHeld / slice.length > TITLE_CONFLICT_STOP) { out.stopped = { code: 6, reason: `same-title conflicts are ${skipped.titleHeld} of ${slice.length} in this batch (> 10%)` }; out.skippedTitleHeld += skipped.titleHeld; out.skippedIdentifierHeld += skipped.identifierHeld; return; }
          if (DRY || !todo.length) { out.inserted += DRY ? todo.length : 0; out.skippedIdentifierHeld += skipped.identifierHeld; out.skippedTitleHeld += skipped.titleHeld; out.skippedInBatchDuplicate += skipped.inBatchDuplicate; done = true; process.stderr.write(`batch ${out.batches}${DRY ? ' (dry)' : ''}: +${todo.length} (identifier ${skipped.identifierHeld}, title ${skipped.titleHeld}, in-batch ${skipped.inBatchDuplicate}, lock wait ${lockWaitMs} ms)\n`); return; }
          // ---- write + audit, same transaction --------------------------------------------------------------------------------------------------------
          const created = todo.map(x => ({ id: crypto.randomUUID(), x }));
          const res = await tx.journal.createMany({
            skipDuplicates: true,
            data: created.map(({ id, x }) => { const r = x.row; return {
              id, title: r.title, issn: r.issn, eissn: r.eissn || null, publisherName: r.publisherName || null, country: r.country || null, homepage: r.homepage || null,
              domain: r.domain, subjects: r.subjects || [],
              openAccess: false, licence: null, licenceIsNC: null, rightsBasis: basisFor(r), rightsVerifiedAt: null, rightsVerifiedBy: null, status: 'MetadataOnly',
            }; }),
          });
          if (res.count !== created.length) { const e = new Error(`write-time conflict: ${created.length - res.count} of ${created.length} rows already existed`); e.code = 'CONFLICT'; throw e; }
          const inserted = created.map(({ id, x }) => ({ id, issn: x.row.issn, eissn: x.row.eissn || null, dept: x.row.domain, sourceId: x.row.sourceId || x.row.issn, evidence: x.row.evidence || null }));
          const sanitization = created.filter(({ x }) => x.sanitization).map(({ id, x }) => ({ id, issn: x.row.issn, ...x.sanitization }));
          await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-source-import', action: 'JOURNAL_SOURCE_IMPORT', meta: { runId: plan.runId, source: plan.source, batch: out.batches, attempt, at: new Date().toISOString(), status: 'MetadataOnly', openAccess: 'not verified', lock: { key: LOCK_SQL_KEY, waitMs: lockWaitMs }, inserted, skipped, rejected: out.rejected, sanitization } } });
          out.inserted += created.length; out.skippedIdentifierHeld += skipped.identifierHeld; out.skippedTitleHeld += skipped.titleHeld; out.skippedInBatchDuplicate += skipped.inBatchDuplicate;
          out.insertedIds.push(...created.map(c => c.id)); done = true;
          process.stderr.write(`batch ${out.batches}: +${created.length} in one transaction (identifier ${skipped.identifierHeld}, title ${skipped.titleHeld}, in-batch ${skipped.inBatchDuplicate}, lock wait ${lockWaitMs} ms, attempt ${attempt})\n`);
        }, { timeout: 150000, maxWait: 20000 });
      } catch (e) {
        const msg = String(e && e.message || e).slice(0, 300);
        out.firstError = out.firstError || msg;
        if (e && (e.code === 'P2010' || /lock timeout|55P03|canceling statement due to lock timeout/i.test(msg))) { out.stopped = { code: 7, reason: 'another session held the insert lock for more than a minute' }; break; }
        if (!(e && (e.code === 'CONFLICT' || e.code === 'P2002')) || attempt === 3) { out.failed += slice.length; out.stopped = out.stopped || { code: 5, reason: msg }; process.stderr.write(`batch ${out.batches} FAILED and rolled back: ${msg}\n`); break; }
        process.stderr.write(`batch ${out.batches}: conflict at write time, rolled back, re-checking (attempt ${attempt})\n`);
      }
    }
    if (!done) break;
  }
  out.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
  if (out.stopped) { process.stderr.write(`AUTO-STOP: ${out.stopped.reason}\n`); process.exit(out.stopped.code); }
})().catch(e => { console.error('APPLY FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
