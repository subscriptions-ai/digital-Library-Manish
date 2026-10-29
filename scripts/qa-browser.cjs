/**
 * A very small headless-Chrome driver (Chrome DevTools Protocol over `ws`) for looking at pages the way a reader does.
 *
 *   const { launch } = require('./qa-browser.cjs');
 *   const b = await launch();                                    // headless Chrome on a throwaway profile
 *   const p = await b.open('http://localhost:3201', token, { width: 1280, height: 900 });
 *   await p.goto('/institution/access'); await p.shot('/tmp/x.png');
 *   await p.eval('document.title'); await p.click('button[aria-label^="Browse"]'); await b.close();
 *
 * Only for local QA. `token` is placed in localStorage before the app starts, which is all the application reads to sign in.
 */
const { spawn } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = Number(process.env.QA_CDP_PORT || 9333);

async function launch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-chrome-'));
  const proc = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(250); }
  const tabs = [];
  return {
    async open(base, token, viewport = { width: 1280, height: 900 }) {
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r) => ws.once('open', r));
      let id = 0; const pending = new Map(); const logs = []; const failed = [];
      ws.on('message', (m) => {
        const d = JSON.parse(m);
        if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
        else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
        else if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300));
        else if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) failed.push(`${d.params.response.status} ${d.params.response.url.replace(base, '')}`);
      });
      const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
      await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
      const emulate = (v) => send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.dpr || 1, mobile: !!v.mobile });
      await emulate(viewport);
      if (token) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('token', ${JSON.stringify(token)});${viewport.cookies === false ? '' : "localStorage.setItem('cookie-consent', JSON.stringify({status:'rejected'}));"}}catch(e){}` });
      if (viewport.dark !== undefined) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: viewport.dark ? 'dark' : 'light' }] });
      const page = {
        send, logs, failed,
        resize: emulate,
        async goto(p, wait = 'document.readyState==="complete"') { await send('Page.navigate', { url: p.startsWith('http') ? p : base + p }); await sleep(400); await page.waitFor(wait, 20000); await sleep(600); },
        async eval(expr) { const r = await send('Runtime.evaluate', { expression: `(async()=>{return (${expr})})()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
        async waitFor(expr, ms = 25000) { const t0 = Date.now(); for (;;) { try { if (await page.eval(expr)) return true; } catch {} if (Date.now() - t0 > ms) throw new Error('timeout waiting for: ' + expr); await sleep(200); } },
        async url() { return page.eval('location.pathname + location.search'); },
        async click(sel) { const ok = await page.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.scrollIntoView({block:'center'}); e.click(); return true})()`); if (!ok) throw new Error('no element: ' + sel); await sleep(400); },
        async clickText(text, tag = 'button,a,[role=button]') { const ok = await page.eval(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(tag)})].find(x=>x.offsetParent!==null&&(x.innerText||x.getAttribute('aria-label')||'').trim().startsWith(${JSON.stringify(text)})); if(!e) return false; e.scrollIntoView({block:'center'}); e.click(); return true})()`); if (!ok) throw new Error('no clickable text: ' + text); await sleep(500); },
        async back() { await page.eval('history.back()'); await sleep(900); },
        async text(sel = 'body') { return page.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`); },
        async key(key, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key }); await sleep(250); },
        async shot(file, full = false) { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full }); writeFileSync(file, Buffer.from(r.data, 'base64')); return file; },
        async close() { try { await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`); } catch {} ws.close(); },
      };
      tabs.push(page);
      return page;
    },
    async close() { for (const p of tabs) await p.close().catch(() => {}); proc.kill('SIGTERM'); },
  };
}
module.exports = { launch, sleep };
