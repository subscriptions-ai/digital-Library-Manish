/**
 * READ-ONLY verifier for the Optometry & Ophthalmology article backfill. It writes nothing: one SET TRANSACTION READ ONLY transaction, one JSON on stdout.
 * (Named .js, not .cjs, on purpose: it is not an apply/rollback script and must not be passed to scripts/prod-run.sh, which would refuse it.)
 *
 * Two modes, chosen by the preamble:
 *
 *   BEFORE the run - take the baseline and keep it next to the plan:
 *     (printf 'var __MODE__ = "baseline";\n'; cat scripts/dept-optometry-ophthalmology-articles-verify.js) | ssh ... docker exec -i -w /app <app> node - > baseline.json
 *
 *   AFTER the run:
 *     (printf 'var __MODE__ = "verify"; var __RUN__ = "<run id>"; var __EXPECT__ = %s;\n' '{"rows":200,"baseline":'"$(cat baseline.json)"'}'; cat <this file>) | ... node -
 *
 * Checks (each is {name, ok, detail}; `allOk` is their conjunction; exit code 4 when something is not ok):
 * PASS/FAIL rests only on three things: the run's own rows and audit ids, the Optometry & Ophthalmology department, and the plan's journals. The whole Article / Journal / Book
 * tables are reported as INFORMATION only (the live engine writes elsewhere), never as a pass/fail.
 *
 *   1  articles written by the run = the rows the plan promised = the ids the run's audit rows list, and no rollback has touched it
 *   2  no duplicate DOI: among the run's rows and across the whole department
 *   3  every row is as promised: Published, LinkOnly, no file, no abstract, a commercial-OK CC licence with its URL, accessType OpenAccess, not NC, this department, journal linked,
 *      fingerprint doi:<doi>, source Crossref or EuropePMC, year 2020..next year
 *   4  the plan's journals (the ones the run's rows belong to: __JOURNALS__ / __EXPECT__.journalIds): all there, in this department, still MetadataOnly, rows identical to the baseline
 *   5  the department page count (articles + books + legacy + article-less public journals) is what the rows imply, and the menu count likewise
 *   6  existing rows unchanged: the department's articles/books as at the baseline (strict) and the whole Article/Journal/Book tables (informational: the live engine writes elsewhere)
 *   7  20 sample rows, evenly spaced, with everything a person needs to open the DOI
 * Not here: the rollback dry run - it goes through the wrapper:
 *   scripts/prod-run.sh scripts/dept-optometry-ophthalmology-articles-rollback.cjs <run id> --plan=<the frozen plan>      (expect wouldDelete = rows, kept 0)
 */
const { PrismaClient } = require('@prisma/client');
const DEPARTMENT = 'Optometry & Ophthalmology';
const MODE = typeof __MODE__ !== 'undefined' ? __MODE__ : 'baseline';
const RUN = typeof __RUN__ !== 'undefined' ? __RUN__ : null;
const EXPECT = typeof __EXPECT__ !== 'undefined' ? __EXPECT__ : {};
const JOURNALS = typeof __JOURNALS__ !== 'undefined' ? __JOURNALS__ : (EXPECT.journalIds || []);
const WITHHELD = ['draft', 'rejected', 'hidden', 'deleted', 'removed', 'pending', 'review', 'in review', 'needs review', 'unpublished', 'withdrawn', 'archived', 'takedown'];   // publicStatus.ts

