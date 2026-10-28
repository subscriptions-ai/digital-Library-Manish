#!/usr/bin/env node
/**
 * READ-ONLY DOAJ coverage report: what the official DOAJ journal CSV would mean for the journals this database already holds.
 *
 *   node scripts/doaj-coverage-report.cjs                    # downloads DOAJ's CSV (one request), reads DATABASE_URL
 *   node scripts/doaj-coverage-report.cjs --csv <file>       # uses a CSV already on disk (no network at all)
 *   node scripts/doaj-coverage-report.cjs --json <file>      # also writes the numbers as JSON to a file you name (a file on THIS machine, never the database)
 *
 * It writes NOTHING to the database. Every query runs inside one READ ONLY transaction, so Postgres itself would refuse a write.
 * It does not import anything, create a preview row, move a checkpoint or touch a catalogue table. It prints the database it
 * measured (host, port, name — never the password) so a figure cannot be mistaken for another database's.
 *
 * It answers what the admin "Check First" cannot: besides held / new / same-title / Accepted vs MetadataOnly / no department, it counts, for the
 * journals already held, which are protected, which fields a fill-empty enrichment from DOAJ would complete, and how many would materially improve.
 * The classification of every CSV row is the app's own (doajRowToJournal and departmentForDoajRow), so its "new" count equals the Check's.
 */
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DOAJ_CSV_URL = 'https://doaj.org/csv';

