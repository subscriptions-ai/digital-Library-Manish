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
import { buildAbstractPreview, abstractToPlainText, abstractPreviewFor, publicArticle, publicBook, publicContent, landingPageUrl, ABSTRACT_PREVIEW_MAX } from '../src/lib/abstractPreview.js';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);
const isPreview = (s: any, min = 1) => typeof s === 'string' && len(s) >= min && len(s) <= 400;
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
const doab = (o: any) => ({ description: 'About the book.', ownershipSource: 'Ingested', source: 'DOAB', licence: 'CC BY', licenceIsNC: false, ...o });
check('an ingested DOAB book with an open licence shows its description preview', abstractPreviewFor('book', doab({})) === 'About the book.');
check('CC0, CC BY-SA and public domain are open too', ['CC0', 'CC BY-SA', 'Public Domain'].every(l => abstractPreviewFor('book', doab({ licence: l })) === 'About the book.'));
check('a non-commercial, no-derivatives, GNU FDL or undeclared licence shows none', ['CC BY-NC', 'CC BY-NC-SA', 'CC BY-NC-ND', 'CC BY-ND', 'GNU FDL', null, ''].every(l => abstractPreviewFor('book', doab({ licence: l, licenceIsNC: l === null ? true : /NC|FDL/.test(String(l)) })) === null));
check('an open licence flagged non-commercial, or with the flag unset, shows none', abstractPreviewFor('book', doab({ licenceIsNC: true })) === null && abstractPreviewFor('book', doab({ licenceIsNC: null })) === null);
check('an ingested book from a source not cleared (Google Books, NLM, Open Library) shows none even with an open licence', ['GoogleBooks', 'NLMCatalog', 'OpenLibrary', 'OpenLibraryDump', ''].every(src => abstractPreviewFor('book', doab({ source: src })) === null));
check('a rejected record does not', abstractPreviewFor('book', { description: 'About.', ownershipSource: 'Ingested', source: 'DOAB', rightsStatus: 'Rejected' }) === null);
check('legacy content has no catalogue preview', abstractPreviewFor('content', { description: 'x', abstract: 'x' }) === null);

