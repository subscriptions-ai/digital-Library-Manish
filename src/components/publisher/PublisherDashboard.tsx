import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  FileText, BookOpen, Plus, X, CheckCircle2, Clock, AlertCircle, Handshake,
  ExternalLink, FileSignature, UploadCloud, ShieldCheck, PenLine, Layers, Loader2, Eye, TrendingUp,
  MessageSquare, Send,
} from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  Draft: 'bg-amber-100 text-amber-700',
  Published: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
  Sent: 'bg-blue-100 text-blue-700',
  Viewed: 'bg-indigo-100 text-indigo-700',
  Accepted: 'bg-emerald-100 text-emerald-700',
  Declined: 'bg-red-100 text-red-700',
};

const token = () => localStorage.getItem('token');
const authJson = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

// Read a File as a base64 data URL, then hand it to /api/upload → returns a stored URL.
async function uploadFile(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
  const res = await fetch('/api/upload', { method: 'POST', headers: authJson(), body: JSON.stringify({ dataUrl, filename: file.name }) });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || 'Upload failed');
  return d.url;
}

type Tab = 'content' | 'agreements' | 'share' | 'messages';

export function PublisherDashboard() {
  const [me, setMe] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [notif, setNotif] = useState<any>({ unreadMessages: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('content');

  const loadNotif = async () => {
    try { const r = await fetch('/api/publisher/notifications', { headers: { Authorization: `Bearer ${token()}` } }); if (r.ok) setNotif(await r.json()); } catch { /* ignore */ }
  };
  const load = async () => {
    setLoading(true);
    try {
      const [meRes, cRes, aRes, anRes] = await Promise.all([
        fetch('/api/publisher/me', { headers: { Authorization: `Bearer ${token()}` } }),
        fetch('/api/publisher/content', { headers: { Authorization: `Bearer ${token()}` } }),
        fetch('/api/publisher/agreements', { headers: { Authorization: `Bearer ${token()}` } }),
        fetch('/api/publisher/analytics?days=30', { headers: { Authorization: `Bearer ${token()}` } }),
      ]);
      setMe(await meRes.json());
      const c = await cRes.json();
      setArticles(c.articles || []); setBooks(c.books || []);
      setAgreements(await aRes.json());
      setAnalytics(await anRes.json());
      loadNotif();
    } catch { toast.error('Failed to load your workspace'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(loadNotif, 30000); return () => clearInterval(t); }, []);

  const counts = me?.counts || {};
  const pendingAgreements = agreements.filter(a => ['Sent', 'Viewed'].includes(a.status));

  const TABS: { k: Tab; label: string; icon: any; badge?: number }[] = [
    { k: 'content', label: 'My Content', icon: FileText },
    { k: 'agreements', label: 'Agreements', icon: FileSignature, badge: pendingAgreements.length || undefined },
    { k: 'share', label: 'Share Data', icon: UploadCloud },
    { k: 'messages', label: 'Messages', icon: MessageSquare, badge: notif.unreadMessages || undefined },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome{me?.name ? `, ${me.name}` : ''}</h1>
        <p className="text-sm text-slate-500">Your partnership workspace — share your catalogue and track its reach.</p>
      </div>

      {/* New message from the STM team */}
      {notif.unreadMessages > 0 && (
        <button onClick={() => setTab('messages')} className="w-full text-left p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 hover:bg-emerald-100/60 transition-colors">
          <MessageSquare size={18} className="text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-800">{notif.unreadMessages} new message{notif.unreadMessages > 1 ? 's' : ''} from the STM team</p>
            <p className="text-xs text-emerald-700">Click to open your conversation.</p>
          </div>
        </button>
      )}

      {/* Action-required banner for unsigned agreements */}
      {pendingAgreements.length > 0 && (
        <button onClick={() => setTab('agreements')} className="w-full text-left p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 hover:bg-amber-100/60 transition-colors">
          <FileSignature size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">{pendingAgreements.length} agreement{pendingAgreements.length > 1 ? 's' : ''} awaiting your signature</p>
            <p className="text-xs text-amber-700">Review and sign to activate your partnership. Click to open.</p>
          </div>
        </button>
      )}

      {me?.agreementNote && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
          <Handshake size={18} className="text-blue-600 mt-0.5 shrink-0" />
          <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700 mb-1">Partnership</p><p className="text-sm text-slate-700">{me.agreementNote}</p></div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Reads', value: (counts.totalReads ?? 0).toLocaleString(), icon: <Eye size={18} className="text-rose-600" />, bg: 'bg-rose-50' },
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

      {/* Reads trend */}
      {analytics && (analytics.totalReads > 0 || (analytics.series || []).length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5"><TrendingUp size={14} className="text-rose-500" /> Reads · last 30 days</p>
            <span className="text-sm font-bold text-slate-900">{(analytics.totalReads ?? 0).toLocaleString()} reads</span>
          </div>
          <ReadsTrend series={analytics.series || []} />
          {(analytics.topArticles || []).length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Most read</p>
              <div className="space-y-1">
                {analytics.topArticles.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between text-xs"><span className="text-slate-600 truncate pr-3">{t.title}</span><span className="font-bold text-rose-600 shrink-0 flex items-center gap-1"><Eye size={11} />{t.views}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        {TABS.map(t => (
          <button key={t.k} onClick={() => { setTab(t.k); if (t.k === 'messages') setTimeout(loadNotif, 1200); }}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg ${tab === t.k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            <t.icon size={13} /> {t.label}
            {t.badge ? <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px]">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-emerald-500" /></div>
      ) : tab === 'content' ? (
        <ContentPanel articles={articles} books={books} allowed={me?.allowedContentTypes || ['Journals', 'Books']} onChanged={load} />
      ) : tab === 'agreements' ? (
        <AgreementsPanel agreements={agreements} me={me} onChanged={load} />
      ) : tab === 'messages' ? (
        <MessagesPanel side="publisher" />
      ) : (
        <SharePanel allowed={me?.allowedContentTypes || ['Journals', 'Books']} onChanged={load} />
      )}
    </div>
  );
}

/* ─────────── Reads trend (dependency-free bar chart) ─────────── */
export function ReadsTrend({ series, days = 30 }: { series: { day: string; reads: number }[]; days?: number }) {
  const map = new Map((series || []).map(s => [s.day, Number(s.reads)]));
  const bars = Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, reads: map.get(key) || 0 };
  });
  const max = Math.max(1, ...bars.map(b => b.reads));
  return (
    <div className="flex items-end gap-[3px] h-24">
      {bars.map(b => (
        <div key={b.key} title={`${b.key}: ${b.reads} read${b.reads === 1 ? '' : 's'}`}
          className="flex-1 bg-rose-400/80 hover:bg-rose-500 rounded-t transition-colors"
          style={{ height: `${(b.reads / max) * 100}%`, minHeight: b.reads ? '4px' : '2px', opacity: b.reads ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

/* ─────────── Messages (shared: publisher & admin) ─────────── */
export function MessagesPanel({ side, publisherId }: { side: 'publisher' | 'admin'; publisherId?: string }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const base = side === 'publisher' ? '/api/publisher/messages' : `/api/admin/publishers/${publisherId}/messages`;
  const load = async () => {
    try { const r = await fetch(base, { headers: { Authorization: `Bearer ${token()}` } }); setMsgs(await r.json()); } catch { /* ignore */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [publisherId]);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(base, { method: 'POST', headers: authJson(), body: JSON.stringify({ body: text.trim() }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setText(''); load();
    } catch (e: any) { toast.error(e.message || 'Failed to send'); } finally { setBusy(false); }
  };
  const mine = side; // messages I sent have sender === side
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[26rem]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && <p className="text-center text-sm text-slate-400 py-10">No messages yet. Say hello 👋</p>}
        {msgs.map(m => {
          const isMine = m.sender === mine;
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${isMine ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                <div className="text-[10px] font-bold opacity-70 mb-0.5">{isMine ? 'You' : (m.senderName || (m.sender === 'admin' ? 'STM Team' : 'Publisher'))}</div>
                <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`text-[9px] mt-1 flex items-center gap-1 ${isMine ? 'text-white/70 justify-end' : 'text-slate-400'}`}>
                  {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {isMine && (m.readAt ? <CheckCircle2 size={10} /> : <Clock size={10} />)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-3 border-t border-slate-100 flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message…" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
        <button onClick={send} disabled={busy || !text.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-40"><Send size={15} /></button>
      </div>
    </div>
  );
}

/* ─────────── My Content ─────────── */
function ContentPanel({ articles, books, allowed, onChanged }: any) {
  const [sub, setSub] = useState<'articles' | 'books'>('articles');
  const rows = sub === 'articles' ? articles : books;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(['articles', 'books'] as const).map(t => (
          <button key={t} onClick={() => setSub(t)} className={`px-3 py-1 text-xs font-bold rounded-md capitalize ${sub === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{t}</button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400">No {sub} yet. Use <b>Share Data</b> to submit — everything is reviewed before publishing.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r: any) => (
              <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{r.title}</div>
                  <div className="text-[12px] text-slate-500">{r.authors || '—'}{sub === 'articles' && r.journalName ? ` • ${r.journalName}` : ''}{r.year ? ` • ${r.year}` : ''}</div>
                  {r.status === 'Rejected' && r.rejectionNote && (
                    <div className="mt-1 text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {r.rejectionNote}</div>
                  )}
                  {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 font-semibold inline-flex items-center gap-1 mt-1"><ExternalLink size={11} /> PDF</a>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'Published' && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600" title="Reads"><Eye size={12} /> {(r.views ?? 0).toLocaleString()}</span>}
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">Showing only content you have shared with us. Reviewed submissions appear as <b>Published</b>.</p>
    </div>
  );
}

/* ─────────── Agreements + e-signature ─────────── */
function AgreementsPanel({ agreements, me, onChanged }: any) {
  const [open, setOpen] = useState<any>(null);
  if (!agreements.length) {
    return <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center text-slate-400">No agreements yet. When the STM team shares one, it will appear here to review and sign.</div>;
  }
  return (
    <div className="space-y-3">
      {agreements.map((a: any) => (
        <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileSignature size={16} className="text-slate-400 shrink-0" />
              <span className="font-bold text-slate-900 truncate">{a.title}</span>
              <span className="text-[11px] text-slate-400">v{a.version}</span>
            </div>
            {a.status === 'Accepted' && <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1"><ShieldCheck size={12} /> Signed by {a.acceptedByName} · {new Date(a.decidedAt).toLocaleDateString()}</p>}
            {a.status === 'Declined' && <p className="text-[11px] text-red-600 mt-1">Declined{a.declineReason ? ` — ${a.declineReason}` : ''}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${STATUS_BADGE[a.status] || 'bg-slate-100 text-slate-600'}`}>{a.status}</span>
            <button onClick={() => setOpen(a)} className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg">
              {['Sent', 'Viewed'].includes(a.status) ? 'Review & Sign' : 'View'}
            </button>
          </div>
        </div>
      ))}
      {open && <AgreementModal agreement={open} me={me} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onChanged(); }} />}
    </div>
  );
}

function AgreementModal({ agreement, me, onClose, onDone }: any) {
  const canSign = ['Sent', 'Viewed'].includes(agreement.status);
  const [mode, setMode] = useState<'typed' | 'drawn'>('typed');
  const [typed, setTyped] = useState(me?.name || '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const ctx = c.getContext('2d')!; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a';
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top); hasDrawn.current = true;
  };
  const clearCanvas = () => { const c = canvasRef.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); hasDrawn.current = false; };

  const sign = async () => {
    let signatureData = '';
    if (mode === 'typed') {
      if (!typed.trim()) { toast.error('Type your full name to sign'); return; }
      signatureData = typed.trim();
    } else {
      if (!hasDrawn.current) { toast.error('Draw your signature'); return; }
      signatureData = canvasRef.current!.toDataURL('image/png');
    }
    if (!consent) { toast.error('Please confirm your consent'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/publisher/agreements/${agreement.id}/sign`, {
        method: 'POST', headers: authJson(),
        body: JSON.stringify({ signatureType: mode, signatureData, name: (mode === 'typed' ? typed.trim() : (me?.name || 'Authorised signatory')), email: me?.email }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success('Agreement signed — thank you'); onDone();
    } catch (e: any) { toast.error(e.message || 'Failed to sign'); } finally { setBusy(false); }
  };

  const decline = async () => {
    const reason = window.prompt('Reason for declining (optional):') ?? '';
    setBusy(true);
    try {
      const res = await fetch(`/api/publisher/agreements/${agreement.id}/decline`, { method: 'POST', headers: authJson(), body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success('Agreement declined'); onDone();
    } catch (e: any) { toast.error(e.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div><h2 className="font-bold text-slate-900 text-lg">{agreement.title}</h2><p className="text-xs text-slate-400">Version {agreement.version}</p></div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        {/* Document */}
        <div className="flex-1 overflow-y-auto p-5">
          {agreement.documentUrl ? (
            <iframe src={agreement.documentUrl} title="Agreement" className="w-full h-[46vh] border border-slate-200 rounded-lg bg-white" />
          ) : (
            <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed border border-slate-100 rounded-lg p-4 bg-slate-50/60 min-h-[30vh]">{agreement.body || 'No document body provided.'}</div>
          )}

          {canSign && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5"><PenLine size={13} /> Sign electronically</p>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-3">
                {(['typed', 'drawn'] as const).map(m => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 text-xs font-bold rounded-md capitalize ${mode === m ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{m === 'typed' ? 'Type name' : 'Draw'}</button>)}
              </div>
              {mode === 'typed' ? (
                <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your full legal name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-lg outline-none focus:border-emerald-500" style={{ fontFamily: 'Georgia, serif' }} />
              ) : (
                <div>
                  <canvas ref={canvasRef} width={520} height={130}
                    onPointerDown={e => { drawing.current = true; canvasRef.current!.getContext('2d')!.beginPath(); }}
                    onPointerMove={draw} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }}
                    className="w-full border border-slate-200 rounded-lg bg-white touch-none cursor-crosshair" />
                  <button onClick={clearCanvas} className="text-[11px] text-slate-500 hover:text-slate-800 mt-1">Clear</button>
                </div>
              )}
              <label className="flex items-start gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-emerald-600" />
                <span className="text-xs text-slate-600">I am authorised to sign on behalf of my organisation and I agree to the terms above. I understand this constitutes a legally binding electronic signature.</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center gap-3 p-5 border-t border-slate-100">
          {canSign ? <button onClick={decline} disabled={busy} className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl">Decline</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">Close</button>
            {canSign && (
              <button onClick={sign} disabled={busy} className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Sign &amp; Accept
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Share Data (single + bulk, with real upload) ─────────── */
function SharePanel({ allowed, onChanged }: any) {
  const [modal, setModal] = useState<null | 'article' | 'book'>(null);
  const [bulk, setBulk] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <FileText className="text-emerald-600 mb-2" />
          <h3 className="font-bold text-slate-900">Share one item</h3>
          <p className="text-sm text-slate-500 mb-3">Submit a single article or book with its PDF. It goes to our team for review before publishing.</p>
          <div className="flex gap-2">
            {allowed.includes('Journals') && <button onClick={() => setModal('article')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"><Plus size={14} /> Article</button>}
            {allowed.includes('Books') && <button onClick={() => setModal('book')} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"><Plus size={14} /> Book</button>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <Layers className="text-blue-600 mb-2" />
          <h3 className="font-bold text-slate-900">Bulk upload</h3>
          <p className="text-sm text-slate-500 mb-3">Have many titles? Upload a CSV and we'll import them all as drafts for review.</p>
          <button onClick={() => setBulk(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"><UploadCloud size={14} /> Upload CSV</button>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 flex items-center gap-1"><ShieldCheck size={12} /> Nothing you share is published automatically — every item is reviewed by our team first.</p>
      {modal && <SubmitModal type={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); onChanged(); }} />}
      {bulk && <BulkModal onClose={() => setBulk(false)} onSaved={() => { setBulk(false); onChanged(); }} />}
    </div>
  );
}

function FilePicker({ label, accept, onUrl, current }: { label: string; accept: string; onUrl: (u: string) => void; current?: string }) {
  const [busy, setBusy] = useState(false);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { const url = await uploadFile(f); onUrl(url); toast.success('File uploaded'); }
    catch (err: any) { toast.error(err.message || 'Upload failed'); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <label className={`flex items-center gap-2 border border-dashed rounded-lg px-3 py-2.5 text-sm cursor-pointer ${current ? 'border-emerald-300 bg-emerald-50/50 text-emerald-700' : 'border-slate-300 text-slate-500 hover:border-emerald-400'}`}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : current ? <CheckCircle2 size={14} /> : <UploadCloud size={14} />}
        <span className="truncate">{busy ? 'Uploading…' : current ? 'Uploaded — replace' : 'Choose file'}</span>
        <input type="file" accept={accept} onChange={pick} className="hidden" />
      </label>
    </div>
  );
}

function SubmitModal({ type, onClose, onSaved }: { type: 'article' | 'book'; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title?.trim()) { toast.error('Title is required'); return; }
    if (!form.pdfUrl?.trim()) { toast.error('Please upload the PDF (or paste a URL)'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/publisher/${type === 'article' ? 'articles' : 'books'}`, { method: 'POST', headers: authJson(), body: JSON.stringify(form) });
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
          <h2 className="font-bold text-slate-900 text-lg capitalize">Share {type}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <F label={type === 'article' ? 'Article Title *' : 'Book Title *'} k="title" />
          <F label="Authors" k="authors" ph="Comma separated" />
          <FilePicker label="Full-text PDF *" accept="application/pdf" current={form.pdfUrl} onUrl={u => set('pdfUrl', u)} />
          {type === 'book' && <FilePicker label="Cover image" accept="image/*" current={form.coverUrl} onUrl={u => set('coverUrl', u)} />}
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
          <p className="text-xs text-slate-500">Your submission stays in <b>Draft</b> until our team reviews and publishes it.</p>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 size={15} className="animate-spin" />} Submit for Review
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'article' | 'book'>('article');
  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || [];
      const o: any = {}; headers.forEach((h, i) => { if (cells[i]) o[h] = cells[i]; }); return o;
    });
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; setFileName(f.name);
    const text = await f.text(); setRows(parseCsv(text));
  };
  const submit = async () => {
    if (!rows.length) { toast.error('Choose a CSV with at least one row'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/publisher/uploads', { method: 'POST', headers: authJson(), body: JSON.stringify({ kind, fileName, items: rows }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`Imported ${d.accepted} item(s) as drafts${d.rejected ? `, ${d.rejected} skipped` : ''}`); onSaved();
    } catch (e: any) { toast.error(e.message || 'Import failed'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-lg">Bulk upload (CSV)</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {(['article', 'book'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`px-3 py-1 text-xs font-bold rounded-md capitalize ${kind === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{k}s</button>)}
          </div>
          <p className="text-xs text-slate-500">CSV header row required. Recognised columns: <code className="text-[11px] bg-slate-100 px-1 rounded">title, authors, pdfUrl, journalName, issn, volume, issue, year, doi, isbn, domain, subject</code>.</p>
          <label className="flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-3 text-sm cursor-pointer hover:border-blue-400 text-slate-500">
            <UploadCloud size={16} /> <span className="truncate">{fileName || 'Choose CSV file'}</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          {rows.length > 0 && <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 size={13} /> {rows.length} row(s) ready to import</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">Cancel</button>
          <button onClick={submit} disabled={busy || !rows.length} className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-2 disabled:opacity-50">
            {busy && <Loader2 size={15} className="animate-spin" />} Import {rows.length || ''} as drafts
          </button>
        </div>
      </div>
    </div>
  );
}
