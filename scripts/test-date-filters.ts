/**
 * Date-filter tests: the real Express server on the throwaway database `stm_ingestion_test` (refuses anything else),
 * outbound network blocked by the same preload the other API tests use.
 *
 *   npx tsx scripts/test-date-filters.ts
 *
 * Known runs are seeded at exact India-time moments, including 23:59:55 and 00:00:05 either side of midnight (which fall on
 * different UTC days from their India days). What each filter should show is worked out here, independently, from the seed
 * list and plain YYYY-MM-DD string comparison — then compared with the server. Every figure is also read before seeding, because
 * the scratch database holds rows from other tests. Nothing is deleted.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const PORT = 3103, BASE = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a: any, b: any) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// ── India days, worked out here without the server's code ───────────────────
const IST = 330 * 60_000, DAY = 86_400_000;
const istDay = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const TODAY = istDay(Date.now());
const dayPlus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** An instant: `offset` days from today in India, at hh:mm:ss India time. */
const istAt = (offset: number, hh: number, mm: number, ss: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - IST + offset * DAY + (hh * 3600 + mm * 60 + ss) * 1000);

const mkUser = async (role: string) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-df-${RUN}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-df-${RUN}-${role}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const adminTok = await mkUser('SuperAdmin');
await db.ingestionState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', enabled: false }, update: { enabled: false } });

const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', API_TEST_RUN: RUN, API_TEST_ISSN: '0000-0000', API_TEST_FILE_PORT: '1', INGEST_CATALOGUE_CACHE_MS: '0' },
});
let serverLog = ''; child.stdout!.on('data', d => (serverLog += d)); child.stderr!.on('data', d => (serverLog += d));
const shutdown = async () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch {} await db.$disconnect(); };
const call = async (path: string, token?: string) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data };
};
const A = (p: string) => call(p, adminTok);

// ── Ranges, as the screen sends them, and the days each one means ────────────
type Rg = { name: string; q: string; from: string | null; to: string | null };
const MONTH1 = `${TODAY.slice(0, 8)}01`;
const RANGES: Rg[] = [
  { name: 'Lifetime', q: 'range=lifetime', from: null, to: null },
  { name: 'Today', q: 'range=today', from: TODAY, to: TODAY },
  { name: 'Yesterday', q: 'range=yesterday', from: dayPlus(TODAY, -1), to: dayPlus(TODAY, -1) },
  { name: 'Last 7 days', q: 'range=last7', from: dayPlus(TODAY, -6), to: TODAY },
  { name: 'Last 30 days', q: 'range=last30', from: dayPlus(TODAY, -29), to: TODAY },
  { name: 'This month', q: 'range=month', from: MONTH1, to: TODAY },
  { name: 'Custom single day', q: `range=custom&from=${dayPlus(TODAY, -3)}&to=${dayPlus(TODAY, -3)}`, from: dayPlus(TODAY, -3), to: dayPlus(TODAY, -3) },
  { name: 'Custom multi-day', q: `range=custom&from=${dayPlus(TODAY, -10)}&to=${dayPlus(TODAY, -1)}`, from: dayPlus(TODAY, -10), to: dayPlus(TODAY, -1) },
];

// ── The seed list ────────────────────────────────────────────────────────────
type Seed = { dept: string | null; phase: 'Books' | 'Articles' | 'Journals'; source: string; at: Date; added?: number; accepted?: number; error?: string; journal?: string };
const seeds: Seed[] = [];
const S = (dept: string | null, phase: Seed['phase'], source: string, off: number, hh: number, mm: number, ss: number, extra: Partial<Seed> = {}) =>
  seeds.push({ dept, phase, source, at: istAt(off, hh, mm, ss), ...extra });
