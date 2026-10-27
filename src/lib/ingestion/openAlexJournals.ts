import { ingestionDb } from './db.js';
import { fetchSourceJson } from './sourceHealth.js';
import { SourceError } from './articleSources.js';
import { normaliseIssn, licenceAllowsCommercialUse } from '../ingestionWorker.js';
import { canonicalDepartmentName } from '../departmentRegistry.js';
import { journalDepartment } from './journalDepartment.js';
import type { TurnCtx, TurnOutcome } from './rotation.js';

/**
 * OpenAlex Sources → the Journal catalogue. Historical discovery with its own checkpoint.
 *
 * OpenAlex lists "sources". Only those with type = journal are journals; repositories, conferences, book series and the rest are NOT, and
 * a repository's name never becomes a Journal here (that lane is future work — see docs/openalex-journals-2026-10.md). The query is
 *
 *     /sources?filter=type:journal,is_oa:true,has_issn:true&per-page=100&cursor=…      (≈75,800 sources on 2026-10-26)
 *
 * walked by CURSOR from `*`, 100 a page, the position saved after each page is written. A page that is entirely duplicates still moves the
 * position on. Reaching the end records a completed BASELINE that is never reset; later passes are a separate incremental walk, because
 * OpenAlex does not allow a filter or sort on updated/created date for sources on the free plan (it answers "Plan upgrade required").
 *
 * WHAT A CANDIDATE IS WORTH (tier), and what is written for it:
 *   A  is_in_doaj        Strong. If DOAJ confirms it by ISSN, it is written by the DOAJ rule (Accepted only when every declared licence allows
 *                        commercial use, otherwise MetadataOnly). If DOAJ cannot confirm it, it is treated as tier B.
 *   B  is_oa, not DOAJ   OpenAlex's flag is not a licence. The existing OpenAlex rule applies unchanged: a real, identifiable journal in a
 *                        department its own evidence supports is catalogued MetadataOnly ("OA unverified"); anything less waits as NeedsReview.
 *   C  not open access   Never requested (the filter excludes them) and never written if one arrives.
 * A journal already held (matched on ISSN-L, then every other ISSN, then — cautiously — title + publisher) is NEVER overwritten: only empty
 * descriptive fields are filled, status/licence/access are untouched, and a disagreement is reported as a conflict and changes nothing.
 */

// ── The query ───────────────────────────────────────────────────────────────

export const OA_FILTER = 'type:journal,is_oa:true,has_issn:true';
export const PAGE_SIZE = 100;
const OA_SELECT = 'id,display_name,type,issn_l,issn,host_organization_name,country_code,homepage_url,is_oa,is_in_doaj,works_count,oa_works_count,first_publication_year,last_publication_year,topics,updated_date';
const CONTACT = process.env.OPENALEX_CONTACT || 'info@celnet.in';
const HEADERS = { 'User-Agent': `STM Digital Library (mailto:${CONTACT})` };
const STATE_KEY = 'ingestion.openalex-journals.v1';

export type Tier = 'A' | 'B' | 'C';
export type OaCandidate = {
  openAlexId: string; title: string; issnL: string | null; issns: string[];
  publisherName: string | null; country: string | null; homepage: string | null;
  isOa: boolean; isInDoaj: boolean; worksCount: number | null; oaWorksCount: number | null;
  firstYear: number | null; lastYear: number | null; subjects: string[]; updatedDate: string | null;
  tier: Tier;
};
export type PageSkips = { notJournal: number; notOa: number; noIssn: number; noTitle: number };
export type SourcePage = { candidates: OaCandidate[]; fetched: number; skips: PageSkips; total: number | null; next: string | null };

const noSkips = (): PageSkips => ({ notJournal: 0, notOa: 0, noIssn: 0, noTitle: 0 });
const sumSkips = (s: PageSkips) => s.notJournal + s.notOa + s.noIssn + s.noTitle;
export const tierOf = (c: { isOa: boolean; isInDoaj: boolean }): Tier => (c.isInDoaj ? 'A' : c.isOa ? 'B' : 'C');

