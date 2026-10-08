import type { Express } from 'express';
import { isPrivatePage, PUBLIC_REDIRECTS } from '../lib/publicSeo';

export function installPublicTrustRoutes(app: Express) {
  app.use((req, res, next) => {
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
