import Papa from 'papaparse';
import { gunzipSync } from 'node:zlib';
import type { NormalisedBook } from './normalise.js';
import { isbn13s } from './identifiers.js';
import { decode } from './oaiXml.js';
import { licenceFromProse } from '../licenceProse.js';
import { canonicalLicence } from './licence.js';
import { fetchRaw } from '../sourceHealth.js';
import { ingestionDb } from '../db.js';
import { classifyDepartment, departmentKeywords } from './classifier.js';
import { audit } from '../audit.js';

/**
 * NCBI Bookshelf, through its official bulk archive and nothing else.
 *
 *   https://ftp.ncbi.nlm.nih.gov/pub/litarch/file_list.csv       one line per book: path, title, publisher, year, accession
 *   https://ftp.ncbi.nlm.nih.gov/pub/litarch/<path>.tar.gz       the book itself, with its TOC.nxml metadata
 *
 * The list has no licence, subject or abstract; those live in each book's archive, a few megabytes
 * apiece, so the work is done in two stages and the archive is only fetched for a book that might be
 * wanted:
 *
 *   Stage 1  (file_list.csv, one small download)  title → "could this be one of the health departments?"
 *            Publishes nothing. Writes nothing.
 *   Stage 2  (one archive at a time, under a daily budget)  TOC.nxml → authors, ISBN, subjects,
 *            abstract and — the point of the trip — the licence statement.
 *
 * Nothing in the archive is read for its full text. Rights follow explicit evidence only: a recognised
 * licence is kept; explicit public-domain wording is recorded; anything else — no statement, a statement
 * we cannot place, a damaged archive — is Unknown, and Unknown is Metadata Only.
 */
export const NCBI_LIST_URL = 'https://ftp.ncbi.nlm.nih.gov/pub/litarch/file_list.csv';
export const NCBI_ARCHIVE_BASE = 'https://ftp.ncbi.nlm.nih.gov/pub/litarch/';
export const NCBI_PROVIDER = 'NCBIBookshelf';

/** NCBI's FTP host needs longer than Node's default 250 ms per address from some networks; no other source is touched by this. */
export const NCBI_CONNECT_TIMEOUT_MS = 3000;

/** The departments this provider is for. A book that does not land in one of them is not taken. */
export const NCBI_TARGET_DEPARTMENTS = ['Medical Sciences', 'Life Sciences', 'Bio Technology', 'Pharmacy', 'Nursing', 'Dental', 'Physiotherapy'];

/**
 * Stage 1 is a PRIORITY shortlist, not a classification: it decides which archives are worth the download
 * budget, and in what order. Whatever is fetched is classified afresh from its title, subjects and abstract.
 *
 * A title qualifies only through department-specific wording ("periodontal", "midwifery", "pharmacokinetics").
 * Generic health words — health, medicine, clinical, disease, patient — are `support` evidence: they add a
 * point to a title that already qualifies and can never qualify one on their own. The classifier's own
 * keywords for a department are reused as specific wording (except Medical Sciences, whose keywords are
 * the generic ones), and the lists below add the word forms a title can take that the classifier, which reads
 * whole subjects, does not need.
 *
 * Tier is the order of work: the specialist departments the catalogue is thin in come before the broad ones.
 * It orders the queue; it never lets a title in. Relevance decides that.
 */
