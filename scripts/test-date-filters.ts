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

const mkUser = async (role: string, n = 0) => {
  const u = await db.user.create({ data: { email: `${role.toLowerCase()}-df-${RUN}${n ? `-${n}` : ''}@api-test.invalid`, password: 'x', role } });
  const sid = `sid-df-${RUN}-${role}${n ? `-${n}` : ''}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role, email: u.email }, SECRET, { expiresIn: '1h' });
};
const adminTok = await mkUser('SuperAdmin');
// The server limits requests PER MEMBER (1,200 in 15 minutes, server.ts apiLimiter) and this suite makes more than that. The production limit stays as it is; the suite
// spreads its calls over a few throwaway admins, so the result no longer depends on how fast the machine happens to be.
const adminPool = [adminTok, ...(await Promise.all([1, 2, 3].map(n => mkUser('SuperAdmin', n))))];
let poolAt = 0;
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
const A = (p: string) => call(p, adminPool[poolAt++ % adminPool.length]);

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
type Seed = { dept: string | null; phase: 'Books' | 'Articles' | 'Journals'; source: string; at: Date; added?: number; accepted?: number; error?: string; journal?: string; held?: number; review?: number; writeFailed?: number };
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
// Dental · a source that did not answer (a PROVIDER failure) and books that failed to write (a catalogue failure) — counted apart
for (const [off, hh, mm, ss] of [[0, 0, 0, 5], [-1, 23, 59, 55], [-3, 12, 0, 0], [-40, 12, 0, 0]] as const) {
  S('Dental', 'Journals', 'DOAJ', off, hh, mm, ss, { accepted: 0, error: 'Provider request failed — DOAJ did not answer' });
  S('Dental', 'Books', 'DOAB', off, hh, mm + 1, ss, { added: 0, writeFailed: 1 });
}
// Isolated runs (a source nothing else uses) so their figures can be checked in absolute terms, not as a change
const ISO_SRC = `Iso-${RUN}`;
S('Commerce', 'Articles', ISO_SRC, -5, 10, 0, 0, { added: 37, held: 4, review: 2, journal: 'commerce' });   // the known article run on one day
S('Commerce', 'Books', ISO_SRC, -7, 15, 0, 0, { added: 5, writeFailed: 1 });                               // two days earlier, with a failure; the day between has nothing
// A run with no department anywhere
S(null, 'Books', 'OAPEN', -1, 12, 0, 0, { added: 50 });

type Want = { runs: number; booksAdded: number; articlesAdded: number; journalsAccepted: number; failedRuns: number; providerFailures: number };
type Combo = { name: string; dept: string | null; phase: string | null; source: string | null; result: string | null };
const COMBOS: Combo[] = [
  { name: 'Architecture + Books + DOAB', dept: 'Architecture', phase: 'books', source: 'DOAB', result: null },
  { name: 'Architecture + Books + DOAB + Added', dept: 'Architecture', phase: 'books', source: 'DOAB', result: 'added' },
  { name: 'Architecture + Books + OAPEN', dept: 'Architecture', phase: 'books', source: 'OAPEN', result: null },
  { name: 'Commerce + Articles', dept: 'Commerce', phase: 'articles', source: null, result: null },
  { name: 'Dental + Failed', dept: 'Dental', phase: null, source: null, result: 'failed' },
  { name: 'All departments + all types', dept: null, phase: null, source: null, result: null },
  { name: 'Dental + Provider issues', dept: 'Dental', phase: null, source: null, result: 'provider' },
];
const expected = (c: Combo, r: Rg): Want => {
  const w: Want = { runs: 0, booksAdded: 0, articlesAdded: 0, journalsAccepted: 0, failedRuns: 0, providerFailures: 0 };
  for (const s of seeds) {
    const day = istDay(s.at.getTime());
    if (r.from && (day < r.from || day > r.to!)) continue;
    if (c.dept && s.dept !== c.dept) continue;
    if (c.phase && s.phase.toLowerCase() !== c.phase) continue;
    if (c.source && s.source !== c.source) continue;
    if (c.result === 'added' && !((s.added || 0) > 0 || (s.accepted || 0) > 0)) continue;
    if (c.result === 'failed' && !s.writeFailed) continue;
    if (c.result === 'provider' && !s.error) continue;
    w.runs++;
    if (s.phase === 'Books') w.booksAdded += s.added || 0;
    if (s.phase === 'Articles') w.articlesAdded += s.added || 0;
    w.journalsAccepted += s.accepted || 0;
    if (s.writeFailed) w.failedRuns++;
    if (s.error) w.providerFailures++;
  }
  return w;
};
const dayLabelFull = (d: string) => `${d.slice(8)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const filterQs = (c: Combo) => `${c.dept ? `&department=${encodeURIComponent(c.dept)}` : ''}${c.phase ? `&phase=${c.phase}` : ''}${c.source ? `&source=${encodeURIComponent(c.source)}` : ''}${c.result ? `&result=${c.result}` : ''}`;
const summary = async (c: Combo, r: Rg, extra = '') => (await A(`/api/admin/ingest/department-metrics?${r.q}${filterQs(c)}${extra}`)).data;
const pick = (i: any): Want => ({ runs: i.runs, booksAdded: i.booksAdded, articlesAdded: i.articlesAdded, journalsAccepted: i.journalsAccepted, failedRuns: i.failedRuns, providerFailures: i.providerFailures });
const delta = (a: Want, b: Want): Want => ({ runs: a.runs - b.runs, booksAdded: a.booksAdded - b.booksAdded, articlesAdded: a.articlesAdded - b.articlesAdded, journalsAccepted: a.journalsAccepted - b.journalsAccepted, failedRuns: a.failedRuns - b.failedRuns, providerFailures: a.providerFailures - b.providerFailures });
/** Every row the list would show for these filters, page by page, the way "Load older runs" does. */
const allRows = async (c: Combo, r: Rg, limit = 200) => {
  const rows: any[] = []; let before: string | null = null; let pages = 0;
  for (;;) {
    const res: any = await A(`/api/admin/ingest/history?${r.q}${filterQs(c)}&limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    if (res.status !== 200) throw new Error(`history ${res.status}`);
    rows.push(...res.data.runs); pages++;
    if (!res.data.nextBefore || pages > 1000) break;
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
  check('a custom range in one month reads “01–12 Oct 2026”', multi.label === '01–12 Oct 2026', multi.label);
  check('a range across two months names both', (await hd('range=custom&from=2026-09-28&to=2026-10-05')).label === '28 Sep–05 Oct 2026');
  check('a custom single day reads “12 Oct 2026”', (await hd('range=custom&from=2026-10-12&to=2026-10-12')).label === '12 Oct 2026');
  check('a range across a year end names both years', (await hd('range=custom&from=2025-12-30&to=2026-01-02')).label === '30 Dec 2025–02 Jan 2026');
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
      added: s.phase === 'Journals' ? 0 : (s.added || 0), journalsAccepted: s.accepted || 0, error: s.error || null, skippedHeld: s.held || 0, needsReview: s.review || 0, skippedFailed: s.writeFailed || 0, at: s.at, note: `DF ${RUN}`,
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
      const provider = (x: any) => x.error && x.skippedFailed === 0 && (/^Provider request failed/.test(x.error) || /(did not answer|answered http|fetch failed|timed? ?out|aborted|paused after repeated|rate.?limit|econn|enotfound|etimedout|socket hang up|stopped answering|is resting)/i.test(x.error));
      const failed = rows.filter((x: any) => x.skippedFailed > 0 || x.phase === 'Error' || (x.error && !provider(x))).length;
      const providerN = rows.filter(provider).length;
      check(`${c.name} · ${r.name}: ${rows.length} listed row(s) add up to the summary`,
        rows.length === s.ingestion.runs && sum('Books', 'added') === s.ingestion.booksAdded && sum('Articles', 'added') === s.ingestion.articlesAdded && sum('Journals', 'journalsAccepted') === s.ingestion.journalsAccepted && failed === s.ingestion.failedRuns && providerN === s.ingestion.providerFailures);
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

  section('By day reconciles with the summary, column for column');
  const spanDays = (r: Rg) => (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / DAY + 1;
  for (const c of COMBOS) {
    for (const r of RANGES) {
      const s = await summary(c, r, '&byDay=1');
      const sum = (k: string) => s.byDay.reduce((n: number, d: any) => n + d[k], 0);
      check(`${c.name} · ${r.name}: Books, Articles, Journals, Held, Failed, Provider issues and Review each add up to the summary`,
        sum('books') === s.ingestion.booksAdded && sum('articles') === s.ingestion.articlesAdded && sum('journals') === s.ingestion.journalsAccepted && sum('held') === s.ingestion.held && sum('failedRuns') === s.ingestion.failedRuns && sum('providerFailures') === s.ingestion.providerFailures && sum('sentToReview') === s.ingestion.sentToReview);
      if (r.from) {
        check(`${c.name} · ${r.name}: one row for every day in the range (${spanDays(r)}), oldest first, none outside it`,
          s.byDay.length === spanDays(r) && s.byDay[0].day === r.from && s.byDay[s.byDay.length - 1].day === r.to && s.byDay.every((d: any, i: number, a: any[]) => i === 0 || a[i - 1].day < d.day));
      } else {
        check(`${c.name} · ${r.name}: only days on which something ran, newest first`, s.byDay.every((d: any, i: number, a: any[]) => (i === 0 || a[i - 1].day > d.day)) && s.byDay.every((d: any) => d.runs > 0));
      }
    }
  }
  const bd = (await summary(arch, RANGES[4], '&byDay=1')).byDay;
  const dayOf = (off: number) => dayPlus(TODAY, off);
  const rowFor = (day: string) => bd.find((d: any) => d.day === day)?.books;
  const baseDay = async (off: number) => {
    const day = dayOf(off);
    const own = await db.$queryRawUnsafe(`select coalesce(sum(added),0)::int n from "IngestionRun" r where phase='Books' and source='DOAB' and note is distinct from 'DF ${RUN}' and department='Architecture' and not exists (select 1 from "IngestionRunDepartmentStat" s where s."runId" = r.id) and to_char("at" + interval '330 minutes','YYYY-MM-DD') = $1`, day);
    const broken = await db.$queryRawUnsafe(`select coalesce(sum(s.added),0)::int n from "IngestionRunDepartmentStat" s join "IngestionRun" r on r.id = s."runId" where r.phase='Books' and r.source='DOAB' and r.note is distinct from 'DF ${RUN}' and s.department='Architecture' and to_char(r."at" + interval '330 minutes','YYYY-MM-DD') = $1`, day);
    return own[0].n + broken[0].n;
  };
  check('yesterday’s date holds both yesterday runs (the 23:59:55 one and the 12:00 one)', rowFor(dayOf(-1)) === 5 + 7 + await baseDay(-1), `${rowFor(dayOf(-1))}`);
  check('the 00:00:05 run lands on today’s date', rowFor(dayOf(0)) === 3 + await baseDay(0), `${rowFor(dayOf(0))}`);

  section('A. A single day with no Books added: zero in the summary, in By day and in the list');
  const quiet = await (async () => {
    for (let off = -20; off >= -80; off--) {
      const d = dayOf(off);
      const n = (await db.$queryRawUnsafe(`select count(*)::int n from "IngestionRun" where phase = 'Books' and to_char("at" + interval '330 minutes','YYYY-MM-DD') = $1`, d))[0].n;
      if (n === 0) return d;
    }
    return null;
  })();
  if (!quiet) console.log('  SKIP  no Books-free day found in the scratch database');
  else {
    const rq: Rg = { name: 'quiet', q: `range=custom&from=${quiet}&to=${quiet}`, from: quiet, to: quiet };
    for (const c of [{ ...COMBOS[5], phase: 'books', name: 'All + Books' }, COMBOS[0], COMBOS[1]]) {
      const s = await summary(c, rq, '&byDay=1');
      check(`${quiet} · ${c.name}: Books added is 0 in the summary and in By day`, s.ingestion.booksAdded === 0 && s.byDay.length === 1 && s.byDay[0].books === 0 && s.range.label === dayLabelFull(quiet));
      check(`${quiet} · ${c.name}: the list has no row from any other date`, (await allRows(c, rq)).rows.length === 0);
    }
    const life = await summary(COMBOS[5], RANGES[0]);
    check('…and the Lifetime totals are not what that day shows', life.ingestion.booksAdded > 0 && (await summary({ ...COMBOS[5], phase: 'books' }, rq)).ingestion.booksAdded === 0);
  }

  section('B and C. Known runs on isolated source: exact summary, and three days that add up');
  const iso: Combo = { name: 'isolated', dept: null, phase: null, source: ISO_SRC, result: null };
  const dB = dayOf(-5), dA = dayOf(-7), dMid = dayOf(-6);
  const sB = await summary(iso, { name: 'b', q: `range=custom&from=${dB}&to=${dB}`, from: dB, to: dB }, '&byDay=1');
  check('B: the single day shows exactly the one article run (37 added, 4 held, 2 for review, no failure)', sB.ingestion.runs === 1 && sB.ingestion.articlesAdded === 37 && sB.ingestion.booksAdded === 0 && sB.ingestion.held === 4 && sB.ingestion.sentToReview === 2 && sB.ingestion.failedRuns === 0, JSON.stringify(sB.ingestion));
  check('B: Show by day gives the same single row', sB.byDay.length === 1 && sB.byDay[0].articles === 37 && sB.byDay[0].held === 4 && sB.byDay[0].sentToReview === 2);
  const r3: Rg = { name: 'three', q: `range=custom&from=${dA}&to=${dB}`, from: dA, to: dB };
  const s3 = await summary(iso, r3, '&byDay=1');
  check('C: the 3-day range has one row per day, the middle day a plain 0', s3.byDay.length === 3 && same(s3.byDay.map((d: any) => d.day), [dA, dMid, dB]) && s3.byDay[1].books === 0 && s3.byDay[1].articles === 0 && s3.byDay[1].held === 0, JSON.stringify(s3.byDay));
  check('C: the daily rows add up to the summary (5 books, 37 articles, 4 held, 1 failed, 2 for review)', s3.ingestion.booksAdded === 5 && s3.ingestion.articlesAdded === 37 && s3.ingestion.held === 4 && s3.ingestion.failedRuns === 1 && s3.ingestion.sentToReview === 2 && s3.byDay.reduce((n: number, d: any) => n + d.books + d.articles, 0) === 42);
  check('C: the list shows those two runs and nothing else', (await allRows(iso, r3)).rows.length === 2 && (await allRows(iso, { name: 'x', q: `range=custom&from=${dMid}&to=${dMid}`, from: dMid, to: dMid })).rows.length === 0);
  check('C: Lifetime on the same source returns the same two runs (historical totals come back)', (await summary(iso, RANGES[0])).ingestion.runs === 2);

  section('Unattributed activity stays apart from the department');
  const UN_SRC = `Unat-${RUN}`;
  await db.ingestionRun.create({ data: { phase: 'Books', source: UN_SRC, department: null, added: 61, at: istAt(-2, 11, 0, 0), note: `DF ${RUN}` } });       // no department recorded
  await db.ingestionRun.create({ data: { phase: 'Books', source: UN_SRC, department: 'Architecture', added: 3, at: istAt(-2, 11, 30, 0), note: `DF ${RUN}` } });
  const d2 = dayOf(-2), r2: Rg = { name: 'two', q: `range=custom&from=${d2}&to=${d2}`, from: d2, to: d2 };
  const un = await summary({ name: 'un', dept: 'Architecture', phase: null, source: UN_SRC, result: null }, r2, '&byDay=1');
  check('Architecture shows only its own 3 books — the 61 with no department are not added to it', un.ingestion.booksAdded === 3 && un.ingestion.runs === 1 && un.byDay[0].books === 3, JSON.stringify(un.ingestion));
  check('…and are reported separately as unattributed', un.unattributed.booksAdded === 61 && un.unattributed.runs === 1);
  const unAll = await summary({ name: 'unAll', dept: null, phase: null, source: UN_SRC, result: null }, r2, '&byDay=1');
  check('All departments counts both (64): it is every run in the library', unAll.ingestion.booksAdded === 64 && unAll.unattributed === null && unAll.byDay[0].books === 64);
  check('the list under Architecture does not show the department-less run', (await allRows({ name: 'x', dept: 'Architecture', phase: null, source: UN_SRC, result: null }, r2)).rows.length === 1);

  section('The range echoed back is the range applied (the screen refuses an answer that does not say so)');
  for (const r of [RANGES[0], RANGES[1], RANGES[6], RANGES[7]]) {
    const m = (await A(`/api/admin/ingest/department-metrics?${r.q}`)).data.range, h = (await A(`/api/admin/ingest/history?${r.q}&limit=1`)).data.range;
    const key = r.q.match(/range=(\w+)/)![1];
    check(`${r.name}: summary and list both echo it`, m.key === key && h.key === key && (key !== 'custom' || (m.fromDay === r.from && m.toDay === r.to && h.fromDay === r.from && h.toDay === r.to)));
  }

  section('Pagination');
  for (const [c, r] of [[COMBOS[5], RANGES[7]], [COMBOS[3], RANGES[4]], [COMBOS[5], RANGES[0]]] as [Combo, Rg][]) {
    const whole = await allRows(c, r, 200);
    // Many small pages, but never so many that the walk hits its page cap: the page size follows how much data the scratch database has accumulated (2 for a small set), so the result does not depend on it.
    const small = await allRows(c, r, Math.max(2, Math.ceil(whole.rows.length / 40)));
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
  check('no runs: every figure is zero (so the screen can say so) and the catalogue is still there', same(pick(e.ingestion), { runs: 0, booksAdded: 0, articlesAdded: 0, journalsAccepted: 0, failedRuns: 0, providerFailures: 0 }) && typeof e.catalogue.books === 'number');
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
