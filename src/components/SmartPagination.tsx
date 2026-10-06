import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  total?: number;
  pageSize?: number;
  className?: string;
}

// Build a compact page window with ellipses, e.g. 1 … 4 5 [6] 7 8 … 20
function buildPages(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  out.push(1);
  if (left > 2) out.push('…');
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push('…');
  out.push(total);
  return out;
}

export function SmartPagination({ page, totalPages, onChange, total, pageSize, className = '' }: Props) {
  if (totalPages <= 1) return null;
  const go = (p: number) => { const n = Math.min(totalPages, Math.max(1, p)); if (n !== page) { onChange(n); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const pages = buildPages(page, totalPages);

  // The shared button classes, square at 32px; the current page is the filled
  // one and is announced as such, not only shown in colour.
  const btn = "btn btn-sm min-w-[32px] px-2 tabular-nums";

  return (
    <nav aria-label="Pagination" className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      {total != null && pageSize != null ? (
        <span className="text-xs tabular-nums text-muted">
          Showing <b className="text-ink-2">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</b> of <b className="text-ink-2">{total}</b>
        </span>
      ) : <span />}

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => go(1)} disabled={page <= 1} className={`${btn} btn-outline btn-icon`} title="First" aria-label="First page"><ChevronsLeft size={16} aria-hidden="true" /></button>
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={`${btn} btn-outline btn-icon`} title="Previous" aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="min-w-[24px] select-none text-center text-faint" aria-hidden="true">…</span>
            : <button type="button" key={p} onClick={() => go(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined}
                className={`${btn} ${p === page ? 'btn-primary' : 'btn-outline'}`}>{p}</button>
        )}
        <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages} className={`${btn} btn-outline btn-icon`} title="Next" aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
        <button type="button" onClick={() => go(totalPages)} disabled={page >= totalPages} className={`${btn} btn-outline btn-icon`} title="Last" aria-label="Last page"><ChevronsRight size={16} aria-hidden="true" /></button>
      </div>
    </nav>
  );
}
