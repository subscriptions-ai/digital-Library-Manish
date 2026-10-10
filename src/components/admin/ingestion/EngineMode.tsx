import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { api } from './api';
import { N } from './format';

const MODES = [
  ['auto', 'Everything', 'Journals, books and articles in rotation — right for keeping the catalogue up to date.'],
  ['books', 'Books', 'Every pass reads from the DOAB, OAPEN, Open Textbook Library and NCBI Bookshelf catalogue feeds, from where each last stopped.'],
  ['journals', 'Journals', 'Every pass reads 100 journals from DOAJ and decides each licence.'],
  ['articles', 'Articles', 'Every pass fills one journal from OpenAlex.'],
] as const;

export function EngineMode({ state, coverage, onChanged }: { state: any; coverage: any[]; onChanged: () => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const focus: string = state.focus || 'auto';
  const open = (k: 'doaj' | 'doab') => coverage.reduce((n, c) => n + (c[k]?.termsOpen || 0), 0);
  const booksOai = !!state.booksHarvest?.oai;
  // Book passes under OAI follow a checkpoint, not department sweeps, so "no sweeps left" says nothing about them.
  const nothingLeft = (focus === 'journals' && coverage.length && open('doaj') === 0) || (focus === 'books' && !booksOai && coverage.length && open('doab') === 0);

  const choose = async (id: string) => {
    if (id === focus) return;
    setPending(id);
    const r = await api('/api/admin/ingest/state', { method: 'POST', body: { focus: id } });
    setPending(null);
    if (!r.ok) { toast.error(r.data?.error || 'Could not change the mode.'); return; }
    toast.success(`Mode: ${MODES.find(m => m[0] === id)?.[1]}`);
    onChanged();
  };

  return (
    <section className="card card-pad" aria-labelledby="mode-heading">
      <h2 id="mode-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Engine mode</h2>
      <div className="segmented mt-3" role="group" aria-label="What the engine works on">
        {MODES.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={focus === id} disabled={pending !== null} onClick={() => choose(id)}>
            {pending === id ? 'Saving…' : label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {focus === 'auto'
          ? 'One pass a minute, shared out: one in five looks for new titles, the rest fetch articles.'
          : `Every pass will do ${MODES.find(m => m[0] === focus)?.[1].toLowerCase()} and nothing else, one a minute, for as long as the engine is running. It keeps going with this screen closed. Set it back to Everything when you are done.`}
      </p>
      {nothingLeft && (
        <p role="status" className="mt-3 rounded-lg border border-caution/40 bg-caution-soft px-3 py-2 text-[12.5px] leading-relaxed text-ink">
          <b>There are no more {focus} to fetch.</b> Every department has been walked to the end of {focus === 'journals' ? 'DOAJ' : 'DOAB'}, so passes will do nothing while this is chosen.
          Sources are looked at again a month after they run out.
        </p>
      )}
      <p className="sr-only">{N(coverage.length)} departments tracked</p>
    </section>
  );
}
