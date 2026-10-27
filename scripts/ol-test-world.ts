import { readFileSync } from 'node:fs';

/** A fake Open Library + Internet Archive for the full-text audit tests: answers in the shapes the real services do, records every request, and keeps its own clock (nothing really waits). */
export const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/ol-ia/${n}.json`, import.meta.url), 'utf8'));
export const isbn13 = (n: number) => { const d = `978${String(100000000 + n).slice(-9)}`; const s = [...d].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0); return d + ((10 - (s % 10)) % 10); };
export type Reply = { status: number; headers?: Record<string, string>; body?: any };
export class World {
  editions = new Map<string, any>(); works = new Map<string, any>(); ia = new Map<string, any>();
  log: { url: string; at: number }[] = [];
  hook: ((url: string, nth: number) => Reply | null) | null = null;
  now = 1_000_000; sleeps: number[] = [];
  transport = async (url: string): Promise<any> => {
    this.log.push({ url, at: this.now });
    const nth = this.log.filter(l => l.url === url).length;
    const r = this.hook?.(url, nth) ?? this.answer(url);
    return { status: r.status, headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null }, json: async () => { if (r.body === undefined) throw new Error('not json'); return r.body; } };
  };
  answer(url: string): Reply {
    const u = new URL(url);
    if (u.host === 'openlibrary.org' && u.pathname === '/api/books') { const out: any = {}; for (const k of String(u.searchParams.get('bibkeys')).split(',')) if (this.editions.has(k)) out[k] = this.editions.get(k); return { status: 200, body: out }; }
    if (u.host === 'openlibrary.org' && u.pathname === '/search.json') { const keys = [...String(u.searchParams.get('q')).matchAll(/\/works\/(OL\d+W)/g)].map(m => m[1]); return { status: 200, body: { docs: keys.filter(k => this.works.has(k)).map(k => this.works.get(k)) } }; }
    if (u.host === 'archive.org' && u.pathname.startsWith('/metadata/')) { const id = decodeURIComponent(u.pathname.slice('/metadata/'.length)); return { status: 200, body: this.ia.get(id) ?? {} }; }
    return { status: 404 };
  }
  sleep = async (ms: number) => { this.sleeps.push(ms); this.now += ms; };
  opts = (o: any = {}) => ({ transport: this.transport as any, sleep: this.sleep, now: () => this.now, gapMs: 1100, ...o });
}
export const olEntry = (n: number, isbn: string, oc: string | null, avail: string) => ({ key: `/books/OL${n}M`, title: `Title ${n}`, identifiers: { isbn_13: [isbn], openlibrary: [`OL${n}M`] }, ...(oc ? { ebooks: [{ preview_url: `https://archive.org/details/${oc}`, availability: avail, formats: {} }] } : {}) });
export const withPdf = (j: any, n: number, over: any = {}) => ({ ...j, files: [{ name: `${j.metadata.identifier}.pdf`, format: 'Text PDF', size: '1234567' }], metadata: { ...j.metadata, openlibrary_edition: `OL${n}M`, ...over } });