/** `demote`: wording that is specific in the classifier's eyes but not as a reason to spend a download (it counts as support instead). */
type Rule = { department: string; tier: 1 | 2 | 3; specific: RegExp; support: RegExp; useClassifier: boolean; demote?: RegExp };
const w = (s: string) => new RegExp(`\\b(?:${s})\\b`, 'gi');
export const NCBI_RULES: Rule[] = [
  { department: 'Dental', tier: 1, useClassifier: true,
    specific: w('dental|dentists?|dentistry|oral (?:health|hygiene|surgery|medicine|pathology|cancer|care|microbiology)|periodon\\w*|orthodon\\w*|prosthodon\\w*|endodon\\w*|pedodon\\w*|caries|tooth|teeth|craniofacial|maxillofacial|temporomandibular|gingiv\\w*|dentition|odontolog\\w*'),
    support: w('oral|mouth|jaw|fluorid\\w*|saliva\\w*') },
  { department: 'Nursing', tier: 1, useClassifier: true,
    specific: w('nursing|nurses?|midwi\\w+|nurse practitioners?'),
    support: w('care|patients?|safety|hospital\\w*|caregiv\\w+|infection control|palliative care|patient care'), demote: /^(patient care|palliative care)$/ },
  { department: 'Pharmacy', tier: 1, useClassifier: true,
    specific: w('pharmac\\w+|pharmaceutic\\w*|pharmacist\\w*|pharmacolog\\w+|pharmacokinetic\\w*|pharmacodynamic\\w*|drug (?:formulation|delivery|design|discovery|development|interactions?|metabolism|safety|dosing|therapy)|dosage forms?|medicinal chemistry|pharmacovigilance|formulary'),
    support: w('drugs?|medications?|dosage|toxicolog\\w*|toxicity|pharmacoeconomic\\w*'), demote: /^(toxicolog|pharmacoeconomic)/ },
  { department: 'Physiotherapy', tier: 1, useClassifier: true,
    specific: w('physiotherap\\w+|physical therap\\w+|physical medicine|rehabilitat\\w+|kinesiolog\\w*|sports medicine|occupational therapy|exercise (?:therapy|prescription|physiology)|orthotics?|prosthetics?|manual therapy'),
    support: w('exercise|mobility|physical|pain|injur\\w+|disabilit\\w+|musculoskeletal|low back pain|biomechanic\\w*') },
  { department: 'Bio Technology', tier: 2, useClassifier: true,
    specific: w('biotechnolog\\w+|genetic engineering|bioprocess\\w*|molecular biotechnology|bioinformatic\\w*|synthetic biology|crispr|bioengineering|recombinant|gene (?:therapy|editing|cloning|expression)|biomanufactur\\w*|bioreactors?|fermentation|monoclonal|tissue engineering|genetically modified|transgenic'),
    support: w('genomic\\w*|genetic\\w*|stem cells?|cell culture|enzymes?|protein\\w*') },
  { department: 'Medical Sciences', tier: 2, useClassifier: false,
    specific: w('cardiolog\\w*|cardiovascular|cardiac|oncolog\\w*|cancers?|tumou?rs?|carcinoma|leuk(?:a)?emia|lymphoma|diabet\\w+|neurolog\\w*|psychiatr\\w+|surger(?:y|ies)|surgical|pediatric\\w*|paediatric\\w*|neonat\\w+|obstetric\\w*|gyn(?:a)?ecolog\\w+|geriatric\\w*|anesthe\\w+|anaesthe\\w+|radiolog\\w*|dermatolog\\w*|ophthalmolog\\w*|otolaryngolog\\w*|urolog\\w*|nephrolog\\w*|hepatolog\\w*|gastroenterolog\\w*|endocrin\\w*|immunolog\\w*|hypertension|stroke|asthma|alzheimer\\w*|parkinson\\w*|epilep\\w+|infectious diseases?|tubercul\\w+|hepatitis|hiv|malaria|sepsis|pathology|anatomy|physiology|clinical (?:methods|practice|guidelines?|trials?|medicine|pharmacology|examination|skills|manual)|internal medicine|emergency medicine|critical care|intensive care|diagnostic imaging|medical (?:education|genetics|textbook)|textbook of'),
    support: w('medic\\w+|clinical|disease\\w*|patients?|health\\w*|treatment|therap\\w+|syndrome|disorders?|diagnos\\w+|public health|care') },
  { department: 'Life Sciences', tier: 3, useClassifier: true,
    specific: w('biology|biologists?|cell biology|molecular biology|microbiolog\\w*|biochem\\w+|genetics|ecolog\\w*|zoolog\\w*|botan\\w*|evolution\\w*|biodiversity|neuroscience|developmental biology|virolog\\w*|parasitolog\\w*|bacteriolog\\w*|taxonomy|life sciences'),
    support: w('cells?|genes?|genom\\w+|proteins?|species|organisms?|molecular') },
];

export type Stage1 = {
  row: NcbiRow;
  department: string; tier: 1 | 2 | 3;
  /** How much department-specific wording the title carries: 3 per distinct specific term (max 9), 1 per support term (max 2), +2 where the classifier's own reading of the title agrees. */
  score: number;
  evidence: string[]; reason: string;
};

