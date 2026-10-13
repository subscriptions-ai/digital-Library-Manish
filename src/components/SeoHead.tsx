import { Helmet } from '../lib/head';
import type { SeoPage } from '../lib/seoMeta';

/** The page's metadata, from the same definition the server used when it wrote the page. */
export function SeoHead({ seo }: { seo: SeoPage }) {
  return (
    <Helmet>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <meta name="robots" content={seo.robots ?? 'index, follow'} />
      <link rel="canonical" href={seo.canonical} />
      <meta property="og:site_name" content="STM Digital Library" />
      <meta property="og:type" content={seo.type ?? 'website'} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      <meta property="og:url" content={seo.canonical} />
      {seo.image && <meta property="og:image" content={seo.image} />}
      <meta name="twitter:card" content={seo.image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.description} />
      {seo.image && <meta name="twitter:image" content={seo.image} />}
      {(seo.jsonLd ?? []).map((ld, i) => <script key={i} type="application/ld+json">{JSON.stringify(ld)}</script>)}
    </Helmet>
  );
}