/** Read a page of `results` into candidates, counting — not hiding — what cannot be used. Pure. */
export function parseSources(results: any[]): { candidates: OaCandidate[]; skips: PageSkips } {
  const candidates: OaCandidate[] = []; const skips = noSkips();
  for (const it of results) {
    if (it?.type && it.type !== 'journal') { skips.notJournal++; continue; }                        // a repository, conference or book series is not a journal
    const title = String(it?.display_name || '').trim();
    if (!title) { skips.noTitle++; continue; }
    const issnL = normaliseIssn(it.issn_l);
    const issns = [...new Set([issnL, ...(Array.isArray(it.issn) ? it.issn : []).map((x: string) => normaliseIssn(x))].filter(Boolean) as string[])];
    if (!issns.length) { skips.noIssn++; continue; }
    const isOa = it.is_oa === true; const isInDoaj = it.is_in_doaj === true;
    if (!isOa && !isInDoaj) { skips.notOa++; continue; }
    const topics: any[] = Array.isArray(it.topics) ? it.topics : [];
    candidates.push({
      openAlexId: String(it.id || ''), title, issnL, issns,
      publisherName: it.host_organization_name ? String(it.host_organization_name) : null,
      country: it.country_code ? String(it.country_code) : null, homepage: it.homepage_url ? String(it.homepage_url) : null,
      isOa, isInDoaj, worksCount: Number.isFinite(it.works_count) ? it.works_count : null, oaWorksCount: Number.isFinite(it.oa_works_count) ? it.oa_works_count : null,
      firstYear: Number.isInteger(it.first_publication_year) ? it.first_publication_year : null, lastYear: Number.isInteger(it.last_publication_year) ? it.last_publication_year : null,
      // Evidence for the department classifier, nothing more: the same five topic names the existing OpenAlex reader gave it.
      subjects: [...new Set(topics.slice(0, 5).map(t => String(t?.display_name || '').trim()).filter(Boolean))],
      updatedDate: it.updated_date ? String(it.updated_date) : null,
      tier: tierOf({ isOa, isInDoaj }),
    });
  }
  return { candidates, skips };
}

type Fetcher = typeof fetchSourceJson;
function raise(r: any): never {
  // Retry-After, as the source breaker read it, rides on the error so the walk can wait exactly that long.
  throw Object.assign(new SourceError('OpenAlex', r.error || 'OpenAlex did not answer', r.paused || r.status === 429 ? 'rate_limited' : 'unavailable', r.status ?? null), { retryAt: r.retryAt ?? null });
}

/** One page by cursor (`null` = the first). The key, if there is one, comes from OPENALEX_API_KEY and goes nowhere but the request. */
export async function fetchJournalSourcesPage(cursor: string | null, perPage = PAGE_SIZE, fetcher: Fetcher = fetchSourceJson): Promise<SourcePage> {
  const key = process.env.OPENALEX_API_KEY;
  const url = `https://api.openalex.org/sources?filter=${OA_FILTER}&select=${OA_SELECT}&per-page=${perPage}&cursor=${encodeURIComponent(cursor || '*')}`
    + `&mailto=${encodeURIComponent(CONTACT)}${key ? `&api_key=${encodeURIComponent(key)}` : ''}`;
  const r: any = await fetcher(url, { source: 'OpenAlex', headers: HEADERS, attempts: 3 });
  if (!r.ok) raise(r);
  if (!Array.isArray(r.json?.results)) throw new SourceError('OpenAlex', 'OpenAlex sent a response in a shape we do not recognise (no results list)', 'invalid');
  const { candidates, skips } = parseSources(r.json.results);
  const next = typeof r.json?.meta?.next_cursor === 'string' && r.json.results.length ? r.json.meta.next_cursor : null;
  return { candidates, fetched: r.json.results.length, skips, total: Number.isFinite(r.json?.meta?.count) ? r.json.meta.count : null, next };
}

/**
 * Test-only reader: the same query by BASIC page number (`page=N`, which OpenAlex allows without a key up to the 10,000th result). It exists so a bounded
 * dry run can look at the first few thousand sources with no key. The historical walk never uses it — it cannot reach the other 65,000.
 */
export async function fetchJournalSourcesBasicPage(page: number, perPage = PAGE_SIZE, fetcher: Fetcher = fetchSourceJson): Promise<SourcePage> {
  if (page * perPage > 10_000) throw new Error('basic paging stops at the 10,000th result');
  const key = process.env.OPENALEX_API_KEY;
  const url = `https://api.openalex.org/sources?filter=${OA_FILTER}&select=${OA_SELECT}&per-page=${perPage}&page=${page}&mailto=${encodeURIComponent(CONTACT)}${key ? `&api_key=${encodeURIComponent(key)}` : ''}`;
  const r: any = await fetcher(url, { source: 'OpenAlex', headers: HEADERS, attempts: 3 });
  if (!r.ok) raise(r);
  if (!Array.isArray(r.json?.results)) throw new SourceError('OpenAlex', 'OpenAlex sent a response in a shape we do not recognise (no results list)', 'invalid');
  const { candidates, skips } = parseSources(r.json.results);
  return { candidates, fetched: r.json.results.length, skips, total: Number.isFinite(r.json?.meta?.count) ? r.json.meta.count : null, next: r.json.results.length >= perPage ? String(page + 1) : null };
}

/** OpenAlex pages past the first only for a caller with a (free) API key. Without one the historical walk does not start, and makes no request. */
export const apiKeyConfigured = () => !!process.env.OPENALEX_API_KEY;

// ── DOAJ confirmation of a tier-A candidate ─────────────────────────────────

export type DoajVerdict = { found: boolean; status?: 'Accepted' | 'MetadataOnly'; licence?: string | null; licenceIsNC?: boolean; subjects?: string[]; publisherName?: string | null; country?: string | null; homepage?: string | null };
export type Verifier = (issns: string[]) => Promise<DoajVerdict>;

