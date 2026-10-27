/**
 * Phase 2F, first deliverable: the READ-ONLY Open Library / Internet Archive FULL-TEXT ELIGIBILITY audit of the Books we hold from Open Library.
 *
 *   npx tsx scripts/ol-fulltext-audit.ts [--source OpenLibraryDump,OpenLibrary] [--limit N] [--max-requests N] [--gap-ms N] [--json <file>] [--previous <report.json>]
 *
 * Reads DATABASE_URL (locally .env) inside READ ONLY transactions and asks two public APIs for small JSON, politely (1 request per 1.1 s by default, batches of 20, a hard request
 * budget, backoff, Retry-After, and a stop after repeated failures). It writes NOTHING: no Book, no checkpoint, no provider-health row — fingerprints of the Book table and of the
 * continuous-engine state are taken before and after to show nothing moved. It never downloads a book file. Prints which database it measured (host, port, name; never the password).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
if (!process.env.DATABASE_URL) { const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8')); if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, ''); }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
const A = await import('../src/lib/ingestion/books/olFulltextAudit.js');
const L = await import('../src/lib/ingestion/books/olFulltext.js');
const u = new URL(process.env.DATABASE_URL);
const n0 = (n: number) => Number(n).toLocaleString('en-US'); const pct = (a: number, b: number) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');

const WATCH: [string, string][] = [
  ['every Book column (status, department, licence, access, rights, file address, …)', `select md5(coalesce(string_agg(b::text, E'\\n' order by id), '')) h from "Book" b`],
  ['provider health rows', `select md5(coalesce(string_agg(s::text, E'\\n' order by source), '')) h from "IngestionSourceHealth" s`],
  ['engine settings and checkpoints (AppSetting ingestion.*)', `select md5(coalesce(string_agg(concat_ws('|', key, value::text), E'\\n' order by key), '')) h from "AppSetting" where key like 'ingestion.%'`],
  ['department sweeps', `select md5(coalesce(string_agg(d::text, E'\\n' order by id), '')) h from "DepartmentSweep" d`],
  ['Article / Journal / Chapter / Publisher counts', `select (select count(*) from "Article")::text || '/' || (select count(*) from "Journal")::text || '/' || (select count(*) from "Chapter")::text || '/' || (select count(*) from "Publisher")::text h`],
];
const fingerprint = async () => A.readOnly(db as any, async tx => { const o: string[] = []; for (const [, sql] of WATCH) o.push((await tx.$queryRawUnsafe(sql))[0].h); return o; });

console.log(`database: ${u.hostname}:${u.port || 5432}${u.pathname}   (read-only; nothing is written)`);
const before = await fingerprint();
const sources = (opt('--source') ?? '').split(',').map(s => s.trim()).filter(Boolean);
const t0 = Date.now();
const r = await A.runAudit(db as any, { sources: sources.length ? sources : undefined, limit: opt('--limit') ? Number(opt('--limit')) : undefined, maxRequests: opt('--max-requests') ? Number(opt('--max-requests')) : undefined, gapMs: opt('--gap-ms') ? Number(opt('--gap-ms')) : undefined });
const after = await fingerprint();

console.log(`\n== SCOPE ==\n  sources                                  ${r.sources.join(', ')}\n  Books held from them                     ${n0(r.booksInScope)}\n  Books audited                            ${n0(r.booksAudited)}${r.incomplete ? '   INCOMPLETE — ' + r.incompleteReasons.join('; ') : ''}`);
console.log(`\n== VERDICTS (every Book is in exactly one) ==`);
for (const c of L.CATEGORIES) console.log(`  ${String(r.counts[c]).padStart(7)}  ${pct(r.counts[c], r.booksAudited).padStart(6)}  ${c.padEnd(26)} ${L.CATEGORY_LABEL[c]}`);
console.log(`\n  matched to Open Library / the Internet Archive    ${n0(r.matched)}\n  openly readable (any licence)                     ${n0(r.readable)}\n  FULL-TEXT CANDIDATES (explicit reuse licence)     ${n0(r.counts.reuseSafe)}`);
console.log(`  licences of the candidates / of the restricted: ${JSON.stringify(r.licences)}\n  notes (information only; never a verdict): ${JSON.stringify(r.notes)}`);
console.log(`\n== ESTIMATED FULL-TEXT CANDIDATES BY DEPARTMENT ==`);
const cand = Object.entries(r.candidatesByDepartment).sort((a, b) => b[1] - a[1]); console.log(cand.length ? cand.map(([d, n]) => `  ${String(n).padStart(6)}  ${d}`).join('\n') : '  none');
console.log(`\n== BY DEPARTMENT (all verdicts) ==`);
for (const [d, c] of Object.entries(r.byDepartment).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) console.log(`  ${d.padEnd(34)} ${L.CATEGORIES.filter(k => c[k]).map(k => `${k} ${c[k]}`).join(' · ')}`);
console.log(`\n== REQUESTS ==\n  ${JSON.stringify(r.requests)}   (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log(`\n== SAMPLES (bounded: ${25} each; first 3 shown) ==`);
for (const c of L.CATEGORIES) if (r.samples[c].length) console.log(`  ${c}: ${JSON.stringify(r.samples[c].slice(0, 3))}`);
const prevPath = opt('--previous');
if (prevPath) { const prev = JSON.parse(readFileSync(prevPath, 'utf8')); const d = A.diffReports(prev, r); console.log(`\n== CHANGED SINCE ${prevPath} ==\n  ${d.length} Book(s)${d.length ? ': ' + JSON.stringify(d.slice(0, 10)) : ''}`); }
console.log(`\n== SAFETY ==\n  reportHash ${r.reportHash}`);
WATCH.forEach(([label], i) => console.log(`  ${before[i] === after[i] ? 'UNCHANGED' : 'CHANGED  '}  ${label}  ${before[i].slice(0, 10)} → ${after[i].slice(0, 10)}`));
const out = opt('--json'); if (out) { writeFileSync(out, JSON.stringify(r)); console.log(`  report written to ${out}`); }
await db.$disconnect(); process.exit(before.every((h, i) => h === after[i]) ? 0 : 3);
