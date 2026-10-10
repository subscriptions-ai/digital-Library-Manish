import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { CheckCircle, XCircle, FileText, BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';

export function PublisherReviewQueue() {
  const [articles, setArticles] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'articles' | 'books' | 'ingested'>('articles');
  const [ingested, setIngested] = useState<any[]>([]);
  const [ingestedTotal, setIngestedTotal] = useState(0);
  const [departments, setDepartments] = useState<string[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const token = () => localStorage.getItem('token');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/review/pending', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setArticles(data.articles || []);
      setBooks(data.books || []);
      setIngestedTotal(data.ingestedBooks || 0);
    } catch { toast.error('Failed to load review queue'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const loadIngested = async (p: number) => {
    const res = await fetch(`/api/admin/review/ingested-books?page=${p}&limit=25`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) { toast.error('Failed to load ingested books'); return; }
    const d = await res.json();
    setIngested(d.books || []); setIngestedTotal(d.total || 0); setDepartments(d.departments || []); setPage(p);
    setPick(prev => ({ ...Object.fromEntries((d.books || []).map((b: any) => [b.id, b.suggested || ''])), ...prev }));
  };
  useEffect(() => { if (tab === 'ingested') loadIngested(1); }, [tab]);

  const act = async (model: 'article' | 'book', id: string, action: 'approve' | 'reject') => {
    let note = '';
    if (action === 'reject') {
      // Cancel on the prompt means "don't reject" — not "reject with no reason".
      const reason = window.prompt('Reason for rejection (shown to the publisher):');
      if (reason === null) return;
      note = reason;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/review/${model}/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ action, note, ...(model === 'book' && pick[id] ? { department: pick[id] } : {}) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success(action === 'approve' ? 'Published' : 'Rejected');
      if (model === 'article') setArticles(a => a.filter(x => x.id !== id));
      else { setBooks(b => b.filter(x => x.id !== id)); setIngested(b => b.filter(x => x.id !== id)); setIngestedTotal(n => (tab === 'ingested' ? Math.max(0, n - 1) : n)); }
    } catch (e: any) { toast.error(e.message || 'Action failed'); } finally { setBusy(null); }
  };

  const rows = tab === 'articles' ? articles : tab === 'books' ? books : ingested;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ShieldCheck size={24} className="text-emerald-600" /> Content Review</h1>
        <p className="text-sm text-slate-500">Content awaiting approval. Approve to publish, or reject with a reason. “Needs a department” holds harvested books whose subject was not clear enough to place automatically — they are not public until you choose a department.</p>
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        {(['articles', 'books', 'ingested'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            {t === 'ingested' ? 'Needs a department' : t} ({t === 'articles' ? articles.length : t === 'books' ? books.length : ingestedTotal})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400">Nothing pending review. 🎉</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(r => (
              <div key={r.id} className="p-5 flex items-start justify-between gap-4 hover:bg-slate-50/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {tab === 'articles' ? <FileText size={15} className="text-emerald-500 shrink-0" /> : <BookOpen size={15} className="text-indigo-500 shrink-0" />}
                    <span className="font-bold text-slate-900 truncate">{r.title}</span>
                  </div>
                  <div className="text-[12px] text-slate-500">
                    {r.authors || 'Unknown authors'} • {r.publisherName || 'Unknown publisher'}
                    {tab === 'articles' && r.journalName ? ` • ${r.journalName}${r.volume ? ` Vol ${r.volume}` : ''}${r.issue ? ` Iss ${r.issue}` : ''}${r.year ? ` (${r.year})` : ''}` : ''}
                    {r.domain ? ` • ${r.domain}` : ''}{tab === 'ingested' ? ` • ${r.source}${r.licence ? ` • ${r.licence}` : ' • no licence declared'}${r.year ? ` • ${r.year}` : ''}` : ''}
                  </div>
                  {tab === 'ingested' && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                      <label className="font-semibold" htmlFor={`dept-${r.id}`}>Department</label>
                      <select id={`dept-${r.id}`} className="border border-slate-300 rounded-md px-2 py-1 text-[12px]" value={pick[r.id] || ''} onChange={e => setPick(p => ({ ...p, [r.id]: e.target.value }))}>
                        <option value="">Choose…</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      {r.suggested && <span>suggested: <b>{r.suggested}</b> ({r.score}){r.runnerUp ? `, next: ${r.runnerUp.department} (${r.runnerUp.score})` : ''}</span>}
                    </div>
                  )}
                  {tab === 'ingested' && r.originalUrl && <a href={r.originalUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 font-semibold inline-flex items-center gap-1 mt-1"><ExternalLink size={11} /> Open at source</a>}
                  {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 font-semibold inline-flex items-center gap-1 mt-1"><ExternalLink size={11} /> View PDF</a>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => act(tab === 'articles' ? 'article' : 'book', r.id, 'reject')} disabled={busy === r.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"><XCircle size={14} /> Reject</button>
                  <button onClick={() => act(tab === 'articles' ? 'article' : 'book', r.id, 'approve')} disabled={busy === r.id || (tab === 'ingested' && !pick[r.id])}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"><CheckCircle size={14} /> Approve</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'ingested' && ingestedTotal > 25 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Page {page} of {Math.ceil(ingestedTotal / 25)}</span>
            <span className="flex gap-2">
              <button className="px-3 py-1 border rounded-md disabled:opacity-40" disabled={page <= 1} onClick={() => loadIngested(page - 1)}>Previous</button>
              <button className="px-3 py-1 border rounded-md disabled:opacity-40" disabled={page * 25 >= ingestedTotal} onClick={() => loadIngested(page + 1)}>Next</button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
