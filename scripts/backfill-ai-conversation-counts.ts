/**
 * Sets questionsAsked / successfulAnswers / failedAnswers on every AIConversation from its stored rows. Run once after
 * the deploy that added the counters; safe to run again (it sets, never adds).
 *
 *   npx tsx scripts/backfill-ai-conversation-counts.ts           # dry run: prints what would change
 *   npx tsx scripts/backfill-ai-conversation-counts.ts --apply   # writes
 *
 * Counted: model exchanges (user / assistant rows), and from the deploy on, local_user / local_assistant / failed_user rows.
 * Before the deploy, local replies and failures left only an event code (local:*, model:timeout, model:error); those events
 * are counted only when older than the first new-style row, because after it the same question also has its own row.
 */
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
const db = new PrismaClient();

const firstNew = await db.aIMessage.findFirst({ where: { role: { in: ['local_user', 'failed_user'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
const cutoff = firstNew?.createdAt ?? new Date();

const rows: any[] = await db.$queryRawUnsafe(`
  SELECT c.id,
    c."questionsAsked" AS asked_now, c."successfulAnswers" AS answered_now, c."failedAnswers" AS failed_now,
    count(*) FILTER (WHERE m.role IN ('user','local_user','failed_user'))::int AS q_rows,
    count(*) FILTER (WHERE m.role IN ('assistant','local_assistant'))::int AS a_rows,
    count(*) FILTER (WHERE m.role = 'failed_user')::int AS f_rows,
    count(*) FILTER (WHERE m.role = 'event' AND m.content LIKE 'local:%' AND m."createdAt" < $1)::int AS legacy_local,
    count(*) FILTER (WHERE m.role = 'event' AND m.content IN ('model:timeout','model:error') AND m."createdAt" < $1)::int AS legacy_failed
  FROM "AIConversation" c LEFT JOIN "AIMessage" m ON m."conversationId" = c.id
  GROUP BY c.id`, cutoff);

let changes = 0;
for (const r of rows) {
  const asked = r.q_rows + r.legacy_local + r.legacy_failed;
  const answered = r.a_rows + r.legacy_local;
  const failed = r.f_rows + r.legacy_failed;
  if (asked === r.asked_now && answered === r.answered_now && failed === r.failed_now) continue;
  changes++;
  console.log(`${r.id}: asked ${r.asked_now}→${asked}, answered ${r.answered_now}→${answered}, failed ${r.failed_now}→${failed}`);
  if (apply) await db.aIConversation.update({ where: { id: r.id }, data: { questionsAsked: asked, successfulAnswers: answered, failedAnswers: failed } });
}
console.log(`\n${rows.length} conversations, ${changes} ${apply ? 'updated' : 'would change (dry run; pass --apply to write)'}`);
await db.$disconnect();
