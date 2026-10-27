/**
 * Phase 2E, first deliverable: the READ-ONLY DOAJ enrichment audit. Compares a staged, dated DOAJ CSV snapshot with the journals a database holds and says what DOAJ could complete,
 * where it disagrees, what is protected, and how much of it is worth doing. It writes NOTHING: every query runs inside one READ ONLY transaction (Postgres refuses a write), the file
 * is read from disk (never downloaded), and fingerprints of the journal columns it could touch and of the continuous DOAJ state are taken before and after to show nothing moved.
 *
 *   npx tsx scripts/doaj-enrichment-audit.ts --csv <staged doaj_journalcsv_YYYYMMDD_HHMM_utf8.csv> [--json <file>]
 *
 * Reads DATABASE_URL (locally .env). Prints which database it measured (host, port, name — never the password).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!process.env.DATABASE_URL) { const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8')); if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, ''); }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const csv = opt('--csv'); if (!csv) throw new Error('--csv <staged DOAJ snapshot file> is required (this audit never downloads)');

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const E = await import('../src/lib/ingestion/doajEnrichment.js');
const u = new URL(process.env.DATABASE_URL);
const n0 = (n: number) => Number(n).toLocaleString('en-US'); const pct = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');

// What this audit could change if it were not read-only, and the continuous DOAJ state it must leave alone.
const WATCH: [string, string][] = [
  ['Journal descriptive columns, status, licence, access', `select md5(coalesce(string_agg(concat_ws('|', id, issn, eissn, title, "publisherName", country, homepage, language, subject, subjects::text, domain, status, licence, "licenceIsNC"::text, "rightsBasis", "rightsVerifiedBy", "publisherId"), E'\\n' order by id), '')) h from "Journal"`],
  ['Journal article-fetch state (fetchCursor, exhaustedAt, claims)', `select md5(coalesce(string_agg(concat_ws('|', id, "fetchCursor", "exhaustedAt"::text, "claimedAt"::text, "nextEligibleAt"::text), E'\\n' order by id), '')) h from "Journal"`],
  ['continuous DOAJ sweep checkpoints (DepartmentSweep, DOAJ)', `select md5(coalesce(string_agg(concat_ws('|', id, position::text, "exhaustedAt"::text, "lastSweptAt"::text), E'\\n' order by id), '')) h from "DepartmentSweep" where source = 'DOAJ'`],
  ['journal coverage state (AppSetting ingestion.journals.*)', `select md5(coalesce(string_agg(concat_ws('|', key, value::text), E'\\n' order by key), '')) h from "AppSetting" where key like 'ingestion.journals.%'`],
  ['DOAJ provider health row', `select md5(coalesce(string_agg(concat_ws('|', source, "consecutiveFailures"::text, "pausedUntil"::text, "lifetimeFailures"::text, "lastOkAt"::text), E'\\n' order by source), '')) h from "IngestionSourceHealth" where source = 'DOAJ'`],
];
const fingerprint = async () => {
  const out: string[] = [];
  await db.$transaction(async (tx: any) => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); for (const [, sql] of WATCH) out.push((await tx.$queryRawUnsafe(sql))[0].h); }, { timeout: 120_000 });
  return out;
};

console.log(`Database: ${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}  (read-only)`);
const before = await fingerprint();
const snap = E.readSnapshot(csv);
let held: any[] = [];
await db.$transaction(async (tx: any) => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); held = await E.loadHeld(tx); }, { timeout: 120_000 });
const t0 = Date.now(); const P = E.planEnrichment(snap, held); const ms = Date.now() - t0;
const after = await fingerprint();

const L = (k: string, v: string | number, note = '') => console.log(`  ${k.padEnd(62)} ${String(typeof v === 'number' ? n0(v) : v).padStart(9)}  ${note}`);
const M = P.matching, G = P.gains, C = P.conflicts, S = P.unchanged;
console.log('\n== SOURCE ==');
L('snapshot file', P.snapshot.file); L('snapshot date (from the official file name)', P.snapshot.date ?? '(not a DOAJ-named file!)'); L('size (bytes)', P.snapshot.size); L('sha-256', P.snapshot.sha256.slice(0, 16) + '…'); L('rows', P.snapshot.rows);
console.log('\n== THE CATALOGUE ==');
L('journals held', P.held.total, JSON.stringify(P.held.byStatus)); console.log(`  rights basis: ${JSON.stringify(P.held.byRightsBasis)}`);
console.log('\n== MATCHING (identity = exact ISSN against both of a held journal\'s ISSN columns) ==');
L('DOAJ rows matched to exactly one held journal, confidently', M.matched, pct(M.matched, M.rows));
L('  ISSNs identical', M.relation.identical); L('  DOAJ lists an extra ISSN the held journal lacks', M.relation.rowHasExtraIssn); L('  held journal has an extra ISSN DOAJ lacks', M.relation.heldHasExtraIssn);
L('  a shared ISSN filed in the other role (print/electronic)', M.relation.crossField); L('  ISSN DISAGREEMENT (each side has an ISSN the other lacks) — not enriched', M.relation.issnDisagreement);
L('AMBIGUOUS — not enriched, reported', M.ambiguous.total); L('  an ISSN shared by two DOAJ rows', M.ambiguous.sharedIssnInFile); L('  one DOAJ row touches two held journals', M.ambiguous.splitAcrossHeld); L('  one held journal touched by several DOAJ rows', M.ambiguous.heldTouchedByManyRows);
L('IDENTITY_CONFLICT: same title AND publisher, different ISSN', M.identityConflict, 'reported, never enriched');
L('same title only (other publisher), different ISSN', M.titleOnly, 'reported, never enriched');
L('DOAJ rows with no catalogue match (would be new)', M.unmatched); L('unusable rows (no ISSN or title)', M.unusable);
console.log('\n== PROTECTED (never enriched) — among matched journals ==');
L('protected, total', P.protected.total); for (const [k, v] of Object.entries(P.protected.byReason)) L(`  first reason: ${k}`, v);
console.log(`  (a journal can have more than one reason: ${JSON.stringify(P.protected.anyReasonCounts)})`);
L('ELIGIBLE for enrichment (confident, not protected, no ISSN disagreement)', P.eligibleForEnrichment);
const PC = P.protectedWholeCatalogue; console.log(`  whole catalogue: ${n0(PC.total)} journals are protected ${JSON.stringify(PC.byReason)}; ${n0(PC.ofWhichInDoajFile)} of them are in the DOAJ file`);
console.log('\n== ENRICHMENT OPPORTUNITIES — an EMPTY held field and a VALID DOAJ value ==');
for (const [f, v] of Object.entries(G.byField)) L(`  ${f}${P.reviewOnlyFields.includes(f as any) ? '   (REVIEW ONLY: changes which articles attach)' : ''}`, v as number, pct(v as number, P.eligibleForEnrichment));
console.log(`  malformed DOAJ values ignored: ${JSON.stringify(G.malformedSourceValuesIgnored)}`);
L('JOURNALS THAT WOULD GAIN AT LEAST ONE SAFE FIELD  (the meaningful total)', G.journalsWithAnyGain, pct(G.journalsWithAnyGain, P.eligibleForEnrichment));
L('  gaining at least one high-value field (homepage, country, publisher)', G.highValue); L('  gaining only language and/or subject', G.onlyLanguageOrSubject); L('  gaining two or more fields', G.twoOrMore); L('  not filled because the title differs (the match is in doubt)', G.blockedByTitleConflict);
L('  of the gainers, already have articles', G.withArticles); L('  MetadataOnly journals gaining a homepage (their only way out)', G.metadataOnlyGainsHomepage); console.log(`  gainers by status: ${JSON.stringify(G.byStatus)}`);
L('journals where DOAJ would complete the e-ISSN (review only)', G.eissnReviewOnly); L('e-ISSN DOAJ has but we cannot store (the held ISSN slot is the e-ISSN)', P.evidenceNotApplied.eissnNotStorable);
console.log('\n== UNCHANGED (held value agrees with DOAJ) ==');
console.log(`  ${JSON.stringify(S)}  (a country held as an ISO code is the same country in another format: counted as unchanged, never a gap or a conflict)`);
console.log('\n== CONFLICTS — counted, never written, among eligible matched journals ==');
for (const [k, v] of Object.entries(C)) L(`  ${k}`, v as number);
console.log('\n== RIGHTS / STATUS EVIDENCE — NOT applied by this phase ==');
L('held licence empty, DOAJ declares one', P.evidenceNotApplied.rightsEvidenceHeldLicenceEmpty);
L('held ACCEPTED, DOAJ\'s own rule would make it MetadataOnly', P.evidenceNotApplied.statusRuleDrift.heldAcceptedRuleMetadataOnly, `${P.evidenceNotApplied.statusRuleDrift.ofFirstWithArticles} with articles`);
L('held MetadataOnly, DOAJ\'s rule would make it Accepted', P.evidenceNotApplied.statusRuleDrift.heldMetadataOnlyRuleAccepted);
console.log('\n== DEPARTMENT — analysis only; nothing is assigned ==');
const D = P.department;
L('journals with no department', D.unassigned); L('  matched to DOAJ, with a suggestion from the existing classifier', D.suggestible); L('  matched to DOAJ, classifier gives nothing (unclassifiable)', D.unclassifiable); L('  not in the DOAJ file (no suggestion possible)', D.unassignedNotInFile);
L('journals with a department that DOAJ\'s classifier also places', D.assignedMatched, `agree ${n0(D.agree)} · differ ${n0(D.disagree)} (${pct(D.disagree, D.assignedMatched)})`);
console.log(`  most common differences (held → classifier): ${D.disagreeTop.map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`);
console.log('\n== VERIFICATION ==');
L('held, OA unverified (not DOAJ-declared), that DOAJ lists', P.verification.heldUnverifiedListedByDoaj); L('held, DOAJ-declared, no longer in the file (possibly withdrawn)', P.verification.heldDoajDeclaredNotInFile);
console.log('\n== SAMPLES (bounded: 25 each; first few shown) ==');
for (const k of ['enrichable', 'conflicts', 'ambiguous', 'identityConflicts'] as const) console.log(`  ${k} (${P.samples[k].length}): ${JSON.stringify(P.samples[k].slice(0, 3))}`);
console.log(`\n== SAFETY ==\n  plan computed in ${ms} ms, nothing written, no download`);
WATCH.forEach(([label], i) => console.log(`  ${before[i] === after[i] ? 'UNCHANGED' : 'CHANGED  '}  ${label}  ${before[i].slice(0, 10)} → ${after[i].slice(0, 10)}`));
if (opt('--json')) { writeFileSync(opt('--json')!, JSON.stringify(P, null, 2)); console.log(`\nNumbers written to ${opt('--json')} (a file on this machine, not the database)`); }
await db.$disconnect();
process.exit(before.every((b, i) => b === after[i]) ? 0 : 3);