(async () => {
  const p = new PrismaClient();
  const out = await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const q = (sql, ...a) => tx.$queryRawUnsafe(sql, ...a);
    const one = async (sql, ...a) => (await q(sql, ...a))[0];
    const at = (await one(`select now()::text t`)).t;
    const db = (await one('select current_database() d')).d;
    const thisYear = new Date().getFullYear();

    // order-independent hashes: the sum of a 64-bit hash of each row's identifying fields (views and updatedAt are left out on purpose: reads move them)
    const articleCols = `concat_ws('|', id, status, coalesce("accessStatus",''), coalesce(licence,''), coalesce(doi,''), coalesce("journalId",''), coalesce(domain,''), (abstract is null)::text, ("pdfUrl" is null)::text, coalesce(fingerprint,''))`;
    const journalCols = `concat_ws('|', id, status, coalesce(issn,''), coalesce(eissn,''), coalesce(domain,''), coalesce(licence,''), coalesce("rightsBasis",''), title)`;
    const bookCols = `concat_ws('|', id, status, coalesce("accessStatus",''), coalesce(domain,''), coalesce(licence,''), title)`;
    const agg = (table, cols, where, ...a) => one(`select count(*)::int n, coalesce(sum(hashtextextended(${cols}, 0)::numeric), 0)::text h from "${table}" where ${where}`, ...a);

    const components = async () => {
      const [articles, books, legacy, articleLess, journals, withArticles] = await Promise.all([
        one(`select count(*)::int n from "Article" where domain = $1 and status = 'Published'`, DEPARTMENT),
        one(`select count(*)::int n from "Book" where domain = $1 and status = 'Published'`, DEPARTMENT),
        one(`select count(*)::int n from "Content" c where c.domain = $1 and lower(c.status) not in (${WITHHELD.map((s) => `'${s}'`).join(',')})`, DEPARTMENT),
        one(`select count(*)::int n from "Journal" j where j.status in ('Accepted','MetadataOnly') and j.domain = $1 and not exists (select 1 from "Article" a where a."journalId" = j.id and a.status = 'Published')`, DEPARTMENT),
        q(`select status, count(*)::int n from "Journal" where domain = $1 group by 1 order by 1`, DEPARTMENT),
        one(`select count(distinct a."journalId")::int n from "Article" a where a.domain = $1 and a.status = 'Published'`, DEPARTMENT),
      ]);
      const c = { articles: articles.n, books: books.n, legacy: legacy.n, articleLessPublicJournals: articleLess.n, journalsByStatus: Object.fromEntries(journals.map((j) => [j.status, j.n])), journalsWithPublishedArticles: withArticles.n };
      c.pageTotal = c.articles + c.books + c.legacy + c.articleLessPublicJournals;       // /api/domain-data total (server.ts:656-690 + :7498)
      c.menuTotal = c.articles + c.books + c.legacy;                                      // the department explorer / menu figure: journals not counted
      return c;
    };

    if (MODE === 'baseline') {
      const o = { mode: 'baseline', database: db, at, department: DEPARTMENT, components: await components() };
      o.hashes = {
        departmentArticles: await agg('Article', articleCols, `domain = $1 and "createdAt" <= $2::timestamptz`, DEPARTMENT, at),
        departmentJournals: await agg('Journal', journalCols, `domain = $1`, DEPARTMENT),
        planJournals: await agg('Journal', journalCols, `id = any($1::text[])`, JOURNALS),
        departmentBooks: await agg('Book', bookCols, `domain = $1`, DEPARTMENT),
        allArticles: await agg('Article', articleCols, `"createdAt" <= $1::timestamptz`, at),
        allJournals: await agg('Journal', journalCols, `true`),
        allBooks: await agg('Book', bookCols, `true`),
      };
      return o;
    }

    // ---- verify ---------------------------------------------------------------------------------------------------------------------------------
    if (!RUN) throw new Error('verify needs var __RUN__');
    const base = EXPECT.baseline || null;
    const checks = []; const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
    const by = `ArticleBackfill:${RUN}`;
    const rows = await one(`select count(*)::int n from "Article" where "createdBy" = $1`, by);
    const audits = await q(`select meta from "IngestionAudit" where action = 'ARTICLE_BACKFILL_IMPORT' and meta->>'runId' = $1`, RUN);
    const auditIds = audits.flatMap((a) => (a.meta.inserted || []).map((x) => x.id));
    const present = auditIds.length ? (await one(`select count(*)::int n from "Article" where id = any($1::text[])`, auditIds)).n : 0;
    const rolledBack = (await one(`select count(*)::int n from "IngestionAudit" where action = 'ARTICLE_BACKFILL_ROLLBACK' and meta->>'runId' = $1`, RUN)).n;
    add('1. articles written = rows promised = ids in the audit rows', rows.n === EXPECT.rows && auditIds.length === EXPECT.rows && present === EXPECT.rows && rolledBack === 0,
      `in table ${rows.n}, promised ${EXPECT.rows}, audit ids ${auditIds.length} (${audits.length} batch rows), of which present ${present}, rollback audit rows ${rolledBack}`);

    const dupRun = await q(`select lower(doi) d, count(*)::int n from "Article" where lower(doi) in (select lower(doi) from "Article" where "createdBy" = $1) group by 1 having count(*) > 1`, by);
    const dupDept = (await one(`select count(*)::int n from (select lower(doi) from "Article" where domain = $1 and doi is not null group by 1 having count(*) > 1) t`, DEPARTMENT)).n;
    add('2. no duplicate DOI (run rows; whole department)', dupRun.length === 0 && dupDept === 0, `run rows with a twin ${dupRun.length}, duplicate DOIs in the department ${dupDept}`);

    const bad = await one(`select
        count(*) filter (where status <> 'Published')::int not_published,
        count(*) filter (where "accessStatus" is distinct from 'LinkOnly')::int not_linkonly,
        count(*) filter (where "pdfUrl" is not null)::int has_file,
        count(*) filter (where abstract is not null)::int has_abstract,
        count(*) filter (where licence is null or licence !~* '^(cc[ -]?by([ -]?(sa|nd))?|cc0|public[ -]?domain)$' or licence ~* 'nc')::int bad_licence,
        count(*) filter (where metadata->>'licenceUrl' is null or metadata->>'licenceUrl' !~* 'creativecommons\\.org')::int no_licence_url,
        count(*) filter (where "licenceIsNC" is distinct from false)::int is_nc,
        count(*) filter (where "accessType" is distinct from 'OpenAccess')::int not_openaccess,
        count(*) filter (where domain is distinct from $2)::int wrong_department,
        count(*) filter (where "journalId" is null)::int no_journal,
        count(*) filter (where fingerprint is distinct from 'doi:' || lower(doi))::int bad_fingerprint,
        count(*) filter (where source not in ('Crossref','EuropePMC'))::int bad_source,
        count(*) filter (where year is null or year < 2020 or year > $3)::int bad_year
      from "Article" where "createdBy" = $1`, by, DEPARTMENT, thisYear + 1);
    add('3. every row as promised (Published, LinkOnly, no file, no abstract, commercial-OK CC + URL, OpenAccess from the licence, not NC, right department/journal/fingerprint/source/year)',
      Object.values(bad).every((v) => Number(v) === 0), JSON.stringify(bad));
    const mixes = await Promise.all([
      q(`select licence, count(*)::int n from "Article" where "createdBy" = $1 group by 1 order by 2 desc`, by),
      q(`select source, count(*)::int n from "Article" where "createdBy" = $1 group by 1 order by 2 desc`, by),
      q(`select coalesce(metadata->>'licenceContentVersion','(none)') v, count(*)::int n from "Article" where "createdBy" = $1 group by 1 order by 2 desc`, by),
    ]);

    // check 4: only the plan's journals decide; the department's other journals are information
    const jids = JOURNALS;
    const jRows = jids.length ? await q(`select id, domain, status from "Journal" where id = any($1::text[])`, jids) : [];
    const jWrong = jRows.filter((j) => j.domain !== DEPARTMENT || j.status !== 'MetadataOnly').length;
    const jHash = await agg('Journal', journalCols, `id = any($1::text[])`, jids);
    const jBase = base?.hashes?.planJournals;
    const deptJ = await q(`select status, count(*)::int n from "Journal" where domain = $1 group by 1`, DEPARTMENT);
    add('4. the plan\'s journals: all present, Optometry & Ophthalmology, MetadataOnly, rows identical to the baseline',
      jids.length > 0 && jRows.length === jids.length && jWrong === 0 && (!jBase || (jHash.n === jBase.n && jHash.h === jBase.h)),
      `${jRows.length}/${jids.length} plan journals found, not MetadataOnly or not in the department ${jWrong}, hash ${jBase ? (jHash.h === jBase.h ? 'same as baseline' : 'DIFFERENT from baseline') : 'no baseline given'}; INFO: the department's journals by status ${JSON.stringify(Object.fromEntries(deptJ.map((x) => [x.status, x.n])))}`);

    const comp = await components();
    const onlyRun = (await one(`select count(*)::int n from (select a."journalId" from "Article" a where a.domain = $1 and a.status = 'Published' group by 1 having bool_and(a."createdBy" = $2)) t`, DEPARTMENT, by)).n;
    let pageOk = comp.pageTotal === comp.articles + comp.books + comp.legacy + comp.articleLessPublicJournals;
    let detail = `now: articles ${comp.articles} + books ${comp.books} + legacy ${comp.legacy} + article-less journals ${comp.articleLessPublicJournals} = page ${comp.pageTotal}; menu ${comp.menuTotal}`;
    if (base) {
      const b = base.components;
      const expPage = b.pageTotal + rows.n - onlyRun, expMenu = b.menuTotal + rows.n;
      pageOk = pageOk && comp.pageTotal === expPage && comp.menuTotal === expMenu && comp.books === b.books && comp.legacy === b.legacy;
      detail += `; expected page ${b.pageTotal} + ${rows.n} - ${onlyRun} journals that gained their first article = ${expPage}, menu ${b.menuTotal} + ${rows.n} = ${expMenu}`;
    }
    add('5. department page and menu count', pageOk, detail);
    let live = null;
    try { const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/domain-data?domain=${encodeURIComponent(DEPARTMENT)}`, { signal: AbortSignal.timeout(8000) }); live = r.ok ? (await r.json()).total : `HTTP ${r.status}`; } catch (e) { live = 'unreachable from here'; }

    const hDeptA = await agg('Article', articleCols, `domain = $1 and "createdAt" <= $2::timestamptz and "createdBy" is distinct from $3`, DEPARTMENT, base?.at || at, by);
    const hDeptB = await agg('Book', bookCols, `domain = $1`, DEPARTMENT);
    const hAll = { articles: await agg('Article', articleCols, `"createdAt" <= $1::timestamptz and "createdBy" is distinct from $2`, base?.at || at, by), journals: await agg('Journal', journalCols, `true`), books: await agg('Book', bookCols, `true`) };
    const hb = base?.hashes;
    const strict = !hb || (hDeptA.h === hb.departmentArticles.h && hDeptA.n === hb.departmentArticles.n && hDeptB.h === hb.departmentBooks.h && hDeptB.n === hb.departmentBooks.n);
    add('6. existing rows unchanged (the Optometry department strictly; the whole tables are information only)', strict,
      hb ? `department articles ${hDeptA.n}/${hb.departmentArticles.n} ${hDeptA.h === hb.departmentArticles.h ? 'same' : 'DIFFERENT'}, department books ${hDeptB.n}/${hb.departmentBooks.n} ${hDeptB.h === hb.departmentBooks.h ? 'same' : 'DIFFERENT'}; `
        + `INFO only, not a pass/fail - whole tables: articles ${hAll.articles.n} rows ${hAll.articles.h === hb.allArticles.h ? 'same' : 'differ (the live engine writes elsewhere)'}, journals ${hAll.journals.n} ${hAll.journals.h === hb.allJournals.h ? 'same' : 'differ'}, books ${hAll.books.n} ${hAll.books.h === hb.allBooks.h ? 'same' : 'differ'}` : 'no baseline given: nothing to compare');

    const all = await q(`select a.id, a.title, j.title journal, a.doi, a.year, a.licence, a.metadata->>'licenceUrl' licence_url, a.source, a."accessStatus" access, a.status from "Article" a join "Journal" j on j.id = a."journalId" where a."createdBy" = $1 order by a.id`, by);
    const step = Math.max(1, Math.floor(all.length / 20));
    const sample = all.filter((_, i) => i % step === 0).slice(0, 20).map((r) => ({ ...r, title: r.title.slice(0, 90), url: `https://doi.org/${r.doi}` }));
    add('7. 20 sample rows listed', sample.length === Math.min(20, all.length), `${sample.length} rows`);

    return { mode: 'verify', database: db, at, runId: RUN, department: DEPARTMENT, allOk: checks.every((c) => c.ok), checks, components: comp, liveDomainDataTotal: live,
      licenceMix: Object.fromEntries(mixes[0].map((x) => [x.licence, x.n])), sourceMix: Object.fromEntries(mixes[1].map((x) => [x.source, x.n])), contentVersionMix: Object.fromEntries(mixes[2].map((x) => [x.v, x.n])), sample20: sample };
  }, { timeout: 170000, maxWait: 20000 });
  process.stdout.write(JSON.stringify(out));
  await p.$disconnect();
  if (out.mode === 'verify' && !out.allOk) process.exitCode = 4;
})().catch((e) => { console.error('FAILED', String((e && e.message) || e).slice(0, 400)); process.exitCode = 1; });