/** Smallest title relevance that gets an archive downloaded: one department-specific term. */
export const NCBI_MIN_RELEVANCE = 3;

const matches = (re: RegExp, text: string) => [...new Set([...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].map(m => m[0].toLowerCase()))];

/** Stage 1 for one title: the department its wording points at, or null when no department-specific wording is present. */
export function shortlistTitle(row: NcbiRow): Stage1 | null {
  // A manufacturer in brackets ("(Novartis Pharmaceuticals Canada Inc.)") is not the subject of the book.
  const title = row.title.replace(/\([^)]*\b(?:inc|ltd|llc|corp|gmbh|plc|canada)\b[^)]*\)/gi, ' ');
  // "Non-pharmacological" is about everything but drugs, and a "nursing home" is a place, not the profession.
  const clean = title.replace(/\bnon-?pharmacolog\w*/gi, ' ').replace(/\bnursing (?:homes?|facilit\w+)\b/gi, ' ');
  const guess = classifyDepartment({ title: clean });
  let best: Stage1 | null = null;
  for (const rule of NCBI_RULES) {
    const spec = new Set(matches(rule.specific, clean));
    if (rule.useClassifier) for (const re of departmentKeywords(rule.department)) for (const m of matches(re, clean)) spec.add(m);
    const demoted = rule.demote ? [...spec].filter(t => rule.demote!.test(t)) : [];
    demoted.forEach(t => spec.delete(t));
    if (!spec.size) continue;                                    // generic wording alone never qualifies
    const sup = [...new Set([...matches(rule.support, clean), ...demoted])].filter(t => !spec.has(t));
    const agrees = rule.useClassifier && guess.band !== 'none' && guess.suggested === rule.department;   // Medical Sciences' classifier wording is the generic kind: no bonus from it
    const score = Math.min(9, spec.size * 3) + Math.min(2, sup.length) + (agrees ? 2 : 0);
    const evidence = [...[...spec].map(t => `"${t}" +3`), ...sup.slice(0, 2).map(t => `"${t}" (generic) +1`), ...(agrees ? ['classifier title reading agrees +2'] : [])];
    const cand: Stage1 = { row, department: rule.department, tier: rule.tier, score, evidence, reason: `${rule.department}: ${evidence.join(', ')}` };
    // Relevance decides the department; tier only settles an exact tie, in favour of the specialist.
    if (!best || cand.score > best.score || (cand.score === best.score && cand.tier < best.tier)) best = cand;
  }
  return best && best.score >= NCBI_MIN_RELEVANCE ? best : null;
}

/** The department order for a pass: by tier, and within a tier the one the catalogue holds fewest books in first. */
export function departmentOrder(coverage: Record<string, number> = {}): string[] {
  return [...NCBI_RULES].sort((a, b) => a.tier - b.tier || (coverage[a.department] ?? 0) - (coverage[b.department] ?? 0) || a.department.localeCompare(b.department)).map(r => r.department);
}

/**
 * The whole list through Stage 1, as a queue: tier first, then the strongest title evidence, then the
 * thinnest-covered department, then accession for a stable order. Nothing is downloaded or written.
 */
export function buildQueue(rows: NcbiRow[], order: string[] = departmentOrder()): Stage1[] {
  const rank = new Map(order.map((d, i) => [d, i]));
  const out: Stage1[] = [];
  for (const r of rows) { const s = shortlistTitle(r); if (s) out.push(s); }
  return out.sort((a, b) => a.tier - b.tier || b.score - a.score || (rank.get(a.department) ?? 99) - (rank.get(b.department) ?? 99) || a.row.accession.localeCompare(b.row.accession, 'en', { numeric: true }));
}

/** A bounded sample takes its turn from each department in priority order, so a small test sees every department the queue holds. */
export function interleave(queue: Stage1[], order: string[] = departmentOrder()): Stage1[] {
  const lanes = order.map(d => queue.filter(q => q.department === d));
  const out: Stage1[] = [];
  for (let i = 0; lanes.some(l => i < l.length); i++) for (const l of lanes) if (i < l.length) out.push(l[i]);
  return out;
}

