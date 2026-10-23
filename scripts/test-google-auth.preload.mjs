// Loaded into the Google-auth test server only. Blocks every outbound request except to this machine and gives the server the
// public key the test signs its "Google" credentials with, so the real verification runs without reaching Google.
import { readFileSync } from 'node:fs';
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return real(input, init);
  await new Promise(r => setTimeout(r, Number(process.env.API_TEST_BLOCK_DELAY_MS || 50)));
  throw new Error('network blocked in test');
};
const mod = await import(new URL('../src/server/googleAuth.ts', import.meta.url).href);
const cert = JSON.parse(readFileSync(process.env.GOOGLE_TEST_CERT_FILE, 'utf8'));
mod.setGoogleCertsForTests(cert);
