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

  const btn = "min-w-[34px] h-[34px] px-2 inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const idle = "text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-600 dark:hover:text-blue-400";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      {total != null && pageSize != null ? (
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          Showing <b className="text-slate-700 dark:text-slate-200">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</b> of <b className="text-slate-700 dark:text-slate-200">{total}</b>
        </span>
      ) : <span />}

      <div className="flex items-center gap-1.5">
        <button onClick={() => go(1)} disabled={page <= 1} className={`${btn} ${idle}`} title="First"><ChevronsLeft size={15} /></button>
        <button onClick={() => go(page - 1)} disabled={page <= 1} className={`${btn} ${idle}`} title="Previous"><ChevronLeft size={15} /></button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="min-w-[24px] text-center text-slate-400 select-none">…</span>
            : <button key={p} onClick={() => go(p)}
                className={`${btn} ${p === page ? 'bg-blue-600 text-white border border-blue-600 shadow-sm shadow-blue-500/25' : idle}`}>{p}</button>
        )}
        <button onClick={() => go(page + 1)} disabled={page >= totalPages} className={`${btn} ${idle}`} title="Next"><ChevronRight size={15} /></button>
        <button onClick={() => go(totalPages)} disabled={page >= totalPages} className={`${btn} ${idle}`} title="Last"><ChevronsRight size={15} /></button>
      </div>
    </div>
  );
}
