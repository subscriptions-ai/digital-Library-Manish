#!/usr/bin/env node
/**
 * Builds public/STM_Digital_Library_Brochure.pdf — the institutional brochure
 * the "Download Brochure" button on /institutional-access serves.
 *
 *   npm run brochure
 *
 * A4 portrait, four pages, set in Inter with the site's own colours. The text is
 * written here rather than pulled from the database on purpose: a PDF is a fixed
 * document, so it carries no catalogue counts that would be wrong a month later.
 * Contact details are read from src/config.ts so the brochure and the site agree.
 * The only figures in it are the four on page 3, and they are labelled as an
 * illustration.
 *
 * Needs Google Chrome (headless) to print the page. The four Inter weights are
 * fetched once into scripts/brochure/fonts (git-ignored).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public', 'STM_Digital_Library_Brochure.pdf');
const FONT_DIR = path.join(__dirname, 'fonts');
const BUILD_DIR = path.join(__dirname, '.build');

// ── Company details, straight from the site's config ────────────────────────
const cfg = fs.readFileSync(path.join(ROOT, 'src', 'config.ts'), 'utf8');
const pick = (re, what) => {
  const m = cfg.match(re);
  if (!m) throw new Error(`brochure: could not read ${what} from src/config.ts`);
  return m[1];
};
const WEBSITE = pick(/website:\s*"([^"]+)"/, 'website').replace(/\/$/, '');
const EMAIL = pick(/\bemail:\s*"([^"]+)"/, 'email');
const MOBILE = pick(/\bmobile:\s*"([^"]+)"/, 'mobile');
const TEL = pick(/\btel:\s*\["([^"]+)"/, 'tel');
const POSITIONING = pick(/positioning:\s*"([^"]+)"/, 'positioning');
const SITE_HOST = WEBSITE.replace(/^https?:\/\//, '');

// ── Assets ───────────────────────────────────────────────────────────────────
const FONTS = { 400: 'Inter-400.ttf', 500: 'Inter-500.ttf', 600: 'Inter-600.ttf', 700: 'Inter-700.ttf' };
async function ensureFonts() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  if (Object.values(FONTS).every(f => fs.existsSync(path.join(FONT_DIR, f)))) return;
  console.log('Fetching Inter from Google Fonts…');
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700', {
    headers: { 'User-Agent': 'Mozilla/4.0' }, // an old agent is answered with plain .ttf files
  })).text();
  const blocks = css.split('@font-face').slice(1);
  for (const b of blocks) {
    const w = b.match(/font-weight:\s*(\d+)/)?.[1];
    const url = b.match(/url\(([^)]+)\)/)?.[1];
    if (!w || !url || !FONTS[w]) continue;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    fs.writeFileSync(path.join(FONT_DIR, FONTS[w]), buf);
  }
  for (const f of Object.values(FONTS)) if (!fs.existsSync(path.join(FONT_DIR, f))) throw new Error(`brochure: missing font ${f}`);
}
const file = p => 'file://' + p;
const LOGO = file(path.join(ROOT, 'public', 'logo.png'));
const COVER = file(path.join(ROOT, 'public', 'hero', 'reading-room.jpg'));
const QR = fs.readFileSync(path.join(__dirname, 'qr-institutional-access.svg'), 'utf8')
  .replace(/<\?xml[^>]*\?>/, '').replace(/<svg /, '<svg class="qr" ');

// ── Icons (Lucide, the set the site uses) ───────────────────────────────────
const ICONS = {
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  cap: '<path d="M22 10v6"/><path d="M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6z"/>',
  video: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sliders: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  key: '<path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5"/>',
  badge: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  life: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/>',
  flask: '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  present: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const tile = (n, cls = '') => `<span class="tile ${cls}">${icon(n)}</span>`;

// ── Page furniture ───────────────────────────────────────────────────────────
const running = (n, label) => `
  <header class="run">
    <div class="brand"><img src="${LOGO}" alt="" /><span>STM Digital Library</span></div>
    <span class="run-label">${label}</span>
  </header>`;
const foot = n => `
  <footer class="foot">
    <span>${SITE_HOST}</span><span>${EMAIL}</span><span>${TEL}</span><span class="pg">${n} / 4</span>
  </footer>`;

// ── Content ──────────────────────────────────────────────────────────────────
const TYPES = [
  ['library', 'Journals', 'Browse each journal by volume and issue.'],
  ['file', 'Research Articles', 'Articles held under their journal, volume and issue.'],
  ['book', 'Books & E-Books', 'Monographs, textbooks and edited volumes.'],
  ['cap', 'Theses', 'Doctoral and postgraduate research.'],
  ['users', 'Conference Proceedings', 'Papers presented at academic conferences.'],
  ['clip', 'Case Reports', 'Documented cases for study and reference.'],
  ['news', 'Magazines & Periodicals', 'Serials for current awareness and reading.'],
  ['video', 'Educational Videos', 'Lectures and learning videos.'],
];
const FEATURES = [
  ['search', 'Powerful Search', 'One search across the catalogue by title, author, DOI, keyword or subject.'],
  ['sliders', 'Advanced Filters', 'Narrow results by department, content type, subject area and year.'],
  ['layers', 'Subject Discovery', 'Explore by academic department and subject, not only by search term.'],
  ['lock', 'Secure Reading', 'Content opens in a protected in-browser reader, governed by your institution’s access.'],
  ['compass', 'Research Navigation', 'Move from department to journal, volume, issue, article and author.'],
];
const ADMIN = [
  ['dash', 'Institution Dashboard', 'A librarian’s overview of subscription status, members and activity.'],
  ['users', 'User Management', 'Add, import, edit and suspend members of your institution.'],
  ['key', 'Licensed User Seats', 'Assign access within your approved licensed-user capacity.'],
  ['badge', 'Subscription Access Assignment', 'Choose which members hold subscription access, and change it when needed.'],
  ['chart', 'Usage Analytics', 'See reading activity and the content your members open.'],
  ['search', 'Content Discovery', 'Your members search and browse the full catalogue from their own accounts.'],
  ['shield', 'Role-Based Access', 'Each role sees only the screens and actions meant for it.'],
  ['life', 'Support', 'Our team helps with onboarding, access and queries.'],
];
const AUDIENCES = [
  ['cap', 'For Students', ['Discover academic resources', 'Search by subject or topic', 'Secure reading access']],
  ['flask', 'For Researchers', ['Find relevant literature', 'Explore interdisciplinary resources', 'Research discovery across departments']],
  ['present', 'For Faculty', ['Support teaching and research', 'Subject-focused resources', 'Browse by academic department']],
  ['library', 'For Librarians & Institutions', ['Manage users', 'Manage licensed access', 'Review usage', 'Institutional support']],
];
const DEPARTMENTS = ['Computer / IT', 'Management', 'Medical Sciences', 'Pharmacy', 'Electrical Engineering', 'Chemistry', 'Civil Engineering', 'Law', 'Architecture', 'Nursing', 'Life Sciences', 'Commerce'];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>STM Digital Library — Institutional Brochure</title>
<style>
${Object.entries(FONTS).map(([w, f]) => `@font-face{font-family:'Inter';font-weight:${w};src:url('${file(path.join(FONT_DIR, f))}') format('truetype');}`).join('\n')}
@page { size: A4; margin: 0; }
:root{
  --navy:#0b1b3a; --navy-2:#14284f; --amber:#f5b301;
  --accent:#0d5c63; --accent-soft:#e2eeee;
  --ink:#16181d; --ink-2:#3d434b; --muted:#6a6f76; --rule:#e0e0dc; --ground:#f6f6f4;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter',sans-serif;font-size:10pt;line-height:1.5;color:var(--ink-2);font-variant-numeric:tabular-nums}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
.page:last-child{page-break-after:auto;break-after:auto}
.ico{width:1em;height:1em;flex:none}
.tile{display:inline-flex;align-items:center;justify-content:center;width:10mm;height:10mm;border-radius:2.5mm;background:var(--accent-soft);color:var(--accent);font-size:5.2mm;flex:none}
.tile.on-navy{background:rgba(255,255,255,.1);color:var(--amber)}

/* running head + footer on inner pages */
.run{position:absolute;left:18mm;right:18mm;top:12mm;display:flex;align-items:center;justify-content:space-between;padding-bottom:4mm;border-bottom:.3mm solid var(--rule)}
.brand{display:flex;align-items:center;gap:2.5mm;font-weight:600;font-size:10pt;color:var(--navy)}
.brand img{width:8mm;height:8mm;object-fit:contain}
.run-label{font-size:8pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.foot{position:absolute;left:18mm;right:18mm;bottom:10mm;display:flex;gap:6mm;align-items:center;padding-top:3.5mm;border-top:.3mm solid var(--rule);font-size:8pt;color:var(--muted)}
.foot .pg{margin-left:auto;font-weight:600;color:var(--navy)}
.body{position:absolute;left:18mm;right:18mm;top:28mm;bottom:22mm}
.eyebrow{font-size:8pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h2.title{font-size:23pt;line-height:1.15;font-weight:700;letter-spacing:-.01em;color:var(--navy);margin-top:2mm}
.lede{font-size:10.5pt;color:var(--ink-2);margin-top:4mm;max-width:150mm}
h3{font-size:13pt;font-weight:600;color:var(--navy);line-height:1.3}
.sec{margin-top:6.5mm}
.sec > h3{margin-bottom:3.5mm}

/* ── page 1 ── */
.cover{background:var(--navy);color:#fff}
.cover .top{position:absolute;left:18mm;right:18mm;top:16mm;display:flex;align-items:center;justify-content:space-between}
.cover .mark{display:flex;align-items:center;gap:4mm}
.cover .mark img{width:15mm;height:15mm;object-fit:contain;background:#fff;border-radius:50%;padding:.6mm}
.cover .mark b{display:block;font-size:12pt;font-weight:600}
.cover .mark small{display:block;font-size:8pt;color:rgba(255,255,255,.62);margin-top:.5mm}
.cover .tag{font-size:8pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--amber)}
.cover .head{position:absolute;left:18mm;right:18mm;top:48mm}
.cover h1{font-size:36pt;line-height:1.08;font-weight:700;letter-spacing:-.02em;margin-top:4mm}
.cover .tagline{font-size:16pt;line-height:1.3;font-weight:500;color:var(--amber);margin-top:5mm;max-width:150mm}
.cover .support{font-size:11pt;line-height:1.6;color:rgba(255,255,255,.8);margin-top:5mm;max-width:140mm}
.cover .photo{position:absolute;left:18mm;right:18mm;top:118mm;height:104mm;border-radius:3mm;overflow:hidden;border:.3mm solid rgba(255,255,255,.18)}
.cover .photo img{width:100%;height:100%;object-fit:cover;object-position:50% 60%;display:block}
.cover .photo::after{content:"";position:absolute;inset:0;background:rgba(11,27,58,.28)}
.cover .cta{position:absolute;left:18mm;top:236mm;display:inline-flex;align-items:center;gap:3mm;padding:3.2mm 5mm;border:.3mm solid rgba(255,255,255,.3);border-radius:10mm;font-size:10pt;font-weight:500;color:#fff}
.cover .cta .dot{width:2mm;height:2mm;border-radius:50%;background:var(--amber)}
.cover .contact{position:absolute;left:18mm;right:18mm;bottom:12mm;padding-top:4.5mm;border-top:.3mm solid rgba(255,255,255,.2);display:flex;gap:7mm;font-size:9pt;color:rgba(255,255,255,.85)}
.cover .contact span{display:inline-flex;align-items:center;gap:1.8mm}
.cover .contact .ico{color:var(--amber)}

/* ── page 2 ── */
.types{display:grid;grid-template-columns:repeat(4,1fr);gap:3.5mm}
.card{background:var(--ground);border:.3mm solid var(--rule);border-radius:3mm;padding:4mm}
.type{display:flex;flex-direction:column;gap:2mm;min-height:33mm;padding:3.5mm}
.type b{font-size:9.5pt;font-weight:600;color:var(--navy);line-height:1.3}
.type p{font-size:8.5pt;line-height:1.45;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:2mm;margin-top:1mm}
.chip{font-size:8.5pt;font-weight:500;color:var(--accent);background:var(--accent-soft);border-radius:10mm;padding:1.1mm 3mm}
.chip.more{background:transparent;color:var(--muted);border:.3mm solid var(--rule)}
.feats{display:grid;grid-template-columns:1fr 1fr;gap:3mm 3.5mm}
.feat{display:flex;gap:3.5mm;align-items:flex-start}
.feat b{display:block;font-size:10pt;font-weight:600;color:var(--navy)}
.feat p{font-size:9pt;line-height:1.5;color:var(--ink-2);margin-top:.8mm}
.feat.wide{grid-column:1 / -1}

/* ── page 3 ── */
.admin{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm}
.admin .card{display:flex;gap:3.5mm;align-items:flex-start;min-height:25mm}
.admin b{display:block;font-size:10pt;font-weight:600;color:var(--navy);line-height:1.3}
.admin p{font-size:8.7pt;line-height:1.5;color:var(--ink-2);margin-top:1mm}
.seats{background:var(--navy);border-radius:3.5mm;color:#fff;padding:7mm 7mm 6mm;margin-top:8mm}
.seats h3{color:#fff;font-size:12.5pt}
.seats .sub{font-size:9.5pt;line-height:1.55;color:rgba(255,255,255,.78);margin-top:2mm;max-width:150mm}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-top:5mm}
.stat{background:rgba(255,255,255,.07);border:.3mm solid rgba(255,255,255,.16);border-radius:2.5mm;padding:3.5mm 4mm}
.stat small{display:block;font-size:8pt;font-weight:500;color:rgba(255,255,255,.7)}
.stat strong{display:block;font-size:22pt;line-height:1.1;font-weight:700;color:#fff;margin-top:1mm}
.stat em{display:block;font-style:normal;font-size:7.5pt;color:rgba(255,255,255,.55);margin-top:.5mm}
.illus{margin-top:3.5mm;font-size:8pt;color:rgba(255,255,255,.65);display:flex;align-items:center;gap:2mm}
.illus b{font-weight:600;color:var(--amber);letter-spacing:.1em;text-transform:uppercase;font-size:7.5pt}

/* ── page 4 ── */
.aud{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm}
.aud .card{padding:3.8mm}
.aud .hd{display:flex;align-items:center;gap:3mm;margin-bottom:2.2mm}
.aud .hd b{font-size:11pt;font-weight:600;color:var(--navy);line-height:1.25}
.aud ul{list-style:none}
.aud li{display:flex;gap:2.2mm;align-items:flex-start;font-size:9pt;line-height:1.4;color:var(--ink-2);padding:.4mm 0}
.aud li .ico{color:var(--accent);margin-top:1.1mm;font-size:3.4mm}
.cta-band{position:absolute;left:18mm;right:18mm;bottom:27mm;background:var(--navy);border-radius:3.5mm;color:#fff;padding:6mm 7mm;display:grid;grid-template-columns:1fr 31mm;gap:7mm;align-items:center}
.cta-band .eyebrow{color:var(--amber)}
.cta-band h3{color:#fff;font-size:16pt;line-height:1.2;margin-top:1.5mm}
.cta-band p{font-size:9pt;line-height:1.55;color:rgba(255,255,255,.78);margin-top:2mm}
.cta-band .lines{margin-top:3.5mm;display:flex;flex-direction:column;gap:1.6mm;font-size:9.2pt;color:#fff}
.cta-band .lines span{display:flex;align-items:center;gap:2.4mm}
.cta-band .lines .ico{color:var(--amber)}
.qrbox{background:#fff;border-radius:2.5mm;padding:3mm;text-align:center}
.qrbox .qr{width:25mm;height:25mm;display:block;margin:0 auto}
.qrbox small{display:block;font-size:7pt;line-height:1.3;color:var(--ink-2);margin-top:1.8mm;font-weight:500}
.steps{list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:3.5mm}
.steps li{display:flex;gap:2.6mm;align-items:flex-start;padding:3.4mm;border:.3mm solid var(--rule);border-radius:3mm}
.steps .n{flex:none;width:7mm;height:7mm;border-radius:50%;background:var(--navy);color:#fff;font-weight:700;font-size:9pt;display:inline-flex;align-items:center;justify-content:center}
.steps b{display:block;font-size:9.5pt;font-weight:600;color:var(--navy);line-height:1.3}
.steps p{font-size:8.5pt;line-height:1.45;color:var(--muted);margin-top:1mm}
.legal{position:absolute;left:18mm;right:18mm;bottom:10mm;display:flex;align-items:center;gap:3mm;padding-top:3.5mm;border-top:.3mm solid var(--rule);font-size:8pt;color:var(--muted)}
.legal img{width:9mm;height:9mm;object-fit:contain}
.legal b{color:var(--navy);font-weight:600}
.legal .pg{margin-left:auto;font-weight:600;color:var(--navy)}
</style></head>
<body>

<!-- 1 · Cover -->
<section class="page cover">
  <div class="top">
    <div class="mark"><img src="${LOGO}" alt="STM Digital Library logo" /><div><b>STM Digital Library</b><small>${POSITIONING}</small></div></div>
    <span class="tag">Institutional Brochure</span>
  </div>
  <div class="head">
    <div class="tag">Academic discovery &amp; access</div>
    <h1>STM Digital Library</h1>
    <p class="tagline">An Organised Academic Discovery &amp; Access Platform</p>
    <p class="support">A unified academic environment for discovering, accessing and managing research and learning resources.</p>
  </div>
  <div class="photo"><img src="${COVER}" alt="" /></div>
  <div class="cta"><span class="dot"></span>For Colleges, Universities, Research Institutions &amp; Organisations</div>
  <div class="contact">
    <span>${icon('globe')}${SITE_HOST}</span>
    <span>${icon('mail')}${EMAIL}</span>
    <span>${icon('phone')}${TEL}</span>
  </div>
</section>

<!-- 2 · Discover -->
<section class="page">
  ${running(2, 'Discover')}
  <div class="body">
    <div class="eyebrow">Discover</div>
    <h2 class="title">Discover Research Across Academic Domains</h2>
    <p class="lede">One catalogue brings journals, articles, books and other scholarly material together, organised by academic department.</p>

    <div class="sec">
      <h3>What you can read</h3>
      <div class="types">
        ${TYPES.map(([i, t, d]) => `<div class="card type">${tile(i)}<b>${t}</b><p>${d}</p></div>`).join('')}
      </div>
    </div>

    <div class="sec">
      <h3>Organised by department</h3>
      <div class="chips">
        ${DEPARTMENTS.map(d => `<span class="chip">${d}</span>`).join('')}<span class="chip more">and more</span>
      </div>
    </div>

    <div class="sec">
      <h3>Built for finding and reading</h3>
      <div class="feats">
        ${FEATURES.map(([i, t, d], n) => `<div class="feat${n === FEATURES.length - 1 ? ' wide' : ''}">${tile(i)}<div><b>${t}</b><p>${d}</p></div></div>`).join('')}
      </div>
    </div>
  </div>
  ${foot(2)}
</section>

<!-- 3 · Institutions -->
<section class="page">
  ${running(3, 'For institutions')}
  <div class="body">
    <div class="eyebrow">For institutions</div>
    <h2 class="title">Manage Institutional Access with Confidence</h2>
    <p class="lede">A librarian or administrator gets one place to look after members, subscription access and usage, without the library having to run any software of its own.</p>

    <div class="sec">
      <div class="admin">
        ${ADMIN.map(([i, t, d]) => `<div class="card">${tile(i)}<div><b>${t}</b><p>${d}</p></div></div>`).join('')}
      </div>
    </div>

    <div class="seats">
      <h3>Licensed seats, explained</h3>
      <p class="sub">Institutions can maintain their member directory while assigning subscription access according to their approved licensed-user capacity.</p>
      <div class="stats">
        <div class="stat"><small>Total Members</small><strong>138</strong><em>in the directory</em></div>
        <div class="stat"><small>Licensed Seats</small><strong>25</strong><em>approved capacity</em></div>
        <div class="stat"><small>Assigned</small><strong>22</strong><em>hold access</em></div>
        <div class="stat"><small>Available</small><strong>3</strong><em>left to assign</em></div>
      </div>
      <p class="illus"><b>Illustration</b> Example figures to show how the dashboard reads. They are not platform data.</p>
    </div>
  </div>
  ${foot(3)}
</section>

<!-- 4 · Value & contact -->
<section class="page">
  ${running(4, 'Value &amp; contact')}
  <div class="body">
    <div class="eyebrow">For every reader</div>
    <h2 class="title">One Platform. Multiple Academic Needs.</h2>
    <p class="lede" style="max-width:none">Everyone at an institution reads from the same library, with tools that suit their work.</p>

    <div class="sec">
      <div class="aud">
        ${AUDIENCES.map(([i, t, items]) => `<div class="card"><div class="hd">${tile(i)}<b>${t}</b></div><ul>${items.map(x => `<li>${icon('check')}<span>${x}</span></li>`).join('')}</ul></div>`).join('')}
      </div>
    </div>

    <div class="sec">
      <h3>How an institution gets started</h3>
      <ol class="steps">
        <li><span class="n">1</span><div><b>Tell us about your institution</b><p>Who will read, and how many licensed users.</p></div></li>
        <li><span class="n">2</span><div><b>Receive a quotation</b><p>Your licensed-user capacity and subscription.</p></div></li>
        <li><span class="n">3</span><div><b>Add members and assign access</b><p>Done by your librarian from the dashboard.</p></div></li>
      </ol>
    </div>
  </div>

  <div class="cta-band">
    <div>
      <div class="eyebrow">Get started</div>
      <h3>Request Institutional Access</h3>
      <p>Ask for access, or book a demo. Institutional subscriptions are arranged with our team, who will go through your licensed-user capacity with you.</p>
      <div class="lines">
        <span>${icon('globe')}${SITE_HOST}/institutional-access</span>
        <span>${icon('mail')}${EMAIL}</span>
        <span>${icon('phone')}${TEL} &nbsp;·&nbsp; ${MOBILE}</span>
      </div>
    </div>
    <div class="qrbox">${QR}<small>Scan to open the institutional access page</small></div>
  </div>

  <footer class="legal">
    <img src="${LOGO}" alt="STM Digital Library logo" />
    <span><b>STM Digital Library</b> &nbsp;·&nbsp; ${POSITIONING}</span>
    <span class="pg">4 / 4</span>
  </footer>
</section>

</body></html>`;

// ── Print ────────────────────────────────────────────────────────────────────
(async () => {
  await ensureFonts();
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const htmlPath = path.join(BUILD_DIR, 'brochure.html');
  fs.writeFileSync(htmlPath, html);
  const chrome = process.env.CHROME_BIN || ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find(c => {
    try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; }
  });
  if (!chrome) throw new Error('brochure: Google Chrome or Chromium is needed to print the PDF (set CHROME_BIN)');
  const tmp = path.join(BUILD_DIR, 'out.pdf');
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', '--allow-file-access-from-files',
    `--user-data-dir=${path.join(BUILD_DIR, 'profile')}`, `--print-to-pdf=${tmp}`, file(htmlPath),
  ], { stdio: 'ignore', timeout: 90000 });
  const buf = fs.readFileSync(tmp);
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('brochure: Chrome did not produce a PDF');
  fs.copyFileSync(tmp, OUT);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${(buf.length / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error(e.message); process.exit(1); });
