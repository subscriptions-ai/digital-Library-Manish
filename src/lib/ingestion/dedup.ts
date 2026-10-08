import { ingestionDb as db } from './db.js';

/**
 * Has this record already been seen? One answer, for every path that writes articles.
 *
 * Two paths wrote articles and each built its own key. The engine keyed a record with no DOI
 * on `title|year`; the one-off import keyed it on `title|authors`. Both used `doi:…` when a DOI
 * existed, so the overlap was exact there, and for the rest a record ingested by one path was
 * invisible to the other — a duplicate waiting to happen.
 *
 * Nothing here changes an existing key. New records keep the engine's canonical form, and the
 * other path's older form is still *read* so a record held under it is recognised, never
 * duplicated. Title alone is never a match: it is only ever grounds to ask a person.
 */

export type CandidateWork = {
  source: string;
  sourceRecordId?: string | null;
  doi?: string | null;
  title?: string | null;
  authors?: string | null;
  year?: number | null;
};

export type Held = { articleId: string; via: 'sourceRecordId' | 'fingerprint' | 'legacyFingerprint'; journalId: string | null };

/** "https://doi.org/10.1000/ABC" → "10.1000/abc"; empty → null. */
export function normaliseDoi(raw?: string | null): string | null {
  const t = String(raw || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim().toLowerCase();
  return t || null;
}

const squash = (s: string) => s.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 180);

/** The key new records are stored under. Identical to what the engine has always written. */
export function canonicalFingerprint(w: CandidateWork): string {
  const doi = normaliseDoi(w.doi);
  return doi ? `doi:${doi}` : `t:${squash(String(w.title || ''))}|${w.year ?? ''}`;
}

/** The one-off import's older key for a record with no DOI. Read, never written. */
export function legacyFingerprint(w: CandidateWork): string | null {
  if (normaliseDoi(w.doi)) return null;
  return `ta:${String(w.title || '').toLowerCase().trim().slice(0, 180)}|${String(w.authors || '').toLowerCase().trim().slice(0, 80)}`;
}

const CHUNK = 200;
const chunks = <T,>(a: T[]) => { const o: T[][] = []; for (let i = 0; i < a.length; i += CHUNK) o.push(a.slice(i, i + CHUNK)); return o; };

/**
 * For each candidate, the held article it matches, if any — in a few queries rather than one
 * per record. The key is the position in `works`.
 */
export async function findHeldArticles(works: CandidateWork[]): Promise<Map<number, Held>> {
  const found = new Map<number, Held>();
  if (!works.length) return found;

  const byFp = new Map<string, number[]>();
  const byLegacy = new Map<string, number[]>();
  const bySrc = new Map<string, number[]>();                       // `${source}\u0000${id}`
  works.forEach((w, i) => {
    const push = (m: Map<string, number[]>, k: string) => { const l = m.get(k); l ? l.push(i) : m.set(k, [i]); };
    push(byFp, canonicalFingerprint(w));
    const lg = legacyFingerprint(w); if (lg) push(byLegacy, lg);
    if (w.sourceRecordId) push(bySrc, `${w.source}\u0000${w.sourceRecordId}`);
  });

  const mark = (idxs: number[] | undefined, h: Held) => idxs?.forEach(i => { if (!found.has(i)) found.set(i, h); });

  for (const part of chunks([...byFp.keys(), ...byLegacy.keys()])) {
    const rows: any[] = await db.article.findMany({
      where: { fingerprint: { in: part } }, select: { id: true, fingerprint: true, journalId: true },
    });
    for (const r of rows) {
      mark(byFp.get(r.fingerprint), { articleId: r.id, via: 'fingerprint', journalId: r.journalId });
      mark(byLegacy.get(r.fingerprint), { articleId: r.id, via: 'legacyFingerprint', journalId: r.journalId });
    }
  }

  if (bySrc.size) {
    const bySource = new Map<string, string[]>();
    for (const k of bySrc.keys()) { const [s, id] = k.split('\u0000'); (bySource.get(s) || bySource.set(s, []).get(s)!).push(id); }
    for (const [source, ids] of bySource) for (const part of chunks(ids)) {
      const rows: any[] = await db.article.findMany({
        where: { source, sourceRecordId: { in: part } }, select: { id: true, sourceRecordId: true, journalId: true },
      });
      for (const r of rows) mark(bySrc.get(`${source}\u0000${r.sourceRecordId}`), { articleId: r.id, via: 'sourceRecordId', journalId: r.journalId });
    }
  }
  return found;
}

/**
 * Records with no DOI that share a journal, year and title with one already held but are not the
 * same record by any key above. Either a variant of one we hold or a different piece with a
 * common title ("Editorial"); not for a program to decide, so it is reported for a person.
 */
export async function findPossibleDuplicates(
  journalId: string | null | undefined, works: CandidateWork[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!journalId) return out;
  const idx = works.map((w, i) => ({ w, i })).filter(({ w }) => !normaliseDoi(w.doi) && w.title && w.year);
  if (!idx.length) return out;
  const titles = [...new Set(idx.map(({ w }) => String(w.title).trim()))];
  for (const part of chunks(titles)) {
    const rows: any[] = await db.article.findMany({
      where: { journalId, OR: part.map(t => ({ title: { equals: t, mode: 'insensitive' as const } })) },
      select: { id: true, title: true, year: true },
    });
    for (const { w, i } of idx) {
      const hit = rows.find(r => r.year === w.year && String(r.title).trim().toLowerCase() === String(w.title).trim().toLowerCase());
      if (hit) out.set(i, hit.id);
    }
  }
  return out;
}

/** The journal a record belongs to, found by either of its ISSNs, so print and online do not become two journals. */
export async function findJournalByAnyIssn(issns: (string | null | undefined)[], client: any = db): Promise<any | null> {
  const list = [...new Set(issns.filter(Boolean) as string[])];
  if (!list.length) return null;
  return client.journal.findFirst({ where: { OR: [{ issn: { in: list } }, { eissn: { in: list } }] } });
}
