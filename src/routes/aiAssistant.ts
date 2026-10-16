import express from 'express';
import { PrismaClient } from '@prisma/client';
import { generateAssistantResponse, maskPII, AssistantError } from '../server/aiAssistantService.js';
import { aiConfig } from '../server/aiAssistantConfig.js';
import { localReply } from '../server/aiAssistantLocal.js';
import { readQuota, recordEvent } from '../server/aiAssistantQuota.js';
import { aiAssistantEnabled, DISABLED_BODY } from '../server/aiAssistantSwitch.js';

const router = express.Router();
const prisma = new PrismaClient();

// In-memory rate limiting for Phase 1.
// TODO: SHARED_RATE_LIMITER_IF_HORIZONTAL_SCALING — this map is
// per-process. If the API is ever run behind more than one process,
// move the counter to a shared store (e.g. Redis); until then a
// single-process deployment is correctly limited.
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
/** Bound the map: expired entries for one-off visitors do not stay forever. */
const RATE_LIMIT_MAX_ENTRIES = 1000;

/** A per-address request limiter. Chat and lead submissions share the strict one; reading the allowance has its own, looser one. */
function makeRateLimit(maxPerWindow: number) {
  const hits = new Map<string, { count: number, resetTime: number }>();
  return function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    const record = hits.get(ip);
    if (!record || now > record.resetTime) {
      if (hits.size >= RATE_LIMIT_MAX_ENTRIES) {
        for (const [key, value] of hits) {
          if (now > value.resetTime) hits.delete(key);
        }
      }
      hits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      return next();
    }

    if (record.count >= maxPerWindow) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    record.count += 1;
    next();
  };
}
const rateLimit = makeRateLimit(10);
const statusRateLimit = makeRateLimit(60);
/** The public on/off question is asked once a minute by each open page; this keeps one address from hammering it. */
const switchRateLimit = makeRateLimit(120);

/**
 * The master switch, checked before anything else on the chat route: no allowance is read, no conversation is
 * created and no model is called while the admin has the assistant off. Quote and lead capture are not behind it.
 */
async function requireAssistantOn(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (await aiAssistantEnabled(prisma)) return next();
  res.set('Cache-Control', 'no-store');
  return res.status(503).json(DISABLED_BODY);
}

