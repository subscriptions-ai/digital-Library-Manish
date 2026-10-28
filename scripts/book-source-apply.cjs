/**
 * Insert NEW Books that the real book harvest produced and a reviewer's gate passed, in bounded batches. Plain Node + @prisma/client, so it can run where the app runs.
 *
 *   (cat <(echo "var __PLAN__ = $(cat plan.json);") scripts/book-source-apply.cjs) | node - [--dry] [--batch=100] [--max=N]
 *
 * plan.rows[] are complete Book rows (the harvest's own output: title, identifiers, department, licence, rights, access, metadata). Every row it writes is `Published` only if the plan says so, was
 * judged by the same publication rules as an Approve (licence verified, year policy, no file address, not viewable-here), and is NEW to the live table.
 *
 * It only ever CREATES. Before each insert it re-checks the live table for the same DOI, ISBN, provider id or fingerprint; a match means the book is skipped and counted (the engine may have written it since).
 * Columns the live table does not have are dropped from the row, so an older production schema cannot make an insert fail. One audit entry per batch lists the ids inserted (for rollback).
 * It touches no existing Book, Article, Journal or Content row, and deletes nothing.
 */
const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const DRY = process.argv.includes('--dry'); const BATCH = Math.min(100, parseInt(arg('batch', '100'), 10) || 100); const MAX = parseInt(arg('max', '0'), 10) || Infinity;
const doiKey = (d) => d ? String(d).trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : null;
const isbnKey = (s) => s ? String(s).replace(/[^0-9Xx]/g, '').toUpperCase() : null;
(async () => {
  const plan = __PLAN__; const rows = plan.rows.slice(0, MAX); const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  const cols = new Set((await p.$queryRawUnsafe(`select column_name c from information_schema.columns where table_name = 'Book'`)).map(r => r.c));
  const out = { database: db, runId: plan.runId, dry: DRY, requested: rows.length, inserted: 0, skipped: { doi: 0, isbn: 0, providerId: 0, fingerprint: 0, race: 0 }, failed: 0, firstError: null, batches: 0, insertedIds: [], byDepartment: {}, droppedColumns: [] };
  const seen = new Set();
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH); const made = [];
    const dois = [...new Set(batch.map(r => doiKey(r.doi)).filter(Boolean))], isbns = [...new Set(batch.map(r => isbnKey(r.isbn)).filter(Boolean))], fps = [...new Set(batch.map(r => r.fingerprint).filter(Boolean))], pids = [...new Set(batch.map(r => r.sourceRecordId).filter(Boolean))];
    const heldDoi = new Set(dois.length ? (await p.$queryRawUnsafe(`select lower(regexp_replace(trim(doi), '^https?://(dx\\.)?doi\\.org/', '', 'i')) k from "Book" where doi is not null and lower(regexp_replace(trim(doi), '^https?://(dx\\.)?doi\\.org/', '', 'i')) = any($1::text[])`, dois)).map(r => r.k) : []);
    const heldIsbn = new Set(isbns.length ? (await p.$queryRawUnsafe(`select upper(regexp_replace(isbn, '[^0-9Xx]', '', 'g')) k from "Book" where isbn is not null and upper(regexp_replace(isbn, '[^0-9Xx]', '', 'g')) = any($1::text[])`, isbns)).map(r => r.k) : []);
    const heldFp = new Set(fps.length ? (await p.$queryRawUnsafe(`select fingerprint k from "Book" where fingerprint = any($1::text[])`, fps)).map(r => r.k) : []);
    const heldPid = new Set(pids.length ? (await p.$queryRawUnsafe(`select source || '|' || "sourceRecordId" k from "Book" where "sourceRecordId" = any($1::text[])`, pids)).map(r => r.k) : []);
    for (const r of batch) {
      const d = doiKey(r.doi), s = isbnKey(r.isbn);
      if ((d && (heldDoi.has(d) || seen.has('d' + d)))) { out.skipped.doi++; continue; }
      if ((s && (heldIsbn.has(s) || seen.has('i' + s)))) { out.skipped.isbn++; continue; }
      if (r.sourceRecordId && heldPid.has(`${r.source}|${r.sourceRecordId}`)) { out.skipped.providerId++; continue; }
      if (r.fingerprint && (heldFp.has(r.fingerprint) || seen.has('f' + r.fingerprint))) { out.skipped.fingerprint++; continue; }
      const data = {}; for (const [k, v] of Object.entries(r.row)) { if (cols.has(k)) data[k] = v; else if (!out.droppedColumns.includes(k)) out.droppedColumns.push(k); }
      delete data.id; delete data.createdAt; delete data.updatedAt; delete data.publisherId;
      if (data.originalDate) data.originalDate = new Date(data.originalDate); if (data.lastIngestedAt) data.lastIngestedAt = new Date(data.lastIngestedAt); if (data.rightsVerifiedAt) data.rightsVerifiedAt = new Date(data.rightsVerifiedAt);
      if (DRY) { out.inserted++; out.byDepartment[data.domain] = (out.byDepartment[data.domain] || 0) + 1; if (d) seen.add('d' + d); if (s) seen.add('i' + s); if (r.fingerprint) seen.add('f' + r.fingerprint); continue; }
      try {
        const b = await p.book.create({ data, select: { id: true } });
        out.inserted++; out.insertedIds.push(b.id); out.byDepartment[data.domain] = (out.byDepartment[data.domain] || 0) + 1; made.push({ id: b.id, department: data.domain, source: data.source });
        if (d) seen.add('d' + d); if (s) seen.add('i' + s); if (r.fingerprint) seen.add('f' + r.fingerprint);
      } catch (e) { if (e && e.code === 'P2002') out.skipped.race++; else { out.failed++; out.firstError = out.firstError || String(e && e.message || e).slice(0, 300); } }
    }
    out.batches++;
    if (!DRY && made.length) await p.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: 'BOOK_SOURCE_IMPORT', meta: { runId: plan.runId, batch: out.batches, at: new Date().toISOString(), inserted: made } } }).catch(e => { out.firstError = out.firstError || 'audit: ' + String(e && e.message || e).slice(0, 200); });
    process.stderr.write(`batch ${out.batches}: +${made.length || (DRY ? 'dry' : 0)}\n`);
  }
  process.stdout.write(JSON.stringify(out)); await p.$disconnect();
})().catch(e => { console.error('APPLY FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
