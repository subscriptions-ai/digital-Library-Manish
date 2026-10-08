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
import { ingestionDb } from './ingestion/db.js';
import { fetchSourceJson } from './ingestion/sourceHealth.js';
import { claimJournal, claimSweepRow, releaseClaim } from './ingestion/claims.js';
import {
  INGESTION_POLICY, schedulerV2, noChangeCooldownMinutes, failureBackoffMinutes, minutes, days,
} from './ingestion/policy.js';
import { judgeArticle, licenceAllowsCommercialUse } from './ingestion/eligibility.js';
import { findHeldArticles, findPossibleDuplicates, canonicalFingerprint, normaliseDoi } from './ingestion/dedup.js';

/** The worker's connection, shared with the catalogue import and the safety services. */
const p = ingestionDb;
export { ingestionDb, licenceAllowsCommercialUse };

const CONTACT = process.env.OPENALEX_CONTACT || 'info@celnet.in';
const UA = { 'User-Agent': `STM Digital Library (mailto:${CONTACT})` };

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
  const r = await fetchSourceJson(url, { headers: UA, timeoutMs, attempts: schedulerV2() ? 3 : 1 });
  return r.ok ? r.json : null;
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
  //
  // Missing *for these departments*. This counted the rows of every department
  // against the terms of the ones asked for, so once a table held rows for Bio
  // Technology and Energy, choosing Law compared two rows with Law's one term,
  // decided nothing was missing, and never created Law's row. With no row there
  // was nothing to sweep, the pass reported every source "walked out" for a
  // department that had never been searched once, and the engine stayed that
  // way for as long as anyone left it running.
  const held = await p.departmentSweep.count({ where: { source, department: { in: departments } } });
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
  const order = [{ lastSweptAt: { sort: 'asc', nulls: 'first' } }];
  // Claimed, not merely found: the timer and a manual pass could otherwise walk the same page twice.
  if (schedulerV2()) {
    return (
      (await claimSweepRow({ ...where, exhaustedAt: null }, order))?.row
      ?? (await claimSweepRow({ ...where, exhaustedAt: { lt: reopenAfter } }, order))?.row
      ?? null
    );
  }
  return (
    await p.departmentSweep.findFirst({ where: { ...where, exhaustedAt: null }, orderBy: order })
    ?? await p.departmentSweep.findFirst({ where: { ...where, exhaustedAt: { lt: reopenAfter } }, orderBy: order })
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
      claimedAt: null,
      claimedBy: null,
    },
  });
}

const DOAJ_PAGE = 100;

/** With a per-journal limit, how many journals one pass may fill, and for how long. */
const ARTICLE_JOURNALS_PER_PASS = 10;
const ARTICLE_PASS_BUDGET_MS = 40_000;

/**
 * What a re-sweep may change on a journal already held.
 *
 * It used to overwrite title, publisher, licence and status on every pass — so an edit made in the
 * admin, or a rights decision recorded some other way (a publisher agreement), was undone the next
 * time the sweep came round. Now: empty fields are filled, nothing that has a value is replaced,
 * and the licence and status are refreshed only when they were decided by DOAJ in the first place.
 */
function refreshPatch(existing: any, incoming: any) {
  const patch: any = {};
  for (const k of ['eissn', 'publisherName', 'country', 'homepage', 'domain']) {
    if (!existing[k] && incoming[k]) patch[k] = incoming[k];
  }
  const noSubjects = !Array.isArray(existing.subjects) || existing.subjects.length === 0;
  if (noSubjects && Array.isArray(incoming.subjects) && incoming.subjects.length) patch.subjects = incoming.subjects;
  if (existing.rightsBasis === 'DOAJ declaration') {
    const changed = ['licence', 'licenceIsNC', 'status'].filter(k => incoming[k] !== undefined && incoming[k] !== existing[k]);
    if (changed.length) {
      for (const k of changed) patch[k] = incoming[k];
      patch.rightsVerifiedAt = incoming.rightsVerifiedAt;     // re-verified only when something moved
      patch.rightsVerifiedBy = incoming.rightsVerifiedBy;
    }
  }
  return patch;
}

