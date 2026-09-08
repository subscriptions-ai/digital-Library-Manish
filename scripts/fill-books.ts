/**
 * Fill the shelves with books, now rather than over the coming week.
 *
 *   npx tsx scripts/fill-books.ts             # until 5,000 books are held
 *   npx tsx scripts/fill-books.ts --target 8000
 *   npx tsx scripts/fill-books.ts --passes 40
 *
 * The engine gives discovery one pass in five and books every other one of
 * those, which is the right balance for a library that is already running but
 * far too slow to open with. This spends every pass on books instead, and stops
 * as soon as the target is met or DOAB has no more to give.
 *
 * Safe to interrupt and safe to run again: each department term remembers the
 * offset it reached, and a book already held is recognised by its DOI, its DOAB
 * handle or its title, so a second run adds only what is new.
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

const TARGET = arg('target', 5000);
const MAX_PASSES = arg('passes', 400);

(async () => {
  const departments: string[] = (await p.$queryRawUnsafe(
    `select distinct domain from "Journal" where domain is not null order by 1`
  )).map((r: any) => r.domain);

  const startedWith = await p.book.count();
  console.log(`Books held: ${startedWith}. Target: ${TARGET}. Departments: ${departments.length}.\n`);

  let held = startedWith;
  for (let i = 1; i <= MAX_PASSES && held < TARGET; i++) {
    const r: any = await runIngestionPass(departments, { force: true, only: 'books' });

    if (r.phase === 'Idle' || r.skipped) {
      console.log(`\nDOAB has nothing further to give: ${r.note || r.skipped}`);
      break;
    }
    held = await p.book.count();
    console.log(
      `${String(i).padStart(3)}. ${String(r.department || '').padEnd(42).slice(0, 42)}` +
      ` "${String(r.term || '').slice(0, 22)}"`.padEnd(26) +
      ` +${String(r.added ?? 0).padStart(4)}  held ${String(r.skippedHeld ?? 0).padStart(4)}` +
      `  failed ${String(r.skippedFailed ?? 0).padStart(3)}  total ${held}`
    );
    if (r.error) console.log(`      first failure: ${r.error}`);
  }

  const byDept = await p.$queryRawUnsafe(
    `select domain, count(*)::int n from "Book" where status = 'Published' group by 1 order by 2 desc`);
  console.log(`\nBooks: ${startedWith} -> ${held}  (+${held - startedWith})\n`);
  for (const row of byDept) console.log(`  ${String(row.domain || '(none)').padEnd(46)} ${row.n}`);

  await prisma.$disconnect();
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
