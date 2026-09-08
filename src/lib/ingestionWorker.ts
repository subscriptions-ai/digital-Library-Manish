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
/**
 * Read a licence out of a publisher's sentence about its licensing.
 *
 * DOAJ declares a licence per journal with an explicit non-commercial flag.
 * DOAB declares nothing of the kind. What it carries is `publisher.oalicense`,
 * free prose written by the publisher about its books in general — "Springer
 * Nature books are published under the Creative Commons…" — and it is present on
 * fewer than half the records. Publishers spell it three ways: a licence URL, a
 * code such as CC BY-NC-ND, or the words written out in full.
 *
 * A blanket sentence about a publisher's catalogue is weaker evidence than a
 * per-title declaration, so what this returns is recorded under its own rights
 * basis and is never on its own grounds to host anything.
 */
export function licenceFromProse(raw?: string | null): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;

  const url = t.match(/creativecommons\.org\/(?:licenses|publicdomain)\/([a-z0-9-]+)/i);
  if (url) {
    const code = url[1].toLowerCase();
    return code === 'zero' || code === 'mark' ? 'CC0' : `CC ${code.toUpperCase()}`;
  }
  if (/\bCC[\s-]?0\b/i.test(t)) return 'CC0';

  const code = t.match(/\bCC[\s-]?(BY(?:[\s-]?(?:NC|ND|SA))*)\b/i);
  if (code) return `CC ${code[1].replace(/[\s-]+/g, '-').toUpperCase()}`;

  if (/creative commons/i.test(t) && /attribution/i.test(t)) {
    const parts = ['BY'];
    if (/non[\s-]?commercial/i.test(t)) parts.push('NC');
    if (/no[\s-]?deriv/i.test(t)) parts.push('ND');
    if (/share[\s-]?alike/i.test(t)) parts.push('SA');
    return `CC ${parts.join('-')}`;
  }
  return null;
}

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

/**
 * `timeoutMs` is not a nicety. DOAB answers a hundred records in half a minute
 * on a good day and there is no upper bound on a bad one; a fetch without a
 * deadline holds the pass open for ever, and the timer's busy flag means no
 * other work runs behind it. A request that has not answered by the deadline is
 * treated as one that did not answer.
 */
async function getJson(url: string, timeoutMs = 120_000): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function getState() {
  return p.ingestionState.upsert({
    where: { id: 'singleton' }, update: {}, create: { id: 'singleton' },
  });
}

/**
 * Pick the sweep to work on next, creating the rows the first time a source is
 * used. A sweep that has never run comes first; after that the one left longest,
 * and a sweep that ran out is only reopened a month later, because DOAJ and DOAB
 * both grow and a department that was complete in March is not complete in June.
 */
async function claimSweep(source: string, departments: string[]) {
  const wanted: { department: string; term: string }[] = [];
  for (const dep of departments) for (const term of searchTermsFor(dep)) wanted.push({ department: dep, term });

  // Creating forty rows on every pass would be forty writes a minute to say
  // nothing new, so they are only created when some are missing.
  const held = await p.departmentSweep.count({ where: { source } });
  if (held < wanted.length) {
    for (const w of wanted) {
      await p.departmentSweep.upsert({
        where: { department_source_term: { department: w.department, source, term: w.term } },
        update: {},
        create: { department: w.department, source, term: w.term },
      });
    }
  }

  const reopenAfter = new Date(Date.now() - 30 * 864e5);
  const where = { source, department: { in: departments } };
  return (
    await p.departmentSweep.findFirst({
      where: { ...where, exhaustedAt: null },
      orderBy: [{ lastSweptAt: { sort: 'asc', nulls: 'first' } }],
    })
    ?? await p.departmentSweep.findFirst({
      where: { ...where, exhaustedAt: { lt: reopenAfter } },
      orderBy: [{ lastSweptAt: { sort: 'asc', nulls: 'first' } }],
    })
  );
}

/** Record where a sweep got to. A short page means the source has no more today. */
async function closeSweep(sweep: any, r: { seen: number; accepted: number; rejected: number }, nextPosition: number, full: boolean) {
  await p.departmentSweep.update({
    where: { id: sweep.id },
    data: {
      position: full ? nextPosition : 0,
      exhaustedAt: full ? null : new Date(),
      lastSweptAt: new Date(),
      seen: { increment: r.seen },
      accepted: { increment: r.accepted },
      refused: { increment: r.rejected },
    },
  });
}

