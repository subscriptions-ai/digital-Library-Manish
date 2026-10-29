/**
 * Insert the NEW journals a plan marked ready (src/lib/ingestion/journalSourceImport.ts), in bounded batches. Plain Node + @prisma/client only, so it can run where the app
 * runs (it needs nothing the production image does not have).
 *
 *   node scripts/journal-source-apply.cjs plan.json [--batch=100] [--max=N] [--dry]
 *   (cat <(echo "var __PLAN__ = $(cat plan.json);") scripts/journal-source-apply.cjs) | node - --batch=100   (the plan travels in the script text: nothing is written to the machine it runs on)
 *
 * Every journal it creates is MetadataOnly, open access NOT verified (openAccess false, no licence, no non-commercial verdict, rights basis "<source> listing — OA unverified"),
 * never Accepted, with no articles. It only ever CREATES: no existing journal is updated or deleted, and nothing outside "Journal" and "IngestionAudit" is touched.
 *
 * Before each batch it re-checks the live table: any identifier already held in either column, or the same title, means the candidate is skipped and counted
 * (someone else wrote it since the plan). One audit entry per batch lists what was inserted and why.
 *
 * Safety (rewritten 2026-10-29 after an audit write failed on a NUL character while the journals were already in):
 *   · every row is VALIDATED before any write (ISSN format, non-empty title, serialisable evidence of bounded size); an invalid row is rejected, counted and listed, never written;
 *   · evidence is SANITISED (control characters and lone surrogates removed from every string; Postgres text/jsonb cannot hold NUL). Nothing is lost silently: the audit entry records
 *     which paths changed, and keeps the ORIGINAL evidence of each changed row as an escaped JSON string with its sha256;
 *   · a batch is ONE transaction: all its journals and its audit row commit together or not at all, so a failure can never leave inserted journals without an audit entry;
 *   · a conflict found at write time (someone inserted an identifier after the check) rolls the whole batch back and the batch is re-checked and retried (at most 3 attempts), so the
 *     result is always exact; an unrecoverable failure stops the run (non-zero exit) with nothing partial in the database;
 *   · re-running a plan is idempotent: journals already present are skipped, and a run that inserts nothing writes no audit row.
 * Test hooks (--simulate-audit-failure, --simulate-race, --simulate-race-always) work only on a database whose name ends in "_test".
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const DRY = process.argv.includes('--dry');
const SIM_AUDIT = process.argv.includes('--simulate-audit-failure'), SIM_RACE_ALWAYS = process.argv.includes('--simulate-race-always'), SIM_RACE = process.argv.includes('--simulate-race') || SIM_RACE_ALWAYS;
const BATCH = Math.min(100, Math.max(1, parseInt(arg('batch', '100'), 10) || 100));
const MAX = parseInt(arg('max', '0'), 10) || Infinity;
const file = process.argv.slice(2).find(a => !a.startsWith('--'));
const MAX_EVIDENCE_BYTES = 64 * 1024;

// ---- validation and sanitisation (pure) -----------------------------------------------------------------------------------------------------------------------------------
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;                         // tab, LF and CR are kept
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
/** -> { row (sanitised copy), problems[], sanitization|null } */
function prepare(r) {
  const problems = [], changed = [];
  const row = { ...r };
  for (const k of ['title', 'publisherName', 'country', 'homepage', 'domain', 'sourceId', 'basisSource']) if (typeof row[k] === 'string') { const c = cleanString(row[k]).trim(); if (c !== row[k].trim()) changed.push('/' + k); row[k] = c; }
  const originalEvidence = r.evidence ?? null;
  row.evidence = sanitize(originalEvidence, '/evidence', changed);
  row.subjects = Array.isArray(r.subjects) ? sanitize(r.subjects, '/subjects', changed) : [];
  if (!row.title) problems.push('empty title');
  if (!validIssn(row.issn)) problems.push('ISSN fails the format or check digit');
  if (row.eissn && !validIssn(row.eissn)) problems.push('e-ISSN fails the format or check digit');
  if (!row.domain) problems.push('no department');
  let size = 0; try { size = Buffer.byteLength(JSON.stringify(row.evidence ?? null)); } catch { problems.push('evidence is not serialisable'); }
  if (size > MAX_EVIDENCE_BYTES) problems.push(`evidence is ${size} bytes (limit ${MAX_EVIDENCE_BYTES})`);
  const sanitization = changed.length ? { paths: changed.slice(0, 20), changedCount: changed.length, originalEvidenceEscaped: JSON.stringify(originalEvidence), originalEvidenceSha256: crypto.createHash('sha256').update(Buffer.from(JSON.stringify(originalEvidence) ?? 'null', 'utf8')).digest('hex') } : null;
  return { row, problems, sanitization };
}