// Architecture · DOAB books, either side of India midnight and further back
S('Architecture', 'Books', 'DOAB', 0, 0, 0, 5, { added: 3 });       // 00:00:05 IST today = the previous UTC day
S('Architecture', 'Books', 'DOAB', -1, 23, 59, 55, { added: 5 });   // 23:59:55 IST yesterday
S('Architecture', 'Books', 'DOAB', -1, 12, 0, 0, { added: 7 });
S('Architecture', 'Books', 'DOAB', -3, 12, 0, 0, { added: 11 });
S('Architecture', 'Books', 'DOAB', -10, 12, 0, 0, { added: 13 });
S('Architecture', 'Books', 'DOAB', -40, 12, 0, 0, { added: 17 });
S('Architecture', 'Books', 'OAPEN', -1, 12, 0, 0, { added: 100 });  // same department and kind, another source
// Commerce · articles, attributed through their journal
for (const [off, hh, n] of [[0, 0, 2], [-1, 12, 4], [-3, 12, 6], [-10, 12, 8], [-40, 12, 10]] as const) S('Commerce', 'Articles', 'OpenAlex', off, hh, hh === 0 ? 0 : 0, hh === 0 ? 5 : 0, { added: n, journal: 'commerce' });
// Dental · failed journal discovery
for (const [off, hh, mm, ss] of [[0, 0, 0, 5], [-1, 23, 59, 55], [-3, 12, 0, 0], [-40, 12, 0, 0]] as const) S('Dental', 'Journals', 'DOAJ', off, hh, mm, ss, { accepted: 0, error: 'DOAJ did not answer' });
// A run with no department anywhere
S(null, 'Books', 'OAPEN', -1, 12, 0, 0, { added: 50 });

