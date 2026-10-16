import { ingestionDb as db } from './db.js';
import { fetchSourceJson } from './sourceHealth.js';
import { SourceError } from './articleSources.js';
import { normaliseIssn } from '../ingestionWorker.js';
import { canonicalDepartmentName } from '../departmentRegistry.js';
import { journalDepartment } from './journalDepartment.js';

/**
 * Journal discovery from sources that are NOT authorities on open access: Crossref's journal list and OpenAlex's source list.
 *
 * DOAJ declares a licence for every title, with an explicit non-commercial flag, and that is what lets a journal be Accepted
 * for full text. Crossref and OpenAlex say a journal EXISTS — its name, its ISSNs, its publisher — and nothing that can stand in
 * for that. Two different questions, kept apart:
 *
 *   CATALOGUE   Is this a real journal we can describe? A title, a valid ISSN, a publisher and a department the journal's own title and
 *               subjects support are enough. Such a journal is catalogued — status MetadataOnly, listed publicly with its details.
 *   ACCESS      Can anyone read it here? Not on this evidence. It is written openAccess = false, no licence, no commercial-use flag, and a
 *               basis that says "OA unverified": the screen shows "Open Access not verified" and offers no read or open-access button.
 *
 * A journal that fails the first test (no publisher, no ISSN, no department the evidence supports) is held for a person, as before. Either
 * way: never Accepted, never fetched for articles (the engine's journal picker takes only Accepted journals with a DOAJ declaration), and a
 * journal already held is never changed in status, licence or rights — only its empty fields are filled. OpenAlex's own `is_oa` /
 * `is_in_doaj` flags are kept as a pointer; they are not a verification.
 */

const CONTACT = process.env.OPENALEX_CONTACT || 'info@celnet.in';
/** Server-side only; never sent to the browser. Crossref's polite pool asks for a way to reach us. */
export const crossrefContact = () => process.env.CROSSREF_MAILTO || CONTACT;
export const crossrefHeaders = () => ({ 'User-Agent': process.env.CROSSREF_USER_AGENT || `STM Digital Library (mailto:${crossrefContact()})` });
const OA_HEADERS = { 'User-Agent': `STM Digital Library (mailto:${CONTACT})` };

export type JournalCandidate = {
  source: 'Crossref Journals' | 'OpenAlex Sources' | 'ROAD';
  title: string; issn: string | null; eissn: string | null;
  /** The linking ISSN, where the source gives one (OpenAlex does). It is one of the journal's ISSNs, so it identifies the same journal under either. */
  issnL?: string | null;
  publisherName: string | null; country: string | null; homepage: string | null;
  subjects: string[];
  /** What the source itself says about openness, kept for the reviewer. Never used to accept anything. */
  hint?: string | null;
};

export type JournalPage = { items: JournalCandidate[]; fetched: number; skipped: number; total: number | null };

function bad(source: string, why: string): never { throw new SourceError(source, `${source} sent a response in a shape we do not recognise (${why})`, 'invalid'); }

function fail(source: string, r: any): never {
  throw new SourceError(source, r.error || `${source} did not answer`, r.paused || r.status === 429 ? 'rate_limited' : 'unavailable', r.status ?? null);
}

/** One page of Crossref's journal list for a search term. Offsets, 100 at a time. */
export async function fetchCrossrefJournals(term: string, offset: number, rows: number): Promise<JournalPage> {
  const url = `https://api.crossref.org/journals?query=${encodeURIComponent(term)}&rows=${rows}&offset=${offset}&mailto=${encodeURIComponent(crossrefContact())}`;
  const r = await fetchSourceJson(url, { source: 'Crossref', headers: crossrefHeaders(), attempts: 3 });
  if (!r.ok) fail('Crossref', r);
  const msg = r.json?.message;
  if (r.json?.status !== 'ok' || !Array.isArray(msg?.items)) bad('Crossref', 'no journal list');
  const items: JournalCandidate[] = [];
  let skipped = 0;
  for (const it of msg.items) {
    const title = String(Array.isArray(it.title) ? it.title[0] : it.title || '').trim();
    const typed: { value: string; type: string }[] = Array.isArray(it['issn-type']) ? it['issn-type'] : [];
    const all: string[] = (Array.isArray(it.ISSN) ? it.ISSN : []).map((x: string) => normaliseIssn(x)).filter(Boolean) as string[];
    const print = normaliseIssn(typed.find(t => t.type === 'print')?.value) || null;
    const electronic = normaliseIssn(typed.find(t => t.type === 'electronic')?.value) || null;
    const issn = print || all[0] || null;
    const eissn = electronic || all.find(x => x !== issn) || null;
    if (!title || !issn) { skipped++; continue; }          // without an ISSN a journal has no identity to hold it by
    items.push({
      source: 'Crossref Journals', title, issn, eissn, publisherName: it.publisher ? String(it.publisher) : null, country: null, homepage: null,
      subjects: (Array.isArray(it.subjects) ? it.subjects : []).map((x: any) => x?.name).filter(Boolean),
      hint: 'Crossref lists the journal; it says nothing about open access',
    });
  }
  return { items, fetched: msg.items.length, skipped, total: Number.isFinite(msg['total-results']) ? msg['total-results'] : null };
}


