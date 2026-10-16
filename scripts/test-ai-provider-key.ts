/**
 * Admin-managed AI provider key, over HTTP: the real Express server against the throwaway database `stm_ingestion_test`, with the
 * Gemini client pointed at a stand-in that records which API key and model every call used. Refuses to run against anything else.
 *
 *   npx tsx scripts/test-ai-provider-key.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
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

const PORT = 3106, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const MASTER = randomBytes(32).toString('base64');
const OTHER_MASTER = randomBytes(32).toString('hex');
const K = (name: string) => `${name}-${RUN}-SECRETKEY`;
const ENV_KEY = K('ENVKEY'), GOOD1 = K('GOODONE'), GOOD2 = K('GOODTWO'), GOOD3 = K('GOODTHREE');
const ALL_KEYS = [ENV_KEY, GOOD1, GOOD2, GOOD3, K('BADKEY'), K('ECHOBADKEY'), K('QUOTAKEY'), K('RATEKEY'), K('DENIEDKEY'), K('DOWNKEY'), K('SLOWKEY')];
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Gemini stand-in: records the key and model of every call, and fails according to the key ──
const seen: { key: string; model: string }[] = [];
const mock = createServer((req, res) => {
  req.on('data', () => {}); req.on('end', async () => {
    const key = String(req.headers['x-goog-api-key'] || '');
    const model = /models\/([^:/]+)/.exec(req.url || '')?.[1] || '';
    seen.push({ key, model });
    const fail = (code: number, status: string, message: string, reason?: string) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code, status, message, ...(reason ? { details: [{ reason }] } : {}) } }));
    };
    if (key.includes('SLOWKEY')) await sleep(2500);
    if (key.includes('ECHOBADKEY')) return fail(400, 'INVALID_ARGUMENT', `API key not valid: ${key}. Please pass a valid API key.`, 'API_KEY_INVALID');
    if (key.includes('BADKEY')) return fail(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID');
    if (key.includes('QUOTAKEY')) return fail(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota, please check your plan and billing details.');
    if (key.includes('RATEKEY')) return fail(429, 'RESOURCE_EXHAUSTED', 'Too many requests, slow down.');
    if (key.includes('DENIEDKEY')) return fail(403, 'PERMISSION_DENIED', 'The caller does not have permission.');
    if (key.includes('DOWNKEY')) return fail(503, 'UNAVAILABLE', 'The service is currently unavailable.');
    if (model === 'gemini-2.5-pro') return fail(404, 'NOT_FOUND', 'models/gemini-2.5-pro is not found for API version v1beta.');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] }));
  });
});
await new Promise<void>(r => mock.listen(0, '127.0.0.1', r));
const MOCK_URL = `http://127.0.0.1:${(mock.address() as any).port}/v1beta`;

const mkUser = async (role: string, tag = '') => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}${tag}-${RUN}@ai-key.invalid`, password: 'x', role } });
  const sid = `sid-aik-${RUN}-${role}${tag}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return { token: jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' }), id: u.id, email: u.email };
};
const admin = await mkUser('SuperAdmin'), admin2 = await mkUser('SuperAdmin', '2'), manager = await mkUser('Admin'), reader = await mkUser('Subscriber');

const CONFIG = 'AI_PROVIDER_CONFIG', STATUS = 'AI_PROVIDER_STATUS';
await db.appSetting.deleteMany({ where: { key: { in: [CONFIG, STATUS, 'AI_ASSISTANT_ENABLED'] } } });

let child: any, serverLog = '';
const everything: string[] = [];          // every response body the server sent in this run
const start = async (master: string | null, envKey = ENV_KEY) => {
  serverLog = '';
  const e: any = { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', GEMINI_API_KEY: envKey, MOCK_GEMINI_URL: MOCK_URL,
    AI_ASSISTANT_TIMEOUT_MS: '4000', AI_PROVIDER_TEST_TIMEOUT_MS: '700', AI_PROVIDER_TESTS_PER_MINUTE: '40' };
  delete e.AI_ASSISTANT_MODEL;
  e.AI_SECRET_ENCRYPTION_KEY = master || '';       // blank, not absent: the server loads .env, which has the developer's real master key
  child = spawn('npx', ['tsx', '--import', new URL('./test-ai-assistant-switch.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: e,
  });
  child.stdout.on('data', (d: any) => (serverLog += d)); child.stderr.on('data', (d: any) => (serverLog += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(BASE + '/api/admin/ai-assistant/provider'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(500); }
};
const stop = async () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await sleep(800); };
const restart = async (master: string | null, envKey = ENV_KEY) => { await stop(); await start(master, envKey); };

let ip = 0;
const call = async (path: string, o: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { 'X-Forwarded-For': `10.8.${Math.floor(++ip / 250)}.${ip % 250}`, ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  everything.push(text);
  return { status: r.status, data, text };
};
const A = (path: string, method?: string, body?: any) => call(path, { method, token: admin.token, body });
const P = '/api/admin/ai-assistant/provider';
const getCfg = () => A(P);
const testKey = (apiKey?: string, model = 'gemini-3.5-flash-lite') => A(P + '/test', 'POST', { provider: 'gemini', model, ...(apiKey !== undefined ? { apiKey } : {}) });
const activate = (apiKey?: string, model = 'gemini-3.5-flash-lite') => A(P, 'POST', { provider: 'gemini', model, ...(apiKey !== undefined ? { apiKey } : {}) });
let n = 0;
const chat = (message = 'What content do you have on nursing?') => call('/api/ai-assistant/chat', { method: 'POST', body: { sessionId: `sess-${RUN}-${++n}-abcdefgh`, message } });
const lastKey = () => seen[seen.length - 1]?.key;
const cfgRow = async () => JSON.stringify((await db.appSetting.findUnique({ where: { key: CONFIG } }))?.value ?? null);
const auditRows = (action: string) => db.adminAuditLog.findMany({ where: { action, adminId: admin.id }, orderBy: { at: 'asc' } });
const counts = async () => ({ conv: await db.aIConversation.count(), msg: await db.aIMessage.count(), lead: await db.lead.count() });

try {
  await start(MASTER);

  section('A. Environment key only: it is used, and its source is shown');
  let g = await getCfg();
  check('GET works for the super admin', g.status === 200, g.text.slice(0, 200));
  check('credential: configured, source Server environment', g.data.keyConfigured === true && g.data.credentialSource === 'environment' && g.data.adminKeyConfigured === false, g.data);
  check('provider and model are reported', g.data.provider === 'gemini' && typeof g.data.model === 'string');
  check('this server can store a key', g.data.canStoreKey === true);
  check('the response carries no key material at all', !ALL_KEYS.some(k => g.text.includes(k)) && !/apiKey|encrypted|\biv\b|authTag|"tag"|"ct"/i.test(g.text), g.text);
  const c0 = await chat();
  check('chat answers using the environment key', c0.status === 200 && lastKey() === ENV_KEY, { status: c0.status, key: lastKey() });
  check('nothing was copied into the database', (await db.appSetting.count({ where: { key: CONFIG } })) === 0);

  section('K. Testing a key spends no visitor allowance and writes no conversation');
  const before = await counts();
  const t1 = await testKey(GOOD1);
  check('test with a valid key succeeds', t1.status === 200 && t1.data.ok === true, t1.data);
  check('the test reached the provider with that key and no other', lastKey() === GOOD1);
  const after = await counts();
  check('no conversation, message or lead row was written', JSON.stringify(before) === JSON.stringify(after), { before, after });
  check('testing stored nothing', (await db.appSetting.count({ where: { key: CONFIG } })) === 0);
  check('the current credential is unchanged by a test', (await getCfg()).data.credentialSource === 'environment');
  g = await getCfg();
  check('"Last connection test": success, with a time', g.data.lastTest?.ok === true && !!g.data.lastTest?.at, g.data.lastTest);
  const tested = await auditRows('AI_PROVIDER_CONNECTION_TESTED');
  check('audit AI_PROVIDER_CONNECTION_TESTED (admin, provider, result)', tested.length === 1 && (tested[0].meta as any)?.result === 'SUCCESS' && (tested[0].meta as any)?.provider === 'gemini');
  const tNone = await testKey();
  check('testing with a blank key tests the credential in force (the environment key)', tNone.data?.ok === true && lastKey() === ENV_KEY, tNone.data);

  section('Safe error categories (each from a different provider answer)');
  const cats: [string, string, string][] = [
    ['BADKEY', 'AUTHENTICATION_FAILED', 'rejected this API key'], ['ECHOBADKEY', 'AUTHENTICATION_FAILED', 'rejected'],
    ['QUOTAKEY', 'QUOTA_EXCEEDED', 'quota'], ['RATEKEY', 'RATE_LIMITED', 'limiting'],
    ['DENIEDKEY', 'PERMISSION_DENIED', 'not allowed'], ['DOWNKEY', 'PROVIDER_5XX', 'server error'], ['SLOWKEY', 'TIMEOUT', 'did not answer in time'],
  ];
  for (const [name, cat, words] of cats) {
    const r = await testKey(K(name));
    check(`${name} → ${cat}`, r.data?.ok === false && r.data?.category === cat && new RegExp(words, 'i').test(r.data?.message || ''), r.data);
    check(`  …and the reply carries no key or provider text`, !ALL_KEYS.some(k => r.text.includes(k)) && !/RESOURCE_EXHAUSTED|INVALID_ARGUMENT|v1beta|googleapis/i.test(r.text), r.text);
  }
  const m404 = await testKey(GOOD1, 'gemini-2.5-pro');
  check('a model the provider does not offer → MODEL_NOT_FOUND', m404.data?.category === 'MODEL_NOT_FOUND', m404.data);
  check('a model outside the server allowlist is refused (400)', (await testKey(GOOD1, 'gemini-evil-9')).status === 400);
  check('an unimplemented provider is refused (400)', (await A(P + '/test', 'POST', { provider: 'openai', model: 'gpt-x', apiKey: GOOD1 })).status === 400);
  check('a client-supplied provider URL is ignored (no such field is read)', (await A(P + '/test', 'POST', { provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: GOOD1, baseUrl: 'http://evil.invalid' })).data?.ok === true && !seen.some(s => s.key === '' ));
  check('a key with spaces or quotes is refused (400)', (await testKey('has space in it 12345')).status === 400 && (await testKey('quo"te-1234567')).status === 400);

  section('B. Save & activate a valid key');
  const act1 = await activate(GOOD1);
  check('accepted', act1.status === 200 && act1.data.ok === true && act1.data.changed.key === true, act1.data);
  check('the reply is the safe state, with no key', act1.data.state?.adminKeyConfigured === true && act1.data.state?.credentialSource === 'admin' && !act1.text.includes(GOOD1), act1.text);
  const row1 = await db.appSetting.findUnique({ where: { key: CONFIG } });
  const rowText = JSON.stringify(row1);
  check('the database holds ciphertext: the key appears nowhere in the row', !rowText.includes(GOOD1) && !rowText.includes(Buffer.from(GOOD1).toString('base64')) && !rowText.includes(Buffer.from(GOOD1).toString('hex')), rowText);
  const sealed1 = (row1?.value as any)?.providers?.gemini?.key;
  check('the row has the encrypted shape (v, iv, tag, ct) and no plaintext field', !!sealed1?.ct && !!sealed1?.iv && !!sealed1?.tag && !('apiKey' in (row1?.value as any)) && !('apiKey' in (row1?.value as any).providers.gemini));
  const c1 = await chat();
  check('the NEXT chat request uses the new key, with no restart', c1.status === 200 && lastKey() === GOOD1, { status: c1.status, key: lastKey() });
  const added = await auditRows('AI_PROVIDER_KEY_ADDED');
  check('audit AI_PROVIDER_KEY_ADDED (admin, provider, result)', added.length === 1 && (added[0].meta as any)?.result === 'SUCCESS' && added[0].adminEmail === admin.email, added);

  section('D/E. After a refresh: "Configured" only, nothing to copy out');
  g = await getCfg();
  const keys = Object.keys(g.data).sort();
  check('the config has only the expected fields', JSON.stringify(keys) === JSON.stringify(['adminKeyConfigured', 'adminKeyUnreadable', 'canStoreKey', 'credentialSource', 'keyConfigured', 'lastError', 'lastTest', 'model', 'provider', 'providerLabel', 'providers', 'updatedAt', 'updatedBy']), keys);
  check('key configured, source Admin configuration, with who and when', g.data.keyConfigured && g.data.credentialSource === 'admin' && g.data.updatedBy === admin.email && !!g.data.updatedAt);
  check('no key, fragment, ciphertext, IV or tag in it', !ALL_KEYS.some(k => g.text.includes(k)) && !g.text.includes(String((row1?.value as any).providers.gemini.key.ct)) && !g.text.includes(String((row1?.value as any).providers.gemini.key.iv)) && !g.text.includes(String((row1?.value as any).providers.gemini.key.tag)) && !g.text.includes(GOOD1.slice(-4)) , g.text);
  check('the public status endpoint exposes only "enabled"', JSON.stringify(Object.keys((await call('/api/public/ai-assistant/status')).data || {})) === '["enabled"]');

  section('C. An invalid key never replaces a working one');
  const rowBefore = await cfgRow();
  const bad = await activate(K('BADKEY'));
  check('refused with 422 and a readable reason', bad.status === 422 && bad.data.category === 'AUTHENTICATION_FAILED' && /Nothing was changed/.test(bad.data.error), bad.data);
  check('the stored config is byte-for-byte unchanged', (await cfgRow()) === rowBefore);
  const c2 = await chat();
  check('the working key is still the one in use', c2.status === 200 && lastKey() === GOOD1, lastKey());
  const echo = await activate(K('ECHOBADKEY'));
  check('a provider answer that echoes the key does not leak it', echo.status === 422 && !ALL_KEYS.some(k => echo.text.includes(k)), echo.text);

  section('Blank key means "leave it as it is"; model changes are audited');
  const keepCalls = seen.length;
  const sameAgain = await activate('', 'gemini-3.5-flash-lite');
  check('blank key + same model changes nothing', sameAgain.data?.ok === true && sameAgain.data.changed.key === false && sameAgain.data.changed.model === false);
  check('the stored key survived a blank submission', (await cfgRow()) === rowBefore);
  const modelChange = await activate(undefined, 'gemini-2.5-flash');
  check('model-only change is accepted, using the stored key to test', modelChange.data?.ok === true && modelChange.data.changed.model === true && modelChange.data.changed.key === false, modelChange.data);
  check('…and the test used the stored Admin key', seen.slice(keepCalls).some(s => s.key === GOOD1 && s.model === 'gemini-2.5-flash'));
  await chat();
  check('the next chat request uses the new model', seen[seen.length - 1].model === 'gemini-2.5-flash' && lastKey() === GOOD1, seen[seen.length - 1]);
  const modelAudit = await auditRows('AI_PROVIDER_MODEL_CHANGED');
  check('audit AI_PROVIDER_MODEL_CHANGED (from, to)', modelAudit.length === 1 && (modelAudit[0].meta as any)?.to === 'gemini-2.5-flash' && (modelAudit[0].meta as any)?.from === 'gemini-3.5-flash-lite', modelAudit[0]?.meta);
  const modelNotFound = await activate(undefined, 'gemini-2.5-pro');
  check('a model the provider rejects is not activated', modelNotFound.status === 422 && (await getCfg()).data.model === 'gemini-2.5-flash');

  section('G. Replace: the old key goes inactive, the replacement is audited');
  const rep = await activate(GOOD2, 'gemini-2.5-flash');
  check('replace accepted', rep.data?.ok === true && rep.data.changed.key === true, rep.data);
  const rowAfter = await db.appSetting.findUnique({ where: { key: CONFIG } });
  check('new ciphertext (a fresh IV) replaced the old', (rowAfter?.value as any).providers.gemini.key.iv !== (row1?.value as any).providers.gemini.key.iv && (rowAfter?.value as any).providers.gemini.key.ct !== (row1?.value as any).providers.gemini.key.ct);
  const seenBefore = seen.length;
  await chat(); await chat();
  check('requests now use the new key, never the old one', seen.slice(seenBefore).every(s => s.key === GOOD2), seen.slice(seenBefore));
  const replaced = await auditRows('AI_PROVIDER_KEY_REPLACED');
  check('audit AI_PROVIDER_KEY_REPLACED', replaced.length === 1 && (replaced[0].meta as any)?.result === 'SUCCESS');
  check('no audit row, anywhere, carries a key, ciphertext or header', !(await db.adminAuditLog.findMany({ where: { action: { startsWith: 'AI_PROVIDER' } } })).some(r => { const t = JSON.stringify(r); return ALL_KEYS.some(k => t.includes(k)) || /apiKey|authorization|bearer|"ct"|"iv"|"tag"/i.test(t); }));

  section('F. Only the super admin: direct API calls are refused');
  const snapshot = await cfgRow(); const auditCount = await db.adminAuditLog.count({ where: { action: { startsWith: 'AI_PROVIDER' } } }); const callsBefore = seen.length;
  const body = { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: GOOD3 };
  for (const [name, token] of [['no token', undefined], ['bad token', 'nope'], ['reader', reader.token], ['Admin role', manager.token]] as const) {
    const rs = [
      await call(P, { token }), await call(P + '/test', { method: 'POST', token, body }),
      await call(P, { method: 'POST', token, body }), await call(P + '/remove-key', { method: 'POST', token, body: {} }),
    ];
    check(`${name}: GET, test, activate and remove all refused (${rs.map(r => r.status).join('/')})`, rs.every(r => [401, 403].includes(r.status)), rs.map(r => r.text));
  }
  check('nothing changed: config, audit rows, provider calls', (await cfgRow()) === snapshot && (await db.adminAuditLog.count({ where: { action: { startsWith: 'AI_PROVIDER' } } })) === auditCount && seen.length === callsBefore);

  section('H. Restart: the encrypted key survives');
  await restart(MASTER);
  g = await getCfg();
  check('still configured, source Admin configuration', g.data.keyConfigured && g.data.credentialSource === 'admin' && g.data.adminKeyUnreadable === false, g.data);
  await chat();
  check('the first chat after the restart uses the stored key', lastKey() === GOOD2, lastKey());

  section('The server\'s encryption key changed or is missing');
  await restart(OTHER_MASTER);
  g = await getCfg();
  check('the stored key cannot be opened: flagged, and the environment key takes over', g.data.adminKeyUnreadable === true && g.data.credentialSource === 'environment', g.data);
  await chat();
  check('chat keeps working on the environment key', lastKey() === ENV_KEY, lastKey());
  check('a wrong master key leaks nothing in the log', !serverLog.includes(GOOD2));
  await restart(null);
  g = await getCfg();
  check('no master key: the screen says a key cannot be stored', g.data.canStoreKey === false && g.data.credentialSource === 'environment', g.data);
  const callsNoMaster = seen.length;
  const noEnc = await activate(GOOD3);
  check('saving a new key is refused (503) before anything is sent to the provider', noEnc.status === 503 && noEnc.data.code === 'ENCRYPTION_UNAVAILABLE' && seen.length === callsNoMaster, noEnc.data);
  check('the stored config is untouched by the refused save', (await cfgRow()).includes('"key"') && (await db.appSetting.findUnique({ where: { key: CONFIG } }))?.updatedBy === admin.email);
  await restart(MASTER);
  check('with the right master key again the stored key works', (await getCfg()).data.credentialSource === 'admin');

  section('J. Changing the key never switches the assistant on');
  const off = await A('/api/admin/ai-assistant/switch', 'POST', { enabled: false });
  check('assistant disabled', off.data?.enabled === false);
  const act3 = await activate(GOOD3, 'gemini-2.5-flash');
  check('key replaced while disabled', act3.data?.ok === true);
  check('the assistant is STILL disabled', (await call('/api/public/ai-assistant/status')).data?.enabled === false && (await A('/api/admin/ai-assistant/switch')).data?.enabled === false);
  const callsOff = seen.length;
  const refused = await chat();
  check('chat is refused and the model is not called', refused.status === 503 && refused.data?.code === 'AI_ASSISTANT_DISABLED' && seen.length === callsOff, refused.data);
  const none = await db.adminAuditLog.count({ where: { action: 'AI_ASSISTANT_ENABLED', adminId: admin.id } });
  check('no "enabled" audit row was written by the key change', none === 0);
  await A('/api/admin/ai-assistant/switch', 'POST', { enabled: true });
  await chat();
  check('re-enabled by the switch, the new key is in use', lastKey() === GOOD3, lastKey());

  section('I. Remove the Admin key: the environment credential takes over');
  const rm = await A(P + '/remove-key', 'POST', {});
  check('removed', rm.status === 200 && rm.data?.ok === true && rm.data.state?.credentialSource === 'environment' && rm.data.state?.adminKeyConfigured === false, rm.data);
  const rowRm = await db.appSetting.findUnique({ where: { key: CONFIG } });
  check('the ciphertext is gone from the database', !(rowRm?.value as any)?.providers?.gemini?.key);
  await chat();
  check('the next chat uses the environment key', lastKey() === ENV_KEY, lastKey());
  const removed = await auditRows('AI_PROVIDER_KEY_REMOVED');
  check('audit AI_PROVIDER_KEY_REMOVED', removed.length === 1);
  check('removing again is a clean 404', (await A(P + '/remove-key', 'POST', {})).status === 404);
  check('nothing was ever written to the environment file', readFileSync(new URL('../.env', import.meta.url), 'utf8') === env);

  section('Provider failures on real traffic show up as a category');
  const real1 = await activate(K('RATEKEY'));
  check('a key that fails its test is never activated', real1.status === 422);
  g = await getCfg();
  check('"Last connection test" shows the failure category', g.data.lastTest?.ok === false && typeof g.data.lastTest?.category === 'string' && typeof g.data.lastTest?.message === 'string', g.data.lastTest);
  await restart(MASTER, K('BADKEY'));                     // the environment key is now one the provider rejects
  const failing = await chat();
  check('a visitor sees only the generic unavailable reply', failing.status === 503 && failing.data?.code === 'unavailable' && !ALL_KEYS.some(k => failing.text.includes(k)), failing.data);
  await sleep(400);
  g = await getCfg();
  check('"Last provider error" shows the category and a time, nothing else', g.data.lastError?.category === 'AUTHENTICATION_FAILED' && !!g.data.lastError?.at && !!g.data.lastError?.message, g.data.lastError);

  section('Limits');
  const limited = await call(P + '/test', { method: 'POST', token: admin2.token, body: {} });
  let got429 = false;
  for (let i = 0; i < 45 && !got429; i++) got429 = (await call(P + '/test', { method: 'POST', token: admin2.token, body: {} })).status === 429;
  check('connection tests are rate-limited per admin (429)', got429 && limited.status === 400);

  section('L. Nothing leaked');
  check('no response body, in the whole run, contained any key', !everything.some(t => ALL_KEYS.some(k => t.includes(k))));
  check('the server log never printed a key', !ALL_KEYS.some(k => serverLog.includes(k)), serverLog.split('\n').filter(l => ALL_KEYS.some(k => l.includes(k))).slice(0, 3));
  check('the server log has no ciphertext or authorization header either', !/authorization|bearer\s+[a-z0-9]/i.test(serverLog.replace(/AI provider/g, '')));
  const appRows = JSON.stringify(await db.appSetting.findMany({ where: { key: { in: [CONFIG, STATUS] } } }));
  check('neither AppSetting row holds a plaintext key', !ALL_KEYS.some(k => appRows.includes(k)));
} catch (e: any) {
  fail++; console.log('  FAIL  unexpected error —', e?.stack || e);
} finally {
  await db.appSetting.deleteMany({ where: { key: { in: [CONFIG, STATUS, 'AI_ASSISTANT_ENABLED'] } } });
  await stop(); mock.close(); await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
