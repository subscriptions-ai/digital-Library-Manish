import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Badge, Button, type BadgeTone } from '../../ui';
import { api } from './api';
import { N } from './format';

/**
 * Full-text candidates: Books the Open Library / Internet Archive audit found openly readable under a licence that allows our use. A person looks at the evidence and records
 * Approve for future ingestion, Hold, or Reject. A decision is a RECORD: nothing is downloaded, no file is stored, and the Book itself is not changed. The server refuses an
 * Approve unless the edition is confirmed AND the licence is one our policy allows; anything unclear should be a Hold.
 */

const STATES: [string, string][] = [['pending', 'To review'], ['approved', 'Approved'], ['approvedNeedsReview', 'Approved — look again'], ['hold', 'On hold'], ['rejected', 'Rejected'], ['all', 'All']];
const TONE: Record<string, BadgeTone> = { pending: 'neutral', approved: 'success', approvedNeedsReview: 'caution', hold: 'caution', rejected: 'alarm' };
const LABEL: Record<string, string> = Object.fromEntries(STATES);
const BASIS: Record<string, string> = { edition: 'The Archive item names this Open Library edition', isbn: 'The Archive item carries this ISBN', work: 'The Archive item names this Open Library work' };
const mb = (n?: number | null) => (n ? `${(n / 1048576).toFixed(1)} MB` : '—');

