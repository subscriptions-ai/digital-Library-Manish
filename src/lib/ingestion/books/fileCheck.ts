import { fetchRaw } from '../sourceHealth.js';

/**
 * Does this book file actually open from here?
 *
 * A provider listing a PDF is a claim. OAPEN, for one, lists a file for every title and then puts
 * the download behind a bot check that answers an automated request with an HTML page — a "PDF"
 * link that opens nothing. Marking such a book Full Text promises a reader something we cannot
 * deliver, so the file is asked for (the first kilobyte only) and must really be a PDF.
 *
 * A host that refuses three requests in a row is not asked again this run: it is a wall, not bad
 * luck, and hammering it helps nobody. This is kept apart from IngestionSourceHealth on purpose —
 * a download wall must not trip the circuit breaker that guards the catalogue feed itself.
 */
export type FileVerdict = { ok: boolean; reason: string };

export class FileChecker {
  private streak = new Map<string, number>();
  constructor(private limit = 3, private timeoutMs = 20_000) {}

  async verifyPdf(url: string): Promise<FileVerdict> {
    let host: string;
    try { host = new URL(url).host; } catch { return { ok: false, reason: 'not a valid address' }; }
    if ((this.streak.get(host) || 0) >= this.limit) return { ok: false, reason: `${host} refuses automated downloads (not asked again this run)` };

    let verdict: FileVerdict;
    try {
      const r = await fetchRaw(url, {
        headers: { Range: 'bytes=0-1023', 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const type = String(r.headers?.get?.('content-type') || '');
      if (r.status !== 200 && r.status !== 206) {
        verdict = { ok: false, reason: `HTTP ${r.status}` };
      } else {
        // Read the first chunk and stop: a server that ignores Range would otherwise send the whole book.
        const head = await firstBytes(r, 16);
        const magic = String.fromCharCode(...head.subarray(0, 5)) === '%PDF-';
        verdict = magic ? { ok: true, reason: 'opens, is a PDF' }
          : { ok: false, reason: /html/i.test(type) ? 'answered with a web page, not a file' : `not a PDF (${type || 'unknown type'})` };
      }
    } catch (e: any) {
      verdict = { ok: false, reason: e?.name === 'TimeoutError' ? 'timed out' : String(e?.message || e).slice(0, 120) };
    }
    this.streak.set(host, verdict.ok ? 0 : (this.streak.get(host) || 0) + 1);
    return verdict;
  }
}

async function firstBytes(r: Response, n: number): Promise<Uint8Array> {
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array(await r.arrayBuffer()).subarray(0, n);
  try {
    const { value } = await reader.read();
    return (value || new Uint8Array()).subarray(0, n);
  } finally { await reader.cancel().catch(() => {}); }
}