const DOAJ_PAGE = 100;

/** One page of DOAJ journals for one department term; each title's licence decided here. */
async function discoverJournalsPage(sweep: any) {
  const page = sweep.position + 1;          // DOAJ counts pages from one
  const d = await getJson(
    `https://doaj.org/api/search/journals/${encodeURIComponent(sweep.term)}`
    + `?pageSize=${DOAJ_PAGE}&page=${page}`);

  const records: any[] = d?.results || [];
  const r = { seen: 0, accepted: 0, rejected: 0 };
  if (!records.length) {
    await closeSweep(sweep, r, sweep.position, false);
    return { ...r, more: false, total: d?.total ?? null };
  }

  for (const rec of records) {
    const b = rec.bibjson || {};
    const title = b.title;
    if (!title) continue;
    r.seen++;

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
      domain: sweep.department,
      subjects: (b.subject || []).map((x: any) => x.term).filter(Boolean),
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
      // Nor move a journal another department already claimed; several terms
      // return the same title and the last one to run would otherwise win.
      const { domain, ...rest } = data;
      await p.journal.update({ where: { id: existing.id }, data: existing.domain ? rest : data });
    } else {
      await p.journal.create({ data });
    }
    ok ? r.accepted++ : r.rejected++;
  }

  const full = records.length >= DOAJ_PAGE;
  await closeSweep(sweep, r, sweep.position + 1, full);
  return { ...r, more: full, total: d?.total ?? null };
}

// ── Books ────────────────────────────────────────────────────────────────────

const DOAB_PAGE = 100;
/** Pages of books per pass. Discovery gets one pass in five, so it takes more
 *  than one page at a time or five thousand books would take a fortnight. */
const DOAB_PAGES_PER_PASS = 2;

/**
 * A page of books, fetched as two requests rather than one.
 *
 * Asking DOAB for `expand=metadata,bitstreams` together takes ninety-five
 * seconds for a hundred records. Asking for each separately takes thirty-three
 * and seventeen — the two together are almost twice as fast as the one, which is
 * the opposite of what you would expect and worth not undoing later. They are
 * joined on the record id rather than on position, because nothing promises the
 * two answers arrive in the same order.
 */
async function doabPage(term: string, offset: number) {
  const base = `https://directory.doabooks.org/rest/search`
    + `?query=${encodeURIComponent(term)}&limit=${DOAB_PAGE}&offset=${offset}`;

  const meta = await getJson(`${base}&expand=metadata`);
  if (!Array.isArray(meta) || !meta.length) return Array.isArray(meta) ? [] : null;

  await sleep(400);
  const files = await getJson(`${base}&expand=bitstreams`);
  const byId = new Map<any, any>((Array.isArray(files) ? files : []).map((r: any) => [r.id, r.bitstreams]));

  return meta.map((r: any) => ({ ...r, bitstreams: byId.get(r.id) || [] }));
}

/** DOAB returns metadata as a flat list of key/value rows, with keys repeating. */
function doabFields(rec: any) {
  const m = new Map<string, string[]>();
  for (const row of rec?.metadata || []) {
    const k = row?.key;
    const v = row?.value;
    if (!k || v == null || v === '') continue;
    const list = m.get(k) || [];
    list.push(String(v));
    m.set(k, list);
  }
  return {
    one: (k: string) => m.get(k)?.[0] ?? null,
    all: (k: string) => m.get(k) ?? [],
  };
}

/**
 * One slice of DOAB books for a department term.
 *
 * Every one of these is catalogued and none is hosted, and that is not caution —
 * DOAB carries no book file. What it holds per title is a cover image and four
 * metadata exports (MARC, ONIX, RIS, TSV); the book itself lives with its
 * publisher. So a DOAB book is a record with a cover and a link out, which is
 * exactly what the reader gets, and the licence prose is recorded for what it is
 * rather than used as permission to serve anything.
 */
