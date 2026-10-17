/**
 * AI visitors and question counting over HTTP: the real assistant routes, against the throwaway database `stm_ingestion_test`
 * (refuses anything else), with every provider call stubbed at fetch — no request leaves this machine, no key is used.
 *
 *   npx tsx scripts/test-ai-visitors.ts
 *
 * Covers: the visitor endpoint exists (no 404) and validates; name + mobile / name + email unlock; invalid contact stays locked;
 * questionsAsked / successfulAnswers / failedAnswers from real requests (3 questions; 2 answers + 1 failure; Gemini fails → Grok
 * answers = one question, one answer); local replies; a refresh and a second session reuse the visitor; Get a quote links the
 * visitor to the lead without a second contact; the admin read functions report the same numbers; no contact reaches a provider.
 */
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
// Fake credentials: every provider request below is answered by the stub, so these never leave the process.
process.env.GEMINI_API_KEY = 'test-gemini-key-not-real-000000000000';
process.env.GROK_API_KEY = 'xai-testkeynotreal0000000000000000000000000000000000000000000000000000';
process.env.AI_ASSISTANT_TIMEOUT_MS = '3000';

const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();
const dbName = (await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

// ── Provider stub ─────────────────────────────────────────────────────────
const mode: Record<'gemini' | 'grok', 'ok' | 'fail'> = { gemini: 'ok', grok: 'ok' };
const providerCalls: { provider: string; body: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('generativelanguage.googleapis.com')) {
    providerCalls.push({ provider: 'gemini', body: String(init?.body ?? '') });
    return mode.gemini === 'ok'
      ? json(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'Gemini answer.' }] }, finishReason: 'STOP' }] })
      : json(503, { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } });
  }
  if (url.includes('api.x.ai')) {
    providerCalls.push({ provider: 'grok', body: String(init?.body ?? '') });
    return mode.grok === 'ok'
      ? json(200, { output_text: 'Grok answer.', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Grok answer.' }] }] })
      : json(503, { error: 'unavailable' });
  }
  return realFetch(input, init);
}) as typeof fetch;

// ── Server ────────────────────────────────────────────────────────────────
const express = (await import('express')).default;
const { setupAIAssistantRoutes } = await import('../src/routes/aiAssistant.ts');
const { visitorOverview, listVisitors, visitorDetail, conversationDetail } = await import('../src/server/aiAssistantVisitors.ts');

