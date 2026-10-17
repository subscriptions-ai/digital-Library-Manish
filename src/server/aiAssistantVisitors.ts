import type { PrismaClient } from '@prisma/client';

/**
 * AI visitors and what they asked. A visitor is a contact (who filled in the pre-chat form), kept apart from a Lead (who asked
 * for a quote): the gate never creates a Lead, and Get a quote links the visitor to the one it creates or matches.
 *
 * Every question the assistant takes on is one stored message row AND one step on the conversation's counters, written
 * together, so the counters and the rows always agree:
 *   - model answer  → user + assistant           (the only roles the allowance counts and the model's history reads)
 *   - local reply   → local_user + local_assistant
 *   - no answer     → failed_user                (timeout or every provider failed)
 * A Gemini failure answered by Grok is one question and one answer; provider attempts are recorded separately as events.
 * Contact details live here and in the admin API only. Nothing in this file is ever sent to a model.
 */

export const QUESTION_ROLES = ['user', 'local_user', 'failed_user'] as const;
export const ANSWER_ROLES = ['assistant', 'local_assistant'] as const;

const MESSAGE_CAP = 1000;

// ── The pre-chat form ─────────────────────────────────────────────────────

/**
 * The visitor these details belong to, made or found, and attached to this session's conversation.
 * Matching: the signed-in account first, then the email, then the mobile; otherwise the visitor this session already has,
 * when the new details do not contradict it (the same person adding a mobile). A match only fills what was blank and takes
 * the newest spelling of the name — nothing a visitor said before is overwritten by a different address.
 */
export async function resolveVisitor(
  prisma: PrismaClient,
  input: { sessionId: string; userId: string | null; name: string; email: string; phone: string; matchedLeadId: string | null },
) {
  const { sessionId, userId, name, email, phone } = input;
  const conversation = await prisma.aIConversation.findFirst({ where: { sessionId }, select: { id: true, visitorId: true } });

  let visitor =
    (userId && await prisma.aIVisitor.findFirst({ where: { userId }, orderBy: { firstSeenAt: 'asc' } })) ||
    (email && await prisma.aIVisitor.findFirst({ where: { email }, orderBy: { firstSeenAt: 'asc' } })) ||
    (phone && await prisma.aIVisitor.findFirst({ where: { phone }, orderBy: { firstSeenAt: 'asc' } })) ||
    null;
  if (!visitor && conversation?.visitorId) {
    const current = await prisma.aIVisitor.findUnique({ where: { id: conversation.visitorId } });
    const agrees = current && (!current.email || !email || current.email === email) && (!current.phone || !phone || current.phone === phone)
      && (!current.userId || !userId || current.userId === userId);
    if (agrees) visitor = current;
  }

  const now = new Date();
  visitor = visitor
    ? await prisma.aIVisitor.update({
        where: { id: visitor.id },
        data: {
          name,
          email: visitor.email || email || null,
          phone: visitor.phone || phone || null,
          userId: visitor.userId || userId,
          matchedLeadId: visitor.matchedLeadId || input.matchedLeadId,
          lastActiveAt: now,
        },
      })
    : await prisma.aIVisitor.create({
        data: { name, email: email || null, phone: phone || null, userId, matchedLeadId: input.matchedLeadId, firstSeenAt: now, lastActiveAt: now },
      });

  const conv = conversation
    ? await prisma.aIConversation.update({ where: { id: conversation.id }, data: { visitorId: visitor.id }, select: { id: true } })
    : await prisma.aIConversation.create({ data: { sessionId, visitorId: visitor.id }, select: { id: true } });

  return { visitor, conversationId: conv.id };
}

/** This session's conversation, when it has passed the pre-chat form; null otherwise. */
export async function gatedConversation(prisma: PrismaClient, sessionId: string) {
  return prisma.aIConversation.findFirst({
    where: { sessionId, visitorId: { not: null } },
    select: { id: true, visitorId: true, visitor: { select: { name: true } } },
  });
}

// ── Questions ─────────────────────────────────────────────────────────────

type Conv = { id: string; visitorId: string | null };

