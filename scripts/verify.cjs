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

const n = x => Number(x || 0).toLocaleString();
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

/** How much the catalogue holds right now, across all three shelves. */
const catalogueSize = async () => {
  const [a, b, c] = await Promise.all([p.article.count(), p.book.count(), p.content.count()]);
  return a + b + c;
};

(async () => {
  console.log(`\nVerifying ${BASE}\n${'─'.repeat(66)}`);

  // Several checks compare what an endpoint advertises against what the database
  // holds, and those two are only comparable if the collection is standing
  // still. Run this while ingestion is writing and they disagree by whatever was
  // added in between — which looks exactly like the counting bug they exist to
  // catch, and cost a re-run to tell apart. So the size is taken before and
  // after, and any drift is named at the end rather than left to be guessed at.
  const sizeAtStart = await catalogueSize();

  // ── identities ────────────────────────────────────────────────────────────
  const admin = await p.user.findFirst({ where: { role: 'SuperAdmin' }, select: { id: true, email: true, role: true } });
  const student = await p.user.findFirst({
    where: { role: 'Student', institutionId: { not: null } },
    select: { id: true, email: true, role: true, institutionId: true },
  });
  const reader = await p.user.findFirst({
    where: { role: 'Subscriber' },
    select: { id: true, email: true, role: true, institutionId: true },
  });
  if (!admin) { console.log('No SuperAdmin in this database — cannot verify.'); process.exit(1); }
  const tok = u => jwt.sign({ uid: u.id, email: u.email, role: u.role, institutionId: u.institutionId }, SECRET, { expiresIn: '15m' });
  const A = tok(admin), S = student ? tok(student) : null, R = reader ? tok(reader) : null;

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
  // The shelf is the new collection plus the archived one — a reader opens
  // both — so that is what the total has to be. Checking it against the Article
  // table alone was checking half the library.
  const archivedPeriodicals = await p.content.count({
    where: { contentType: 'Periodicals', status: { not: 'Draft' } },
  });
  const archivedBooks = await p.content.count({
    where: { contentType: 'Books', status: { not: 'Draft' } },
  });
  const wholeShelf = {
    articles: truth.publishedArticles + archivedPeriodicals,
    books: (await p.book.count({ where: { status: 'Published' } })) + archivedBooks,
  };

  await check('library stats', '/api/library/stats', null, b => {
    if (b.articles !== wholeShelf.articles)
      return `articles ${b.articles} but the shelf holds ${wholeShelf.articles} (${truth.publishedArticles} new + ${archivedPeriodicals} archived)`;
    if (b.books !== wholeShelf.books)
      return `books ${b.books} but the shelf holds ${wholeShelf.books}`;
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
      // The card on the preview shows an author count where it used to show a
      // journal count; a department with articles must be able to name people.
      if (b.articles > 0 && !(b.authors > 0)) return `${b.articles} articles but no authors counted`;
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

  // The journals filter must offer the journals that actually hold articles.
  // It used to take five hundred titles alphabetically and then drop the empty
  // ones, so a department whose one stocked journal sorted past the five
  // hundredth offered nothing at all. The database is asked the same question
  // independently, department by department.
  {
    const holding = await p.$queryRawUnsafe(
      `select j.domain, count(distinct a."journalId")::int n
       from "Article" a join "Journal" j on j.id = a."journalId"
       where a.status = 'Published' and j.domain is not null
       group by 1 order by 2 desc`);
    const empty = [];
    for (const row of holding.slice(0, 8)) {
      const r = await get(`/api/library/journals?domain=${encodeURIComponent(row.domain)}`, A);
      const offered = Array.isArray(r.body) ? r.body.length : 0;
      if (offered === 0) empty.push(`${row.domain} holds ${row.n} but offers none`);
    }
    empty.length === 0
      ? ok('the journals filter offers what is stocked', `${Math.min(holding.length, 8)} departments`)
      : bad('the journals filter offers what is stocked', empty.join('; ').slice(0, 160));
  }

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

  // Three screens counted the same shelf three ways and disagreed in public:
  // the home page said 50,307 articles and 5,982 books while the library and
  // the librarian's dashboard said 49,701 and 5,797. The difference was the
  // archived collection, which only one of them was adding. Whatever the
  // definition is, it has to be one definition.
  {
    const surfaces = await Promise.all([
      get('/api/public/counts', null),
      get('/api/library/stats', null),
    ]);
    const [pub, lib] = surfaces.map(r => r.body || {});
    // The total went the same way the parts did: written out separately in
    // each place, and so free to disagree.
    const same = ['journals', 'articles', 'books'].every(k => pub[k] === lib[k])
      && pub.totalContent === lib.total;
    same
      ? ok('every screen quotes the same collection',
          `${n(pub.totalContent)} items · ${n(pub.journals)} journals · ${n(pub.articles)} articles · ${n(pub.books)} books`)
      : bad('every screen quotes the same collection',
          `home says ${pub.articles} articles / ${pub.books} books, the library says ${lib.articles} / ${lib.books}`);
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

  // ── the people who were already paying ────────────────────────────────────
  console.log('\nSubscribers');
  {
    // The clock is lifted by *having an active subscription*, not by a flag
    // somebody has to set — so nobody needed converting to Pro when the free
    // tier arrived. That is a good design only for as long as it stays true,
    // and the cost of it quietly ceasing to be true is a paying customer
    // watching a thirty-minute timer. So it is asked, of every one of them,
    // rather than assumed.
    const live = await p.subscription.findMany({
      where: { status: 'Active', endDate: { gt: new Date() }, userId: { not: null } },
      select: { userId: true, planName: true, endDate: true },
    });
    if (!live.length) meh('no paying member is on the clock', 'no live subscriptions');
    else {
      const timed = [];
      for (const sub of live) {
        const u = await p.user.findUnique({
          where: { id: sub.userId }, select: { id: true, email: true, role: true, institutionId: true },
        });
        if (!u) continue;
        const a = (await get('/api/me/allowance', tok(u))).body || {};
        if (a.timed) timed.push(`${u.email} (${sub.planName || 'a plan'})`);
      }
      timed.length
        ? bad('no paying member is on the clock', `${timed.length} on the clock: ${timed.slice(0, 3).join(', ')}`)
        : ok('no paying member is on the clock', `${live.length} live subscriptions checked`);
    }

    // A subscription attached to nobody is a subscription somebody paid for and
    // nobody holds — the shape /api/domain-request used to create. Those
    // members are on the clock and there is no screen on which that looks like
    // anything but a bug.
    const orphans = await p.subscription.count({
      where: { status: 'Active', endDate: { gt: new Date() }, userId: null, institutionId: null },
    });
    orphans === 0
      ? ok('every live subscription belongs to somebody')
      : bad('every live subscription belongs to somebody', `${orphans} attached to neither a member nor an institution`);
  }

  // ── the admin's members screen ────────────────────────────────────────────
  console.log('\nMembers');
  {
    // The screen used to filter and export the fifty rows it had in hand. The
    // filters are the database's job now, and these figures are what a mailing
    // is judged by — so they have to agree with the database and with each
    // other. The first version of the summary strip did not: filtering to
    // "never opened anything" and then counting "have read something" threw the
    // filter away, and the fourth tile read minus one hundred and six.
    const all = (await get('/api/admin/users?limit=1', A)).body || {};
    const never = (await get('/api/admin/users?limit=1&active=never', A)).body || {};
    const trueTotal = await p.user.count();
    const trueNever = await p.user.count({ where: { lastReadAt: null } });

    const wrong =
      all.counts?.matching !== trueTotal ? `says ${all.counts?.matching} members, the database has ${trueTotal}`
      : all.counts.everRead + all.counts.neverRead !== all.counts.matching
        ? `${all.counts.everRead} read + ${all.counts.neverRead} never ≠ ${all.counts.matching} matching`
      : never.counts?.matching !== trueNever ? `filtering to never-read gives ${never.counts?.matching}, the database says ${trueNever}`
      : never.counts.everRead !== 0 ? `among members who never read anything, ${never.counts.everRead} are counted as having read`
      : null;
    wrong ? bad('the members screen counts the database', wrong)
          : ok('the members screen counts the database',
              `${n(trueTotal)} members · ${n(all.counts.everRead)} have read something · ${n(trueNever)} never did`);

    // The export is the artefact that leaves the building — a mailing list, a
    // report to somebody. It must be the whole answer, not the page.
    const csv = await fetch(`${BASE}/api/admin/users?format=csv&active=never`, {
      headers: { Authorization: `Bearer ${A}` },
    }).then(r => r.text()).catch(() => '');
    const lines = csv.trim().split('\n').length - 1; // less the header
    lines === trueNever
      ? ok('the export is the whole answer', `${n(lines)} rows for a filter matching ${n(trueNever)}`)
      : bad('the export is the whole answer', `exported ${lines} rows for a filter matching ${trueNever}`);
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

    // The department chart plots each department's whole holding, so the
    // departments have to add up to the library — a chart that sums to more
    // than the collection it is drawn from is counting something twice, and a
    // librarian reading it would never know.
    {
      const b = (await get(`/api/institution/overview?institutionId=${inst.id}`, A)).body;
      const rows = b?.collection?.byDepartment || [];
      if (!rows.length) meh('departments add up to the library', 'no departments');
      else {
        const part = k => rows.reduce((t, r) => t + Number(r[k] || 0), 0);
        const bad1 = rows.find(r => r.total !== r.articles + r.books + r.other);
        const total = part('total');
        bad1 ? bad('departments add up to the library',
                `${bad1.name} says ${bad1.total} but its shelves are ${bad1.articles}+${bad1.books}+${bad1.other}`)
          : total > b.collection.total
            ? bad('departments add up to the library',
                `departments hold ${n(total)} of a library of ${n(b.collection.total)}`)
            : part('articles') > b.collection.articles || part('books') > b.collection.books
              ? bad('departments add up to the library',
                  `shelves disagree: ${n(part('articles'))}/${n(part('books'))} by department vs ${n(b.collection.articles)}/${n(b.collection.books)} in all`)
              : ok('departments add up to the library',
                  `${rows.length} departments · ${n(total)} of ${n(b.collection.total)}`);
      }
    }

    await check('institution analytics', `/api/analytics/institution?institutionId=${inst.id}&days=90`, A, b => {
      const u = b.usage;
      if (!u) return 'no usage block';
      if (u.activeStudents > u.students) return `${u.activeStudents} active of ${u.students} enrolled`;
      if (u.neverRead > u.students) return `${u.neverRead} never-read of ${u.students} enrolled`;
      if (b.silentTotal > u.students) return `silent list ${b.silentTotal} exceeds ${u.students} students`;
      return true;
    });

    // The reader's dashboard headlined "Accessible items 20" on a library of
    // 61,706 — it was counting the page of results it had just fetched — and
    // "Departments covered 29", the number of departments the product has,
    // including those holding nothing. Both now come from the collection.
    if (R) {
      const b = (await get('/api/user/dashboard', R)).body || {};
      const pub = (await get('/api/public/counts', null)).body || {};
      const rows = b.collection?.byDepartment || [];
      const readEvents = await p.libraryEvent.groupBy({
        by: ['itemId'], where: { userId: reader.id, kind: 'view', itemId: { not: null } },
      });
      !b.collection
        ? bad('the reader is told the size of the library', 'no collection block')
        : b.collection.total !== pub.totalContent
          ? bad('the reader is told the size of the library',
              `the dashboard says ${n(b.collection.total)} and the home page says ${n(pub.totalContent)}`)
          : b.departmentsCovered !== rows.length
            ? bad('the reader is told the size of the library',
                `${b.departmentsCovered} departments covered but ${rows.length} hold anything`)
            : b.itemsRead > readEvents.length + 200
              ? bad('the reader is told the size of the library',
                  `claims ${b.itemsRead} items read against ${readEvents.length} distinct views`)
              : ok('the reader is told the size of the library',
                  `${n(b.collection.total)} items · ${b.departmentsCovered} departments · ${b.itemsRead} read`);
    } else meh('the reader is told the size of the library', 'no subscriber');

    // "Worth opening next" makes two claims about every row it shows: that the
    // item exists, and what the number beside it counts. A recommendation
    // pointing at a deleted id, or a read count invented for a shelf nobody has
    // opened, is the kind of wrong that looks perfectly fine on screen.
    if (R) {
      const t = (await get('/api/library/trending', R)).body || {};
      const depts = t.departments || [];
      if (!depts.length) meh('what to read next is real', 'nothing recommended');
      else {
        const items = depts.flatMap(d => d.items.map(i => ({ ...i, basis: d.basis, dept: d.name })));
        const missing = [];
        for (const i of items) {
          const table = i.type === 'article' ? p.article : i.type === 'book' ? p.book : p.content;
          if (!(await table.findUnique({ where: { id: i.id }, select: { id: true } }))) missing.push(i.title);
        }
        const wrongBasis = items.find(i => (i.basis === 'read' ? !(i.reads >= 1) : !i.at));
        missing.length
          ? bad('what to read next is real', `${missing.length} recommended items do not exist: ${missing[0]}`)
          : wrongBasis
            ? bad('what to read next is real', `${wrongBasis.dept} is labelled ${wrongBasis.basis} but carries no such figure`)
            : ok('what to read next is real',
                `${depts.length} departments · ${items.length} items · ${depts.filter(d => d.basis === 'read').length} from reads`);
      }
    } else meh('what to read next is real', 'no subscriber');

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

      // A cover belongs to one book. Two books wearing the same one is the
      // signature of a join that did not join — and that is exactly what
      // happened: the key was `id` where DOAB calls it `uuid`, so the map held a
      // single entry under `undefined`, every record matched it, and 3,974 books
      // shared 54 covers between them. Nothing in the data was malformed and no
      // request failed; only looking at the page showed it. This asks the
      // question that would have.
      const sharedCovers = await p.$queryRawUnsafe(
        `select count(*)::int shared, coalesce(sum(n), 0)::int affected from (
           select "coverUrl", count(*)::int n from "Book"
           where "coverUrl" is not null group by 1 having count(*) > 1) t`);
      const sc = sharedCovers[0];
      sc.shared === 0
        ? ok('a cover belongs to one book',
            `${await p.book.count({ where: { coverUrl: { not: null } } })} covers`)
        : bad('a cover belongs to one book',
            `${sc.affected} books share ${sc.shared} covers between them`);

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
  // A menu item that leads out of its own shell is a dead end no request can
  // report: /dashboard/* sends an Institution account straight back to
  // /institution, so "Membership" looked like a broken page rather than a link
  // pointing at the wrong copy of a working one. This is the one check here
  // that reads the source, because the failure never reaches the server.
  {
    const fs = require('fs'), path = require('path');
    const dir = 'src/components/institution';
    const offenders = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.tsx')) continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/['"`](\/dashboard\/[a-z-]*)['"`]/g)) offenders.push(`${f} → ${m[1]}`);
    }
    offenders.length
      ? bad('the institution shell keeps to itself', offenders.join(', '))
      : ok('the institution shell keeps to itself', 'no links into /dashboard');
  }

  console.log('\nAdmin journal directory');
  {
    const inDb = await p.journal.count();
    const all = (await get('/api/admin/journals?limit=10', A)).body || {};
    all.catalogue === inDb && all.total === inDb
      ? ok('lists every journal in the database', `${inDb} journals`)
      : bad('lists every journal in the database', `database ${inDb}, page says ${all.catalogue}/${all.total}`);
    const summed = (all.departments || []).reduce((s, d) => s + d.count, 0);
    summed === inDb
      ? ok('department counts add up to the whole', `${(all.departments || []).length} departments`)
      : bad('department counts add up to the whole', `${summed} vs ${inDb}`);
    const top = (all.departments || []).find(d => d.name);
    if (top) {
      const one = (await get(`/api/admin/journals?limit=10&domain=${encodeURIComponent(top.name)}`, A)).body || {};
      const inDept = await p.journal.count({ where: { domain: top.name } });
      one.total === inDept && one.total === top.count && (one.journals || []).every(j => j.domain === top.name)
        ? ok('the department filter matches its count', `${top.name}: ${inDept}`)
        : bad('the department filter matches its count', `${top.name}: list ${one.total}, panel ${top.count}, database ${inDept}`);
      const csv = await fetch(`${BASE}/api/admin/journals?format=csv&domain=${encodeURIComponent(top.name)}`, { headers: { Authorization: `Bearer ${A}` } });
      const rows = (await csv.text()).trim().split('\n').length - 1;
      rows >= inDept
        ? ok('the export holds the whole department', `${rows} rows`)
        : bad('the export holds the whole department', `${rows} rows for ${inDept} journals`);
    }
    const r = await get('/api/admin/journals', S || R);
    r.status === 403 ? ok('readers cannot open it', 'HTTP 403') : bad('readers cannot open it', `HTTP ${r.status}`);
  }

  console.log('\nIngestion: the whole DOAJ list, and the per-journal limit');
  {
    const st = (await get('/api/admin/ingest/state', A)).body || {};
    Number.isInteger(st.articlesPerJournal)
      ? ok('the engine has a per-journal limit', `${st.articlesPerJournal || 'no limit'}`)
      : bad('the engine has a per-journal limit', 'articlesPerJournal missing from the state');
    if (st.articlesPerJournal > 0) {
      const over = await p.journal.count({ where: { articleCount: { gt: st.articlesPerJournal }, lastIngestedAt: { gte: new Date(Date.now() - 864e5) }, exhaustedAt: null } });
      over === 0 ? ok('no journal fetched today is still open past the limit')
        : bad('no journal fetched today is still open past the limit', `${over} journals`);
    }
    const job = await get('/api/admin/ingest/doaj-catalogue', A);
    job.status === 200 ? ok('the DOAJ import reports its status', job.body?.job ? (job.body.job.running ? 'running' : 'finished') : 'not run since start')
      : bad('the DOAJ import reports its status', `HTTP ${job.status}`);
    const r = await get('/api/admin/ingest/doaj-catalogue', S || R);
    r.status === 403 ? ok('readers cannot start an import', 'HTTP 403') : bad('readers cannot start an import', `HTTP ${r.status}`);
  }

  console.log('\nMarketing mail');
  {
    const list = await get('/api/admin/email-templates', A);
    Array.isArray(list.body) && list.body.length >= 5
      ? ok('the ready mails are listed', `${list.body.length} templates`)
      : bad('the ready mails are listed', `HTTP ${list.status} — ${JSON.stringify(list.body).slice(0, 90)}`);

    const closed = await get('/api/admin/email-templates', S || R);
    closed.status === 403 ? ok('readers cannot list them', 'HTTP 403') : bad('readers cannot list them', `HTTP ${closed.status}`);

    // Rendered against a real member, and it must not write anything.
    const member = await p.user.findFirst({ where: { role: 'Institution' }, select: { id: true, unsubscribeToken: true } })
      || await p.user.findFirst({ where: { role: { notIn: ['SuperAdmin', 'Admin'] } }, select: { id: true, unsubscribeToken: true } });
    if (!member) meh('a mail renders for a member', 'no member to render for');
    else {
      const pv = await get(`/api/admin/email-templates/profile-incomplete/preview?userId=${member.id}`, A);
      const html = pv.body?.html || '';
      pv.status === 200 && pv.body?.subject && html.includes('unsubscribe/')
        ? ok('a mail renders for a member, with a way out', `"${String(pv.body.subject).slice(0, 44)}…"`)
        : bad('a mail renders for a member, with a way out', `HTTP ${pv.status} — ${JSON.stringify(pv.body).slice(0, 90)}`);

      // With nobody named it still renders, against a stand-in who fits that
      // mail's audience — the screen shows the mail before a member is picked.
      const blind = await get('/api/admin/email-templates/never-read/preview', A);
      blind.status === 200 && blind.body?.html && blind.body?.member
        ? ok('a mail renders before a member is chosen', `stood in: ${blind.body.member.email}`)
        : bad('a mail renders before a member is chosen', `HTTP ${blind.status}`);

      const after = await p.user.findUnique({ where: { id: member.id }, select: { unsubscribeToken: true } });
      after.unsubscribeToken === member.unsubscribeToken
        ? ok('a preview writes nothing to the member')
        : bad('a preview writes nothing to the member', 'the unsubscribe token changed while previewing');
    }

    // The history an admin actually reads: one row per member, their mails
    // carried with them.
    const grouped = await get('/api/admin/email-sends/by-member?limit=25', A);
    const gm = grouped.body?.members || [];
    const ids = gm.map(r => r.member?.id);
    const once = new Set(ids).size === ids.length;
    grouped.status === 200 && once
      ? ok('the history groups by member, each listed once', `${gm.length} members, ${n(grouped.body?.total)} mails`)
      : bad('the history groups by member, each listed once', grouped.status !== 200 ? `HTTP ${grouped.status}` : 'a member appears twice');
    const carried = gm.every(r => Array.isArray(r.sends) && r.sends.length === r.total);
    carried ? ok('each member carries their own mails', gm.length ? `up to ${Math.max(...gm.map(r => r.total))} for one member` : 'none yet')
      : bad('each member carries their own mails', 'a row\'s count does not match the mails under it');

    // No mail may carry a link to whatever machine sent it. APP_URL on a
    // laptop is http://localhost:3000, and those links went out to real
    // inboxes, dead for everyone but the sender.
    {
      const bad_links = [];
      for (const t of (list.body || [])) {
        const pv = await get(`/api/admin/email-templates/${t.key}/preview`, A);
        const html = pv.body?.html || '';
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
        const local = hrefs.filter(h => /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d+\.|::1/i.test(h));
        if (local.length) bad_links.push(`${t.key}: ${local[0]}`);
      }
      bad_links.length
        ? bad('no mail links back to this machine', bad_links.join(' · '))
        : ok('no mail links back to this machine', `${(list.body || []).length} templates checked`);

      // The logo travels as an attachment, which a browser cannot resolve —
      // the preview has to be given the hosted copy or it shows a broken image.
      const withCid = await get('/api/admin/email-templates/profile-incomplete/preview', A);
      String(withCid.body?.html || '').includes('cid:')
        ? bad('the preview shows the logo', 'the preview still carries cid:, which a browser cannot render')
        : ok('the preview shows the logo', 'no cid: left in the preview');
    }

    const hist = await get('/api/admin/email-sends?limit=10', A);
    hist.status === 200 && Array.isArray(hist.body?.sends)
      ? ok('the send history answers', `${n(hist.body.total)} records`)
      : bad('the send history answers', `HTTP ${hist.status}`);

    // One member's file: what has gone, what is still due, and why.
    const anyone = await p.user.findFirst({
      where: { role: { notIn: ['SuperAdmin', 'Admin'] } }, select: { id: true },
    });
    if (!anyone) meh("a member's mail file", 'no member to read');
    else {
      const f = await get(`/api/admin/members/${anyone.id}/mail`, A);
      const ts = f.body?.templates || [];
      ts.length >= 5 && ts.every(t => typeof t.due === 'boolean' && t.why)
        ? ok("a member's mail file says what is still due", `${ts.filter(t => t.due).length} of ${ts.length} due`)
        : bad("a member's mail file says what is still due", `HTTP ${f.status} — ${JSON.stringify(f.body).slice(0, 90)}`);

      // Every template send also writes an EmailLog row; the file must not
      // show that mail twice.
      const seen = new Set();
      const dupe = (f.body?.timeline || []).find(r => {
        const k = `${r.title}|${String(r.at).slice(0, 16)}`;
        if (seen.has(k)) return true;
        seen.add(k); return false;
      });
      dupe ? bad('the file shows each mail once', `"${String(dupe.title).slice(0, 40)}" appears twice`)
        : ok('the file shows each mail once', `${(f.body?.timeline || []).length} mails`);

      const shut = await get(`/api/admin/members/${anyone.id}/mail`, S || R);
      shut.status === 403 ? ok('readers cannot read it', 'HTTP 403') : bad('readers cannot read it', `HTTP ${shut.status}`);
    }

    // The engine that sends without being asked: its switches, and a dry run
    // that must report who is due and write nothing.
    {
      const eng = await get('/api/admin/email-engine', A);
      const rules = eng.body?.rules || [];
      eng.status === 200 && rules.length >= 3
        ? ok('the engine reports its journeys', `${rules.length} journeys, ${rules.filter(r => r.enabled).length} on`)
        : bad('the engine reports its journeys', `HTTP ${eng.status} — ${JSON.stringify(eng.body).slice(0, 80)}`);

      const before = await p.emailSend.count();
      const r = await fetch(`${BASE}/api/admin/email-engine/run`, {
        method: 'POST', headers: { Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const dry = await r.json().catch(() => null);
      const after = await p.emailSend.count();
      after === before
        ? ok('a dry run sends nothing', `${n(dry?.wouldSend || 0)} would go out`)
        : bad('a dry run sends nothing', `${after - before} rows were written`);

      // One member, one mail a pass: somebody who qualifies for three journeys
      // must not be offered three mails the cap would then refuse.
      const seen = new Map();
      for (const j of (dry?.journeys || [])) for (const e of (j.examples || [])) {
        seen.set(e.email, (seen.get(e.email) || 0) + 1);
      }
      const doubled = [...seen.entries()].filter(([, n2]) => n2 > 1).map(([e]) => e);
      doubled.length
        ? bad('nobody is due two mails at once', doubled.slice(0, 3).join(', '))
        : ok('nobody is due two mails at once', `${seen.size} members named`);

      const named = (dry?.journeys || []).every(j => typeof j.due === 'number' && j.name);
      named ? ok('the dry run names who is due', `${(dry?.journeys || []).length} journeys examined`)
        : bad('the dry run names who is due', 'a journey came back without a count');

      const shut = await get('/api/admin/email-engine', S || R);
      shut.status === 403 ? ok('readers cannot reach the engine', 'HTTP 403') : bad('readers cannot reach the engine', `HTTP ${shut.status}`);
    }

    const bogus = await get('/api/public/unsubscribe/not-a-real-token');
    bogus.status === 404 ? ok('a bogus unsubscribe link is refused', 'HTTP 404') : bad('a bogus unsubscribe link is refused', `HTTP ${bogus.status}`);
  }

  console.log('\nRecords anybody can open');
  {
    // Every link on the public side used to land on the browse screen, because
    // nothing in the library had a page of its own.
    const bk = await p.book.findFirst({ where: { status: 'Published' }, select: { id: true, title: true } });
    if (!bk) meh('a book has a page of its own', 'no published book');
    else {
      const r = await get(`/api/library/book/${bk.id}`);
      r.status === 200 && r.body?.book?.title
        ? ok('a book has a page of its own', `"${String(r.body.book.title).slice(0, 40)}" · ${(r.body.alongside || []).length} alongside`)
        : bad('a book has a page of its own', `HTTP ${r.status}`);

      // The publisher's brief to its own copywriter is not a blurb.
      const d = String(r.body?.book?.description || '');
      /promotional forms|consumer-friendly terms|^ca\. \d+ words/i.test(d)
        ? bad('a blurb is a blurb', 'the description still carries the publisher\'s instructions')
        : ok('a blurb is a blurb');
    }

    if (!article) meh('an article has a page of its own', 'no published article');
    else {
      const r = await get(`/api/library/article/${article.id}`);
      r.status === 200 && r.body?.id === article.id
        ? ok('an article has a page of its own', 'readable without signing in')
        : bad('an article has a page of its own', `HTTP ${r.status}`);
    }

    const gone = await get('/api/library/book/not-a-real-book');
    gone.status === 404 ? ok('an unknown book answers 404') : bad('an unknown book answers 404', `HTTP ${gone.status}`);
  }

  console.log('\nWho is with us');
  {
    const inst = await get('/api/library/institutions');
    const body = inst.body || {};
    const held = await p.institution.count({ where: { status: 'Active' } });
    inst.status === 200 && typeof body.total === 'number'
      ? ok('the institutions answer', `${n(body.total)} shown of ${n(held)} accounts · ${n(body.members)} members`)
      : bad('the institutions answer', `HTTP ${inst.status}`);

    // Only institutions whose people have actually joined, because that is what
    // the page says underneath the list.
    const empty = (body.institutions || []).filter(i => !i.members).length;
    empty === 0 ? ok('every institution shown has members') : bad('every institution shown has members', `${empty} with none`);

    // The kind is guessed from the name; the guess must at least be one of the
    // kinds the page knows how to label.
    const kinds = new Set(['University', 'College', 'Institute', 'School', 'Organisation']);
    const odd = (body.institutions || []).find(i => !kinds.has(i.kind));
    odd ? bad('every institution has a known kind', `${odd.name}: ${odd.kind}`) : ok('every institution has a known kind');

    // Only designations the signup actually offers, never somebody's free text.
    Array.isArray(body.designations)
      ? ok('the designations answer', body.designations.length
          ? body.designations.slice(0, 4).map(d => d.name).join(', ')
          : 'none recorded yet')
      : bad('the designations answer', 'no designations in the response');

    const summed = Object.values(body.byKind || {}).reduce((a, b) => a + b, 0);
    summed === body.total ? ok('the kinds add up to the total', `${summed}`) : bad('the kinds add up to the total', `${summed} vs ${body.total}`);
  }

  console.log('\nThe blog');
  {
    const editor = await p.user.findFirst({ where: { role: 'ContentManager' }, select: { id: true, email: true, role: true } });
    const E = editor ? tok(editor) : null;
    const published = await p.blogPost.findFirst({ where: { status: 'Published' }, select: { slug: true, body: true } });
    const draft = await p.blogPost.findFirst({ where: { status: 'Draft' }, select: { slug: true } });

    const list = await get('/api/blog/posts?limit=3');
    list.status === 200 && Array.isArray(list.body?.posts)
      ? ok('the blog lists its posts', `${n(list.body.total)} published`)
      : bad('the blog lists its posts', `HTTP ${list.status}`);

    if (!published) meh('a post reads publicly', 'nothing published yet');
    else {
      const one = await get(`/api/blog/posts/${published.slug}`);
      one.status === 200 && one.body?.post?.title
        ? ok('a post reads publicly, with what the library holds beside it', `${(one.body.fromLibrary || []).length} library items`)
        : bad('a post reads publicly', `HTTP ${one.status}`);

      // The body is stored cleaned; a script that reached the page would run
      // in every reader's browser.
      const dirty = /<script|onerror=|onclick=|javascript:/i.test(String(published.body || ''));
      dirty ? bad('no post carries a script', 'a published post contains executable markup')
        : ok('no post carries a script');
    }

    if (!draft) meh('a draft stays private', 'no draft to try');
    else {
      const leak = await get(`/api/blog/posts/${draft.slug}`);
      leak.status === 404 ? ok('a draft stays private', 'HTTP 404 in public') : bad('a draft stays private', `HTTP ${leak.status} — a draft is readable`);
    }

    const shut = await get('/api/studio/posts', S || R);
    shut.status === 403 ? ok('readers cannot reach the studio', 'HTTP 403') : bad('readers cannot reach the studio', `HTTP ${shut.status}`);

    if (!E) meh('an editor reaches the studio', 'no ContentManager account');
    else {
      const mine = await get('/api/studio/posts', E);
      mine.status === 200 ? ok('an editor reaches the studio', `${(mine.body?.posts || []).length} posts`) : bad('an editor reaches the studio', `HTTP ${mine.status}`);
      // …and nowhere else.
      const members = await get('/api/admin/users?limit=1', E);
      members.status === 403 ? ok('an editor cannot read the members', 'HTTP 403') : bad('an editor cannot read the members', `HTTP ${members.status}`);
    }

    const map = await fetch(`${BASE}/sitemap-blog.xml`).then(r => r.text()).catch(() => '');
    map.includes('/blog') ? ok('the blog is in the sitemap') : bad('the blog is in the sitemap', 'sitemap-blog.xml is empty');
  }

  // ── a journal's own page ──────────────────────────────────────────────────
  // /journal/:id used to be matched against a hand-written list of showcase
  // titles, so every real journal answered "Journal Not Found".
  console.log('\nA journal on its own page');
  {
    const j = await p.journal.findFirst({
      where: { articles: { some: { status: 'Published' } } },
      select: { id: true, title: true },
    }).catch(() => null);
    if (!j) meh('a real journal reads by its id', 'no journal holds a published article');
    else {
      const r = await get(`/api/library/journal/${j.id}`);
      r.status === 200 && r.body?.id === j.id
        ? ok('a real journal reads by its id', `${n(r.body.articleCount)} articles`)
        : bad('a real journal reads by its id', `HTTP ${r.status}`);

      const recent = r.body?.recent || [];
      recent.length > 0
        ? ok('the journal page shows what is in it', `${recent.length} latest articles`)
        : bad('the journal page shows what is in it', 'no recent articles returned');

      recent.some(a => !a.title || a.title === 'Untitled')
        ? bad('no untitled rows on the journal page', 'an untitled article is listed')
        : ok('no untitled rows on the journal page');
    }
  }

  console.log('\nDead ends');
  for (const [name, path] of [
    ['unknown journal', '/api/library/journal/no-such-journal'],
    ['unknown article', '/api/library/article/does-not-exist'],
    ['unknown department', '/api/library/department/no-such-department'],
    ['unknown publisher', '/api/library/publisher/no-such-publisher'],
    ['unknown subject', '/api/library/subject/no-such-subject'],
  ]) {
    const r = await get(path, A);
    r.status === 404 ? ok(`${name} answers 404`) : bad(`${name} answers 404`, `HTTP ${r.status}`);
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  const sizeAtEnd = await catalogueSize();
  console.log(`\n${'─'.repeat(66)}`);
  console.log(`${pass} passed · ${fail ? R : ''}${fail} failed${O} · ${skip} skipped`);
  if (sizeAtEnd !== sizeAtStart) {
    console.log(`\n${Y}The collection grew by ${sizeAtEnd - sizeAtStart} while this ran.${O}`);
    console.log(`${D}  Ingestion is writing. Any count that disagrees by roughly that much is`);
    console.log(`  drift, not a fault — pause ingestion and run again before believing it.${O}`);
  }
  if (fail) {
    console.log(`\n${R}Failures:${O}`);
    failures.forEach(f => console.log('  · ' + f));
  }
  await p.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
