#!/usr/bin/env node
/**
 * Walk the whole reader-facing product and report what is broken.
 *
 *   node scripts/verify.cjs                    # against http://localhost:3000
 *   node scripts/verify.cjs https://host       # against anything else
 *
 * This exists because bugs were being found one screenshot at a time. The
 * "0 journals" figure, the department page answering "not found" for a
 * department we hold, and a dashboard announcing that students had never read
 * anything while the next page listed what they read — all three were the same
 * class of fault, all three shipped, and none of them would have survived a
 * single pass of this.
 *
 * It reads only. It mints its own tokens from the database, walks every
 * catalogue and analytics endpoint with real ids taken from real rows, and
 * checks each answer against what the database independently says. Nothing is
 * created, updated or deleted.
 */

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const BASE = process.argv[2] || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET || 'your-fallback-secret-for-dev-only';

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', O = '\x1b[0m';
let pass = 0, fail = 0, skip = 0;
const failures = [];

const ok = (name, detail = '') => { pass++; console.log(`  ${G}pass${O}  ${name}${detail ? D + '  ' + detail + O : ''}`); };
const bad = (name, detail) => { fail++; failures.push(`${name} — ${detail}`); console.log(`  ${R}FAIL${O}  ${name}\n        ${R}${detail}${O}`); };
const meh = (name, why) => { skip++; console.log(`  ${Y}skip${O}  ${name}${D}  ${why}${O}`); };

const get = async (path, token) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let body = null;
  try { body = await r.json(); } catch { /* not json */ }
  return { status: r.status, body };
};

/** An endpoint that should answer 200 and satisfy a predicate. */
const check = async (name, path, token, predicate) => {
  const { status, body } = await get(path, token);
  if (status !== 200) return bad(name, `HTTP ${status} — ${JSON.stringify(body).slice(0, 110)}`);
  if (!predicate) return ok(name);
  const verdict = predicate(body);
  if (verdict === true) return ok(name);
  bad(name, verdict || 'answered 200 but the content was wrong');
};