/** Published books per target department: the existing coverage the order of work leans on. */
export async function departmentCoverage(db: any = ingestionDb): Promise<Record<string, number>> {
  const rows: any[] = await db.book.groupBy({ by: ['domain'], where: { status: 'Published', domain: { in: NCBI_TARGET_DEPARTMENTS } }, _count: { _all: true } }).catch(() => []);
  return Object.fromEntries(rows.map(r => [r.domain, r._count._all]));
}

export function ncbiLimits() {
  const n = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v >= 0 && process.env[k] !== undefined && process.env[k] !== '' ? v : d; };
  return {
    maxArchivesPerDay: n('NCBI_BOOKS_MAX_ARCHIVES_PER_DAY', 50),
    maxBytesPerDay: n('NCBI_BOOKS_MAX_BYTES_PER_DAY', 524_288_000),
    maxArchiveBytes: n('NCBI_BOOKS_MAX_ARCHIVE_BYTES', 52_428_800),
    concurrency: Math.max(1, n('NCBI_BOOKS_DOWNLOAD_CONCURRENCY', 1)),
    /** Rows read per batch and archives fetched per batch: keeps one engine pass short. */
    rowsPerBatch: 200,
    archivesPerBatch: 5,
  };
}

// ── Stage 1: the list ────────────────────────────────────────────────────

export type NcbiRow = { file: string; title: string; publisher: string; year: number | null; accession: string; updated: string | null };

const NAMED: Record<string, string> = { reg: '®', copy: '©', trade: '™', nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', deg: '°', micro: 'µ', plusmn: '±' };
const entities = (s: string) => decode(s).replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);

/** The list is Windows-1252 text with HTML entities in it; both are undone. */
export function parseNcbiList(csv: string): NcbiRow[] {
  const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
  const out: NcbiRow[] = [];
  for (const r of rows) {
    const file = (r['File'] || '').trim(), accession = (r['Accession ID'] || '').trim(), title = entities(r['Title'] || '').replace(/\s+/g, ' ').trim();
    if (!file || !/^NBK\d+$/.test(accession) || !title) continue;
    out.push({ file, title, publisher: entities(r['Publisher'] || '').trim(), year: Number(r['Publication Year']) || null, accession, updated: (r['Last Updated (YYYY-MM-DD HH:MM:SS)'] || '').trim() || null });
  }
  return out;
}

const landing = (accession: string) => `https://www.ncbi.nlm.nih.gov/books/${accession}/`;

/** What the list alone can say about a book: enough to ask "worth fetching?", never enough to catalogue. */
export function rowStub(r: NcbiRow): NormalisedBook {
  return {
    provider: NCBI_PROVIDER, sourceRecordId: r.accession, title: r.title, authors: null, editors: null, publisherName: r.publisher || null,
    year: r.year, doi: null, isbns: [], language: null, description: null, subjects: [], classifications: [], lcc: [], edition: null, pages: null,
    country: null, coverUrl: null, landingUrl: landing(r.accession), externalUrl: landing(r.accession), fileUrl: null,
    licence: null, licenceBasis: 'none', modified: r.updated, deleted: false,
  };
}

// ── Stage 2: the archive ─────────────────────────────────────────────────

export type NcbiToc = {
  title: string | null; authors: string[]; editors: string[]; publisher: string | null; isbns: string[];
  subjects: string[]; abstract: string | null; year: number | null;
  licence: string | null;
  /** cc = a recognised Creative Commons licence; public-domain = explicit wording; the rest are all "Unknown". */
  rights: 'cc' | 'public-domain' | 'unrecognised' | 'ambiguous' | 'none';
  rightsText: string | null;
};

const strip = (s: string) => entities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const blocks = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?=[\\s>])([^>]*)>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => ({ attrs: m[1], inner: m[2] }));

