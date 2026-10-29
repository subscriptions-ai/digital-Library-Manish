/**
 * Books for the departments that have none (Nano Technology, Ayurveda, Applied Sciences, Multidisciplinary): OpenAlex open-access books, judged by
 * src/lib/ingestion/books/deptFill.ts, then frozen as a manifest for scripts/book-source-apply.cjs. Nothing here touches production.
 *
 *   OPENALEX_API_KEY=… DATABASE_URL=…/stm_books_stage npx tsx scripts/books-dept-fill.ts harvest --out <dir> [--pages 5] [--only "Nano Technology"]
 *   DATABASE_URL=…/stm_books_stage npx tsx scripts/books-dept-fill.ts freeze --in <dir> --ids prod-ids.ndjson [--also manifest-frozen.json.gz …] [--freeze <dir>] [--run <runId>]
 *
 * `harvest` reads OpenAlex only and writes candidates.ndjson (the raw records it kept, with the query that found each).
 * `freeze` judges every candidate (department rule + the licence on the book's own record + English + year policy + whole book + a DOI), checks it against
 * every book production already holds (--ids: the read-only export; --also: manifests already applied, which the export predates), drops duplicates
 * inside the set, and with --freeze writes the manifest, its checksum, the evidence, the held list with each reason, and a sample for a person to read.
 * Same refusal as the other staging scripts: only the scratch database `stm_books_stage`.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ingestionDb as db } from '../src/lib/ingestion/db.js';
import { normaliseDoi } from '../src/lib/ingestion/dedup.js';
import { titleKey, normaliseIsbn } from '../src/lib/ingestion/books/identifiers.js';
import { canonicalLicence } from '../src/lib/ingestion/books/licence.js';
import { normaliseOtlBook, OTL_BASE } from '../src/lib/ingestion/books/otl.js';
import { bookPublicationEligibility } from '../src/lib/ingestion/publicationEligibility.js';
import { DEPT_FILL_DEPARTMENTS, ALL_FILL_DEPARTMENTS, FILL_RULES, candidateFromOpenAlex, judgeFill, fillRow, authorsCompatible, type FillCandidate, type FillDepartment } from '../src/lib/ingestion/books/deptFill.js';

const mode = process.argv[2];
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const args = (k: string) => process.argv.flatMap((a, i) => (a === k ? [process.argv[i + 1]] : []));
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_books_stage') { console.error('refusing to run against anything but stm_books_stage'); process.exit(2); }

const SELECT = 'id,doi,display_name,publication_year,language,type,authorships,primary_location,open_access,primary_topic,topics,abstract_inverted_index,updated_date';
const contact = process.env.OPENALEX_CONTACT || 'info@celnet.in';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function harvest() {
  const out = arg('--out'); if (!out) { console.error('--out <dir> required'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const file = join(out, 'candidates.ndjson');
  const maxPages = Number(arg('--pages') || 5), only = arg('--only');
  const key = process.env.OPENALEX_API_KEY;
  const seen = new Set<string>(); const stats: Record<string, any> = {};
  if (existsSync(file)) for (const l of readFileSync(file, 'utf8').split('\n')) if (l) seen.add(JSON.parse(l).w.id);
  const depts = (arg('--depts') || '').split('|').filter(Boolean); const fromYear = Number(arg('--from-year') || 2000);
  // Subfield mode: OpenAlex's own subject taxonomy picks the books (instead of words in the title); the department rule still decides each one afterwards.
  const subfields = (arg('--subfields') || '').split(',').filter(Boolean);
  if (subfields.length) {
    const LIC = 'primary_location.license:cc-by|cc-by-nc|cc-by-nc-nd|cc-by-nc-sa|cc-by-sa|cc-by-nd|cc0';
    for (const sf of subfields) {
      let cursor = '*', pages = 0, fetched = 0, kept = 0, total = 0;
      while (cursor && pages < maxPages) {
        const filter = `type:book,open_access.is_oa:true,language:en,from_publication_date:${fromYear}-01-01,${LIC},primary_topic.subfield.id:${sf}`;
        const url = `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&select=${SELECT}&per-page=100&cursor=${encodeURIComponent(cursor)}&mailto=${encodeURIComponent(contact)}${key ? `&api_key=${encodeURIComponent(key)}` : ''}`;
        let body: any = null;
        for (let attempt = 0; attempt < 4 && !body; attempt++) {
          const res = await fetch(url, { headers: { 'User-Agent': `STM Digital Library (mailto:${contact})` }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
          if (res?.ok) body = await res.json().catch(() => null);
          if (!body) { console.error(`  subfield ${sf}: HTTP ${res?.status ?? 'network'} (attempt ${attempt + 1})`); await sleep(3000 * (attempt + 1)); }
        }
        if (!body) break;
        total = body.meta?.count ?? total;
        for (const w of body.results || []) { fetched++; if (seen.has(w.id)) continue; seen.add(w.id); kept++; appendFileSync(file, JSON.stringify({ department: 'subfield', query: `subfield:${sf}`, w }) + '\n'); }
        cursor = body.meta?.next_cursor || ''; pages++; await sleep(300);
      }
      stats[`subfield ${sf}`] = { openalexTotal: total, fetched, newCandidates: kept, pages };
      console.log(`subfield ${sf}: openalex ${total}, fetched ${fetched}, new ${kept}`);
    }
    writeFileSync(join(out, 'harvest-stats-subfields.json'), JSON.stringify({ at: new Date().toISOString(), maxPages, stats }, null, 2));
    console.log(`candidates: ${seen.size} → ${file}`); return;
  }
  for (const dept of ALL_FILL_DEPARTMENTS) {
    if (only && only !== dept) continue;
    if (depts.length && !depts.includes(dept)) continue;
    for (const q of FILL_RULES[dept].queries) {
      let cursor = '*', pages = 0, fetched = 0, kept = 0, total = 0;
      while (cursor && pages < maxPages) {
        const filter = `type:book,open_access.is_oa:true,language:en,from_publication_date:${fromYear}-01-01,title.search:${q.replace(/[,:]/g, ' ')}`;
        const url = `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&select=${SELECT}&per-page=100&cursor=${encodeURIComponent(cursor)}&mailto=${encodeURIComponent(contact)}${key ? `&api_key=${encodeURIComponent(key)}` : ''}`;
        let body: any = null;
        for (let attempt = 0; attempt < 3 && !body; attempt++) {
          const res = await fetch(url, { headers: { 'User-Agent': `STM Digital Library (mailto:${contact})` }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
          if (res?.ok) body = await res.json().catch(() => null); if (body) { /* ok */ } else { console.error(`  ${q}: HTTP ${res?.status ?? 'network'} (attempt ${attempt + 1})`); await sleep(3000 * (attempt + 1)); }
        }
        if (!body) break;
        total = body.meta?.count ?? total;
        for (const w of body.results || []) {
          fetched++;
          if (seen.has(w.id)) continue;
          seen.add(w.id); kept++;
          appendFileSync(file, JSON.stringify({ department: dept, query: q, w }) + '\n');
        }
        cursor = body.meta?.next_cursor || ''; pages++;
        await sleep(300);
      }
      stats[`${dept} / ${q}`] = { openalexTotal: total, fetched, newCandidates: kept, pages };
      console.log(`${dept} / ${q}: openalex ${total}, fetched ${fetched}, new ${kept}`);
    }
  }
  writeFileSync(join(out, 'harvest-stats.json'), JSON.stringify({ at: new Date().toISOString(), maxPages, stats }, null, 2));
  console.log(`candidates: ${seen.size} → ${file}`);
}