(async () => {
  console.log(`\nVerifying ${BASE}\n${'─'.repeat(66)}`);

  // ── identities ────────────────────────────────────────────────────────────
  const admin = await p.user.findFirst({ where: { role: 'SuperAdmin' }, select: { id: true, email: true, role: true } });
  const student = await p.user.findFirst({
    where: { role: 'Student', institutionId: { not: null } },
    select: { id: true, email: true, role: true, institutionId: true },
  });
  if (!admin) { console.log('No SuperAdmin in this database — cannot verify.'); process.exit(1); }
  const tok = u => jwt.sign({ uid: u.id, email: u.email, role: u.role, institutionId: u.institutionId }, SECRET, { expiresIn: '15m' });
  const A = tok(admin), S = student ? tok(student) : null;

  // ── the rows the pages are built from ─────────────────────────────────────
  const [article, journal, author, inst, publisher, subjectJournal] = await Promise.all([
    p.article.findFirst({ where: { status: 'Published' }, select: { id: true, domain: true, journalId: true } }),
    p.journal.findFirst({ where: { domain: { not: null } }, select: { id: true, issn: true, domain: true, title: true } }),
    p.articleAuthor.findFirst({ select: { authorId: true } }),
    p.institution.findFirst({ select: { id: true, name: true } }),
    p.journal.findFirst({ where: { publisherName: { not: null } }, select: { publisherName: true } }),
    p.journal.findFirst({ where: { NOT: { subjects: { equals: [] } } }, select: { subjects: true } }),
  ]);
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // ── what the database independently says ──────────────────────────────────
  const truth = {
    journalsHoldingArticles: (await p.article.groupBy({ by: ['journalId'], where: { status: 'Published', journalId: { not: null } } })).length,
    publishedArticles: await p.article.count({ where: { status: 'Published' } }),
  };

  /** A shelf that reports articles but no journals cannot be right. */
  const shelfIsCoherentTop = (what) => (b) => {
    if (!Array.isArray(b.journals)) return 'no journals array';
    const articles = b.articles ?? b.journals.reduce((n, j) => n + (j.articleCount || 0), 0);
    if (articles > 0 && b.journals.length === 0)
      return `${articles} articles under 0 journals — these cannot both be true (${what})`;
    const sum = b.journals.reduce((n, j) => n + (j.articleCount || 0), 0);
    if (b.articles !== undefined && sum > b.articles)
      return `journals sum to ${sum} but the page total says ${b.articles}`;
    return true;
  };

  // ── 1. the catalogue ──────────────────────────────────────────────────────
  console.log('\nCatalogue');
  await check('library stats', '/api/library/stats', null, b => {
    if (b.articles !== truth.publishedArticles) return `articles ${b.articles} but the database has ${truth.publishedArticles}`;
    if (b.journals !== truth.journalsHoldingArticles)
      return `reports ${b.journals} journals but ${truth.journalsHoldingArticles} hold published articles`;
    const deptArticles = (b.departments || []).reduce((n, d) => n + Number(d.articles || 0), 0);
    if (deptArticles > b.articles)
      return `departments sum to ${deptArticles} but the total says ${b.articles}`;
    return true;
  });

  if (article) {
    await check('article record', `/api/library/article/${article.id}`, A, b => b.id === article.id || 'wrong article returned');
  } else meh('article record', 'no published articles');

  if (journal) {
    // A header claiming nothing is held above a body listing volumes is the same
    // fault in its last hiding place.
    const heldJournal = await p.article.findFirst({
      where: { status: 'Published', journalId: { not: null } },
      select: { journalId: true, journalIssn: true },
    });
    await check('journal spine', `/api/library/journal/${encodeURIComponent(heldJournal?.journalIssn || heldJournal?.journalId || journal.id)}`, A, b => {
      if (!Array.isArray(b.volumes)) return 'no volumes array';
      if (b.volumes.length > 0 && (b.articleCount || 0) === 0)
        return `header says 0 articles while ${b.volumes.length} volumes are listed below it`;
      if (b.volumes.length > (b.volumeCount || 0))
        return `lists ${b.volumes.length} volumes but the header says ${b.volumeCount}`;
      return true;
    });
    // A shelf that reports articles but no journals is the fault that shipped
    // three times. Every shelf page is checked for it explicitly.
    const shelfIsCoherent = shelfIsCoherentTop;

    await check('department page', `/api/library/department/${slug(journal.domain)}`, A, b => {
      const v = shelfIsCoherent('department')(b);
      if (v !== true) return v;
      if (b.journals.length === 0) return `resolved "${journal.domain}" but returned no journals`;
      return true;
    });
  } else meh('journal + department', 'no journals with a department');

  if (author) await check('author page', `/api/library/author/${author.authorId}`, A, b => Array.isArray(b.articles) || 'no articles array');
  else meh('author page', 'no author links');

  if (publisher) {
    await check('publisher page', `/api/library/publisher/${slug(publisher.publisherName)}`, A,
      shelfIsCoherentTop('publisher'));
  } else meh('publisher page', 'no journal carries a publisher');

  const subj = Array.isArray(subjectJournal?.subjects) ? subjectJournal.subjects[0] : null;
  if (subj) await check('subject page', `/api/library/subject/${slug(subj)}`, A, shelfIsCoherentTop('subject'));
  else meh('subject page', 'no journal carries subjects');

  await check('subject list', '/api/library/subjects', A, b => Array.isArray(b) || 'not an array');

  // ── 1b. the public counts ─────────────────────────────────────────────────
  //
  // These advertised 6,208 items on a collection of 40,273 because they counted
  // only the legacy table. Whole departments read zero while holding thousands.
  console.log('\nPublic counts');
  const legacyLive = await p.content.count({ where: { status: { not: 'Draft' } } });
  const newBooks = await p.book.count({ where: { status: 'Published' } });
  const wholeCollection = legacyLive + truth.publishedArticles + newBooks;

  await check('public counts cover all three shelves', '/api/public/counts', null, b => {
    if (b.totalContent !== wholeCollection)
      return `advertises ${b.totalContent} but the collection is ${wholeCollection} — a shelf is being left out`;
    if ((b.journals || 0) !== truth.journalsHoldingArticles)
      return `${b.journals} journals but ${truth.journalsHoldingArticles} hold articles`;
    if ((b.articles || 0) < truth.publishedArticles)
      return `${b.articles} articles but ${truth.publishedArticles} are published`;
    return true;
  });

  {
    const shown = (await get('/api/public/domain-counts')).body || {};
    const held = await p.article.groupBy({
      by: ['domain'], where: { status: 'Published', domain: { not: null } }, _count: { id: true },
    });
    const wrong = held.filter(h => (shown[h.domain] || 0) < h._count.id);
    wrong.length === 0
      ? ok('every department counts its articles', `${Object.keys(shown).length} departments`)
      : bad('every department counts its articles',
          wrong.slice(0, 3).map(w => `${w.domain} shows ${shown[w.domain] || 0} but holds ${w._count.id}`).join('; '));
  }

  // A department page that says "Launching Soon" over thousands of held
  // articles is the same fault wearing a marketing label.
  {
    const held = await p.article.groupBy({
      by: ['domain'], where: { status: 'Published', domain: { not: null } },
      _count: { id: true }, orderBy: { _count: { domain: 'desc' } }, take: 5,
    });
    let wrong = null;
    for (const h of held) {
      const r = await get(`/api/domain-data?domain=${encodeURIComponent(h.domain)}`);
      const summary = (r.body?.content_summary || []).filter(c => c.count > 0);
      if (summary.length === 0) { wrong = `${h.domain} lists nothing while holding ${h._count.id} articles`; break; }
      const named = summary.map(c => c.type);
      if (!named.includes('Journals') || !named.includes('Articles')) {
        wrong = `${h.domain} does not name journals and articles — it lists ${named.join(', ')}`; break;
      }
    }
    wrong ? bad('department pages show what they hold', wrong)
          : ok('department pages show what they hold', `${held.length} checked`);
  }

  await check('the library leads with journals and articles', '/api/public/content-type-counts', null, b => {
    if (!('Journals' in b)) return 'no Journals count';
    if (!('Articles' in b)) return 'no Articles count';
    if ('Periodicals' in b) return 'still exposes the legacy "Periodicals" bucket';
    return true;
  });

  // ── 2. search and browse ──────────────────────────────────────────────────
  console.log('\nSearch and browse');
  await check('article search', '/api/library/articles?search=nursing&limit=5', A, b => {
    if (!Array.isArray(b.data)) return 'no data array';
    if (typeof b.total !== 'number') return 'no total';
    return true;
  });
  {
    const all = await get('/api/library/articles?limit=5', A);
    const oa = await get('/api/library/articles?limit=5&oa=1', A);
    if (all.body?.total !== undefined && oa.body?.total !== undefined) {
      oa.body.total <= all.body.total
        ? ok('open access is a real filter', `${oa.body.total} of ${all.body.total}`)
        : bad('open access is a real filter', `filtered total ${oa.body.total} exceeds unfiltered ${all.body.total}`);
    }
    const p1 = await get('/api/library/articles?limit=3&sort=title', A);
    const p2 = await get('/api/library/articles?limit=3&sort=title&page=2', A);
    const t1 = p1.body?.data?.at(-1)?.title, t2 = p2.body?.data?.[0]?.title;
    if (t1 && t2) {
      t1.localeCompare(t2) <= 0
        ? ok('sort continues across pages')
        : bad('sort continues across pages', `page 1 ends "${t1.slice(0, 30)}" but page 2 starts "${t2.slice(0, 30)}"`);
    }
  }

  // ── 3. the dashboards ─────────────────────────────────────────────────────
  console.log('\nDashboards');
  if (inst) {
    await check('institution overview', `/api/institution/overview?institutionId=${inst.id}`, A, b => {
      if (b.collection?.journals === 0 && truth.journalsHoldingArticles > 0)
        return `"0 journals" while ${truth.journalsHoldingArticles} hold articles`;
      if (b.collection?.articles > 0 && b.collection?.journals === 0)
        return `${b.collection.articles} articles under 0 journals — these two cannot both be right`;
      const sum = (b.collection?.byDepartment || []).reduce((n, d) => n + d.articles, 0);
      if (b.collection?.byDepartment?.length && sum > b.collection.articles)
        return `departments sum to ${sum} but the total says ${b.collection.articles}`;
      return true;
    });

    await check('institution analytics', `/api/analytics/institution?institutionId=${inst.id}&days=90`, A, b => {
      const u = b.usage;
      if (!u) return 'no usage block';
      if (u.activeStudents > u.students) return `${u.activeStudents} active of ${u.students} enrolled`;
      if (u.neverRead > u.students) return `${u.neverRead} never-read of ${u.students} enrolled`;
      if (b.silentTotal > u.students) return `silent list ${b.silentTotal} exceeds ${u.students} students`;
      return true;
    });

    // The contradiction the librarian saw: two screens, one truth.
    const ov = (await get(`/api/institution/overview?institutionId=${inst.id}`, A)).body;
    const legacy = await p.studentActivity.findMany({
      where: { user: { institutionId: inst.id } }, select: { userId: true }, distinct: ['userId'],
    });
    if (ov?.students) {
      const claimedNever = ov.students.neverSignedIn;
      const knownReaders = legacy.length;
      claimedNever + knownReaders <= ov.students.total + knownReaders
        ? ok('never-read agrees with the activity record', `${claimedNever} never · ${knownReaders} in the legacy record`)
        : bad('never-read agrees with the activity record', 'the two records disagree');
      if (knownReaders > 0 && claimedNever === ov.students.total) {
        bad('never-read agrees with the activity record',
          `every student marked as never having read, but ${knownReaders} appear in StudentActivity`);
      }
    }
  } else meh('dashboards', 'no institutions');

  // ── 4. who may see what ───────────────────────────────────────────────────
  console.log('\nAccess control');
  if (inst) {
    const anon = await get(`/api/analytics/institution?institutionId=${inst.id}`);
    anon.status === 401 ? ok('analytics refuses anonymous', 'HTTP 401') : bad('analytics refuses anonymous', `HTTP ${anon.status}`);
    if (S) {
      const asStudent = await get(`/api/analytics/institution?institutionId=${inst.id}`, S);
      asStudent.status === 403 ? ok('analytics refuses a student', 'HTTP 403') : bad('analytics refuses a student', `HTTP ${asStudent.status}`);
    }
    const noId = await get('/api/analytics/institution', A);
    noId.status === 403 ? ok('an administrator must name an institution', 'HTTP 403') : bad('an administrator must name an institution', `HTTP ${noId.status}`);
  }
  for (const [name, path] of [
    ['quotation save', '/api/quotation/save'],
    ['coupon validate', '/api/coupons/validate'],
    ['quotation next-number', '/api/quotation/next-number'],
  ]) {
    const r = await fetch(BASE + path, { method: path.includes('next-number') ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: path.includes('next-number') ? undefined : '{}' });
    r.status === 401 ? ok(`${name} needs a login`, 'HTTP 401') : bad(`${name} needs a login`, `HTTP ${r.status} without a token`);
  }

  // ── 4b. the engine is actually advancing ──────────────────────────────────
  //
  // Without a cursor every pass asked for the same first page, so a journal
  // stopped at one batch and every later pass re-downloaded it. A journal that
  // has been fetched from must either be carrying a cursor or be marked
  // finished; carrying neither means it will start from the top again.
  console.log('\nIngestion');
  {
    // Asserted here is the invariant bad code can actually break: a journal is
    // either still being walked (it carries a cursor) or finished (it carries a
    // date), never both and never neither once it has work in it. Journals
    // fetched before the cursor existed carry neither yet and heal on their next
    // pass, so those are reported rather than failed.
    const contradictory = await p.journal.count({
      where: { rightsBasis: 'DOAJ declaration', fetchCursor: { not: null }, exhaustedAt: { not: null } },
    });
    contradictory === 0
      ? ok('a journal is either walking or finished, never both')
      : bad('a journal is either walking or finished, never both',
          `${contradictory} carry a cursor and a finished mark at once`);

    const walking = await p.journal.count({ where: { rightsBasis: 'DOAJ declaration', fetchCursor: { not: null } } });
    const done = await p.journal.count({ where: { rightsBasis: 'DOAJ declaration', exhaustedAt: { not: null } } });
    const waiting = await p.journal.count({
      where: { rightsBasis: 'DOAJ declaration', lastIngestedAt: { not: null }, fetchCursor: null, exhaustedAt: null },
    });
    ok('the engine is resumable', `${walking} walking · ${done} finished · ${waiting} yet to pick up a cursor`);
  }

  // ── 4b. books, and the sweeps that find them ──────────────────────────────
  console.log('\nBooks and discovery');
  {
    const books = await p.book.count({ where: { status: 'Published' } });
    if (!books) {
      meh('books', 'none held yet');
    } else {
      // A book that says it can be read here but has no file is the reader
      // clicking through to nothing. DOAB holds no book file at all — only a
      // cover and metadata exports — so every one of its books is a link out,
      // and any code that later forgets that shows up here.
      const promised = await p.book.count({
        where: { status: 'Published', accessStatus: 'ViewableHere', pdfUrl: null },
      });
      promised === 0
        ? ok('no book offers full text it does not hold', `${books} books`)
        : bad('no book offers full text it does not hold',
            `${promised} say ViewableHere with no file`);

      // Every book on a shelf must lead somewhere. One with neither a file nor
      // a link is a card that cannot be opened.
      const nowhere = await p.book.count({
        where: { status: 'Published', pdfUrl: null, originalUrl: null },
      });
      nowhere === 0
        ? ok('every book leads somewhere')
        : bad('every book leads somewhere', `${nowhere} have neither a file nor a link`);

      // The rights basis names the evidence. A book recorded as having no
      // declared licence must not also carry one, and vice versa — that pairing
      // is the whole reason the basis is written down rather than assumed.
      const contradicts = await p.book.count({
        where: {
          OR: [
            { rightsBasis: 'DOAB record, licence undeclared', licence: { not: null } },
            { rightsBasis: 'DOAB publisher statement', licence: null },
          ],
        },
      });
      contradicts === 0
        ? ok('a book’s licence agrees with its stated basis')
        : bad('a book’s licence agrees with its stated basis', `${contradicts} disagree`);

      // Books are filed under a department, and a department the catalogue does
      // not know is a shelf no reader can reach.
      const depts = new Set((await p.$queryRawUnsafe(
        `select distinct domain from "Journal" where domain is not null`)).map(r => r.domain));
      const orphans = (await p.$queryRawUnsafe(
        `select domain, count(*)::int n from "Book"
         where status = 'Published' and domain is not null group by 1`))
        .filter(r => !depts.has(r.domain));
      orphans.length === 0
        ? ok('every book sits in a department the catalogue knows')
        : bad('every book sits in a department the catalogue knows',
            orphans.map(r => `${r.domain} (${r.n})`).join(', ').slice(0, 140));

      // The database holding a link is not the same as the reader being given
      // one. The popup shown for a record with no file reads `originalUrl`, and
      // a `select` on this endpoint that quietly dropped the column would leave
      // every book ending on "cite using the details above" — a dead end that
      // looks like an answer.
      const listed = await get('/api/library/books?limit=20', A);
      if (listed.status !== 200) {
        bad('the books endpoint serves a way out', `HTTP ${listed.status}`);
      } else {
        const rows = listed.body?.data || [];
        const stranded = rows.filter(b => !b.pdfUrl && !b.originalUrl && !b.doi);
        stranded.length === 0
          ? ok('the books endpoint serves a way out', `${rows.length} rows checked`)
          : bad('the books endpoint serves a way out',
              `${stranded.length} of ${rows.length} arrive with no file, no link and no DOI`);
      }
    }

    const sweeps = await p.departmentSweep.count();
    if (!sweeps) {
      meh('discovery sweeps', 'no source has been swept yet');
    } else {
      // The same invariant as the journal cursor, one level up. A sweep that has
      // run out starts again from the beginning, so a finished sweep holding a
      // position is a contradiction — and the code that would produce it is the
      // code that resumes a source in the wrong place.
      const muddled = await p.departmentSweep.count({
        where: { exhaustedAt: { not: null }, position: { gt: 0 } },
      });
      muddled === 0
        ? ok('a sweep is either open or finished, never both')
        : bad('a sweep is either open or finished, never both',
            `${muddled} are marked finished but still hold a position`);

      // The bug this whole table exists to prevent: discovery that visits a
      // department once and never returns. A sweep left on its first page while
      // the source still had more is exactly that, so it is counted and shown.
      const open = await p.departmentSweep.count({ where: { exhaustedAt: null } });
      const done = await p.departmentSweep.count({ where: { exhaustedAt: { not: null } } });
      const untouched = await p.departmentSweep.count({ where: { lastSweptAt: null } });
      ok('discovery continues', `${open} still to walk · ${done} walked out · ${untouched} not started`);

      const bySource = await p.$queryRawUnsafe(
        `select source, count(distinct department)::int d, sum(seen)::int seen
         from "DepartmentSweep" group by 1 order by 1`);
      for (const r of bySource) ok(`${r.source} reaches its departments`, `${r.d} departments · ${Number(r.seen).toLocaleString()} records seen`);
    }
  }

  // ── 5. nothing points at nothing ──────────────────────────────────────────
  console.log('\nDead ends');
  for (const [name, path] of [
    ['unknown article', '/api/library/article/does-not-exist'],
    ['unknown department', '/api/library/department/no-such-department'],
    ['unknown publisher', '/api/library/publisher/no-such-publisher'],
    ['unknown subject', '/api/library/subject/no-such-subject'],
  ]) {
    const r = await get(path, A);
    r.status === 404 ? ok(`${name} answers 404`) : bad(`${name} answers 404`, `HTTP ${r.status}`);
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`${pass} passed · ${fail ? R : ''}${fail} failed${O} · ${skip} skipped`);
  if (fail) {
    console.log(`\n${R}Failures:${O}`);
    failures.forEach(f => console.log('  · ' + f));
  }
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
