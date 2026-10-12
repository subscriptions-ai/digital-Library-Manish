import type { PrismaClient } from '@prisma/client';
import { aiConfig } from './aiAssistantConfig.js';

/**
 * How many model-answered questions a visitor has used, worked out from what is already stored: a question
 * counts when its sanitised user message was saved, and that happens only after the model answered. Local
 * replies, timeouts and provider errors never save one, so they cost nothing. No counter to drift out of sync.
 *
 * The window rolls: a question stops counting `windowMinutes` after it was asked, so a visitor who spent all
 * four in the first ten minutes gets the first one back at minute sixty, not at the top of some clock hour.
 */
export type Quota = {
  tier: 'anonymous' | 'lead';
  limit: number;
  used: number;
  remaining: number;
  windowMinutes: number;
  /** When the next question is freed; null while at least one is left. */
  nextAvailableAt: string | null;
};

export async function readQuota(prisma: PrismaClient, sessionId: string, now: Date = new Date()): Promise<Quota> {
  const cfg = aiConfig();
  const since = new Date(now.getTime() - cfg.windowMinutes * 60_000);
  const [lead, asked] = await Promise.all([
    prisma.aIConversation.findFirst({ where: { sessionId, leadId: { not: null } }, select: { id: true } }),
    prisma.aIMessage.findMany({
      where: { role: 'user', createdAt: { gt: since }, conversation: { sessionId } },
      select: { createdAt: true }, orderBy: { createdAt: 'asc' },
    }),
  ]);
  const tier = lead ? 'lead' : 'anonymous';
  const limit = tier === 'lead' ? cfg.leadQuestions : cfg.anonymousQuestions;
  const used = asked.length;
  const remaining = Math.max(0, limit - used);
  // The question that frees the next place is the one asked `used - limit + 1` places from the oldest.
  const freeing = remaining === 0 ? asked[used - limit] : null;
  return {
    tier, limit, used, remaining, windowMinutes: cfg.windowMinutes,
    nextAvailableAt: freeing ? new Date(freeing.createdAt.getTime() + cfg.windowMinutes * 60_000).toISOString() : null,
  };
}

/** Event codes kept beside the messages, so usage can be read from the same tables. No text, no personal data. */
export type AssistantEvent = 'local:greeting' | 'local:thanks' | 'local:quote' | 'model:timeout' | 'model:error' | 'quota:reached';

/** Best effort and never in the way of a reply. Stored as role "event", which the model history ignores. */
export async function recordEvent(prisma: PrismaClient, sessionId: string, code: AssistantEvent): Promise<void> {
  try {
    const conversation = (await prisma.aIConversation.findFirst({ where: { sessionId }, select: { id: true } }))
      ?? (await prisma.aIConversation.create({ data: { sessionId }, select: { id: true } }));
    await prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'event', content: code } });
  } catch { /* analytics must not break the assistant */ }
}

/** Read-only usage counts for admins, from the same tables. */
export async function usageSummary(prisma: PrismaClient, days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT role, content, count(*)::int AS n FROM "AIMessage" WHERE "createdAt" >= $1 AND role IN ('user','event') GROUP BY 1, 2`, since);
  const by = (role: string, content?: string) => rows.filter(r => r.role === role && (content === undefined || r.content === content)).reduce((a, r) => a + r.n, 0);
  const conv: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT
       (SELECT count(*) FROM "AIConversation" WHERE "startedAt" >= $1)::int AS conversations,
       (SELECT count(*) FROM "AIConversation" WHERE "startedAt" >= $1 AND "leadId" IS NOT NULL)::int AS with_lead,
       (SELECT count(DISTINCT c.id) FROM "AIConversation" c JOIN "AIMessage" m ON m."conversationId" = c.id
          WHERE m.role = 'event' AND m.content = 'quota:reached' AND m."createdAt" >= $1 AND c."leadId" IS NOT NULL)::int AS leads_after_quota`, since);
  return {
    sinceDays: days,
    modelAnsweredQuestions: by('user'),
    localZeroTokenReplies: by('event', 'local:greeting') + by('event', 'local:thanks') + by('event', 'local:quote'),
    modelTimeouts: by('event', 'model:timeout'),
    modelErrors: by('event', 'model:error'),
    quotaReached: by('event', 'quota:reached'),
    conversations: conv[0]?.conversations ?? 0,
    conversationsWithLead: conv[0]?.with_lead ?? 0,
    leadsAfterQuota: conv[0]?.leads_after_quota ?? 0,
  };
}
