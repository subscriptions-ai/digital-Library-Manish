/**
 * Continuous, journal-first ingestion.
 *
 * Switched on once and left running: a timer wakes it, it does one small slice
 * of work, records where it got to, and goes back to sleep. Nothing is held in
 * memory between passes, so a restart costs at most one slice.
 *
 * The order matters. Journals are discovered and their licence decided *before*
 * any article is fetched, because DOAJ declares the licence at title level with
 * an explicit non-commercial flag. Deciding once per journal rather than once
 * per article is both safer and enormously cheaper.
 *
 * There is no queue table. The journals are the queue: each pass takes whichever
 * accepted journal was refreshed longest ago.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const p = prisma as any;

const CONTACT = process.env.OPENALEX_CONTACT || 'info@celnet.in';
const UA = { 'User-Agent': `STM Digital Library (mailto:${CONTACT})` };

/** Licences that permit commercial use. Everything else is catalogued, not served. */
const COMMERCIAL_OK = /^(cc[\s-]?by([\s-]?(sa|nd))?|cc0|public[\s-]?domain)$/i;

export function licenceAllowsCommercialUse(raw?: string | null, ncFlag?: boolean | null): boolean {
  if (ncFlag === true) return false;
  const t = String(raw || '').trim();
  if (!t) return false;                     // undeclared is treated as not permitted
  if (/nc/i.test(t.replace(/[^a-z]/gi, ''))) return false;
  return COMMERCIAL_OK.test(t.replace(/\s+/g, ' '));
}

/**
 * What to ask DOAJ for, per department.
 *
 * Searching DOAJ with our own department label goes wrong in both directions.
 * "Computer / IT" returns 12 journals because the slash breaks the query, when
 * "information technology" alone returns 779. "Science" returns 5,018 because it
 * matches almost everything. These are the terms that actually find the right
 * journals; several departments need more than one, and the results are merged.
 */
const DEPARTMENT_TERMS: Record<string, string[]> = {
  'Computer / IT':                               ['computer science', 'information technology', 'informatics'],
  'Civil / Construction Engineering':            ['civil engineering', 'construction'],
  'Electronics & Telecommunication Engineering': ['electronics', 'telecommunication'],
  'Ayurveda':                                    ['ayurveda', 'traditional medicine', 'pharmacognosy', 'herbal medicine'],
  'Applied Mechanics':                           ['applied mechanics', 'mechanics'],
  'Material Science':                            ['materials science', 'materials'],
  'Nano Technology':                             ['nanotechnology', 'nanoscience'],
  'Bio Technology':                              ['biotechnology'],
  'Education and Social Sciences':               ['education', 'social sciences'],
  // Deliberately narrowed: as a bare term "science" matches almost every journal
  // in DOAJ and would swamp every other department.
  'Science':                                     ['natural sciences', 'general science'],
  'Applied Sciences':                            ['applied sciences'],
  'Arts':                                        ['arts', 'humanities'],
  'Commerce':                                    ['commerce', 'business'],
  'Multidisciplinary':                           ['multidisciplinary'],
};

/** The terms to search for a department — its own name unless mapped above. */
export function searchTermsFor(department: string): string[] {
  return DEPARTMENT_TERMS[department] || [department];
}

/**
 * An ISSN is eight characters, NNNN-NNNC. In practice ours arrive with spaces
 * around the hyphen, with an en-dash instead of a hyphen, or with none at all —
 * three spellings of the same identifier, which silently breaks every lookup,
 * every deduplication and every attempt to match an incoming journal to one we
 * already hold. Everything that reads or writes an ISSN goes through here.
 */
