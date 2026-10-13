import type { Express } from 'express';
import { isPrivatePage, PUBLIC_REDIRECTS } from '../lib/publicSeo';

export function installPublicTrustRoutes(app: Express) {
  app.use((req, res, next) => {
    // One address per page: www is only ever a pointer to the real site.
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    if (host === 'www.journalslibrary.com') return res.redirect(301, `https://journalslibrary.com${req.originalUrl}`);
    if (isPrivatePage(req.path)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const path = req.path.replace(/\/$/, '') || '/';
    const target = PUBLIC_REDIRECTS[path];
    if ((req.method === 'GET' || req.method === 'HEAD') && target) {
      const [destination, hash] = target.split('#');
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(301, `${destination}${query}${hash ? `#${hash}` : ''}`);
    }
    next();
  });
}