section('Helper: the shapes public endpoints send');
const pa = publicArticle({ id: 'a', abstract: 'x'.repeat(2000), ownershipSource: 'AdminEntered', title: 't' }) as any;
check('publicArticle removes `abstract` and carries at most 400 characters', !('abstract' in pa) && len(pa.abstractPreview) === 400 && pa.title === 't');
const pb = publicBook({ id: 'b', ...doab({ description: 'y'.repeat(2000) }) }) as any;
check('publicBook removes `description` and carries at most 400 characters', !('description' in pb) && len(pb.abstractPreview) === 400);
check('publicBook for a record that is not cleared carries null and no text', (() => { const o = publicBook({ description: 'secret', ...doab({ licence: null, licenceIsNC: true }) }) as any; return o.abstractPreview === null && !JSON.stringify(o).includes('secret'); })());
const pc = publicContent({ id: 'c', contentType: 'Theses', description: 'z'.repeat(2000) }) as any;
check('publicContent caps the legacy description at 400', len(pc.description) === 400 && pc.description === pc.abstractPreview);
check('publicContent leaves a video description alone', (publicContent({ contentType: 'Educational Videos', description: 'v'.repeat(900) }) as any).description.length === 900);
check('publicContent leaves a row with no description alone', (publicContent({ contentType: 'Theses', description: null }) as any).description === null);
check('landingPageUrl takes the first web address and nothing else', landingPageUrl(null, 'javascript:alert(1)', 'ftp://x', 'https://pub.example/a', 'http://other.example') === 'https://pub.example/a' && landingPageUrl('doi:10.1/x', undefined) === null);

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
const ids = { content: 'abs-prev-content', bookNc: 'abs-prev-book-nc', bookNd: 'abs-prev-book-nd', bookNoLic: 'abs-prev-book-nolic', long: 'abs-prev-long', short: 'abs-prev-short', none: 'abs-prev-none', html: 'abs-prev-html', uni: 'abs-prev-uni', ingested: 'abs-prev-ingested', book: 'abs-prev-book', bookGoogle: 'abs-prev-book-google' };
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
const bookBase = { status: 'Published', ownershipSource: 'Ingested', licence: 'CC BY', licenceIsNC: false, domain: 'Biotechnology', originalUrl: 'https://library.example/handle/1', doi: '10.1234/book.test', authors: 'B. Author', year: 2022 };
await db.book.upsert({ where: { id: ids.book }, create: { ...bookBase, id: ids.book, title: 'A DOAB book', source: 'DOAB', description: longAbstract } as any, update: { ...bookBase, title: 'A DOAB book', source: 'DOAB', description: longAbstract } as any });
const extraBooks: [string, string, any][] = [
  [ids.bookGoogle, 'A Google book', { source: 'GoogleBooks', description: 'Not cleared: source.' }],
  [ids.bookNc, 'A non-commercial book', { source: 'DOAB', licence: 'CC BY-NC', licenceIsNC: true, description: 'Not cleared: NC.' }],
  [ids.bookNd, 'A no-derivatives book', { source: 'DOAB', licence: 'CC BY-ND', licenceIsNC: false, description: 'Not cleared: ND.' }],
  [ids.bookNoLic, 'An undeclared-licence book', { source: 'DOAB', licence: null, licenceIsNC: true, description: 'Not cleared: undeclared.' }],
];
for (const [id, title, o] of extraBooks) await db.book.upsert({ where: { id }, create: { ...bookBase, id, title, ...o } as any, update: { ...bookBase, title, ...o } as any });
await db.content.upsert({ where: { id: ids.content }, create: { id: ids.content, title: 'AbsPrev legacy thesis', authors: 'C. Author', domain: 'Biotechnology', contentType: 'Theses', status: 'Published', description: longAbstract } as any, update: { description: longAbstract, status: 'Published' } as any });

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
  check('a DOAB book (open licence): preview of its description, never the whole', vBook.status === 200 && isPreview(vBook.data.abstractPreview, 300) && !vBook.text.includes(MARKER));
  const vGoogle = await call(`/api/content/${ids.bookGoogle}/view`, tok);
  check('a book from a source not cleared shows none and sends none', vGoogle.data.abstractPreview === null && !vGoogle.text.includes('Not cleared'));

  section('Public: every reader endpoint sends a preview and never the abstract');
  const noToken = (path: string) => call(path);
  const sweep: [string, string, (r: any) => boolean][] = [
    ['article record', `/api/library/article/${ids.long}`, r => !('abstract' in r.data) && isPreview(r.data.abstractPreview, 300) && r.data.abstractPreview.endsWith('\u2026')],
    ['article record (the old ?abstract=preview form)', `/api/library/article/${ids.long}?abstract=preview`, r => !('abstract' in r.data) && isPreview(r.data.abstractPreview, 300)],
    ['article list', `/api/library/articles?search=${encodeURIComponent('Long abstract')}`, r => r.data.data.some((a: any) => a.id === ids.long && !('abstract' in a) && isPreview(a.abstractPreview, 300))],
    ['article list (unicode)', `/api/library/articles?search=${encodeURIComponent('Unicode abstract')}`, r => r.data.data.some((a: any) => a.id === ids.uni && isPreview(a.abstractPreview, 400))],
    ['book list', `/api/library/books?search=${encodeURIComponent('A DOAB book')}`, r => r.data.data.some((b: any) => b.id === ids.book && !('description' in b) && isPreview(b.abstractPreview, 300))],
    ['book record', `/api/library/book/${ids.book}`, r => !('description' in r.data.book) && isPreview(r.data.book.abstractPreview, 300) && !('licence' in r.data.book) && !('source' in r.data.book)],
    ['legacy content list', `/api/content/list?search=${encodeURIComponent('AbsPrev legacy thesis')}`, r => r.data.data.some((c: any) => c.id === ids.content && isPreview(c.description, 300) && c.description === c.abstractPreview)],
    ['legacy content (public page)', `/api/public/content/${ids.content}`, r => isPreview(r.data.description, 300)],
    ['legacy content record', `/api/library/content/${ids.content}`, r => isPreview(r.data.description, 300)],
  ];
  for (const [name, path, ok] of sweep) {
    // The legacy record endpoint is for signed-in readers only; everything else is open.
    for (const [who, token] of (name === 'legacy content record' ? [['signed in', tok]] : [['logged out', undefined], ['signed in', tok]]) as [string, string | undefined][]) {
      const r = await call(path, token);
      check(`${name}, ${who}: preview only, the tail is not in the response`, r.status === 200 && ok(r) && !r.text.includes(MARKER) && !r.text.includes('Sentence 20 '), `${r.status}`);
    }
  }
  const rNone = await noToken(`/api/library/article/${ids.none}`);
  check('no abstract → abstractPreview null', rNone.data.abstractPreview === null);
  const rIng = await noToken(`/api/library/article/${ids.ingested}`);
  check('an uncleared ingested abstract is not sent', rIng.data.abstractPreview === null && !rIng.text.includes('Not cleared'));
  for (const [name, id] of [['Google Books', ids.bookGoogle], ['non-commercial', ids.bookNc], ['no-derivatives', ids.bookNd], ['undeclared licence', ids.bookNoLic]] as const) {
    const r = await noToken(`/api/library/book/${id}`);
    check(`a ${name} book: no preview and none of its text is sent`, r.status === 200 && r.data.book.abstractPreview === null && !r.text.includes('Not cleared'), `${r.status}`);
  }
  const bl = await noToken(`/api/library/books?search=${encodeURIComponent('book')}&limit=100`);
  check('the book list leaks no withheld description either', bl.status === 200 && !bl.text.includes('Not cleared'));

  section('Favourites: the saved card carries the preview');
  const uid = (jwt.decode(tok) as any).uid;
  await db.favorite.deleteMany({ where: { userId: uid } });
  for (const [t, id] of [['Article', ids.long], ['Book', ids.book], ['Content', ids.content]] as const) await db.favorite.create({ data: { userId: uid, itemType: t, contentId: id } });
  const fav = await call('/api/user/favorites', tok);
  check('three saved cards, each with at most 400 characters of description and none of the tail', fav.status === 200 && fav.data.length === 3 && fav.data.every((f: any) => isPreview(f.description, 300) && !('abstract' in f)) && !fav.text.includes(MARKER), `${fav.status} ${fav.data?.length}`);
  await db.favorite.deleteMany({ where: { userId: uid } });

  section('Unchanged: admin editors still read the whole abstract');
  const adm = await call(`/api/admin/library/items/article/${ids.long}`, tok);
  check('the admin editor still receives the whole abstract', adm.status === 200 && adm.data.abstract === longAbstract, `${adm.status}`);
  const admIng = await call(`/api/admin/library/items/article/${ids.ingested}`, tok);
  check('and an admin still sees an abstract that is withheld from readers', admIng.data?.abstract === 'Not cleared for display.');
  const admBook = await call(`/api/admin/library/items/book/${ids.book}`, tok);
  check('and the whole book description', admBook.status === 200 && (admBook.data.description === longAbstract || admBook.data.abstract === longAbstract), `${admBook.status}`);
  const admContent = await call(`/api/admin/content/${ids.content}`, tok);
  check('and the whole legacy description', admContent.status === 200 && admContent.data.description === longAbstract, `${admContent.status}`);

  section('Unchanged: full text and DOI');
  for (const [name, id] of [['long', ids.long], ['short', ids.short], ['none', ids.none]] as const) {
    const v = await call(`/api/content/${id}/view`, tok);
    const row = fixtures.find(f => f.id === id)!;
    const expectUrl = (row as any).originalUrl === null ? null : base.originalUrl;
    check(`${name}: file url, DOI, publisher link, title and authors are as stored`, v.data.url === base.pdfUrl && v.data.doi === base.doi && v.data.originalUrl === expectUrl && v.data.title === row.title && v.data.authors === base.authors && v.data.kind === 'article');
  }
  const r2 = await call(`/api/library/article/${ids.long}`);
  check('the record keeps its DOI, publisher link and journal', r2.data.doi === base.doi && r2.data.originalUrl === base.originalUrl && r2.data.journalName === 'Test Journal');
} catch (e: any) {
  fail++; console.log(`  FAIL  the suite stopped: ${e?.stack || e}\n${serverLog.slice(-1500)}`);
} finally {
  await db.article.deleteMany({ where: { id: { startsWith: 'abs-prev-' } } });
  await db.book.deleteMany({ where: { id: { startsWith: 'abs-prev-' } } });
  await db.content.deleteMany({ where: { id: { startsWith: 'abs-prev-' } } });
  await shutdown();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