/**
 * Ask DOAJ about one journal by ISSN and apply the rule the DOAJ import applies: full text only when EVERY declared licence allows commercial
 * use and none is flagged non-commercial. Anything uncertain (DOAJ down, not found) is `found: false` — never a guess.
 */
export const verifyWithDoaj: Verifier = async (issns) => {
  for (const issn of issns) {
    const r: any = await fetchSourceJson(`https://doaj.org/api/search/journals/${encodeURIComponent(`issn:${issn}`)}?pageSize=1`, { source: 'DOAJ', headers: HEADERS, attempts: 2 }).catch(() => null);
    const b = r?.ok ? r.json?.results?.[0]?.bibjson : null;
    if (!b) continue;
    const lics: any[] = Array.isArray(b.license) ? b.license : [];
    const ok = lics.length > 0 && lics.every(l => l?.NC !== true && licenceAllowsCommercialUse(l?.type, l?.NC));
    return {
      found: true, status: ok ? 'Accepted' : 'MetadataOnly', licence: lics.map(l => l?.type).filter(Boolean).join(', ') || null, licenceIsNC: !ok,
      subjects: (b.subject || []).map((x: any) => x?.term).filter(Boolean), publisherName: b.publisher?.name || null, country: b.publisher?.country || null,
      homepage: (b.link || []).find((l: any) => l?.type === 'homepage')?.url || null,
    };
  }
  return { found: false };
};

// ── Planning: dedupe, tier, department — no writes ──────────────────────────

const norm = (t: unknown) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const titleKey = (title: unknown, publisher: unknown) => (norm(title) && norm(publisher) ? `${norm(title)}|${norm(publisher)}` : null);

/** Do two journal titles plausibly name the same journal? One contains the other, or at least half their words are shared. */
export function titlesAgree(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return true;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  const shared = [...A].filter(w => B.has(w)).length;
  return shared / Math.max(A.size, B.size) >= 0.5;
}

export type NewRow = Record<string, any>;
export type Decision =
  | { kind: 'duplicate'; cand: OaCandidate; existingId: string; by: 'issn' | 'title'; enrich: Record<string, any>; conflict: string | null }
  | { kind: 'new'; cand: OaCandidate; department: string | null; outcome: 'accepted' | 'metadata-only' | 'review'; doajConfirmed: boolean; row: NewRow }
  | { kind: 'skip'; cand: OaCandidate; reason: 'not-oa' | 'no-issn' | 'repeat-on-page' };

// `startYear` is deliberately never written from here: OpenAlex's first_publication_year is the first year it HOLDS works for a journal, not
// the year the journal began, and that field drives "new journals in the last N years".
const rowBase = (c: OaCandidate, department: string | null) => {
  const issn = c.issnL || c.issns[0];
  return {
    title: c.title, issn, eissn: c.issns.find(x => x !== issn) || null, publisherName: c.publisherName, country: c.country, homepage: c.homepage,
    domain: department, subjects: c.subjects,
  };
};

/**
 * Decide what each candidate is. Identity, strongest first: ISSN-L, any other ISSN, then — only when none is held — the same title and
 * publisher. (OpenAlex's own source id is not stored anywhere on a Journal, so it cannot be matched on; no column is added for it.)
 */