/** Field limits keep a junk submission from becoming a junk lead. */
const LIMITS = { name: 100, email: 100, phone: 100, organization: 150, purpose: 300, notes: 500 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Who is asking ─────────────────────────────────────────────────────────
// The allowance belongs to a session the SERVER recognises, not to whatever the page says. The first request
// sets an httpOnly cookie carrying the session id; from then on that cookie wins over the id in the request
// body, so clearing localStorage or editing the page's script does not start a fresh allowance. Visitors who
// refuse cookies fall back to the id they send, which is still enforced here. A visitor who clears cookies AND
// storage starts again; the per-address ceiling below bounds what that is worth.
const SESSION_COOKIE = 'ai_sid';
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

function cookieValue(req: express.Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

/** The session this request is judged as, or null if no usable id was given. Sets the cookie when it is new. */
function resolveSession(req: express.Request, res: express.Response, bodyId: unknown): string | null {
  const fromCookie = cookieValue(req, SESSION_COOKIE);
  const fromBody = typeof bodyId === 'string' ? bodyId : null;
  const id = fromCookie && SESSION_ID_RE.test(fromCookie) ? fromCookie : fromBody && SESSION_ID_RE.test(fromBody) ? fromBody : null;
  if (id && id !== fromCookie) {
    res.cookie(SESSION_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86_400_000, path: '/api/ai-assistant' });
  }
  return id;
}

/** One model request at a time per session. Per-process, like the limiter above (see SHARED_RATE_LIMITER_IF_HORIZONTAL_SCALING). */
const inFlight = new Set<string>();

/** Abuse ceiling on model calls per address. Generous, because an institution can sit behind one address; it is not the product allowance. */
const ipCalls = new Map<string, { count: number; resetTime: number }>();
function ipAllows(ip: string, now = Date.now()): boolean {
  const cfg = aiConfig();
  const rec = ipCalls.get(ip);
  if (!rec || now > rec.resetTime) {
    if (ipCalls.size >= RATE_LIMIT_MAX_ENTRIES) for (const [k, v] of ipCalls) if (now > v.resetTime) ipCalls.delete(k);
    ipCalls.set(ip, { count: 1, resetTime: now + cfg.windowMinutes * 60_000 });
    return true;
  }
  if (rec.count >= cfg.ipQuestions) return false;
  rec.count += 1;
  return true;
}

const limitReachedText = (limit: number) =>
  `You've used your ${limit} complimentary AI questions for this session. Share your details to continue, request a quotation, or speak with our team.`;
const LEAD_LIMIT_TEXT =
  "You've reached the hourly limit for AI questions. Please try again a little later, or request a quotation or speak with our team.";

/**
 * Find the lead this enquiry belongs to, if one already exists —
 * by normalized email, or by normalized phone digits, regardless
 * of which flow created it. The assistant must never create a
 * duplicate of a lead another flow already captured.
 *
 * Phone numbers are stored in many formats ("+91-98100-12345",
 * "98100 12345"), so they are compared as digit sequences. The
 * leads table is a CRM-scale table; a digit-normalized scan is
 * cheap enough for a Phase 1 public endpoint.
 */
async function findExistingLead(email: string, phone: string) {
  if (email) {
    const byEmail = await prisma.lead.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    });
    if (byEmail) return byEmail;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 7) {
    // Compare digit sequences the way a person would read them:
    // an exact match, or a 10+ digit match where one number is
    // the other with a country code prefixed. The length guard
    // keeps unrelated numbers that merely share a short suffix
    // from matching.
    const rows = await (prisma as any).$queryRawUnsafe(
      `SELECT id FROM "Lead"
       WHERE (
         regexp_replace("phone", '[^0-9]', '', 'g') = $1
         OR (length($1) >= 10 AND regexp_replace("phone", '[^0-9]', '', 'g') LIKE '%' || $1)
         OR (length(regexp_replace("phone", '[^0-9]', '', 'g')) >= 10
             AND $1 LIKE '%' || regexp_replace("phone", '[^0-9]', '', 'g'))
       )
       ORDER BY "createdAt" DESC LIMIT 1`,
      digits
    );
    if (rows && rows.length) {
      return await prisma.lead.findUnique({ where: { id: rows[0].id } });
    }
  }
  return null;
}

/** Where the visitor stands, without spending anything. Lets the page show the allowance after a refresh. */
router.get('/status', statusRateLimit, async (req, res) => {
  try {
    const sessionId = resolveSession(req, res, req.query.sessionId);
    if (!sessionId) return res.status(400).json({ error: 'Valid sessionId required' });
    res.json({ quota: await readQuota(prisma, sessionId) });
  } catch (error) {
    console.error('AI Status Error:', error);
    res.status(500).json({ error: 'Could not read the allowance' });
  }
});

