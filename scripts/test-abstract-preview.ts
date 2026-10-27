/**
 * Abstract preview tests.
 *
 *  1. The helper on its own: length, ellipsis, word boundaries, markup, Unicode.
 *  2. The real Express server against the throwaway database `stm_ingestion_test` (refuses anything else, outbound requests blocked):
 *     what the viewer endpoints send, what they leave out, and what stays as it was.
 *
 *   npx tsx scripts/test-abstract-preview.ts
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { buildAbstractPreview, abstractToPlainText, abstractPreviewFor, ABSTRACT_PREVIEW_MAX } from '../src/lib/abstractPreview.js';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const len = (s: string) => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)).length;

section('Helper: length and ellipsis');
check('the limit is 400', ABSTRACT_PREVIEW_MAX === 400);
check('no abstract → null (so no section)', buildAbstractPreview(null) === null && buildAbstractPreview(undefined) === null && buildAbstractPreview('') === null && buildAbstractPreview('   \n ') === null && buildAbstractPreview(42 as any) === null);
const short = 'A short abstract of 180 characters. '.repeat(5).trim().slice(0, 180);
check('a short abstract is shown whole, with no ellipsis', buildAbstractPreview(short) === short && !short.endsWith('…'));
const exact = ('word '.repeat(100)).slice(0, 400);
check('exactly 400 characters is shown whole, with no ellipsis', exact.length === 400 && buildAbstractPreview(exact) === exact.trim() && !buildAbstractPreview(exact)!.endsWith('…'));
check('401 characters is cut', buildAbstractPreview('x'.repeat(401))!.endsWith('…'));
const long = ('Paramyxovirus reverse genetics systems and their applications. ').repeat(30);
const lp = buildAbstractPreview(long)!;
check('a long abstract is cut to at most 400 characters, ellipsis included', len(lp) <= 400 && len(lp) > 300, `${len(lp)}`);
check('the ellipsis appears only when something was cut', lp.endsWith('…') && !buildAbstractPreview('Short one.')!.includes('…'));

section('Helper: word boundary');
check('it stops at the end of a whole word', /\w…$/.test(lp) && !/Paramyxovir…$|systems an…$/.test(lp) && long.startsWith(lp.slice(0, -1)) && /\s/.test(long.charAt(lp.length - 1)), JSON.stringify(lp.slice(-30)));
check('no dangling comma or hyphen before the ellipsis', !/[,;:\-\s]…$/.test(buildAbstractPreview(('alpha, '.repeat(120)))!));
const noSpaces = 'a'.repeat(1000);
check('one very long token is cut by character rather than collapsed', len(buildAbstractPreview(noSpaces)!) === 400);

section('Helper: whitespace and markup');
check('repeated spaces, tabs and newlines become single spaces', buildAbstractPreview('One   two\n\n\tthree \r\n four') === 'One two three four');
check('HTML is stripped', buildAbstractPreview('<p>Hello <b>bold</b> <i>world</i></p><br/>Second.') === 'Hello bold world Second.');
check('JATS/XML tags are stripped', buildAbstractPreview('<jats:p>Background: <jats:italic>E. coli</jats:italic> grows.</jats:p><jats:title>Results</jats:title>') === 'Background: E. coli grows. Results');
check('entities are decoded', buildAbstractPreview('Fish &amp; chips &lt; 5 &#8211; &#x2013; caf&eacute;') === 'Fish & chips < 5 – – caf&eacute;');
check('script and style bodies are removed, not just their tags', buildAbstractPreview('Before<script>alert(1)</script><style>p{color:red}</style>After') === 'Before After');
check('malicious markup leaves no tag, attribute or handler behind', (() => {
  const out = abstractToPlainText('<img src=x onerror="alert(1)"><a href="javascript:alert(2)">link</a><svg onload=alert(3)><b>ok</b></svg>');
  return out === 'link' && !/[<>]/.test(out);
})());
check('an entity-encoded tag is not turned into a live one', !/[<>]/.test(abstractToPlainText('&lt;b&gt;bold&lt;/b&gt; &lt;img src=x onerror=alert(1)&gt;')));
check('a lone "<" in a formula survives as text', buildAbstractPreview('We found p < 0.05 and n<m in all cases.') === 'We found p < 0.05 and n<m in all cases.');
check('control and zero-width characters are removed', buildAbstractPreview('a\u0000b​c\u0007d') === 'abcd');

section('Helper: Unicode');
const accented = 'Étude des protéines à la température élevée — naïve, façade, señor, Größe, İstanbul. ';
const ap = buildAbstractPreview(accented.repeat(10))!;
check('accented Latin text is kept intact', ap.startsWith('Étude des protéines à la température élevée') && len(ap) <= 400 && !/�/.test(ap));
const cjk = '本研究探讨副粘病毒反向遗传学系统及其在新兴人工智能方法中的应用。'.repeat(30);
const cp = buildAbstractPreview(cjk)!;
check('CJK text is kept intact and cut to 400 characters', cp.startsWith('本研究探讨副粘病毒') && len(cp) === 400 && cp.endsWith('…') && !/�/.test(cp), `${len(cp)}`);
const emoji = '🧬'.repeat(500);
const ep = buildAbstractPreview(emoji)!;
check('a surrogate pair is never split', len(ep) === 400 && !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(ep));
const family = '👨‍👩‍👧'.repeat(500);
check('a joined emoji sequence is never split', !/‍…$/.test(buildAbstractPreview(family)!) && len(buildAbstractPreview(family)!) === 400);
const hindi = 'यह अध्ययन पैरामिक्सोवायरस रिवर्स जेनेटिक्स प्रणालियों की जांच करता है। '.repeat(20);
check('Devanagari (combining marks) is not corrupted', len(buildAbstractPreview(hindi)!) <= 400 && !/^[ा-्]/.test(buildAbstractPreview(hindi)!.slice(-3, -1)) );
check('Arabic is kept intact', buildAbstractPreview('تتناول هذه الدراسة أنظمة الوراثة العكسية. '.repeat(30))!.startsWith('تتناول هذه الدراسة'));

section('Helper: which records may show a preview');
const art = (o: any) => ({ abstract: 'An abstract.', ownershipSource: 'AdminEntered', ...o });
check('an admin-entered article shows its preview', abstractPreviewFor('article', art({})) === 'An abstract.');
check('a publisher-submitted article shows its preview', abstractPreviewFor('article', art({ ownershipSource: 'PublisherSubmitted' })) === 'An abstract.');
check('an ingested article does not (article ingestion stores no abstract; one that has one is uncleared)', abstractPreviewFor('article', art({ ownershipSource: 'Ingested', source: 'OpenAlex' })) === null);
check('an ingested DOAB book shows its description preview', abstractPreviewFor('book', { description: 'About the book.', ownershipSource: 'Ingested', source: 'DOAB' }) === 'About the book.');
check('an ingested book from a source not cleared (Google Books) does not', abstractPreviewFor('book', { description: 'About.', ownershipSource: 'Ingested', source: 'GoogleBooks' }) === null);
check('a rejected record does not', abstractPreviewFor('book', { description: 'About.', ownershipSource: 'Ingested', source: 'DOAB', rightsStatus: 'Rejected' }) === null);
check('legacy content has no preview', abstractPreviewFor('content', { description: 'x', abstract: 'x' }) === null);

// ───────────────────────────── the server ─────────────────────────────
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const envVal = (k: string) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)?.[1]?.replace(/^["']|["']$/g, '');
const real = envVal('DATABASE_URL'); if (!real) throw new Error('no DATABASE_URL in .env');
const TEST_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
process.env.DATABASE_URL = TEST_URL;
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');

const PORT = 3111, BASE = `http://127.0.0.1:${PORT}`;
const SECRET = envVal('JWT_SECRET') || 'your-fallback-secret-for-dev-only';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const MARKER = 'ZZTAILMARKERZZ';
const ids = { long: 'abs-prev-long', short: 'abs-prev-short', none: 'abs-prev-none', html: 'abs-prev-html', uni: 'abs-prev-uni', ingested: 'abs-prev-ingested', book: 'abs-prev-book', bookGoogle: 'abs-prev-book-google' };
const longAbstract = Array.from({ length: 40 }, (_, i) => `Sentence ${i + 1} describes the paramyxovirus reverse genetics system in some detail.`).join(' ') + ` ${MARKER}`;
const base = { status: 'Published', ownershipSource: 'AdminEntered', source: 'Admin', contentType: 'Periodicals', domain: 'Biotechnology', pdfUrl: 'http://127.0.0.1:1/none.pdf', originalUrl: 'https://publisher.example/article/1', doi: '10.1234/preview.test', journalName: 'Test Journal', journalIssn: '1234-5678', year: 2024, authors: 'A. Author' };
const fixtures = [
  { id: ids.long, title: 'Long abstract', abstract: longAbstract },
  { id: ids.short, title: 'Short abstract', abstract: 'A complete short abstract.' },
  { id: ids.none, title: 'No abstract', abstract: null, originalUrl: null },
  { id: ids.html, title: 'Markup abstract', abstract: '<jats:p>Background: <jats:italic>E. coli</jats:italic> &amp; friends.</jats:p><script>alert(1)</script><img src=x onerror=alert(2)>' },
  { id: ids.uni, title: 'Unicode abstract', abstract: '本研究探讨副粘病毒反向遗传学系统。'.repeat(60) + MARKER },
  { id: ids.ingested, title: 'Ingested with an abstract', abstract: 'Not cleared for display.', ownershipSource: 'Ingested', source: 'OpenAlex' },
];
for (const f of fixtures) await db.article.upsert({ where: { id: f.id }, create: { ...base, ...f } as any, update: { ...base, ...f } as any });
const bookBase = { status: 'Published', ownershipSource: 'Ingested', domain: 'Biotechnology', originalUrl: 'https://library.example/handle/1', doi: '10.1234/book.test', authors: 'B. Author', year: 2022 };
await db.book.upsert({ where: { id: ids.book }, create: { ...bookBase, id: ids.book, title: 'A DOAB book', source: 'DOAB', description: longAbstract } as any, update: { ...bookBase, title: 'A DOAB book', source: 'DOAB', description: longAbstract } as any });
await db.book.upsert({ where: { id: ids.bookGoogle }, create: { ...bookBase, id: ids.bookGoogle, title: 'A Google book', source: 'GoogleBooks', description: 'Not cleared.' } as any, update: { ...bookBase, title: 'A Google book', source: 'GoogleBooks', description: 'Not cleared.' } as any });

const mkAdmin = async () => {
  const u = await db.user.create({ data: { email: `admin-abs-${Date.now().toString(36)}@api-test.invalid`, password: 'x', role: 'SuperAdmin' } });
  const sid = `sid-abs-${Date.now().toString(36)}`;
  await db.userSession.create({ data: { userId: u.id, sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) } });
  return jwt.sign({ uid: u.id, sid, role: 'SuperAdmin', email: u.email }, SECRET, { expiresIn: '1h' });
};
const tok = await mkAdmin();

const child = spawn('npx', ['tsx', '--import', new URL('./test-ingestion-api.preload.mjs', import.meta.url).pathname, 'server.ts'], {
  cwd: new URL('..', import.meta.url).pathname, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DATABASE_URL: TEST_URL, PORT: String(PORT), NODE_ENV: 'development', API_TEST_RUN: 'abs', API_TEST_ISSN: '1234-5678', API_TEST_FILE_PORT: '3199', API_TEST_BLOCK_DELAY_MS: '50' },
});
let serverLog = ''; child.stdout!.on('data', d => (serverLog += d)); child.stderr!.on('data', d => (serverLog += d));
const shutdown = async () => { try { process.kill(-child.pid!, 'SIGTERM'); } catch {} await db.$disconnect(); };
const call = async (path: string, token?: string) => {
  const r = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
};

try {
  const t0 = Date.now(); for (;;) { try { const r = await call('/api/library/article/none'); if (r.status === 404) break; } catch {} if (Date.now() - t0 > 90_000) throw new Error('server did not start\n' + serverLog.slice(-2000)); await sleep(700); }

  section('Viewer: /api/content/:id/view');
  const vLong = await call(`/api/content/${ids.long}/view`, tok);
  check('long abstract: a preview of at most 400 characters ending in an ellipsis', vLong.status === 200 && len(vLong.data.abstractPreview) <= 400 && vLong.data.abstractPreview.endsWith('…'), `${vLong.status} ${vLong.data?.abstractPreview?.length}`);
  check('long abstract: the complete abstract is nowhere in the response', !vLong.text.includes(MARKER) && !vLong.text.includes('Sentence 20 '));
  const vShort = await call(`/api/content/${ids.short}/view`, tok);
  check('short abstract: shown whole, no ellipsis', vShort.data.abstractPreview === 'A complete short abstract.');
  const vNone = await call(`/api/content/${ids.none}/view`, tok);
  check('no abstract: abstractPreview is null (the viewer hides the section)', vNone.status === 200 && vNone.data.abstractPreview === null);
  const vHtml = await call(`/api/content/${ids.html}/view`, tok);
  check('markup: plain text only', vHtml.data.abstractPreview === 'Background: E. coli & friends.', JSON.stringify(vHtml.data.abstractPreview));
  const vUni = await call(`/api/content/${ids.uni}/view`, tok);
  check('CJK: intact, cut, and the tail is not sent', vUni.data.abstractPreview.startsWith('本研究探讨副粘病毒') && len(vUni.data.abstractPreview) === 400 && !vUni.text.includes(MARKER));
  const vIng = await call(`/api/content/${ids.ingested}/view`, tok);
  check('an ingested article with an abstract from an uncleared path shows none', vIng.data.abstractPreview === null && !vIng.text.includes('Not cleared'));
  const vBook = await call(`/api/content/${ids.book}/view`, tok);
  check('a DOAB book: preview of its description, never the whole', vBook.status === 200 && len(vBook.data.abstractPreview) <= 400 && !vBook.text.includes(MARKER));
  const vGoogle = await call(`/api/content/${ids.bookGoogle}/view`, tok);
  check('a book from a source not cleared shows none and sends none', vGoogle.data.abstractPreview === null && !vGoogle.text.includes('Not cleared'));

  section('Viewer: /api/library/article/:id?abstract=preview');
  const rLong = await call(`/api/library/article/${ids.long}?abstract=preview`);
  check('no `abstract` key, a preview instead', rLong.status === 200 && !('abstract' in rLong.data) && len(rLong.data.abstractPreview) <= 400, Object.keys(rLong.data).includes('abstract') ? 'abstract present' : 'ok');
  check('the complete abstract is nowhere in the response', !rLong.text.includes(MARKER));
  const rNone = await call(`/api/library/article/${ids.none}?abstract=preview`);
  check('no abstract → abstractPreview null', rNone.data.abstractPreview === null);
  const rIng = await call(`/api/library/article/${ids.ingested}?abstract=preview`);
  check('an uncleared ingested abstract is not sent in preview mode either', rIng.data.abstractPreview === null && !rIng.text.includes('Not cleared'));

  section('Unchanged: the record page and admin');
  const full = await call(`/api/library/article/${ids.long}`);
  check('the record page (no parameter) still receives the whole abstract', full.data.abstract === longAbstract && !('abstractPreview' in full.data));
  const adm = await call(`/api/admin/library/items/article/${ids.long}`, tok);
  check('the admin editor still receives the whole abstract', adm.status === 200 && adm.data.abstract === longAbstract, `${adm.status}`);
  const admIng = await call(`/api/admin/library/items/article/${ids.ingested}`, tok);
  check('and an admin still sees an abstract that is withheld from readers', admIng.data?.abstract === 'Not cleared for display.');

  section('Unchanged: full text and DOI');
  for (const [name, id] of [['long', ids.long], ['short', ids.short], ['none', ids.none]] as const) {
    const v = await call(`/api/content/${id}/view`, tok);
    const row = fixtures.find(f => f.id === id)!;
    const expectUrl = (row as any).originalUrl === null ? null : base.originalUrl;
    check(`${name}: file url, DOI, publisher link, title and authors are as stored`, v.data.url === base.pdfUrl && v.data.doi === base.doi && v.data.originalUrl === expectUrl && v.data.title === row.title && v.data.authors === base.authors && v.data.kind === 'article');
  }
  const r2 = await call(`/api/library/article/${ids.long}?abstract=preview`);
  check('the record keeps its DOI, publisher link and journal in preview mode', r2.data.doi === base.doi && r2.data.originalUrl === base.originalUrl && r2.data.journalName === 'Test Journal');
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}\n${serverLog.slice(-1500)}`);
} finally {
  await db.article.deleteMany({ where: { id: { startsWith: 'abs-prev-' } } });
  await db.book.deleteMany({ where: { id: { startsWith: 'abs-prev-' } } });
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
