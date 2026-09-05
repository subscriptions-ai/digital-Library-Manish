#!/usr/bin/env node
/**
 * A demo college with eighteen months of reading behind it.
 *
 *   node scripts/seed-demo-analytics.cjs           # report only
 *   node scripts/seed-demo-analytics.cjs --apply   # create it
 *   node scripts/seed-demo-analytics.cjs --remove  # delete every trace of it
 *
 * Why this exists: on a sales call the college has never used the product, so
 * no analytics page can show them their own data. Every analytics vendor
 * answers that with a populated demo org, and this is ours.
 *
 * Two rules it does not break:
 *
 *   Everything it creates is named and flagged as demo — the institution, the
 *   students, and every event — so nothing here can ever be mistaken for a real
 *   customer's usage or counted into a real total.
 *
 *   It draws on the real catalogue. The journals, departments and articles the
 *   demo students "read" are ones we actually hold, so every figure on the page
 *   opens onto a real journal and a real article rather than a dead link.
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');

const DEMO_NAME = 'Sunrise Institute of Technology (Demo)';
const DEMO_DOMAIN = 'demo.stmlibrary.example';
const STUDENTS = 180;
const MONTHS = 18;

// ── the shape of a real academic year ────────────────────────────────────────
// Reading is not uniform. Term time is busy, exam weeks spike, and nobody opens
// a journal in late December. A flat random scatter looks obviously fake.
const monthWeight = (d) => {
  const m = d.getMonth();                    // 0 = January
  if (m === 11 || m === 4) return 0.35;      // December, May — vacation
  if (m === 3 || m === 10) return 1.9;       // April, November — exams
  if (m === 5 || m === 6) return 0.5;        // summer
  return 1.0;
};
const dayWeight = (d) => (d.getDay() === 0 ? 0.4 : d.getDay() === 6 ? 0.6 : 1.0);

// A few students read a great deal, most read a little, some never sign in.
// A flat distribution would make the "who has not opened it" panel meaningless.
const readerWeight = (i) => {
  if (i < STUDENTS * 0.06) return 9;    // the handful who live in it
  if (i < STUDENTS * 0.25) return 3.2;
  if (i < STUDENTS * 0.62) return 1.0;
  if (i < STUDENTS * 0.82) return 0.25; // barely
  return 0;                             // never signed in — the actionable list
};

const BRANCHES = ['Computer Science', 'Nursing', 'Civil', 'Pharmacy', 'Electronics', 'Management'];
const YEARS = ['1st Year', '2nd Year', '3rd Year', 'Final Year'];

// Searches a real cohort would run. Some we can answer, some we cannot — and
// the ones we cannot are the whole point of the acquisition panel.
const SEARCHES_HIT = [
  'nursing ethics', 'concrete mix design', 'machine learning', 'pharmacology',
  'renewable energy', 'data mining', 'public health', 'signal processing',
  'water treatment', 'clinical trials', 'image processing', 'supply chain',
];
const SEARCHES_MISS = [
  'machine learning in agriculture', 'GST compliance India', 'VLSI low power design',
  'nanofluid heat transfer', 'ayurvedic pharmacovigilance', 'blockchain in land records',
  'drone surveying regulations', 'antimicrobial resistance India',
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const between = (a, b) => a + Math.random() * (b - a);

(async () => {
  if (REMOVE) {
    const inst = await p.institution.findFirst({ where: { name: DEMO_NAME } });
    if (!inst) { console.log('No demo institution found. Nothing to remove.'); await p.$disconnect(); return; }
    const ev = await p.libraryEvent.deleteMany({ where: { institutionId: inst.id } });
    const us = await p.user.deleteMany({ where: { institutionId: inst.id } });
    await p.institution.delete({ where: { id: inst.id } });
    console.log(`Removed: ${ev.count} events, ${us.count} students, 1 institution.`);
    await p.$disconnect();
    return;
  }

  // ── what it will read from ────────────────────────────────────────────────
  const articles = await p.article.findMany({
    where: { status: 'Published' },
    select: { id: true, journalId: true, journalIssn: true, domain: true },
    take: 4000,
  });
  const contents = await p.content.findMany({
    where: { status: { in: ['Published', 'published'] } },
    select: { id: true, domain: true },
    take: 1500,
  });
  const pool = [
    ...articles.map(a => ({ itemType: 'article', itemId: a.id, journalId: a.journalId, journalIssn: a.journalIssn, domain: a.domain })),
    ...contents.map(c => ({ itemType: 'content', itemId: c.id, domain: c.domain })),
  ];

  console.log(`Demo institution : ${DEMO_NAME}`);
  console.log(`Students         : ${STUDENTS}  (about ${Math.round(STUDENTS * 0.18)} will never have signed in)`);
  console.log(`History          : ${MONTHS} months, weighted by term, exams and weekends`);
  console.log(`Drawing on       : ${articles.length} real articles, ${contents.length} real archived items`);

  const existing = await p.institution.findFirst({ where: { name: DEMO_NAME } });
  if (existing) {
    const n = await p.libraryEvent.count({ where: { institutionId: existing.id } });
    console.log(`\nAlready exists with ${n} events. Run with --remove first to rebuild it.`);
    await p.$disconnect();
    return;
  }

  if (!APPLY) {
    console.log('\nReport only — nothing written. Add --apply to create it.');
    await p.$disconnect();
    return;
  }

  // ── the institution and its students ──────────────────────────────────────
  const inst = await p.institution.create({ data: { name: DEMO_NAME, status: 'Active' } });

  const students = [];
  for (let i = 0; i < STUDENTS; i++) {
    const branch = BRANCHES[i % BRANCHES.length];
    students.push(await p.user.create({
      data: {
        email: `demo.student${String(i + 1).padStart(3, '0')}@${DEMO_DOMAIN}`,
        // Not a usable credential: these accounts exist to be counted, not signed into.
        password: 'demo-account-not-for-sign-in',
        displayName: `Demo Student ${i + 1}`,
        role: 'Student',
        organization: DEMO_NAME,
        designation: pick(YEARS),
        institutionId: inst.id,
        isDemoAccount: true,
      },
      select: { id: true },
    }));
  }
  console.log(`\nCreated ${students.length} students.`);

  // ── eighteen months of behaviour ──────────────────────────────────────────
  const now = new Date();
  const start = new Date(now); start.setMonth(start.getMonth() - MONTHS);

  const rows = [];
  let seq = 0;
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const w = monthWeight(d) * dayWeight(d);
    if (w === 0) continue;

    students.forEach((s, i) => {
      const rw = readerWeight(i);
      if (rw === 0) return;                              // never signs in
      const reads = Math.random() < 0.055 * rw * w ? Math.ceil(between(1, 2 + rw / 2)) : 0;
      for (let k = 0; k < reads; k++) {
        const item = pick(pool);
        const at = new Date(d);
        at.setHours(Math.floor(between(8, 23)), Math.floor(between(0, 59)));
        rows.push({
          at, kind: 'view', userId: s.id, institutionId: inst.id, role: 'Student',
          itemType: item.itemType, itemId: item.itemId,
          journalId: item.journalId ?? null, journalIssn: item.journalIssn ?? null,
          domain: item.domain ?? null,
          durationMs: Math.round(between(45, 1400)) * 1000,
          dedupeKey: `demo|${inst.id}|${seq++}`,
        });
      }

      // Roughly one search for every four things opened, and a fifth of those
      // find nothing — which is what fills the acquisition panel.
      if (Math.random() < 0.02 * rw * w) {
        const miss = Math.random() < 0.22;
        const at = new Date(d);
        at.setHours(Math.floor(between(8, 23)), Math.floor(between(0, 59)));
        rows.push({
          at, kind: 'search', userId: s.id, institutionId: inst.id, role: 'Student',
          query: miss ? pick(SEARCHES_MISS) : pick(SEARCHES_HIT),
          resultCount: miss ? 0 : Math.floor(between(3, 260)),
          dedupeKey: `demo|${inst.id}|${seq++}`,
        });
      }
    });
  }

  console.log(`Writing ${rows.length} events…`);
  for (let i = 0; i < rows.length; i += 500) {
    await p.libraryEvent.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
  }

  const views = rows.filter(r => r.kind === 'view').length;
  const searches = rows.filter(r => r.kind === 'search').length;
  const misses = rows.filter(r => r.kind === 'search' && r.resultCount === 0).length;
  const readers = new Set(rows.map(r => r.userId)).size;

  console.log('');
  console.log('  events written        :', rows.length);
  console.log('  reads                 :', views);
  console.log('  searches              :', searches, `(${misses} found nothing)`);
  console.log('  students who read     :', readers, 'of', STUDENTS);
  console.log('  never signed in       :', STUDENTS - readers);
  console.log('');
  console.log('Institution id          :', inst.id);
  console.log('Remove it all with      : node scripts/seed-demo-analytics.cjs --remove');
  await p.$disconnect();
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
