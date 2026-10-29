/**
 * Parity matrix for the reader Content Library: the same department, collection and viewport for every account, so
 * a difference can be attributed to role, collection or build and never to a different dataset.
 *   node scripts/qa-library-parity.cjs <base-url> <tokens.json> [screenshot-dir] [json-out]
 * Tokens come from scripts/qa-library-fixtures.ts. Prints one JSON row per (account, collection) and a markdown table of
 * the controls each page exposes. Exit code 1 when the solo and institution pages disagree on a shared control.
 */
const { launch, sleep } = require('./qa-browser.cjs');
const path = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const [base, tokFile, shotDir, jsonOut] = process.argv.slice(2);
const tok = require(path.resolve(tokFile));
if (shotDir) mkdirSync(shotDir, { recursive: true });

const ACCOUNTS = [
  { key: 'pro', route: '/dashboard/library', label: 'solo Pro' },
  { key: 'free', route: '/dashboard/library', label: 'solo Free' },
  { key: 'nodepts', route: '/dashboard/library', label: 'solo, no departments' },
  { key: 'librarian', route: '/institution/explore', label: 'librarian' },
  { key: 'college', route: '/institution/explore', label: 'college admin' },
  { key: 'corporate', route: '/institution/explore', label: 'corporate admin' },
  { key: 'faculty', route: '/dashboard/library', label: 'faculty member' },
  { key: 'student', route: '/dashboard/library', label: 'student member' },
  { key: 'researcher', route: '/dashboard/library', label: 'researcher member' },
];
// One stuck page must not stop the matrix: every case gets its own deadline and is recorded as such.
const within = (ms, work) => Promise.race([work, new Promise((_, rej) => setTimeout(() => rej(new Error('case exceeded ' + ms / 1000 + 's')), ms))]);
const COLLECTIONS = ['new', 'archived'];
// The archived (legacy) shelf lives in other departments than the new collection in a development copy; run the fixtures with QA_EXTRA_DEPT set to the same one.
const DEPARTMENT = { new: 'Applied Sciences', archived: process.env.PARITY_ARCHIVED_DEPT || 'Management' };

const PROBE = `(()=>{
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const labelOf = (el) => clean(el.getAttribute('aria-label') || (el.id && document.querySelector('label[for="' + el.id + '"]')?.innerText) || el.closest('label')?.innerText || '');
  const selects = [...document.querySelectorAll('main select, select')].filter(e => e.offsetParent !== null).map(s => ({ label: labelOf(s), value: clean(s.selectedOptions[0]?.innerText), options: [...s.options].map(o => clean(o.innerText)) }));
  const radios = [...document.querySelectorAll('input[type=radio]')].filter(e => e.offsetParent !== null).map(r => clean(r.closest('label')?.innerText));
  const pressed = [...document.querySelectorAll('button[aria-pressed]')].filter(e => e.offsetParent !== null).map(b => clean(b.innerText) + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
  const text = document.body.innerText;
  const card = document.querySelector('article');
  return {
    url: location.pathname + location.search,
    h1: clean(document.querySelector('h1')?.innerText),
    selects, radios, pressed,
    searchLabel: clean(document.querySelector('label[for="library-search"]')?.innerText),
    count: (text.match(/([\\d,]+)\\s+results?/) || [])[1] || null,
    showing: /showing\\s+[\\d,]+/.test(text),
    cards: document.querySelectorAll('article').length,
    firstCardActions: card ? [...card.querySelectorAll('button,a')].map(b => clean(b.innerText || b.getAttribute('aria-label'))).filter(Boolean) : [],
    firstCardChips: card ? [...card.querySelectorAll('span')].map(b => clean(b.innerText)).filter(x => x && x.length < 30).slice(0, 8) : [],
    clearAll: /Clear all/i.test(text),
    availabilityHelp: /Readable here/.test(text),
    continueReading: /Continue reading/i.test(text),
    previewClock: /Free Preview/.test(text),
    tabs: [...document.querySelectorAll('nav[aria-label="Library sections"] a')].map(a => clean(a.innerText)),
  };
})()`;

(async () => {
  const b = await launch();
  const rows = [];
  try {
    for (const a of ACCOUNTS) {
      for (const coll of COLLECTIONS) {
        let r = {}, note = '', p;
        try {
          p = await within(20000, b.open(base, tok[a.key].token, { width: 1440, height: 900 }));
          const q = `?domain=${encodeURIComponent(DEPARTMENT[coll])}` + (coll === 'archived' ? '&mode=archived' : '');
          await within(70000, (async () => {
            try { await p.goto(a.route + q, 'document.querySelectorAll("article").length>0 || /No results|couldn|0 results/i.test(document.body.innerText)'); } catch { note = 'no result list appeared'; }
            await sleep(900);
            r = await p.eval(PROBE);
            if (shotDir) await p.shot(path.join(shotDir, `${a.key}-${coll}.png`));
          })());
        } catch (e) { note = (note ? note + '; ' : '') + e.message; r = { selects: [], radios: [], pressed: [], firstCardActions: [], url: a.route }; }
        if (p) await within(5000, p.close()).catch(() => {});
        rows.push({ account: a.label, key: a.key, collection: coll, route: a.route, note, ...r });
      }
    }
  } finally { await b.close(); }

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
  const ctl = (r) => [
    ...r.selects.map(s => `select:${s.label || '?'}`),
    ...(r.radios.length ? ['radios:availability'] : []),
    ...r.pressed.map(x => x.replace('*', '')).filter(x => x && !/\d$/.test(x)).map(x => `toggle:${x}`),
  ].join(', ');
  console.log('| Account | Collection | Route | Results | Controls | Card actions |\n|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.account} | ${r.collection} | ${r.route}${r.url.startsWith(r.route) ? '' : ' → ' + r.url.split('?')[0]} | ${r.count ?? '—'} | ${ctl(r)} | ${r.firstCardActions.join(' / ')} |`);

  // Same collection ⇒ the solo and institution pages must expose the same filter controls.
  let bad = 0;
  for (const coll of COLLECTIONS) {
    const sets = rows.filter(r => r.collection === coll && r.cards > 0 && ['pro', 'librarian', 'faculty', 'college', 'student'].includes(r.key)).map(r => ctl(r));
    if (new Set(sets).size > 1) { bad++; console.log(`\nDIFFERENT controls in ${coll}:\n  ${sets.join('\n  ')}`); }
  }
  // A visible "0 results" is a measurement (an account with no department access); only a page that never reached a list is not.
  const unmeasured = rows.filter(r => r.count == null);
  if (unmeasured.length) console.log(`\nNOT MEASURED (the page never showed a result count): ${unmeasured.map(r => r.key + '/' + r.collection + (r.note ? ' [' + r.note + ']' : '')).join(', ')}`);
  process.exit(bad || unmeasured.length ? 1 : 0);
})();