async function touch(prisma: PrismaClient, conv: Conv, at: Date) {
  await prisma.aIConversation.update({ where: { id: conv.id }, data: { lastActivityAt: at } });
  if (conv.visitorId) await prisma.aIVisitor.update({ where: { id: conv.visitorId }, data: { lastActiveAt: at } }).catch(() => {});
}

/** A model answered (after a fallback or not): one question, one answer. These two rows are what the allowance counts. */
export async function recordModelAnswer(prisma: PrismaClient, conv: Conv, question: string, answer: string, provider: string) {
  const at = new Date();
  // Explicit, distinct times: rows written together would share one timestamp and could be read back in either order.
  await prisma.$transaction([
    prisma.aIMessage.createMany({
      data: [
        { conversationId: conv.id, role: 'user', content: question.slice(0, MESSAGE_CAP), createdAt: at },
        { conversationId: conv.id, role: 'assistant', content: answer, provider, createdAt: new Date(at.getTime() + 1) },
      ],
    }),
    prisma.aIConversation.update({ where: { id: conv.id }, data: { questionsAsked: { increment: 1 }, successfulAnswers: { increment: 1 } } }),
  ]);
  await touch(prisma, conv, at);
}

/** Answered without a model (a greeting, a thank-you, "get a quote"). Counts as a question and an answer; costs no allowance. */
export async function recordLocalAnswer(prisma: PrismaClient, conv: Conv, question: string, answer: string) {
  const at = new Date();
  await prisma.$transaction([
    prisma.aIMessage.createMany({
      data: [
        { conversationId: conv.id, role: 'local_user', content: question.slice(0, MESSAGE_CAP), createdAt: at },
        { conversationId: conv.id, role: 'local_assistant', content: answer, provider: 'local', createdAt: new Date(at.getTime() + 1) },
      ],
    }),
    prisma.aIConversation.update({ where: { id: conv.id }, data: { questionsAsked: { increment: 1 }, successfulAnswers: { increment: 1 } } }),
  ]);
  await touch(prisma, conv, at);
}

/** Taken on, but no provider answered. Counts as a question and a failure; costs no allowance. */
export async function recordFailedQuestion(prisma: PrismaClient, conv: Conv, question: string, outcome: 'timeout' | 'unavailable') {
  const at = new Date();
  await prisma.$transaction([
    prisma.aIMessage.create({ data: { conversationId: conv.id, role: 'failed_user', content: question.slice(0, MESSAGE_CAP), outcome, createdAt: at } }),
    prisma.aIConversation.update({ where: { id: conv.id }, data: { questionsAsked: { increment: 1 }, failedAnswers: { increment: 1 } } }),
  ]);
  await touch(prisma, conv, at);
}

/** Get a quote was sent from a session with a visitor: the visitor now points at that lead. Never a second visitor. */
export async function linkVisitorToLead(prisma: PrismaClient, sessionId: string, leadId: string) {
  const conv = await prisma.aIConversation.findFirst({ where: { sessionId, visitorId: { not: null } }, select: { visitorId: true } });
  if (!conv?.visitorId) return null;
  const now = new Date();
  await prisma.aIVisitor.update({ where: { id: conv.visitorId }, data: { leadId, quoteRequestedAt: now, lastActiveAt: now } });
  return conv.visitorId;
}

// ── Admin reads ───────────────────────────────────────────────────────────

