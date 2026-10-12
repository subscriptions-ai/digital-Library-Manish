/**
 * The AI assistant master switch, over HTTP: the real Express server against the throwaway database `stm_ingestion_test`,
 * with the Gemini client pointed at a counting stand-in. Refuses to run against anything else.
 *
 *   npx tsx scripts/test-ai-assistant-switch.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();
const dbName = (await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);

const PORT = 3105, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const FAKE_KEY = `fake-key-${RUN}-DO-NOT-LEAK`;
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Counting Gemini ──
let modelCalls = 0; let modelStatus = 200;
const mock = createServer((req, res) => {
  req.on('data', () => {}); req.on('end', () => {
    modelCalls++;
    if (modelStatus !== 200) { res.writeHead(modelStatus, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: modelStatus, message: 'API key not valid', status: 'UNAUTHENTICATED' } })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Mock answer.' }] }, finishReason: 'STOP' }] }));
  });
});
await new Promise<void>(r => mock.listen(0, '127.0.0.1', r));
const MOCK_URL = `http://127.0.0.1:${(mock.address() as any).port}/v1beta`;

const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-${RUN}@ai-switch.invalid`, password: 'x', role } });
  const sid = `sid-ais-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return { token: jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' }), id: u.id, email: u.email };
};
const admin = await mkUser('SuperAdmin'), manager = await mkUser('Admin'), reader = await mkUser('Subscriber');

await db.appSetting.deleteMany({ where: { key: 'AI_ASSISTANT_ENABLED' } });
const auditBefore = await db.adminAuditLog.count({ where: { action: { in: ['AI_ASSISTANT_ENABLED', 'AI_ASSISTANT_DISABLED'] } } });

let child: any, serverLog = '';
const start = async () => {
  serverLog = '';
  child = spawn('npx', ['tsx', '--import', new URL('./test-ai-assistant-switch.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', GEMINI_API_KEY: FAKE_KEY, MOCK_GEMINI_URL: MOCK_URL, AI_ASSISTANT_TIMEOUT_MS: '4000' },
  });
  child.stdout.on('data', (d: any) => (serverLog += d)); child.stderr.on('data', (d: any) => (serverLog += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(BASE + '/api/admin/ai-assistant/switch'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }
};
const stop = async () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await sleep(800); };
const shutdown = async () => { await stop(); mock.close(); await db.$disconnect(); };

let ip = 0;
const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { 'X-Forwarded-For': `10.9.${Math.floor(++ip / 250)}.${ip % 250}`, ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text, headers: r.headers };
};
const A = (path: string, method?: string, body?: any) => call(path, { method, token: admin.token, body });
const setSwitch = (enabled: any) => A('/api/admin/ai-assistant/switch', 'POST', { enabled });
const status = () => call('/api/public/ai-assistant/status');
let n = 0;
const chat = (message = 'What content do you have on nursing?') => call('/api/ai-assistant/chat', { method: 'POST', body: { sessionId: `sess-${RUN}-${++n}-abcdefgh`, message } });

try {
  await start();

  section('A. Enabled (never switched): the assistant behaves as before');
  const s0 = await status();
  check('status says enabled', s0.status === 200 && s0.data?.enabled === true, s0.data);
  check('status carries nothing but "enabled"', JSON.stringify(Object.keys(s0.data || {})) === '["enabled"]', s0.data);
  check('status is cacheable for about 30 seconds', /max-age=30/.test(s0.headers.get('cache-control') || ''), s0.headers.get('cache-control'));
  const a1 = await chat();
  check('chat answers', a1.status === 200 && a1.data?.text === 'Mock answer.', a1.data);
  check('the model was called once', modelCalls === 1, modelCalls);
  const g0 = await A('/api/admin/ai-assistant/switch');
  check('admin sees Enabled, never changed', g0.status === 200 && g0.data.enabled === true && g0.data.everChanged === false, g0.data);

  section('G. Authorization: only the super admin may read or change the switch');
  for (const [name, token] of [['no token', undefined], ['bad token', 'nope'], ['reader', reader.token], ['Admin role', manager.token]] as const) {
    const g = await call('/api/admin/ai-assistant/switch', { token });
    const p = await call('/api/admin/ai-assistant/switch', { method: 'POST', token, body: { enabled: false } });
    check(`${name}: GET and POST refused (${g.status}/${p.status})`, [401, 403].includes(g.status) && [401, 403].includes(p.status));
  }
  check('nothing changed after those attempts', (await status()).data?.enabled === true && (await db.appSetting.count({ where: { key: 'AI_ASSISTANT_ENABLED' } })) === 0);
  const bad = await setSwitch('false');
  check('a non-boolean is refused (400)', bad.status === 400, bad.data);
  check('missing body is refused (400)', (await A('/api/admin/ai-assistant/switch', 'POST', {})).status === 400);

  section('B. Admin disables');
  const off = await setSwitch(false);
  check('disable accepted', off.status === 200 && off.data.enabled === false && off.data.changed === true, off.data);
  const row = await db.appSetting.findUnique({ where: { key: 'AI_ASSISTANT_ENABLED' } });
  check('persisted in the database', (row?.value as any)?.enabled === false && row?.updatedBy === admin.email, row);
  check('public status now says disabled, at once', (await status()).data?.enabled === false);
  const audit = await db.adminAuditLog.findMany({ where: { action: 'AI_ASSISTANT_DISABLED' }, orderBy: { at: 'desc' }, take: 1 });
  check('audit row: AI_ASSISTANT_DISABLED, who and when', audit[0]?.adminEmail === admin.email && audit[0]?.adminId === admin.id && !!audit[0]?.at);
  check('the audit row carries no secrets', !JSON.stringify(audit[0]).includes(FAKE_KEY) && !/key|secret|token/i.test(JSON.stringify(audit[0]?.meta)));
  const disabledRows = await db.adminAuditLog.count({ where: { action: 'AI_ASSISTANT_DISABLED' } });
  const again = await setSwitch(false);
  check('switching off again changes nothing and writes no second audit row', again.data?.changed === false && (await db.adminAuditLog.count({ where: { action: 'AI_ASSISTANT_DISABLED' } })) === disabledRows);

  section('C/D. Chat while disabled (direct call, and a chat that was already open)');
  const callsBefore = modelCalls;
  const convBefore = await db.aIConversation.count();
  const c1 = await chat();
  check('503 AI_ASSISTANT_DISABLED', c1.status === 503 && c1.data?.code === 'AI_ASSISTANT_DISABLED', c1.data);
  check('exact safe message', c1.data?.message === 'AI Assistant is temporarily unavailable.', c1.data);
  check('the body says nothing else (code and message only)', JSON.stringify(Object.keys(c1.data || {}).sort()) === '["code","message"]', c1.data);
  check('no key, provider or quota detail in the reply', !c1.text.includes(FAKE_KEY) && !/gemini|google|quota|billing|api key/i.test(c1.text), c1.text);
  const c2 = await chat('hello');
  check('even a greeting is refused', c2.status === 503 && c2.data?.code === 'AI_ASSISTANT_DISABLED', c2.data);
  const sid = `sess-${RUN}-open-abcdefgh`;
  const warm = await call('/api/ai-assistant/chat', { method: 'POST', body: { sessionId: sid, message: 'something about pricing' } });
  check('a session that was mid-conversation is refused too', warm.status === 503 && warm.data?.code === 'AI_ASSISTANT_DISABLED');
  check('ZERO model calls while disabled', modelCalls === callsBefore, `${modelCalls - callsBefore} calls`);
  check('no conversation was created while disabled', (await db.aIConversation.count()) === convBefore);
  check('the allowance was not read or spent (no messages saved)', (await db.aIMessage.count({ where: { conversation: { sessionId: sid } } })) === 0);
  const burst = await Promise.all(Array.from({ length: 15 }, () => chat()));
  check('a burst of 15 direct calls is all refused, none reaches the model', burst.every(r => r.status === 503) && modelCalls === callsBefore);

  section('E/F. Get a quote and the rest of the site are not tied to the switch');
  const lead = await call('/api/ai-assistant/lead', { method: 'POST', body: { sessionId: `sess-${RUN}-lead-abcdefgh`, name: 'Asha Rao', email: `asha-${RUN}@college.example`, purpose: 'Request a subscription quote' } });
  check('the quote/lead endpoint still works while AI is off', lead.status === 200 || lead.status === 201, `${lead.status} ${lead.text.slice(0, 120)}`);
  const pub = await call('/api/public/settings');
  check('public settings (pricing flag etc.) still served', pub.status === 200, pub.status);
  const wa = readFileSync(new URL('../src/components/WhatsAppFloatingButton.tsx', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  check('the WhatsApp button does not read the AI switch', !/useAiAssistantEnabled|ai-assistant/i.test(wa));
  check('the WhatsApp button is rendered by App, outside the AI widget', /<WhatsAppFloatingButton \/>/.test(appSrc));

  section('H. Restart: the disabled state persists');
  await stop(); await start();
  check('after a restart, public status is still disabled', (await status()).data?.enabled === false);
  check('after a restart, chat is still refused', (await chat()).data?.code === 'AI_ASSISTANT_DISABLED' && modelCalls === callsBefore);
  const g1 = await A('/api/admin/ai-assistant/switch');
  check('the admin screen reads Disabled, with who and when', g1.data?.enabled === false && g1.data?.changedBy === admin.email && !!g1.data?.changedAt, g1.data);

  section('J. Enable again, no restart');
  const on = await setSwitch(true);
  check('enable accepted', on.status === 200 && on.data.enabled === true && on.data.changed === true);
  check('public status says enabled', (await status()).data?.enabled === true);
  const back = await chat();
  check('chat works again', back.status === 200 && back.data?.text === 'Mock answer.' && modelCalls === callsBefore + 1, back.data);
  check('audit: AI_ASSISTANT_ENABLED recorded', (await db.adminAuditLog.count({ where: { action: 'AI_ASSISTANT_ENABLED' } })) >= 1);
  const hist = (await A('/api/admin/ai-assistant/switch')).data?.history || [];
  check('history lists the changes newest first', hist[0]?.action === 'AI_ASSISTANT_ENABLED' && hist[1]?.action === 'AI_ASSISTANT_DISABLED', hist);
  const g2 = await A('/api/admin/ai-assistant/switch');
  check('the admin response shows provider and counts but no key', g2.data?.provider?.name === 'Gemini' && !g2.text.includes(FAKE_KEY) && !/api[_ ]?key|secret/i.test(g2.text), g2.text.slice(0, 300));

  section('I. Provider key invalid: the switch still works, and nothing flips by itself');
  modelStatus = 401;
  const bad401 = await chat();
  check('the visitor gets the existing safe error', bad401.status === 503 && bad401.data?.code === 'unavailable' && !bad401.text.includes(FAKE_KEY) && !/not valid/i.test(bad401.text), bad401.data);
  for (let i = 0; i < 3; i++) await chat();
  check('repeated provider failures do not change the switch', (await status()).data?.enabled === true && (await A('/api/admin/ai-assistant/switch')).data.enabled === true);
  const offBad = await setSwitch(false);
  check('the admin can still turn it off while the key is bad', offBad.status === 200 && offBad.data.enabled === false);
  const callsNow = modelCalls;
  check('and then nothing reaches the provider', (await chat()).data?.code === 'AI_ASSISTANT_DISABLED' && modelCalls === callsNow);
  const gErr = await A('/api/admin/ai-assistant/switch');
  check('the admin screen reports the provider errors', (gErr.data?.last24h?.errors ?? 0) >= 1, gErr.data?.last24h);
  modelStatus = 200;
  await setSwitch(true);

  section('Cache and fail-closed (unit)');
  const { aiAssistantEnabled, __resetAiSwitchCache, AI_CACHE_TTL_MS } = await import('../src/server/aiAssistantSwitch.js');
  let reads = 0; let row2: any = null; let boom = false;
  const fake: any = { appSetting: { findUnique: async () => { reads++; if (boom) throw new Error('db down'); return row2; } } };
  __resetAiSwitchCache();
  const t = 1_000_000;
  check('no row means enabled', (await aiAssistantEnabled(fake, t)) === true && reads === 1);
  check('a second read inside the TTL does not touch the database', (await aiAssistantEnabled(fake, t + 29_000)) === true && reads === 1);
  row2 = { value: { enabled: false } };                       // another process turned it off
  check('another process\'s change is seen once the TTL passes', (await aiAssistantEnabled(fake, t + AI_CACHE_TTL_MS + 1)) === false && reads === 2);
  check('the TTL is between 30 and 60 seconds', AI_CACHE_TTL_MS >= 30_000 && AI_CACHE_TTL_MS <= 60_000);
  __resetAiSwitchCache(); boom = true;
  check('an unreadable value fails closed (off)', (await aiAssistantEnabled(fake, t + 200_000)) === false);
  check('a failure is not retried on every request', (await aiAssistantEnabled(fake, t + 201_000)) === false && reads === 3);
  __resetAiSwitchCache();

  section('Nothing else was touched');
  check('exactly the expected audit rows were written (2 disable, 2 enable)', (await db.adminAuditLog.count({ where: { action: { in: ['AI_ASSISTANT_ENABLED', 'AI_ASSISTANT_DISABLED'] } } })) - auditBefore === 4,
    (await db.adminAuditLog.count({ where: { action: { in: ['AI_ASSISTANT_ENABLED', 'AI_ASSISTANT_DISABLED'] } } })) - auditBefore);
  check('the server log never printed the key', !serverLog.includes(FAKE_KEY));
} catch (e: any) {
  fail++; console.log('  FAIL  unexpected error —', e?.stack || e);
} finally {
  await db.appSetting.deleteMany({ where: { key: 'AI_ASSISTANT_ENABLED' } });
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