export async function planPage(cands: OaCandidate[], opts: { db?: any; verify?: Verifier } = {}): Promise<Decision[]> {
  const db = opts.db ?? ingestionDb;
  const allIssns = [...new Set(cands.flatMap(c => c.issns))];
  const heldRows: any[] = allIssns.length ? await db.journal.findMany({ where: { OR: [{ issn: { in: allIssns } }, { eissn: { in: allIssns } }] } }) : [];
  const holders = new Map<string, any[]>();                                   // issn → the journals holding it (normally one)
  for (const j of heldRows) for (const k of [j.issn, j.eissn].filter(Boolean)) holders.set(k, [...(holders.get(k) || []), j]);

  const unmatched = cands.filter(c => !c.issns.some(k => holders.has(k)) && titleKey(c.title, c.publisherName));
  const byTitle = new Map<string, any>();
  if (unmatched.length) {
    const rows: any[] = await db.$queryRawUnsafe(`select * from "Journal" where lower(btrim(title)) = any($1::text[])`, [...new Set(unmatched.map(c => c.title.toLowerCase().trim()))]);
    for (const j of rows) { const k = titleKey(j.title, j.publisherName); if (k && !byTitle.has(k)) byTitle.set(k, j); }
  }

  const out: Decision[] = []; const seen = new Set<string>();
  for (const c of cands) {
    if (c.tier === 'C') { out.push({ kind: 'skip', cand: c, reason: 'not-oa' }); continue; }
    if (!c.issns.length) { out.push({ kind: 'skip', cand: c, reason: 'no-issn' }); continue; }
    if (c.issns.some(k => seen.has(k))) { out.push({ kind: 'skip', cand: c, reason: 'repeat-on-page' }); continue; }
    c.issns.forEach(k => seen.add(k));

    const hits = [...new Map(c.issns.flatMap(k => holders.get(k) || []).map(j => [j.id, j])).values()];
    const tk = titleKey(c.title, c.publisherName);
    if (hits.length) {
      const j = hits[0];
      let conflict: string | null = null;
      if (hits.length > 1) conflict = 'its ISSNs match two different journals we hold';
      else if (!titlesAgree(c.title, j.title)) conflict = `held as “${j.title}”, OpenAlex has “${c.title}”`;
      const enrich: Record<string, any> = {};
      if (!conflict && j.rightsBasis !== 'our own') {
        const claimed = (x: string) => (holders.get(x) || []).some(h => h.id !== j.id);
        const dept = canonicalDepartmentName(journalDepartment(c.title, c.subjects));
        const otherIssn = c.issns.find(x => x !== j.issn && !claimed(x));
        if (!j.eissn && otherIssn) enrich.eissn = otherIssn;
        if (!j.publisherName && c.publisherName) enrich.publisherName = c.publisherName;
        if (!j.country && c.country) enrich.country = c.country;
        if (!j.homepage && c.homepage) enrich.homepage = c.homepage;
        if ((!Array.isArray(j.subjects) || j.subjects.length === 0) && c.subjects.length) enrich.subjects = c.subjects;
        if (!j.domain && dept) enrich.domain = dept;
      }
      out.push({ kind: 'duplicate', cand: c, existingId: j.id, by: 'issn', enrich, conflict });
      continue;
    }
    const t = tk ? byTitle.get(tk) : undefined;
    if (t) { out.push({ kind: 'duplicate', cand: c, existingId: t.id, by: 'title', enrich: {}, conflict: null }); continue; }   // a title is not an identity: held, never written to

    // New. Department from the journal's own evidence, or none.
    let verdict: DoajVerdict = { found: false };
    if (c.tier === 'A' && opts.verify) verdict = await opts.verify(c.issns).catch(() => ({ found: false }));
    const subjects = verdict.found && verdict.subjects?.length ? [...new Set([...verdict.subjects, ...c.subjects])] : c.subjects;
    const department = canonicalDepartmentName(journalDepartment(c.title, subjects));
    if (verdict.found && verdict.status) {
      out.push({
        kind: 'new', cand: c, department, doajConfirmed: true, outcome: verdict.status === 'Accepted' ? 'accepted' : 'metadata-only',
        row: {
          ...rowBase(c, department), publisherName: c.publisherName || verdict.publisherName || null, country: c.country || verdict.country || null, homepage: c.homepage || verdict.homepage || null,
          subjects, openAccess: true, licence: verdict.licence ?? null, licenceIsNC: verdict.licenceIsNC ?? true, rightsBasis: 'DOAJ declaration',
          rightsVerifiedAt: new Date(), rightsVerifiedBy: 'ingestion', status: verdict.status,
        },
      });
      continue;
    }
    const catalogue = !!(c.title && c.issns[0] && c.publisherName && department);
    out.push({
      kind: 'new', cand: c, department, doajConfirmed: false, outcome: catalogue ? 'metadata-only' : 'review',
      row: {
        ...rowBase(c, department), openAccess: false, licence: null, licenceIsNC: null,
        rightsBasis: 'OpenAlex listing — OA unverified', rightsVerifiedAt: null, rightsVerifiedBy: null, status: catalogue ? 'MetadataOnly' : 'NeedsReview',
      },
    });
  }
  return out;
}

// ── Summarising and applying a plan ─────────────────────────────────────────

export type PageCounters = {
  checked: number; existing: number; existingByTitle: number;
  /** New tier-A (DOAJ-listed) journals: strong candidates. */
  newStrong: number; newStrongConfirmed: number;
  /** New tier-B journals (OpenAlex says OA, DOAJ does not list it) and any tier-A that DOAJ could not confirm: for review / OA-unverified. */
  newReview: number;
  createdAccepted: number; createdMetadataOnly: number; createdNeedsReview: number;
  enriched: number; conflicts: number; unassigned: number; skipped: number; failed: number;
  skippedReasons: PageSkips & { repeatOnPage: number };
  byDepartment: Record<string, number>;
  conflictSamples: string[]; firstError: string | null;
};
export const zeroCounters = (): PageCounters => ({
  checked: 0, existing: 0, existingByTitle: 0, newStrong: 0, newStrongConfirmed: 0, newReview: 0, createdAccepted: 0, createdMetadataOnly: 0, createdNeedsReview: 0,
  enriched: 0, conflicts: 0, unassigned: 0, skipped: 0, failed: 0, skippedReasons: { ...noSkips(), repeatOnPage: 0 }, byDepartment: {}, conflictSamples: [], firstError: null,
});
export function addCounters(into: PageCounters, c: PageCounters) {
  for (const k of ['checked', 'existing', 'existingByTitle', 'newStrong', 'newStrongConfirmed', 'newReview', 'createdAccepted', 'createdMetadataOnly', 'createdNeedsReview', 'enriched', 'conflicts', 'unassigned', 'skipped', 'failed'] as const) into[k] += c[k];
  for (const k of Object.keys(c.skippedReasons) as (keyof PageCounters['skippedReasons'])[]) into.skippedReasons[k] += c.skippedReasons[k];
  for (const [d, n] of Object.entries(c.byDepartment)) into.byDepartment[d] = (into.byDepartment[d] || 0) + n;
  for (const s of c.conflictSamples) if (into.conflictSamples.length < 25) into.conflictSamples.push(s);
  into.firstError ||= c.firstError;
}