const DAY = 86_400_000;
export type Range = 'today' | '7d' | '30d' | 'all';
function rangeStart(range: Range | undefined, now = new Date()): Date | null {
  if (range === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
  if (range === '7d') return new Date(now.getTime() - 7 * DAY);
  if (range === '30d') return new Date(now.getTime() - 30 * DAY);
  return null;
}

/** The overview cards: the last 24 hours, from stored rows. User questions here, never provider requests. */
export async function visitorOverview(prisma: PrismaClient, now = new Date()) {
  const since = new Date(now.getTime() - DAY);
  const [activeVisitors, newVisitors, questions, answers, failed, quoteRequests, convRows, totalVisitors] = await Promise.all([
    prisma.aIVisitor.count({ where: { lastActiveAt: { gte: since } } }),
    prisma.aIVisitor.count({ where: { firstSeenAt: { gte: since } } }),
    prisma.aIMessage.count({ where: { role: { in: [...QUESTION_ROLES] }, createdAt: { gte: since } } }),
    prisma.aIMessage.count({ where: { role: { in: [...ANSWER_ROLES] }, createdAt: { gte: since } } }),
    prisma.aIMessage.count({ where: { role: 'failed_user', createdAt: { gte: since } } }),
    prisma.aIMessage.count({ where: { role: 'event', content: 'quote:requested', createdAt: { gte: since } } }),
    prisma.aIMessage.groupBy({ by: ['conversationId'], where: { role: { in: [...QUESTION_ROLES] }, createdAt: { gte: since } } }),
    prisma.aIVisitor.count(),
  ]);
  return {
    windowHours: 24,
    uniqueVisitors: activeVisitors,
    newContacts: newVisitors,
    conversations: convRows.length,
    questionsAsked: questions,
    successfulAnswers: answers,
    failedAnswers: failed,
    quoteRequests,
    totalVisitors,
  };
}

type LeadRef = { id: string; name: string; status: string; source: string } | null;
/** Not requested / Requested / Converted (the CRM marked the lead a subscriber). */
function quoteStatus(v: { leadId: string | null; quoteRequestedAt: Date | null }, lead: LeadRef) {
  if (!v.leadId && !v.quoteRequestedAt) return 'Not requested';
  return lead?.status === 'Subscriber' ? 'Converted' : 'Requested';
}

async function leadsById(prisma: PrismaClient, ids: (string | null)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])];
  if (!want.length) return new Map<string, NonNullable<LeadRef>>();
  const rows = await prisma.lead.findMany({ where: { id: { in: want } }, select: { id: true, name: true, status: true, source: true } });
  return new Map(rows.map(r => [r.id, r]));
}

async function countsByVisitor(prisma: PrismaClient, ids: string[]) {
  if (!ids.length) return new Map<string, { conversations: number; questions: number; answers: number; failed: number }>();
  const rows = await prisma.aIConversation.groupBy({
    by: ['visitorId'], where: { visitorId: { in: ids } },
    _sum: { questionsAsked: true, successfulAnswers: true, failedAnswers: true }, _count: { _all: true },
  });
  return new Map(rows.map(r => [r.visitorId as string, {
    conversations: r._count._all,
    questions: r._sum.questionsAsked ?? 0,
    answers: r._sum.successfulAnswers ?? 0,
    failed: r._sum.failedAnswers ?? 0,
  }]));
}

