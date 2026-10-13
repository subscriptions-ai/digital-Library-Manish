import { useLocation } from 'react-router-dom';
import { COMPANY_DETAILS } from '../config';
import { isPrivatePage, PUBLIC_REDIRECTS } from '../lib/publicSeo';
import { SITE_URL, staticPageSeo, type SeoPage } from '../lib/seoMeta';
import { SeoHead } from './SeoHead';

/**
 * The route's own metadata: the marketing pages' title, description and canonical (the same definition the server writes into the page
 * it sends), and noindex for everything private. A page with its own metadata overrides this one tag by tag, so it never doubles up.
 * The canonical is the path alone: a query string never makes a second page.
 */
export function RouteMetadata() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, '') || '/';
  const canonicalPath = (PUBLIC_REDIRECTS[path] || path).split('#')[0];
  const seo: SeoPage = {
    ...(staticPageSeo(canonicalPath) ?? {
      title: COMPANY_DETAILS.name,
      description: 'Explore academic resources and source information on STM Digital Library.',
      canonical: new URL(canonicalPath, SITE_URL).href,
    }),
    robots: isPrivatePage(path) ? 'noindex, nofollow' : 'index, follow',
  };
  return <SeoHead seo={seo} />;
}
