/**
 * Insert NEW Books from a frozen manifest, in bounded batches. Plain Node + @prisma/client, so it can run where the app runs.
 *
 *   (printf 'var __PLAN__ = %s;\n' "$(cat plan.json)"; cat scripts/book-source-apply.cjs) | node - --expect-db=postgres [--dry] [--batch=100] [--max=25]
 *
 * plan.rows[] are complete Book rows (the harvest's own output, already judged by the publication gate and frozen). This script decides nothing about
 * publication: it writes exactly the rows it is given, and only the ones that are still new.
 *
 *  - CREATE ONLY. It never updates or deletes a Book, Article, Journal or Content row.
 *  - Before EVERY batch it checks the live table again: DOI, ISBN (10 and 13 are one), the source's id, the fingerprint, and title + first author against
 *    every Book (all statuses) and every legacy Books row. A match skips that row and counts it, with the reason.
 *  - One transaction per batch writes the rows AND the audit entry that lists their ids, so a batch is either wholly there with its audit or not at all.
 *    A failure rolls that batch back and STOPS the run (exit 1); nothing further is written.
 *  - Row ids are derived from the run id and the book's fingerprint, so a retry re-derives the same ids and recognises its own earlier work instead of
 *    inserting twice (and a crash after commit loses nothing: the ids are also in the audit and are printed to stderr as each batch commits).
 *  - --expect-db=<name> is required to write and must match the connected database. --max bounds the number of rows attempted (a canary). --dry writes nothing.
 *  - Columns the live table does not have are dropped from the row, so an older production schema cannot make an insert fail.
 */
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DRY = process.argv.includes('--dry');
const BATCH = Math.min(100, Math.max(1, parseInt(arg('batch', '100'), 10) || 100));
const MAX = parseInt(arg('max', '0'), 10) || Infinity;
const EXPECT_DB = arg('expect-db', '');
const doiKey = (d) => d ? String(d).trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : null;
const squash = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const titleKey = (t) => squash(t).replace(/^(the|a|an) /, '').slice(0, 180);
const authorKey = (a) => { const first = String(a || '').split(/;|\band\b|\n/)[0].trim(); if (!first) return ''; const c = first.indexOf(','); return squash(c > 0 ? first.slice(0, c) : first.split(/\s+/).pop() || ''); };
const normEdition = (e) => squash(e);
// ISBN-10 and -13 are one identifier; only a valid check digit counts.
const isbnForms = (raw) => {
  const d = String(raw || '').replace(/isbn(-1[03])?:?/gi, '').replace(/[^0-9Xx]/g, '').toUpperCase();
  const c13 = (s) => /^\d{13}$/.test(s) && [...s].reduce((n, ch, i) => n + Number(ch) * (i % 2 ? 3 : 1), 0) % 10 === 0;
  const c10 = (s) => /^\d{9}[\dX]$/.test(s) && [...s].reduce((n, ch, i) => n + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0) % 11 === 0;
  const to13 = (s) => { const core = '978' + s.slice(0, 9); return core + ((10 - [...core].reduce((n, ch, i) => n + Number(ch) * (i % 2 ? 3 : 1), 0) % 10) % 10); };
  const to10 = (s) => { if (!s.startsWith('978')) return null; const core = s.slice(3, 12); const c = (11 - [...core].reduce((n, ch, i) => n + Number(ch) * (10 - i), 0) % 11) % 11; return core + (c === 10 ? 'X' : String(c)); };
  if (d.length === 13 && c13(d)) return [d, to10(d)].filter(Boolean);
  if (d.length === 10 && c10(d)) return [to13(d), d];
  return [];
};
const idFor = (runId, r) => {
  const h = crypto.createHash('sha1').update(`${runId}|${r.fingerprint || r.sourceRecordId || r.row.title}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

(async () => {
  const plan = __PLAN__;
  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (!DRY && (!EXPECT_DB || EXPECT_DB !== db)) { console.error(`REFUSED: connected to "${db}", --expect-db is "${EXPECT_DB}"`); process.exit(2); }
  const cols = new Set((await p.$queryRawUnsafe(`select column_name c from information_schema.columns where table_name = 'Book'`)).map(r => r.c));
  const out = {
    database: db, runId: plan.runId, dry: DRY, planRows: plan.rows.length, attempted: 0, inserted: 0, alreadyDone: 0,
    skipped: { doi: 0, isbn: 0, providerId: 0, fingerprint: 0, title: 0, inSet: 0 }, skippedDetail: [], failed: 0, firstError: null,
    batches: 0, committedBatches: [], insertedIds: [], byDepartment: {}, droppedColumns: [], stopped: null,
  };

  // What an earlier attempt of this same run already committed.
  const prior = await p.$queryRawUnsafe(`select meta from "IngestionAudit" where action = 'BOOK_SOURCE_IMPORT' and meta->>'runId' = $1`, plan.runId);
  const done = new Set(); for (const a of prior) for (const x of (a.meta && a.meta.inserted) || []) done.add(x.id);
  out.batches = prior.length;

  const pending = [];
  for (const r of plan.rows) { const id = idFor(plan.runId, r); if (done.has(id)) out.alreadyDone++; else pending.push({ r, id }); }
  const todo = pending.slice(0, MAX);
  const seen = new Set();

  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    // ── live collision check, repeated before every batch ───────────────────────────────────────────────────────────────────────
    const dois = [...new Set(slice.map(x => doiKey(x.r.doi)).filter(Boolean))];
    const isbns = [...new Set(slice.flatMap(x => isbnForms(x.r.isbn)))];
    const fps = [...new Set(slice.map(x => x.r.fingerprint).filter(Boolean))];
    const pids = [...new Set(slice.map(x => x.r.sourceRecordId).filter(Boolean))];
    const tkeys = [...new Set(slice.map(x => titleKey(x.r.row.title)).filter(Boolean))];
    const heldDoi = new Set(dois.length ? (await p.$queryRawUnsafe(`select lower(regexp_replace(trim(doi), '^https?://(dx\\.)?doi\\.org/', '', 'i')) k from "Book" where doi is not null and lower(regexp_replace(trim(doi), '^https?://(dx\\.)?doi\\.org/', '', 'i')) = any($1::text[])`, dois)).map(r => r.k) : []);
    const heldIsbn = new Set(isbns.length ? (await p.$queryRawUnsafe(`select upper(regexp_replace(isbn, '[^0-9Xx]', '', 'g')) k from "Book" where isbn is not null and upper(regexp_replace(isbn, '[^0-9Xx]', '', 'g')) = any($1::text[])`, isbns)).map(r => r.k) : []);
    const heldFp = new Set(fps.length ? (await p.$queryRawUnsafe(`select fingerprint k from "Book" where fingerprint = any($1::text[])`, fps)).map(r => r.k) : []);
    const heldPid = new Set(pids.length ? (await p.$queryRawUnsafe(`select source || '|' || "sourceRecordId" k from "Book" where "sourceRecordId" = any($1::text[])`, pids)).map(r => r.k) : []);
    // Title + author, against every Book (any status) and every legacy Books row. The SQL narrows by a cheap normalised title; the keys are then compared in code.
    const cand = tkeys.length ? await p.$queryRawUnsafe(
      `select 'book' k, title, authors, year, edition from "Book" where btrim(regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g')) = any($1::text[]) or btrim(regexp_replace(regexp_replace(lower(title), '^(the|a|an) ', ''), '[^a-z0-9]+', ' ', 'g')) = any($1::text[])
       union all select 'legacy', title, authors, null, null from "Content" where "contentType" = 'Books' and (btrim(regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g')) = any($1::text[]) or btrim(regexp_replace(regexp_replace(lower(title), '^(the|a|an) ', ''), '[^a-z0-9]+', ' ', 'g')) = any($1::text[]))`, tkeys) : [];
    const byTitle = new Map(); for (const c of cand) { const k = titleKey(c.title); const l = byTitle.get(k) || []; l.push(c); byTitle.set(k, l); }

    const keep = [];
    for (const x of slice) {
      const r = x.r, d = doiKey(r.doi), forms = isbnForms(r.isbn);
      const skip = (why, detail) => { out.skipped[why]++; out.skippedDetail.push({ title: r.row.title, source: r.source, sourceRecordId: r.sourceRecordId, why, detail }); };
      if (d && heldDoi.has(d)) { skip('doi'); continue; }
      if (forms.length && forms.some(f => heldIsbn.has(f))) { skip('isbn'); continue; }
      if (r.sourceRecordId && heldPid.has(`${r.source}|${r.sourceRecordId}`)) { skip('providerId'); continue; }
      if (r.fingerprint && heldFp.has(r.fingerprint)) { skip('fingerprint'); continue; }
      const tk = titleKey(r.row.title), ak = authorKey(r.row.authors), ed = normEdition(r.row.edition);
      const twin = (byTitle.get(tk) || []).find(c => {
        const ca = authorKey(c.authors); if (ak && ca && ak !== ca) return false;
        if (c.k === 'legacy') return true;
        const sameYear = c.year == null || r.row.year == null || c.year === r.row.year, sameEd = !ed || !normEdition(c.edition) || ed === normEdition(c.edition);
        return sameYear && sameEd;
      });
      if (twin) { skip('title', twin.k); continue; }
      const sk = [d && 'd' + d, ...forms.map(f => 'i' + f), r.fingerprint && 'f' + r.fingerprint].filter(Boolean);
      if (sk.some(k => seen.has(k))) { skip('inSet'); continue; }
      sk.forEach(k => seen.add(k));
      keep.push(x);
    }
    out.attempted += slice.length;
    if (!keep.length) continue;

    const data = keep.map(({ r, id }) => {
      const row = {}; for (const [k, v] of Object.entries(r.row)) { if (cols.has(k)) row[k] = v; else if (!out.droppedColumns.includes(k)) out.droppedColumns.push(k); }
      delete row.createdAt; delete row.updatedAt; delete row.publisherId;
      row.id = id;
      for (const f of ['originalDate', 'lastIngestedAt', 'rightsVerifiedAt']) if (row[f]) row[f] = new Date(row[f]);
      return row;
    });
    if (DRY) { out.inserted += data.length; for (const d of data) out.byDepartment[d.domain] = (out.byDepartment[d.domain] || 0) + 1; continue; }

    const batchNo = out.batches + 1;
    try {
      await p.$transaction(async (tx) => {
        const res = await tx.book.createMany({ data });
        if (res.count !== data.length) throw new Error(`batch ${batchNo}: created ${res.count} of ${data.length}`);
        if (process.env.BOOK_APPLY_TEST_FAIL_AUDIT_BATCH === String(batchNo)) throw new Error('test: audit write failed');
        await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'book-source-import', action: 'BOOK_SOURCE_IMPORT', meta: { runId: plan.runId, batch: batchNo, at: new Date().toISOString(), manifestSha256: plan.sha256 || null, inserted: data.map(d => ({ id: d.id, department: d.domain, source: d.source })) } } });
      }, { timeout: 120000, maxWait: 20000 });
    } catch (e) {
      out.failed += data.length; out.firstError = String((e && e.message) || e).slice(0, 300); out.stopped = `batch ${batchNo} rolled back; no further batch was attempted`;
      break;
    }
    out.batches = batchNo; out.inserted += data.length; out.committedBatches.push(batchNo);
    for (const d of data) { out.insertedIds.push(d.id); out.byDepartment[d.domain] = (out.byDepartment[d.domain] || 0) + 1; }
    // Exact ids, the moment the batch is durable (the caller keeps stderr).
    process.stderr.write(JSON.stringify({ committed: batchNo, count: data.length, ids: data.map(d => d.id) }) + '\n');
  }
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
  if (out.stopped) process.exit(1);
})().catch(e => { console.error('APPLY FAILED', String((e && e.message) || e).slice(0, 400)); process.exit(1); });