async function discoverBooksPage(sweep: any) {
  const r = { seen: 0, accepted: 0, rejected: 0 };
  let added = 0, skippedHeld = 0, skippedFailed = 0;
  let firstFailure: string | null = null;
  let offset = sweep.position;
  let full = true;

  for (let page = 0; page < DOAB_PAGES_PER_PASS && full; page++) {
    const records = await doabPage(sweep.term, offset);
    // A null answer is the source failing, not the source being finished. Left
    // unexhausted, the sweep is picked up again from the same offset.
    if (records === null) break;
    if (!records.length) { full = false; break; }

    for (const rec of records) {
      const f = doabFields(rec);
      const title = f.one('dc.title') || rec.name;
      if (!title) continue;
      r.seen++;

      const doi = (f.one('oapen.identifier.doi') || '')
        .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || null;
      const isbn = f.one('dc.identifier.isbn') || null;
      const handle = rec.handle || null;

      const fingerprint = doi ? `doab:doi:${doi.toLowerCase()}`
        : handle ? `doab:handle:${handle}`
        : `doab:t:${String(title).toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 180)}`;

      if (await p.book.findFirst({ where: { fingerprint }, select: { id: true } })) { skippedHeld++; continue; }

      const licence = licenceFromProse(f.one('publisher.oalicense'));
      const commercialOk = licenceAllowsCommercialUse(licence);
      commercialOk ? r.accepted++ : r.rejected++;

      const cover = (rec.bitstreams || []).find((b: any) => /^image\//i.test(b?.mimeType || ''));
      const year = Number(String(f.one('dc.date.issued') || '').slice(0, 4)) || null;
      const authors = [...f.all('dc.contributor.author'), ...f.all('dc.contributor.editor')]
        .filter(Boolean).join(', ') || null;

      await p.book.create({
        data: {
          title,
          authors,
          publisherName: f.one('publisher.name') || null,
          isbn,
          doi,
          year,
          pages: f.one('oapen.pages') || null,
          subject: f.one('dc.subject.other')
            || (f.one('dc.subject.classification') || '').split('::').pop() || null,
          domain: sweep.department,
          language: f.one('dc.language') || null,
          country: f.one('publisher.country') || null,
          description: f.one('dc.description.abstract') || null,
          coverUrl: cover?.retrieveLink ? `https://directory.doabooks.org${cover.retrieveLink}` : null,
          // Left null deliberately: DOAB holds no book file, so there is nothing
          // here to serve and a URL would only be a broken promise.
          pdfUrl: null,
          accessType: 'OpenAccess',
          status: 'Published',
          licence,
          licenceIsNC: !commercialOk,
          // Named for what it is. `publisher.oalicense` is a sentence about a
          // publisher's catalogue, not a declaration about this title, and it
          // must never be mistaken for one when read back.
          rightsBasis: licence ? 'DOAB publisher statement' : 'DOAB record, licence undeclared',
          rightsVerifiedAt: new Date(),
          rightsVerifiedBy: 'ingestion',
          rightsStatus: 'MetadataOnly',
          accessStatus: 'LinkOnly',
          originalUrl: doi ? `https://doi.org/${doi}`
            : handle ? `https://directory.doabooks.org/handle/${handle}` : null,
          rightsHolder: f.one('publisher.name') || null,
          source: 'DOAB',
          ownershipSource: 'Ingested',
          lastIngestedAt: new Date(),
          fingerprint,
        },
      }).then(() => { added++; }).catch((e: any) => {
        skippedFailed++;
        if (!firstFailure) firstFailure = String(e?.message || e).slice(0, 300);
      });
    }

    offset += records.length;
    full = records.length >= DOAB_PAGE;
    if (full) await sleep(400);             // stay well inside DOAB's limits
  }

  await closeSweep(sweep, r, offset, full);
  return { ...r, added, skippedHeld, skippedFailed, more: full, error: firstFailure };
}

/** Fetch one slice of articles for the journal refreshed longest ago. */
async function fetchArticlesForOneJournal(state: any) {
  // Only journals we discovered externally. Our own titles are filled from our
  // own records — pulling their articles back in from OpenAlex would mix
  // ingested rows into a journal whose rights basis says "our own".
  // A journal still being walked comes first; one that has given up everything
  // in the window is only revisited after a week, to pick up newly published
  // work. Otherwise a finished journal would take a turn every pass and spend it
  // asking a question already answered.
  const staleAfter = new Date(Date.now() - 7 * 864e5);
  const journal =
    await p.journal.findFirst({
      where: { status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration', exhaustedAt: null },
      orderBy: [{ lastIngestedAt: { sort: 'asc', nulls: 'first' } }],
    })
    ?? await p.journal.findFirst({
      where: {
        status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration',
        exhaustedAt: { lt: staleAfter },
      },
      orderBy: [{ lastIngestedAt: { sort: 'asc', nulls: 'first' } }],
    });
  if (!journal) return { journal: null, added: 0, skipped: 0, note: 'every journal is up to date' };

  const fromYear = new Date().getFullYear() - (state.yearsBack - 1);

  // The cursor is the whole point. Without it this asked for the same first page
  // every pass, so a journal stopped at one batch — fifty of the eight hundred
  // and sixty-eight it holds — and nine of every ten requests re-fetched work we
  // already had. '*' asks for the first page and for a cursor to continue from.
  const cursor = journal.fetchCursor || '*';
  const url = `https://api.openalex.org/works`
    + `?filter=primary_location.source.issn:${encodeURIComponent(journal.issn)}`
    + `,from_publication_date:${fromYear}-01-01,open_access.is_oa:true`
    + `&per-page=${Math.min(state.batchSize, 200)}&sort=publication_date:desc`
    + `&cursor=${encodeURIComponent(cursor)}`;

  const d = await getJson(url);

  // A cursor can expire or be rejected. Rather than stalling on that journal for
  // ever, drop back to the first page next time.
  if (!d) {
    await p.journal.update({
      where: { id: journal.id },
      data: { lastIngestedAt: new Date(), fetchCursor: null },
    });
    return { journal: journal.title, added: 0, skipped: 0, note: 'the source did not answer' };
  }

  const next = d.meta?.next_cursor ?? null;
  if (!d.results?.length) {
    // Nothing left in the window. Start again from the top next week so newly
    // published work is picked up.
    await p.journal.update({
      where: { id: journal.id },
      data: { lastIngestedAt: new Date(), fetchCursor: null, exhaustedAt: new Date() },
    });
    return { journal: journal.title, added: 0, skipped: 0, note: 'nothing new in this journal' };
  }

  // Two unrelated things used to share one counter. Already held is the engine
  // working; failed to write is not, and the reason was thrown away entirely.
  let added = 0, skippedHeld = 0, skippedFailed = 0;
  let firstFailure: string | null = null;
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

    if (await p.article.findFirst({ where: { fingerprint }, select: { id: true } })) { skippedHeld++; continue; }

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
    }).then(() => { added++; }).catch((e: any) => {
      skippedFailed++;
      if (!firstFailure) firstFailure = String(e?.message || e).slice(0, 300);
    });
  }

  // Refresh this journal's coverage so its page never computes counts live.
  const agg = await p.$queryRawUnsafe(
    `select count(*)::int a, count(distinct volume)::int v, count(distinct issue)::int i,
            min(year) f, max(year) l from "Article" where "journalId" = $1`, journal.id);
  const s = agg[0];

  // Where to resume. No next cursor means the source has no more to give inside
  // the window, so the journal is marked finished and drops into the weekly
  // rotation instead of taking a turn every pass.
  await p.journal.update({
    where: { id: journal.id },
    data: {
      articleCount: s.a, volumeCount: s.v, issueCount: s.i, firstYear: s.f, lastYear: s.l,
      lastIngestedAt: new Date(),
      fetchCursor: next,
      exhaustedAt: next ? null : new Date(),
    },
  });

  return {
    journal: journal.title,
    journalId: journal.id,
    added,
    skippedHeld,
    skippedFailed,
    skipped: skippedHeld + skippedFailed,   // kept so existing callers still read
    more: Boolean(next),
    error: firstFailure,
    note: next ? undefined : 'reached the end of this journal',
  };
}