function openAlexItems(results: any[]): { items: JournalCandidate[]; fetched: number; skipped: number } {
  const items: JournalCandidate[] = [];
  let skipped = 0;
  for (const it of results) {
    const title = String(it.display_name || '').trim();
    const all: string[] = [it.issn_l, ...(Array.isArray(it.issn) ? it.issn : [])].map((x: string) => normaliseIssn(x)).filter(Boolean) as string[];
    const uniq = [...new Set(all)];
    const issn = uniq[0] || null;
    const eissn = uniq.find(x => x !== issn) || null;
    if (!title || !issn) { skipped++; continue; }
    items.push({
      source: 'OpenAlex Sources', title, issn, eissn, issnL: normaliseIssn(it.issn_l) || null, publisherName: it.host_organization_name ? String(it.host_organization_name) : null,
      country: it.country_code ? String(it.country_code) : null, homepage: it.homepage_url ? String(it.homepage_url) : null,
      subjects: [...new Set([...(Array.isArray(it.topics) ? it.topics : []).slice(0, 5), ...(Array.isArray(it.x_concepts) ? it.x_concepts : []).filter((c: any) => (c?.level ?? 9) <= 1).slice(0, 4)].map((x: any) => String(x?.display_name || '').trim()).filter(Boolean))],
      hint: `OpenAlex flags it open access${it.is_in_doaj ? ' and lists it in DOAJ' : ''}; not verified here`,
    });
  }
  return { items, fetched: results.length, skipped };
}

/** One page of OpenAlex sources that are journals and are flagged open access, for a search term. Pages from one. */
export async function fetchOpenAlexSources(term: string, page: number, perPage: number): Promise<JournalPage> {
  const url = `https://api.openalex.org/sources?search=${encodeURIComponent(term)}&filter=${encodeURIComponent('type:journal,is_oa:true')}`
    + `&per-page=${perPage}&page=${page}&mailto=${encodeURIComponent(CONTACT)}`;
  const r = await fetchSourceJson(url, { source: 'OpenAlex', headers: OA_HEADERS, attempts: 3 });
  if (!r.ok) fail('OpenAlex', r);
  if (!Array.isArray(r.json?.results)) bad('OpenAlex', 'no results list');
  const { items, skipped } = openAlexItems(r.json.results);
  return { items, fetched: r.json.results.length, skipped, total: Number.isFinite(r.json?.meta?.count) ? r.json.meta.count : null };
}

/**
 * One page of OpenAlex journals by CURSOR, for the bulk workflow: every open-access-flagged journal, not a search. `cursor` is null for the
 * first page; `next` is null at the end. OpenAlex asks for a contact and a polite pace; the caller supplies the pace.
 */
export async function fetchOpenAlexSourcesCursor(cursor: string | null, perPage = 200): Promise<JournalPage & { next: string | null }> {
  const url = `https://api.openalex.org/sources?filter=${encodeURIComponent('type:journal,is_oa:true')}&per-page=${perPage}&cursor=${encodeURIComponent(cursor || '*')}&mailto=${encodeURIComponent(CONTACT)}`;
  const r = await fetchSourceJson(url, { source: 'OpenAlex', headers: OA_HEADERS, attempts: 3 });
  if (!r.ok) fail('OpenAlex', r);
  if (!Array.isArray(r.json?.results)) bad('OpenAlex', 'no results list');
  const page = openAlexItems(r.json.results);
  return { ...page, total: Number.isFinite(r.json?.meta?.count) ? r.json.meta.count : null, next: typeof r.json?.meta?.next_cursor === 'string' && r.json.results.length ? r.json.meta.next_cursor : null };
}

export type WriteSummary = { checked: number; created: number; /** New and catalogued (MetadataOnly, OA unverified). */ catalogued: number; /** New and held for a person. */ review: number; held: number; enriched: number; skipped: number; failed: number; firstError: string | null };

/**
 * Write what a source found, review-first. Held journals are matched by ISSN or eISSN only — a title is not an identity —
 * and are never changed beyond filling an empty field. New ones are created as NeedsReview.
 */
