/**
 * Fill the shelves now, rather than over the coming week.
 *
 *   npx tsx scripts/fill-catalogue.ts books                  # until 5,000 books are held
 *   npx tsx scripts/fill-catalogue.ts journals --target 8000
 *   npx tsx scripts/fill-catalogue.ts books --passes 40
 *
 * Left alone the engine spends one pass in five on discovery and alternates the
 * two sources within it, which is the right balance for a library already open
 * but far too slow to open with. This spends every pass on the one kind of work
 * named, across every department, and stops as soon as the target is met or the
 * source has nothing further to give.
 *
 * Safe to interrupt and safe to run again: each department term remembers the
 * page it reached, and anything already held is recognised by its identifier, so
 * a second run adds only what is new. Books and journals may be run at the same
 * time — they take their pages from different sources and different sweep rows.
 */
import { PrismaClient } from '@prisma/client';
import { runIngestionPass } from '../src/lib/ingestionWorker.js';

const prisma = new PrismaClient();
const p = prisma as any;

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
};

const KIND = (process.argv[2] || 'books') as 'books' | 'journals';
if (KIND !== 'books' && KIND !== 'journals') {
  console.error('Say which: books or journals.');
  process.exit(1);
}
const TARGET = arg('target', 5000);
const MAX_PASSES = arg('passes', 400);

const held = () => (KIND === 'books'
  ? p.book.count()
  : p.journal.count({ where: { rightsBasis: 'DOAJ declaration' } }));

(async () => {
  const departments: string[] = (await p.$queryRawUnsafe(
    `select distinct domain from "Journal" where domain is not null order by 1`
  )).map((r: any) => r.domain);

  const startedWith = await held();
  console.log(`${KIND} held: ${startedWith}. Target: ${TARGET}. Departments: ${departments.length}.\n`);

  let now = startedWith;
  for (let i = 1; i <= MAX_PASSES && now < TARGET; i++) {
    // Named explicitly, so the engine covers all of them rather than whichever
    // two are left selected in the admin screen's department chooser.
    const r: any = await runIngestionPass(departments, { force: true, only: KIND, departments });

    if (r.phase === 'Idle' || r.skipped) {
      console.log(`\nNothing further to give: ${r.note || r.skipped}`);
      break;
    }
    now = await held();
    const gained = KIND === 'books' ? (r.added ?? 0) : (r.accepted ?? 0);
    const passed = KIND === 'books' ? (r.skippedHeld ?? 0) : (r.rejected ?? 0);
    console.log(
      `${String(i).padStart(3)}. ${String(r.department || '').padEnd(42).slice(0, 42)}` +
      ` "${String(r.term || '').slice(0, 22)}"`.padEnd(26) +
      ` +${String(gained).padStart(4)}` +
      `  ${KIND === 'books' ? 'held' : 'refused'} ${String(passed).padStart(4)}` +
      `  total ${now}`
    );
    if (r.error) console.log(`      first failure: ${r.error}`);
  }

  const byDept = await p.$queryRawUnsafe(
    KIND === 'books'
      ? `select domain, count(*)::int n from "Book" where status = 'Published' group by 1 order by 2 desc`
      : `select domain, count(*)::int n from "Journal" where "rightsBasis" = 'DOAJ declaration' group by 1 order by 2 desc`);
  console.log(`\n${KIND}: ${startedWith} -> ${now}  (+${now - startedWith})\n`);
  for (const row of byDept) console.log(`  ${String(row.domain || '(none)').padEnd(46)} ${row.n}`);

  await prisma.$disconnect();
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
