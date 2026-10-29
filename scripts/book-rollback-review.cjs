/**
 * READ-ONLY review of what removing a set of imported Books would touch. Put `var __IDS__ = [...]; var __RUN__ = "...";` in front. Counts every dependency on the ids
 * (chapters, read events, saved items, library events, ingestion audit entries) and how many of the ids still look exactly as imported. Executes NOTHING that changes data.
 */
const { PrismaClient } = require('@prisma/client');
(async () => { const p = new PrismaClient();
  const r = await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 90000');
    const q = (s, ...a) => tx.$queryRawUnsafe(s, ...a); const n = async (s) => (await q(s, __IDS__))[0].n;
    return {
      at: new Date().toISOString(), books: __IDS__.length,
      existing: await n(`select count(*)::int n from "Book" where id = any($1::text[])`),
      stillAsImported: await n(`select count(*)::int n from "Book" where id = any($1::text[]) and status = 'Published' and "ownershipSource" = 'Ingested' and "pdfUrl" is null and "updatedAt" = "createdAt"`),
      changedSinceImport: await n(`select count(*)::int n from "Book" where id = any($1::text[]) and "updatedAt" <> "createdAt"`),
      dependents: {
        chapters: await n(`select count(*)::int n from "Chapter" where "bookId" = any($1::text[])`),
        readEvents: await n(`select count(*)::int n from "ReadEvent" where "itemId" = any($1::text[])`),
        libraryEvents: await n(`select count(*)::int n from "LibraryEvent" where "itemId" = any($1::text[])`),
      },
      audit: await q(`select id, meta->>'batch' batch, jsonb_array_length(meta->'inserted') n from "IngestionAudit" where action = 'BOOK_SOURCE_IMPORT' and meta->>'runId' = $1 order by (meta->>'batch')::int`, __RUN__),
    }; });
  r.auditEntries = r.audit.length; r.auditIds = r.audit.reduce((s, a) => s + a.n, 0); delete r.audit;
  process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })().catch(e => { console.error('FAILED', String(e && e.message || e).slice(0, 300)); process.exit(1); });
