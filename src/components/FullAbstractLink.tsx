import { ExternalLink } from 'lucide-react';
import { landingPageUrl } from '../lib/abstractPreview';

/**
 * "Read full abstract at publisher", beneath an abstract preview. It goes to the record's own landing page and is
 * absent when the source gave us none, so there is never a dead link.
 */
export function FullAbstractLink({ urls, className = '' }: { urls: unknown[]; className?: string }) {
  const href = landingPageUrl(...urls);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener"
      className={`mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline ${className}`}>
      Read full abstract at publisher <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}