/**
 * One slice of work. Called on a timer; returns immediately when switched off.
 *
 * `force` is what the admin screen's "Run one pass" sends. The pause switch
 * governs the timer, not a deliberate press of a button — refusing a manual
 * pass because the engine is paused, and reporting it as "nothing left to do",
 * left an operator pressing a button that silently did nothing.
 *
 * `only` restricts the pass to one kind of work, so a backfill script can spend
 * an evening on books without the rotation spending four passes in five on
 * articles.
 */
export async function runIngestionPass(
  departments: string[],
  opts: { force?: boolean; only?: 'journals' | 'articles' | 'books' } = {},
) {
  const state = await getState();
  if (!state.enabled && !opts.force) return { skipped: 'disabled' };

  // Every pass leaves a row behind, whatever happened. Running totals could say
  // how much had ever been collected but never what happened last night, when a
  // journal last gave us anything, or why anything was refused.
  const startedAt = Date.now();
  const record = (row: any) =>
    p.ingestionRun.create({ data: { ...row, durationMs: Date.now() - startedAt } }).catch(() => {});

  try {
    const wanted: string[] = (state.departments as string[])?.length
      ? (state.departments as string[]) : departments;

    // How the pass is spent.
    //
    // Discovery and article-fetching want the same minute, and whichever is
    // asked first takes every one of them. Discovery gated on "has this
    // department any journal yet" stopped after a single page and never looked
    // again — 319 journals of DOAJ's 23,428. Discovery run whenever it had work
    // to do would take the engine for ever, because a source always has another
    // page. So the split is fixed and visible: one pass in `discoverEvery` looks
    // for more titles, the rest fetch articles, and either falls through to the
    // other when it has nothing to do.
    const n = await p.ingestionState.update({
      where: { id: 'singleton' }, data: { passCount: { increment: 1 } }, select: { passCount: true },
    }).then((x: any) => x.passCount).catch(() => 0);

    const every = Math.max(1, state.discoverEvery || 5);
    const wantsDiscovery = opts.only ? opts.only !== 'articles' : n % every === 0;

    // DOAJ and DOAB alternate, so books are not queued behind every journal.
    const bookTurn = opts.only === 'books' || (opts.only !== 'journals' && n % (every * 2) === 0);

    if (wantsDiscovery) {
      const order: ('DOAB' | 'DOAJ')[] = bookTurn ? ['DOAB', 'DOAJ'] : ['DOAJ', 'DOAB'];
      for (const source of order) {
        if (opts.only === 'journals' && source !== 'DOAJ') continue;
        if (opts.only === 'books' && source !== 'DOAB') continue;

        const sweep = await claimSweep(source, wanted);
        if (!sweep) continue;

        if (source === 'DOAJ') {
          const r = await discoverJournalsPage(sweep);
          await p.ingestionState.update({
            where: { id: 'singleton' },
            data: {
              phase: 'Journals', currentDepartment: sweep.department, lastRunAt: new Date(), lastError: null,
              journalsSeen: { increment: r.seen },
              journalsAccepted: { increment: r.accepted },
              journalsRejected: { increment: r.rejected },
            },
          });
          await record({
            phase: 'Journals', source: 'DOAJ', department: sweep.department,
            journalsSeen: r.seen, journalsAccepted: r.accepted, journalsRefused: r.rejected,
            more: r.more,
            note: r.seen
              ? `"${sweep.term}" page ${sweep.position + 1}: ${r.accepted} accepted, ${r.rejected} refused on licence`
              : `"${sweep.term}" has no more to give`,
          });
          return { phase: 'Journals', source, department: sweep.department, term: sweep.term, ...r };
        }

        const r = await discoverBooksPage(sweep);
        await p.ingestionState.update({
          where: { id: 'singleton' },
          data: {
            phase: 'Books', currentDepartment: sweep.department, lastRunAt: new Date(), lastError: null,
            booksAdded: { increment: r.added },
            booksSkipped: { increment: r.skippedHeld + r.skippedFailed },
          },
        });
        await record({
          phase: 'Books', source: 'DOAB', department: sweep.department,
          added: r.added, skippedHeld: r.skippedHeld, skippedFailed: r.skippedFailed,
          more: r.more, error: r.error,
          note: r.seen
            ? `"${sweep.term}" from ${sweep.position}: ${r.added} added, ${r.skippedHeld} already held`
            : `"${sweep.term}" has no more to give`,
        });
        return { phase: 'Books', source, department: sweep.department, term: sweep.term, ...r };
      }
      // Every sweep is exhausted and none is due to reopen. Fetch instead.
      if (opts.only) return { phase: 'Idle', note: 'every sweep is up to date' };
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
    await record({
      phase: 'Articles', source: 'OpenAlex',
      journalId: (r as any).journalId ?? null,
      journalTitle: r.journal ?? null,
      added: r.added,
      skippedHeld: (r as any).skippedHeld ?? 0,
      skippedFailed: (r as any).skippedFailed ?? 0,
      more: Boolean((r as any).more),
      note: (r as any).note ?? null,
      error: (r as any).error ?? null,
    });
    return { phase: 'Articles', ...r };
  } catch (e: any) {
    await p.ingestionState.update({
      where: { id: 'singleton' },
      data: { lastError: String(e?.message || e).slice(0, 1000), lastRunAt: new Date() },
    }).catch(() => {});
    // A pass that threw is the one most worth having a record of.
    await record({ phase: 'Error', error: String(e?.message || e).slice(0, 1000) });
    return { error: String(e?.message || e) };
  }
}
