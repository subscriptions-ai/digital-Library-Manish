/**
 * Public AI assistant: allowance, local replies, deadline, concurrency, lead hand-off.
 *
 * Runs the real router on a throwaway Express app against the throwaway `stm_ingestion_test` database, with a
 * scripted stand-in for Gemini, so every result is about our code and nothing reaches the real model.
 *
 *   npx tsx scripts/test-ai-assistant-quota.ts
 */
import './support/noRealAi';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const real = /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.GEMINI_API_KEY = 'mock-test-key';
process.env.AI_ASSISTANT_TIMEOUT_MS = '1500';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};
const section = (t: string) => console.log(`\n${t}`);

// ── Scripted Gemini ──────────────────────────────────────────────────────
const geminiCalls: any[] = [];
let behaviour: { delay?: number; status?: number; text?: string } = {};
const mock: Server = createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    geminiCalls.push(JSON.parse(body));
    const b = behaviour;
    setTimeout(() => {
      if (res.destroyed) return;
      if (b.status) { res.writeHead(b.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: b.status, message: 'boom', status: 'INTERNAL' } })); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: b.text ?? 'Mock answer.' }] }, finishReason: 'STOP' }] }));
    }, b.delay ?? 0);
  });
});
await new Promise<void>(r => mock.listen(0, '127.0.0.1', r));
const { setDefaultBaseUrls } = await import('@google/genai');
setDefaultBaseUrls({ geminiUrl: `http://127.0.0.1:${(mock.address() as any).port}/v1beta` });

