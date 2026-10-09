import express from 'express';
import { PrismaClient } from '@prisma/client';
import { generateAssistantResponse, maskPII } from '../server/aiAssistantService.js';

const router = express.Router();
const prisma = new PrismaClient();

// In-memory rate limiting for Phase 1.
// TODO: SHARED_RATE_LIMITER_IF_HORIZONTAL_SCALING — this map is
// per-process. If the API is ever run behind more than one process,
// move the counter to a shared store (e.g. Redis); until then a
// single-process deployment is correctly limited.
const rateLimits = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;
/** Bound the map: expired entries for one-off visitors do not stay forever. */
const RATE_LIMIT_MAX_ENTRIES = 1000;

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  const record = rateLimits.get(ip);
  if (!record || now > record.resetTime) {
    if (rateLimits.size >= RATE_LIMIT_MAX_ENTRIES) {
      for (const [key, value] of rateLimits) {
        if (now > value.resetTime) rateLimits.delete(key);
      }
    }
    rateLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  record.count += 1;
  next();
}

/** Field limits keep a junk submission from becoming a junk lead. */
const LIMITS = { name: 100, email: 100, phone: 100, organization: 150, purpose: 300, notes: 500 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

router.post('/chat', rateLimit, async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Valid sessionId required' });
    }

    if (!message || typeof message !== 'string' || message.length > 1000) {
      return res.status(400).json({ error: 'Message must be between 1 and 1000 characters' });
    }

    // 1. Get or create conversation
    let conversation = await prisma.aIConversation.findFirst({
      where: { sessionId }
    });

    if (!conversation) {
      conversation = await prisma.aIConversation.create({
        data: { sessionId }
      });
    }

    // 2. Fetch history
    const history = await prisma.aIMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20 // Only send last 20 messages to LLM to prevent size issues
    });

    const formattedHistory = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // 3. Generate response (tools run server-side inside the service)
    const pricingVisible = (req.app.get('aiPricingVisible') || (() => true))() as boolean;
    const { text, sanitizedInput } = await generateAssistantResponse(formattedHistory, message, {
      prisma,
      pricingVisible,
    });

    // 4. Save sanitized user message and assistant response
    await prisma.aIMessage.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: 'user',
          content: sanitizedInput
        },
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: text
        }
      ]
    });

    await prisma.aIConversation.update({
      where: { id: conversation.id },
      data: { lastActivityAt: new Date() }
    });

    res.json({ text });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(503).json({ error: 'AI Assistant is temporarily unavailable.' });
  }
});

router.post('/lead', rateLimit, async (req, res) => {
  try {
    const { sessionId, name, email, phone, organization, purpose, marketingConsent } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
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

    const conversation = await prisma.aIConversation.findFirst({
      where: { sessionId }
    });

    // CRM receives only a short, PII-masked, dated summary —
    // never a transcript. (LeadInteraction is not used here:
    // it requires a staff userId, and this is an anonymous
    // public form. Short dated notes are what the other public
    // web forms — Contact Inquiry, Demo Request — record.)
    const maskedPurpose = maskPII(purpose.trim()).slice(0, LIMITS.notes);
    const summary =
      `AI Assistant enquiry (${new Date().toISOString().slice(0, 10)}): visitor asked about ${maskedPurpose}` +
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

    if (conversation) {
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: {
          status: 'Converted',
          leadId
        }
      });
    }

    res.json({ success: true });
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
  app.use('/api/ai-assistant', router);
}
