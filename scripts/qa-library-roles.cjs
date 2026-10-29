/**
 * Role × route matrix for the reader dashboards: where each account lands for each library route.
 *   node scripts/qa-library-roles.cjs <base-url> <tokens.json>      prints a markdown table
 */
const { launch, sleep } = require('./qa-browser.cjs');
const [base, tokFile] = process.argv.slice(2);
const tok = require(require('node:path').resolve(tokFile));
const routes = ['/dashboard/library', '/dashboard/library/access', '/dashboard/library/saved', '/dashboard/history', '/institution/explore', '/institution/access', '/institution/saved', '/institution/history'];
const roles = ['librarian', 'college', 'corporate', 'faculty', 'researcher', 'student', 'pro', 'free', 'nodepts'];
(async () => {
  const b = await launch();
  const rows = [];
  try {
    for (const role of roles) {
      const cells = [];
      for (const r of routes) {
        const p = await b.open(base, tok[role].token);
        let note = ''; try { await p.goto(r); } catch (e) { note = ' (did not finish loading)'; } await sleep(1800);
        const url = (await p.url()).split('?')[0];
        const alive = await p.eval('!!document.querySelector("main, h1")') ;
        cells.push((url === r ? 'opens' : `→ ${url}`) + note);
        await p.close();
      }
      rows.push([`${role} (${tok[role].role}${tok[role].institutionId ? ', institution' : ''})`, ...cells]);
    }
  } finally { await b.close(); }
  console.log(['| Account | ' + routes.join(' | ') + ' |', '|---|' + routes.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n'));
})();
