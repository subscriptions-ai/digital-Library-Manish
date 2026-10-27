import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A deterministic DOAJ-FORMAT journal CSV and the journals that go with it, for the Phase 2E tests. The header is DOAJ's real one (52 columns); a quoted field with a line break in it is
 * included on purpose (a page position must survive it). Nothing here touches the network.
 *
 * Shape of row i (k = i % 20) and what an enrichment must do with the journal the catalogue holds for it:
 *   0   held, EVERY descriptive field empty (MetadataOnly)              → fills homepage, country, publisher, language, subject, subjects
 *   1   held, only the homepage empty; no department                    → fills homepage; the department stays empty
 *   2   held, homepage empty, a DIFFERENT publisher, department Law      → fills homepage; the publisher is kept (a conflict); the department is kept
 *   3   held, everything equal                                          → unchanged
 *   4   held under its e-ISSN only (the row has no print ISSN), country empty → fills country
 *   5   held, country stored as the ISO code "BR"                       → unchanged (same country, other format)
 *   6   held, TITLE differs, homepage empty                             → conflict, nothing filled (the match is in doubt)
 *   7   held, homepage empty, rightsBasis "our own"                     → protected, untouched
 *   8   held, homepage empty, Rejected                                  → protected, untouched
 *   9   held, homepage empty, rights decided by a person                → protected, untouched
 *   10  held, homepage empty, linked to a publisher                     → protected, untouched
 *   11  held, homepage empty, licence "CC BY-NC" (DOAJ: CC BY)          → fills homepage; licence and status kept (a licence conflict)
 *   12  held with the print and e-ISSN in the other columns, homepage empty → fills homepage (cross-field match)
 *   13  its e-ISSN is shared with row 14; one held journal            → AMBIGUOUS (an ISSN shared by two DOAJ rows)
 *   14  shares row 13's e-ISSN                                          → AMBIGUOUS
 *   15  not held by ISSN; a held journal has the same title AND publisher under other ISSNs → IDENTITY_CONFLICT
 *   16  not held by ISSN; a held journal has the same title, another publisher             → same title only
 *   17  not held at all                                                 → "not in the catalogue" (never created)
 *   18  held, homepage empty, DOAJ's homepage is not a URL              → unchanged (malformed value ignored)
 *   19  held under the print ISSN only; DOAJ also has an e-ISSN         → unchanged (the e-ISSN is review-only)
 */

export const COLUMNS = ['Journal title', 'Journal URL', 'URL in DOAJ', 'When did the journal start to publish all content using an open license?', 'Alternative title', 'Journal ISSN (print version)', 'Journal EISSN (online version)', 'Keywords', 'Languages in which the journal accepts manuscripts', 'Publisher', 'Country of publisher', 'Other organisation', 'Country of other organisation', 'Journal license', 'License attributes', 'URL for license terms', 'Machine-readable CC licensing information embedded or displayed in articles', 'Author holds copyright without restrictions', 'Copyright information URL', 'Review process', 'Review process information URL', 'Journal plagiarism screening policy', "URL for journal's aims & scope", 'URL for the Editorial Board page', "URL for journal's instructions for authors", 'Average number of weeks between article submission and publication', 'APC', 'APC information URL', 'APC amount', 'Journal waiver policy (for developing country authors etc)', 'Waiver policy information URL', 'Has other fees', 'Other fees information URL', 'Preservation Services', 'Preservation Service: national library', 'Preservation information URL', 'Deposit policy directory', 'URL for deposit policy', 'Persistent article identifiers', "Does the journal comply to DOAJ's definition of open access?", 'Continues', 'Continued By', 'LCC Codes', 'Subscribe to Open', 'Mirror Journal', 'Open Journals Collective', 'Subjects', 'Added on Date', 'Last updated Date', 'Last Full Review Date', 'Number of Article Records', 'Most Recent Article Added'] as const;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const seedPrefix = (seed: string) => String(parseInt(sha(seed).slice(0, 6), 16) % 900 + 100);         // three digits
// three digits of the row number after the hyphen, and the thousands in the prefix, so a fixture of any size has unique ISSNs
export const issnOf = (seed: string, i: number, kind: 0 | 1 | 2 = 0) => `9${String(100 + ((Number(seedPrefix(seed)) - 100 + Math.floor(i / 1000)) % 900))}-${String(i % 1000).padStart(3, '0')}${kind}`;
export const kindOf = (i: number) => i % 20;
export const titleOf = (seed: string, i: number) => `DOAJ fixture ${seed} ${i}`;
export const homepageOf = (seed: string, i: number) => `https://journals.example.org/${seed}/${i}`;
export const sharedE = (seed: string, i: number) => issnOf(seed, i - (kindOf(i) === 14 ? 1 : 0), 2);       // rows 13 and 14 share it
export const yearOf = (i: number) => 2010 + (i % 10);