/** One page of DOAJ journals for one department term; each title's licence decided here. */
async function discoverJournalsPage(sweep: any) {
  const page = sweep.position + 1;          // DOAJ counts pages from one
  const d = await getJson(
    `https://doaj.org/api/search/journals/${encodeURIComponent(sweep.term)}`
    + `?pageSize=${DOAJ_PAGE}&page=${page}`);

  const records: any[] = d?.results || [];
  const r = { seen: 0, accepted: 0, rejected: 0 };

  // No answer is not "no more results". Closing the sweep here marked it exhausted and reset its
  // position to the start, so one DOAJ hiccup parked a department for a month. Leave it exactly where
  // it was and say so.
  if (d === null && schedulerV2()) {
    await releaseClaim('departmentSweep', sweep.id);
    return { ...r, more: false, total: null, failed: true as const };
  }
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
      if (schedulerV2()) {
        // A journal we hold is refreshed, not replaced. A title is not an identity — a journal with no ISSN
        // matched on title alone could be a different journal that shares the name — so that match is
        // never written to. An ISSN match may fill what is empty, and refresh the licence only where the
        // licence came from DOAJ in the first place.
        if (issn) {
          const patch = refreshPatch(existing, data);
          if (Object.keys(patch).length) await p.journal.update({ where: { id: existing.id }, data: patch });
        }
      } else {
        // Nor move a journal another department already claimed; several terms
        // return the same title and the last one to run would otherwise win.
        const { domain, ...rest } = data;
        await p.journal.update({ where: { id: existing.id }, data: existing.domain ? rest : data });
      }
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
 * the opposite of what you would expect and worth not undoing later.
 *
 * They are joined on `uuid`, not on position, because nothing promises the two
 * answers arrive in the same order. The field is `uuid`; there is no `id`. Keyed
 * on `id` the map had a single entry under `undefined`, every record matched it,
 * and all hundred books on a page were given the last book's cover — 3,974 books
 * wearing 54 covers between them, each one wrong. A join with no key must return
 * nothing, so a missing uuid drops the record's files rather than handing it
 * whatever the map happens to hold.
 */
async function doabPage(term: string, offset: number) {
  const base = `https://directory.doabooks.org/rest/search`
    + `?query=${encodeURIComponent(term)}&limit=${DOAB_PAGE}&offset=${offset}`;

  const meta = await getJson(`${base}&expand=metadata`);
  if (!Array.isArray(meta) || !meta.length) return Array.isArray(meta) ? [] : null;

  await sleep(400);
  const files = await getJson(`${base}&expand=bitstreams`);
  const byUuid = new Map<string, any>(
    (Array.isArray(files) ? files : [])
      .filter((r: any) => r?.uuid)
      .map((r: any) => [r.uuid, r.bitstreams || []]));

  return meta.map((r: any) => ({ ...r, bitstreams: (r?.uuid && byUuid.get(r.uuid)) || [] }));
}

/**
 * The book's own PDF, where OAPEN Library holds it.
 *
 * DOAB carries no file, but most of its records point at OAPEN Library in
 * `dc.identifier` — seventy of a hundred in a sample of law titles — and OAPEN
 * does hold the book: an ORIGINAL bitstream, application/pdf, downloadable with
 * no login and no browser check through its DSpace REST path (the HTML handle
 * page sits behind a bot wall; the retrieve link does not). That was being read
 * past, so readers got a DOI landing page when the book itself was one link away.
 *
 * Used as the link out, never as `pdfUrl`: a DOAB licence is a publisher's
 * sentence about its catalogue, and that is not grounds to serve the file
 * through this site. Returns null on any failure so the DOI link still stands.
 */
async function oapenPdfFor(handle: string): Promise<string | null> {
  const d = await getJson(`https://library.oapen.org/rest/handle/${handle}?expand=bitstreams`);
  const pdf = (d?.bitstreams || []).find((b: any) =>
    b?.bundleName === 'ORIGINAL' && /pdf/i.test(b?.mimeType || '') && b?.retrieveLink);
  return pdf ? `https://library.oapen.org${pdf.retrieveLink}` : null;
}

const oapenHandleIn = (identifiers: string[]) =>
  identifiers.map(v => String(v).match(/library\.oapen\.org\/handle\/([0-9.]+\/[0-9]+)/i)?.[1]).find(Boolean) || null;

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
      const oapenHandle = oapenHandleIn(f.all('dc.identifier'));

      const fingerprint = doi ? `doab:doi:${doi.toLowerCase()}`
        : handle ? `doab:handle:${handle}`
        : `doab:t:${String(title).toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 180)}`;

      const cover = (rec.bitstreams || []).find((b: any) => /^image\//i.test(b?.mimeType || ''));
      const coverUrl = cover?.retrieveLink
        ? `https://directory.doabooks.org${cover.retrieveLink}` : null;

      const existing = await p.book.findFirst({ where: { fingerprint }, select: { id: true, coverUrl: true, originalUrl: true } });
      if (existing) {
        // A second sweep is worth something: it repairs what the first got wrong.
        // Covers were attached by a join that could not work, so walking past a
        // book we already hold would have left every one of them wrong for ever.
        // The same goes for the link: books swept before OAPEN was read get
        // their PDF the next time the sweep passes them.
        const repair: any = {};
        if (coverUrl && coverUrl !== existing.coverUrl) repair.coverUrl = coverUrl;
        if (oapenHandle && !String(existing.originalUrl || '').includes('library.oapen.org')) {
          const pdf = await oapenPdfFor(oapenHandle);
          if (pdf) repair.originalUrl = pdf;
        }
        if (Object.keys(repair).length) {
          await p.book.update({ where: { id: existing.id }, data: repair }).catch(() => {});
        }
        skippedHeld++;
        continue;
      }

      const licence = licenceFromProse(f.one('publisher.oalicense'));
      const commercialOk = licenceAllowsCommercialUse(licence);
      const oapenPdf = oapenHandle ? await oapenPdfFor(oapenHandle) : null;
      commercialOk ? r.accepted++ : r.rejected++;

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
          coverUrl,
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
          // The book itself first; its DOI landing page or DOAB record if not.
          originalUrl: oapenPdf
            || (doi ? `https://doi.org/${doi}`
            : handle ? `https://directory.doabooks.org/handle/${handle}` : null),
          rightsHolder: f.one('publisher.name') || null,
          source: 'DOAB',
          sourceRecordId: handle || rec.uuid || null,
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

/**
 * The journal whose articles are fetched next.
 *
 * Only journals we discovered externally. Our own titles are filled from our own
 * records — pulling their articles back in from OpenAlex would mix ingested rows
 * into a journal whose rights basis says "our own". A journal still being walked
 * comes first; one that has given up everything in the window is only revisited
 * after a week, to pick up newly published work.
 *
 * `departments` narrows the choice, and until it did the department chooser
 * governed discovery and nothing else. Articles were picked from every journal
 * in the catalogue, never-fetched first — so a large pull for one department
 * left thousands of its journals untouched at the head of the queue, and an
 * operator who then chose Law or Energy watched the engine go on fetching the
 * first department for days, with the chooser showing their choice the whole
 * time. Passed as undefined it means every department, which also keeps the
 * handful of journals that carry no department in the rotation.
 */
export async function nextJournalForArticles(departments?: string[], cap = 0) {
  return (await pickJournal(departments, cap, false))?.journal ?? null;
}

/**
 * Choose the next journal — and, in v2, take it.
 *
 * Choosing and taking are one step. Finding a journal and claiming it separately left a gap in which
 * the timer and a manual pass could pick the same one; claiming is a single compare-and-set, so only
 * one of them gets it. A journal cooling down after a visit that gave nothing is not a candidate until
 * its time comes; neither is one whose claim is fresh.
 */
async function pickJournal(departments: string[] | undefined, cap: number, v2: boolean): Promise<{ journal: any; recovered: boolean } | null> {
  // A journal that already holds its share is finished, not merely resting.
  const inScope = {
    ...(departments?.length ? { domain: { in: departments } } : {}),
    ...(cap > 0 ? { articleCount: { lt: cap } } : {}),
  };
  const staleAfter = new Date(Date.now() - 7 * 864e5);
  const base = { status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration', ...inScope };
  const due = { OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: new Date() } }] };
  const order = [{ lastIngestedAt: { sort: 'asc', nulls: 'first' } }];

  const tier1 = { ...base, exhaustedAt: null };
  const tier2 = { ...base, exhaustedAt: { lt: staleAfter } };

  if (v2) {
    const first = await claimJournal({ AND: [tier1, due] }, order);
    if (first) return { journal: first.row, recovered: first.recovered };
    const second = await claimJournal({ AND: [tier2, due] }, order);
    return second ? { journal: second.row, recovered: second.recovered } : null;
  }
  const j = (await p.journal.findFirst({ where: tier1, orderBy: order })) ?? (await p.journal.findFirst({ where: tier2, orderBy: order }));
  return j ? { journal: j, recovered: false } : null;
}