export function normaliseIssn(raw?: string | null): string | null {
  if (!raw) return null;
  const t = String(raw).replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, '').toUpperCase();
  const m = t.match(/^(\d{4})-?(\d{3}[\dX])$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function getState() {
  return p.ingestionState.upsert({
    where: { id: 'singleton' }, update: {}, create: { id: 'singleton' },
  });
}

/** Pull one page of journals for a department and decide each one's licence. */
async function discoverJournals(department: string, state: any) {
  const records: any[] = [];
  for (const term of searchTermsFor(department)) {
    const d = await getJson(
      `https://doaj.org/api/search/journals/${encodeURIComponent(term)}?pageSize=100`);
    if (d?.results?.length) records.push(...d.results);
    await sleep(400);                       // stay well inside DOAJ's limits
  }
  if (!records.length) return { seen: 0, accepted: 0, rejected: 0 };

  let seen = 0, accepted = 0, rejected = 0;
  for (const rec of records) {
    const b = rec.bibjson || {};
    const title = b.title;
    if (!title) continue;
    seen++;

    const lic = (b.license || [])[0];
    const ok = licenceAllowsCommercialUse(lic?.type, lic?.NC);
    // DOAJ exposes these as pissn/eissn, not inside an identifier array.
    const issn = normaliseIssn(b.pissn) || normaliseIssn(b.eissn);

    const data = {
      title,
      issn: issn || undefined,
      eissn: normaliseIssn(b.eissn),
      publisherName: b.publisher?.name || null,
      country: b.publisher?.country || null,
      domain: department,
      subjects: (b.subject || []).map((s: any) => s.term).filter(Boolean),
      homepage: (b.link || []).find((l: any) => l.type === 'homepage')?.url || null,
      licence: lic?.type || null,
      licenceIsNC: lic?.NC === true || !ok,
      rightsBasis: 'DOAJ declaration',
      rightsVerifiedAt: new Date(),
      rightsVerifiedBy: 'ingestion',
      // Rejected titles are still catalogued — they simply never serve full text.
      status: ok ? 'Accepted' : 'MetadataOnly',
    };

    const existing = issn
      ? await p.journal.findFirst({ where: { issn } })
      : await p.journal.findFirst({ where: { title } });

    if (existing) {
      // Never downgrade a journal we own or have an agreement for.
      if (existing.rightsBasis === 'our own') continue;
      await p.journal.update({ where: { id: existing.id }, data });
    } else {
      await p.journal.create({ data });
    }
    ok ? accepted++ : rejected++;
  }
  return { seen, accepted, rejected };
}

/** Fetch one slice of articles for the journal refreshed longest ago. */
async function fetchArticlesForOneJournal(state: any) {
  // Only journals we discovered externally. Our own titles are filled from our
  // own records — pulling their articles back in from OpenAlex would mix
  // ingested rows into a journal whose rights basis says "our own".
  const journal = await p.journal.findFirst({
    where: { status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration' },
    orderBy: [{ lastIngestedAt: { sort: 'asc', nulls: 'first' } }],
  });
  if (!journal) return { journal: null, added: 0, skipped: 0 };

  const fromYear = new Date().getFullYear() - (state.yearsBack - 1);
  const url = `https://api.openalex.org/works`
    + `?filter=primary_location.source.issn:${encodeURIComponent(journal.issn)}`
    + `,from_publication_date:${fromYear}-01-01,open_access.is_oa:true`
    + `&per-page=${Math.min(state.batchSize, 200)}&sort=publication_date:desc`;

  const d = await getJson(url);
  await p.journal.update({ where: { id: journal.id }, data: { lastIngestedAt: new Date() } });
  if (!d?.results?.length) return { journal: journal.title, added: 0, skipped: 0 };

  let added = 0, skipped = 0;
  for (const w of d.results) {
    const doi = (w.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || null;
    const pdf = w.best_oa_location?.pdf_url || w.open_access?.oa_url || null;
    const lic = w.best_oa_location?.license || null;

    // The journal already passed the gate; an article may still carry a stricter
    // licence of its own, so it is checked again rather than assumed.
    const ok = lic ? licenceAllowsCommercialUse(lic) : !journal.licenceIsNC;

    const fingerprint = doi
      ? `doi:${doi.toLowerCase()}`
      : `t:${String(w.title || '').toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 180)}|${w.publication_year}`;

    if (await p.article.findFirst({ where: { fingerprint }, select: { id: true } })) { skipped++; continue; }

    await p.article.create({
      data: {
        title: w.title || w.display_name || 'Untitled',
        authors: (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean).join(', '),
        abstract: null,                              // see the abstract decision — not stored for ingested work
        doi,
        pdfUrl: pdf,
        journalId: journal.id,
        journalName: journal.title,
        journalIssn: journal.issn,
        publisherName: journal.publisherName,
        volume: w.biblio?.volume || null,
        issue: w.biblio?.issue || null,
        year: w.publication_year || null,
        originalDate: w.publication_date ? new Date(w.publication_date) : null,
        originalUrl: w.primary_location?.landing_page_url || (doi ? `https://doi.org/${doi}` : null),
        domain: journal.domain,
        subject: (w.concepts || [])[0]?.display_name || null,
        licence: lic,
        licenceIsNC: !ok,
        rightsHolder: journal.publisherName,
        accessStatus: ok && pdf ? 'ViewableHere' : 'LinkOnly',
        parentKind: 'Journal',
        parentId: journal.id,
        contentType: 'Periodicals',
        status: 'Published',
        source: 'OpenAlex',
        ownershipSource: 'Ingested',
        fingerprint,
      },
    }).then(() => { added++; }).catch(() => { skipped++; });
  }

  // Refresh this journal's coverage so its page never computes counts live.
  const agg = await p.$queryRawUnsafe(
    `select count(*)::int a, count(distinct volume)::int v, count(distinct issue)::int i,
            min(year) f, max(year) l from "Article" where "journalId" = $1`, journal.id);
  const s = agg[0];
  await p.journal.update({
    where: { id: journal.id },
    data: { articleCount: s.a, volumeCount: s.v, issueCount: s.i, firstYear: s.f, lastYear: s.l },
  });

  return { journal: journal.title, added, skipped };
}

/** One slice of work. Called on a timer; returns immediately when switched off. */
/**
 * One slice of work.
 *
 * `force` is what the admin screen's "Run one pass" sends. The pause switch
 * governs the timer, not a deliberate press of a button — refusing a manual
 * pass because the engine is paused, and reporting it as "nothing left to do",
 * left an operator pressing a button that silently did nothing.
 */
export async function runIngestionPass(departments: string[], opts: { force?: boolean } = {}) {
  const state = await getState();
  if (!state.enabled && !opts.force) return { skipped: 'disabled' };

  try {
    const wanted: string[] = (state.departments as string[])?.length
      ? (state.departments as string[]) : departments;

    // Journals first, always — but only for departments not yet swept. The
    // earlier version compared a global journal count against a threshold, which
    // meant one busy department satisfied the check and the rest were never
    // discovered at all. Asking per department is self-correcting: a department
    // with no discovered journals is simply the next one to sweep.
    for (const dep of wanted) {
      const found = await p.journal.count({
        where: { domain: dep, rightsBasis: 'DOAJ declaration' },
      });
      if (found > 0) continue;

      const r = await discoverJournals(dep, state);
      await p.ingestionState.update({
        where: { id: 'singleton' },
        data: {
          phase: 'Journals', currentDepartment: dep, lastRunAt: new Date(), lastError: null,
          journalsSeen: { increment: r.seen },
          journalsAccepted: { increment: r.accepted },
          journalsRejected: { increment: r.rejected },
        },
      });
      return { phase: 'Journals', department: dep, ...r };
    }

    const r = await fetchArticlesForOneJournal(state);
    await p.ingestionState.update({
      where: { id: 'singleton' },
      data: {
        phase: 'Articles', currentJournal: r.journal, lastRunAt: new Date(), lastError: null,
        articlesAdded: { increment: r.added },
        articlesSkipped: { increment: r.skipped },
      },
    });
    return { phase: 'Articles', ...r };
  } catch (e: any) {
    await p.ingestionState.update({
      where: { id: 'singleton' },
      data: { lastError: String(e?.message || e).slice(0, 1000), lastRunAt: new Date() },
    }).catch(() => {});
    return { error: String(e?.message || e) };
  }
}
