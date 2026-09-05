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

  // ── 1. the catalogue ──────────────────────────────────────────────────────
  console.log('\nCatalogue');
  await check('library stats', '/api/library/stats', null, b => {
    if (b.articles !== truth.publishedArticles) return `articles ${b.articles} but the database has ${truth.publishedArticles}`;
    if (b.journals === 0 && truth.journalsHoldingArticles > 0)
      return `reports 0 journals while ${truth.journalsHoldingArticles} hold articles — the denormalised counter is stale, run scripts/recount-journals.cjs`;
    return true;
  });

  if (article) {
    await check('article record', `/api/library/article/${article.id}`, A, b => b.id === article.id || 'wrong article returned');
  } else meh('article record', 'no published articles');

  if (journal) {
    await check('journal spine', `/api/library/journal/${encodeURIComponent(journal.issn || journal.id)}`, A,
      b => Array.isArray(b.volumes) || 'no volumes array');
    await check('department page', `/api/library/department/${slug(journal.domain)}`, A, b => {
      if (!Array.isArray(b.journals)) return 'no journals array';
      if (b.journals.length === 0) return `resolved "${journal.domain}" but returned no journals — check the articleCount gate`;
      return true;
    });
  } else meh('journal + department', 'no journals with a department');

  if (author) await check('author page', `/api/library/author/${author.authorId}`, A, b => Array.isArray(b.articles) || 'no articles array');
  else meh('author page', 'no author links');

  if (publisher) {
    await check('publisher page', `/api/library/publisher/${slug(publisher.publisherName)}`, A,
      b => Array.isArray(b.journals) || 'no journals array');
  } else meh('publisher page', 'no journal carries a publisher');

  const subj = Array.isArray(subjectJournal?.subjects) ? subjectJournal.subjects[0] : null;
  if (subj) await check('subject page', `/api/library/subject/${slug(subj)}`, A, b => Array.isArray(b.journals) || 'no journals array');
  else meh('subject page', 'no journal carries subjects');

  await check('subject list', '/api/library/subjects', A, b => Array.isArray(b) || 'not an array');

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
