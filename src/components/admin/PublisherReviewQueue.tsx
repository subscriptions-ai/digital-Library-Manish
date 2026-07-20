import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { CheckCircle, XCircle, FileText, BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';

export function PublisherReviewQueue() {
  const [articles, setArticles] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'articles' | 'books'>('articles');
  const [busy, setBusy] = useState<string | null>(null);

  const token = () => localStorage.getItem('token');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/review/pending', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setArticles(data.articles || []);
      setBooks(data.books || []);
    } catch { toast.error('Failed to load review queue'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const act = async (model: 'article' | 'book', id: string, action: 'approve' | 'reject') => {
    let note = '';
    if (action === 'reject') {
      note = window.prompt('Reason for rejection (shown to the publisher):') || '';
      if (note === null) return;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/review/${model}/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success(action === 'approve' ? 'Published' : 'Rejected');
      if (model === 'article') setArticles(a => a.filter(x => x.id !== id));
      else setBooks(b => b.filter(x => x.id !== id));
    } catch (e: any) { toast.error(e.message || 'Action failed'); } finally { setBusy(null); }
  };

  const rows = tab === 'articles' ? articles : books;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ShieldCheck size={24} className="text-emerald-600" /> Content Review</h1>
        <p className="text-sm text-slate-500">Publisher-submitted content awaiting approval. Approve to publish, or reject with a reason.</p>
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        {(['articles', 'books'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            {t} ({t === 'articles' ? articles.length : books.length})
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
                    {r.domain ? ` • ${r.domain}` : ''}
                  </div>
                  {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 font-semibold inline-flex items-center gap-1 mt-1"><ExternalLink size={11} /> View PDF</a>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => act(tab === 'articles' ? 'article' : 'book', r.id, 'reject')} disabled={busy === r.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"><XCircle size={14} /> Reject</button>
                  <button onClick={() => act(tab === 'articles' ? 'article' : 'book', r.id, 'approve')} disabled={busy === r.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"><CheckCircle size={14} /> Approve</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