/** What to say when there is nothing to fetch, including when the reason is that everything is resting. */
async function noJournalNote(departments: string[] | undefined, cap: number): Promise<string> {
  const inScope = {
    ...(departments?.length ? { domain: { in: departments } } : {}),
    ...(cap > 0 ? { articleCount: { lt: cap } } : {}),
  };
  if (schedulerV2()) {
    const cooling = await p.journal.aggregate({
      where: { status: 'Accepted', issn: { not: null }, rightsBasis: 'DOAJ declaration', ...inScope, nextEligibleAt: { gt: new Date() } },
      _count: { _all: true }, _min: { nextEligibleAt: true },
    });
    if (cooling._count._all > 0) {
      const at = cooling._min.nextEligibleAt as Date;
      return `${cooling._count._all.toLocaleString()} journal${cooling._count._all === 1 ? '' : 's'} ${departments?.length ? `in ${departments.join(', ')} ` : ''}checked recently and resting; the next is due ${at.toISOString()}`;
    }
  }
  // Said plainly, because "every journal is up to date" was also the answer
  // when the chosen departments had no journal to fetch from at all — which
  // reads as done when it means not started.
  return departments?.length ? `no journal to fetch from in ${departments.join(', ')} yet` : 'every journal is up to date';
}

/** An OpenAlex work, reduced to what the rules and the writer need. */
function openAlexWork(w: any) {
  const doi = normaliseDoi(w.doi);
  return {
    source: 'OpenAlex',
    sourceRecordId: (w.id as string) || null,
    doi,
    title: (w.title || w.display_name || '') as string,
    authors: (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean).join(', '),
    year: (w.publication_year as number) || null,
    pdfUrl: (w.best_oa_location?.pdf_url || w.open_access?.oa_url || null) as string | null,
    licence: (w.best_oa_location?.license || null) as string | null,
    raw: w,
  };
}