const issnOf = (raw) => { if (!raw) return null; const t = String(raw).replace(/[‐-―]/g, '-').replace(/\s+/g, '').toUpperCase(); const m = t.match(/^(\d{4})-?(\d{3}[\dX])$/); return m ? `${m[1]}-${m[2]}` : null; };
/** "CC BY 4.0", "cc-by" -> "ccby"; the version is not part of the family (the same rule the duplicate judge uses). */
const family = (l) => { const t = String(l ?? '').toLowerCase().trim(); if (!t) return null; return t.replace(/https?:\/\/creativecommons\.org\/(licenses|publicdomain)\//, 'cc-').replace(/\b\d+(\.\d+)*\b/g, '').replace(/[^a-z]/g, '') || null; };
const blank = (v) => v == null || String(v).trim() === '';
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');
const n0 = (n) => Number(n).toLocaleString('en-US');

(async () => {
  if (!process.env.DATABASE_URL) { try { require('dotenv').config({ quiet: true }); } catch { /* none */ } }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(2); }
  try { require('tsx/cjs'); } catch { /* falls through to the error below */ }
  let D; try { D = require('../src/lib/doajCatalogue.ts'); } catch (e) { console.error('Could not load the app\'s DOAJ rules (src/lib/doajCatalogue.ts through tsx):', e.message); process.exit(2); }
  const Papa = require('papaparse');

  const u = new URL(process.env.DATABASE_URL);
  console.log(`Database: ${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}  (read-only)`);

  // ── the file ─────────────────────────────────────────────────────────────
  let text, source;
  if (opt('--csv')) { text = fs.readFileSync(opt('--csv'), 'utf8'); source = opt('--csv'); }
  else {
    const r = await fetch(DOAJ_CSV_URL, { headers: { 'User-Agent': 'STM Digital Library coverage report (mailto:info@celnet.in)' }, redirect: 'follow' });
    if (!r.ok) { console.error(`DOAJ answered HTTP ${r.status} for the journal list`); process.exit(2); }
    text = await r.text(); source = (r.url || DOAJ_CSV_URL).split('?')[0];
  }
  const rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
  console.log(`CSV: ${source.split('/').pop()}  (${n0(rows.length)} rows, ${(text.length / 1048576).toFixed(1)} MB)\n`);

  // ── what is held, read once inside a READ ONLY transaction ─────────────────
  const p = new PrismaClient();
  let held;
  await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    held = await tx.$queryRawUnsafe(`select id, issn, eissn, title, "publisherName", country, homepage, language, domain, subjects::text as subjects, status, "rightsBasis", "rightsVerifiedBy", licence, "articleCount" from "Journal"`);
  }, { timeout: 120000 });
  await p.$disconnect();
  held = held.map((j) => ({ ...j, subjects: (() => { try { const v = JSON.parse(j.subjects || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })() }));

  const byIssn = new Map();                                    // every ISSN a held journal is known by -> that journal
  const heldTitles = new Set();
  for (const j of held) { for (const k of [j.issn, j.eissn]) if (k) byIssn.set(k, j); heldTitles.add(String(j.title || '').trim().toLowerCase()); }

  // ── protected: never added to, whatever DOAJ says ──────────────────────────
  const whyProtected = (j) => (j.rightsBasis === 'our own' ? 'our own' : j.status === 'Rejected' ? 'Rejected' : (j.rightsVerifiedBy && j.rightsVerifiedBy !== 'ingestion') ? 'rights decided by a person' : null);

  // ── classify every CSV row exactly as the admin Check does, then look deeper at what is held ─────────────────
  const S = { inFile: rows.length, unusable: 0, alreadyHeld: 0, new: 0, needsReviewTitle: 0, splitAcrossHeld: 0 };
  const NEW = { accepted: 0, metadataOnly: 0, noDepartment: 0, byDepartment: {} };
  const matched = new Map();                                   // held journal id -> { j, row }
  const seenFile = new Set();
  const issnsOfRow = (row) => [issnOf(row['Journal ISSN (print version)']), issnOf(row['Journal EISSN (online version)'])].filter(Boolean);
  for (const row of rows) {
    const j = D.doajRowToJournal(row);
    if (!j) { S.unusable++; continue; }
    const keys = issnsOfRow(row);
    const hits = [...new Set(keys.map((k) => byIssn.get(k)).filter(Boolean))].filter((h) => !String(h.id).startsWith('new:'));          // journals really held, not ones this pass just counted as new
    // The Check's own order: held by ISSN or e-ISSN first; then a held title is "needs review"; otherwise new — and a new journal is held for the rest of the file.
    if (byIssn.has(j.issn) || (j.eissn && byIssn.has(j.eissn)) || hits.length) {
      S.alreadyHeld++;
      if (hits.length > 1) S.splitAcrossHeld++;
      for (const h of hits.slice(0, 1)) if (!matched.has(h.id)) matched.set(h.id, { j: h, row, csv: j });
      continue;
    }
    if (heldTitles.has(j.title.toLowerCase())) { S.needsReviewTitle++; continue; }
    byIssn.set(j.issn, { id: `new:${j.issn}`, issn: j.issn }); if (j.eissn) byIssn.set(j.eissn, { id: `new:${j.issn}` }); heldTitles.add(j.title.toLowerCase());
    S.new++;
    j.status === 'Accepted' ? NEW.accepted++ : NEW.metadataOnly++;
    if (!j.domain) NEW.noDepartment++;
    const d = j.domain || '(none)'; NEW.byDepartment[d] = (NEW.byDepartment[d] || 0) + 1;
  }

  // ── the held journals DOAJ knows ──────────────────────────────────────────
  const HELD = { distinctJournals: matched.size, protected: { total: 0, ourOwn: 0, rejected: 0, rightsDecidedByPerson: 0 }, eligible: 0 };
  const FIELDS = ['eissn', 'publisherName', 'country', 'homepage', 'language', 'domain', 'subjects'];
  const ENR = { journalsWithAnyGain: 0, gainsTwoOrMore: 0, gainsDepartment: 0, gainsDepartmentAndHasArticles: 0, byField: Object.fromEntries(FIELDS.map((f) => [f, 0])), withArticlesAndAnyGain: 0 };
  const CONF = { licenceFamilyDiffers: 0, eissnContradicts: 0 };
  // Rights drift (counted, never written): what DOAJ declares today against the status we hold. Held Accepted + DOAJ now says not-commercial is the one that matters.
  const DRIFT = { heldAcceptedDoajNowMetadataOnly: 0, ofThemWithArticles: 0, ofThemDoajDecided: 0, heldMetadataOnlyDoajNowAccepted: 0 };
  const HOME = { gainsHomepage: 0, ofThemMetadataOnly: 0, ofThemAccepted: 0, ofThemWithArticles: 0 };
  for (const { j, csv } of matched.values()) {
    const why = whyProtected(j);
    if (why) { HELD.protected.total++; why === 'our own' ? HELD.protected.ourOwn++ : why === 'Rejected' ? HELD.protected.rejected++ : HELD.protected.rightsDecidedByPerson++; continue; }
    HELD.eligible++;
    // conflicts are counted, never resolved: a licence family that differs, an e-ISSN the held journal contradicts
    if (j.licence && csv.licence && family(j.licence) !== family(csv.licence.split(',')[0])) CONF.licenceFamilyDiffers++;
    if (j.eissn && csv.eissn && j.eissn !== csv.eissn && j.issn !== csv.eissn) CONF.eissnContradicts++;
    // fill-empty only — the same fields the engine's own refresh may fill
    const gain = [];
    if (blank(j.eissn) && csv.eissn && csv.eissn !== j.issn) gain.push('eissn');
    if (blank(j.publisherName) && csv.publisherName) gain.push('publisherName');
    if (blank(j.country) && csv.country) gain.push('country');
    if (blank(j.homepage) && csv.homepage) gain.push('homepage');
    if (blank(j.language) && csv.language) gain.push('language');
    if (blank(j.domain) && csv.domain) gain.push('domain');
    if (!j.subjects.length && csv.subjects && csv.subjects.length) gain.push('subjects');
    for (const f of gain) ENR.byField[f]++;
    if (gain.includes('homepage')) { HOME.gainsHomepage++; j.status === 'MetadataOnly' ? HOME.ofThemMetadataOnly++ : j.status === 'Accepted' ? HOME.ofThemAccepted++ : 0; if (Number(j.articleCount) > 0) HOME.ofThemWithArticles++; }
    if (j.status === 'Accepted' && csv.status === 'MetadataOnly') { DRIFT.heldAcceptedDoajNowMetadataOnly++; if (Number(j.articleCount) > 0) DRIFT.ofThemWithArticles++; if (j.rightsBasis === 'DOAJ declaration') DRIFT.ofThemDoajDecided++; }
    if (j.status === 'MetadataOnly' && csv.status === 'Accepted') DRIFT.heldMetadataOnlyDoajNowAccepted++;
    if (gain.length) { ENR.journalsWithAnyGain++; if (Number(j.articleCount) > 0) ENR.withArticlesAndAnyGain++; }
    if (gain.length >= 2) ENR.gainsTwoOrMore++;
    if (gain.includes('domain')) { ENR.gainsDepartment++; if (Number(j.articleCount) > 0) ENR.gainsDepartmentAndHasArticles++; }
  }

  // held journals DOAJ-declared that the file no longer lists (possibly withdrawn from DOAJ) — informational, nothing is done about them
  const csvIssns = new Set(); for (const row of rows) for (const k of issnsOfRow(row)) csvIssns.add(k);
  const doajHeld = held.filter((j) => j.rightsBasis === 'DOAJ declaration');
  const notInFile = doajHeld.filter((j) => ![j.issn, j.eissn].some((k) => k && csvIssns.has(k))).length;

  const R = {
    database: `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`, csv: source.split('/').pop(), csvRows: rows.length,
    journalsHeld: held.length, heldByStatus: held.reduce((a, j) => ((a[j.status] = (a[j.status] || 0) + 1), a), {}), heldDoajDeclared: doajHeld.length, heldDoajDeclaredNotInFile: notInFile,
    rows: S, newJournals: NEW, heldMatched: HELD, enrichment: ENR, homepage: HOME, conflicts: CONF, rightsDrift: DRIFT,
  };

  const L = (k, v, note = '') => console.log(`  ${k.padEnd(58)} ${String(v).padStart(8)}  ${note}`);
  console.log('== Coverage of the DOAJ CSV against this database ==');
  L('rows in the CSV', n0(S.inFile)); L('  unusable (no ISSN or no title)', n0(S.unusable));
  L('rows already held (by ISSN / e-ISSN)', n0(S.alreadyHeld), pct(S.alreadyHeld, S.inFile));
  L('  of those, distinct journals held', n0(HELD.distinctJournals)); L('  of those, an ISSN pair split across two held journals', n0(S.splitAcrossHeld));
  L('GENUINELY NEW journals', n0(S.new), pct(S.new, S.inFile));
  L('same title as a held journal, different ISSN ("needs review")', n0(S.needsReviewTitle));
  console.log('\n== The genuinely new journals ==');
  L('would be Accepted (every licence allows commercial use)', n0(NEW.accepted), pct(NEW.accepted, S.new)); L('would be MetadataOnly', n0(NEW.metadataOnly), pct(NEW.metadataOnly, S.new));
  L('with no department (would be NeedsReview under the Phase 2D plan)', n0(NEW.noDepartment));
  console.log('  by department:', Object.entries(NEW.byDepartment).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '(none)');
  console.log('\n== Journals already held that DOAJ lists ==');
  L('protected / manual / Rejected (never touched)', n0(HELD.protected.total), `our own ${HELD.protected.ourOwn} · Rejected ${HELD.protected.rejected} · rights decided by a person ${HELD.protected.rightsDecidedByPerson}`);
  L('eligible for fill-empty enrichment', n0(HELD.eligible));
  L('  would gain at least one field', n0(ENR.journalsWithAnyGain), pct(ENR.journalsWithAnyGain, HELD.eligible));
  for (const f of FIELDS) L(`    ${f}`, n0(ENR.byField[f]));
  L('  would gain two or more fields', n0(ENR.gainsTwoOrMore));
  L('  would gain a DEPARTMENT (they have none today)', n0(ENR.gainsDepartment), `${ENR.gainsDepartmentAndHasArticles} of them already have articles`);
  L('  any gain AND already has articles', n0(ENR.withArticlesAndAnyGain));
  L('  would gain a HOMEPAGE link', n0(HOME.gainsHomepage), `MetadataOnly ${HOME.ofThemMetadataOnly} (their only way out to the journal) · Accepted ${HOME.ofThemAccepted} · with articles ${HOME.ofThemWithArticles}`);
  L('conflicts (counted, never written): licence family differs', n0(CONF.licenceFamilyDiffers)); L('conflicts: e-ISSN contradicts the held one', n0(CONF.eissnContradicts));
  console.log('\n== Rights drift (information only — a backfill never changes status or licence) ==');
  L('held ACCEPTED, but DOAJ\'s file now makes it MetadataOnly', n0(DRIFT.heldAcceptedDoajNowMetadataOnly), `with articles ${DRIFT.ofThemWithArticles} · status was decided by DOAJ ${DRIFT.ofThemDoajDecided}`);
  L('held MetadataOnly, but DOAJ\'s file now makes it Accepted', n0(DRIFT.heldMetadataOnlyDoajNowAccepted));
  console.log('\n== This database ==');
  L('journals held', n0(held.length), JSON.stringify(R.heldByStatus)); L('held and DOAJ-declared', n0(doajHeld.length)); L('  of those the CSV no longer lists (possibly withdrawn)', n0(notInFile), 'informational only; nothing is done about them');
  console.log('\nNothing was written. (Decision rule for Phase 2D: fewer than 500 genuinely new = skip; 500-1,000 = review; more than 1,000 = build.)');
  if (opt('--json')) { fs.writeFileSync(opt('--json'), JSON.stringify(R, null, 2)); console.log(`Numbers also written to ${opt('--json')}`); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
