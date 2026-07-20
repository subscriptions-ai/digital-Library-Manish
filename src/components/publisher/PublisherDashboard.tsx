import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { FileText, BookOpen, Plus, X, CheckCircle2, Clock, AlertCircle, Handshake, ExternalLink } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  Draft: 'bg-amber-100 text-amber-700',
  Published: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

export function PublisherDashboard() {
  const [me, setMe] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'articles' | 'books'>('articles');
  const [modal, setModal] = useState<null | 'article' | 'book'>(null);

  const token = () => localStorage.getItem('token');
  const load = async () => {
    setLoading(true);
    try {
      const [meRes, cRes] = await Promise.all([
        fetch('/api/publisher/me', { headers: { Authorization: `Bearer ${token()}` } }),
        fetch('/api/publisher/content', { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      setMe(await meRes.json());
      const c = await cRes.json();
      setArticles(c.articles || []); setBooks(c.books || []);
    } catch { toast.error('Failed to load your workspace'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const counts = me?.counts || {};
  const allowed: string[] = me?.allowedContentTypes || ['Journals', 'Books'];
  const rows = tab === 'articles' ? articles : books;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome{me?.name ? `, ${me.name}` : ''}</h1>
        <p className="text-sm text-slate-500">Manage and submit your open-access catalogue.</p>
      </div>

      {me?.agreementNote && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
          <Handshake size={18} className="text-blue-600 mt-0.5 shrink-0" />
          <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">Partnership</p><p className="text-sm text-slate-700">{me.agreementNote}</p></div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Articles', value: counts.articles ?? 0, icon: <FileText size={18} className="text-emerald-600" />, bg: 'bg-emerald-50' },
          { label: 'Books', value: counts.books ?? 0, icon: <BookOpen size={18} className="text-indigo-600" />, bg: 'bg-indigo-50' },
          { label: 'Published', value: counts.articlesPublished ?? 0, icon: <CheckCircle2 size={18} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Pending Review', value: counts.articlesPending ?? 0, icon: <Clock size={18} className="text-amber-600" />, bg: 'bg-amber-50' },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-3">
            <div className={`p-3 rounded-xl ${s.bg}`}>{s.icon}</div>
            <div><p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{s.label}</p><p className="text-xl font-bold text-slate-900">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {(['articles', 'books'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg capitalize ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{t}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {allowed.includes('Journals') && <button onClick={() => setModal('article')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"><Plus size={14} /> Add Article</button>}
          {allowed.includes('Books') && <button onClick={() => setModal('book')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"><Plus size={14} /> Add Book</button>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400">No {tab} yet. Use "Add" to submit — it goes for review before publishing.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(r => (
              <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{r.title}</div>
                  <div className="text-[12px] text-slate-500">{r.authors || '—'}{tab === 'articles' && r.journalName ? ` • ${r.journalName}` : ''}{r.year ? ` • ${r.year}` : ''}</div>
                  {r.status === 'Rejected' && r.rejectionNote && (
                    <div className="mt-1 text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Rejected: {r.rejectionNote}</div>
                  )}
                  {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 font-semibold inline-flex items-center gap-1 mt-1"><ExternalLink size={11} /> PDF</a>}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && <SubmitModal type={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

function SubmitModal({ type, onClose, onSaved }: { type: 'article' | 'book'; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title?.trim()) { toast.error('Title is required'); return; }
    if (!form.pdfUrl?.trim()) { toast.error('PDF URL is required'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/publisher/${type === 'article' ? 'articles' : 'books'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success('Submitted for review'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Submit failed'); } finally { setBusy(false); }
  };

  const cls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500";
  const F = ({ label, k, ph }: any) => (
    <div><label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input className={cls} value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={ph} /></div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900 text-lg capitalize">Submit {type}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <F label={type === 'article' ? 'Article Title *' : 'Book Title *'} k="title" />
          <F label="Authors" k="authors" ph="Comma separated" />
          <F label="PDF URL *" k="pdfUrl" ph="https://... (open-access PDF)" />
          {type === 'article' ? (
            <>
              <div className="grid grid-cols-2 gap-3"><F label="Journal Name" k="journalName" /><F label="ISSN" k="journalIssn" /></div>
              <div className="grid grid-cols-3 gap-3"><F label="Volume" k="volume" /><F label="Issue" k="issue" /><F label="Year" k="year" /></div>
              <F label="DOI" k="doi" />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3"><F label="ISBN" k="isbn" /><F label="Year" k="year" /></div>
          )}
          <div className="grid grid-cols-2 gap-3"><F label="Domain / Department" k="domain" /><F label="Subject" k="subject" /></div>
          <div className="grid grid-cols-2 gap-3"><F label="Language" k="language" /><F label="Country" k="country" /></div>
          <p className="text-xs text-slate-500">Your submission stays in <b>Draft</b> until the STM team reviews and publishes it.</p>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 disabled:opacity-50">
            {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />} Submit for Review
          </button>
        </div>
      </div>
    </div>
  );
}
