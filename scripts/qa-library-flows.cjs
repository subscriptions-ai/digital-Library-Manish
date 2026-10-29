/**
 * Browser checks for the Content Library's navigation, run against a dev/production server on the QA database.
 *   node scripts/qa-library-flows.cjs <base-url> <tokens.json> [screenshot-dir]
 * Tokens come from scripts/qa-library-fixtures.ts. Each line prints PASS/FAIL; the exit code is the number of failures.
 */
const { launch, sleep } = require('./qa-browser.cjs');
const [base, tokFile, shotDir] = process.argv.slice(2);
const tok = require(require('node:path').resolve(tokFile));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + String(detail).slice(0, 300)}`); };
const setSelect = (p, label, value) => p.eval(`(()=>{const s=document.querySelector('select[aria-label=${JSON.stringify(label)}]'); if(!s) return false; const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
const rows = (p) => p.eval('document.querySelectorAll("article").length');
const total = (p) => p.eval('(document.querySelector("[aria-live=polite]")?.innerText.match(/([\\d,]+)\\s+result/)||[])[1]');
const settle = async (p) => { await sleep(700); await p.waitFor('!document.querySelector("[role=status][aria-label=\x27Loading results\x27]")', 20000); await sleep(300); };

(async () => {
  const b = await launch();
  try {
    console.log('\n1. Department card → content type → filtered results (institution)');
    let p = await b.open(base, tok.librarian.token);
    await p.goto('/institution/access', 'document.body.innerText.includes("Applied Sciences")');
    await p.waitFor("!!document.querySelector(\"a[aria-label='Browse Books in Applied Sciences']\")");
    await p.click('a[aria-label="Browse Books in Applied Sciences"]'); await settle(p);
    let u = new URL(base + await p.url());
    check('URL keeps department and kind', u.searchParams.get('domain') === 'Applied Sciences' && u.searchParams.get('kind') === 'books', u.search);
    check('no stale archived/type parameters', !u.searchParams.has('mode') && !u.searchParams.has('atype'), u.search);
    check('result count is the Applied Sciences book count', (await total(p)) === '136', await total(p));
    const domains = await p.eval('[...document.querySelectorAll("article")].map(a=>a.innerText.includes("Applied Sciences"))');
    check('every row on the page is Applied Sciences', domains.length > 0 && domains.every(Boolean), JSON.stringify(domains));
    check('Books toggle is the pressed one', await p.eval('document.querySelector("[aria-label=\x27Content kind\x27] [aria-pressed=true]")?.innerText==="Books"'));
    if (shotDir) await p.shot(`${shotDir}/flow-1-books.png`);

    console.log('\n2. Pagination, filter resets the page, reload, Back');
    await p.click('nav[aria-label="Pagination"] button[aria-label="Page 2"]'); await settle(p);
    u = new URL(base + await p.url());
    check('page 2 is in the URL', u.searchParams.get('page') === '2', u.search);
    const urlPage2 = await p.url();
    await p.eval('(()=>{const r=[...document.querySelectorAll("input[type=radio]")].find(x=>x.parentElement.innerText.startsWith("At the source")); r.click(); return true})()'); await settle(p);
    u = new URL(base + await p.url());
    check('changing a filter resets the page', !u.searchParams.has('page') && u.searchParams.get('avail') === 'external', u.search);
    check('availability chip shown', await p.eval('!!document.querySelector("[aria-label=\x27Active filters\x27]")?.innerText.includes("At the source")'));
    const urlFiltered = await p.url(); const totalFiltered = await total(p);
    await p.eval('location.reload()'); await sleep(1500); await p.waitFor('document.querySelectorAll("article").length>0', 20000); await settle(p);
    check('reload restores URL and count', (await p.url()) === urlFiltered && (await total(p)) === totalFiltered, `${await p.url()} ${await total(p)}`);
    await p.back(); await settle(p);
    check('Back returns to page 2 of the previous filter', (await p.url()) === urlPage2, await p.url());

    console.log('\n3. Search within results, and return from the reader');
    await p.eval('(()=>{const i=document.getElementById("library-search"); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; set.call(i,"Finite"); i.dispatchEvent(new Event("input",{bubbles:true})); return true})()');
    await sleep(900); await settle(p);
    u = new URL(base + await p.url());
    check('search text is in the URL and the page reset', u.searchParams.get('q') === 'Finite' && !u.searchParams.has('page'), u.search);
    check('label says search is within the results', await p.eval('document.querySelector("label[for=library-search]").innerText.includes("within")'));
    // an article shelf with a readable record
    await p.goto('/institution/explore?domain=Applied+Sciences&avail=readable', 'document.querySelectorAll("article").length>0'); await settle(p);
    const before = await p.url();
    check('readable filter: every row offers Read', await p.eval('[...document.querySelectorAll("article")].every(a=>[...a.querySelectorAll("button")].some(x=>x.innerText.trim()==="Read"))'));
    await p.eval('[...document.querySelectorAll("article button")].find(x=>x.innerText.trim()==="Read").click()'); await sleep(2500);
    check('Read opens the viewer', (await p.url()).startsWith('/institution/viewer/'), await p.url());
    await p.back(); await settle(p);
    check('Back from the reader restores the exact result context', (await p.url()) === before, await p.url());

    console.log('\n4. Drawer on a small screen: opens, traps Esc, returns focus');
    await p.close();
    p = await b.open(base, tok.librarian.token, { width: 390, height: 844, mobile: true });
    await p.goto('/institution/explore?domain=Applied+Sciences', 'document.querySelectorAll("article").length>0'); await settle(p);
    await p.eval('[...document.querySelectorAll("button")].find(b=>b.innerText.trim().startsWith("Filters")).click()'); await sleep(500);
    check('drawer is a dialog', await p.eval('document.querySelector("#library-filters")?.getAttribute("role")==="dialog"'));
    check('focus moved into the drawer', await p.eval('document.querySelector("#library-filters").contains(document.activeElement)'));
    await p.key('Escape'); await sleep(500);
    check('Escape closes it', await p.eval('document.querySelector("#library-filters")?.getAttribute("role")!=="dialog"'));
    check('focus returns to the Filters button', await p.eval('document.activeElement?.innerText?.trim().startsWith("Filters")'));
    check('no horizontal page scroll at 390px', await p.eval('document.documentElement.scrollWidth<=window.innerWidth+1'), await p.eval('document.documentElement.scrollWidth'));
    await p.close();

    console.log('\n5. Every reader role reaches its own library, and only its own');
    const mine = { faculty: '/dashboard/library', student: '/dashboard/library', researcher: '/dashboard/library', college: '/institution/explore', corporate: '/institution/explore', pro: '/dashboard/library', free: '/dashboard/library', librarian: '/institution/explore' };
    for (const [role, path] of Object.entries(mine)) {
      const q = await b.open(base, tok[role].token);
      await q.goto(path + '?domain=Applied+Sciences', 'document.querySelectorAll("article, [role=alert], h1").length>0'); await settle(q);
      const here = await q.url();
      const n = await rows(q);
      check(`${role}: stays on ${path} and lists records`, here.startsWith(path) && n > 0, `${here} rows=${n}`);
      await q.close();
    }
    const o = await b.open(base, tok.other.token);
    await o.goto('/institution/explore?domain=Applied+Sciences', 'document.body.innerText.length>200'); await settle(o);
    check('another institution is told the department is not part of its access', await o.eval('document.body.innerText.includes("not part of your access")'));
    check('…and sees no Applied Sciences record', (await rows(o)) === 0);
    await o.close();

    console.log('\n6. A failed request is an error with a retry — never "0 results"');
    const f = await b.open(base, tok.librarian.token);
    await f.send('Network.setBlockedURLs', { urls: ['*api/library/articles*'] });
    await f.goto('/institution/explore?domain=Applied+Sciences', 'document.body.innerText.length>300'); await sleep(2500);
    check('an error is shown with a Try again control', await f.eval('!!document.querySelector("[role=alert]") && document.body.innerText.includes("Try again")'));
    check('no "0 results" / "No articles" claim is made', await f.eval('!/\\b0\\s+results|No articles/.test(document.body.innerText)'));
    check('the filters are still there and unchanged', (await f.url()).includes('domain=Applied+Sciences'));
    await f.send('Network.setBlockedURLs', { urls: [] });
    await f.clickText('Try again'); await sleep(1500); await f.waitFor('document.querySelectorAll("article").length>0', 20000);
    check('Try again recovers', (await rows(f)) > 0);
    if (shotDir) await f.shot(`${shotDir}/flow-6-recovered.png`);
    await f.close();
  } finally { await b.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail);
})().catch(e => { console.error(e); process.exit(99); });
