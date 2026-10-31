/**
 * READ-ONLY verifier for the coordinator's book publication (scripts/dept-coordinator-books-publish-apply.cjs). Writes nothing: one SET TRANSACTION READ ONLY transaction, one JSON on stdout.
 * (.js, not .cjs, on purpose: it must not be handed to scripts/prod-run.sh.)
 *
 *   BEFORE:  (printf 'var __MODE__ = "baseline"; var __IDS__ = %s;\n' "$IDS"; cat this-file) | ... node - > baseline.json
 *   AFTER:   (printf 'var __MODE__ = "verify"; var __RUN__ = "<run id>"; var __EXPECT__ = %s;\n' '{"ids":[...],"baseline":{...},"byDepartment":{"Medical Laboratory Technology":209,...}}'; cat this-file) | ... node -
 *
 * PASS/FAIL rests only on: the run's own books and audit ids, the four new departments, and the plan's book ids. The whole Book / Article / Journal tables are INFORMATION only.
 *   1  the books stamped with the run id (status Published, metadata.reviewPublication.runId) are exactly the plan's ids, and the audit rows list the same ids; none was rolled back
 *   2  nothing but status (and the stamp) changed on those books: domain, licence, licenceIsNC, rightsStatus, accessStatus, rightsBasis, year, title, DOI, file all as at the baseline
 *      (the hash below covers accessStatus as the plan recorded it - for some books null or LinkOnly, not only MetadataOnly); no licence, no file, rights still MetadataOnly
 *   3  each department's Published books moved by exactly the plan's count for it; the others (Radiology) did not move; no Article, Journal or legacy row of the four departments moved
 *   4  page and menu count per department (articles + books + legacy [+ article-less public journals for the page]) are what that implies
 *   5  every other book of the four departments is as at the baseline (hash), and no Published twin (same DOI) exists for a book of the run
 *   6  20 sample rows
 * Not here: the rollback dry run, which goes through the wrapper:
 *   scripts/prod-run.sh scripts/dept-coordinator-books-publish-rollback.cjs <run id> --plan=<plan> --expect-db=postgres       (expect restoreable = rows)
 */
const { PrismaClient } = require('@prisma/client');
const DEPTS = ['Paramedical Sciences', 'Radiology', 'Medical Laboratory Technology', 'Optometry & Ophthalmology'];
const MODE = typeof __MODE__ !== 'undefined' ? __MODE__ : 'baseline';
const RUN = typeof __RUN__ !== 'undefined' ? __RUN__ : null;
const EXPECT = typeof __EXPECT__ !== 'undefined' ? __EXPECT__ : {};
const IDS = typeof __IDS__ !== 'undefined' ? __IDS__ : (EXPECT.ids || []);
const WITHHELD = ['draft', 'rejected', 'hidden', 'deleted', 'removed', 'pending', 'review', 'in review', 'needs review', 'unpublished', 'withdrawn', 'archived', 'takedown'];