/** Read the licence out of a book's <permissions>, from explicit evidence only. */
export function readRights(permissions: string): Pick<NcbiToc, 'licence' | 'rights' | 'rightsText'> {
  if (!permissions.trim()) return { licence: null, rights: 'none', rightsText: null };
  const found = new Set<string>();
  for (const l of blocks(permissions, 'license')) {
    const href = /(?:xlink:)?href="([^"]+)"/.exec(l.attrs)?.[1] || '';
    const ref = strip(blocks(l.inner, 'ali:license_ref')[0]?.inner || '');
    const text = strip(l.inner);
    const hit = canonicalLicence(licenceFromProse(href)) || canonicalLicence(licenceFromProse(ref)) || canonicalLicence(licenceFromProse(text));
    if (hit) found.add(hit);
  }
  const text = strip(permissions).slice(0, 600);
  if (found.size === 1) return { licence: [...found][0], rights: 'cc', rightsText: text };
  if (found.size > 1) return { licence: null, rights: 'ambiguous', rightsText: text };
  // Public domain only when it is said in so many words, and nothing else is claimed.
  if (/public domain/i.test(text) && !/all rights reserved|©|copyright\s+(?:©|\d{4})/i.test(text.replace(/public domain/gi, ''))) return { licence: 'Public Domain', rights: 'public-domain', rightsText: text };
  return { licence: null, rights: 'unrecognised', rightsText: text };
}

export function parseToc(xml: string): NcbiToc {
  const meta = blocks(xml, 'book-meta')[0]?.inner ?? xml;
  const people = (kind: string) => blocks(meta, 'contrib').filter(c => new RegExp(`contrib-type="${kind}"`).test(c.attrs)).map(c => {
    const collab = blocks(c.inner, 'collab')[0]?.inner;
    if (collab) return strip(collab);
    const sn = strip(blocks(c.inner, 'surname')[0]?.inner || ''), gn = strip(blocks(c.inner, 'given-names')[0]?.inner || '');
    return [gn, sn].filter(Boolean).join(' ');
  }).filter(Boolean);
  const subjects = [
    ...blocks(meta, 'custom-meta').filter(c => /books-subject/.test(c.inner)).map(c => strip(blocks(c.inner, 'meta-value')[0]?.inner || '')),
    ...blocks(meta, 'kwd').map(k => strip(k.inner)),
  ].filter(Boolean);
  const abstracts = blocks(meta, 'abstract').map(a => ({ text: strip(a.inner) })).filter(a => a.text);
  const abstract = abstracts.sort((a, b) => b.text.length - a.text.length)[0]?.text.slice(0, 2500) || null;
  const rights = readRights(blocks(meta, 'permissions')[0]?.inner ?? '');
  return {
    title: strip(blocks(meta, 'book-title')[0]?.inner || '') || null,
    authors: [...new Set(people('author'))], editors: [...new Set(people('editor'))],
    publisher: strip(blocks(meta, 'publisher-name')[0]?.inner || '') || null,
    isbns: isbn13s(blocks(meta, 'isbn').map(i => strip(i.inner))),
    subjects: [...new Set(subjects)], abstract,
    year: Number(blocks(meta, 'year')[0]?.inner) || null,
    ...rights,
  };
}

