/**
 * Two AI providers, a primary (Gemini) and a fallback (Grok), over HTTP: the real Express server against the throwaway database
 * `stm_ingestion_test`, with scripted stand-ins for both providers. Nothing reaches a real model. Refuses to run against anything else.
 *
 *   npx tsx scripts/test-ai-failover.ts
 *
 * Covers: failover on timeout / 429 / 5xx, no fallback on success, both failing, the circuit breaker and its single probe, connection test
 * vs runtime health, the quota (one question per answer, none per failure), shared grounding (same prompt, masking, history, tools),
 * keys (encrypted, hidden by default, revealed only to a Super Admin and audited, blank never deletes, remove is separate), persistence across
 * restarts, and that no key reaches a response, a log, an audit row or the public.
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
const MASTER = randomBytes(32).toString('base64');
const OTHER_MASTER = randomBytes(32).toString('hex');
process.env.AI_SECRET_ENCRYPTION_KEY = MASTER;           // this process seals the one hand-written legacy row below
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();
const dbName = (await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d;
if (dbName !== 'stm_ingestion_test') throw new Error(`refusing to run against "${dbName}"`);
const { seal } = await import('../src/server/aiSecrets.js');
const { categorizeHttpFailure, categorizeProviderError } = await import('../src/server/ai/errors.js');

const PORT = 3107, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const K = (n: string) => `${n}-${RUN}-SECRETKEY`;
const ENV_GEM = K('ENVGEMINI'), GEM1 = K('GEMONE'), GEM2 = K('GEMTWO'), GROK1 = K('GROKONE'), GROK2 = K('GROKTWO'), ENV_GROK = K('ENVGROK');
const ALL_KEYS = [ENV_GEM, GEM1, GEM2, GROK1, GROK2, ENV_GROK, K('BADGROK'), K('NOMODELGROK')];
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 360) : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Scripted providers ──────────────────────────────────────────────────────
type Mode = 'ok' | 'timeout' | '429' | '500' | '503' | '401' | '403' | '404' | '400' | 'tool';
const gem = { mode: 'ok' as Mode, calls: [] as any[], keys: [] as string[], urls: [] as string[] };
const grk = { mode: 'ok' as Mode, calls: [] as any[], keys: [] as string[] };
const SLOW = 6000;
const geminiMock = createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', async () => {
    const j = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    const key = String(req.headers['x-goog-api-key'] || '');
    const isTest = JSON.stringify(j.contents || '').includes('Reply OK.');
    gem.calls.push({ ...j, __test: isTest }); gem.keys.push(key); gem.urls.push(String(req.url));
    const fail = (code: number, status: string, message: string) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code, status, message } })); };
    const m = gem.mode;
    if (m === 'timeout') await sleep(SLOW);
    if (res.destroyed) return;
    if (m === '429') return fail(429, 'RESOURCE_EXHAUSTED', 'Too many requests, slow down.');
    if (m === '500' || m === '503') return fail(Number(m), 'UNAVAILABLE', 'The service is currently unavailable.');
    if (m === '401') return fail(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.');
    if (m === '403') return fail(403, 'PERMISSION_DENIED', 'The caller does not have permission.');
    if (m === '404') return fail(404, 'NOT_FOUND', 'models/x is not found for API version v1beta.');
    if (m === '400') return fail(400, 'INVALID_ARGUMENT', 'Request contains an invalid argument.');
    const asked = (j.contents || []).some((c: any) => c.parts?.some((p: any) => p.functionResponse));
    if (m === 'tool' && !asked && !isTest) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_catalogue', args: { query: 'nursing' } } }] }, finishReason: 'STOP' }] })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: isTest ? 'OK' : 'ANSWER-ALPHA' }] }, finishReason: 'STOP' }] }));
  });
});
const grokMock = createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', async () => {
    const j = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    const auth = String(req.headers['authorization'] || '');
    const isTest = j.input === 'Reply OK.';
    grk.calls.push({ ...j, __test: isTest, __path: req.url, __auth: auth }); grk.keys.push(auth.replace(/^Bearer /, ''));
    const fail = (code: number, message: string) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: message })); };
    if (auth.includes('BADGROK')) return fail(401, 'Incorrect API key provided');
    if (auth.includes('NOMODELGROK') || j.model === 'grok-nonexistent') return fail(404, 'The model does not exist');
    const m = grk.mode;
    if (m === 'timeout') await sleep(SLOW);
    if (res.destroyed) return;
    if (m === '429') return fail(429, 'Rate limit reached');
    if (m === '500' || m === '503') return fail(Number(m), 'Service unavailable');
    if (m === '401') return fail(401, 'Incorrect API key provided');
    if (m === '403') return fail(403, 'The API key does not have permission to use this model or endpoint');
    if (m === '404') return fail(404, 'The model does not exist');
    if (m === '400') return fail(400, 'Invalid request');
    const sent = Array.isArray(j.input) && j.input.some((i: any) => i.type === 'function_call_output');
    if (m === 'tool' && !sent && !isTest) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ output: [{ type: 'function_call', name: 'search_catalogue', arguments: '{"query":"nursing"}', call_id: 'call_1' }] })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'resp_1', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: isTest ? 'OK' : 'ANSWER-BRAVO' }] }] }));
  });
});
await new Promise<void>(r => geminiMock.listen(0, '127.0.0.1', r)); await new Promise<void>(r => grokMock.listen(0, '127.0.0.1', r));
const GEM_URL = `http://127.0.0.1:${(geminiMock.address() as any).port}/v1beta`, GROK_URL = `http://127.0.0.1:${(grokMock.address() as any).port}/v1`;
const reset = () => { gem.mode = 'ok'; grk.mode = 'ok'; gem.calls.length = 0; grk.calls.length = 0; gem.keys.length = 0; grk.keys.length = 0; gem.urls.length = 0; };
const live = (c: any[]) => c.filter(x => !x.__test);          // calls made for visitors, not connection tests

const mkUser = async (role: string, tag = '') => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}${tag}-${RUN}@ai-fo.invalid`, password: 'x', role } });
  const sid = `sid-fo-${RUN}-${role}${tag}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return { token: jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' }), id: u.id, email: u.email };
};
const admin = await mkUser('SuperAdmin'), manager = await mkUser('Admin'), reader = await mkUser('Subscriber');

const KEYS_ROWS = ['AI_PROVIDER_CONFIG', 'AI_PROVIDER_STATUS', 'AI_PROVIDER_RUNTIME', 'AI_ASSISTANT_ENABLED'];
const wipe = async () => { await db.appSetting.deleteMany({ where: { key: { in: KEYS_ROWS } } }); };
await wipe();

let child: any, serverLog = '';
const everything: string[] = [];
const start = async (master: string | null, envGem: string | null = ENV_GEM, envGrok: string | null = null) => {
  serverLog = '';
  const e: any = { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', MOCK_GEMINI_URL: GEM_URL, AI_GROK_BASE_URL_FOR_TESTS: GROK_URL,
    AI_ASSISTANT_TIMEOUT_MS: '1500', AI_ASSISTANT_FALLBACK_TIMEOUT_MS: '2500', AI_ASSISTANT_TOTAL_TIMEOUT_MS: '4500', AI_PROVIDER_TEST_TIMEOUT_MS: '700',
    AI_PROVIDER_TESTS_PER_MINUTE: '200', AI_KEY_REVEALS_PER_MINUTE: '200', AI_CIRCUIT_COOLDOWN_SECONDS: '2', AI_CIRCUIT_CONFIG_COOLDOWN_SECONDS: '3', AI_CIRCUIT_FAILURES: '3' };
  delete e.AI_SECRET_ENCRYPTION_KEY; delete e.AI_ASSISTANT_MODEL;
  // Blank, not absent: the server loads .env, and a variable that is already set (even to nothing) is not overridden by it.
  e.GEMINI_API_KEY = envGem || ''; e.GROK_API_KEY = envGrok || ''; e.XAI_API_KEY = '';
  e.AI_SECRET_ENCRYPTION_KEY = master || '';       // blank, not absent: the server loads .env, which has the developer's real master key
  child = spawn('npx', ['tsx', '--import', new URL('./test-ai-assistant-switch.preload.mjs', import.meta.url).pathname, 'server.ts'], {
    cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: e,
  });
  child.stdout.on('data', (d: any) => (serverLog += d)); child.stderr.on('data', (d: any) => (serverLog += d));
  const t0 = Date.now();
  for (;;) { try { const r = await fetch(BASE + '/api/admin/ai-assistant/providers'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(500); }
};
const stop = async () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await sleep(800); };
const restart = async (master: string | null, envGem: string | null = ENV_GEM, envGrok: string | null = null) => { await stop(); await start(master, envGem, envGrok); };
/** A restart with the breaker and counters wiped, so each scenario begins from a provider that has never failed. */
const freshRestart = async (master: string | null = MASTER, envGem: string | null = ENV_GEM, envGrok: string | null = null) => { await stop(); await db.appSetting.deleteMany({ where: { key: 'AI_PROVIDER_RUNTIME' } }); await start(master, envGem, envGrok); };