router.post('/chat', requireAssistantOn, rateLimit, async (req, res) => {
  let lockedSession: string | null = null;
  try {
    const { message } = req.body;
    const sessionId = resolveSession(req, res, req.body.sessionId);
    if (!sessionId) return res.status(400).json({ error: 'Valid sessionId required' });

    if (!message || typeof message !== 'string' || message.length > 1000) {
      return res.status(400).json({ error: 'Message must be between 1 and 1000 characters' });
    }

    // 1. A greeting, a thank-you or "get a quote" needs no model, no allowance and no wait.
    const local = localReply(message);
    if (local) {
      void recordEvent(prisma, sessionId, `local:${local.kind}`);
      return res.json({ text: local.text, local: true, ...(local.action ? { action: local.action } : {}) });
    }

    // 2. One question at a time per session; a second while one is running is refused, not queued. The lock is
    //    taken before the allowance is read, so two quick sends cannot both see the last place free.
    if (inFlight.has(sessionId)) return res.status(409).json({ code: 'busy', error: 'Please wait for the current answer.' });
    inFlight.add(sessionId); lockedSession = sessionId;

    // 3. The allowance, from what is stored. Over it, the model is not called.
    const quota = await readQuota(prisma, sessionId);
    if (quota.remaining <= 0) {
      void recordEvent(prisma, sessionId, 'quota:reached');
      return res.status(429).json({
        code: 'quota_reached',
        text: quota.tier === 'lead' ? LEAD_LIMIT_TEXT : limitReachedText(quota.limit),
        quota,
      });
    }
    if (!ipAllows(req.ip || req.connection.remoteAddress || 'unknown')) {
      return res.status(429).json({ code: 'rate_limited', error: 'Too many questions from this network right now. Please try again later or use Get a quote.' });
    }

    // 4. Only the last exchange is context.
    const cfg = aiConfig();
    let conversation = await prisma.aIConversation.findFirst({ where: { sessionId } });
    if (!conversation) conversation = await prisma.aIConversation.create({ data: { sessionId } });
    const recent = cfg.historyMessages > 0
      ? (await prisma.aIMessage.findMany({
          where: { conversationId: conversation.id, role: { in: ['user', 'assistant'] } },
          orderBy: { createdAt: 'desc' }, take: cfg.historyMessages,
        })).reverse()
      : [];

    // 5. Ask the model (tools run server-side inside the service), under a deadline.
    const pricingVisible = (req.app.get('aiPricingVisible') || (() => true))() as boolean;
    let result;
    try {
      result = await generateAssistantResponse(recent.map(m => ({ role: m.role, content: m.content })), message, { prisma, pricingVisible });
    } catch (err) {
      // No answer, no question used: nothing is saved for a timeout or a provider failure.
      if (err instanceof AssistantError && err.kind === 'timeout') {
        void recordEvent(prisma, sessionId, 'model:timeout');
        return res.status(504).json({ code: 'timeout', error: 'That response is taking longer than expected.', quota });
      }
      // Every provider that could be asked failed (provider health and the reason are already recorded by the service). Public wording only.
      void recordEvent(prisma, sessionId, 'model:error');
      return res.status(503).json({ code: 'unavailable', error: 'AI Assistant is temporarily unavailable.', quota });
    }

    // A provider failed before another answered: internal bookkeeping only, never shown to the visitor and never a second question spent.
    if (result.attempts.some(a => a.outcome === 'failed')) void recordEvent(prisma, sessionId, 'model:fallback');

    // 6. Answered: save the sanitised question and the answer. Saving the question is what spends the allowance.
    // Explicit, distinct times: rows written together would share one timestamp and could be read back in either order.
    const askedAt = new Date();
    await prisma.aIMessage.createMany({
      data: [
        { conversationId: conversation.id, role: 'user', content: result.sanitizedInput, createdAt: askedAt },
        { conversationId: conversation.id, role: 'assistant', content: result.text, createdAt: new Date(askedAt.getTime() + 1) },
      ],
    });
    await prisma.aIConversation.update({ where: { id: conversation.id }, data: { lastActivityAt: new Date() } });

    const used = quota.used + 1;
    res.json({ text: result.text, quota: { ...quota, used, remaining: Math.max(0, quota.limit - used) } });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(503).json({ code: 'unavailable', error: 'AI Assistant is temporarily unavailable.' });
  } finally {
    if (lockedSession) inFlight.delete(lockedSession);
  }
});