/** The one file wanted from a gzipped tar: TOC.nxml. Everything else (images, PDFs) is passed over unread. */
export function extractToc(tgz: Buffer): string | null {
  const tar = gunzipSync(tgz, { maxOutputLength: 600 * 1024 * 1024 });
  let i = 0, longName: string | null = null;
  while (i + 512 <= tar.length) {
    const h = tar.subarray(i, i + 512);
    if (h.every(b => b === 0)) break;
    const size = parseInt(h.subarray(124, 136).toString('latin1').replace(/\0.*$/, '').trim() || '0', 8) || 0;
    const type = String.fromCharCode(h[156] || 48);
    const prefix = h.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const base = h.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const body = tar.subarray(i + 512, i + 512 + size);
    if (type === 'L') longName = body.toString('utf8').replace(/\0.*$/, '');
    else {
      const name = longName ?? (prefix ? `${prefix}/${base}` : base);
      longName = null;
      if ((type === '0' || type === '\0') && /(^|\/)TOC\.nxml$/.test(name)) return body.toString('utf8');
    }
    i += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

export type ArchiveResult =
  | { status: 'ok'; toc: NcbiToc; bytes: number }
  | { status: 'oversize'; bytes: number | null }
  | { status: 'failed'; reason: string; bytes: number }
  | { status: 'deferred'; reason: string };

let inflight = 0;

/** Bytes and archives already taken today (UTC), from the audit log: durable, and no schema of its own. */
export async function usedToday(db: any = ingestionDb): Promise<{ archives: number; bytes: number }> {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const rows: any[] = await db.$queryRawUnsafe(
    `select count(*)::int as n, coalesce(sum((meta->>'bytes')::bigint), 0)::float8 as b from "IngestionAudit" where action = 'NCBI_ARCHIVE_DOWNLOADED' and at >= $1`, start);
  return { archives: rows[0]?.n ?? 0, bytes: rows[0]?.b ?? 0 };
}

/**
 * Fetch one archive and read its TOC, inside the daily limits. A file over the size limit is skipped with
 * a reason, and so is anything the budget will not cover today; neither is a failure of the provider.
 */
export async function fetchArchive(row: NcbiRow, db: any = ingestionDb, lim = ncbiLimits()): Promise<ArchiveResult> {
  const used = await usedToday(db);
  if (used.archives >= lim.maxArchivesPerDay) return { status: 'deferred', reason: `daily limit of ${lim.maxArchivesPerDay} archives reached` };
  if (used.bytes >= lim.maxBytesPerDay) return { status: 'deferred', reason: 'daily byte limit reached' };
  while (inflight >= lim.concurrency) await new Promise(r => setTimeout(r, 200));
  inflight++;
  try {
    const url = NCBI_ARCHIVE_BASE + row.file;
    const r = await fetchRaw(url, { headers: { 'User-Agent': `STM Digital Library (mailto:${process.env.OPENALEX_CONTACT || 'info@celnet.in'})` }, signal: AbortSignal.timeout(180_000) }, NCBI_CONNECT_TIMEOUT_MS);
    if (!r.ok) { await r.body?.cancel().catch(() => {}); return { status: 'failed', reason: `HTTP ${r.status}`, bytes: 0 }; }
    const declared = Number(r.headers?.get?.('content-length')) || null;
    if (declared && declared > lim.maxArchiveBytes) { await r.body?.cancel().catch(() => {}); return { status: 'oversize', bytes: declared }; }
    if (declared && used.bytes + declared > lim.maxBytesPerDay) { await r.body?.cancel().catch(() => {}); return { status: 'deferred', reason: 'this archive would pass the daily byte limit' }; }

    const chunks: Buffer[] = []; let got = 0;
    const reader = r.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (got > lim.maxArchiveBytes) { await reader.cancel().catch(() => {}); return { status: 'oversize', bytes: got }; }
      chunks.push(Buffer.from(value));
    }
    await audit(null, 'NCBI_ARCHIVE_DOWNLOADED', { accession: row.accession, bytes: got });
    const buf = Buffer.concat(chunks);
    let xml: string | null;
    try { xml = extractToc(buf); } catch (e: any) { return { status: 'failed', reason: `archive unreadable: ${String(e?.message || e).slice(0, 100)}`, bytes: got }; }
    if (!xml) return { status: 'failed', reason: 'no TOC.nxml in the archive', bytes: got };
    if (!/<book-meta\b/.test(xml)) return { status: 'failed', reason: 'TOC.nxml has no book-meta', bytes: got };
    try { return { status: 'ok', toc: parseToc(xml), bytes: got }; } catch (e: any) { return { status: 'failed', reason: `TOC.nxml could not be read: ${String(e?.message || e).slice(0, 100)}`, bytes: got }; }
  } catch (e: any) {
    return { status: 'failed', reason: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'download timed out' : String(e?.message || e).slice(0, 120), bytes: 0 };
  } finally { inflight--; }
}

/** The book, from the list and — when the archive was read — its TOC. A failed read leaves rights Unknown. */
export function normaliseNcbi(row: NcbiRow, res: ArchiveResult): NormalisedBook {
  const b = rowStub(row);
  if (res.status === 'failed') return { ...b, extra: { ncbi: { accession: row.accession, archive: row.file, tocRead: false, rights: 'unknown', reason: res.reason } } };
  if (res.status !== 'ok') return b;
  const t = res.toc;
  return {
    ...b,
    title: t.title && t.title.length >= 3 ? t.title : b.title,
    authors: t.authors.join(', ') || null,
    editors: t.editors.join(', ') || null,
    publisherName: t.publisher || b.publisherName,
    year: b.year ?? t.year,
    isbns: t.isbns,
    description: t.abstract,
    subjects: t.subjects,
    licence: t.licence,
    licenceBasis: t.licence ? 'title' : 'none',
    extra: { ncbi: { accession: row.accession, archive: row.file, archiveBytes: res.bytes, rights: t.rights, rightsText: t.rightsText, tocRead: true } },
  };
}
