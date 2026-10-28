// Builds ../librarian-dashboard-v2.html: one self-contained file (CSS, template and logic stay readable; only the React runtime is minified).
//   node docs/prototypes/source-v2/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const HERE = new URL('.', import.meta.url).pathname, REPO = new URL('../../../', import.meta.url).pathname;
execFileSync(REPO + 'node_modules/esbuild/bin/esbuild', [HERE + 'runtime.js', '--bundle', '--minify', '--format=iife', '--alias:react=' + REPO + 'node_modules/react', '--alias:react-dom=' + REPO + 'node_modules/react-dom', '--define:process.env.NODE_ENV="production"', '--outfile=' + HERE + '.runtime.min.js', '--log-level=error'], { cwd: REPO, stdio: 'inherit' });
const runtime = readFileSync(HERE + '.runtime.min.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const inc = (name) => readFileSync(HERE + 'tpl/inc-' + name + '.html', 'utf8').trim();
const parts = readdirSync(HERE + 'tpl').filter((f) => /^\d\d-/.test(f)).sort();
let template = parts.map((f) => readFileSync(HERE + 'tpl/' + f, 'utf8')).join('\n');
template = template.replace(/<!--@include (\w+)-->/g, (_, n) => inc(n)).replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*\n+/g, '\n');
if (/<\/script/i.test(template)) throw new Error('template contains </script');
const css = readFileSync(HERE + 'styles.css', 'utf8'), logic = readFileSync(HERE + 'logic.js', 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>STM Digital Library · Librarian dashboard prototype v2</title>
<meta name="description" content="Design prototype of the institutional librarian dashboard. Sample data only; not connected to any backend.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>

<!-- Markup: {{holes}}, <sc-if>, <sc-for>, <sc-icon>. Edit freely; reload to see it. -->
<script type="text/x-dc-template" id="dc-template">
${template}
</script>

<!-- Logic: one class; renderVals() returns everything the markup reads. All data is sample data. -->
<script type="text/x-dc-logic" id="dc-logic">
${logic}
</script>

<!-- Runtime (React + a small template engine), minified. -->
<script>${runtime}</script>
</body>
</html>
`;
writeFileSync(REPO + 'docs/prototypes/librarian-dashboard-v2.html', html);
console.log('librarian-dashboard-v2.html', Math.round(html.length / 1024) + ' KB');
