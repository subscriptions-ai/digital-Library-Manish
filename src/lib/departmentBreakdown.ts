/**
 * A department's holdings as three separate figures, never one sum: published books, published articles and public journal titles.
 * Journal titles are NOT part of the content-item total (a journal holds articles that are already counted); the total still comes from the catalogue's own count.
 */
export type DepartmentBreakdown = { books: number; articles: number; journalTitles: number };

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Build the breakdown for one department from the stats answer; null when the answer does not carry valid figures. */
export function breakdownFor(name: string, rows: unknown, journalTitles: unknown): DepartmentBreakdown | null {
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r: any) => r && r.name === name);
  const jt = journalTitles && typeof journalTitles === 'object' ? (journalTitles as Record<string, unknown>)[name] : 0;
  if (!row) return ok(jt) && jt > 0 ? { books: 0, articles: 0, journalTitles: jt } : null;
  if (!ok(row.books) || !ok(row.articles)) return null;
  return { books: row.books, articles: row.articles, journalTitles: ok(jt) ? jt : 0 };
}

const fmt = (n: number) => n.toLocaleString('en-IN');
/** "Books: 8 · Articles: 0 · Journal titles: 66" — always all three, so a zero is visible rather than implied. */
export const breakdownLine = (b: DepartmentBreakdown) => `Books: ${fmt(b.books)} · Articles: ${fmt(b.articles)} · Journal titles: ${fmt(b.journalTitles)}`;
