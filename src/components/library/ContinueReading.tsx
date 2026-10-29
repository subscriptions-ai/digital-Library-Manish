import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Heart, History } from 'lucide-react';
import { itemPath, type ReaderBase } from '../../lib/readerBase';

/**
 * "Continue reading", for a reader who has something to continue — and the way to their Saved list and Reading History, always.
 *
 * It shows only what the server holds for THIS account (`/api/user/history` is keyed on the token, never on an id in the request): the
 * last things they opened here that they could read in full, with the page they reached. Nothing is recommended and nothing is invented;
 * an empty history shows no list at all, only the two links. An institution's aggregate analytics are a different endpoint and are not
 * used here, so a librarian sees their own reading, not their members'.
 */

type Entry = { id: string; kind: 'article' | 'book' | 'content' | 'video'; title: string | null; lastPage: number; lastReadAt: string; access: string; available: boolean };
const SHOWN = 3;

export function ContinueReading({ base }: { base: ReaderBase }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const savedPath = base === '/institution' ? '/institution/saved' : '/dashboard/library/saved';
  const historyPath = `${base}/history`;

  useEffect(() => {
    const ctl = new AbortController();
    setFailed(false);
    fetch(`/api/user/history?limit=12`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => setEntries(Array.isArray(d?.items) ? d.items : []))
      .catch(e => { if (e?.name !== 'AbortError') { setFailed(true); setEntries([]); } });
    return () => ctl.abort();
  }, [retry]);

  // Only what can be picked up again: a record that was read in full and is still on the shelf.
  const resumable = (entries ?? []).filter(e => e.available && e.title && (e.access === 'full' || e.access === 'video')).slice(0, SHOWN);

  return (
    <section aria-label="Your reading" className="mb-5 rounded-xl border border-rule bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"><BookOpen size={14} aria-hidden="true" /> Continue reading</h2>
        <nav aria-label="Your lists" className="flex items-center gap-4 text-[13px] font-semibold">
          <Link to={savedPath} className="inline-flex items-center gap-1.5 text-accent hover:underline"><Heart size={14} aria-hidden="true" /> Saved</Link>
          <Link to={historyPath} className="inline-flex items-center gap-1.5 text-accent hover:underline"><History size={14} aria-hidden="true" /> Reading history</Link>
        </nav>
      </div>

      {entries === null ? (
        <p className="mt-2 text-[13px] text-muted" role="status">Loading your recent reading…</p>
      ) : failed ? (
        <p className="mt-2 text-[13px] text-ink-2" role="alert">
          We could not load your recent reading. <button type="button" onClick={() => { setEntries(null); setRetry(n => n + 1); }} className="font-semibold text-accent hover:underline">Try again</button>
        </p>
      ) : resumable.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">Nothing to continue yet. What you open to read here will appear in this line.</p>
      ) : (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {resumable.map(e => (
            <li key={`${e.kind}-${e.id}`}>
              {/* Straight to the reader, which resumes at the saved page, rather than to the record page that offers a Read button. */}
              <Link to={itemPath(base, e.kind === 'video' ? 'video' : 'content', e.id)} className="group flex h-full items-start justify-between gap-2 rounded-lg border border-rule px-3 py-2 transition-colors hover:border-accent">
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink [overflow-wrap:anywhere] group-hover:text-accent">{e.title}</span>
                  <span className="tnum mt-0.5 block text-[11.5px] text-muted">{e.lastPage > 1 ? `Page ${e.lastPage} · ` : ''}{new Date(e.lastReadAt).toLocaleDateString()}</span>
                </span>
                <ArrowRight size={14} aria-hidden="true" className="mt-1 shrink-0 text-faint group-hover:text-accent" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
