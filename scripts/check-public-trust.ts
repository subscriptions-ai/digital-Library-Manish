import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { installPublicTrustRoutes } from '../src/server/publicTrust';
import { isPrivatePage, PUBLIC_PAGES, PUBLIC_REDIRECTS } from '../src/lib/publicSeo';

const app = express();
installPublicTrustRoutes(app);
app.use((_req, res) => res.send('Public shell'));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = (server.address() as { port: number }).port;
try {
  for (const [path, target] of Object.entries(PUBLIC_REDIRECTS)) {
    const [destination, hash] = target.split('#');
    const res = await fetch(`http://127.0.0.1:${port}${path}/?source=legacy`, { redirect: 'manual' });
    assert.equal(res.status, 301, path);
    assert.equal(res.headers.get('location'), `${destination}?source=legacy${hash ? `#${hash}` : ''}`);
  }
  for (const path of ['/admin', '/admin/users', '/sales', '/institution', '/dashboard/library', '/manager', '/publisher', '/studio', '/login', '/signup', '/payment/callback', '/unsubscribe/token']) {
    assert.ok(isPrivatePage(path), path);
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', path);
  }
  for (const path of [...Object.keys(PUBLIC_PAGES), '/preview/published', '/article/valid', '/book/valid', '/library/journal/valid']) {
    assert.equal(isPrivatePage(path), false, path);
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(res.headers.get('x-robots-tag'), null, path);
  }
  assert.ok(!Object.keys(PUBLIC_PAGES).some(isPrivatePage), 'No private pages in static sitemap');
  console.log('Public trust checks passed: permanent redirects, query preservation, private noindex, public indexing, sitemap exclusions.');
} finally { server.close(); }
