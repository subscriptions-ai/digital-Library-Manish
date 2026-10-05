import React from 'react';
import { useLocation } from 'react-router-dom';

const WHATSAPP_NUMBER = '919810078958';

/** Staff tools. A visitor-facing chat button has no place inside them. */
const HIDDEN_PREFIXES = ['/admin', '/manager', '/sales', '/studio'];

/**
 * Areas that render the Feedback widget (fixed bottom-6 right-6, about 48px
 * tall). The WhatsApp button sits above it there; elsewhere it takes the corner.
 */
const FEEDBACK_PREFIXES = ['/dashboard', '/institution'];

const startsWithSegment = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

const DEFAULT_MESSAGE =
  'Hello, I would like to know more about STM Digital Library and its access/subscription options.\n\nPlease assist me.';

function messageFor(pathname: string): string {
  if (/subscription|pricing|membership|\/pro$/.test(pathname)) {
    return 'Hello, I am interested in STM Digital Library subscription/access options. Please assist me.';
  }
  if (/\/(viewer|article|book|preview|journal)\b/.test(pathname)) {
    return 'Hello, I need assistance accessing research content on STM Digital Library.';
  }
  if (/\/(explore|library|digital-library|journals|search)\b/.test(pathname)) {
    return 'Hello, I am exploring the STM Digital Library Content Library and need assistance.';
  }
  if (/institution/.test(pathname)) {
    return 'Hello, I would like information about institutional access to STM Digital Library.';
  }
  return DEFAULT_MESSAGE;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.52 3.45A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z" />
    </svg>
  );
}

export function WhatsAppFloatingButton() {
  const { pathname, search } = useLocation();

  if (HIDDEN_PREFIXES.some(p => startsWithSegment(pathname, p))) return null;

  const aboveFeedback = FEEDBACK_PREFIXES.some(p => startsWithSegment(pathname, p));

  // Built at render so the link is a real href (works with middle-click and
  // copy-link). `search` is in the render path so the URL stays current when
  // only the query string changes; the title is read from the document, which
  // the pages set through Helmet.
  const pageTitle = (typeof document !== 'undefined' && document.title) || pathname;
  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}${pathname}${search}` : pathname;
  const text = `${messageFor(pathname)}\n\nPage: ${pageTitle}\nURL: ${pageUrl}`;
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

  // Feedback: bottom 24px + ~48px tall. 12px gap above it => 84px.
  const position = aboveFeedback ? 'bottom-[84px]' : 'bottom-6';

  return (
    <a
      href={href}
      onClick={e => {
        // The title can change after render (route change, async Helmet), so
        // rebuild the link at click time to be sure it matches what is on screen.
        const fresh = `${messageFor(window.location.pathname)}\n\nPage: ${document.title || window.location.pathname}\nURL: ${window.location.href}`;
        e.currentTarget.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(fresh)}`;
      }}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with STM Digital Library on WhatsApp"
      className={`group fixed right-6 ${position} mb-[var(--pwa-offset,0px)] z-40 flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition hover:bg-[#1ebe5b] hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 h-14 w-14`}
    >
      <WhatsAppIcon className="h-7 w-7 shrink-0" />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
      >
        Chat with us on WhatsApp
      </span>
    </a>
  );
}
