#!/usr/bin/env node
/**
 * The product is English only. Hindi is how the team talks to each other, not
 * something a reader, librarian or admin should ever see — in the UI, in an
 * email, in an API error, or in a comment that ends up in a shipped bundle.
 *
 * This fails when it finds Devanagari script, or romanised Hindi (Hinglish),
 * in the code that ships. Run it with `npm run check:english`; `npm run lint`
 * runs it too.
 *
 * The Hinglish list is deliberately only words that are not also English, so
 * it stays quiet on real code. Proper nouns are fine and are not in the list
 * (an institution matcher that looks for "vishwavidyalaya" is matching data,
 * not writing copy). If a genuine match is a false positive, put
 * `check-english: ignore` on that line.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = ['src', 'server.ts', 'index.html', 'public', 'prisma/schema.prisma'];
const EXT = /\.(tsx?|jsx?|html|css|json|md|prisma)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', '.kilo', 'uploads']);

const DEVANAGARI = /[ऀ-ॿ]/;
const HINGLISH = new RegExp(
  '\\b(' + [
    'nahi', 'nahin', 'kiya', 'kiye', 'karein', 'kijiye', 'lijiye', 'dijiye',
    'aapka', 'aapke', 'aapki', 'aapne', 'abhi', 'kuch', 'kisi', 'kisne', 'kaun',
    'kahan', 'kaise', 'kyun', 'yahan', 'sirf', 'seedha', 'seedhe', 'phir',
    'zaroori', 'lekin', 'magar', 'inhone', 'unhone', 'aayega', 'aayengi',
    'padha', 'padhiye', 'shuru', 'banao', 'haan', 'jude', 'juda', 'sakte',
    'kharcha', 'chahiye', 'chahein', 'chalu', 'khaali', 'pehle', 'jaldi',
    'sabhi', 'bahut', 'theek', 'hain', 'namaste', 'shukriya', 'kripya',
    'dikhaye', 'rahenge', 'rehne', 'banne', 'hata', 'dhyan', 'matlab', 'mein', 'poori',
    'milti', 'aadhe', 'ghante', 'hota', 'hoti', 'rehta', 'wala', 'wahi', 'baaki',
  ].join('|') + ')\\b', 'i');

function* walk(p) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) return;
  const st = fs.statSync(full);
  if (st.isFile()) { yield full; return; }
  for (const name of fs.readdirSync(full)) {
    if (SKIP_DIR.has(name)) continue;
    yield* walk(path.join(p, name));
  }
}

const hits = [];
for (const t of TARGETS) {
  for (const file of walk(t)) {
    if (!EXT.test(file)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('check-english: ignore')) return;
      const why = DEVANAGARI.test(line) ? 'Devanagari' : HINGLISH.test(line) ? 'Hinglish' : null;
      if (why) hits.push(`${path.relative(ROOT, file)}:${i + 1}  [${why}]  ${line.trim().slice(0, 120)}`);
    });
  }
}

if (hits.length) {
  console.error(`\nNon-English text found in the product (${hits.length}):\n`);
  hits.forEach(h => console.error('  ' + h));
  console.error('\nThe product is English only. Translate these, or mark a false positive with `check-english: ignore`.\n');
  process.exit(1);
}
console.log('check-english: ok — no Hindi or Hinglish in the product code.');