export const BASE = { publisher: 'Fixture Press', country: 'Brazil', language: 'English, Spanish', subject: 'Medicine: Nursing', subjects: ['Nursing', 'Internal medicine'] };

const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function rowOf(seed: string, i: number, pad = 0): Record<string, string> {
  const k = kindOf(i); const r: Record<string, string> = Object.fromEntries(COLUMNS.map(c => [c, '']));
  r['Journal title'] = titleOf(seed, i);
  r['Journal URL'] = k === 18 ? 'not a url' : homepageOf(seed, i);
  r['URL in DOAJ'] = `https://doaj.org/toc/${issnOf(seed, i, 1)}`;
  r['Journal ISSN (print version)'] = k === 4 ? '' : k === 13 || k === 14 ? issnOf(seed, i, 0) : issnOf(seed, i, 0);
  r['Journal EISSN (online version)'] = k === 13 || k === 14 ? sharedE(seed, i) : issnOf(seed, i, 1);
  r['Keywords'] = 'fixture, nursing' + (pad ? ' ' + 'lorem ipsum '.repeat(Math.ceil(pad / 12)) : '');
  r['Languages in which the journal accepts manuscripts'] = BASE.language;
  r['Publisher'] = BASE.publisher; r['Country of publisher'] = BASE.country;
  r['Journal license'] = 'CC BY'; r['License attributes'] = ''; r['Does the journal comply to DOAJ\'s definition of open access?'] = 'Yes';
  r['LCC Codes'] = 'RT1-120|R'; r['Subjects'] = 'Medicine: Nursing | Medicine: Internal medicine';
  r['Added on Date'] = `${yearOf(i)}-06-15T12:00:00Z`; r['Last updated Date'] = '2026-09-01T00:00:00Z'; r['Number of Article Records'] = String(i % 7);
  // a quoted field with a line break and a comma in it: a page position must survive it
  if (i % 50 === 7) r['Review process information URL'] = `https://example.org/policy\nline two, with a comma and "quotes"`;
  return r;
}

export function makeCsv(seed: string, total: number, extra: Record<string, string>[] = [], pad = 0): string {
  const lines = [COLUMNS.map(q).join(',')];
  for (let i = 0; i < total; i++) { const r = rowOf(seed, i, pad); lines.push(COLUMNS.map(c => q(r[c])).join(',')); }
  for (const e of extra) lines.push(COLUMNS.map(c => q(e[c] ?? '')).join(','));
  return lines.join('\n') + '\n';
}

/** Stage a file in `dir` under DOAJ's own naming (the date is the name's). */
export function stage(dir: string, text: string, date = '20260926', time = '2320'): string {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `doaj_journalcsv_${date}_${time}_utf8.csv`); fs.writeFileSync(p, text); return p;
}

