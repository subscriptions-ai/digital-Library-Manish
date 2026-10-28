import { useLocation } from 'react-router-dom';

/**
 * The reading dashboards that exist: the individual and member one under /dashboard, the institution one under /institution. A saved item or a
 * history entry has to open inside the dashboard the reader is in, so the links below it are built from this one prefix.
 */
export type ReaderBase = '/dashboard' | '/institution';

export const readerBaseOf = (pathname: string): ReaderBase => (pathname === '/institution' || pathname.startsWith('/institution/') ? '/institution' : '/dashboard');

export const useReaderBase = (): ReaderBase => readerBaseOf(useLocation().pathname);

/** Where an item opens: its record for an article, the player for a video, the reader for everything else. */
export function itemPath(base: ReaderBase, kind: 'article' | 'book' | 'content' | 'video', id: string): string {
  if (kind === 'article') return `${base}/article/${id}`;
  if (kind === 'video') return `${base}/videos/player/${id}`;
  return `${base}/viewer/${id}`;
}