export async function listVisitors(prisma: PrismaClient, opts: {
  q?: string; range?: Range; type?: 'member' | 'guest'; quote?: 'yes' | 'no'; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize || 25));
  const and: any[] = [];
  const start = rangeStart(opts.range);
  if (start) and.push({ lastActiveAt: { gte: start } });
  if (opts.type === 'member') and.push({ userId: { not: null } });
  if (opts.type === 'guest') and.push({ userId: null });
  if (opts.quote === 'yes') and.push({ OR: [{ leadId: { not: null } }, { quoteRequestedAt: { not: null } }] });
  if (opts.quote === 'no') and.push({ leadId: null, quoteRequestedAt: null });
  const q = (opts.q || '').trim().slice(0, 100);
  if (q) {
    const digits = q.replace(/\D/g, '');
    and.push({ OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q.toLowerCase() } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits.length > 10 ? digits.slice(-10) : digits } }] : []),
    ] });
  }
  const where = and.length ? { AND: and } : {};
  const [total, rows] = await Promise.all([
    prisma.aIVisitor.count({ where }),
    prisma.aIVisitor.findMany({ where, orderBy: { lastActiveAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const [counts, leads] = await Promise.all([countsByVisitor(prisma, rows.map(r => r.id)), leadsById(prisma, rows.map(r => r.leadId))]);
  return {
    total, page, pageSize,
    rows: rows.map(v => {
      const c = counts.get(v.id);
      const lead = v.leadId ? leads.get(v.leadId) ?? null : null;
      return {
        id: v.id, name: v.name, email: v.email, phone: v.phone,
        userType: v.userId ? 'Logged-in' : 'Guest',
        questions: c?.questions ?? 0, answers: c?.answers ?? 0, failed: c?.failed ?? 0, conversations: c?.conversations ?? 0,
        quoteStatus: quoteStatus(v, lead),
        firstSeenAt: v.firstSeenAt, lastActiveAt: v.lastActiveAt,
      };
    }),
  };
}

export async function visitorDetail(prisma: PrismaClient, id: string) {
  const v = await prisma.aIVisitor.findUnique({ where: { id } });
  if (!v) return null;
  const [user, leads, conversations, counts] = await Promise.all([
    v.userId ? prisma.user.findUnique({ where: { id: v.userId }, select: { id: true, email: true, displayName: true, role: true } }) : null,
    leadsById(prisma, [v.leadId, v.matchedLeadId]),
    prisma.aIConversation.findMany({
      where: { visitorId: id }, orderBy: { lastActivityAt: 'desc' }, take: 20,
      select: { id: true, startedAt: true, lastActivityAt: true, questionsAsked: true, successfulAnswers: true, failedAnswers: true, leadId: true },
    }),
    countsByVisitor(prisma, [id]),
  ]);
  const lead = v.leadId ? leads.get(v.leadId) ?? null : null;
  const c = counts.get(id);
  return {
    id: v.id, name: v.name, email: v.email, phone: v.phone,
    userType: v.userId ? 'Logged-in' : 'Guest',
    user,
    firstSeenAt: v.firstSeenAt, lastActiveAt: v.lastActiveAt,
    totals: { conversations: c?.conversations ?? 0, questions: c?.questions ?? 0, answers: c?.answers ?? 0, failed: c?.failed ?? 0 },
    quoteStatus: quoteStatus(v, lead),
    quoteRequestedAt: v.quoteRequestedAt,
    lead,
    matchedLead: v.matchedLeadId ? leads.get(v.matchedLeadId) ?? null : null,
    conversations,
  };
}

export async function listConversations(prisma: PrismaClient, opts: { range?: Range; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize || 25));
  const start = rangeStart(opts.range);
  // A conversation worth opening: someone passed the form or asked something. Allowance reads alone make none.
  const where: any = { OR: [{ visitorId: { not: null } }, { questionsAsked: { gt: 0 } }, { messages: { some: { role: { in: [...QUESTION_ROLES] } } } }] };
  if (start) where.lastActivityAt = { gte: start };
  const [total, rows] = await Promise.all([
    prisma.aIConversation.count({ where }),
    prisma.aIConversation.findMany({
      where, orderBy: { lastActivityAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, startedAt: true, lastActivityAt: true, questionsAsked: true, successfulAnswers: true, failedAnswers: true, leadId: true,
        visitor: { select: { id: true, name: true, userId: true } },
      },
    }),
  ]);
  return { total, page, pageSize, rows };
}

/** One conversation, oldest first. Visitor text and answers only — no prompt, key, header or provider configuration exists in these rows. */
export async function conversationDetail(prisma: PrismaClient, id: string) {
  const c = await prisma.aIConversation.findUnique({
    where: { id },
    select: {
      id: true, startedAt: true, lastActivityAt: true, questionsAsked: true, successfulAnswers: true, failedAnswers: true, leadId: true,
      visitor: { select: { id: true, name: true, email: true, phone: true, userId: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, role: true, content: true, provider: true, outcome: true, createdAt: true } },
    },
  });
  if (!c) return null;
  // Events carry only a code; the ones staff can act on are shown, provider bookkeeping is summarised instead.
  const SHOWN_EVENTS = new Set(['quota:reached', 'quote:requested', 'model:fallback']);
  return { ...c, messages: c.messages.filter(m => m.role !== 'event' || SHOWN_EVENTS.has(m.content)) };
}