/** The journal the catalogue should hold for row i (null: none), as Prisma create data. Rows that need a second held journal (15, 16) return it via `extraHeld`. */
export type HeldSpec = { data: any; publisherId?: boolean };
const full = (seed: string, i: number): any => ({
  title: titleOf(seed, i), issn: issnOf(seed, i, 0), eissn: issnOf(seed, i, 1), publisherName: BASE.publisher, country: BASE.country, homepage: homepageOf(seed, i), language: BASE.language,
  subject: BASE.subject, subjects: BASE.subjects, domain: 'Nursing', status: 'Accepted', licence: 'CC BY', licenceIsNC: false, rightsBasis: 'DOAJ declaration', rightsVerifiedBy: 'ingestion',
});
export function heldFor(seed: string, i: number): HeldSpec[] {
  const k = kindOf(i); const f = full(seed, i);
  switch (k) {
    case 0: return [{ data: { ...f, publisherName: null, country: null, homepage: null, language: null, subject: null, subjects: [], status: 'MetadataOnly' } }];
    case 1: return [{ data: { ...f, homepage: null, domain: null } }];
    case 2: return [{ data: { ...f, homepage: null, publisherName: 'Other Publisher Ltd', domain: 'Law' } }];
    case 3: return [{ data: f }];
    case 4: return [{ data: { ...f, issn: issnOf(seed, i, 1), eissn: null, country: null } }];
    case 5: return [{ data: { ...f, country: 'BR' } }];
    case 6: return [{ data: { ...f, title: `Something Entirely Different ${seed} ${i}`, homepage: null } }];
    case 7: return [{ data: { ...f, homepage: null, rightsBasis: 'our own', rightsVerifiedBy: 'build-own-catalogue' } }];
    case 8: return [{ data: { ...f, homepage: null, status: 'Rejected' } }];
    case 9: return [{ data: { ...f, homepage: null, rightsVerifiedBy: 'admin@test.invalid' } }];
    case 10: return [{ data: { ...f, homepage: null }, publisherId: true }];
    case 11: return [{ data: { ...f, homepage: null, licence: 'CC BY-NC', licenceIsNC: true, status: 'MetadataOnly' } }];
    case 12: return [{ data: { ...f, issn: issnOf(seed, i, 1), eissn: issnOf(seed, i, 0), homepage: null } }];
    case 13: return [{ data: { ...f, issn: sharedE(seed, i), eissn: null, homepage: null } }];
    case 14: return [];
    case 15: return [{ data: { ...f, issn: issnOf(seed, i, 2), eissn: null } }];                         // the same title and publisher under another ISSN
    case 16: return [{ data: { ...f, issn: issnOf(seed, i, 2), eissn: null, publisherName: 'A Different Press' } }];
    case 17: return [];
    case 18: return [{ data: { ...f, homepage: null } }];
    case 19: return [{ data: { ...f, eissn: null } }];
  }
  return [];
}

/** What an undisturbed run must give for the first `total` rows: the framework counters and the facts the tags add up. */
export function oracle(total: number, o: { depts?: string[]; fromYear?: number; toYear?: number } = {}) {
  const e = { fetched: 0, enriched: 0, conflicting: 0, unchanged: 0, refused: 0, duplicate: 0, scanned: total, outsideWindow: 0, tags: {} as Record<string, number> };
  const t = (k: string, n = 1) => { e.tags[k] = (e.tags[k] ?? 0) + n; };
  for (let i = 0; i < total; i++) {
    const y = yearOf(i);
    if ((o.fromYear && y < o.fromYear) || (o.toYear && y > o.toYear)) { e.outsideWindow++; continue; }
    e.fetched++; const k = kindOf(i);
    const heldDomain = k === 1 ? null : k === 2 ? 'Law' : 'Nursing';
    const matched = ![13, 14, 15, 16, 17].includes(k);
    if (matched) t('matched');
    if ([13, 14].includes(k)) { e.refused++; t('ambiguous'); t('ambiguous.sharedIssnInFile'); continue; }
    if (k === 15) { e.refused++; t('identityConflict'); continue; }
    if (k === 16) { e.refused++; t('titleOnly'); continue; }
    if (k === 17) { e.refused++; t('notInCatalogue'); continue; }
    e.duplicate++;
    if ([7, 8, 9, 10].includes(k)) { e.unchanged++; t('protected'); continue; }
    if (o.depts?.length && !o.depts.includes(heldDomain ?? '')) { e.unchanged++; t('outsideDepartments'); continue; }
    if (k === 6) { e.conflicting++; t('conflict'); t('conflict.title'); t('blockedByTitle'); continue; }
    const fills: string[] = k === 0 ? ['homepage', 'country', 'publisherName', 'language', 'subject', 'subjects'] : [0, 1, 2, 11, 12].includes(k) ? ['homepage'] : k === 4 ? ['country'] : [];
    if (k === 2) { t('conflict'); t('conflict.publisherName'); }
    if (k === 11) { t('conflict'); t('conflict.licenceListDiffers'); }
    if (k === 12) t('crossField');
    if (k === 19) t('review.eissn');
    if (fills.length) { e.enriched++; t('enrichable'); for (const f of fills) t(`fill.${f}`); } else { e.unchanged++; t('unchanged'); }
  }
  return e;
}