/** What a plan amounts to, with no writes. `fetched`/`skips` are what the page held before candidates were read out of it. */
export function summarise(decisions: Decision[], page: { fetched: number; skips: PageSkips }): PageCounters {
  const c = zeroCounters();
  c.checked = page.fetched;
  for (const k of Object.keys(page.skips) as (keyof PageSkips)[]) { c.skippedReasons[k] += page.skips[k]; }
  c.skipped = sumSkips(page.skips);
  for (const d of decisions) {
    if (d.kind === 'skip') { c.skipped++; if (d.reason === 'not-oa') c.skippedReasons.notOa++; else if (d.reason === 'no-issn') c.skippedReasons.noIssn++; else c.skippedReasons.repeatOnPage++; continue; }
    if (d.kind === 'duplicate') {
      c.existing++; if (d.by === 'title') c.existingByTitle++;
      if (d.conflict) { c.conflicts++; if (c.conflictSamples.length < 25) c.conflictSamples.push(`${d.cand.title} (${d.cand.issnL || d.cand.issns[0]}): ${d.conflict}`); }
      else if (Object.keys(d.enrich).length) c.enriched++;
      continue;
    }
    if (d.cand.tier === 'A') { c.newStrong++; if (d.doajConfirmed) c.newStrongConfirmed++; }
    if (!(d.cand.tier === 'A' && d.doajConfirmed)) c.newReview++;
    if (!d.department) c.unassigned++;
    c.byDepartment[d.department || '(unassigned)'] = (c.byDepartment[d.department || '(unassigned)'] || 0) + 1;
    if (d.outcome === 'accepted') c.createdAccepted++; else if (d.outcome === 'metadata-only') c.createdMetadataOnly++; else c.createdNeedsReview++;
  }
  return c;
}

/** Write a plan: new journals are created, held ones have only EMPTY fields filled. Never an update to status, licence or access. */
export async function applyPlan(decisions: Decision[], page: { fetched: number; skips: PageSkips }, db: any = ingestionDb): Promise<PageCounters> {
  const c = summarise(decisions, page);
  // The counts above describe the plan; writes that fail or lose a race are taken back out of them.
  const undo = (d: Decision & { kind: 'new' }, why: 'failed' | 'held') => {
    if (d.cand.tier === 'A') { c.newStrong--; if (d.doajConfirmed) c.newStrongConfirmed--; }
    if (!(d.cand.tier === 'A' && d.doajConfirmed)) c.newReview--;
    if (!d.department) c.unassigned--;
    const k = d.department || '(unassigned)'; c.byDepartment[k] = (c.byDepartment[k] || 1) - 1; if (!c.byDepartment[k]) delete c.byDepartment[k];
    if (d.outcome === 'accepted') c.createdAccepted--; else if (d.outcome === 'metadata-only') c.createdMetadataOnly--; else c.createdNeedsReview--;
    why === 'failed' ? c.failed++ : (c.existing++);
  };
  for (const d of decisions) {
    try {
      if (d.kind === 'duplicate') {
        if (!d.conflict && Object.keys(d.enrich).length) await db.journal.update({ where: { id: d.existingId }, data: d.enrich });
      } else if (d.kind === 'new') {
        await db.journal.create({ data: d.row });
      }
    } catch (e: any) {
      if (d.kind === 'new') undo(d, e?.code === 'P2002' ? 'held' : 'failed');
      else { c.enriched--; c.failed++; }
      if (e?.code !== 'P2002') c.firstError ||= String(e?.message || e).slice(0, 300);
    }
  }
  return c;
}

// ── The checkpoint ──────────────────────────────────────────────────────────

