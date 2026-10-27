/**
 * Where does a provider's "connection reset" happen? One careful, un-retried walk down the stack for a single host, run from the machine that
 * is seeing the failure (the production container, not a laptop — a reset that only happens from one address cannot be reproduced anywhere else).
 *
 *   npx tsx scripts/diagnose-source.ts doab        # or: oapen | all
 *
 * It makes, at most, ONE DNS lookup, one TCP connection per address, one TLS handshake, and two HTTP requests (OAI `Identify`, a few hundred
 * bytes; then the first `ListRecords` page, the one the engine asks for) on a connection of its own. No retries, no loops, no writes anywhere,
 * nothing from the response is kept or printed except its size and status. It does not read or change the health rows, so it can never hold a
 * source's breaker open or shut. A source that is resting is still resting: run this only to learn WHY, not to hurry it.
 *
 * Reading the result:
 *   · DNS fails                          → the container cannot resolve the name (resolver / network policy).
 *   · TCP fails or times out             → the address is filtered or unreachable from here (firewall, egress rules).
 *   · TCP ok, TLS reset                  → something between us and them drops the handshake (a WAF or a firewall that dislikes this address).
 *   · TLS ok, Identify reset before reply→ the provider accepts the connection then closes it on this request (an address / user-agent block).
 *   · Identify ok, ListRecords reset     → only the big request fails: a timeout in the path, or the provider cutting long responses.
 *   · ListRecords 200 but "NOT a complete OAI-PMH document" → the response was cut short or replaced (a proxy / WAF page).
 *   · REST 403 "address is not allowed" → DOAB's REST API is restricted by address; it is the rollback route only, not a fallback.
 *   · everything ok                      → it is not failing right now; the earlier resets were a passing condition (check the times).
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';

const HOSTS: Record<string, { host: string; path: string; label: string }> = {
  doab: { host: 'directory.doabooks.org', path: '/oai/request', label: 'DOAB' },
  oapen: { host: 'library.oapen.org', path: '/oai/request', label: 'OAPEN' },
};
const UA = `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})`;
const which = (process.argv[2] || 'all').toLowerCase();
const targets = which === 'all' ? Object.keys(HOSTS) : [which];
if (targets.some(t => !HOSTS[t])) { console.error('usage: diagnose-source.ts doab | oapen | all'); process.exit(2); }

const code = (e: any) => String(e?.code || e?.cause?.code || e?.name || 'ERROR');
const ms = (t0: number) => `${Date.now() - t0} ms`;

function tcp(host: string, address: string, timeoutMs = 8000) {
  return new Promise<string>(resolve => {
    const t0 = Date.now();
    const s = net.connect({ host: address, port: 443 });
    s.setTimeout(timeoutMs);
    s.once('connect', () => { s.destroy(); resolve(`ok (${ms(t0)})`); });
    s.once('timeout', () => { s.destroy(); resolve(`TIMEOUT after ${timeoutMs} ms — filtered or unreachable`); });
    s.once('error', e => resolve(`FAILED ${code(e)} (${ms(t0)})`));
  });
}

function tlsHandshake(host: string, address: string, timeoutMs = 10000) {
  return new Promise<string>(resolve => {
    const t0 = Date.now();
    const s = tls.connect({ host: address, port: 443, servername: host, timeout: timeoutMs });
    s.once('secureConnect', () => { const p = s.getProtocol(); s.destroy(); resolve(`ok ${p} (${ms(t0)})`); });
    s.once('timeout', () => { s.destroy(); resolve(`TIMEOUT after ${timeoutMs} ms`); });
    s.once('error', e => resolve(`FAILED ${code(e)} (${ms(t0)})`));
  });
}

/** One GET on its own connection. Reports status and size, or where it broke; the body is counted and thrown away. */
function get(host: string, path: string, timeoutMs: number, inspect?: (body: string) => string) {
  return new Promise<string>(resolve => {
    const t0 = Date.now();
    let stage = 'before any response';
    let bytes = 0;
    const chunks: Buffer[] = [];
    const req = https.request({ host, path, method: 'GET', headers: { 'User-Agent': UA, Connection: 'close' }, agent: false, timeout: timeoutMs }, res => {
      stage = 'while reading the response';
      res.on('data', c => { bytes += c.length; if (inspect) chunks.push(c); });
      // The body is read only to be checked (well-formed? a resumptionToken?) and is thrown away; only the verdict is printed.
      res.on('end', () => resolve(`HTTP ${res.statusCode}, ${bytes} bytes (${ms(t0)})${inspect ? ' — ' + inspect(Buffer.concat(chunks).toString('utf8')) : ''}`));
      res.on('error', e => resolve(`FAILED ${code(e)} ${stage} after ${bytes} bytes (${ms(t0)})`));
      res.on('aborted', () => resolve(`ABORTED ${stage} after ${bytes} bytes (${ms(t0)})`));
    });
    req.on('timeout', () => { req.destroy(); resolve(`TIMEOUT ${stage} after ${timeoutMs} ms`); });
    req.on('error', e => resolve(`FAILED ${code(e)} ${stage} (${ms(t0)})`));
    req.end();
  });
}

for (const t of targets) {
  const { host, path, label } = HOSTS[t];
  console.log(`\n${label}  ${host}`);
  let addrs: { address: string; family: number }[] = [];
  try { addrs = await dns.lookup(host, { all: true }); console.log(`  1. DNS         ok — ${addrs.map(a => a.address).join(', ')}`); }
  catch (e) { console.log(`  1. DNS         FAILED ${code(e)}`); continue; }
  const first = addrs.find(a => a.family === 4) || addrs[0];
  console.log(`  2. TCP :443    ${await tcp(host, first.address)}   (${first.address})`);
  console.log(`  3. TLS         ${await tlsHandshake(host, first.address)}`);
  const oai = (body: string) => {
    const wellFormed = /^\s*(<\?[\s\S]*?\?>\s*)*<OAI-PMH[\s>]/.test(body) && /<\/OAI-PMH>\s*$/.test(body);
    const tok = /<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/.exec(body);
    const err = /<error code="([^"]+)"/.exec(body);
    return `${wellFormed ? 'complete OAI-PMH document' : 'NOT a complete OAI-PMH document (truncated, or not OAI at all)'}; ${err ? `OAI error ${err[1]}` : 'no OAI error'}; ${tok ? `resumptionToken present (${tok[1].split('/').pop()} = next offset)` : 'no resumptionToken'}`;
  };
  console.log(`  4. Identify    ${await get(host, `${path}?verb=Identify`, 20_000, oai)}`);
  console.log(`  5. Formats     ${await get(host, `${path}?verb=ListMetadataFormats`, 20_000, b => `xoai ${/<metadataPrefix>xoai<\/metadataPrefix>/.test(b) ? 'offered' : 'NOT offered'}`)}`);
  console.log(`  6. ListRecords ${await get(host, `${path}?verb=ListRecords&metadataPrefix=xoai&set=${t === 'doab' ? 'com_20.500.12854_5' : 'com_20.500.12657_5'}`, 90_000, oai)}`);
  if (t === 'doab') console.log(`  7. REST (legacy rollback route, informational) ${await get(host, '/rest/search?query=*&limit=1&offset=0', 20_000, b => b.slice(0, 80).replace(/\s+/g, ' '))}`);
}
console.log('');
