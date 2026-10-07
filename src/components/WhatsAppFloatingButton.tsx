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

/**
 * What the chat opens with, on every page. Visitors who write from here are mostly institutions
 * asking about access, so one message covers them; it names no page or address.
 */
const MESSAGE =
  'Hello,\nI’m interested in STM Digital Library for my institution. Please share details about institutional access, academic content, subscription options, librarian dashboard, usage analytics, and demo/quotation process.';

const HREF = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(MESSAGE)}`;

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88zM20.52 3.45A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z" />
    </svg>
  );
}

export function WhatsAppFloatingButton() {
  const { pathname } = useLocation();

  if (HIDDEN_PREFIXES.some(p => startsWithSegment(pathname, p))) return null;

  const aboveFeedback = FEEDBACK_PREFIXES.some(p => startsWithSegment(pathname, p));

  // The stack: Feedback (48px) takes the corner where it is shown and WhatsApp
  // sits one gap above it; both rise together over a sheet at the bottom.
  const position = aboveFeedback
    ? 'bottom-[calc(var(--fab-bottom)+48px+var(--fab-gap))]'
    : 'bottom-[var(--fab-bottom)]';

  return (
    <a
      href={HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with STM Digital Library on WhatsApp"
      className={`${pathname === '/signup' ? 'fab-avoid-form ' : ''}group fixed right-[var(--fab-right)] ${position} mb-[max(var(--pwa-offset,0px),var(--cookie-offset,0px))] z-40 flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-[#25D366] text-white shadow-[var(--shadow-pop)] transition-[margin,background-color] duration-200 hover:bg-[#1ebe5b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 sm:h-14 sm:w-14`}
    >
      <WhatsAppIcon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
      >
        Chat with us on WhatsApp
      </span>
    </a>
  );
}