(async () => {
  const plan = typeof __PLAN__ !== 'undefined' ? __PLAN__ : JSON.parse(fs.readFileSync(file, 'utf8'));
  const rawRows = (plan.rows || []).slice(0, MAX);
  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if ((SIM_AUDIT || SIM_RACE) && !/_test$/.test(db)) { console.error('the simulation flags are only allowed on a database whose name ends in _test'); process.exit(4); }
  const startedAt = new Date().toISOString();
  const out = { database: db, runId: plan.runId, source: plan.source, dry: DRY, startedAt, requested: rawRows.length, inserted: 0, skippedIdentifierHeld: 0, skippedTitleHeld: 0, skippedRace: 0, rejected: [], sanitizedRows: 0, failed: 0, firstError: null, batches: 0, attempts: 0, insertedIds: [] };
  // The label names the source that listed the journal; a plan that merges several sources can carry it per row (row.basisSource), otherwise it is the plan's own source.
  const LABEL = { 'OpenAlex Sources': 'OpenAlex', 'OpenAlex': 'OpenAlex', 'ROAD': 'ROAD', 'NLM Catalog': 'NLM Catalog', 'CINAHL': 'CINAHL', 'SciELO': 'SciELO', 'J-STAGE': 'J-STAGE', 'KoreaMed': 'KoreaMed', 'Crossref Journals': 'Crossref', 'Crossref': 'Crossref' };
  const basisFor = (r) => { const src = r.basisSource || plan.source; return `${LABEL[src] || src} listing — OA unverified`; };   // an unknown source is named as itself, never mislabelled as another

  // validate and sanitise everything first: nothing is written if the plan itself is malformed in a way that cannot be attributed to single rows
  const prepared = [];
  for (const r of rawRows) { const x = prepare(r); if (x.problems.length) out.rejected.push({ issn: r.issn || null, title: String(r.title || '').slice(0, 80), problems: x.problems }); else { prepared.push(x); if (x.sanitization) out.sanitizedRows++; } }

  let raceInjected = false;
  for (let i = 0; i < prepared.length; i += BATCH) {
    const slice = prepared.slice(i, i + BATCH);
    out.batches++;
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      out.attempts++;
      // 1. live re-check (every attempt)
      const ids = [...new Set(slice.flatMap(x => [x.row.issn, x.row.eissn].filter(Boolean)))];
      const held = ids.length ? await p.journal.findMany({ where: { OR: [{ issn: { in: ids } }, { eissn: { in: ids } }] }, select: { issn: true, eissn: true } }) : [];
      const heldIds = new Set(held.flatMap(h => [h.issn, h.eissn].filter(Boolean)));
      const titles = [...new Set(slice.map(x => String(x.row.title).toLowerCase().trim()))];
      const heldTitles = new Set((await p.$queryRawUnsafe('select lower(btrim(title)) t from "Journal" where lower(btrim(title)) = any($1::text[])', titles)).map(r => r.t));
      const todo = [], skipped = { identifierHeld: 0, titleHeld: 0, race: 0 }, seenNow = new Set(), seenTitles = new Set();
      for (const x of slice) {
        const r = x.row, mine = [r.issn, r.eissn].filter(Boolean), t = String(r.title).toLowerCase().trim();
        if (mine.some(k => heldIds.has(k) || seenNow.has(k))) { skipped.identifierHeld++; continue; }
        if (heldTitles.has(t) || seenTitles.has(t)) { skipped.titleHeld++; continue; }
        todo.push(x); mine.forEach(k => seenNow.add(k)); seenTitles.add(t);
      }
      if (DRY) { out.inserted += todo.length; out.skippedIdentifierHeld += skipped.identifierHeld; out.skippedTitleHeld += skipped.titleHeld; done = true; process.stderr.write(`batch ${out.batches} (dry): +${todo.length} (held ${skipped.identifierHeld}, title ${skipped.titleHeld})\n`); break; }
      if (!todo.length) { out.skippedIdentifierHeld += skipped.identifierHeld; out.skippedTitleHeld += skipped.titleHeld; done = true; process.stderr.write(`batch ${out.batches}: nothing to insert (held ${skipped.identifierHeld}, title ${skipped.titleHeld})\n`); break; }
      // 2. one transaction: every journal of the batch AND its audit row, or nothing
      const created = todo.map(x => ({ id: crypto.randomUUID(), x }));
      try {
        if (SIM_RACE && (!raceInjected || SIM_RACE_ALWAYS)) { raceInjected = true; const v = created[created.length - 1].x.row; await p.journal.create({ data: { title: `race ${crypto.randomUUID()}`, issn: v.issn, domain: v.domain, status: 'MetadataOnly', openAccess: false } }); }
        await p.$transaction(async (tx) => {
          const res = await tx.journal.createMany({
            skipDuplicates: true,
            data: created.map(({ id, x }) => { const r = x.row; return {
              id, title: r.title, issn: r.issn, eissn: r.eissn || null, publisherName: r.publisherName || null, country: r.country || null, homepage: r.homepage || null,
              domain: r.domain, subjects: r.subjects || [],
              // Nothing is claimed that has not been checked.
              openAccess: false, licence: null, licenceIsNC: null, rightsBasis: basisFor(r), rightsVerifiedAt: null, rightsVerifiedBy: null, status: 'MetadataOnly',
            }; }),
          });
          if (res.count !== created.length) { const e = new Error(`write-time conflict: ${created.length - res.count} of ${created.length} rows already existed`); e.code = 'CONFLICT'; throw e; }
          if (SIM_AUDIT) throw new Error('simulated audit failure');
          const inserted = created.map(({ id, x }) => ({ id, issn: x.row.issn, eissn: x.row.eissn || null, dept: x.row.domain, sourceId: x.row.sourceId || x.row.issn, evidence: x.row.evidence || null }));
          const sanitization = created.filter(({ x }) => x.sanitization).map(({ id, x }) => ({ id, issn: x.row.issn, ...x.sanitization }));
          await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'journal-source-import', action: 'JOURNAL_SOURCE_IMPORT', meta: { runId: plan.runId, source: plan.source, batch: out.batches, attempt, at: new Date().toISOString(), status: 'MetadataOnly', openAccess: 'not verified', inserted, skipped, rejected: out.rejected, sanitization } } });
        }, { timeout: 60000, maxWait: 15000 });
        out.inserted += created.length; out.skippedIdentifierHeld += skipped.identifierHeld; out.skippedTitleHeld += skipped.titleHeld; out.skippedRace += attempt - 1;
        out.insertedIds.push(...created.map(c => c.id)); done = true;
        process.stderr.write(`batch ${out.batches}: +${created.length} in one transaction (held ${skipped.identifierHeld}, title ${skipped.titleHeld}, attempts ${attempt})\n`);
      } catch (e) {
        out.firstError = out.firstError || String(e && e.message || e).slice(0, 300);
        if (!(e && (e.code === 'CONFLICT' || e.code === 'P2002')) || attempt === 3) { out.failed += created.length; process.stderr.write(`batch ${out.batches} FAILED and rolled back: ${out.firstError}\n`); break; }
        process.stderr.write(`batch ${out.batches}: conflict at write time, rolled back, re-checking (attempt ${attempt})\n`);
      }
    }
    if (!done) break;                                             // a failed batch stops the run: nothing partial is in the database, later batches are not attempted
  }
  out.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
  if (out.failed) process.exit(5);
})().catch(e => { console.error('APPLY FAILED', String(e && e.message || e).slice(0, 400)); process.exit(1); });
