import React, { useState } from 'react';

/**
 * The charts both dashboards draw.
 *
 * They started on the librarian's page. When the reader's dashboard needed the
 * same three pictures, copying them would have been the start of the same drift
 * that had three screens quoting three different collection sizes — so they
 * live here, and a change to how reading is drawn happens once.
 *
 * Every one of them is one measure with a heading that names it, thin marks,
 * rounded data-ends, and a hover that answers for the mark under the pointer.
 */

const n = (x: number) => Number(x || 0).toLocaleString();

/**
 * Twelve weeks of reading, one bar a week.
 *
 * One series, so no legend — the heading names it — and one colour. The most
 * recent week is picked out because it is a particular week, not because it is
 * the tallest; colour that followed rank would move every time the data did.
 * Only the peak is labelled: a number over every bar is a table with extra
 * steps.
 */
export function Weeks({ data }: { data: number[] }) {
  const [over, setOver] = useState<number | null>(null);
  if (!data?.length) return null;

  // Always twelve slots, padded at the front. A single week of data was
  // becoming a single bar the width of the frame — a solid slab that looked
  // like a rendering fault rather than like one quiet week.
  const weeks = [...Array(Math.max(0, 12 - data.length)).fill(0), ...data].slice(-12);
  const max = Math.max(...weeks, 1);
  const peak = weeks.indexOf(max);

  return (
    <div>
      <div className="flex h-[120px] items-end gap-[3px]">
        {weeks.map((v, i) => {
          const last = i === weeks.length - 1;
          return (
            <div
              key={i}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setOver(i)}
              onMouseLeave={() => setOver(null)}
            >
              {/* A hit target taller than the bar, so a short week is still
                  easy to point at. */}
              <div className="absolute inset-0" />
              <div
                className={`w-full rounded-t-[4px] transition-colors ${
                  last ? 'bg-accent' : over === i ? 'bg-accent/70' : 'bg-accent-soft'}`}
                style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
              />
              {over === i && (
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-rule bg-surface px-2 py-1 text-[11px] text-ink shadow-lg">
                  <b className="tnum font-mono">{n(v)}</b> {v === 1 ? 'read' : 'reads'}
                  <span className="text-faint"> · {i === weeks.length - 1 ? 'this week' : `${weeks.length - 1 - i} weeks ago`}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-baseline justify-between font-mono text-[10.5px] text-faint">
        <span>12 weeks ago</span>
        <span>{max > 0 ? `peak ${n(max)} in week ${peak + 1}` : 'nothing read yet'}</span>
        <span>this week</span>
      </div>
    </div>
  );
}

/**
 * Magnitude across things with names — subjects, departments.
 *
 * Horizontal, because the labels are words and words read across; vertical bars
 * would have them turned on their side or cut short. One measure, one colour,
 * and the value sits at the end of its own bar rather than on an axis nobody
 * reads.
 */
export function Bars({ rows, unit }: { rows: { name: string; value: number }[]; unit: string }) {
  const [over, setOver] = useState<string | null>(null);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.value), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map(r => (
        <li
          key={r.name}
          onMouseEnter={() => setOver(r.name)}
          onMouseLeave={() => setOver(null)}
          className="cursor-default"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] text-ink-2">{r.name}</span>
            <span className="tnum shrink-0 font-mono text-[12px] text-muted">
              {n(r.value)} <span className="text-faint">{unit}</span>
            </span>
          </div>
          <div className="mt-1.5 h-[7px] w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full transition-colors ${over === r.name ? 'bg-accent' : 'bg-accent/55'}`}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * What each department actually holds — the whole of it, broken into shelves.
 *
 * This panel used to plot one number per department: articles. Next to a
 * library advertised as 61,706 items, a department reading "6,164 articles"
 * left a librarian to guess what the other shelves held and whether the
 * departments added up to the total. They do now — the same three shelves the
 * library total is made of, counted the same way.
 *
 * A stacked bar rather than a pie: there are twenty-odd departments, the
 * question is which of them is deepest, and length compares across rows in a
 * way that twenty-odd wedges cannot. The bar's own length is the department's
 * total, so the ranking is readable without reading a single number; the
 * segments inside it answer the second question — of what.
 */
export const SHELVES = [
  { key: 'articles', label: 'Articles', fill: 'bg-series-1', dot: 'bg-series-1' },
  { key: 'books', label: 'Books', fill: 'bg-series-2', dot: 'bg-series-2' },
  { key: 'other', label: 'Other', fill: 'bg-series-3', dot: 'bg-series-3' },
] as const;

export type Shelf = typeof SHELVES[number]['key'];
export type DeptRow = { name: string; articles: number; books: number; other: number; total: number };

export function Collection({ rows }: { rows: DeptRow[] }) {
  const [all, setAll] = useState(false);
  const [over, setOver] = useState<{ dept: string; shelf: Shelf } | null>(null);

  const max = Math.max(...rows.map(r => r.total), 1);
  const shown = all ? rows : rows.slice(0, 8);
  const sum = (k: Shelf) => rows.reduce((t, r) => t + r[k], 0);
  const grand = rows.reduce((t, r) => t + r.total, 0);

  return (
    <div>
      {/* The legend carries its own totals, so the three shelves are named and
          counted in one place instead of a colour key that says nothing. It is
          also the control: pointing at a shelf lifts that shelf out of every
          department at once, which is the comparison a stacked bar is otherwise
          bad at — middle segments share no baseline. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule pb-3">
        {SHELVES.map(sh => (
          <button
            key={sh.key} type="button"
            onMouseEnter={() => setOver({ dept: '', shelf: sh.key })}
            onMouseLeave={() => setOver(null)}
            className={`flex items-baseline gap-1.5 transition-opacity ${
              over && over.shelf !== sh.key ? 'opacity-40' : 'opacity-100'}`}
          >
            <span className={`inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-[3px] ${sh.dot}`} />
            <span className="text-[12px] text-ink-2">{sh.label}</span>
            <span className="tnum font-mono text-[12px] text-muted">{n(sum(sh.key))}</span>
          </button>
        ))}
        <span className="ml-auto tnum font-mono text-[11px] text-faint">{n(grand)} in all</span>
      </div>

      <ul className="mt-3.5 space-y-3">
        {shown.map(r => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-ink-2">{r.name}</span>
              <span className="tnum shrink-0 font-mono text-[12px] text-ink">{n(r.total)}</span>
            </div>

            <div className="relative mt-1.5">
              <div className="flex h-[9px] gap-[2px]" style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }}>
                {SHELVES.map((sh, i) => {
                  const v = r[sh.key];
                  if (!v) return null;
                  // Rounded where the bar actually ends, square where a segment
                  // is cut by the next one — so the 2px gap reads as a join and
                  // not as three separate bars.
                  const firstDrawn = SHELVES.findIndex(x => r[x.key] > 0) === i;
                  const lastDrawn = SHELVES.map(x => r[x.key] > 0).lastIndexOf(true) === i;
                  return (
                    <div
                      key={sh.key}
                      onMouseEnter={() => setOver({ dept: r.name, shelf: sh.key })}
                      onMouseLeave={() => setOver(null)}
                      style={{ flex: `${v} 1 0%` }}
                      className={`${sh.fill} h-full cursor-default transition-opacity ${
                        firstDrawn ? 'rounded-l-[4px]' : ''} ${lastDrawn ? 'rounded-r-[4px]' : ''} ${
                        over && over.shelf !== sh.key ? 'opacity-25' : 'opacity-100'}`}
                    />
                  );
                })}
              </div>

              {over?.dept === r.name && (
                <div className="pointer-events-none absolute -top-1.5 left-0 z-10 -translate-y-full whitespace-nowrap rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-[11px] text-ink shadow-lg">
                  <b className="tnum font-mono">{n(r[over.shelf])}</b>{' '}
                  {SHELVES.find(x => x.key === over.shelf)!.label.toLowerCase()}
                  <span className="text-faint">
                    {' '}· {Math.round((r[over.shelf] / Math.max(r.total, 1)) * 100)}% of {r.name}
                  </span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {rows.length > 8 && (
        <button
          type="button"
          onClick={() => setAll(v => !v)}
          className="mt-3.5 font-mono text-[10.5px] uppercase tracking-wider text-accent underline-offset-4 hover:underline"
        >
          {all ? 'Show the deepest eight' : `Show all ${rows.length} departments`}
        </button>
      )}
    </div>
  );
}