export async function writeJournalCandidates(source: JournalCandidate['source'], department: string | null, cands: JournalCandidate[], fetchedCount = cands.length, skippedAtFetch = 0): Promise<WriteSummary> {
  // `department` is what the caller was searching for, and a search term is not evidence about a journal: it is ignored. The department comes
  // from the journal's own title and subjects (journalDepartment), or it is left unassigned for review — never guessed.
  void department;
  const out: WriteSummary = { checked: fetchedCount, created: 0, catalogued: 0, review: 0, held: 0, enriched: 0, skipped: skippedAtFetch, failed: 0, firstError: null };
  // Identity, strongest first: the linking ISSN (ISSN-L), then the ISSN and eISSN, then — only when none of those is known here — the same
  // title from the same publisher. A journal is never counted twice because two sources spell its identifiers differently.
  const keysOf = (c: JournalCandidate) => [c.issnL, c.issn, c.eissn].filter(Boolean) as string[];
  const issns = [...new Set(cands.flatMap(keysOf))];
  const heldRows: any[] = issns.length ? await db.journal.findMany({ where: { OR: [{ issn: { in: issns } }, { eissn: { in: issns } }] } }) : [];
  const byIssn = new Map<string, any>();
  for (const j of heldRows) { if (j.issn) byIssn.set(j.issn, j); if (j.eissn) byIssn.set(j.eissn, j); }

  const norm = (t: unknown) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const titleKey = (title: unknown, publisher: unknown) => (norm(title) && norm(publisher) ? `${norm(title)}|${norm(publisher)}` : null);
  const byTitle = new Map<string, any>();
  const unknownByIssn = cands.filter(c => !keysOf(c).some(k => byIssn.has(k)) && titleKey(c.title, c.publisherName));
  if (unknownByIssn.length) {
    const rows: any[] = await db.$queryRawUnsafe(
      `select * from "Journal" where lower(btrim(title)) = any($1::text[])`, [...new Set(unknownByIssn.map(c => String(c.title).toLowerCase().trim()))]);
    for (const j of rows) { const k = titleKey(j.title, j.publisherName); if (k && !byTitle.has(k)) byTitle.set(k, j); }
  }
  const createdNow = new Set<string>();

  for (const c of cands) {
    const keys = keysOf(c);
    const tk = titleKey(c.title, c.publisherName);
    if (keys.some(k => createdNow.has(k)) || (tk && createdNow.has(`t:${tk}`))) { out.held++; continue; }             // the same journal twice on one page
    const existing = keys.map(k => byIssn.get(k)).find(Boolean) ?? (tk ? byTitle.get(tk) : undefined);
    if (existing) {
      out.held++;
      if (existing.rightsBasis !== 'our own') {
        const patch: Record<string, any> = {};
        for (const k of ['eissn', 'publisherName', 'country', 'homepage'] as const) if (!existing[k] && c[k]) patch[k] = c[k];
        if (!existing.domain) { const mapped = canonicalDepartmentName(journalDepartment(c.title, c.subjects)); if (mapped) patch.domain = mapped; }
        const noSubjects = !Array.isArray(existing.subjects) || existing.subjects.length === 0;
        if (noSubjects && c.subjects.length) patch.subjects = c.subjects;
        // The status, licence and rights of a journal we hold are somebody's decision and are never touched from here.
        if (Object.keys(patch).length) {
          try { await db.journal.update({ where: { id: existing.id }, data: patch }); out.enriched++; }
          catch (e: any) { out.failed++; out.firstError ||= String(e?.message || e).slice(0, 300); }
        }
      }
      continue;
    }
    // Catalogue test: a real, identifiable journal in a department its own title and subjects support. Access is a separate matter (see above).
    const mappedDept = canonicalDepartmentName(journalDepartment(c.title, c.subjects));
    const catalogue = !!(c.title && c.issn && c.publisherName && mappedDept);
    try {
      await db.journal.create({
        data: {
          title: c.title, issn: c.issn || undefined, eissn: c.eissn, publisherName: c.publisherName, country: c.country, homepage: c.homepage,
          domain: mappedDept, subjects: c.subjects,
          // Nothing is claimed that has not been checked.
          openAccess: false, licence: null, licenceIsNC: null,
          rightsBasis: `${c.source === 'Crossref Journals' ? 'Crossref' : c.source === 'OpenAlex Sources' ? 'OpenAlex' : 'ROAD'} listing — OA unverified`,
          rightsVerifiedAt: null, rightsVerifiedBy: null,
          status: catalogue ? 'MetadataOnly' : 'NeedsReview',
        },
      });
      catalogue ? out.catalogued++ : out.review++;
      for (const k of keys) createdNow.add(k);
      if (tk) createdNow.add(`t:${tk}`);
      out.created++;
    } catch (e: any) {
      if (e?.code === 'P2002') out.held++;                                       // someone else wrote it first: held, not failed
      else { out.failed++; out.firstError ||= String(e?.message || e).slice(0, 300); }
    }
  }
  return out;
}