type Walk = { cursor: string | null; startedAt: string | null; pages: number; sources: number; completedAt: string | null };
export type OaState = {
  /** The first full walk. Once `completedAt` is set it is never reset by the code; only an administrator may, deliberately. */
  baseline: Walk & { total: number | null };
  /** Later re-walks, started no sooner than `incrementalEveryDays` after the last one finished. They never touch the baseline. */
  incremental: Walk & { runs: number; lastCompletedAt: string | null };
  counters: PageCounters;
  lastRunAt: string | null; lastProductiveAt: string | null;
  lastProductive: { at: string; checked: number; created: number; enriched: number } | null;
  nextEligibleAt: string | null;
  paused: boolean;
  lastError: { at: string; message: string; kind: string } | null;
  /** A cursor OpenAlex refused: the walk stops here and waits for a person rather than starting again from the first page. */
  needsAttention: string | null;
  consecutiveFailures: number;
};
const blankWalk = (): Walk => ({ cursor: null, startedAt: null, pages: 0, sources: 0, completedAt: null });
export const blankState = (): OaState => ({
  baseline: { ...blankWalk(), total: null }, incremental: { ...blankWalk(), runs: 0, lastCompletedAt: null }, counters: zeroCounters(),
  lastRunAt: null, lastProductiveAt: null, lastProductive: null, nextEligibleAt: null, paused: false, lastError: null, needsAttention: null, consecutiveFailures: 0,
});

export async function loadState(db: any = ingestionDb): Promise<OaState> {
  const row = await db.appSetting.findUnique({ where: { key: STATE_KEY } }).catch(() => null);
  const v: any = row?.value;
  if (!v || typeof v !== 'object') return blankState();
  const b = blankState();
  return { ...b, ...v, baseline: { ...b.baseline, ...(v.baseline || {}) }, incremental: { ...b.incremental, ...(v.incremental || {}) }, counters: { ...b.counters, ...(v.counters || {}), skippedReasons: { ...b.counters.skippedReasons, ...(v.counters?.skippedReasons || {}) }, byDepartment: v.counters?.byDepartment || {}, conflictSamples: v.counters?.conflictSamples || [] } };
}
export async function saveState(s: OaState, db: any = ingestionDb): Promise<void> {
  await db.appSetting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value: s as any, updatedBy: 'openalex-journals' }, update: { value: s as any, updatedBy: 'openalex-journals' } });
}
export async function setPaused(paused: boolean, db: any = ingestionDb) { const s = await loadState(db); s.paused = paused; await saveState(s, db); return s; }

export const incrementalEveryDays = () => { const n = Number(process.env.OPENALEX_JOURNALS_INCREMENTAL_DAYS); return Number.isFinite(n) && n >= 1 && n <= 365 ? n : 30; };
/** The engine uses the historical mode only when this is set; until it is approved the provider behaves exactly as before. */
export const historicalEnabled = () => process.env.OPENALEX_JOURNALS_HISTORICAL === '1';
const COOLDOWN_MS = 15 * 60_000;

// ── Running pages ───────────────────────────────────────────────────────────

export type RunOpts = {
  /** The most pages one call may read. */ maxPages?: number;
  /** The most sources one call may read. */ maxSources?: number;
  /** Stop at the first page that added or enriched something (the engine's turn). */ stopOnUseful?: boolean;
  budgetMs?: number; paceMs?: number; now?: Date;
  db?: any; fetchPage?: (cursor: string | null) => Promise<SourcePage>; verify?: Verifier; sleep?: (ms: number) => Promise<void>;
};
export type RunResult = {
  status: 'ran' | 'paused' | 'cooling' | 'monitoring' | 'needs-attention' | 'needs-key' | 'failed' | 'rate-limited';
  walk: 'baseline' | 'incremental' | null; pages: number; counters: PageCounters; completed: boolean; until: string | null; error: string | null; state: OaState;
};

/**
 * Read up to `maxPages` pages from the saved place, write each, and save the new place only after its page is written. Restart-safe: the place
 * is in the database. A 429 or Retry-After stops the run without moving the place and sets a cooldown. Never begins again from the first page
 * because it reached the end: that is recorded as completed, and only the separate incremental walk follows, on its own schedule.
 */