await db.appSetting.deleteMany({ where: { key: { in: ['AI_PROVIDER_CONFIG', 'AI_PROVIDER_RUNTIME', 'AI_ASSISTANT_ENABLED'] } } });
const app = express();
app.set('trust proxy', true);
app.use(express.json());
setupAIAssistantRoutes(app, { identifyUser: async (req: any) => (String(req.headers.authorization || '').startsWith('Bearer test-') ? String(req.headers.authorization).slice(12) : null) });
const server = app.listen(0);
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai-assistant`;

let failed = 0;
const check = (n: string, ok: unknown, d = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); };
const RUN = Date.now().toString(36);
const STARTED = new Date();
const sessions: string[] = [];
let ipSeq = 1;
function client(sessionId: string, auth?: string) {
  sessions.push(sessionId);
  const ip = `10.66.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
  let cookie = '';
  const call = async (method: string, path: string, body?: any) => {
    const r = await realFetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(cookie ? { cookie } : {}), ...(auth ? { Authorization: auth } : {}) },
      body: body ? JSON.stringify({ sessionId, ...body }) : undefined,
    });
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const text = await r.text();
    let json: any = {}; try { json = JSON.parse(text); } catch {}
    return { status: r.status, text, json };
  };
  return {
    status: () => call('GET', `/status?sessionId=${sessionId}`),
    visitor: (b: any) => call('POST', '/visitor', b),
    chat: (message: string) => call('POST', '/chat', { message }),
    lead: (b: any) => call('POST', '/lead', b),
  };
}
const conv = (sid: string) => db.aIConversation.findFirst({ where: { sessionId: sid }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
const visitorIds: string[] = [];

try {
  // TEST 4 + 3 — the route exists and validates; invalid contact stays locked.
  {
    const c = client(`v-bad-${RUN}`);
    const r = await c.visitor({ name: 'Rajesh', email: 'rajesh', phone: '' });
    check('T4 POST /visitor is routed (not 404)', r.status !== 404, String(r.status));
    check('T3 invalid contact → 400 with a field error', r.status === 400 && r.json.errors?.email, r.text);
    const r2 = await c.visitor({ name: 'Rajesh', phone: '1234567890' });
    check('T3 invalid mobile → 400', r2.status === 400 && r2.json.errors?.phone, r2.text);
    check('T3 chat stays locked', (await c.chat('What subscription plans are available?')).status === 403);
    check('T3 no visitor created', (await db.aIVisitor.count({ where: { name: 'Rajesh', firstSeenAt: { gte: new Date(Date.now() - 60_000) } } })) === 0);
  }

  // TEST 1 — name + mobile (formatted), response shape.
  const sidA = `v-a-${RUN}`;
  const a = client(sidA);
  {
    const r = await a.visitor({ name: 'Asha Rao', phone: '+91 98239 32335' });
    check('T1 name + mobile → 200', r.status === 200 && r.json.success === true, r.text);
    check('T1 response: visitorId, sessionId, normalised contact', !!r.json.visitorId && r.json.sessionId === sidA
      && r.json.contact?.name === 'Asha Rao' && r.json.contact?.mobile === '9823932335' && r.json.contact?.email === null, JSON.stringify(r.json.contact));
    check('T1 response carries no internal fields', !('userId' in r.json.contact) && !/matchedLeadId|leadId|userId/.test(r.text));
    visitorIds.push(r.json.visitorId);
    const v = await db.aIVisitor.findUnique({ where: { id: r.json.visitorId } });
    check('T1 visitor stored, mobile 10 digits, firstSeen/lastActive set', v?.phone === '9823932335' && !!v?.firstSeenAt && !!v?.lastActiveAt);
    check('T1 chat unlocks', (await a.status()).json.visitor?.firstName === 'Asha');
  }

  // TEST 5 + 6 — three questions: two answered, one where every provider fails.
  {
    mode.gemini = 'ok'; mode.grok = 'ok';
    const q1 = await a.chat('Which departments do you cover?');
    const q2 = await a.chat('Do you have engineering journals?');
    mode.gemini = 'fail'; mode.grok = 'fail';
    const q3 = await a.chat('How many books are there?');
    mode.gemini = 'ok'; mode.grok = 'ok';
    check('T6 two answered (200), one failed (503)', q1.status === 200 && q2.status === 200 && q3.status === 503, `${q1.status} ${q2.status} ${q3.status}`);
    const c = await conv(sidA);
    check('T5 questionsAsked = 3', c?.questionsAsked === 3, String(c?.questionsAsked));
    check('T6 successfulAnswers = 2, failedAnswers = 1', c?.successfulAnswers === 2 && c?.failedAnswers === 1, `${c?.successfulAnswers}/${c?.failedAnswers}`);
    check('T6 failed question stored with its outcome', c?.messages.some(m => m.role === 'failed_user' && m.outcome === 'unavailable' && m.content.includes('How many books')));
    check('T6 answers record the provider', c?.messages.filter(m => m.role === 'assistant').every(m => m.provider === 'gemini'));
    check('quota: only the 2 answered questions spent (unchanged rule)', (await a.status()).json.quota?.used === 2, JSON.stringify((await a.status()).json.quota));
  }

  // TEST 7 — Gemini fails, Grok answers: one question, one answer.
  {
    const sid = `v-fb-${RUN}`;
    const c = client(sid);
    await c.visitor({ name: 'Fallback Test', email: `fallback-${RUN}@example.com` });
    const before = providerCalls.length;
    mode.gemini = 'fail'; mode.grok = 'ok';
    const r = await c.chat('Tell me about subscriptions');
    mode.gemini = 'ok';
    const calls = providerCalls.slice(before).map(p => p.provider);
    const row = await conv(sid);
    check('T7 answered by the fallback', r.status === 200 && r.json.text === 'Grok answer.', r.text.slice(0, 120));
    check('T7 both providers were tried', calls.includes('gemini') && calls.includes('grok'), calls.join(','));
    check('T7 counts as 1 question, 1 answer, 0 failed', row?.questionsAsked === 1 && row?.successfulAnswers === 1 && row?.failedAnswers === 0, `${row?.questionsAsked}/${row?.successfulAnswers}/${row?.failedAnswers}`);
    check('T7 answer marked as Grok; one user row', row?.messages.filter(m => m.role === 'assistant').map(m => m.provider).join() === 'grok' && row?.messages.filter(m => m.role === 'user').length === 1);
    check('T7 fallback noted as an operational event, not a question', row?.messages.some(m => m.role === 'event' && m.content === 'model:fallback'));
    visitorIds.push(row!.visitorId!);
  }

  // Local reply: a question answered without a model.
  {
    await a.chat('hello');
    const c = await conv(sidA);
    check('local reply counts as a question and an answer', c?.questionsAsked === 4 && c?.successfulAnswers === 3 && c.messages.some(m => m.role === 'local_assistant' && m.provider === 'local'));
    check('local reply spends no allowance', (await a.status()).json.quota?.used === 2);
  }

  // Not questions: form submits, status reads, quote.
  {
    const before = (await conv(sidA))!.questionsAsked;
    await a.status(); await a.visitor({ name: 'Asha Rao', phone: '9823932335' });
    check('form submit and status reads are not questions', (await conv(sidA))!.questionsAsked === before);
  }

  // TEST 2 + 8 — name + email; refresh and a second session reuse the visitor.
  {
    const sid = `v-b-${RUN}`;
    const b = client(sid);
    const r = await b.visitor({ name: 'Rahul Jain', email: ` Rahul.Jain-${RUN}@Example.COM ` });
    check('T2 name + email → 200, email lower-cased', r.status === 200 && r.json.contact?.email === `rahul.jain-${RUN}@example.com`, r.text);
    visitorIds.push(r.json.visitorId);
    const again = client(sid); // a refresh: same session id, no cookie
    check('T8 refresh: the session is still unlocked', (await again.status()).json.visitor?.firstName === 'Rahul');
    const r2 = await again.visitor({ name: 'Rahul Jain', email: `rahul.jain-${RUN}@example.com` });
    check('T8 re-submitting on the same session: same visitor', r2.json.visitorId === r.json.visitorId);
    const other = client(`v-b2-${RUN}`); // another device, same email
    const r3 = await other.visitor({ name: 'Rahul J.', email: `RAHUL.JAIN-${RUN}@example.com`, phone: '98765 43210' });
    check('T8 another session, same email: same visitor (no duplicate)', r3.json.visitorId === r.json.visitorId);
    const v = await db.aIVisitor.findUnique({ where: { id: r.json.visitorId }, include: { conversations: true } });
    check('T8 visitor now has both conversations and the added mobile', v?.conversations.length === 2 && v?.phone === '9876543210', `${v?.conversations.length} ${v?.phone}`);
    const byPhone = client(`v-b3-${RUN}`);
    const r4 = await byPhone.visitor({ name: 'Rahul', phone: '+91-98765-43210' });
    check('T8 match by mobile when no email', r4.json.visitorId === r.json.visitorId);
  }

  // Logged-in: matched by account.
  {
    const s1 = client(`v-m1-${RUN}`, 'Bearer test-member-1');
    const r1 = await s1.visitor({ name: 'Member One', email: `member1-${RUN}@example.com` });
    const s2 = client(`v-m2-${RUN}`, 'Bearer test-member-1');
    const r2 = await s2.visitor({ name: 'Member One', phone: '9000000001' });
    check('logged-in: same account → same visitor, userId kept', r1.json.visitorId === r2.json.visitorId
      && (await db.aIVisitor.findUnique({ where: { id: r1.json.visitorId } }))?.userId === 'member-1');
    visitorIds.push(r1.json.visitorId);
  }

  // TEST 9 — Get a quote links the visitor; no second contact.
  {
    const visitorsBefore = await db.aIVisitor.count();
    const sid = `v-a-${RUN}`;
    const leadEmail = `asha-${RUN}@example.com`;
    const r = await client(sid).lead({ name: 'Asha Rao', email: leadEmail, phone: '9823932335', purpose: 'Request a subscription quote' });
    const v = await db.aIVisitor.findUnique({ where: { id: visitorIds[0] } });
    const lead = await db.lead.findFirst({ where: { email: leadEmail } });
    check('T9 quote accepted', r.status === 200 && r.json.success === true, r.text);
    check('T9 visitor linked to the lead, quote time set', !!lead && v?.leadId === lead.id && !!v?.quoteRequestedAt);
    check('T9 no new AI visitor', (await db.aIVisitor.count()) === visitorsBefore);
    check('T9 quote is not a question', (await conv(sid))!.questionsAsked === 4);
    check('T9 quote recorded as an event', (await conv(sid))!.messages.some(m => m.role === 'event' && m.content === 'quote:requested'));
    if (lead) await db.lead.delete({ where: { id: lead.id } });
  }
  check('the gate itself created no Lead', (await db.lead.count({ where: { createdAt: { gte: STARTED } } })) === 0);

  // TEST 10 — the admin reads report the same numbers.
  {
    const ov = await visitorOverview(db as any);
    check('T10 overview counts are at least this run’s', ov.questionsAsked >= 5 && ov.successfulAnswers >= 4 && ov.failedAnswers >= 1 && ov.quoteRequests >= 1 && ov.newContacts >= 4, JSON.stringify(ov));
    const list = await listVisitors(db as any, { q: 'Asha', range: 'today' });
    const row = list.rows.find(x => x.id === visitorIds[0]);
    check('T10 visitor listed with questions 4, answers 3, quote requested', row?.questions === 4 && row?.answers === 3 && row?.failed === 1 && row?.quoteStatus === 'Requested', JSON.stringify(row));
    check('T10 search by mobile', (await listVisitors(db as any, { q: '98239 32335' })).rows.some(x => x.id === visitorIds[0]));
    check('T10 filter: quote not requested excludes her', !(await listVisitors(db as any, { quote: 'no' })).rows.some(x => x.id === visitorIds[0]));
    check('T10 filter: logged-in only', (await listVisitors(db as any, { type: 'member' })).rows.every(x => x.userType === 'Logged-in'));
    const d = await visitorDetail(db as any, visitorIds[0]);
    check('T10 visitor detail totals', d?.totals.questions === 4 && d?.totals.answers === 3 && d?.conversations.length === 1 && d?.quoteStatus === 'Requested');
    const cd = await conversationDetail(db as any, d!.conversations[0].id);
    const roles = cd!.messages.map(m => m.role);
    check('T10 conversation detail: questions, answers, failure, local reply, quote event', ['user', 'assistant', 'failed_user', 'local_user', 'local_assistant'].every(r => roles.includes(r)) && cd!.messages.some(m => m.content === 'quote:requested'));
    check('T10 conversation detail has no provider bookkeeping events', !cd!.messages.some(m => m.role === 'event' && m.content.startsWith('local:')));
  }

  // Privacy — no contact detail reached a provider.
  {
    const leaked = providerCalls.filter(p => /9823932335|98239|98765|example\.com|Asha|Rahul/i.test(p.body));
    check('no email, mobile or name sent to Gemini or Grok', providerCalls.length > 0 && leaked.length === 0, `${providerCalls.length} provider calls, ${leaked.length} with contact data`);
  }
} finally {
  const convIds = (await db.aIConversation.findMany({ where: { sessionId: { in: sessions } }, select: { id: true } })).map(c => c.id);
  await db.aIConversation.deleteMany({ where: { id: { in: convIds } } });
  await db.aIVisitor.deleteMany({ where: { OR: [{ id: { in: visitorIds } }, { email: { contains: RUN } }, { userId: 'member-1' }] } });
  await db.appSetting.deleteMany({ where: { key: { in: ['AI_PROVIDER_RUNTIME'] } } });
  server.close();
  await db.$disconnect();
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
