import React, { useEffect, useState } from 'react';
import { NO_PUBLISHED_ARTICLES } from '../../lib/journalCopy';

/**
 * What the library holds of one journal, on a list row. A journal the catalogue offers may hold no published article yet; it is then
 * listed with a plain notice instead of three zeros, because "0 articles · 0 volumes · 0 issues" reads as a fault, not as a state.
 */
type Holdings = { articleCount: number; volumeCount: number; issueCount: number };

const num = (n: unknown) => (typeof n === 'number' ? n.toLocaleString() : '—');
export const holdsNothing = (j: Holdings) => j.articleCount === 0;

/** `part="mobile"` is the one-line form under the title; `part="desktop"` is the right-hand column. */
export function JournalHoldings({ j, part }: { j: Holdings; part: 'mobile' | 'desktop' }) {
  if (part === 'mobile') {
    return (
      <p className="tnum mt-2 font-mono text-[11.5px] text-muted sm:hidden">
        {holdsNothing(j) ? NO_PUBLISHED_ARTICLES : <>{num(j.articleCount)} articles · {num(j.volumeCount)} volumes · {num(j.issueCount)} issues</>}
      </p>
    );
  }
  if (holdsNothing(j)) {
    return <p className="hidden max-w-[11rem] shrink-0 self-center text-right text-[12px] leading-snug text-muted sm:block">{NO_PUBLISHED_ARTICLES}</p>;
  }
  return (
    <dl className="hidden shrink-0 gap-6 text-right sm:flex" aria-label="Holdings">
      {([['Articles', j.articleCount], ['Volumes', j.volumeCount], ['Issues', j.issueCount]] as const).map(([label, n]) => (
        <div key={label}>
          <dt className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</dt>
          <dd className="tnum mt-0.5 font-mono text-[14px] text-ink-2">{num(n)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A long list, a hundred rows at a time. Departments and subjects now hold thousands of titles; drawing them all at once would freeze a phone. */
export const PAGE = 100;
export function Windowed<T>({ items, children }: { items: T[]; children: (item: T, index: number) => React.ReactNode }) {
  const [count, setCount] = useState(PAGE);
  // A new search or a different list starts from the top again.
  useEffect(() => setCount(PAGE), [items.length]);
  const remaining = Math.max(0, items.length - count);
  return (
    <>
      {items.slice(0, count).map((item, i) => children(item, i))}
      {remaining > 0 && (
        <div className="border-t border-rule p-4 text-center">
          <button type="button" onClick={() => setCount(c => c + PAGE)}
            className="rounded-lg border border-rule px-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface">
            Show {Math.min(PAGE, remaining).toLocaleString()} more <span className="font-normal text-muted">({remaining.toLocaleString()} left)</span>
          </button>
        </div>
      )}
    </>
  );
}