let ip = 0;
const call = async (path: string, o: { method?: string; token?: string; body?: any; cookie?: string } = {}) => {
  const r = await fetch(BASE + path, { method: o.method || 'GET', headers: { 'X-Forwarded-For': `10.9.${Math.floor(++ip / 250)}.${ip % 250}`, ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  everything.push(text);
  return { status: r.status, data, text, headers: r.headers };
};
const A = (path: string, method?: string, body?: any) => call(path, { method, token: admin.token, body });
const P = '/api/admin/ai-assistant/providers';
const state = async () => (await A(P)).data;
const saveG = (apiKey?: string, model = 'gemini-3.5-flash-lite') => A(`${P}/gemini`, 'POST', { model, ...(apiKey !== undefined ? { apiKey } : {}) });
const saveK = (apiKey?: string, model = 'grok-4.20-0309-non-reasoning') => A(`${P}/grok`, 'POST', { model, ...(apiKey !== undefined ? { apiKey } : {}) });
let n = 0;
const chat = (message = 'What content do you have on nursing?', sessionId = `sess-${RUN}-${++n}-abcdefgh`) => call('/api/ai-assistant/chat', { method: 'POST', body: { sessionId, message } }).then(r => ({ ...r, sessionId }));
const used = async (sessionId: string) => (await db.aIMessage.count({ where: { role: 'user', conversation: { sessionId } } }));
const audits = (action: string) => db.adminAuditLog.findMany({ where: { action, adminId: admin.id }, orderBy: { at: 'asc' } });

try {
  // ═══════════════════════════════════════════════════════════════════════
  section('0. Error categories');
  check('HTTP 401 → AUTHENTICATION_FAILED, 403 → PERMISSION_DENIED, 404 → MODEL_NOT_FOUND, 400 → INVALID_REQUEST', categorizeHttpFailure(401) === 'AUTHENTICATION_FAILED' && categorizeHttpFailure(403, 'nope') === 'PERMISSION_DENIED' && categorizeHttpFailure(404) === 'MODEL_NOT_FOUND' && categorizeHttpFailure(400, 'bad') === 'INVALID_REQUEST');
  check('HTTP 429 → RATE_LIMITED, but "credits exhausted" → QUOTA_EXCEEDED; 5xx → PROVIDER_5XX; overloaded → MODEL_UNAVAILABLE', categorizeHttpFailure(429, 'slow down') === 'RATE_LIMITED' && categorizeHttpFailure(429, 'You have run out of credits') === 'QUOTA_EXCEEDED' && categorizeHttpFailure(502) === 'PROVIDER_5XX' && categorizeHttpFailure(503, 'model is overloaded') === 'MODEL_UNAVAILABLE');
  check('for xAI a 403 is a permission (ACL) problem even when the text mentions credits; for others it can be billing', categorizeHttpFailure(403, 'no credits left', { grok: true }) === 'PERMISSION_DENIED' && categorizeHttpFailure(403, 'no credits left') === 'QUOTA_EXCEEDED');
  check('a reset connection → NETWORK_ERROR, an abort → TIMEOUT', categorizeProviderError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })) === 'NETWORK_ERROR' && categorizeProviderError(new Error('x'), true) === 'TIMEOUT');

  await start(MASTER);
  // ═══════════════════════════════════════════════════════════════════════
  section('A. Who may see and change any of it');
  for (const [label, tok] of [['no login', undefined], ['a reader', reader.token], ['an Admin (not Super Admin)', manager.token]] as const) {
    const g = await call(P, { token: tok }), t = await call(`${P}/gemini/test`, { method: 'POST', token: tok, body: { model: 'gemini-3.5-flash-lite' } });
    const rv = await call(`${P}/gemini/reveal-key`, { method: 'POST', token: tok, body: {} });
    const sv = await call(`${P}/grok`, { method: 'POST', token: tok, body: { model: 'grok-4.20-0309-non-reasoning', apiKey: GROK1 } });
    const fo = await call(`${P}/failover`, { method: 'POST', token: tok, body: { fallbackEnabled: false } });
    check(`${label}: read, test, save, reveal and failover are all refused`, [g, t, rv, sv, fo].every(r => r.status === 401 || r.status === 403), [g.status, t.status, rv.status, sv.status, fo.status]);
  }
  check('nothing was stored by those attempts', (await db.appSetting.count({ where: { key: 'AI_PROVIDER_CONFIG' } })) === 0);

  // ═══════════════════════════════════════════════════════════════════════
  section('B. The starting picture: Gemini from the environment, Grok not configured');
  let s = await state();
  check('primary Gemini (environment), fallback Grok (not configured), fallback ON', s.primary.id === 'gemini' && s.primary.credentialSource === 'environment' && s.fallback.id === 'grok' && s.fallback.credentialConfigured === false && s.fallbackEnabled === true, s);
  check('each provider lists its own models; Gemini keeps its current default', s.primary.models.includes('gemini-3.5-flash-lite') && s.fallback.models.length >= 2 && s.fallback.model === s.fallback.models[0], [s.primary.model, s.fallback.models]);
  check('health: Gemini healthy, Grok not configured', s.primary.health.state === 'healthy' && s.fallback.health.state === 'not_configured', [s.primary.health.state, s.fallback.health.state]);
  const g0 = await A(P);
  check('no key in the config response: no apiKey field, no key text', !('apiKey' in s.primary) && !ALL_KEYS.some(k => g0.text.includes(k)) && !/"apiKey"/.test(g0.text));
  check('the response is not cacheable', /no-store/.test(g0.headers.get('cache-control') || ''), g0.headers.get('cache-control'));

  // ═══════════════════════════════════════════════════════════════════════
  section('C. Saving keys: tested first, encrypted, independent, hidden');
  const badG = await saveK(K('BADGROK'));
  check('a rejected Grok key is not saved (and says why, with no key in the reply)', badG.status === 422 && badG.data?.category === 'AUTHENTICATION_FAILED' && !badG.text.includes(K('BADGROK')), badG.data);
  check('…and the row was not created', (await db.appSetting.count({ where: { key: 'AI_PROVIDER_CONFIG' } })) === 0);
  const badModel = await A(`${P}/grok`, 'POST', { model: 'grok-nonexistent', apiKey: GROK1 });
  check('a model not on the allowlist is refused', badModel.status === 400 && badModel.data?.code === 'BAD_MODEL');
  const noKey = await saveK();
  check('saving Grok with no key and none saved asks for one', noKey.status === 400 && noKey.data?.code === 'NO_KEY');

  const okG = await saveK(GROK1);
  check('Grok key saved after a passing test', okG.status === 200 && okG.data.ok === true && okG.data.changed.key === true, okG.data);
  check('Grok saw the typed key in the Authorization header, over the fixed path', grk.keys.includes(GROK1) && grk.calls.length > 0 && grk.calls.every(c => c.__path === '/v1/responses'), grk.calls.map(c => c.__path));
  s = okG.data.state;
  check('Grok is now configured by Admin, shows only its last four, source Admin configuration', s.fallback.credentialConfigured && s.fallback.credentialSource === 'admin' && s.fallback.lastFour === GROK1.slice(-4) && s.fallback.adminKeyConfigured, s.fallback);
  const row = await db.appSetting.findUnique({ where: { key: 'AI_PROVIDER_CONFIG' } });
  const rowText = JSON.stringify(row);
  check('the database holds ciphertext only: no key, no base64 or hex of it', !ALL_KEYS.some(k => rowText.includes(k) || rowText.includes(Buffer.from(k).toString('base64')) || rowText.includes(Buffer.from(k).toString('hex'))), rowText);
  check('the Grok credential has the encrypted shape (iv, tag, ct)', !!(row?.value as any)?.providers?.grok?.key?.ct && !!(row?.value as any).providers.grok.key.iv && !!(row?.value as any).providers.grok.key.tag);
  check('responses so far contain no key', !ALL_KEYS.some(k => everything.join('').includes(k)));

  const okGem = await saveG(GEM1);
  check('Gemini key saved independently', okGem.data?.ok === true && okGem.data.state.primary.credentialSource === 'admin' && okGem.data.state.fallback.lastFour === GROK1.slice(-4), okGem.data);
  const row2 = JSON.stringify((await db.appSetting.findUnique({ where: { key: 'AI_PROVIDER_CONFIG' } }))?.value);
  const grokCtBefore = (JSON.parse(row2) as any).providers.grok.key.ct;
  check('saving Gemini did not touch the Grok ciphertext', (JSON.parse(rowText) as any).value.providers.grok.key.ct === grokCtBefore);
  check('audit: key added for each provider, with provider and actor, never a key', (await audits('AI_PROVIDER_KEY_ADDED')).length === 2 && (await audits('AI_PROVIDER_KEY_ADDED')).every(r => ['gemini', 'grok'].includes((r.meta as any).provider) && !ALL_KEYS.some(k => JSON.stringify(r).includes(k))));

  section('D. A blank key keeps the saved key. Only Remove removes it.');
  const keep1 = await saveG(''), keep2 = await saveG(undefined), keep3 = await saveK('   ');
  check('blank, absent and whitespace-only keys change nothing', keep1.data?.changed?.key === false && keep2.data?.changed?.key === false && (keep3.status === 400 || keep3.data?.changed?.key === false), [keep1.data?.changed, keep2.data?.changed, keep3.data]);
  check('both keys are still configured by Admin', (await state()).primary.adminKeyConfigured && (await state()).fallback.adminKeyConfigured);
  const modelOnly = await saveK(undefined, 'grok-4.3');
  check('a model-only save keeps the key (and tests with the saved one)', modelOnly.data?.ok === true && modelOnly.data.changed.model === true && modelOnly.data.changed.key === false && grk.keys[grk.keys.length - 1] === GROK1, modelOnly.data);
  check('Save does not switch the assistant on or off: the switch row is untouched', (await db.appSetting.count({ where: { key: 'AI_ASSISTANT_ENABLED' } })) === 0);

  section('E. Show / Hide: the saved key is revealed only on request, to a Super Admin, and every reveal is audited');
  const rv = await A(`${P}/gemini/reveal-key`, 'POST', {});
  check('Super Admin can reveal the saved Gemini key — exactly what was saved', rv.status === 200 && rv.data?.apiKey === GEM1, rv.data && { ...rv.data, apiKey: '…' });
  check('the reveal is not cacheable', /no-store/.test(rv.headers.get('cache-control') || '') && /no-cache/.test(rv.headers.get('cache-control') || ''), rv.headers.get('cache-control'));
  const rk = await A(`${P}/grok/reveal-key`, 'POST', {});
  check('and the saved Grok key', rk.data?.apiKey === GROK1);
  const afterReveal = await A(P);
  check('revealing one time does not make the normal config response carry a key', !afterReveal.text.includes(GEM1) && !afterReveal.text.includes(GROK1) && !/apiKey/.test(afterReveal.text));
  const rvGet = await call(`${P}/gemini/reveal-key`, { method: 'GET', token: admin.token });
  check('a key cannot be asked for by URL (GET is not a route)', rvGet.status === 404 || rvGet.status === 405 || !rvGet.text.includes(GEM1), rvGet.status);
  const revAudit = await audits('AI_PROVIDER_KEY_REVEALED');
  check('audit: one "credential revealed" row per reveal, with provider and actor, and no key', revAudit.length === 2 && revAudit.every(r => !ALL_KEYS.some(k => JSON.stringify(r).includes(k))) && (revAudit.map(r => (r.meta as any).provider).sort().join() === 'gemini,grok'), revAudit.map(r => r.meta));
  // A credential that comes from the server environment is the key in use, so a Super Admin can reveal it too — through the same audited action.
  await restart(MASTER, ENV_GEM, ENV_GROK);
  await A(`${P}/grok/remove-key`, 'POST', {});
  const gs = await state();
  check('after removing the Admin override, Grok is shown as coming from the server environment, with its last four', gs.fallback.credentialSource === 'environment' && gs.fallback.adminKeyConfigured === false && gs.fallback.lastFour === ENV_GROK.slice(-4), gs.fallback);
  check('the normal config response does not carry the environment keys', !g0.text.includes(ENV_GEM) && !JSON.stringify(gs).includes(ENV_GROK) && !JSON.stringify(gs).includes(ENV_GEM));
  const envRv = await A(`${P}/grok/reveal-key`, 'POST', {});
  check('a Super Admin can reveal the environment key in use, and is told where it comes from', envRv.status === 200 && envRv.data?.apiKey === ENV_GROK && envRv.data?.source === 'environment' && /no-store/.test(envRv.headers.get('cache-control') || ''), envRv.data && { ...envRv.data, apiKey: '…' });
  for (const [label, tok] of [['a reader', reader.token], ['an Admin (not Super Admin)', manager.token], ['no login', undefined]] as const) {
    const r = await call(`${P}/grok/reveal-key`, { method: 'POST', token: tok, body: {} });
    check(`${label} cannot reveal the environment key either`, (r.status === 401 || r.status === 403) && !r.text.includes(ENV_GROK), r.status);
  }
  const envAudit = (await audits('AI_PROVIDER_KEY_REVEALED')).filter(r => (r.meta as any).source === 'environment');
  check('audit: environment reveals are recorded with provider and source — and no key', envAudit.length === 1 && envAudit.every(r => !ALL_KEYS.some(k => JSON.stringify(r).includes(k))), envAudit.map(r => r.meta));

  section('E2. An Admin key overrides the environment key; removing it brings the environment key back');
  const overG = await saveG(GEM2);
  check('saving a new Gemini key makes Admin configuration the source', overG.data?.ok === true && overG.data.state.primary.credentialSource === 'admin' && overG.data.state.primary.lastFour === GEM2.slice(-4), overG.data?.state?.primary);
  check('the key in use (revealed) is now the Admin key, not the environment key', (await A(`${P}/gemini/reveal-key`, 'POST', {})).data?.apiKey === GEM2 && (await A(`${P}/gemini/reveal-key`, 'POST', {})).data?.source === 'admin');
  const rmOver = await A(`${P}/gemini/remove-key`, 'POST', {});
  check('removing the override falls back to the environment key (which was never touched)', rmOver.data?.state?.primary.credentialSource === 'environment' && (await A(`${P}/gemini/reveal-key`, 'POST', {})).data?.apiKey === ENV_GEM);
  await saveG(GEM1);

  section('F. Remove Key is its own action and removes only that provider’s key');
  await saveK(GROK2);
  const rmG = await A(`${P}/gemini/remove-key`, 'POST', {});
  check('removing the Gemini Admin key succeeds', rmG.status === 200 && rmG.data.state.primary.adminKeyConfigured === false, rmG.data?.error);
  check('Gemini falls back to its environment key; Grok keeps its Admin key', rmG.data.state.primary.credentialSource === 'environment' && rmG.data.state.fallback.credentialSource === 'admin' && rmG.data.state.fallback.adminKeyConfigured);
  const rowRm = JSON.parse(JSON.stringify((await db.appSetting.findUnique({ where: { key: 'AI_PROVIDER_CONFIG' } }))?.value));
  check('Gemini ciphertext is gone from the database; Grok ciphertext remains', !rowRm.providers.gemini?.key && !!rowRm.providers.grok?.key?.ct);
  const rmAgain = await A(`${P}/gemini/remove-key`, 'POST', {});
  check('removing a key that is not there is a clear 404, not a silent success', rmAgain.status === 404);
  check('audit: key removed (provider only)', (await audits('AI_PROVIDER_KEY_REMOVED')).some(r => (r.meta as any).provider === 'gemini') && !ALL_KEYS.some(k => JSON.stringify(rmG.data).includes(k)));
  await saveG(GEM1);

  // ═══════════════════════════════════════════════════════════════════════
  section('G. Connection tests are independent of each other, of the assistant, and of real traffic');
  reset();
  const cBefore = { conv: await db.aIConversation.count(), msg: await db.aIMessage.count(), lead: await db.lead.count() };
  const tg = await A(`${P}/gemini/test`, 'POST', { model: 'gemini-3.5-flash-lite' }), tk = await A(`${P}/grok/test`, 'POST', { model: 'grok-4.3' });
  check('each provider tests on its own, with its own key, and reports success + latency + time', tg.data?.ok === true && tk.data?.ok === true && typeof tg.data.latencyMs === 'number' && !!tk.data.at && gem.keys.includes(GEM1) && grk.keys.includes(GROK2), [tg.data, tk.data]);
  check('testing Gemini did not call Grok and testing Grok did not call Gemini', gem.calls.length === 1 && grk.calls.length === 1);
  const cAfter = { conv: await db.aIConversation.count(), msg: await db.aIMessage.count(), lead: await db.lead.count() };
  check('no conversation, message, lead or visitor allowance was touched', JSON.stringify(cBefore) === JSON.stringify(cAfter));
  const newKeyTest = await A(`${P}/grok/test`, 'POST', { model: 'grok-4.3', apiKey: GROK1 });
  check('a NEW unsaved key can be tested before saving, and is used in memory only', newKeyTest.data?.ok === true && grk.keys[grk.keys.length - 1] === GROK1 && (await A(`${P}/grok/reveal-key`, 'POST', {})).data.apiKey === GROK2);
  const badTest = await A(`${P}/grok/test`, 'POST', { model: 'grok-4.3', apiKey: K('BADGROK') });
  check('a bad key reports a category, never the key', badTest.data?.ok === false && badTest.data.category === 'AUTHENTICATION_FAILED' && !badTest.text.includes(K('BADGROK')), badTest.data);
  // xAI: each failure says what it IS. 401, 403 and 404 are different problems and never share a label.
  const XAI: [Mode, number, string, string][] = [
    ['401', 401, 'AUTHENTICATION_FAILED', 'Invalid or missing xAI API key.'],
    ['403', 403, 'PERMISSION_DENIED', "The API key/team does not have permission. Check the key's ACL in the xAI console."],
    ['404', 404, 'MODEL_NOT_FOUND', 'Selected model or endpoint is unavailable.'],
    ['429', 429, 'RATE_LIMITED', 'xAI rate or billing limit reached.'],
    ['503', 503, 'PROVIDER_5XX', 'xAI provider is temporarily unavailable.'],
    ['500', 500, 'PROVIDER_5XX', 'xAI provider is temporarily unavailable.'],
  ];
  const seenMessages = new Set<string>();
  for (const [mode, http, cat, msg] of XAI) {
    reset(); grk.mode = mode;
    const r = await A(`${P}/grok/test`, 'POST', { model: 'grok-4.3', apiKey: GROK1 });
    seenMessages.add(String(r.data?.message));
    check(`xAI HTTP ${http} → ${cat}: "${msg.slice(0, 48)}…"`, r.data?.ok === false && r.data.category === cat && r.data.message === msg && r.data.httpStatus === http, r.data);
    check(`   the reply names the model and the inference endpoint tested, and carries no key`, r.data?.model === 'grok-4.3' && r.data?.endpoint === 'POST /v1/responses' && !r.text.includes(GROK1) && !/authorization|bearer/i.test(r.text), r.data);
  }
  check('401, 403 and 404 each got a different message (none is just "authentication failed")', ['401', '403', '404'].every(m => seenMessages.has(XAI.find(x => x[0] === m)![3])) && new Set(XAI.filter(x => ['401', '403', '404'].includes(x[0])).map(x => x[3])).size === 3);
  reset(); grk.mode = '403';
  await A(`${P}/grok/test`, 'POST', { model: 'grok-4.3', apiKey: GROK1 });
  const lt = (await state()).fallback.lastTest;
  check('Admin records the HTTP status, the category and the model of the last test', lt?.ok === false && lt.httpStatus === 403 && lt.category === 'PERMISSION_DENIED' && lt.model === 'grok-4.3' && lt.endpoint === 'POST /v1/responses' && /ACL/.test(lt.message), lt);
  const testAudit = (await audits('AI_PROVIDER_CONNECTION_TESTED')).filter(r => (r.meta as any).httpStatus === 403);
  check('the audit row keeps provider, model, category and HTTP status — and no key or header', testAudit.length >= 1 && (testAudit[0].meta as any).result === 'PERMISSION_DENIED' && (testAudit[0].meta as any).provider === 'grok' && !JSON.stringify(testAudit).includes(GROK1) && !/authorization|bearer/i.test(JSON.stringify(testAudit)), testAudit.map(r => r.meta));
  const grokSaved = JSON.stringify((await db.appSetting.findUnique({ where: { key: 'AI_PROVIDER_CONFIG' } }))?.value);
  const saveForbidden = await A(`${P}/grok`, 'POST', { model: 'grok-4.3', apiKey: GROK1 + 'X' });
  check('Save with a key whose test fails is refused with the same wording, and changes nothing', saveForbidden.status === 422 && saveForbidden.data?.category === 'PERMISSION_DENIED' && /ACL/.test(saveForbidden.data.error) && saveForbidden.data.httpStatus === 403 && JSON.stringify((await db.appSetting.findUnique({ where: { key: 'AI_PROVIDER_CONFIG' } }))?.value) === grokSaved);
  reset();
  const okT = await A(`${P}/grok/test`, 'POST', { model: 'grok-4.5', apiKey: GROK1 });
  const lastGrok = grk.calls[grk.calls.length - 1];
  check('a passing test used the exact typed key, the exact selected model, and the inference endpoint', okT.data?.ok === true && okT.data.model === 'grok-4.5' && lastGrok.model === 'grok-4.5' && lastGrok.__path === '/v1/responses' && grk.keys[grk.keys.length - 1] === GROK1, [okT.data, lastGrok.model, lastGrok.__path]);
  check('the server log has no Authorization header or key', !/Bearer\s+\S{6,}/.test(serverLog) && !serverLog.includes(GROK1));
  reset();
  const grokTestBefore = JSON.stringify((await state()).fallback.lastTest);
  gem.mode = '401';
  const gFail = await A(`${P}/gemini/test`, 'POST', { model: 'gemini-3.5-flash-lite' });
  check('a failing Gemini test does not change Grok’s last test', gFail.data?.ok === false && JSON.stringify((await state()).fallback.lastTest) === grokTestBefore && (await state()).primary.lastTest?.ok === false);
  reset();
  gem.mode = '404';
  const noModel = await A(`${P}/gemini/test`, 'POST', { model: 'gemini-2.5-pro' });
  check('a model the key cannot use is reported as exactly that: the key is valid, the model is not available', noModel.data?.ok === false && noModel.data.category === 'MODEL_NOT_FOUND' && /API key is valid, but this model is not available for this credential/i.test(noModel.data.message), noModel.data);
  const stM = await state();
  check('the test remembers WHICH model failed, so the screen warns for that model only', stM.primary.lastTest?.model === 'gemini-2.5-pro' && stM.primary.lastTest.category === 'MODEL_NOT_FOUND');
  check('and the provider is still configured, with its runtime health untouched', stM.primary.credentialConfigured === true && stM.primary.health.state === 'healthy');
  const saveBadModel = await saveG(undefined, 'gemini-2.5-pro');
  check('Save refuses that model and changes nothing', saveBadModel.status === 422 && saveBadModel.data?.category === 'MODEL_NOT_FOUND' && (await state()).primary.model !== 'gemini-2.5-pro');
  reset();

  // ═══════════════════════════════════════════════════════════════════════
  section('H. The request pipeline');
  // Both configured, fallback on, Gemini primary.
  const h1 = await chat();
  check('1. Gemini works → Gemini answers, Grok is not called, one question used', h1.status === 200 && h1.data.text === 'ANSWER-ALPHA' && live(grk.calls).length === 0 && live(gem.calls).length === 1 && (await used(h1.sessionId)) === 1 && h1.data.quota.used === 1, { s: h1.status, t: h1.data?.text });
  check('   the Gemini call used the Admin key', gem.keys[gem.keys.length - 1] === GEM1);
  reset();

  gem.mode = 'timeout';
  const t0 = Date.now(); const h2 = await chat(); const took = Date.now() - t0;
  check('2. Gemini times out → Grok answers, ONE question used, and the visitor is not kept waiting for two long timeouts', h2.status === 200 && h2.data.text === 'ANSWER-BRAVO' && (await used(h2.sessionId)) === 1 && took < 4500, { s: h2.status, took });
  check('   the public answer says nothing about a provider', !/gemini|grok|xai|google|fallback|provider|api key/i.test(h2.text), h2.text);
  reset();

  gem.mode = '429'; const h3 = await chat();
  check('3. Gemini 429 → Grok answers, one question used', h3.data?.text === 'ANSWER-BRAVO' && (await used(h3.sessionId)) === 1 && live(gem.calls).length === 1, h3.data);
  reset();
  gem.mode = '503'; const h4 = await chat();
  check('4. Gemini 5xx → Grok answers, one question used', h4.data?.text === 'ANSWER-BRAVO' && (await used(h4.sessionId)) === 1);
  check('   only ONE Gemini attempt was made first (no long retry loop)', live(gem.calls).length === 1);
  reset();

  gem.mode = '503'; grk.mode = '503'; const h5 = await chat();
  check('5. Both fail → "temporarily unavailable", and no question is spent', h5.status === 503 && /temporarily unavailable/i.test(h5.data?.error || '') && (await used(h5.sessionId)) === 0 && h5.data.quota.used === 0, h5.data);
  check('   public wording only: no provider, key or configuration in it', !/gemini|grok|xai|google|api key|credential|circuit/i.test(h5.text), h5.text);
  reset();
  gem.mode = 'timeout'; grk.mode = 'timeout'; const h5b = await chat();
  check('   both timing out is the "taking longer than expected" answer, not a question spent', h5b.status === 504 && (await used(h5b.sessionId)) === 0, h5b.data);
  reset();

  // Same session, two questions: history and privacy are the same for both providers.
  const sid = `sess-${RUN}-hist-abcdefgh`;
  const q1 = await chat('Tell me about nursing journals', sid);
  gem.mode = '503';
  const q2 = await chat('And my email is jane@example.com and phone 9810012345 — more?', sid);
  const gemSecond = live(gem.calls)[live(gem.calls).length - 1], grkSecond = live(grk.calls)[live(grk.calls).length - 1];
  const gemText = JSON.stringify(gemSecond?.contents), grkText = JSON.stringify(grkSecond?.input);
  check('the same question reached both providers, with PII masked for both', q2.data?.text === 'ANSWER-BRAVO' && !gemText.includes('jane@') && !grkText.includes('jane@') && !gemText.includes('9810012345') && !grkText.includes('9810012345') && gemText.includes('[EMAIL]') && grkText.includes('[EMAIL]'), { g: gemText.slice(0, 200), k: grkText.slice(0, 200) });
  check('both received the previous exchange (same history), not a second conversation', gemText.includes('Tell me about nursing journals') && grkText.includes('Tell me about nursing journals') && grkText.includes('ANSWER-ALPHA'));
  check('both received the SAME system prompt', gemSecond.systemInstruction?.parts?.[0]?.text === grkSecond.instructions && /STM Digital Library AI Assistant/.test(grkSecond.instructions), grkSecond.instructions?.slice(0, 60));
  check('both were offered the same four grounding tools', JSON.stringify((gemSecond.tools?.[0]?.functionDeclarations || []).map((t: any) => t.name)) === JSON.stringify((grkSecond.tools || []).map((t: any) => t.name)) && grkSecond.tools.length === 4, (grkSecond.tools || []).map((t: any) => t.name));
  check('Gemini receives the tools in its own schema form (upper-case types)', gemSecond.tools[0].functionDeclarations[1].parameters.type === 'OBJECT' && gemSecond.tools[0].functionDeclarations[1].parameters.properties.query.minLength === '2');
  check('the conversation is one conversation, with one question per answer', (await db.aIConversation.count({ where: { sessionId: sid } })) === 1 && (await used(sid)) === 2);
  reset();

  // Grounding through the fallback: Grok asks for a catalogue lookup; the SERVER runs it and returns the result.
  gem.mode = '503'; grk.mode = 'tool';
  const gr = await chat('Do you have books about nursing?');
  const grkCalls = live(grk.calls);
  const output = grkCalls[1]?.input?.find((i: any) => i.type === 'function_call_output');
  check('Grok’s tool request was run by the server against the real catalogue and the result went back by call id', gr.data?.text === 'ANSWER-BRAVO' && grkCalls.length === 2 && output?.call_id === 'call_1' && typeof output.output === 'string' && JSON.parse(output.output).total !== undefined, { n: grkCalls.length, out: output });
  check('the call before the answer echoed the function call it was answering', grkCalls[1].input.some((i: any) => i.type === 'function_call' && i.name === 'search_catalogue'));
  check('the second Grok call offered the tools again (one round, then the answer) and asked for no storage', grkCalls[1].store === false && grkCalls[1].tools?.length === 4);
  reset();
  // …and the other way round: Gemini grounded, then fine.
  gem.mode = 'tool';
  const gg = await chat('Do you have books about nursing?');
  check('Gemini also runs its tool request through the same tools and answers', gg.data?.text === 'ANSWER-ALPHA' && live(gem.calls).length === 2 && JSON.stringify(live(gem.calls)[1].contents).includes('functionResponse'), gg.data);
  reset();

  section('I. Quota: 4 complimentary questions; provider failures never spend one');
  const qs = `sess-${RUN}-quota-abcdefgh`;
  for (let i = 0; i < 2; i++) await chat(`question number ${i} about journals`, qs);
  gem.mode = '503'; grk.mode = '503';
  const failedQ = await chat('this one fails everywhere', qs);
  check('two answered, one failed: the failed one cost nothing', (await used(qs)) === 2 && failedQ.data?.quota?.used === 2);
  gem.mode = '503'; grk.mode = 'ok';
  await chat('answered by the fallback', qs); reset();
  await chat('and a fourth question', qs);
  check('a fallback answer is one question: four answered in total', (await used(qs)) === 4);
  const callsBefore = gem.calls.length + grk.calls.length;
  const fifth = await chat('a fifth question', qs);
  check('the fifth is refused by the allowance and NO provider is called', fifth.status === 429 && fifth.data?.code === 'quota_reached' && gem.calls.length + grk.calls.length === callsBefore, fifth.data);
  const hi = await chat('hello', qs);
  check('a greeting is answered locally: no provider, no question', hi.status === 200 && hi.data?.local === true && gem.calls.length + grk.calls.length === callsBefore && (await used(qs)) === 4);

  // ═══════════════════════════════════════════════════════════════════════
  section('J. Runtime health, the circuit breaker, and "test passed but chat fails"');
  reset();
  await freshRestart();                                // a clean breaker
  gem.mode = '503';
  for (let i = 0; i < 3; i++) await chat();
  let st = await state();
  check('after 3 transient failures in a row Gemini is Cooling down, with the cooldown time and its last error', st.primary.health.state === 'cooling_down' && st.primary.health.consecutiveFailures === 3 && !!st.primary.health.cooldownUntil && st.primary.health.lastError?.category === 'PROVIDER_5XX', st.primary.health);
  gem.calls.length = 0; grk.calls.length = 0;
  const skip = await chat();
  check('while it rests, Gemini is not asked and the visitor still gets an answer (from Grok)', skip.data?.text === 'ANSWER-BRAVO' && gem.calls.length === 0 && live(grk.calls).length === 1, { gem: gem.calls.length });
  // The test succeeds while real chat fails: they are separate.
  gem.mode = 'ok';
  const okTest = await A(`${P}/gemini/test`, 'POST', { model: 'gemini-3.5-flash-lite' });
  st = await state();
  check('Connection test: Success — and Runtime health is STILL Cooling down (a passing test does not erase real failures)', okTest.data?.ok === true && st.primary.lastTest?.ok === true && st.primary.health.state === 'cooling_down' && st.primary.health.consecutiveFailures === 3, { test: st.primary.lastTest?.ok, health: st.primary.health.state });
  await sleep(2300);
  check('when the rest ends it reads Degraded (a probe is due), not Healthy', (await state()).primary.health.state === 'degraded');
  gem.calls.length = 0; gem.mode = '503';
  const p1 = await chat(), p1b = await chat();
  check('after the rest ONE request is the probe; it fails, the rest is extended, and the visitor is answered by Grok', live(gem.calls).length === 1 && p1.data?.text === 'ANSWER-BRAVO' && p1b.data?.text === 'ANSWER-BRAVO' && (await state()).primary.health.state === 'cooling_down', { calls: live(gem.calls).length });
  await sleep(4400);                                   // the second rest is twice the first
  gem.mode = 'ok'; gem.calls.length = 0;
  const p2 = await chat();
  st = await state();
  check('a successful probe closes the circuit: Gemini answers again, Healthy, failures back to 0', p2.data?.text === 'ANSWER-ALPHA' && st.primary.health.state === 'healthy' && st.primary.health.consecutiveFailures === 0 && !!st.primary.health.lastSuccessAt, st.primary.health);
  // A rejected key rests at once and says "Unavailable", not "Degraded".
  gem.mode = '401';
  const a1 = await chat();
  st = await state();
  check('a rejected credential (401) takes Gemini out at once: Unavailable, not asked again, Grok answers', a1.data?.text === 'ANSWER-BRAVO' && st.primary.health.state === 'unavailable' && st.primary.health.lastError?.category === 'AUTHENTICATION_FAILED', st.primary.health);
  gem.calls.length = 0; await chat();
  check('…and the broken configuration is not hit on every visitor request', gem.calls.length === 0);
  reset();
  await sleep(3300);
  await chat();                                        // probe closes it
  await freshRestart(); gem.mode = '429';
  for (let i = 0; i < 3; i++) await chat();
  check('repeated 429s read as Rate limited', (await state()).primary.health.state === 'rate_limited', (await state()).primary.health);
  reset();
  await freshRestart();
  grk.mode = '503'; gem.mode = '503';
  for (let i = 0; i < 3; i++) await chat();
  st = await state();
  check('each provider has its own breaker', st.primary.health.state === 'cooling_down' && st.fallback.health.state === 'cooling_down');
  const both = await chat();
  check('both resting: a clear unavailable answer, no provider asked, no question spent', both.status === 503 && (await used(both.sessionId)) === 0);
  reset();

  section('K. Metrics: per provider and for the fallback');
  await freshRestart();
  gem.mode = 'ok'; await chat(); await chat();
  gem.mode = '503'; await chat();
  grk.mode = '503'; await chat();
  reset();
  await sleep(100);
  st = await state();
  check('routing: 4 requests, 2 answered by the primary, fallback tried twice and answered once, both failed once', st.routing.requests === 4 && st.routing.primaryAnswered === 2 && st.routing.fallbackActivated === 2 && st.routing.fallbackAnswered === 1 && st.routing.bothFailed === 1 && st.routing.fallbackSuccessRate === 50, st.routing);
  check('per provider: Gemini 4 requests, 2 answered, 2 errors; Grok 2 requests, 1 answered, 1 error; average latency present', st.primary.health.last24h.requests === 4 && st.primary.health.last24h.answered === 2 && st.primary.health.last24h.errors === 2 && st.fallback.health.last24h.requests === 2 && st.fallback.health.last24h.answered === 1 && st.fallback.health.last24h.errors === 1 && st.primary.health.last24h.avgLatencyMs !== null, [st.primary.health.last24h, st.fallback.health.last24h]);
  check('events include a fallback and a both-failed', st.events.some((e: any) => e.type === 'fallback_used') && st.events.some((e: any) => e.type === 'both_failed'));
  check('the counters survive a restart', await (async () => { await sleep(4600); await restart(MASTER); const s2 = await state(); return s2.routing.requests === 4 && s2.primary.health.last24h.requests === 4; })());

  section('L. Failover settings, the master switch, and the lead flow');
  const off = await A(`${P}/failover`, 'POST', { fallbackEnabled: false });
  check('automatic fallback OFF is saved and audited', off.data?.ok === true && off.data.state.fallbackEnabled === false && (await audits('AI_FALLBACK_DISABLED')).length === 1);
  reset(); gem.mode = '503';
  const noFb = await chat();
  check('with fallback OFF a Gemini failure is just unavailable, and Grok is not called', noFb.status === 503 && live(grk.calls).length === 0 && (await used(noFb.sessionId)) === 0);
  await A(`${P}/failover`, 'POST', { fallbackEnabled: true }); reset();
  const swap = await A(`${P}/failover`, 'POST', { primary: 'grok' });
  check('the primary can be swapped, and it is audited', swap.data?.state.primaryProvider === 'grok' && swap.data.state.primary.id === 'grok' && swap.data.state.fallback.id === 'gemini' && (await audits('AI_PRIMARY_PROVIDER_CHANGED')).length === 1);
  const sw = await chat();
  check('…and then Grok answers first', sw.data?.text === 'ANSWER-BRAVO' && live(gem.calls).length === 0);
  await A(`${P}/failover`, 'POST', { primary: 'gemini' }); reset();
  check('an invalid provider or value is refused', (await A(`${P}/failover`, 'POST', { primary: 'openai' })).status === 400 && (await A(`${P}/failover`, 'POST', { fallbackEnabled: 'yes' })).status === 400 && (await A(`${P}/nope/test`, 'POST', {})).status === 404);

  await call('/api/admin/ai-assistant/switch', { method: 'POST', token: admin.token, body: { enabled: false } });
  const pub = await chat();
  check('master switch OFF: chat is refused and no provider is called; provider settings did not turn it on', pub.status === 503 && pub.data?.code === 'AI_ASSISTANT_DISABLED' && gem.calls.length + grk.calls.length === 0);
  await saveG(undefined, 'gemini-2.5-flash'); await saveG(undefined, 'gemini-3.5-flash-lite');
  check('…and saving provider settings leaves it OFF', (await call('/api/public/ai-assistant/status')).data?.enabled === false);
  await call('/api/admin/ai-assistant/switch', { method: 'POST', token: admin.token, body: { enabled: true } });

  const leadSession = `sess-${RUN}-lead-abcdefgh`;
  gem.mode = '503'; grk.mode = '503';
  const leadsBefore = await db.lead.count();
  const lead = await call('/api/ai-assistant/lead', { method: 'POST', body: { sessionId: leadSession, name: 'Asha Rao', email: `asha-${RUN}@college.invalid`, purpose: 'institutional quote' } });
  const lead2 = await call('/api/ai-assistant/lead', { method: 'POST', body: { sessionId: `${leadSession}2`, name: 'Asha Rao', email: `asha-${RUN}@college.invalid`, purpose: 'again' } });
  check('Get a quote works with both providers down: one lead, matched (not duplicated) the second time', lead.status === 200 && lead2.status === 200 && (await db.lead.count()) === leadsBefore + 1 && (await db.lead.findFirst({ where: { email: `asha-${RUN}@college.invalid` } }))?.source === 'AI Assistant');
  check('the lead and conversation carry no provider identity', !JSON.stringify(await db.aIConversation.findFirst({ where: { sessionId: leadSession } })).match(/gemini|grok/i));
  reset();

  section('M. Persistence, migration of the first version’s row, and a changed master key');
  await restart(MASTER);
  s = await state();
  check('after a restart both Admin keys are still configured (and still revealable)', s.primary.adminKeyConfigured && s.fallback.adminKeyConfigured && (await A(`${P}/gemini/reveal-key`, 'POST', {})).data.apiKey === GEM1 && (await A(`${P}/grok/reveal-key`, 'POST', {})).data.apiKey === GROK2);
  const post = await chat();
  check('…and chat uses them', post.status === 200 && gem.keys[gem.keys.length - 1] === GEM1);
  // The first version stored ONE provider at the top level. It must still open, and survive a change to the other provider.
  await db.appSetting.deleteMany({ where: { key: { in: ['AI_PROVIDER_CONFIG', 'AI_PROVIDER_RUNTIME'] } } });
  await db.appSetting.create({ data: { key: 'AI_PROVIDER_CONFIG', value: { provider: 'gemini', model: 'gemini-2.5-flash', key: seal(GEM2, 'ai-provider-key:v1:gemini'), keyUpdatedAt: '2026-10-13T00:00:00.000Z', keyUpdatedBy: 'old@admin.invalid' } as any, updatedBy: 'old@admin.invalid' } });
  await restart(MASTER); reset();
  s = await state();
  check('the old single-provider row is read: Gemini Admin key, its model, who and when', s.primary.adminKeyConfigured && s.primary.model === 'gemini-2.5-flash' && s.primary.lastFour === GEM2.slice(-4) && s.primary.lastChangedBy === 'old@admin.invalid', s.primary);
  await chat();
  check('…and it is used for chat with its original key', gem.keys[gem.keys.length - 1] === GEM2 && /models\/gemini-2\.5-flash:/.test(gem.urls[gem.urls.length - 1] || ''), [gem.keys.slice(-1), gem.urls.slice(-1)]);
  await saveK(GROK1);
  const migrated = JSON.parse(JSON.stringify((await db.appSetting.findUnique({ where: { key: 'AI_PROVIDER_CONFIG' } }))?.value));
  check('saving Grok rewrote the row as v2 and kept the Gemini key intact (same ciphertext, still opens)', migrated.v === 2 && !!migrated.providers.gemini.key.ct && (await A(`${P}/gemini/reveal-key`, 'POST', {})).data.apiKey === GEM2);
  await saveG(GEM1); await saveK(GROK2);

  await restart(OTHER_MASTER);
  s = await state();
  check('with a DIFFERENT master key the stored keys are flagged unreadable (Gemini falls to its environment key, Grok is not configured)', s.primary.adminKeyUnreadable && s.fallback.adminKeyUnreadable && s.primary.credentialSource === 'environment' && s.fallback.credentialConfigured === false, [s.primary.credentialSource, s.fallback.credentialConfigured]);
  const unread = await A(`${P}/grok/reveal-key`, 'POST', {});
  check('a reveal of an unreadable key with nothing to fall back to says so plainly, without a key', unread.status === 409 && unread.data?.code === 'KEY_UNREADABLE' && !ALL_KEYS.some(k => unread.text.includes(k)));
  const unreadG = await A(`${P}/gemini/reveal-key`, 'POST', {});
  check('…while Gemini, whose environment key is in use, reveals that key and says where it comes from', unreadG.status === 200 && unreadG.data?.apiKey === ENV_GEM && unreadG.data?.source === 'environment');
  await restart(null);
  s = await state();
  check('with NO master key the screen says keys cannot be stored, and still answers from the environment', s.canStoreKey === false && s.primary.credentialSource === 'environment');
  const revNoMaster = await A(`${P}/gemini/reveal-key`, 'POST', {});
  check('with no master key the environment key can still be revealed (nothing needs decrypting)', revNoMaster.status === 200 && revNoMaster.data?.apiKey === ENV_GEM && revNoMaster.data?.source === 'environment');
  const testNoMaster = await A(`${P}/gemini/test`, 'POST', { model: 'gemini-3.5-flash-lite' });
  check('and the key in use can still be tested', testNoMaster.data?.ok === true);
  const noEnc = await saveK(GROK1);
  check('saving a key then is refused with a plain explanation', noEnc.status === 503 && noEnc.data?.code === 'ENCRYPTION_UNAVAILABLE');
  await restart(MASTER);

  section('N. Only one provider configured, and none');
  await freshRestart(MASTER, null, null);          // no Gemini environment key
  await A(`${P}/gemini/remove-key`, 'POST', {});
  s = await state();
  check('Gemini not configured, Grok configured by Admin: the screen says the primary cannot answer and the fallback can', s.primary.health.state === 'not_configured' && s.failover.primaryUsable === false && s.failover.fallbackUsable === true, s.failover);
  reset();
  const onlyG = await chat();
  check('Grok answers (documented: with the primary unconfigured and fallback ON, the fallback serves)', onlyG.data?.text === 'ANSWER-BRAVO' && live(gem.calls).length === 0 && (await used(onlyG.sessionId)) === 1);
  await A(`${P}/failover`, 'POST', { fallbackEnabled: false }); reset();
  const noFb2 = await chat();
  check('with fallback OFF and the primary not configured the assistant is unavailable — nobody is promoted silently', noFb2.status === 503 && live(grk.calls).length === 0);
  await A(`${P}/failover`, 'POST', { fallbackEnabled: true });
  await A(`${P}/grok/remove-key`, 'POST', {});
  const none = await chat();
  check('no provider configured at all: the public sees the normal unavailable message, nothing about keys', none.status === 503 && /temporarily unavailable/i.test(none.data?.error || '') && !/key|credential|configured/i.test(none.text), none.text);
  check('the admin screen shows both as not configured', (await state()).primary.health.state === 'not_configured' && (await state()).fallback.health.state === 'not_configured');

  section('O. Nothing secret anywhere');
  const blob = everything.join('\n');
  const leaks = ALL_KEYS.filter(k => { const parts = blob.split(k).length - 1; const reveals = blob.split(`"apiKey":"${k}"`).length - 1; return parts > reveals; });
  check('every occurrence of a key in a response is inside an explicit reveal', leaks.length === 0, leaks);
  check('no key in the server log', !ALL_KEYS.some(k => serverLog.includes(k)), ALL_KEYS.filter(k => serverLog.includes(k)));
  check('no Authorization header or bearer text in the server log', !/Bearer\s+\S{6,}/.test(serverLog));
  const auditAll = JSON.stringify(await db.adminAuditLog.findMany({ where: { adminId: admin.id } }));
  check('no key or ciphertext in any audit row', !ALL_KEYS.some(k => auditAll.includes(k)) && !/"ct"|"iv"|"tag"/.test(auditAll));
  const statusRows = JSON.stringify(await db.appSetting.findMany({ where: { key: { in: ['AI_PROVIDER_STATUS', 'AI_PROVIDER_RUNTIME'] } } }));
  check('no key in the status or runtime rows', !ALL_KEYS.some(k => statusRows.includes(k)));
  const home = await fetch(BASE + '/'); const html = await home.text();
  check('no key in the public page source', !ALL_KEYS.some(k => html.includes(k)));
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}`);
} finally {
  await stop();
  await db.aIMessage.deleteMany({ where: { conversation: { sessionId: { contains: RUN } } } }).catch(() => {});
  await db.aIConversation.deleteMany({ where: { sessionId: { contains: RUN } } }).catch(() => {});
  await db.lead.deleteMany({ where: { email: { contains: RUN } } }).catch(() => {});
  await wipe();
  await db.adminAuditLog.deleteMany({ where: { adminId: admin.id } }).catch(() => {});
  await db.userSession.deleteMany({ where: { sessionId: { contains: `-fo-${RUN}` } } }).catch(() => {});
  await db.user.deleteMany({ where: { email: { contains: `-${RUN}@ai-fo.invalid` } } }).catch(() => {});
  geminiMock.close(); grokMock.close();
  await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
