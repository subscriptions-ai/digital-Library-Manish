import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { COMPANY_DETAILS } from '../config';
import { isPrivatePage, PUBLIC_PAGES, PUBLIC_REDIRECTS } from '../lib/publicSeo';

/** Defaults mount before route-specific metadata so real content titles can override them. */
export function RouteMetadata() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, '') || '/';
  const canonicalPath = PUBLIC_REDIRECTS[path] || path;
  const page = PUBLIC_PAGES[canonicalPath.split('#')[0]];
  return <Helmet>
    <title>{page ? `${page[0]} | ${COMPANY_DETAILS.name}` : COMPANY_DETAILS.name}</title>
    <meta name="description" content={page?.[1] || 'Explore academic resources and source information on STM Digital Library.'} />
    <meta name="robots" content={isPrivatePage(path) ? 'noindex, nofollow' : 'index, follow'} />
    <link rel="canonical" href={new URL(canonicalPath.split('#')[0], COMPANY_DETAILS.website).href} />
  </Helmet>;
}