async function harvestOtl() {
  const out = arg('--out'); if (!out) { console.error('--out <dir> required'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const file = join(out, 'candidates-otl.ndjson'); writeFileSync(file, '');
  let page = 1, total = 0;
  for (;;) {
    let body: any = null;
    for (let attempt = 0; attempt < 4 && !body; attempt++) {
      const res = await fetch(`${OTL_BASE}?page=${page}`, { headers: { 'User-Agent': `STM Digital Library (mailto:${contact})` }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
      if (res?.ok) body = await res.json().catch(() => null);
      if (!body) { console.error(`  page ${page}: HTTP ${res?.status ?? 'network'} (attempt ${attempt + 1})`); await sleep(3000 * (attempt + 1)); }
    }
    if (!body) { console.error(`stopped at page ${page}`); break; }
    for (const it of body.data || []) { appendFileSync(file, JSON.stringify(it) + '\n'); total++; }
    if (!body.links?.next || !(body.data || []).length) break;
    page++; await sleep(350);
  }
  console.log(`Open Textbook Library: ${total} books, ${page} pages → ${file}`);
}

// ── freeze ────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Held = { t: string; authors: string; year: number | null; kind: string };
async function freeze() {
  const inDir = arg('--in'), idsFile = arg('--ids'), freezeDir = arg('--freeze');
  const targets = (arg('--targets') || '').split('|').filter(Boolean); const floorYear = arg('--min-year') ? Number(arg('--min-year')) : null;
  const yearFrom = Number(arg('--year-from') || 0), yearTo = Number(arg('--year-to') || 9999); const withStage = process.argv.includes('--with-stage');
  if (!inDir || !idsFile) { console.error('usage: books-dept-fill.ts freeze --in <dir> --ids prod-ids.ndjson [--also manifest.gz …] [--freeze <dir>] [--run id]'); process.exit(2); }
  const prod = { isbn: new Set<string>(), doi: new Set<string>(), pid: new Set<string>(), fp: new Set<string>(), byTitle: new Map<string, Held[]>(), minYear: 2001, rows: 0, legacy: 0, extra: 0 };
  const add = (title: string | null | undefined, authors: string | null | undefined, year: number | null | undefined, kind: string) => {
    const tk = titleKey(title); if (!tk) return; const l = prod.byTitle.get(tk) || []; l.push({ t: String(title), authors: String(authors || ''), year: year ?? null, kind }); prod.byTitle.set(tk, l);
  };
  for await (const line of createInterface({ input: createReadStream(idsFile) })) {
    const o = JSON.parse(line);
    if (o.t === 'state') { prod.minYear = o.v?.bookMinYear ?? 2001; continue; }
    if (o.t === 'b') { prod.rows++; { const i = normaliseIsbn(o.isbn); if (i) { prod.isbn.add(i.isbn13); if (i.isbn10) prod.isbn.add(i.isbn10); } } if (o.doi) prod.doi.add(normaliseDoi(o.doi) || String(o.doi).toLowerCase()); if (o.source && o.sourceRecordId) prod.pid.add(`${o.source}|${o.sourceRecordId}`); if (o.fingerprint) prod.fp.add(o.fingerprint); add(o.title, o.authors, o.year, 'book'); }
    else if (o.t === 'c') { prod.legacy++; add(o.title, o.authors, null, 'legacy'); }
  }
  // Manifests already applied to production after the export was taken.
  for (const f of args('--also')) {
    const plan = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
    for (const r of plan.rows) { prod.extra++; { const i = normaliseIsbn(r.isbn); if (i) { prod.isbn.add(i.isbn13); if (i.isbn10) prod.isbn.add(i.isbn10); } } if (r.doi) prod.doi.add(normaliseDoi(r.doi) || String(r.doi).toLowerCase()); if (r.source && r.sourceRecordId) prod.pid.add(`${r.source}|${r.sourceRecordId}`); if (r.fingerprint) prod.fp.add(r.fingerprint); add(r.row.title, r.row.authors, r.row.year, 'book'); }
  }

  const cands = new Map<string, { c: FillCandidate; hintDept: string; stage?: any }>();
  for (const l of readFileSync(join(inDir, 'candidates.ndjson'), 'utf8').split('\n')) {
    if (!l) continue; const o = JSON.parse(l); const c = candidateFromOpenAlex(o.w, o.query);
    if (c && !cands.has(c.book.sourceRecordId!)) cands.set(c.book.sourceRecordId!, { c, hintDept: o.department });
  }

  const otlFile = arg('--with-otl');
  if (otlFile) for (const l of readFileSync(otlFile, 'utf8').split('\n')) {
    if (!l) continue; const it = JSON.parse(l); const nb = normaliseOtlBook('OpenTextbookLibrary', it); if (!nb) continue;
    const c: FillCandidate = { book: nb, evidence: { openalexId: String(nb.sourceRecordId), licenceSlug: it.license ?? null, licenceLocation: { source: 'Open Textbook Library', type: 'ebook platform', rawType: 'book', url: nb.externalUrl }, topics: nb.subjects, fields: [], query: 'otl' } };
    cands.set(`otl:${nb.sourceRecordId}`, { c, hintDept: 'otl' });
  }
  // DOAB / OAPEN books already harvested into the scratch database: they carry their own title-level licence and subject codes. Judged by the same rule.
  if (withStage) {
    const rowsStage: any[] = await db.$queryRawUnsafe(`select * from "Book" where metadata ? 'harvest' and source in ('DOAB','OAPEN')`);
    for (const r of rowsStage) {
      const h = r.metadata?.harvest || {};
      const book = { provider: r.source, sourceRecordId: r.sourceRecordId, title: r.title, authors: r.authors, editors: null, publisherName: r.publisherName, year: r.year, doi: normaliseDoi(r.doi), isbns: r.isbn ? [r.isbn] : [], language: r.language,
        description: r.description, subjects: Array.isArray(h.keywords) ? h.keywords.map(String) : [], classifications: Array.isArray(h.classifications) ? h.classifications.map(String) : [], pages: null, lcc: [], edition: r.edition, country: null, coverUrl: null,
        landingUrl: r.originalUrl, externalUrl: r.originalUrl, fileUrl: null, licence: canonicalLicence(r.licence), licenceBasis: 'title' as const, modified: null, deleted: false, extra: {} };
      const c: FillCandidate = { book: book as any, evidence: { openalexId: r.sourceRecordId, licenceSlug: r.licence, licenceLocation: { source: r.source, type: 'ebook platform', rawType: 'book', url: r.originalUrl }, topics: book.subjects, fields: [], query: 'stage' } };
      cands.set(`stage:${r.id}`, { c, hintDept: 'stage', stage: r });
    }
  }

  type V = { c: FillCandidate; department: FillDepartment | null; checks: string[]; reasons: string[]; stage?: any };
  const verdicts: V[] = [];
  for (const { c, stage } of cands.values()) {
    const j = judgeFill(c, floorYear ?? prod.minYear, targets.length ? targets : undefined);
    if (j.department && (c.book.year! < yearFrom || c.book.year! > yearTo)) continue;   // another run's year band
    const reasons = [...j.reasons];
    // The application's own publication gate, as for every other book (the department confidence is not an input here: the rule above decided it).
    if (j.department) {
      const row = stage ? { ...stage, domain: j.department, accessStatus: stage.accessStatus, pdfUrl: null } : fillRow(c, j.department, j);
      const gate = await bookPublicationEligibility({
        id: 'x', title: row.title, status: 'Draft', ownershipSource: 'Ingested', source: row.source, year: row.year, licence: row.licence, licenceIsNC: row.licenceIsNC,
        rightsBasis: row.rightsBasis, rightsStatus: row.rightsStatus, accessStatus: row.accessStatus, rejectionNote: null, originalUrl: row.originalUrl, pdfUrl: null,
        doi: row.doi, isbn: null, fingerprint: row.fingerprint, domain: j.department, hasLicenceFill: false,
      } as any, j.department, floorYear ?? prod.minYear, { checkDuplicates: false });
      if (!gate.ok) reasons.push(`gate:${gate.reason}${gate.detail ? ` (${String(gate.detail).slice(0, 60)})` : ''}`); else j.checks.push(...(gate.checks || []).map(x => `gate:${x}`));
    }
    // Already held in production, any status, or in the legacy collection.
    if (j.department) {
      const b = c.book, held: string[] = [];
      if (b.doi && prod.doi.has(b.doi)) held.push('doi');
      if (prod.pid.has(`${b.provider}|${b.sourceRecordId}`)) held.push('source_id');
      { const i = normaliseIsbn(b.isbns[0]); if (i && (prod.isbn.has(i.isbn13) || (i.isbn10 && prod.isbn.has(i.isbn10)))) held.push('isbn'); }
      if (stage?.fingerprint && prod.fp.has(stage.fingerprint)) held.push('fingerprint');
      for (const e of prod.byTitle.get(titleKey(b.title)) || []) { if (authorsCompatible(b.authors, e.authors)) { held.push(`title+author:${e.kind}`); break; } }
      if (held.length) reasons.push(`already_held:${held.join('+')}`); else j.checks.push('not_held');
    }
    verdicts.push({ c, stage, department: reasons.length ? null : j.department, checks: j.checks, reasons });
  }
  // duplicates inside the set (two OpenAlex works for one book: a publisher record and a repository copy)
  const winners = new Map<string, V>();
  const rank = (v: V) => (v.c.book.doi ? 0 : 5) + (v.c.book.authors ? 0 : 3) + (v.c.book.description ? 0 : 1);
  for (const v of [...verdicts.filter(x => x.department)].sort((a, b) => rank(a) - rank(b) || String(a.c.book.sourceRecordId).localeCompare(String(b.c.book.sourceRecordId)))) {
    const tk = titleKey(v.c.book.title); let dup: V | undefined;
    for (const w of winners.values()) if (titleKey(w.c.book.title) === tk && authorsCompatible(w.c.book.authors, v.c.book.authors)) { dup = w; break; }
    if (v.c.book.doi && winners.has(`doi:${v.c.book.doi}`)) dup = winners.get(`doi:${v.c.book.doi}`);
    if (dup) { v.reasons.push(`duplicate_in_set_of:${dup.c.book.sourceRecordId}`); v.department = null; } else { winners.set(v.c.book.sourceRecordId!, v); if (v.c.book.doi) winners.set(`doi:${v.c.book.doi}`, v); }
  }

  const eligible = verdicts.filter(v => v.department && !v.reasons.length), held = verdicts.filter(v => !(v.department && !v.reasons.length));
  const count = <T,>(xs: T[], f: (x: T) => string) => { const m: Record<string, number> = {}; for (const x of xs) { const k = f(x); m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
  const report = {
    productionBooks: prod.rows, productionLegacyBooks: prod.legacy, alsoApplied: prod.extra, bookMinYear: prod.minYear,
    candidates: verdicts.length, eligible: eligible.length, eligibleByDepartment: count(eligible, v => v.department!),
    eligibleLicences: count(eligible, v => v.c.book.licence || '-'), eligibleYears: count(eligible, v => String(v.c.book.year)),
    held: held.length, heldByFirstReason: count(held, v => (v.reasons[0] || '').replace(/[:(].*$/, '')),
    heldDetail: count(held, v => v.reasons[0] || ''),
  };
  const { heldDetail, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
  if (!freezeDir) return;

  mkdirSync(freezeDir, { recursive: true });
  const runId = arg('--run') || `book-dept-fill-${new Date().toISOString().slice(0, 10)}-${createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 8)}`;
  const stageRow = (v: V) => { const { id, createdAt, updatedAt, publisherId, ...rest } = v.stage; return { ...rest, status: 'Published', domain: v.department, pdfUrl: null, metadata: { ...(rest.metadata || {}), harvest: { ...(rest.metadata?.harvest || {}), department: { band: 'strong', rule: 'dept-fill:classifier+licence', checks: v.checks, query: 'stage' } } } }; };
  const rows = eligible.map(v => { if (v.stage) { const row: any = stageRow(v); return { source: row.source, sourceRecordId: row.sourceRecordId, doi: row.doi, isbn: row.isbn, fingerprint: row.fingerprint, row: JSON.parse(JSON.stringify(row)) }; } const row = fillRow(v.c, v.department!, { department: v.department, checks: v.checks, reasons: [] }); return { source: row.source, sourceRecordId: row.sourceRecordId, doi: row.doi, isbn: null, fingerprint: row.fingerprint, row: JSON.parse(JSON.stringify(row)) }; });
  const plan = { runId, createdAt: new Date().toISOString(), bookMinYear: prod.minYear, count: rows.length, rows };
  const planJson = JSON.stringify(plan), sha = createHash('sha256').update(planJson).digest('hex');
  writeFileSync(join(freezeDir, 'manifest-frozen.json.gz'), gzipSync(planJson));
  writeFileSync(join(freezeDir, 'manifest-frozen.sha256'), `${sha}  manifest-frozen.json (uncompressed JSON, ${planJson.length} bytes, ${rows.length} rows)\n`);
  writeFileSync(join(freezeDir, 'evidence.json.gz'), gzipSync(JSON.stringify(eligible.map(v => ({ id: v.c.book.sourceRecordId, title: v.c.book.title, department: v.department, checks: v.checks, ...v.c.evidence })))));
  writeFileSync(join(freezeDir, 'held.json.gz'), gzipSync(JSON.stringify(held.map(v => ({ id: v.c.book.sourceRecordId, title: v.c.book.title, year: v.c.book.year, doi: v.c.book.doi, licence: v.c.evidence.licenceSlug, topics: v.c.evidence.topics, reasons: v.reasons })))));
  writeFileSync(join(freezeDir, 'report.json'), JSON.stringify({ runId, sha256: sha, ...report }, null, 2));
  const md = ['# Sample for a person to read before anything is written', '', `Run ${runId} · ${rows.length} books · sha256 ${sha}`, ''];
  for (const d of DEPT_FILL_DEPARTMENTS) {
    const list = eligible.filter(v => v.department === d);
    md.push(`## ${d} (${list.length})`, '', '| Title | Year | Licence | Topic | Host |', '|---|---|---|---|---|');
    for (const v of list) md.push(`| ${v.c.book.title.replace(/\|/g, '/')} | ${v.c.book.year} | ${v.c.book.licence} | ${v.c.evidence.topics[0] || ''} | ${v.c.evidence.licenceLocation?.source || ''} |`);
    md.push('');
  }
  writeFileSync(join(freezeDir, 'sample.md'), md.join('\n'));
  console.log(`\nFROZEN ${rows.length} books → ${freezeDir}\nrunId ${runId}\nsha256 ${sha}`);
}

if (mode === 'harvest') await harvest(); else if (mode === 'harvest-otl') await harvestOtl(); else if (mode === 'freeze') await freeze(); else { console.error('usage: books-dept-fill.ts harvest|freeze …'); process.exit(2); }
await db.$disconnect();
