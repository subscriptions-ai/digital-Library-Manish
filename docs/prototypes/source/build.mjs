import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const HERE = new URL('.', import.meta.url).pathname;
const REPO = '/home/itb04/Desktop/digital-library-manish/';
const only = process.argv[2];
execFileSync(REPO + 'node_modules/esbuild/bin/esbuild', [HERE + 'entry.js', '--bundle', '--alias:react=' + REPO + 'node_modules/react', '--alias:react-dom=' + REPO + 'node_modules/react-dom', '--minify', '--format=iife', '--define:process.env.NODE_ENV="production"', '--outfile=' + HERE + 'bundle.js', '--log-level=error'], { cwd: REPO, stdio: 'inherit' });
const bundle = readFileSync(HERE + 'bundle.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const esc = (s) => JSON.stringify(s).replace(/<\//g, '<\\/');
const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';
function make(dir, out, title, extraCss) {
  const base = readFileSync(HERE + 'parts/styles.css', 'utf8');
  let css = base;
  try { css += '\n' + readFileSync(HERE + dir + '/styles.css', 'utf8'); } catch {}
  try { css += '\n' + readFileSync(HERE + dir + '/extra.css', 'utf8'); } catch {}
  const markup = ['template-a.html', 'template-b.html'].filter((f) => { try { readFileSync(HERE + dir + '/' + f); return true; } catch { return false; } }).map((f) => readFileSync(HERE + dir + '/' + f, 'utf8')).join('\n');
  let code = readFileSync(HERE + dir + '/logic.js', 'utf8');
  if (dir === 'mparts') { const d = readFileSync(HERE + 'parts/logic.js', 'utf8'); code = d.slice(0, d.indexOf('class Component extends DCLogic')) + code; }
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${FONT}
<style>${css}${extraCss || ''}</style>
</head>
<body>
<div id="root"></div>
<script>window.__DC__ = { template: ${esc(markup)}, code: ${esc(code)} };</script>
<script>${bundle}</script>
</body>
</html>
`;
  mkdirSync(REPO + 'docs/prototypes', { recursive: true });
  writeFileSync(REPO + 'docs/prototypes/' + out, html);
  console.log(out, Math.round(html.length / 1024) + ' KB');
}
if (!only || only === 'desktop') make('parts', 'librarian-dashboard-desktop.html', 'Librarian dashboard prototype (desktop)');
if (!only || only === 'mobile') make('mparts', 'librarian-dashboard-mobile.html', 'Librarian dashboard prototype (mobile)', 'body{display:flex;justify-content:center;align-items:flex-start;padding:16px;box-sizing:border-box;background:#cfd2cf;min-height:100vh}');
