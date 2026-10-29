/**
 * Browser checks for the admin content sections, against a server on the QA database (see qa-library-fixtures.ts for the accounts).
 *   node scripts/qa-admin-flows.cjs <base-url> <tokens.json> [screenshot-dir]
 * Counts shown on the page are compared with the server's own answer fetched from inside the page, and with the department row that was clicked.
 */
const { launch, sleep } = require('./qa-browser.cjs');
const [base, tokFile, shotDir] = process.argv.slice(2);
const tok = require(require('node:path').resolve(tokFile));
const SECTIONS = [['Books', 'books'], ['Periodicals', 'periodicals'], ['Magazines', 'magazines'], ['Case Reports', 'case-reports'], ['Theses', 'theses'], ['Conference Proceedings', 'conference-proceedings'], ['Educational Videos', 'educational-videos'], ['Newsletters', 'newsletters']];
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + String(detail).slice(0, 300)}`); };
const num = (t) => Number(String(t).replace(/[^0-9]/g, ''));
const settle = async (p) => { await sleep(900); await p.waitFor('!document.querySelector("tbody .animate-spin")', 25000); await sleep(300); };
// Retries a non-2xx answer (the API has a rate limit, and this script makes many requests); a third failure throws with the status.
const api = (p, path) => p.eval(`(async()=>{for(let i=0;i<3;i++){const r=await fetch(${JSON.stringify(path)}, {headers:{Authorization:'Bearer '+localStorage.getItem('token')}}); if(r.ok) return r.json(); if(i==2) throw new Error('HTTP '+r.status+' for '+${JSON.stringify(path)}); await new Promise(x=>setTimeout(x,2500))}})()`);
const q = (u) => new URL(base + u).searchParams;

(async () => {
  const b = await launch();
  try {
    for (const [name, slug] of SECTIONS) {
      console.log(`\n${name}`);
      const p = await b.open(base, tok.admin.token, { width: 1085, height: 900 });
      await p.goto(`/admin/${slug}?collection=archived`, 'document.querySelectorAll("table").length>0'); await settle(p);
      const ov = await api(p, `/api/admin/library/overview?contentType=${encodeURIComponent(name)}&collection=archived`);
      const cardTotal = num(await p.eval('document.querySelector("[aria-label=\\"Archived collection summary\\"] p:nth-of-type(2)")?.innerText'));
      check('summary card = the server\'s total for the selected collection', cardTotal === ov.summary.total, `${cardTotal} vs ${ov.summary.total}`);
      check('the cards say which collection they describe', await p.eval('document.body.innerText.includes("Cards show the whole Archived collection")'));
      check('Archived toggle count = the server\'s', num(await p.eval('[...document.querySelectorAll("[aria-label=Collection] button")].find(b=>b.innerText.startsWith("Archived")).innerText')) === ov.collections.archived.total);
      check('no whole-page horizontal scroll at 1085px', await p.eval('document.documentElement.scrollWidth<=window.innerWidth+1'), await p.eval('document.documentElement.scrollWidth'));
      check('only one department control is visible (the drawer button)', await p.eval('[...document.querySelectorAll("button")].filter(b=>b.offsetParent&&/^Department:/.test(b.innerText.trim())).length===1 && !document.querySelector("aside[aria-label$=departments]")'));

      // open the drawer, pick the first department with records
      await p.eval('[...document.querySelectorAll("button")].find(b=>/^Department:/.test(b.innerText.trim())).click()'); await sleep(500);
      check('drawer is a dialog and takes focus', await p.eval('document.querySelector("[role=dialog]")?.contains(document.activeElement)'));
      const rows = await p.eval('[...document.querySelectorAll("[role=dialog] button[data-dept]")].map(b=>[b.dataset.dept,b.innerText.replace(/\\n/g," ")])');
      check('lists All departments, every registry department and Unassigned', rows.length === 31 && rows[0][0] === '' && rows[rows.length - 1][0] === '__none', rows.length);
      const dept = rows.find(r => r[0] && r[0] !== '__none' && num(r[1].replace(r[0], '')) > 0);
      const zero = rows.find(r => r[0] && r[0] !== '__none' && num(r[1].replace(r[0], '')) === 0);
      check('zero-count departments are listed', !!zero || rows.every(r => !r[0] || num(r[1].replace(r[0], '')) > 0));
      await p.key('Escape'); await sleep(400);
      check('Escape closes the drawer and focus returns to its button', await p.eval('!document.querySelector("[role=dialog]") && /^Department:/.test(document.activeElement.innerText.trim())'));
      if (dept) {
        const want = num(dept[1].replace(dept[0], ''));
        await p.eval('[...document.querySelectorAll("button")].find(b=>/^Department:/.test(b.innerText.trim())).click()'); await sleep(400);
        await p.eval(`[...document.querySelectorAll("[role=dialog] button[data-dept]")].find(b=>b.dataset.dept===${JSON.stringify(dept[0])}).click()`); await settle(p);
        const u = await p.url();
        check(`department click filters: URL has it (${dept[0]})`, q(u).get('domain') === dept[0] && q(u).get('collection') === 'archived', u);
        const shown = num(await p.eval('document.querySelector("[aria-live=polite] span.font-bold")?.innerText'));
        const apiN = (await api(p, `/api/admin/content?contentType=${encodeURIComponent(name)}&domain=${encodeURIComponent(dept[0])}&limit=1`)).total;
        check('the table total = the department count = the API', shown === want && apiN === want, `${shown} ${want} ${apiN}`);
        check('the department button now names it', await p.eval(`/Department: ${dept[0].replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}/.test([...document.querySelectorAll("button")].find(b=>/^Department:/.test(b.innerText.trim())).innerText)`));
        if (want > 15) {
          await p.eval('[...document.querySelectorAll("button")].find(b=>b.innerText.includes("Next")).click()'); await settle(p);
          check('Next → page=2 in the URL', q(await p.url()).get('page') === '2');
          const urlP2 = await p.url();
          await p.eval('(()=>{const s=document.getElementById("admin-content-status"); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set; set.call(s,"Published"); s.dispatchEvent(new Event("change",{bubbles:true}))})()'); await settle(p);
          check('a changed filter resets the page', !q(await p.url()).has('page') && q(await p.url()).get('status') === 'Published');
          await p.back(); await settle(p);
          check('Back returns to page 2 of the department', (await p.url()) === urlP2, await p.url());
        }
        const here = await p.url();
        await p.eval('location.reload()'); await sleep(1500); await p.waitFor('document.querySelectorAll("table").length>0', 25000); await settle(p);
        check('refresh keeps the table', (await p.url()) === here && num(await p.eval('document.querySelector("[aria-live=polite] span.font-bold")?.innerText')) > 0);
        await p.goto(here, 'document.querySelectorAll("table").length>0'); await settle(p);
        check('the direct URL opens the same table', (await p.url()) === here);
      }
      check('console is clean (no errors from the app)', p.logs.filter(l => !/24678|WebSocket|vite/i.test(l)).length === 0, p.logs.join(' | '));
      check('no failed requests', p.failed.filter(f => !f.includes('24678')).length === 0, p.failed.join(' | '));
      await p.close();
    }

    console.log('\nEmpty collection, failure vs empty, and wide layout');
    let p = await b.open(base, tok.admin.token, { width: 1085, height: 900 });
    await p.goto('/admin/magazines', 'document.querySelectorAll("table").length>0'); await settle(p);
    const mag = await api(p, '/api/admin/library/overview?contentType=Magazines&collection=new');
    check('Magazines opens on the New collection and says it is empty', mag.summary.total === 0 && await p.eval('document.body.innerText.includes("There are no magazine items in the New collection")'));
    check('it offers the populated collection with its real count', await p.eval(`document.body.innerText.includes("Open the Archived collection (${mag.collections.archived.total.toLocaleString('en-IN')} magazine items)")`));
    check('the explicit New collection stays chosen on refresh', (await (async () => { await p.goto('/admin/magazines?collection=new', 'document.querySelectorAll("table").length>0'); await settle(p); return p.eval('document.body.innerText.includes("There are no magazine items in the New collection")'); })()));
    await p.clickText('Open the Archived collection'); await settle(p);
    check('the action opens Archived (address says so) with rows', q(await p.url()).get('collection') === 'archived' && await p.eval('document.querySelectorAll("tbody tr").length>1'));
    await p.close();

    p = await b.open(base, tok.admin.token, { width: 1085, height: 900 });
    await p.send('Network.setBlockedURLs', { urls: ['*api/admin/library/items*', '*api/admin/library/overview*'] });
    await p.goto('/admin/magazines?collection=new', 'document.querySelectorAll("table").length>0'); await sleep(2500);
    check('a failed list is an error with Retry, never "no magazine items"', await p.eval('!!document.querySelector("tbody [role=alert]") && !document.body.innerText.includes("There are no magazine items")'));
    check('a failed overview shows dashes, not zeros', await p.eval('document.body.innerText.includes("Could not load the summary")'));
    if (shotDir) await p.shot(`${shotDir}/admin-failure.png`);
    await p.send('Network.setBlockedURLs', { urls: [] });
    await p.eval('[...document.querySelectorAll("tbody button")].find(b=>b.innerText.trim()==="Retry").click()'); await sleep(2500);
    check('Retry recovers', await p.eval('document.body.innerText.includes("There are no magazine items in the New collection")'));
    await p.close();

    p = await b.open(base, tok.admin.token, { width: 1500, height: 900 });
    await p.goto('/admin/books', 'document.querySelectorAll("table").length>0'); await settle(p);
    check('wide: the panel sits beside the table and there is no drawer button', await p.eval('!!document.querySelector("aside[aria-label$=departments]") && ![...document.querySelectorAll("button")].some(b=>b.offsetParent&&/^Department:/.test(b.innerText.trim()))'));
    check('wide: no whole-page overflow', await p.eval('document.documentElement.scrollWidth<=window.innerWidth+1'));
    if (shotDir) await p.shot(`${shotDir}/admin-wide.png`);
    await p.click('button[aria-label="Hide the departments panel"]'); await sleep(400);
    check('the panel can be folded away; the table takes the width', await p.eval('!document.querySelector("aside[aria-label$=departments]") && [...document.querySelectorAll("button")].some(b=>b.getAttribute("aria-label")==="Show the departments panel")'));
    await p.click('button[aria-label="Show the departments panel"]'); await sleep(400);
    // one department row by keyboard
    await p.eval('document.querySelector("aside button[data-dept]").focus()'); await p.key('ArrowDown'); await sleep(200);
    check('arrow keys move through the department list', await p.eval('document.activeElement.dataset.dept!==undefined && document.activeElement.dataset.dept!==""'));
    await p.close();

    console.log('\nWidths, themes');
    for (const [w, h, label, dark] of [[768, 900, 'tablet', false], [390, 844, 'mobile', false], [1085, 900, 'dark 1085', true], [1500, 900, 'dark wide', true]]) {
      const q2 = await b.open(base, tok.admin.token, { width: w, height: h, mobile: w < 500, dark });
      await q2.goto('/admin/theses?collection=archived', 'document.querySelectorAll("table").length>0'); await settle(q2);
      check(`${label}: no whole-page overflow`, await q2.eval('document.documentElement.scrollWidth<=window.innerWidth+1'), await q2.eval('document.documentElement.scrollWidth'));
      check(`${label}: the title column and the actions stay reachable`, await q2.eval('(()=>{const t=document.querySelector("tbody tr td:nth-child(2)"); const a=document.querySelector("tbody tr td:last-child button"); if(!t||!a) return false; const r=a.getBoundingClientRect(); return r.right<=window.innerWidth+1 && r.width>0})()'));
      if (shotDir) await q2.shot(`${shotDir}/admin-${label.replace(/ /g, '-')}.png`);
      await q2.close();
    }

    console.log('\nAuthorization in the browser');
    const m = await b.open(base, tok.manager.token, { width: 1500, height: 900 });
    await m.goto('/admin/books', 'document.body.innerText.length>50'); await sleep(2500);
    check('a subscription manager is sent to its own workspace, with no content module or create button', (await m.url()).startsWith('/manager') && !(await m.eval('document.body.innerText.includes("Add Book")')), await m.url());
    await m.close();
  } finally { await b.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(99); });
