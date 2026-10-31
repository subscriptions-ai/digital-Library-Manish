/**
 * Optometry & Ophthalmology: create-only ARTICLE writer, Option A (only articles whose OWN record states a commercial-OK Creative Commons licence).
 *
 *   scripts/prod-run.sh scripts/dept-optometry-ophthalmology-articles-apply.cjs <plan.json> --max=N [--batch=N] [--execute]
 * which runs, inside the STM app container:
 *   (printf 'var __PLAN__ = %s;\n' "$(cat plan.json)"; cat this-file) | node - --dry|--batch=100 --max=N
 *
 * Plan: { runId, department, source, journals: [{ journalId, issn, eissn, status }], rows: [ { doi, title, authors, year, volume, issue, journalId, licence, licenceUrl,
 *         licenceUrlSource, licenceContentVersion, licenceStart, licenceDelayDays, licenceSource, source, sourceRecordId } ] }. The plan is built and frozen beforehand (scripts/dept-optometry-ophthalmology-articles-plan.py);
 * this script fetches nothing and trusts nothing in it: every row is judged again here.
 *
 * What is written, and what is not:
 *   - only for journals the plan lists, and only while the journal in the database is still that journal (same ISSN and e-ISSN, department Optometry & Ophthalmology, same status);
 *   - only where the record's licence is one the existing rule serves (CC BY, BY-SA, BY-ND, CC0, public domain; anything NC, unclear or missing is rejected, not stored),
 *     stated with its URL, and with a Crossref licence entry that is IN FORCE as the evidence: no embargo (delay-in-days 0), started (start not after today),
 *     content-version vor or unspecified (an "am" accepted manuscript or a "tdm" text-mining licence is not the article's licence);
 *   - only from the year policy's floor (2020) up to next year; a title; a DOI of the usual shape;
 *   - title, authors, DOI, journal, year, licence (as the source states it), the licence URL (in metadata), source. NO abstract, NO file: accessStatus LinkOnly (the DOI link), pdfUrl null.
 *   - accessType follows each article's own licence (accessTypeFor), never a blanket value.
 *   - status Published exactly where the existing judge (src/lib/ingestion/eligibility.ts judgeArticle) says ADD/Published for that record; this file re-states that rule and
 *     scripts/test-dept-optometry-articles-apply.ts checks the two agree.
 *   - it CREATES articles and one IngestionAudit row per batch. It updates nothing and deletes nothing; no Journal, Publisher or Author row is touched.
 *
 * Per batch, ONE transaction:
 *   1. SET LOCAL lock_timeout = 60s, then the three shared department locks in the coordinator's order (2026103001, stm.journal.insert, dept-radiology-book-insert);
 *   2. INSIDE the locks, read the live tables: the journals of the batch and every article already holding one of the batch's DOIs (fingerprint doi:<doi> or the doi column, any case);
 *      held rows, rows of a changed journal and in-batch duplicates are skipped and counted;
 *   3. AUTO-STOP before writing when more than 10% of the batch is already held (exit 6) or the locks could not be had within a minute (exit 7);
 *   4. createMany, then verify before commit (count, no duplicate DOI, every row Published/LinkOnly/no file/no abstract/right department): a failed check rolls the batch back (exit 8);
 *   5. the IngestionAudit row (ARTICLE_BACKFILL_IMPORT, with every inserted id) in the same transaction.
 * A stopped run reports and does not retry past the stop. Exit codes: 0 ok, 3 bad plan or arguments, 5 write failed, 6 held > 10%, 7 lock wait, 8 verification failed.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

const DEPARTMENT = 'Optometry & Ophthalmology';
const RUN_RE = /^dept-optometry-ophthalmology-articles-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/;
const YEAR_FLOOR = 2020;                  // yearPolicy.ts ARTICLE_MIN_YEAR_DEFAULT; the live IngestionState value is honoured only upwards
const HELD_STOP = 0.10;
const AUDIT_ACTION = 'ARTICLE_BACKFILL_IMPORT';
const SOURCES = new Set(['Crossref', 'EuropePMC']);

// ── the rules, as pure functions (exported for the tests) ───────────────────────────────────────────────────────────────────────────────────────
/** eligibility.ts COMMERCIAL_OK + licenceAllowsCommercialUse: CC BY, BY-SA, BY-ND, CC0, public domain; anything NC, empty or unknown is not served. */
const COMMERCIAL_OK = /^(cc[\s-]?by([\s-]?(sa|nd))?|cc0|public[\s-]?domain)$/i;
function licenceOk(raw) {
  const t = String(raw || '').trim();
  if (!t) return false;
  if (/nc/i.test(t.replace(/[^a-z]/gi, ''))) return false;
  return COMMERCIAL_OK.test(t.replace(/\s+/g, ' '));
}
/** articleSources.ts ccFromUrl: "https://creativecommons.org/licenses/by-nc/4.0/" -> "cc-by-nc"; anything that is not a Creative Commons licence -> null. */
function ccFromUrl(url) {
  const u = String(url || '');
  const m = /creativecommons\.org\/licenses\/(by(?:-(?:nc|nd|sa))*)(?:\/|$)/i.exec(u);
  if (m) return `cc-${m[1].toLowerCase()}`;
  if (/creativecommons\.org\/publicdomain\/zero/i.test(u)) return 'cc0';
  if (/creativecommons\.org\/publicdomain\/mark/i.test(u)) return 'public domain';
  return null;
}
/** One spelling to compare a licence string with a URL's: 'cc by' and 'cc-by' are the same licence; 'public domain' and 'public-domain' too. */
const licenceToken = (raw) => {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^cc[ -]by/.test(t)) return t.replace(/ /g, '-');
  if (/^public[ -]domain$/.test(t)) return 'public domain';
  return t;
};
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoToday = () => new Date().toISOString().slice(0, 10);
/** dedup.ts normaliseDoi. */
const normaliseDoi = (raw) => { const t = String(raw || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim().toLowerCase(); return t || null; };
const DOI_SHAPE = /^10\.\d{4,9}\/\S+$/i;
/** From the article's own licence, never a constant: a licence that lets us serve it is open access; anything else would be Subscription (and is not written by this script at all). */
const accessTypeFor = (licence) => (licenceOk(licence) ? 'OpenAccess' : 'Subscription');

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const clean = (s) => (s == null ? null : String(s).replace(CTRL, '').replace(LONE_SURROGATE, '�').replace(/\s+/g, ' ').trim() || null);

/** One plan row -> { row } (cleaned) or { reason }. The checks that need the database (journal still the same, DOI not held) are made inside the lock. */
function judgeRow(r, planJournals, minYear, thisYear, today = isoToday()) {
  if (!r || typeof r !== 'object') return { reason: 'not an object' };
  if (!planJournals.has(r.journalId)) return { reason: 'journal not in the plan' };
  if (!SOURCES.has(r.source)) return { reason: `source "${r.source}" is not Crossref or EuropePMC` };
  const doi = normaliseDoi(r.doi);
  if (!doi || !DOI_SHAPE.test(doi)) return { reason: 'no DOI of the usual shape' };
  const title = clean(r.title);
  if (!title || /^untitled$/i.test(title)) return { reason: 'no usable title' };
  const year = Number.isInteger(r.year) ? r.year : null;
  if (year == null) return { reason: 'no year' };
  if (year < minYear) return { reason: `year ${year} is before the article policy year ${minYear}` };
  if (year > thisYear + 1) return { reason: `implausible year ${year}` };
  const licence = clean(r.licence);
  if (!licenceOk(licence)) return { reason: `licence "${licence ?? ''}" is not a commercial-OK Creative Commons licence` };
  const licenceUrl = clean(r.licenceUrl);
  // Every row carries its licence URL, and the URL must say what the licence field says.
  if (!licenceUrl) return { reason: 'no licence URL (an Europe PMC licence string alone is held for wave 2)' };
  if (ccFromUrl(licenceUrl) !== licenceToken(licence)) return { reason: `licence "${licence}" does not match its URL ${licenceUrl}` };
  // The URL always comes from a Crossref licence entry (for a Crossref row, its own): that entry must be in force.
  const licenceUrlSource = r.source === 'Crossref' ? 'Crossref' : clean(r.licenceUrlSource);
  if (licenceUrlSource !== 'Crossref') return { reason: 'the licence URL does not come from a Crossref licence entry' };
  const version = clean(r.licenceContentVersion), start = clean(r.licenceStart);
  if (version !== 'vor' && version !== 'unspecified') return { reason: `licence entry content-version "${version ?? ''}" is not vor or unspecified` };
  if (r.licenceDelayDays !== 0) return { reason: 'licence entry is embargoed or its delay is not stated (delay-in-days must be 0)' };
  if (!start || !ISO_DAY.test(start)) return { reason: 'licence entry has no readable start date' };
  if (start > today) return { reason: `licence entry starts ${start}, after today` };
  return { row: { doi, title, authors: clean(r.authors), year, volume: clean(r.volume), issue: clean(r.issue), journalId: r.journalId, licence, licenceUrl,
    licenceUrlSource, licenceContentVersion: version, licenceStart: start, licenceSource: r.licenceSource === 'EuropePMC' ? 'EuropePMC' : r.source, source: r.source, sourceRecordId: clean(r.sourceRecordId) || `${r.source.toLowerCase()}:${doi}` } };
}

module.exports = { licenceOk, licenceToken, ccFromUrl, normaliseDoi, accessTypeFor, judgeRow, DEPARTMENT, RUN_RE };
// Run only with a plan: __PLAN__ (the wrapper's preamble) or a plan file argument. Required by a test, it just exposes the helpers above.
const RUN_MAIN = typeof __PLAN__ !== 'undefined' || process.argv.slice(2).some((a) => !a.startsWith('--'));

const { PrismaClient } = require('@prisma/client');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DRY = process.argv.includes('--dry');
const BATCH = Math.min(100, Math.max(1, parseInt(arg('batch', '100'), 10) || 100));
const MAX = parseInt(arg('max', '0'), 10);
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
let LOCK_TIMEOUT_S = 60;                    // overridable only on a database whose name ends in _test

if (RUN_MAIN) (async () => {
  const fail = (code, msg) => { console.error(msg); process.exit(code); };
  if (!Number.isInteger(MAX) || MAX < 1) fail(3, '--max=N is required');
  const plan = typeof __PLAN__ !== 'undefined' ? __PLAN__ : JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!RUN_RE.test(plan.runId || '')) fail(3, 'runId must look like dept-optometry-ophthalmology-articles-<date>-<8 hex>');
  if (plan.department !== DEPARTMENT) fail(3, `plan department must be ${DEPARTMENT}`);
  if (!Array.isArray(plan.journals) || !Array.isArray(plan.rows)) fail(3, 'plan needs journals[] and rows[]');
  const planJournals = new Map();
  for (const j of plan.journals) {
    if (!j.journalId || !j.issn) fail(3, 'every plan journal needs journalId and issn');
    planJournals.set(j.journalId, { issn: j.issn, eissn: j.eissn || null, status: j.status || 'MetadataOnly' });
  }

  const p = new PrismaClient();
  const db = (await p.$queryRawUnsafe('select current_database() d'))[0].d;
  if (arg('lock-timeout', '') && /_test$/.test(db)) LOCK_TIMEOUT_S = Math.max(1, parseInt(arg('lock-timeout', '60'), 10) || 60);
  const liveMin = (await p.$queryRawUnsafe(`select "articleMinYear" y from "IngestionState" where id = 'singleton'`).catch(() => []))[0]?.y;
  const minYear = Math.max(YEAR_FLOOR, Number.isInteger(liveMin) ? liveMin : YEAR_FLOOR);
  const thisYear = new Date().getFullYear();
  const deptCount = async () => Number((await p.$queryRawUnsafe(`select count(*)::int n from "Article" where domain = $1 and status = 'Published'`, DEPARTMENT))[0].n);
  const startedAt = new Date().toISOString();
  const rawRows = plan.rows.slice(0, MAX);
  const out = { database: db, runId: plan.runId, dry: DRY, startedAt, minYear, requested: rawRows.length, departmentPublishedBefore: await deptCount(), departmentPublishedAfter: null,
    inserted: 0, skippedHeld: 0, skippedJournalChanged: 0, skippedInBatchDuplicate: 0, rejected: 0, rejectedByReason: {}, failed: 0, firstError: null, batches: 0, attempts: 0, stopped: null,
    lockWaitMsMax: 0, licenceMix: {}, bySource: {}, byJournal: {}, sample20: [], insertedIds: [] };
  const wouldCreate = [];   // everything this run created (or, dry, would create), for the sample

  const prepared = [];
  for (const r of rawRows) {
    const j = judgeRow(r, planJournals, minYear, thisYear);
    if (j.row) prepared.push(j.row);
    else { out.rejected++; const k = j.reason.replace(/"[^"]*"/g, '"…"').replace(/\d{4}/g, 'YYYY'); out.rejectedByReason[k] = (out.rejectedByReason[k] || 0) + 1; }
  }

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
          // The coordinator's shared write protocol, in its order. Taken inside the transaction, so they are released at commit or rollback.
          await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(2026103001::bigint)`);
          await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('stm.journal.insert'))`);
          await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext('dept-radiology-book-insert'))`);
          const lockWaitMs = Date.now() - t0; out.lockWaitMsMax = Math.max(out.lockWaitMsMax, lockWaitMs);
          // ---- inside the locks: the LIVE re-check -----------------------------------------------------------------------------------------------
          const jids = [...new Set(slice.map((x) => x.journalId))];
          const live = new Map((await tx.$queryRawUnsafe(`select id, title, issn, eissn, domain, status, "publisherId", "publisherName" from "Journal" where id = any($1::text[])`, jids)).map((j) => [j.id, j]));
          const dois = slice.map((x) => x.doi);
          const heldRows = await tx.$queryRawUnsafe(`select lower(doi) d, fingerprint f from "Article" where fingerprint = any($1::text[]) or lower(doi) = any($2::text[])`, dois.map((d) => `doi:${d}`), dois);
          const held = new Set(heldRows.flatMap((h) => [h.d, h.f && h.f.startsWith('doi:') ? h.f.slice(4) : null]).filter(Boolean));
          const todo = [], skipped = { held: 0, journalChanged: 0, inBatch: 0 }, seen = new Set();
          for (const x of slice) {
            const pj = planJournals.get(x.journalId), lj = live.get(x.journalId);
            if (!lj || lj.domain !== DEPARTMENT || lj.issn !== pj.issn || (lj.eissn || null) !== pj.eissn || lj.status !== pj.status) { skipped.journalChanged++; continue; }
            if (held.has(x.doi)) { skipped.held++; continue; }
            if (seen.has(x.doi)) { skipped.inBatch++; continue; }
            seen.add(x.doi); todo.push({ x, lj });
          }
          if (skipped.held / slice.length > HELD_STOP) {
            out.stopped = { code: 6, reason: `already-held DOIs are ${skipped.held} of ${slice.length} in this batch (> 10%)` };
            out.skippedHeld += skipped.held; out.skippedJournalChanged += skipped.journalChanged; out.skippedInBatchDuplicate += skipped.inBatch; return;
          }
          const tally = () => {
            for (const { x, lj } of todo) {
              out.licenceMix[x.licence.toLowerCase()] = (out.licenceMix[x.licence.toLowerCase()] || 0) + 1;
              out.bySource[x.source] = (out.bySource[x.source] || 0) + 1;
              out.byJournal[lj.title] = (out.byJournal[lj.title] || 0) + 1;
              wouldCreate.push({ title: x.title.slice(0, 100), journal: lj.title, doi: x.doi, year: x.year, licence: x.licence, licenceUrl: x.licenceUrl, source: x.source });
            }
            out.skippedHeld += skipped.held; out.skippedJournalChanged += skipped.journalChanged; out.skippedInBatchDuplicate += skipped.inBatch;
          };
          if (DRY || !todo.length) { out.inserted += DRY ? todo.length : 0; tally(); done = true; process.stderr.write(`batch ${out.batches}${DRY ? ' (dry)' : ''}: +${todo.length} (held ${skipped.held}, journal changed ${skipped.journalChanged}, in-batch ${skipped.inBatch}, lock wait ${lockWaitMs} ms)\n`); return; }
          // ---- write + verify + audit, same transaction -------------------------------------------------------------------------------------------
          const created = todo.map(({ x, lj }) => ({ id: crypto.randomUUID(), x, lj }));
          const res = await tx.article.createMany({
            skipDuplicates: true,
            data: created.map(({ id, x, lj }) => ({
              id, title: x.title, authors: x.authors, doi: x.doi, pdfUrl: null,
              journalId: lj.id, journalName: lj.title, journalIssn: lj.issn, publisherId: lj.publisherId || null, publisherName: lj.publisherName || null,
              volume: x.volume, issue: x.issue, year: x.year, domain: lj.domain,
              accessType: accessTypeFor(x.licence), accessStatus: 'LinkOnly', licence: x.licence, licenceIsNC: false,
              originalUrl: `https://doi.org/${x.doi}`, parentKind: 'Journal', parentId: lj.id,
              metadata: { licenceUrl: x.licenceUrl, licenceUrlSource: x.licenceUrlSource, licenceSource: x.licenceSource, licenceContentVersion: x.licenceContentVersion, licenceStart: x.licenceStart, backfillRunId: plan.runId },
              status: 'Published', source: x.source, sourceRecordId: x.sourceRecordId, fingerprint: `doi:${x.doi}`, ownershipSource: 'Ingested', createdBy: `ArticleBackfill:${plan.runId}`,
            })),
          });
          if (res.count !== created.length) { const e = new Error(`write-time conflict: ${created.length - res.count} of ${created.length} rows already existed`); e.code = 'CONFLICT'; throw e; }
          const ids = created.map((c) => c.id);
          const n = Number((await tx.$queryRawUnsafe(`select count(*)::int n from "Article" where id = any($1::text[])`, ids))[0].n);
          const dup = await tx.$queryRawUnsafe(`select lower(doi) d, count(*)::int n from "Article" where lower(doi) = any($1::text[]) group by 1 having count(*) > 1`, created.map((c) => c.x.doi));
          const bad = Number((await tx.$queryRawUnsafe(`select count(*)::int n from "Article" where id = any($1::text[]) and (status <> 'Published' or "accessStatus" <> 'LinkOnly' or "pdfUrl" is not null or abstract is not null or domain <> $2 or "journalId" is null or "licenceIsNC" is not false)`, ids, DEPARTMENT))[0].n);
          if (n !== created.length || dup.length || bad) { const e = new Error(`verification failed: ${n}/${created.length} present, ${dup.length} duplicate DOI, ${bad} row(s) off the promised shape`); e.code = 'VERIFY'; throw e; }
          await tx.ingestionAudit.create({ data: { adminId: null, adminEmail: 'article-backfill-import', action: AUDIT_ACTION, meta: {
            runId: plan.runId, source: plan.source || 'Crossref+EuropePMC', department: DEPARTMENT, batch: out.batches, attempt, at: new Date().toISOString(), status: 'Published', access: 'LinkOnly',
            lock: { order: ['2026103001', 'stm.journal.insert', 'dept-radiology-book-insert'], waitMs: lockWaitMs },
            skipped: skipped, inserted: created.map((c) => ({ id: c.id, doi: c.x.doi, journalId: c.lj.id })) } } });
          out.inserted += created.length; out.insertedIds.push(...ids); tally(); done = true;
          process.stderr.write(`batch ${out.batches}: +${created.length} in one transaction (held ${skipped.held}, journal changed ${skipped.journalChanged}, in-batch ${skipped.inBatch}, lock wait ${lockWaitMs} ms, attempt ${attempt})\n`);
        }, { timeout: 150000, maxWait: 20000 });
        if (out.stopped && !done) break;
      } catch (e) {
        const msg = String((e && e.message) || e).slice(0, 300);
        out.firstError = out.firstError || msg;
        if (e && (e.code === 'P2010' || /lock timeout|55P03|canceling statement due to lock timeout/i.test(msg))) { out.stopped = { code: 7, reason: 'another session held the insert locks for more than a minute' }; break; }
        if (e && e.code === 'VERIFY') { out.stopped = { code: 8, reason: msg }; out.failed += slice.length; process.stderr.write(`batch ${out.batches} rolled back: ${msg}\n`); break; }
        if (!(e && (e.code === 'CONFLICT' || e.code === 'P2002')) || attempt === 3) { out.failed += slice.length; out.stopped = out.stopped || { code: 5, reason: msg }; process.stderr.write(`batch ${out.batches} FAILED and rolled back: ${msg}\n`); break; }
        process.stderr.write(`batch ${out.batches}: conflict at write time, rolled back, re-checking (attempt ${attempt})\n`);
      }
    }
    if (!done) break;
  }

  out.departmentPublishedAfter = await deptCount();
  const step = Math.max(1, Math.floor(wouldCreate.length / 20));
  out.sample20 = wouldCreate.filter((_, k) => k % step === 0).slice(0, 20);
  out.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
  process.exitCode = out.stopped ? out.stopped.code : 0;   // not process.exit(): a pipe may still be draining the JSON
})().catch((e) => { console.error('FAILED', String((e && e.message) || e).slice(0, 400)); process.exit(5); });
