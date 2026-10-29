// Read-only: is anything importing right now? Recent IngestionRun rows, recent IngestionAudit entries, journals created in the last 2 hours by label, and the engine's pause/state settings (no secret values).
const { PrismaClient } = require('@prisma/client');
(async () => { const p = new PrismaClient();
  const r = await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 60000');
    const q = (s, ...a) => tx.$queryRawUnsafe(s, ...a);
    return { at: new Date().toISOString(), db: (await q('select current_database() d'))[0].d,
      runsLast2h: await q(`select phase, source, count(*)::int n, max(at) last from "IngestionRun" where at > now() - interval '2 hours' group by 1,2 order by 3 desc`),
      lastRun: await q(`select phase, source, at from "IngestionRun" order by at desc limit 3`),
      auditLast24h: await q(`select action, count(*)::int n, max(at) last, max(meta->>'runId') runId from "IngestionAudit" where at > now() - interval '24 hours' group by 1 order by 3 desc`),
      journalsCreatedByLabel: await q(`select "rightsBasis" basis, count(*)::int n, min("createdAt") first, max("createdAt") last from "Journal" where "createdAt" > now() - interval '6 hours' group by 1 order by 4 desc`),
      settings: await q(`select key from "AppSetting" where key ilike '%ingest%' or key ilike '%engine%' or key ilike '%pause%' limit 20`) };
  }); process.stdout.write(JSON.stringify(r)); await p.$disconnect(); })().catch(e => { console.error('FAILED', String(e.message).slice(0, 300)); process.exit(1); });
