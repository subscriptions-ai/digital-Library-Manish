/**
 * The newest things in one department, from the three shelves the library holds them on — pure functions, so what "latest" and
 * "added today" mean is written down once and can be tested without a screen.
 */

export type ShelfKind = 'articles' | 'books' | 'periodicals';
export const SHELVES: ShelfKind[] = ['articles', 'books', 'periodicals'];
export const SHELF_LABEL: Record<ShelfKind, string> = { articles: 'Articles', books: 'Books', periodicals: 'Periodicals' };

export type DeptItem = { key: string; shelf: ShelfKind; addedAt: number; raw: any };

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Midnight in India today, as an instant. The library counts its days in India time everywhere else. */
export function istDayStart(now: number = Date.now()): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/** When something reached the shelf: a new-collection row's createdAt, an archived row's publishedAt. */
const addedOf = (row: any): number => {
  const t = Date.parse(row?.createdAt || row?.publishedAt || '');
  return Number.isFinite(t) ? t : 0;
};

const named = (row: any) => typeof row?.title === 'string' && row.title.trim().length > 0;

/** Rows from one shelf, tagged with which shelf they came from. An untitled record is not offered. */
export function toItems(shelf: ShelfKind, rows: any[] | null | undefined): DeptItem[] {
  return (Array.isArray(rows) ? rows : []).filter(named).map(raw => ({ key: `${shelf}:${raw.id}`, shelf, addedAt: addedOf(raw), raw }));
}

/** The newest first, optionally one shelf only. A tie keeps a stable order, so the list does not shuffle between refreshes. */
export function latest(items: DeptItem[], show: 'all' | ShelfKind, limit: number): DeptItem[] {
  return items
    .filter(i => show === 'all' || i.shelf === show)
    .sort((a, b) => b.addedAt - a.addedAt || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/** Did anything in this list reach the shelf today (India time)? */
export function addedToday(items: DeptItem[], now: number = Date.now()): boolean {
  const start = istDayStart(now);
  return items.some(i => i.addedAt >= start);
}