router.post('/lead', rateLimit, async (req, res) => {
  try {
    const { name, email, phone, organization, purpose, message, marketingConsent } = req.body;
    const sessionId = resolveSession(req, res, req.body.sessionId);

    if (!sessionId) {
      return res.status(400).json({ error: 'Valid sessionId required' });
    }
    if (!name || typeof name !== 'string' || name.trim().length > LIMITS.name) {
      return res.status(400).json({ error: 'A valid name is required' });
    }
    if (!purpose || typeof purpose !== 'string' || purpose.trim().length > LIMITS.purpose) {
      return res.status(400).json({ error: 'A valid enquiry purpose is required' });
    }

    // Email OR phone — never both required. Each is validated
    // only when the visitor provides it.
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    if (!trimmedEmail && !trimmedPhone) {
      return res.status(400).json({ error: 'An email address or a phone number is required' });
    }
    if (trimmedEmail && (trimmedEmail.length > LIMITS.email || !EMAIL_RE.test(trimmedEmail))) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    if (trimmedPhone && (trimmedPhone.length > LIMITS.phone || trimmedPhone.replace(/\D/g, '').length < 7 || trimmedPhone.replace(/\D/g, '').length > 15)) {
      return res.status(400).json({ error: 'Please provide a valid phone number' });
    }
    if (organization !== undefined && organization !== null && (typeof organization !== 'string' || organization.length > LIMITS.organization)) {
      return res.status(400).json({ error: 'Organization must be a short string' });
    }
    if (marketingConsent !== undefined && marketingConsent !== null && typeof marketingConsent !== 'boolean') {
      return res.status(400).json({ error: 'marketingConsent must be a boolean' });
    }
    if (message !== undefined && message !== null && (typeof message !== 'string' || message.length > LIMITS.notes)) {
      return res.status(400).json({ error: 'Message must be a short string' });
    }

    const conversation = await prisma.aIConversation.findFirst({
      where: { sessionId }
    });

    // CRM receives only a short, PII-masked, dated summary —
    // never a transcript. (LeadInteraction is not used here:
    // it requires a staff userId, and this is an anonymous
    // public form. Short dated notes are what the other public
    // web forms — Contact Inquiry, Demo Request — record.)
    const maskedPurpose = maskPII(purpose.trim()).slice(0, LIMITS.notes);
    const maskedMessage = typeof message === 'string' ? maskPII(message.trim()).slice(0, LIMITS.notes) : '';
    const summary =
      `AI Assistant enquiry (${new Date().toISOString().slice(0, 10)}): visitor asked about ${maskedPurpose}` +
      `${maskedMessage ? `\nRequirement: ${maskedMessage}` : ''}` +
      `${marketingConsent ? '\nMarketing consent: yes' : '\nMarketing consent: no'}`;

    // Cross-source deduplication: a visitor who already
    // reached us another way is matched, not duplicated.
    const existingLead = await findExistingLead(trimmedEmail, trimmedPhone);

    let leadId;

    if (existingLead) {
      // Preserve the lead exactly as the CRM has it — owner,
      // pipeline status, original source, historical notes.
      // Only append this enquiry, and fill fields the lead
      // does not have yet. Nothing existing is overwritten.
      // (email is non-nullable in the schema, so it is only
      // set when there is a value to fill — never null.)
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          notes: existingLead.notes ? `${existingLead.notes}\n\n${summary}` : summary,
          organization: existingLead.organization || organization?.trim() || null,
          phone: existingLead.phone || trimmedPhone || null,
          ...(trimmedEmail ? { email: existingLead.email || trimmedEmail } : {}),
        }
      });
      leadId = existingLead.id;
    } else {
      // Create new lead — only when no existing match exists.
      const newLead = await prisma.lead.create({
        data: {
          name: name.trim(),
          email: trimmedEmail,
          phone: trimmedPhone,
          organization: organization?.trim() || null,
          source: 'AI Assistant',
          status: 'All',
          notes: summary
        }
      });
      leadId = newLead.id;
    }

    // The conversation carries the lead from here on: it is what moves the visitor to the lead allowance, and
    // the form is not shown again. A visitor who used the quote form before chatting gets a conversation too.
    if (conversation) {
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: {
          status: 'Converted',
          leadId
        }
      });
    } else {
      await prisma.aIConversation.create({ data: { sessionId, status: 'Converted', leadId } });
    }

    res.json({ success: true, quota: await readQuota(prisma, sessionId) });
  } catch (error) {
    console.error('AI Lead Error:', error);
    res.status(500).json({ error: 'Failed to submit lead' });
  }
});

export function setupAIAssistantRoutes(
  app: express.Express,
  options: { isPricingVisible?: () => boolean } = {}
) {
  // The getter is read per request, not once at boot: the admin
  // can hide public pricing while the server keeps running.
  app.set('aiPricingVisible', options.isPricingVisible ?? (() => true));
  // Whether the public assistant is on — and nothing else. No provider, key, quota or billing detail is ever in here.
  // Cached for a short while by the browser too, so the page can ask it once a minute without cost.
  app.get('/api/public/ai-assistant/status', switchRateLimit, async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ enabled: await aiAssistantEnabled(prisma) });
  });
  app.use('/api/ai-assistant', router);
}