export async function runHistorical(opts: RunOpts = {}): Promise<RunResult> {
  const db = opts.db ?? ingestionDb; const now = () => opts.now ?? new Date();
  const fetchPage = opts.fetchPage ?? ((cur: string | null) => fetchJournalSourcesPage(cur));
  const verify = opts.verify ?? verifyWithDoaj;
  const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const maxPages = opts.maxPages ?? 1, maxSources = opts.maxSources ?? Infinity, budgetMs = opts.budgetMs ?? 25_000, paceMs = opts.paceMs ?? 300;
  const s = await loadState(db);
  const total = zeroCounters();
  const out = (status: RunResult['status'], extra: Partial<RunResult> = {}): RunResult => ({ status, walk: null, pages: 0, counters: total, completed: false, until: null, error: null, state: s, ...extra });

  if (s.needsAttention) return out('needs-attention', { error: s.needsAttention });
  if (s.paused) return out('paused');
  // No key, no request: page 2 would only be refused (HTTP 401), and a refusal must not count against OpenAlex's health, which the article sources share.
  if (!opts.fetchPage && !apiKeyConfigured()) return out('needs-key', { error: 'OpenAlex needs a free API key (OPENALEX_API_KEY) to page through its journal list.' });
  if (s.nextEligibleAt && new Date(s.nextEligibleAt) > now()) return out('cooling', { until: s.nextEligibleAt });

  const baselineDone = !!s.baseline.completedAt;
  let walkName: 'baseline' | 'incremental' = baselineDone ? 'incremental' : 'baseline';
  let walk: Walk = baselineDone ? s.incremental : s.baseline;
  if (baselineDone && !walk.cursor && !walk.startedAt) {
    // Between walks. A new incremental walk is due only a set number of days after the last one finished.
    const last = new Date(s.incremental.lastCompletedAt || s.baseline.completedAt!).getTime();
    const due = new Date(last + incrementalEveryDays() * 86_400_000);
    if (due > now()) return out('monitoring', { until: due.toISOString(), walk: 'incremental' });
    walk.startedAt = now().toISOString();
  }
  if (!walk.startedAt) walk.startedAt = now().toISOString();

  const started = Date.now(); let pages = 0; let completed = false;
  while (pages < maxPages && total.checked < maxSources && Date.now() - started < budgetMs) {
    let page: SourcePage;
    try {
      page = await fetchPage(walk.cursor);
    } catch (e: any) {
      const rate = e instanceof SourceError && (e.status === 429 || e.kind === 'rate_limited');
      const retryAt: Date | null = e?.retryAt ? new Date(e.retryAt) : null;
      s.lastRunAt = now().toISOString();
      s.lastError = { at: now().toISOString(), message: String(e?.message || e).slice(0, 300), kind: rate ? 'rate_limited' : e instanceof SourceError ? e.kind : 'error' };
      if (e instanceof SourceError && e.status === 400) {
        s.needsAttention = `OpenAlex refused the saved cursor (HTTP 400). The walk is stopped where it is; it will not start again from the first page without a person deciding.`;
        await saveState(s, db); return out('needs-attention', { walk: walkName, pages, error: s.needsAttention });
      }
      s.consecutiveFailures++;
      s.nextEligibleAt = (rate ? (retryAt && retryAt > now() ? retryAt : new Date(now().getTime() + COOLDOWN_MS)) : new Date(now().getTime() + Math.min(60, 5 * s.consecutiveFailures) * 60_000)).toISOString();
      await saveState(s, db);
      return out(rate ? 'rate-limited' : 'failed', { walk: walkName, pages, until: s.nextEligibleAt, error: s.lastError.message });
    }
    const decisions = await planPage(page.candidates, { db, verify });
    const c = await applyPlan(decisions, page, db);
    addCounters(total, c); addCounters(s.counters, c);
    pages++; walk.pages++; walk.sources += page.fetched;
    if (walkName === 'baseline' && page.total != null) s.baseline.total = page.total;
    // The place moves only now, after the page it follows has been written — and moves even when every record on the page was a duplicate.
    walk.cursor = page.next;
    s.consecutiveFailures = 0; s.lastError = null; s.nextEligibleAt = null; s.lastRunAt = now().toISOString();
    const created = c.createdAccepted + c.createdMetadataOnly + c.createdNeedsReview;
    if (created + c.enriched > 0) { s.lastProductiveAt = now().toISOString(); s.lastProductive = { at: s.lastProductiveAt, checked: c.checked, created, enriched: c.enriched }; }
    if (!page.next) {
      completed = true; walk.completedAt = now().toISOString();
      if (walkName === 'baseline') { /* the baseline stays as recorded */ }
      else { s.incremental.lastCompletedAt = walk.completedAt; s.incremental.runs++; walk.cursor = null; walk.startedAt = null; walk.pages = 0; walk.sources = 0; walk.completedAt = null; }
      await saveState(s, db);
      break;
    }
    await saveState(s, db);
    if (opts.stopOnUseful && created + c.enriched > 0) break;
    if (pages < maxPages) await sleep(paceMs);
  }
  return out('ran', { walk: walkName, pages, completed });
}

// ── What the screen shows ───────────────────────────────────────────────────

