// Builds ../admin-dashboard-v2.html (one self-contained file: readable CSS, template and logic; minified React runtime at the end).
//   node docs/prototypes/source-admin/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const HERE = new URL('.', import.meta.url).pathname, REPO = new URL('../../../', import.meta.url).pathname;
execFileSync(REPO + 'node_modules/esbuild/bin/esbuild', [HERE + 'runtime.js', '--bundle', '--minify', '--format=iife', '--alias:react=' + REPO + 'node_modules/react', '--alias:react-dom=' + REPO + 'node_modules/react-dom', '--define:process.env.NODE_ENV="production"', '--outfile=' + HERE + '.runtime.min.js', '--log-level=error'], { cwd: REPO, stdio: 'inherit' });
const runtime = readFileSync(HERE + '.runtime.min.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const inc = (name, prefix) => readFileSync(HERE + 'tpl/inc-' + name + '.html', 'utf8').trim().replace(/@P@/g, prefix || '');
let template = readdirSync(HERE + 'tpl').filter((f) => /^\d\d-/.test(f)).sort().map((f) => readFileSync(HERE + 'tpl/' + f, 'utf8')).join('\n');
template = template.replace(/<!--@include (\w+)(?: (\w+))?-->/g, (_, n, p) => inc(n, p)).replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*\n+/g, '\n');
if (/<\/script/i.test(template)) throw new Error('template contains </script');
const css = readFileSync(HERE + 'base.css', 'utf8') + readFileSync(HERE + 'admin.css', 'utf8'), logic = readFileSync(HERE + 'logic.js', 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>STM Digital Library · Admin dashboard prototype v2</title>
<meta name="description" content="Design prototype of the STM Digital Library admin dashboard. Sample data only; not connected to any backend.">
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
writeFileSync(REPO + 'docs/prototypes/admin-dashboard-v2.html', html);
console.log('admin-dashboard-v2.html', Math.round(html.length / 1024) + ' KB');
