/**
 * READ-ONLY audit of every journal figure, and how the database total becomes the public one.
 *
 *   npx tsx scripts/audit-journal-counts.ts                 # the database in .env (locally), or Coolify's environment
 *   DATABASE_URL=… npx tsx scripts/audit-journal-counts.ts
 *
 * Writes nothing: it reads inside one READ ONLY transaction, so Postgres itself would refuse a write. The reconciliation is exact: the buckets
 * are mutually exclusive, add up to the total, and the script says so (and exits 1) if they do not.
 *
 * The definitions are the ones in src/lib/publicJournals.ts:
 *   ADMIN "journal records in database"  every Journal row, whatever its status.
 *   PUBLIC "journal titles"              status Accepted or MetadataOnly AND at least one PUBLISHED article.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PUBLIC_JOURNAL_STATUSES } from '../src/lib/publicJournals';

const prisma = new PrismaClient();
const url = new URL(process.env.DATABASE_URL || 'postgres://unset/unset');
const n = (x: number) => Number(x).toLocaleString('en-IN');
const line = (label: string, v: number, note = '') => console.log(`  ${label.padEnd(58)} ${n(v === 0 ? 0 : v).padStart(10)}  ${note}`);

(async () => {
  console.log(`Database: ${url.hostname}:${url.port || '5432'}/${url.pathname.slice(1)}   (read-only)\n`);
  let ok = true;
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

    // One pass over the articles (grouped by journal), one over the journals: a row per journal with what decides its fate. `pub` is the
    // number of PUBLISHED articles, read from the articles themselves and never from the denormalised counter.
    type Row = { status: string; domain: string | null; counter: number; pub: number; any: number; issn: string | null; eissn: string | null; title: string; publisher: string };
    const rows: Row[] = (await tx.$queryRawUnsafe(`
      with a as (
        select "journalId" as jid, (count(*) filter (where status = 'Published'))::int as pub, count(*)::int as any
          from "Article" where "journalId" is not null group by 1)
      select j.status, j.domain, j."articleCount"::int as counter, coalesce(a.pub, 0)::int as pub, coalesce(a.any, 0)::int as "any",
             j.issn, j.eissn, j.title, coalesce(j."publisherName", '') as publisher
        from "Journal" j left join a on a.jid = j.id`)) as Row[];
    const publishedWithoutJournal = Number((await tx.$queryRawUnsafe(`select count(*)::int n from "Article" where status = 'Published' and "journalId" is null`))[0].n);

    const count = (f: (r: Row) => boolean) => rows.reduce((c, r) => c + (f(r) ? 1 : 0), 0);
    const offered = (r: Row) => (PUBLIC_JOURNAL_STATUSES as readonly string[]).includes(r.status);
    const isPublic = (r: Row) => offered(r) && r.pub > 0;
    const total = rows.length;

    console.log('1. WHAT EACH NUMBER IS');
    line('Admin "In the database" (was)  = prisma.journal.count()', total, 'every row, no filter');
    line('Admin "With articles" (was)    = rows with articleCount > 0', count(r => r.counter > 0), 'the denormalised counter');
    line('Admin "Full text allowed"      = rows with status Accepted', count(r => r.status === 'Accepted'), 'a rights flag, not visibility');
    const oldPublic = count(r => r.pub > 0);
    line('Public "Journal titles" (was)  = distinct journalId, Published articles', oldPublic, 'ignored the journal\'s own status');
    const newPublic = count(isPublic);
    line('Public "Available journal titles" (now)', newPublic, 'offered status AND a published article');

    console.log('\n2. RECONCILIATION: database total -> public titles (mutually exclusive, in this order)');
    const byStatus = new Map<string, number>();
    for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
    line('Journal records in database', total);
    let removed = 0;
    for (const [s, c] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
      if ((PUBLIC_JOURNAL_STATUSES as readonly string[]).includes(s)) continue;
      line(`  minus status "${s}" (never shown publicly)`, -c); removed += c;
    }
    const draftOnly = count(r => offered(r) && r.pub === 0 && r.any > 0);
    const noArticles = count(r => offered(r) && r.any === 0);
    line('  minus offered status, articles exist but none Published', -draftOnly);
    line('  minus offered status, no article at all', -noArticles);
    const sumBuckets = removed + draftOnly + noArticles;
    line('= public journal titles', total - sumBuckets);
    const reconciled = total - sumBuckets === newPublic;
    ok = ok && reconciled;
    console.log(`  ${reconciled ? 'RECONCILES EXACTLY' : '*** DOES NOT RECONCILE ***'}  (${n(total)} - ${n(sumBuckets)} = ${n(total - sumBuckets)}; direct count ${n(newPublic)})`);
    console.log(`  Of the offered journals with no published article, ${n(count(r => offered(r) && r.pub === 0 && r.counter > 0))} have a counter above zero that no published article supports (stale).`);
    if (publishedWithoutJournal) console.log(`  (${n(publishedWithoutJournal)} published articles belong to no journal row; they are articles, not journal titles.)`);

    console.log('\n3. STATUS x HAS A PUBLISHED ARTICLE (explains "Full text allowed" vs public titles)');
    console.log(`  ${'status'.padEnd(16)} ${'with published'.padStart(15)} ${'without'.padStart(10)} ${'total'.padStart(10)}`);
    const cross = new Map<string, { w: number; wo: number }>();
    for (const r of rows) { const c = cross.get(r.status) || { w: 0, wo: 0 }; r.pub > 0 ? c.w++ : c.wo++; cross.set(r.status, c); }
    for (const [s, c] of [...cross.entries()].sort((a, b) => (b[1].w + b[1].wo) - (a[1].w + a[1].wo))) console.log(`  ${s.padEnd(16)} ${n(c.w).padStart(15)} ${n(c.wo).padStart(10)} ${n(c.w + c.wo).padStart(10)}`);
    const acc = cross.get('Accepted') || { w: 0, wo: 0 };
    const otherOffered = [...cross.entries()].filter(([s]) => s !== 'Accepted' && (PUBLIC_JOURNAL_STATUSES as readonly string[]).includes(s)).reduce((a, [, c]) => a + c.w, 0);
    console.log(`  Full text allowed ${n(acc.w + acc.wo)}  -  Accepted with no published article ${n(acc.wo)}  +  other offered status with one ${n(otherOffered)}  =  public ${n(newPublic)}`);
    ok = ok && acc.w + acc.wo - acc.wo + otherOffered === newPublic;

    console.log('\n4. "WITH ARTICLES": the counter against the real rows');
    line('Counter above zero (what the admin screen used to count)', count(r => r.counter > 0));
    line('Actually hold a published article (what it counts now)', count(r => r.pub > 0));
    line('  counter > 0 but no published article', count(r => r.counter > 0 && r.pub === 0), 'counter ahead of the data');
    line('  published article but counter = 0', count(r => r.counter === 0 && r.pub > 0), 'counter behind the data');

    console.log('\n5. OLD PUBLIC RULE vs NEW');
    line('Old rule (any status, with a published article)', oldPublic);
    line('New rule', newPublic);
    line('Difference: a published article, but a status the catalogue does not offer', oldPublic - newPublic, 'now excluded');

    console.log('\n6. DEPARTMENT');
    line('Public journals with a department', count(r => isPublic(r) && r.domain !== null));
    line('Public journals with NO department (counted publicly; on no shelf)', count(r => isPublic(r) && r.domain === null));
    line('All journal rows with no department (the admin "no department" line)', count(r => r.domain === null));
    const depts = new Map<string, { all: number; pub: number }>();
    for (const r of rows) { const k = r.domain ?? '(none)'; const d = depts.get(k) || { all: 0, pub: 0 }; d.all++; if (isPublic(r)) d.pub++; depts.set(k, d); }
    console.log(`  ${'department (journal.domain)'.padEnd(44)} ${'all rows'.padStart(9)} ${'public'.padStart(9)}`);
    for (const [k, d] of [...depts.entries()].sort((a, b) => b[1].all - a[1].all).slice(0, 12)) console.log(`  ${k.padEnd(44)} ${n(d.all).padStart(9)} ${n(d.pub).padStart(9)}`);
    console.log('  A journal has ONE department column, so the department figures are mutually exclusive and sum to the total (spellings of one department are');
    console.log('  folded together on screen). Admin counts include review candidates and journals with no article; the public figures exclude them.');

    console.log('\n7. DUPLICATES (identity is the row; ISSN is unique, so duplicates can only be candidates)');
    line('Rows with no ISSN at all', count(r => r.issn === null));
    const eissn = new Map<string, number>();
    for (const r of rows) if (r.eissn) eissn.set(r.eissn, (eissn.get(r.eissn) || 0) + 1);
    line('eISSN values shared by more than one row', [...eissn.values()].filter(c => c > 1).length, 'groups');
    const keyOf = (r: Row) => `${r.title.trim().toLowerCase()}|${r.publisher.trim().toLowerCase()}`;
    const keys = new Map<string, number>();
    for (const r of rows) if (isPublic(r)) keys.set(keyOf(r), (keys.get(keyOf(r)) || 0) + 1);
    const groups = [...keys.values()].filter(c => c > 1);
    const extra = groups.reduce((a, c) => a + c - 1, 0);
    line('Public journals sharing a title and publisher with another', groups.length, 'groups');
    line('  rows that would collapse if title + publisher were the identity', extra, `-> ${n(newPublic - extra)} unique by that rule (policy unchanged: nothing is merged)`);

    console.log('\n8. DELETED / HIDDEN');
    console.log('  The Journal table has no deleted or hidden flag; visibility is decided only by status and by holding a published article.');
    console.log(`  Statuses present: ${[...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s} ${n(c)}`).join(' · ')}`);
  }, { timeout: 180_000, maxWait: 30_000 });
  console.log(ok ? '\nAll reconciliations hold. Nothing was modified.' : '\n*** A reconciliation FAILED. ***');
  process.exitCode = ok ? 0 : 1;
})().catch(e => { console.error('Audit failed:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