export type HistoricalStatus = {
  enabled: boolean; paused: boolean; apiKey: boolean;
  /** historical | complete (incremental monitoring active) | incremental-running | paused | cooling | needs-attention */
  state: 'not-started' | 'historical' | 'complete' | 'incremental-running' | 'paused' | 'cooling' | 'needs-attention' | 'needs-key';
  headline: string;
  progress: { checked: number; total: number | null; percent: number | null };
  page: number; cursorTail: string | null;
  counters: { checked: number; new: number; duplicates: number; enriched: number; conflicts: number; review: number; strong: number; unassigned: number };
  lastProductiveAt: string | null; lastProductive: OaState['lastProductive']; nextEligibleAt: string | null; nextWalkDue: string | null;
  baselineCompletedAt: string | null; incrementalRuns: number; lastError: OaState['lastError']; needsAttention: string | null;
  conflictSamples: string[];
};
export async function historicalStatus(db: any = ingestionDb, now = new Date()): Promise<HistoricalStatus> {
  const s = await loadState(db);
  const done = !!s.baseline.completedAt;
  const walk = done ? s.incremental : s.baseline;
  const checked = walk.sources;
  const total = s.baseline.total;
  const cooling = !!s.nextEligibleAt && new Date(s.nextEligibleAt) > now;
  const due = done && !s.incremental.startedAt ? new Date(new Date(s.incremental.lastCompletedAt || s.baseline.completedAt!).getTime() + incrementalEveryDays() * 86_400_000) : null;
  const state: HistoricalStatus['state'] = s.needsAttention ? 'needs-attention' : s.paused ? 'paused' : cooling ? 'cooling'
    : !apiKeyConfigured() && !(done && !s.incremental.startedAt) ? 'needs-key'
    : done ? (s.incremental.startedAt ? 'incremental-running' : 'complete') : walk.startedAt ? 'historical' : 'not-started';
  const headline = state === 'complete' ? 'Historical journal discovery complete — incremental monitoring active'
    : state === 'incremental-running' ? 'Incremental re-check in progress (baseline complete)'
    : state === 'historical' ? 'Historical journal discovery in progress'
    : state === 'not-started' ? 'Historical journal discovery has not started'
    : state === 'paused' ? 'Historical journal discovery paused'
    : state === 'needs-key' ? 'Historical journal discovery waiting for an OpenAlex API key (OPENALEX_API_KEY)'
    : state === 'needs-attention' ? 'Historical journal discovery stopped — needs a person' : 'Historical journal discovery cooling down';
  const c = s.counters;
  return {
    enabled: historicalEnabled(), paused: s.paused, apiKey: apiKeyConfigured(), state, headline,
    progress: { checked, total, percent: !done && total ? Math.min(100, Math.round((checked / total) * 1000) / 10) : done ? 100 : null },
    page: walk.pages, cursorTail: walk.cursor ? walk.cursor.slice(-12) : null,
    counters: { checked: c.checked, new: c.createdAccepted + c.createdMetadataOnly + c.createdNeedsReview, duplicates: c.existing, enriched: c.enriched, conflicts: c.conflicts, review: c.newReview, strong: c.newStrong, unassigned: c.unassigned },
    lastProductiveAt: s.lastProductiveAt, lastProductive: s.lastProductive, nextEligibleAt: s.nextEligibleAt, nextWalkDue: due ? due.toISOString() : null,
    baselineCompletedAt: s.baseline.completedAt, incrementalRuns: s.incremental.runs, lastError: s.lastError, needsAttention: s.needsAttention, conflictSamples: c.conflictSamples,
  };
}

// ── The engine's turn (used only when OPENALEX_JOURNALS_HISTORICAL=1) ───────

/**
 * One turn of the rotation: read pages until one adds something, up to ten pages (1,000 sources) or 25 seconds, so a run of duplicate-only
 * pages is walked past quickly instead of being counted as three empty turns and a six-hour rest.
 */
export async function openAlexJournalsTurn(ctx: TurnCtx): Promise<TurnOutcome> {
  void ctx;
  const r = await runHistorical({ maxPages: 10, stopOnUseful: true, budgetMs: 25_000 });
  if (r.status === 'needs-key') return { kind: 'nothing-due', note: 'OpenAlex journal discovery needs an API key (OPENALEX_API_KEY); no request was made' };
  if (r.status === 'rate-limited' || r.status === 'failed') return { kind: 'request-failed', error: r.error || 'OpenAlex did not answer', rateLimited: r.status === 'rate-limited' };
  if (r.status === 'paused' || r.status === 'cooling' || r.status === 'needs-attention') return { kind: 'nothing-due', note: r.status === 'paused' ? 'OpenAlex journal discovery is paused' : r.status === 'needs-attention' ? (r.error || 'needs a person') : 'OpenAlex journal discovery is cooling down', until: r.until ? new Date(r.until) : null };
  if (r.status === 'monitoring') return { kind: 'nothing-due', note: 'Historical journal discovery complete — incremental monitoring active', until: r.until ? new Date(r.until) : null };
  const c = r.counters;
  const created = c.createdAccepted + c.createdMetadataOnly + c.createdNeedsReview;
  return {
    kind: 'ran', checked: c.checked, added: c.createdAccepted + c.createdMetadataOnly, held: c.existing, enriched: c.enriched, sentToReview: c.createdNeedsReview,
    skipped: c.skipped, recordFailures: c.failed, useful: created + c.enriched, more: !r.completed, error: c.firstError, duplicateConflicting: c.conflicts,
    note: `OpenAlex journals, ${r.pages} page${r.pages === 1 ? '' : 's'} (${r.walk}): ${created} new (${c.newStrong} DOAJ-listed, ${c.newReview} OA-unverified), ${c.existing} already held, ${c.conflicts} conflicts${r.completed ? ' · sweep complete' : ''}`,
    columns: { journalsSeen: c.checked, journalsAccepted: c.createdAccepted, journalsRefused: c.createdMetadataOnly },
    ledger: { journalsSeen: c.checked, journalsAccepted: c.createdAccepted },
  };
}