type Want = { runs: number; booksAdded: number; articlesAdded: number; journalsAccepted: number; failedRuns: number };
type Combo = { name: string; dept: string | null; phase: string | null; source: string | null; result: string | null };
const COMBOS: Combo[] = [
  { name: 'Architecture + Books + DOAB', dept: 'Architecture', phase: 'books', source: 'DOAB', result: null },
  { name: 'Architecture + Books + DOAB + Added', dept: 'Architecture', phase: 'books', source: 'DOAB', result: 'added' },
  { name: 'Architecture + Books + OAPEN', dept: 'Architecture', phase: 'books', source: 'OAPEN', result: null },
  { name: 'Commerce + Articles', dept: 'Commerce', phase: 'articles', source: null, result: null },
  { name: 'Dental + Failed', dept: 'Dental', phase: null, source: null, result: 'failed' },
  { name: 'All departments + all types', dept: null, phase: null, source: null, result: null },
];
const expected = (c: Combo, r: Rg): Want => {
  const w: Want = { runs: 0, booksAdded: 0, articlesAdded: 0, journalsAccepted: 0, failedRuns: 0 };
  for (const s of seeds) {
    const day = istDay(s.at.getTime());
    if (r.from && (day < r.from || day > r.to!)) continue;
    if (c.dept && s.dept !== c.dept) continue;
    if (c.phase && s.phase.toLowerCase() !== c.phase) continue;
    if (c.source && s.source !== c.source) continue;
    if (c.result === 'added' && !((s.added || 0) > 0 || (s.accepted || 0) > 0)) continue;
    if (c.result === 'failed' && !s.error) continue;
    w.runs++;
    if (s.phase === 'Books') w.booksAdded += s.added || 0;
    if (s.phase === 'Articles') w.articlesAdded += s.added || 0;
    w.journalsAccepted += s.accepted || 0;
    if (s.error) w.failedRuns++;
  }
  return w;
};
const filterQs = (c: Combo) => `${c.dept ? `&department=${encodeURIComponent(c.dept)}` : ''}${c.phase ? `&phase=${c.phase}` : ''}${c.source ? `&source=${encodeURIComponent(c.source)}` : ''}${c.result ? `&result=${c.result}` : ''}`;
const summary = async (c: Combo, r: Rg, extra = '') => (await A(`/api/admin/ingest/department-metrics?${r.q}${filterQs(c)}${extra}`)).data;
const pick = (i: any): Want => ({ runs: i.runs, booksAdded: i.booksAdded, articlesAdded: i.articlesAdded, journalsAccepted: i.journalsAccepted, failedRuns: i.failedRuns });
const delta = (a: Want, b: Want): Want => ({ runs: a.runs - b.runs, booksAdded: a.booksAdded - b.booksAdded, articlesAdded: a.articlesAdded - b.articlesAdded, journalsAccepted: a.journalsAccepted - b.journalsAccepted, failedRuns: a.failedRuns - b.failedRuns });
/** Every row the list would show for these filters, page by page, the way "Load older runs" does. */
const allRows = async (c: Combo, r: Rg, limit = 200) => {
  const rows: any[] = []; let before: string | null = null; let pages = 0;
  for (;;) {
    const res: any = await A(`/api/admin/ingest/history?${r.q}${filterQs(c)}&limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    if (res.status !== 200) throw new Error(`history ${res.status}`);
    rows.push(...res.data.runs); pages++;
    if (!res.data.nextBefore || pages > 200) break;
    before = res.data.nextBefore;
  }
  return { rows, pages };
};

try {
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/admin/ingest/state'); if (r.status === 401) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('Validation: a bad range is refused with a reason, on the summary and on the list');
  const bad: [string, string][] = [
    ['From after To', `range=custom&from=${dayPlus(TODAY, -1)}&to=${dayPlus(TODAY, -5)}`],
    ['a date in the future', `range=custom&from=${TODAY}&to=${dayPlus(TODAY, 1)}`],
    ['a missing To', `range=custom&from=${TODAY}`],
    ['not a date', 'range=custom&from=yesterday&to=today'],
    ['an impossible date', 'range=custom&from=2026-02-30&to=2026-03-02'],
    ['before 2020', 'range=custom&from=2019-12-31&to=2020-01-05'],
    ['more than 366 days', `range=custom&from=${dayPlus(TODAY, -400)}&to=${TODAY}`],
    ['an unknown preset', 'range=fortnight'],
  ];
  for (const [what, q] of bad) {
    const a = await A(`/api/admin/ingest/department-metrics?${q}`), b = await A(`/api/admin/ingest/history?${q}`);
    check(`${what}: 400 with a message, on both`, a.status === 400 && !!a.data?.error && b.status === 400 && !!b.data?.error, a.data?.error);
  }
  check('exactly 366 days is accepted', (await A(`/api/admin/ingest/department-metrics?range=custom&from=${dayPlus(TODAY, -365)}&to=${TODAY}`)).status === 200);
  check('today as both ends is accepted', (await A(`/api/admin/ingest/department-metrics?range=custom&from=${TODAY}&to=${TODAY}`)).status === 200);

  section('Headings and labels come from the server, in India days');
  const hd = async (q: string) => (await A(`/api/admin/ingest/department-metrics?${q}`)).data.range;
  check('presets are labelled in words', (await hd('range=today')).label === 'Today' && (await hd('range=yesterday')).label === 'Yesterday' && (await hd('range=last7')).label === 'Last 7 days' && (await hd('range=last30')).label === 'Last 30 days' && (await hd('range=month')).label === 'This month' && (await hd('range=lifetime')).label === 'Lifetime');
  const lab = (d: string) => `${Number(d.slice(8))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1]}`;
  const multi = await hd(`range=custom&from=2026-10-01&to=2026-10-12`);
  check('a custom range reads “1 Oct–12 Oct 2026”', multi.label === '1 Oct–12 Oct 2026', multi.label);
  check('a custom single day reads “12 Oct 2026”', (await hd('range=custom&from=2026-10-12&to=2026-10-12')).label === '12 Oct 2026');
  check('a range across a year end names both years', (await hd('range=custom&from=2025-12-30&to=2026-01-02')).label === '30 Dec 2025–2 Jan 2026');
  check('“Today” covers today’s dates, from India midnight', (await hd('range=today')).fromDay === TODAY && (await hd('range=today')).start === istAt(0, 0, 0, 0).toISOString(), `${(await hd('range=today')).start}`);
  void lab;

  section('Before: read everything, then seed');
  const baseline = new Map<string, Want>();
  const baseCat = new Map<string, any>();
  for (const c of COMBOS) for (const r of RANGES) { const s = await summary(c, r); baseline.set(`${c.name}|${r.name}`, pick(s.ingestion)); }
  const journals: Record<string, string> = {};
  const cj = await db.journal.create({ data: { title: `DF commerce journal ${RUN}`, issn: `6${RUN.slice(-7).padStart(7, '0')}`.slice(0, 8), domain: 'Commerce', status: 'Accepted' } });
  journals.commerce = cj.id;
  for (const s of seeds) {
    await db.ingestionRun.create({ data: {
      phase: s.phase, source: s.source, department: s.journal ? null : s.dept, journalId: s.journal ? journals[s.journal] : null, journalTitle: s.journal ? cj.title : null,
      added: s.phase === 'Journals' ? 0 : (s.added || 0), journalsAccepted: s.accepted || 0, error: s.error || null, at: s.at, note: `DF ${RUN}`,
    } });
  }

  section('Every combination × every range: the summary is exactly what was seeded, and equals the rows listed');
  for (const c of COMBOS) {
    const life = await summary(c, RANGES[0]);
    for (const r of RANGES) {
      const s = await summary(c, r);
      const got = delta(pick(s.ingestion), baseline.get(`${c.name}|${r.name}`)!);
      const want = expected(c, r);
      check(`${c.name} · ${r.name}: change = seeded`, same(got, want), `${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
      // The list and the summary, for the same filters, are the same runs — absolute, no baseline.
      const { rows } = await allRows(c, r);
      const sum = (phase: string, key: string) => rows.filter((x: any) => x.phase === phase).reduce((n: number, x: any) => n + x[key], 0);
      const failed = rows.filter((x: any) => x.skippedFailed > 0 || x.error || x.phase === 'Error').length;
      check(`${c.name} · ${r.name}: ${rows.length} listed row(s) add up to the summary`,
        rows.length === s.ingestion.runs && sum('Books', 'added') === s.ingestion.booksAdded && sum('Articles', 'added') === s.ingestion.articlesAdded && sum('Journals', 'journalsAccepted') === s.ingestion.journalsAccepted && failed === s.ingestion.failedRuns);
      check(`${c.name} · ${r.name}: Current Catalogue unchanged`, same(s.catalogue, life.catalogue));
      // No listed row falls outside the days asked for, in India time.
      if (r.from) check(`${c.name} · ${r.name}: every row’s India date is inside the range`, rows.every((x: any) => { const d = istDay(new Date(x.at).getTime()); return d >= r.from! && d <= r.to!; }));
    }
  }

  section('Midnight in India, not in UTC');
  const arch: Combo = COMBOS[0];
  const todayRows = (await allRows(arch, RANGES[1])).rows.map((x: any) => x.added);
  const yestRows = (await allRows(arch, RANGES[2])).rows.map((x: any) => x.added);
  check('00:00:05 IST today is in Today (and not Yesterday)', todayRows.includes(3) && !yestRows.includes(3));
  check('23:59:55 IST yesterday is in Yesterday (and not Today)', yestRows.includes(5) && !todayRows.includes(5));
  // Partition: thirteen single days add up to the one thirteen-day range — nothing counted twice, nothing lost at midnight.
  for (const c of [COMBOS[0], COMBOS[5]]) {
    let sumDays = 0, sumRuns = 0;
    for (let off = -12; off <= 0; off++) { const d = dayPlus(TODAY, off); const s1 = await summary(c, { name: 'd', q: `range=custom&from=${d}&to=${d}`, from: d, to: d }); sumDays += s1.ingestion.booksAdded; sumRuns += s1.ingestion.runs; }
    const whole = await summary(c, { name: 'w', q: `range=custom&from=${dayPlus(TODAY, -12)}&to=${TODAY}`, from: null, to: null });
    check(`${c.name}: 13 single days add up to the 13-day range`, sumDays === whole.ingestion.booksAdded && sumRuns === whole.ingestion.runs, `${sumRuns} runs / ${sumDays} books vs ${whole.ingestion.runs} / ${whole.ingestion.booksAdded}`);
  }

  section('By day');
  for (const c of [COMBOS[0], COMBOS[3], COMBOS[5]]) {
    for (const r of [RANGES[3], RANGES[4], RANGES[7]]) {
      const s = await summary(c, r, '&byDay=1');
      const tot = (k: string) => s.byDay.reduce((n: number, d: any) => n + d[k], 0);
      check(`${c.name} · ${r.name}: the days add up to the totals`, tot('books') === s.ingestion.booksAdded && tot('articles') === s.ingestion.articlesAdded && tot('journals') === s.ingestion.journalsAccepted);
      check(`${c.name} · ${r.name}: days are India days inside the range, newest first`, s.byDay.every((d: any) => d.day >= r.from! && d.day <= r.to!) && s.byDay.every((d: any, i: number, a: any[]) => i === 0 || a[i - 1].day > d.day));
    }
  }
  const bd = (await summary(arch, RANGES[4], '&byDay=1')).byDay;
  const dayOf = (off: number) => dayPlus(TODAY, off);
  const rowFor = (day: string) => bd.find((d: any) => d.day === day)?.books;
  const baseDay = async (off: number) => { const s = await db.$queryRawUnsafe(`select coalesce(sum(added),0)::int n from "IngestionRun" where phase='Books' and source='DOAB' and note is distinct from 'DF ${RUN}' and (department='Architecture') and to_char("at" + interval '330 minutes','YYYY-MM-DD') = $1`, dayOf(off)); return s[0].n; };
  check('yesterday’s date holds both yesterday runs (the 23:59:55 one and the 12:00 one)', rowFor(dayOf(-1)) === 5 + 7 + await baseDay(-1), `${rowFor(dayOf(-1))}`);
  check('the 00:00:05 run lands on today’s date', rowFor(dayOf(0)) === 3 + await baseDay(0), `${rowFor(dayOf(0))}`);
  check('a day with no activity is left out', !bd.some((d: any) => d.books === 0 && d.articles === 0 && d.journals === 0));

  section('Pagination');
  for (const [c, r] of [[COMBOS[5], RANGES[7]], [COMBOS[3], RANGES[4]], [COMBOS[5], RANGES[0]]] as [Combo, Rg][]) {
    const whole = await allRows(c, r, 200), small = await allRows(c, r, 2);
    const ids = small.rows.map((x: any) => x.id);
    check(`${c.name} · ${r.name}: two at a time gives the same rows as all at once`, whole.rows.length > 2 && same(whole.rows.map((x: any) => x.id), ids), `${whole.rows.length} rows in ${small.pages} pages`);
    check(`${c.name} · ${r.name}: no row appears twice, and newest comes first`, new Set(ids).size === ids.length && small.rows.every((x: any, i: number, a: any[]) => i === 0 || new Date(a[i - 1].at) >= new Date(x.at)));
  }
  // Rows that share a millisecond must not be lost between pages.
  const tieAt = istAt(-2, 9, 0, 0);
  for (let i = 0; i < 5; i++) await db.ingestionRun.create({ data: { phase: 'Books', source: `TieSource-${RUN}`, department: 'Law', added: 1, at: tieAt, note: `DF ${RUN}` } });
  const tie: Combo = { name: 'ties', dept: null, phase: null, source: `TieSource-${RUN}`, result: null };
  const tiePaged = await allRows(tie, RANGES[0], 2);
  check('five runs with the very same timestamp all come through, two per page', tiePaged.rows.length === 5 && new Set(tiePaged.rows.map((x: any) => x.id)).size === 5, `${tiePaged.rows.length} rows in ${tiePaged.pages} pages`);
  check('a bare ISO time as the cursor still works', (await A(`/api/admin/ingest/history?before=${encodeURIComponent(new Date().toISOString())}&limit=1`)).data.runs.length === 1);
  const p1 = (await A(`/api/admin/ingest/history?${RANGES[7].q}&limit=2`)).data, p1b = (await A(`/api/admin/ingest/history?${RANGES[4].q}&limit=2`)).data;
  check('asking for a different range starts again from its own first page', p1.runs.length === 2 && p1b.runs.length === 2 && !same(p1.runs.map((x: any) => x.id), p1b.runs.map((x: any) => x.id)) || p1.nextBefore !== p1b.nextBefore);

  section('Default behaviour is unchanged');
  const noRange = await A('/api/admin/ingest/history?limit=50'), lifetime = await A('/api/admin/ingest/history?range=lifetime&limit=50');
  check('no date given = Lifetime, row for row', same(noRange.data.runs.map((x: any) => x.id), lifetime.data.runs.map((x: any) => x.id)));
  const m0 = (await A('/api/admin/ingest/department-metrics')).data, m1 = (await A('/api/admin/ingest/department-metrics?range=lifetime')).data;
  check('no date given on the summary = Lifetime', same(m0.ingestion, m1.ingestion) && m0.range.key === 'lifetime');
  check('the earlier period=24h and period=7d still answer', (await A('/api/admin/ingest/department-metrics?period=24h')).status === 200 && (await A('/api/admin/ingest/department-metrics?period=7d')).data.range.label === 'Last 7 days');

  section('Source filter');
  const sources = (await A('/api/admin/ingest/run-sources')).data.sources;
  check('the run log’s sources are offered', Array.isArray(sources) && ['DOAB', 'OAPEN', 'OpenAlex', 'DOAJ'].every(s => sources.includes(s)), sources.join(', '));
  const onlyDoab = (await allRows({ ...COMBOS[0], phase: null, result: null }, RANGES[0])).rows;
  check('Source = DOAB lists only DOAB runs', onlyDoab.length > 0 && onlyDoab.every((x: any) => x.source === 'DOAB'));
  check('a source nothing used lists nothing', (await allRows({ ...COMBOS[0], source: 'Nonexistent' }, RANGES[0])).rows.length === 0);
  check('a source with a quote in it is just a name, not SQL', (await A(`/api/admin/ingest/history?source=${encodeURIComponent("x' or 1=1 --")}`)).data.runs.length === 0);

  section('Empty range');
  const nowhere: Combo = { name: 'Dental + Books', dept: 'Dental', phase: 'books', source: 'Nothing used this source', result: null };
  const e = await summary(nowhere, RANGES[1]);
  check('no runs: every figure is zero (so the screen can say so) and the catalogue is still there', same(pick(e.ingestion), { runs: 0, booksAdded: 0, articlesAdded: 0, journalsAccepted: 0, failedRuns: 0 }) && typeof e.catalogue.books === 'number');
  check('…and the list is empty', (await allRows(nowhere, RANGES[1])).rows.length === 0);
  const life = await summary(nowhere, RANGES[0]);
  check('Dental catalogue is the same with and without the empty range', same(e.catalogue, life.catalogue));

  section('Speed');
  const t1 = Date.now(); await summary(COMBOS[5], RANGES[4], '&byDay=1'); const ms1 = Date.now() - t1;
  const t2 = Date.now(); await A(`/api/admin/ingest/history?${RANGES[4].q}&limit=50`); const ms2 = Date.now() - t2;
  check('summary with by-day and a 50-row page each answer in under a second', ms1 < 1000 && ms2 < 1000, `${ms1} ms and ${ms2} ms`);
} catch (e: any) {
  fail++; console.log('  FAIL  test crashed:', e?.message);
  console.log(serverLog.slice(-1500));
} finally {
  await db.userSession.updateMany({ where: { sessionId: { startsWith: `sid-df-${RUN}` } }, data: { revokedAt: new Date() } });
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