export function FullTextCandidates() {
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState('pending');
  const [department, setDepartment] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ state, page: String(page), pageSize: '15', ...(department ? { department } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
    const r = await api(`/api/admin/books/fulltext-candidates?${qs}`);
    if (r.ok) { setData(r.data); setFailed(false); } else setFailed(true);
  }, [state, department, q, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const decide = async (it: any, decision: 'approve' | 'hold' | 'reject') => {
    setBusy(`${it.row.bookId}:${decision}`); setErr(null);
    const r = await api(`/api/admin/books/fulltext-candidates/${it.row.bookId}/decision`, { method: 'POST', body: { decision, note: note.trim() || undefined, expectedFingerprint: it.row.sourceFingerprint } });
    setBusy(null);
    if (!r.ok) { setErr(r.data?.error || 'Could not record that.'); return; }
    toast.success(decision === 'approve' ? 'Approved for future ingestion — nothing was downloaded' : decision === 'hold' ? 'Put on hold' : 'Rejected'); setNote(''); setOpen(null); load();
  };

  const run = data?.run, sum = data?.summary;
  return (
    <section className="card card-pad" aria-labelledby="ftc-heading">
      <h2 id="ftc-heading" className="text-base font-semibold text-ink">Full-text candidates</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
        Open Library Books whose Internet Archive item is openly readable under a licence that allows our use. Look at the evidence, then approve for future ingestion, hold, or reject. A decision is only a record: nothing is downloaded or stored, and the Book is not changed. When you are unsure, hold.
      </p>

      {!data ? (failed ? <p role="status" className="mt-3 text-[12.5px] text-muted">The candidates could not be read just now.</p> : <span aria-hidden="true" className="skeleton mt-3 block h-24 w-full" />) : (
        <>
          <p role="status" className="mt-3 text-[12.5px] text-ink-2">
            {run ? <>Audit saved {new Date(run.savedAt).toLocaleString()} · {N(run.booksAudited)} Books audited · <b>{N(sum.total)}</b> candidate{sum.total === 1 ? '' : 's'}{run.incomplete ? ` · incomplete: ${run.incompleteReasons.join('; ')}` : run.wholeScope ? '' : ' · a partial audit'}</>
              : <>No audit has been saved here yet. Run <code className="rounded bg-surface-2 px-1">npx tsx scripts/ol-fulltext-audit.ts --save</code> on the server; it lists the candidates and writes nothing to any Book.</>}
          </p>

          {sum.total > 0 && (
            <>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="segmented" role="tablist" aria-label="Decision">
                  {STATES.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={state === id} aria-pressed={state === id} onClick={() => { setState(id); setPage(1); }}>{label}{id !== 'all' && sum.byState[id] ? ` ${sum.byState[id]}` : ''}</button>)}
                </div>
                <select className="input h-9 w-auto py-0 text-[13px]" aria-label="Department" value={department} onChange={e => { setDepartment(e.target.value); setPage(1); }}>
                  <option value="">All departments</option>
                  {Object.entries(sum.byDepartment).sort().map(([d, n]: any) => <option key={d} value={d}>{d} ({n})</option>)}
                </select>
                <input className="input h-9 w-44 py-0 text-[13px]" placeholder="Title, ISBN, id…" aria-label="Search candidates" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
              </div>
              <p className="mt-2 text-[12px] text-muted">{Object.entries(sum.byLicence).map(([l, n]: any) => `${l} ${n}`).join(' · ')}{' · '}{Object.entries(sum.byFormat).map(([f, n]: any) => `${f} ${n}`).join(' · ')}</p>
            </>
          )}
          {err && <p role="alert" className="mt-2 rounded-lg bg-alarm-soft px-3 py-2 text-[12.5px] text-ink">{err}</p>}

          {sum.total > 0 && (data.items.length === 0 ? <p className="mt-4 text-[13px] text-muted">Nothing here for these filters.</p> : (
            <ul className="mt-3 divide-y divide-rule/60 rounded-xl border border-rule">
              {data.items.map((it: any) => {
                const r = it.row, e = r.evidence, isOpen = open === r.bookId; const cant = it.problems.length > 0;
                return (
                  <li key={r.bookId} className="px-3.5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 basis-48">
                        <div className="font-medium text-ink [overflow-wrap:anywhere]">{r.title}</div>
                        <div className="mt-0.5 text-[12.5px] text-muted [overflow-wrap:anywhere]">{[r.authors, r.year, r.isbn && `ISBN ${r.isbn}`].filter(Boolean).join(' · ') || '—'}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={TONE[it.state] || 'neutral'}>{LABEL[it.state] || it.state}</Badge>
                          <Badge tone="accent">{r.licence}</Badge>
                          <Badge tone="neutral">{r.format}</Badge>
                          <span className="text-[12px] text-muted">{r.department}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { setOpen(isOpen ? null : r.bookId); setNote(''); setErr(null); }} aria-expanded={isOpen}>{isOpen ? 'Close' : 'Review'}</Button>
                    </div>

                    {it.sourceChangedSinceDecision && <p role="status" className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink">The source changed after this was decided. Look at it again.</p>}
                    {it.stale && <p role="status" className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink">The latest audit no longer finds this a candidate.</p>}

                    {isOpen && (
                      <div className="mt-3 space-y-3 text-[13px]">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                          {([
                            ['Open Library', <a className="link [overflow-wrap:anywhere]" href={r.olUrl || `https://openlibrary.org/books/${r.olEdition}`} target="_blank" rel="noreferrer noopener">{r.olId || r.olEdition || '—'}</a>],
                            ['Internet Archive', <a className="link [overflow-wrap:anywhere]" href={r.landingUrl} target="_blank" rel="noreferrer noopener">{r.ocaid}</a>],
                            ['Source', r.source || '—'],
                            ['Licence', r.licence],
                            ['Licence address', r.licenceUrl ? <a className="link [overflow-wrap:anywhere]" href={r.licenceUrl} target="_blank" rel="noreferrer noopener">{r.licenceUrl}</a> : '—'],
                            ['Access', 'Openly readable (not lending, not restricted)'],
                            ['Formats on the item', (e.formats || []).join(', ') || '—'],
                            ['File we would take', `${r.file.name} · ${mb(r.file.size)}`],
                          ] as [string, any][]).map(([k, v]) => <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{k}</dt><dd className="text-ink [overflow-wrap:anywhere]">{v}</dd></div>)}
                        </dl>
                        <div className="rounded-lg border border-rule bg-surface-2 px-3 py-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Evidence this is the same edition</div>
                          <p className="mt-0.5 text-ink-2">{BASIS[e.identityBasis] || 'Not confirmed'}. Matched through its Open Library {e.via === 'edition' ? 'edition id' : e.via === 'isbn' ? 'ISBN' : 'work id'}{e.olEditionOnArchive ? `; the item records edition ${e.olEditionOnArchive}` : ''}.</p>
                          <p className="mt-1 text-[12px] text-muted">The licence is declared by whoever uploaded the item. It is a reason to look closely, not proof of rights.</p>
                        </div>
                        {it.decision && <p className="text-[12.5px] text-muted">Last decision: <b className="text-ink">{LABEL[it.decision.decision === 'approve' ? 'approved' : it.decision.decision === 'hold' ? 'hold' : 'rejected']}</b> by {it.decision.by || 'unknown'} on {new Date(it.decision.at).toLocaleString()}{it.decision.note ? ` — “${it.decision.note}”` : ''}</p>}
                        {cant && <p role="status" className="rounded-lg bg-alarm-soft px-3 py-2 text-[12.5px] text-ink">It cannot be approved: {it.problems.join('; ')}. Hold it instead.</p>}
                        <label className="block text-[12px] font-medium text-ink-2">Note (required to reject)
                          <textarea className="input mt-1 w-full" rows={2} maxLength={500} value={note} onChange={ev => setNote(ev.target.value)} placeholder="Why — for the next person who looks at this" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => decide(it, 'approve')} loading={busy === `${r.bookId}:approve`} disabled={!!busy || cant}>Approve for future ingestion</Button>
                          <Button variant="outline" onClick={() => decide(it, 'hold')} loading={busy === `${r.bookId}:hold`} disabled={!!busy}>Hold</Button>
                          <Button variant="outline" onClick={() => decide(it, 'reject')} loading={busy === `${r.bookId}:reject`} disabled={!!busy || !note.trim()}>Reject candidate</Button>
                        </div>
                        <p className="text-[12px] text-muted">Approving records your decision and the evidence above. It does not download the file and does not change the Book.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}

          {data.pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
              <span>{N(data.total)} candidates · page {data.page} of {data.pages}</span>
              <span className="flex gap-1.5"><Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => setPage(p => p + 1)}>Next</Button></span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