(async () => {
  const p = new PrismaClient();
  const out = await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const q = (sql, ...a) => tx.$queryRawUnsafe(sql, ...a);
    const one = async (sql, ...a) => (await q(sql, ...a))[0];
    const at = (await one(`select now()::text t`)).t;
    const db = (await one('select current_database() d')).d;
    // identity of a book apart from what publication changes (status, updatedAt, metadata): these must stay as they were
    const fixedCols = `concat_ws('|', id, domain, coalesce(licence,''), coalesce("licenceIsNC"::text,''), coalesce("rightsStatus",''), coalesce("accessStatus",''), coalesce("rightsBasis",''), coalesce(year::text,''), coalesce(doi,''), coalesce(title,''), ("pdfUrl" is null)::text, coalesce("ownershipSource",''))`;
    const wholeCols = `concat_ws('|', id, status, domain, coalesce(licence,''), coalesce("accessStatus",''), coalesce(doi,''))`;
    const agg = (table, cols, where, ...a) => one(`select count(*)::int n, coalesce(sum(hashtextextended(${cols}, 0)::numeric), 0)::text h from "${table}" where ${where}`, ...a);

    const components = async () => {
      const o = {};
      for (const d of DEPTS) {
        const [a, b, l, j, bd] = await Promise.all([
          one(`select count(*)::int n from "Article" where domain = $1 and status = 'Published'`, d),
          one(`select count(*)::int n from "Book" where domain = $1 and status = 'Published'`, d),
          one(`select count(*)::int n from "Content" c where c.domain = $1 and lower(c.status) not in (${WITHHELD.map((s) => `'${s}'`).join(',')})`, d),
          one(`select count(*)::int n from "Journal" j where j.status in ('Accepted','MetadataOnly') and j.domain = $1 and not exists (select 1 from "Article" a where a."journalId" = j.id and a.status = 'Published')`, d),
          one(`select count(*)::int n from "Book" where domain = $1 and status = 'Draft'`, d),
        ]);
        o[d] = { articles: a.n, booksPublished: b.n, booksDraft: bd.n, legacy: l.n, articleLessPublicJournals: j.n, menu: a.n + b.n + l.n, page: a.n + b.n + l.n + j.n };
      }
      return o;
    };

    if (MODE === 'baseline') {
      return { mode: 'baseline', database: db, at, components: await components(),
        planStates: await q(`select status, count(*)::int n from "Book" where id = any($1::text[]) group by 1`, IDS),
        hashes: {
          planBooksFixed: await agg('Book', fixedCols, `id = any($1::text[])`, IDS),
          otherFourDeptBooks: await agg('Book', wholeCols, `domain = any($1::text[]) and not (id = any($2::text[]))`, DEPTS, IDS),
          fourDeptArticles: await agg('Article', `concat_ws('|', id, status, domain)`, `domain = any($1::text[]) and "createdAt" <= $2::timestamptz`, DEPTS, at),
          fourDeptJournals: await agg('Journal', `concat_ws('|', id, status, domain)`, `domain = any($1::text[])`, DEPTS),
          allBooks: await agg('Book', wholeCols, `true`), allArticles: await agg('Article', `concat_ws('|', id, status)`, `"createdAt" <= $1::timestamptz`, at), allJournals: await agg('Journal', `concat_ws('|', id, status)`, `true`),
        } };
    }

    if (!RUN) throw new Error('verify needs var __RUN__');
    const base = EXPECT.baseline || null; const byDept = EXPECT.byDepartment || {};
    const checks = []; const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
    const stamped = (await q(`select id from "Book" where status = 'Published' and metadata->'reviewPublication'->>'runId' = $1`, RUN)).map((r) => r.id);
    const planSet = new Set(IDS), stampedSet = new Set(stamped);
    const audits = await q(`select meta from "IngestionAudit" where action = 'BOOK_SOURCE_PUBLISH' and meta->>'runId' = $1`, RUN);
    const auditIds = audits.flatMap((a) => a.meta.published || []);
    const unpub = (await one(`select count(*)::int n from "IngestionAudit" where action = 'BOOK_SOURCE_UNPUBLISH' and meta->>'runId' = $1`, RUN)).n;
    const extra = stamped.filter((i) => !planSet.has(i)).length, missing = IDS.filter((i) => !stampedSet.has(i)).length;
    add('1. stamped Published books = the plan\'s ids = the audit rows\' ids; none rolled back', stamped.length === IDS.length && extra === 0 && missing === 0 && auditIds.length === IDS.length && new Set(auditIds).size === IDS.length && auditIds.every((i) => planSet.has(i)) && unpub === 0,
      `plan ${IDS.length}, stamped ${stamped.length} (not in plan ${extra}, plan ids not stamped ${missing}), audit ids ${auditIds.length} in ${audits.length} batch rows, unpublish audit rows ${unpub}`);

    const fixed = await agg('Book', fixedCols, `id = any($1::text[])`, IDS);
    const shape = await one(`select count(*) filter (where status <> 'Published')::int not_published, count(*) filter (where "pdfUrl" is not null)::int has_file, count(*) filter (where licence is not null)::int has_licence,
        count(*) filter (where "rightsStatus" is distinct from 'MetadataOnly')::int rights_changed, count(*) filter (where domain <> all($2::text[]))::int wrong_department
      from "Book" where id = any($1::text[])`, IDS, DEPTS);
    const hb = base?.hashes?.planBooksFixed;
    const access = Object.fromEntries((await q(`select coalesce("accessStatus",'(null)') a, count(*)::int n from "Book" where id = any($1::text[]) group by 1`, IDS)).map((r) => [r.a, r.n]));
    add('2. only the status (and stamp) changed on those books: no licence, no file, rights as judged, every other field as at the baseline', Object.values(shape).every((v) => Number(v) === 0) && (!hb || (fixed.n === hb.n && fixed.h === hb.h)),
      `${JSON.stringify(shape)}; accessStatus of the books ${JSON.stringify(access)} (as the plan recorded it); every other field ${hb ? (fixed.h === hb.h ? 'same as the baseline' : 'DIFFERENT from the baseline') : 'no baseline given'}`);

    const comp = await components();
    let ok3 = true; const lines = [];
    for (const d of DEPTS) {
      const b = base?.components?.[d], c = comp[d]; if (!b) continue;
      const delta = byDept[d] || 0;
      const good = c.booksPublished === b.booksPublished + delta && c.articles === b.articles && c.legacy === b.legacy && c.articleLessPublicJournals === b.articleLessPublicJournals && c.booksDraft === b.booksDraft - delta;
      ok3 = ok3 && good; lines.push(`${d}: published books ${b.booksPublished} -> ${c.booksPublished} (expected +${delta}), drafts ${b.booksDraft} -> ${c.booksDraft}, articles ${b.articles} -> ${c.articles}${good ? '' : '  <-- NOT AS EXPECTED'}`);
    }
    add('3. each department\'s Published books moved by exactly the plan\'s count; nothing else of the four departments moved', base ? ok3 : true, base ? lines.join('; ') : 'no baseline given');
    add('4. page and menu count per department', base ? DEPTS.every((d) => comp[d].menu === base.components[d].menu + (byDept[d] || 0) && comp[d].page === base.components[d].page + (byDept[d] || 0)) : true,
      DEPTS.map((d) => `${d}: menu ${base ? base.components[d].menu + ' -> ' : ''}${comp[d].menu}, page ${base ? base.components[d].page + ' -> ' : ''}${comp[d].page}`).join('; '));
    let live = null;
    try { const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/library/stats`, { signal: AbortSignal.timeout(8000) }); live = r.ok ? Object.fromEntries((await r.json()).departmentTotals.filter((x) => DEPTS.includes(x.name)).map((x) => [x.name, x.total])) : `HTTP ${r.status}`; } catch (e) { live = 'unreachable from here'; }

    const other = await agg('Book', wholeCols, `domain = any($1::text[]) and not (id = any($2::text[]))`, DEPTS, IDS);
    const hall = { books: await agg('Book', wholeCols, `true`), articles: await agg('Article', `concat_ws('|', id, status)`, `"createdAt" <= $1::timestamptz`, base?.at || at), journals: await agg('Journal', `concat_ws('|', id, status)`, `true`) };
    const hArt = await agg('Article', `concat_ws('|', id, status, domain)`, `domain = any($1::text[]) and "createdAt" <= $2::timestamptz`, DEPTS, base?.at || at);
    const hJ = await agg('Journal', `concat_ws('|', id, status, domain)`, `domain = any($1::text[])`, DEPTS);
    const hb2 = base?.hashes;
    const twins = (await one(`select count(*)::int n from "Book" b join "Book" c on c.id <> b.id and c.status = 'Published' and b.doi is not null and lower(c.doi) = lower(b.doi) where b.id = any($1::text[])`, IDS)).n;
    add('5. every other book / article / journal of the four departments as at the baseline; no Published twin for a book of the run',
      twins === 0 && (!hb2 || (other.h === hb2.otherFourDeptBooks.h && hArt.h === hb2.fourDeptArticles.h && hJ.h === hb2.fourDeptJournals.h)),
      `Published twins ${twins}; ${hb2 ? `other books ${other.h === hb2.otherFourDeptBooks.h ? 'same' : 'DIFFERENT'}, articles ${hArt.h === hb2.fourDeptArticles.h ? 'same' : 'DIFFERENT'}, journals ${hJ.h === hb2.fourDeptJournals.h ? 'same' : 'DIFFERENT'}` : 'no baseline given'}; INFO only, not a pass/fail - whole tables: books ${hall.books.n} ${hb2 ? (hall.books.h === hb2.allBooks.h ? 'same' : 'differ') : ''} (the run itself changes it), articles ${hall.articles.n} ${hb2 ? (hall.articles.h === hb2.allArticles.h ? 'same' : 'differ (live engine)') : ''}, journals ${hall.journals.n} ${hb2 ? (hall.journals.h === hb2.allJournals.h ? 'same' : 'differ') : ''}`);

    const all = await q(`select id, title, domain, doi, year, status, "accessStatus" access from "Book" where id = any($1::text[]) order by id`, IDS);
    const step = Math.max(1, Math.floor(all.length / 20));
    const sample = all.filter((_, i) => i % step === 0).slice(0, 20).map((r) => ({ ...r, title: String(r.title).slice(0, 80) }));
    add('6. 20 sample rows listed', sample.length === Math.min(20, all.length), `${sample.length} rows`);
    return { mode: 'verify', database: db, at, runId: RUN, allOk: checks.every((c) => c.ok), checks, components: comp, liveDepartmentTotals: live, sample20: sample };
  }, { timeout: 170000, maxWait: 20000 });
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
  if (out.mode === 'verify' && !out.allOk) process.exitCode = 4;
})().catch((e) => { console.error('FAILED', String((e && e.message) || e).slice(0, 400)); process.exitCode = 1; });
