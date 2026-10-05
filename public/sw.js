/* STM Digital Library service worker.
 *
 * Deliberately conservative. It exists so the site can be installed and so a
 * dropped connection shows a friendly page. It never keeps anything about a
 * person: pages, API responses, uploads and anything sent with credentials all
 * go straight to the network and are never written to a cache.
 *
 * Cached: the build's fingerprinted bundles (/assets/*), the icons and logo,
 * and one offline page. HTML is always fetched fresh so a deploy is seen at
 * once and a signed-in page is never replayed from disk.
 */
const VERSION = 'v1';
const STATIC_CACHE = `stm-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('stm-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isCacheableStatic = (url) =>
  url.pathname.startsWith('/assets/') && /\.(js|css|woff2?|png|jpe?g|webp|svg)$/.test(url.pathname)
  || url.pathname.startsWith('/icons/')
  || url.pathname === '/logo.png';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // third parties: not ours to cache
  if (req.headers.has('authorization')) return;                    // never anything sent with credentials
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // Page loads: network only, with the offline page when there is no network.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Fingerprinted bundles and icons: cache first, filled on first use.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
  // Everything else is left to the browser, untouched.
});