const express = (await import('express')).default;
const { setupAIAssistantRoutes } = await import('../src/routes/aiAssistant.js');
const { localReply } = await import('../src/server/aiAssistantLocal.js');
const { usageSummary } = await import('../src/server/aiAssistantQuota.js');
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();
const dbName = (await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const app = express();
app.set('trust proxy', true);            // lets each test pretend to be its own address, so the per-address limiter stays out of the way
app.use(express.json());
setupAIAssistantRoutes(app);
const server: Server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base = `http://127.0.0.1:${(server.address() as any).port}/api/ai-assistant`;

// A tiny browser: keeps cookies. Each request comes from its own address unless one is fixed, so the existing
// per-address request limiter (10 a minute) does not get in the way of the allowance being tested.
let addr = 0;
const visitor = (sessionId: string, fixedIp?: string) => {
  let cookie = '';
  let localId = sessionId;                                   // what the page keeps in localStorage
  const call = async (path: string, init: any = {}) => {
    const res = await fetch(base + path, { ...init, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fixedIp ?? `10.${Math.floor(++addr / 60000)}.${Math.floor(addr / 250) % 250}.${addr % 250}`, ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => ({})), setCookie: set };
  };
  return {
    ask: (message: string) => call('/chat', { method: 'POST', body: JSON.stringify({ sessionId: localId, message }) }),
    status: () => call(`/status?sessionId=${localId}`),
    lead: (extra: any = {}) => call('/lead', { method: 'POST', body: JSON.stringify({ sessionId: localId, name: 'Asha Rao', email: 'asha@college.example', purpose: 'Request a subscription quote', ...extra }) }),
    clearLocalStorage: () => { localId = `fresh-${Math.random().toString(36).slice(2)}-xxxxxxxx`; },
    clearCookies: () => { cookie = ''; },
    get cookie() { return cookie; },
  };
};
const reset = async () => { await db.aIMessage.deleteMany({}); await db.aIConversation.deleteMany({}); await db.lead.deleteMany({ where: { source: 'AI Assistant' } }); geminiCalls.length = 0; behaviour = {}; };

// ── local replies (pure) ────────────────────────────────────────────────
section('Local replies');
check('greetings, any case and punctuation', ['hi', 'Hii!', 'HELLO', 'hey...', 'Good Morning', 'good evening!!', 'hello there'].every(m => localReply(m)?.kind === 'greeting'));
check('thanks and acknowledgements', ['thanks', 'Thank you!', 'thank you so much', 'ok thanks', 'okay'].every(m => localReply(m) !== null && localReply(m)!.kind === 'thanks'));
check('get a quote / quotation / request demo → quote action', ['get a quote', 'Quotation', 'request demo', 'Request a demo.', 'book a demo'].every(m => localReply(m)?.action === 'quote'));
check('a real question is never taken locally', ['hi, how much is the solo plan?', 'get a quote for 5 departments with 200 users', 'hello what journals do you have', 'thanks, but how do I log in?', 'what is a quotation'].every(m => localReply(m) === null));

// ── A. greeting ─────────────────────────────────────────────────────────
await reset();
section('A. greeting is free and instant');
{
  const v = visitor('session-aaaa-0001');
  const t = Date.now();
  const r = await v.ask('hi');
  check('local reply, 0 model calls', r.status === 200 && r.body.local === true && /Hello! I can help you explore STM Digital Library/.test(r.body.text) && geminiCalls.length === 0, r);
  check('instant (well under a model round trip)', Date.now() - t < 500, String(Date.now() - t));
  const s = await v.status();
  check('allowance untouched: 4 of 4', s.body.quota.remaining === 4 && s.body.quota.limit === 4 && s.body.quota.tier === 'anonymous', s.body);
}

// ── B, C, D. four questions, then the form ─────────────────────────────
await reset();
section('B–D. four answered questions, then no fifth model call');
{
  const v = visitor('session-bbbb-0002');
  const r1 = await v.ask('What journals do you have?');
  check('B. substantive question answered by the model; allowance 4 → 3', r1.status === 200 && r1.body.text === 'Mock answer.' && r1.body.quota.remaining === 3 && geminiCalls.length === 1, r1);
  const sent = JSON.stringify(geminiCalls[0].contents);
  check('the model got this question alone (no history yet)', geminiCalls[0].contents.length === 1 && sent.includes('What journals'));
  for (const q of ['Tell me about pricing', 'And solo plans?', 'Do you have e-books?']) await v.ask(q);
  const s = await v.status();
  check('C. four answered: allowance 0', s.body.quota.used === 4 && s.body.quota.remaining === 0 && geminiCalls.length === 4, s.body);
  const calls = geminiCalls.length;
  const r5 = await v.ask('One more question please');
  check('D. fifth question: 429 quota_reached, NO model call', r5.status === 429 && r5.body.code === 'quota_reached' && geminiCalls.length === calls && /4 complimentary AI questions/.test(r5.body.text) && r5.body.quota.tier === 'anonymous', r5);
  check('nothing was saved for the refused question', (await db.aIMessage.count({ where: { role: 'user' } })) === 4);

  // M. greeting and quote still work; the fifth substantive question is still blocked.
  const g = await v.ask('hello');
  const q = await v.ask('get a quote');
  const again = await v.ask('Another real question');
  check('M. greeting and "get a quote" still answer locally when exhausted', g.status === 200 && g.body.local && q.status === 200 && q.body.action === 'quote' && geminiCalls.length === calls);
  check('M. a substantive question stays blocked', again.status === 429 && geminiCalls.length === calls);

  // The window rolls: the first question frees its place an hour after it was asked, not at a clock boundary.
  const first = await db.aIMessage.findFirst({ where: { role: 'user' }, orderBy: { createdAt: 'asc' } });
  await db.aIMessage.update({ where: { id: first!.id }, data: { createdAt: new Date(Date.now() - 61 * 60_000) } });
  const rolled = await v.status();
  check('rolling window: a question older than 60 minutes no longer counts', rolled.body.quota.remaining === 1 && rolled.body.quota.nextAvailableAt === null, rolled.body);
  await db.aIMessage.update({ where: { id: first!.id }, data: { createdAt: new Date(Date.now() - 8 * 60_000) } });
  const eight = await v.status();
  check('question #4 used within the hour: next one is refused at once, with the time a place frees', eight.body.quota.remaining === 0 && !!eight.body.quota.nextAvailableAt, eight.body);
}

// ── E, F. timeout and provider failure do not cost a question ──────────
await reset();
section('E–F. timeouts and provider errors cost nothing');
{
  const v = visitor('session-eeee-0003');
  behaviour = { delay: 4000 };
  const t = Date.now();
  const e = await v.ask('Slow question');
  check('E. timeout: 504 within the deadline, safe message', e.status === 504 && e.body.code === 'timeout' && /longer than expected/.test(e.body.error) && Date.now() - t < 3500, [e.status, e.body, Date.now() - t]);
  check('E. allowance not consumed, nothing saved', (await v.status()).body.quota.remaining === 4 && (await db.aIMessage.count({ where: { role: 'user' } })) === 0);
  behaviour = { status: 500 };
  const f = await v.ask('Broken question');
  check('F. provider 5xx: 503, allowance not consumed', f.status === 503 && f.body.code === 'unavailable' && (await v.status()).body.quota.remaining === 4, f);
  behaviour = {};
  const ok = await v.ask('Working question');
  check('the session is not stuck after a failure (lock released); retry succeeds and counts once', ok.status === 200 && ok.body.quota.remaining === 3);
  const u = await usageSummary(db as any, 1);
  check('timeouts and errors are visible in usage', u.modelTimeouts === 1 && u.modelErrors === 1 && u.modelAnsweredQuestions === 1, u);
}

// ── G, H. quote flow and leads ─────────────────────────────────────────
await reset();
section('G–H. Get a quote and lead hand-off');
{
  const v = visitor('session-gggg-0004');
  for (const q of ['q one', 'q two', 'q three', 'q four']) await v.ask(q);
  const blocked = await v.ask('q five');
  const calls = geminiCalls.length;
  const lead = await v.lead();
  check('G. lead form works with the allowance spent, no model call', blocked.status === 429 && lead.status === 200 && lead.body.success === true && geminiCalls.length === calls, lead);
  check('H. one Lead created, conversation linked, quota moves to the lead allowance', (await db.lead.count({ where: { email: 'asha@college.example' } })) === 1 && lead.body.quota.tier === 'lead' && lead.body.quota.limit === 12 && lead.body.quota.remaining === 8, lead.body);
  const withMsg = await db.lead.findFirst({ where: { email: 'asha@college.example' } });
  check('lead without a message gets no Requirement line', !!withMsg && !/Requirement:/.test(withMsg.notes ?? ''));
  const conv = await db.aIConversation.findFirst({ where: { sessionId: 'session-gggg-0004' } });
  check('conversation is Converted with the leadId', conv?.status === 'Converted' && !!conv?.leadId);
  const more = await v.ask('Now another question');
  check('after details: asking continues', more.status === 200 && more.body.quota.remaining === 7, more);
  const w = visitor('session-hhhh-0005');
  const m1 = visitor('session-mmmm-0099');
  const withMessage = await m1.lead({ email: 'msg@college.example', message: 'Need a quote for 3 departments, call +91 98765 43210' });
  const msgLead = await db.lead.findFirst({ where: { email: 'msg@college.example' } });
  check('optional message is saved on the lead, with phone numbers masked', withMessage.status === 200 && /Requirement: Need a quote for 3 departments/.test(msgLead?.notes ?? '') && !/98765/.test(msgLead?.notes ?? ''), msgLead?.notes);
  const longMsg = await visitor('session-mmmm-0098').lead({ email: 'long2@college.example', message: 'x'.repeat(501) });
  check('an over-long message is refused, no lead created', longMsg.status === 400 && (await db.lead.count({ where: { email: 'long2@college.example' } })) === 0);
  const dupe = await w.lead({ name: 'Asha R', email: 'ASHA@college.example' });
  check('H. same person from another session: matched, not duplicated', dupe.status === 200 && (await db.lead.count({ where: { email: { equals: 'asha@college.example', mode: 'insensitive' } } })) === 1);
  const tier = await w.status();
  check('the second session is linked to the same lead', tier.body.quota.tier === 'lead');
  const spent = visitor('session-iiii-0006');
  for (let i = 0; i < 4; i++) await spent.ask(`q ${i}`);
  await spent.lead({ email: 'other@college.example' });
  for (let i = 0; i < 8; i++) await spent.ask(`lead q ${i}`);
  const cap = await spent.ask('one too many');
  check('lead allowance is finite (12): then a polite limit, still no model call', cap.status === 429 && cap.body.quota.tier === 'lead' && /hourly limit/.test(cap.body.text), cap);
}

// ── I, J. refresh and cleared storage ───────────────────────────────────
await reset();
section('I–J. the server decides, not the page');
{
  const v = visitor('session-jjjj-0007');
  for (const q of ['q1', 'q2', 'q3', 'q4']) await v.ask(q);
  check('server set an httpOnly session cookie', /ai_sid=/.test(v.cookie), v.cookie);
  const refreshed = await v.status();
  check('I. refresh: allowance still spent', refreshed.body.quota.remaining === 0);
  v.clearLocalStorage();                                 // the page now claims to be someone new
  const calls = geminiCalls.length;
  const r = await v.ask('Trying again with a new browser id');
  check('J. localStorage cleared: the cookie still identifies the session, model not called', r.status === 429 && r.body.code === 'quota_reached' && geminiCalls.length === calls, r);
  const vv = visitor('session-kkkk-0008');
  for (const q of ['a1', 'a2', 'a3', 'a4']) await vv.ask(q);
  vv.clearCookies();
  const sameId = await vv.ask('cookies refused but same page id');
  check('J. cookies refused: the id the page sends is still enforced', sameId.status === 429, sameId);
  const bad = await visitor('x').ask('hello');
  check('an unusable session id is rejected', bad.status === 400);
}

// ── K. concurrency ─────────────────────────────────────────────────────
await reset();
section('K. one model request at a time per session');
{
  const v = visitor('session-llll-0009');
  behaviour = { delay: 400 };
  const [a, b] = await Promise.all([v.ask('first click'), v.ask('second click')]);
  const codes = [a.status, b.status].sort();
  check('two rapid sends: one answered, one refused as busy', codes[0] === 200 && codes[1] === 409, [a.status, b.status]);
  check('exactly one model request', geminiCalls.length === 1);
  check('and exactly one question counted', (await v.status()).body.quota.used === 1);
}

// ── L. history ─────────────────────────────────────────────────────────
await reset();
section('L. long conversations are not resent');
{
  const lead = visitor('session-mmmm-0010');
  await lead.lead({ email: 'long@college.example' });                       // lead allowance, so the conversation can run long
  for (let i = 0; i < 6; i++) await lead.ask(`question number ${i}`);
  geminiCalls.length = 0;
  await lead.ask('the latest question');
  const sent = geminiCalls[0].contents;
  const text = JSON.stringify(sent);
  check('at most the last exchange plus the new question', sent.length === 3, sent.length);
  check('older turns are not in the request', !text.includes('question number 0') && !text.includes('question number 3') && text.includes('question number 5') && text.includes('the latest question'));
  check('the request is capped and carries no tool-round extras', geminiCalls[0].generationConfig.maxOutputTokens === 320);
}

// ── address ceiling & events ───────────────────────────────────────────
await reset();
section('Abuse ceiling by address, and usage events');
{
  process.env.AI_IP_QUESTIONS_PER_HOUR = '3';
  const results = [];
  for (let i = 0; i < 5; i++) results.push((await visitor(`session-nnnn-00${i}x`, '203.0.113.9').ask(`q${i}`)).status);
  check('one address cannot open endless fresh sessions (3 model calls, then 429)', results.filter(s => s === 200).length === 3 && results.filter(s => s === 429).length === 2, results);
  delete process.env.AI_IP_QUESTIONS_PER_HOUR;
  const u = await usageSummary(db as any, 1);
  check('usage summary reads from the same tables', u.modelAnsweredQuestions === 3 && typeof u.localZeroTokenReplies === 'number', u);
}

await reset();
server.close(); mock.close(); await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