/** Fetch one slice of articles for the journal refreshed longest ago. */
async function fetchArticlesForOneJournal(state: any, departments?: string[]) {
  const v2 = schedulerV2();
  const cap = Math.max(0, state.articlesPerJournal ?? 0);
  const picked = await pickJournal(departments, cap, v2);
  if (!picked) {
    return { journal: null, added: 0, skipped: 0, note: await noJournalNote(departments, cap) } as any;
  }
  try {
    return await visitJournal(picked.journal, state, cap, v2, picked.recovered);
  } finally {
    // Whatever happened, the claim is given back. (A worker that dies never reaches here; that is what
    // the stale-claim timeout is for.)
    if (v2) await releaseClaim('journal', picked.journal.id);
  }
}

async function visitJournal(journal: any, state: any, cap: number, v2: boolean, recovered: boolean) {
  const policy = INGESTION_POLICY;
  const now = () => new Date();
  const fromYear = new Date().getFullYear() - (state.yearsBack - 1);
  const have = journal.articleCount || 0;
  const remaining = cap > 0 ? Math.max(0, cap - have) : Number.POSITIVE_INFINITY;

  // How many records to ask for. This was `cap - held`, which for a journal holding 29 of 30 meant
  // asking for ONE record — and when the newest records were the ones already held, a whole visit was
  // spent on each. A journal fetched before the cursor existed has no cursor and restarts from its
  // newest record, so it had to walk past everything it held, one or two records at a time. Ask for a
  // sensible page; only as many new records as are needed are written.
  const perPage = cap > 0
    ? (v2 ? Math.min(policy.articles.pageMax, Math.max(remaining, policy.articles.pageMin)) : Math.min(200, Math.max(1, cap - have)))
    : Math.min(state.batchSize, 200);

  // The cursor is the whole point. Without it this asked for the same first page every pass.
  const cursor = journal.fetchCursor || '*';
  const url = `https://api.openalex.org/works`
    + `?filter=primary_location.source.issn:${encodeURIComponent(journal.issn)}`
    + `,from_publication_date:${fromYear}-01-01,open_access.is_oa:true`
    + `&per-page=${perPage}`
    + `&sort=publication_date:desc`
    + `&cursor=${encodeURIComponent(cursor)}`;

  const res = await fetchSourceJson(url, { headers: UA, attempts: v2 ? 3 : 1 });

  // ── The source did not give us a page ────────────────────────────────────
  if (!res.ok) {
    if (!v2) {
      // Previous behaviour: forget the cursor and try again from the top.
      await p.journal.update({ where: { id: journal.id }, data: { lastIngestedAt: now(), fetchCursor: null } });
      return { journal: journal.title, department: journal.domain, added: 0, skipped: 0, note: 'the source did not answer' };
    }
    if (res.paused) {
      // Not this journal's doing: leave it exactly as it was, and say the source is resting.
      return { journal: null, department: journal.domain, added: 0, skipped: 0, note: `OpenAlex is temporarily paused after repeated failures — ${res.error}` } as any;
    }
    // A cursor the source refuses (HTTP 400) is the one failure that justifies starting over. Anything else
    // — the source down, rate limiting, a timeout — keeps the cursor: dropping it here is how a journal that
    // was part-way through came to be re-walked from its newest record.
    const badCursor = res.status === 400 && !!journal.fetchCursor;
    const failures = badCursor ? journal.failureCount || 0 : (journal.failureCount || 0) + 1;
    await p.journal.update({
      where: { id: journal.id },
      data: {
        fetchCursor: badCursor ? null : journal.fetchCursor,
        failureCount: failures,
        lastIngestionStatus: 'failed',
        nextEligibleAt: badCursor ? null : new Date(Date.now() + minutes(failureBackoffMinutes(failures))),
        claimedAt: null, claimedBy: null,
      },
    });
    return {
      journal: journal.title, department: journal.domain, journalId: journal.id, added: 0, skipped: 0,
      error: badCursor ? 'the source rejected the saved cursor; starting this journal over' : (res.error || 'the source did not answer'),
      note: badCursor ? undefined : `will retry after ${failureBackoffMinutes(failures)} min`,
    };
  }

  const d = res.json;
  const next: string | null = d.meta?.next_cursor ?? null;
  const results: any[] = d.results || [];

  // ── Nothing left in the window ───────────────────────────────────────────
  if (!results.length) {
    await p.journal.update({
      where: { id: journal.id },
      data: {
        lastIngestedAt: now(), fetchCursor: null, exhaustedAt: now(),
        // Start again from the top next week so newly published work is picked up — a time, never a verdict.
        nextEligibleAt: new Date(Date.now() + days(policy.cooldown.exhaustedDays)),
        noChangeCount: (journal.noChangeCount || 0) + 1, failureCount: 0, lastIngestionStatus: 'exhausted',
        claimedAt: null, claimedBy: null,
      },
    });
    return { journal: journal.title, department: journal.domain, journalId: journal.id, added: 0, skipped: 0, note: 'nothing new in this journal' };
  }

  // ── Judge every record with the one shared rule set, then write the ones that pass ─────────────
  const works = results.map(openAlexWork);
  const held = await findHeldArticles(works);
  const possibleDupes = await findPossibleDuplicates(journal.id, works);

  let added = 0, skippedHeld = 0, skippedFailed = 0, skippedRejected = 0, needsReview = 0;
  let firstFailure: string | null = null;
  const seenThisPage = new Set<string>();

  for (let i = 0; i < works.length; i++) {
    // Enough new records for this journal's limit; the rest of the page is not needed.
    if (v2 && added + needsReview >= remaining) break;

    const w = works[i];
    const fingerprint = canonicalFingerprint(w);
    // Two records on one page can share a key (the same work listed twice); the second is held, not a failure.
    const heldHere = held.get(i) ?? (seenThisPage.has(fingerprint) ? { articleId: '(this page)', via: 'fingerprint' as const, journalId: journal.id } : null);
    const decision = judgeArticle(w, { journal, held: heldHere, possibleDuplicateOf: possibleDupes.get(i) ?? null });

    if (decision.outcome === 'HELD') { skippedHeld++; continue; }
    if (decision.outcome === 'REJECTED') { skippedRejected++; continue; }

    const raw = w.raw;
    try {
      await p.article.create({
        data: {
          title: w.title || raw.display_name || 'Untitled',
          authors: w.authors,
          abstract: null,                              // see the abstract decision — not stored for ingested work
          doi: w.doi,
          pdfUrl: w.pdfUrl,
          journalId: journal.id,
          journalName: journal.title,
          journalIssn: journal.issn,
          publisherName: journal.publisherName,
          volume: raw.biblio?.volume || null,
          issue: raw.biblio?.issue || null,
          year: w.year,
          originalDate: raw.publication_date ? new Date(raw.publication_date) : null,
          originalUrl: raw.primary_location?.landing_page_url || (w.doi ? `https://doi.org/${w.doi}` : null),
          domain: journal.domain,
          subject: (raw.concepts || [])[0]?.display_name || null,
          licence: w.licence,
          licenceIsNC: decision.licenceVerdict !== 'allows-commercial',
          rightsHolder: journal.publisherName,
          accessStatus: decision.access,
          parentKind: 'Journal',
          parentId: journal.id,
          contentType: 'Periodicals',
          // Published, or Draft where a person has to look first (it then appears under Drafts in the admin).
          status: decision.status,
          source: 'OpenAlex',
          ownershipSource: 'Ingested',
          fingerprint,
          // Where it came from, so the same record arriving again is recognised by the source's own id.
          sourceRecordId: w.sourceRecordId,
        },
      });
      seenThisPage.add(fingerprint);
      decision.outcome === 'NEEDS_REVIEW' ? needsReview++ : added++;
    } catch (e: any) {
      // The database's own uniqueness check is the last line of defence against a duplicate: losing that race
      // means the record is held, which is the engine working, not failing.
      if (e?.code === 'P2002') { skippedHeld++; seenThisPage.add(fingerprint); }
      else { skippedFailed++; if (!firstFailure) firstFailure = String(e?.message || e).slice(0, 300); }
    }
  }

  // Refresh this journal's coverage so its page never computes counts live.
  const agg = await p.$queryRawUnsafe(
    `select count(*)::int a, count(distinct volume)::int v, count(distinct issue)::int i,
            min(year) f, max(year) l from "Article" where "journalId" = $1`, journal.id);
  const s = agg[0];

  // Where to resume, and when to come back.
  const full = cap > 0 && s.a >= cap;
  const gained = added + needsReview > 0;
  const noChange = (journal.noChangeCount || 0) + 1;
  const data: any = {
    articleCount: s.a, volumeCount: s.v, issueCount: s.i, firstYear: s.f, lastYear: s.l,
    lastIngestedAt: now(), failureCount: 0, claimedAt: null, claimedBy: null,
  };

  if (full) {
    // Finished for now: at its limit. (If the limit is raised later it simply becomes a candidate again.)
    Object.assign(data, { fetchCursor: null, exhaustedAt: now(), nextEligibleAt: null, noChangeCount: 0, lastIngestionStatus: 'full' });
  } else if (gained) {
    // Gave something, so back to the normal rotation. At the end of the journal, the weekly look for new work.
    Object.assign(data, {
      fetchCursor: next, exhaustedAt: next ? null : now(),
      nextEligibleAt: next ? null : new Date(Date.now() + days(policy.cooldown.exhaustedDays)),
      noChangeCount: 0, lastIngestionStatus: 'added',
    });
  } else if (!next) {
    // Read to the end and nothing new: look again next week, never sooner.
    Object.assign(data, {
      fetchCursor: null, exhaustedAt: now(), nextEligibleAt: new Date(Date.now() + days(policy.cooldown.exhaustedDays)),
      noChangeCount: noChange, lastIngestionStatus: 'exhausted',
    });
  } else {
    // A whole page held and more behind it: it is part-way through its own past. Carry on from the cursor, but
    // after a pause that lengthens the longer this goes on — the engine moves to another journal meanwhile.
    Object.assign(data, {
      fetchCursor: next, exhaustedAt: null, noChangeCount: noChange, lastIngestionStatus: 'nochange',
      nextEligibleAt: new Date(Date.now() + minutes(noChangeCooldownMinutes(noChange))),
    });
  }
  if (!v2) { delete data.nextEligibleAt; delete data.noChangeCount; delete data.lastIngestionStatus; delete data.failureCount; delete data.claimedAt; delete data.claimedBy;
    data.fetchCursor = full ? null : next; data.exhaustedAt = next && !full ? null : new Date(); }

  await p.journal.update({ where: { id: journal.id }, data });

  return {
    journal: journal.title,
    department: journal.domain,
    journalId: journal.id,
    added,
    skippedHeld,
    skippedFailed,
    skippedRejected,
    needsReview,
    skipped: skippedHeld + skippedFailed,   // kept so existing callers still read
    more: Boolean(next) && !full,
    error: firstFailure,
    note: [
      recovered ? 'took over an abandoned claim' : null,
      full ? `holds ${s.a} articles, the limit set` : next ? undefined : 'reached the end of this journal',
      !full && !gained && next ? `nothing new on this page; resting ${noChangeCooldownMinutes(noChange)} min` : null,
    ].filter(Boolean).join(' · ') || undefined,
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
 *
 * `departments` names the departments to cover for this call only.
 *
 * With neither given, `state.focus` decides. That setting exists because the
 * rotation is right for a library being kept up to date and wrong for one being
 * filled: books get one pass in ten, so an operator who wants five thousand of
 * them could only ask by pressing a button five hundred times.
 */
/** One journal visit, for tests and diagnostics. The engine itself reaches it through runIngestionPass. */
export { fetchArticlesForOneJournal as ingestNextJournal };

export async function runIngestionPass(
  departments: string[],
  opts: { force?: boolean; only?: 'journals' | 'articles' | 'books'; departments?: string[] } = {},
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
    // Departments asked for by name beat the stored setting, the same way `force`
    // beats the pause switch. The setting says what the engine does when left
    // alone; it was never meant to overrule someone asking for something
    // deliberately. Read the other way round, a backfill told to cover all
    // twenty-seven departments silently covered the two left in the admin
    // screen's chooser, and said nothing about the difference.
    const wanted: string[] = opts.departments?.length
      ? opts.departments
      : (state.departments as string[])?.length
        ? (state.departments as string[])
        : departments;
    const narrowed = Boolean(opts.departments?.length || (state.departments as string[])?.length);

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

    // What this pass is for. An argument wins over the setting, the setting wins
    // over the rotation, and the rotation is what happens when nobody has said.
    const only: 'journals' | 'articles' | 'books' | undefined =
      opts.only ?? (state.focus && state.focus !== 'auto' ? state.focus : undefined);

    const every = Math.max(1, state.discoverEvery || 5);
    const wantsDiscovery = only ? only !== 'articles' : n % every === 0;

    // DOAJ and DOAB alternate, so books are not queued behind every journal.
    const bookTurn = only === 'books' || (only !== 'journals' && n % (every * 2) === 0);

    // Discovery, callable from either side of the pass. The rotation gives it one
    // pass in `discoverEvery` and articles the rest — right while every chosen
    // department has journals to fetch from, and four wasted passes in five while
    // one has none, each saying so and doing nothing.
    const discover = async (order: ('DOAB' | 'DOAJ')[]) => {
      for (const source of order) {
        if (only === 'journals' && source !== 'DOAJ') continue;
        if (only === 'books' && source !== 'DOAB') continue;

        const sweep = await claimSweep(source, wanted);
        if (!sweep) continue;

        if (source === 'DOAJ') {
          const r: any = await discoverJournalsPage(sweep).catch(async (e: any) => { await releaseClaim('departmentSweep', sweep.id); throw e; });
          if (r.failed) {
            // The source did not answer. The sweep was left where it was, so nothing is counted as seen.
            await p.ingestionState.update({ where: { id: 'singleton' }, data: { phase: 'Journals', currentDepartment: sweep.department, lastRunAt: new Date() } });
            await record({
              phase: 'Journals', source: 'DOAJ', department: sweep.department, more: true,
              note: `"${sweep.term}": DOAJ did not answer — the sweep was left where it was and will be tried again`,
              error: 'DOAJ did not answer',
            });
            return { phase: 'Journals', source, department: sweep.department, term: sweep.term, ...r };
          }
          await p.ingestionState.update({
            where: { id: 'singleton' },
            data: {
              phase: 'Journals', currentDepartment: sweep.department, lastRunAt: new Date(), lastError: null,
              lastSuccessAt: new Date(), consecutiveFailures: 0,
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

        const r = await discoverBooksPage(sweep).catch(async (e: any) => { await releaseClaim('departmentSweep', sweep.id); throw e; });
        await p.ingestionState.update({
          where: { id: 'singleton' },
          data: {
            phase: 'Books', currentDepartment: sweep.department, lastRunAt: new Date(), lastError: null,
            lastSuccessAt: new Date(), consecutiveFailures: 0,
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
      return null;
    };

    if (wantsDiscovery) {
      const found = await discover(bookTurn ? ['DOAB', 'DOAJ'] : ['DOAJ', 'DOAB']);
      if (found) return found;
      // Every sweep is exhausted and none is due to reopen. Fetch instead —
      // unless this pass was asked for one kind of work in particular, in which
      // case silently doing a different kind is the wrong answer.
      //
      // Returning quietly was almost as bad. An operator chose journals, pressed
      // Start, and watched a screen that went on reporting the last thing that
      // had happened — a phase of "Books", a run log with no new rows, and not a
      // word about why. A pass that decided to do nothing is still a pass, and
      // has to leave the same trace as any other.
      if (only) {
        const note = `nothing left to sweep for ${only} — every source has been walked out`;
        await p.ingestionState.update({
          where: { id: 'singleton' },
          data: { phase: 'Idle', currentDepartment: null, currentJournal: null, lastRunAt: new Date(), lastError: null },
        }).catch(() => {});
        await record({ phase: 'Idle', note });
        return { phase: 'Idle', note };
      }
    }

    const r = await fetchArticlesForOneJournal(state, narrowed ? wanted : undefined);

    // With a limit set, each journal is one small request, and one a minute
    // would take a fortnight to give ten thousand journals their first articles.
    // So the pass carries on to the next journal, and the next, until it has
    // done ARTICLE_JOURNALS_PER_PASS of them or used its time. Each leaves its
    // own row in the run log.
    if (r.journal && (state.articlesPerJournal ?? 0) > 0) {
      for (let k = 1; k < ARTICLE_JOURNALS_PER_PASS && Date.now() - startedAt < ARTICLE_PASS_BUDGET_MS; k++) {
        const more = await fetchArticlesForOneJournal(state, narrowed ? wanted : undefined);
        if (!more.journal) break;
        await p.ingestionState.update({
          where: { id: 'singleton' },
          data: { articlesAdded: { increment: more.added }, articlesSkipped: { increment: more.skipped }, lastSuccessAt: new Date(), consecutiveFailures: 0 },
        });
        await record({
          phase: 'Articles', source: 'OpenAlex',
          journalId: (more as any).journalId ?? null, journalTitle: more.journal,
          added: more.added, skippedHeld: (more as any).skippedHeld ?? 0, skippedFailed: (more as any).skippedFailed ?? 0,
          skippedRejected: (more as any).skippedRejected ?? 0, needsReview: (more as any).needsReview ?? 0,
          more: Boolean((more as any).more), note: (more as any).note ?? null, error: (more as any).error ?? null,
        });
      }
    }

    // Nothing to fetch from in the chosen departments: spend the pass finding
    // journals there instead of reporting the absence once a minute. Not when
    // one kind of work was asked for — that choice is the operator's to change.
    if (!r.journal && !only && !wantsDiscovery) {
      const found = await discover(['DOAJ', 'DOAB']);
      if (found) return found;
    }
    if (!r.journal && narrowed) {
      (r as any).note = only === 'articles'
        ? `no journal to fetch from in ${wanted.join(', ')} — choose "Everything" or "Journals only" so the engine can find some`
        : `nothing to fetch or discover in ${wanted.join(', ')} right now — every search there has been walked out, and they reopen within 30 days`;
    }
    await p.ingestionState.update({
      where: { id: 'singleton' },
      data: {
        phase: 'Articles', currentJournal: r.journal, currentDepartment: (r as any).department ?? null,
        lastRunAt: new Date(), lastError: null,
        lastSuccessAt: new Date(), consecutiveFailures: 0,
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
      skippedRejected: (r as any).skippedRejected ?? 0,
      needsReview: (r as any).needsReview ?? 0,
      more: Boolean((r as any).more),
      note: (r as any).note ?? null,
      error: (r as any).error ?? null,
    });
    return { phase: 'Articles', ...r };
  } catch (e: any) {
    await p.ingestionState.update({
      where: { id: 'singleton' },
      data: { lastError: String(e?.message || e).slice(0, 1000), lastRunAt: new Date(), consecutiveFailures: { increment: 1 } },
    }).catch(() => {});
    // A pass that threw is the one most worth having a record of.
    await record({ phase: 'Error', error: String(e?.message || e).slice(0, 1000) });
    return { error: String(e?.message || e) };
  }
}
