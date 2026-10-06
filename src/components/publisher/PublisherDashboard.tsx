import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  FileText, BookOpen, Plus, CheckCircle2, Clock, AlertCircle, Handshake,
  ExternalLink, FileSignature, UploadCloud, ShieldCheck, PenLine, Layers, Loader2, Eye, TrendingUp,
  MessageSquare, Send,
} from 'lucide-react';
import { Badge, Button, Dialog, EmptyState, Field, MetricCard, Skeleton, friendlyError, type BadgeTone } from '../ui';

// A submission in Draft is waiting on our review, so it reads as needing
// attention; a declined agreement is a decision, not a failure.
const STATUS_TONE: Record<string, BadgeTone> = {
  Draft: 'caution',
  Published: 'success',
  Rejected: 'alarm',
  Sent: 'accent',
  Viewed: 'accent',
  Accepted: 'success',
  Declined: 'neutral',
};

function StatusPill({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{status}</Badge>;
}

/** Two or three options in a row, one pressed — used for the sub-tabs and signature mode. */
function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly { v: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="flex gap-1 bg-surface-2 border border-rule rounded-lg p-1 w-fit" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
          className={`h-7 px-3 text-xs font-semibold rounded-md transition-colors duration-150 ${value === o.v ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The same function on every render. The parents here pass `onClose` as a
 * fresh arrow, and the dashboard re-renders every 30 seconds on the
 * notification poll; the Dialog re-runs its focus setup whenever onClose
 * changes, which would pull the caret out of the signature or title field.
 */
function useStable(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(() => ref.current(), []);
}

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
        <h1 className="type-page-title text-ink">Welcome{me?.name ? `, ${me.name}` : ''}</h1>
        <p className="mt-1 text-sm text-muted">Your partnership workspace — share your catalogue and track its reach.</p>
      </div>

      {/* New message from the STM team */}
      {notif.unreadMessages > 0 && (
        <button onClick={() => setTab('messages')} className="w-full text-left p-4 rounded-xl bg-accent-soft border border-rule flex items-start gap-3 transition-colors duration-150 hover:border-accent">
          <MessageSquare size={18} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">{notif.unreadMessages} new message{notif.unreadMessages > 1 ? 's' : ''} from the STM team</p>
            <p className="text-xs text-ink-2">Click to open your conversation.</p>
          </div>
        </button>
      )}

      {/* Action-required banner for unsigned agreements */}
      {pendingAgreements.length > 0 && (
        <button onClick={() => setTab('agreements')} className="w-full text-left p-4 rounded-xl bg-caution-soft border border-rule flex items-start gap-3 transition-colors duration-150 hover:border-caution">
          <FileSignature size={18} className="text-caution mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">{pendingAgreements.length} agreement{pendingAgreements.length > 1 ? 's' : ''} awaiting your signature</p>
            <p className="text-xs text-ink-2">Review and sign to activate your partnership. Click to open.</p>
          </div>
        </button>
      )}

      {me?.agreementNote && (
        <div className="p-4 rounded-xl bg-surface-2 border border-rule flex items-start gap-3">
          <Handshake size={18} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Partnership</p><p className="text-sm text-ink-2">{me.agreementNote}</p></div>
        </div>
      )}

      {/* A count the server did not send shows a dash, not a 0. */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: 'Total Reads', value: counts.totalReads != null ? Number(counts.totalReads).toLocaleString() : null, icon: Eye },
          { label: 'Articles', value: counts.articles ?? null, icon: FileText },
          { label: 'Books', value: counts.books ?? null, icon: BookOpen },
          { label: 'Published', value: counts.articlesPublished ?? null, icon: CheckCircle2 },
          { label: 'Pending Review', value: counts.articlesPending ?? null, icon: Clock },
        ].map((s, i) => (
          <MetricCard key={i} label={s.label} value={s.value} icon={s.icon} loading={loading && !me} />
        ))}
      </div>

      {/* Reads trend */}
      {analytics && (analytics.totalReads > 0 || (analytics.series || []).length > 0) && (
        <div className="card card-pad">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="card-title flex items-center gap-2"><TrendingUp size={16} className="text-accent" aria-hidden="true" /> Reads · last 30 days</h2>
            <span className="text-sm font-semibold text-ink tabular-nums">{(analytics.totalReads ?? 0).toLocaleString()} reads</span>
          </div>
          <ReadsTrend series={analytics.series || []} />
          {(analytics.topArticles || []).length > 0 && (
            <div className="mt-4 pt-3 border-t border-rule">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Most read</p>
              <ul className="space-y-1">
                {analytics.topArticles.map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-ink-2 truncate">{t.title}</span><span className="font-semibold text-ink shrink-0 flex items-center gap-1 tabular-nums"><Eye size={12} className="text-faint" aria-hidden="true" />{t.views}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-full overflow-x-auto">
        <div className="flex gap-1 bg-surface border border-rule rounded-lg p-1 w-fit" role="group" aria-label="Workspace sections">
          {TABS.map(t => (
            <button key={t.k} onClick={() => { setTab(t.k); if (t.k === 'messages') setTimeout(loadNotif, 1200); }}
              aria-pressed={tab === t.k}
              className={`inline-flex items-center gap-1.5 h-8 px-3 text-sm font-semibold rounded-md whitespace-nowrap transition-colors duration-150 ${tab === t.k ? 'bg-accent text-accent-on' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
              <t.icon size={16} aria-hidden="true" /> {t.label}
              {t.badge ? <span className={`ml-1 px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full text-[11px] ${tab === t.k ? 'bg-white/20 text-accent-on' : 'bg-caution-soft text-caution'}`}>{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
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
    <div className="flex items-end gap-[3px] h-24" role="img" aria-label={`Daily reads over the last ${days} days`}>
      {bars.map(b => (
        <div key={b.key} title={`${b.key}: ${b.reads} read${b.reads === 1 ? '' : 's'}`}
          className="flex-1 bg-accent/70 hover:bg-accent rounded-t transition-colors"
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
    } catch (e: any) { toast.error(friendlyError(e, 'Failed to send')); } finally { setBusy(false); }
  };
  const mine = side; // messages I sent have sender === side
  return (
    <div className="card flex flex-col h-[26rem]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && <EmptyState icon={MessageSquare} title="No messages yet" description="Say hello — the conversation starts here." className="py-8" />}
        {msgs.map(m => {
          const isMine = m.sender === mine;
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3 py-2 ${isMine ? 'bg-accent text-accent-on' : 'bg-surface-2 text-ink'}`}>
                <div className="text-[11px] font-semibold opacity-80 mb-0.5">{isMine ? 'You' : (m.senderName || (m.sender === 'admin' ? 'STM Team' : 'Publisher'))}</div>
                <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`text-[11px] mt-1 flex items-center gap-1 ${isMine ? 'opacity-80 justify-end' : 'text-muted'}`}>
                  {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {isMine && (m.readAt
                    ? <CheckCircle2 size={12} aria-label="Read" />
                    : <Clock size={12} aria-label="Not read yet" />)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-3 border-t border-rule flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          aria-label="Message" placeholder="Type a message…" className="input flex-1 min-w-0" />
        <Button onClick={send} loading={busy} disabled={!text.trim()} className="btn-icon" aria-label="Send message">{!busy && <Send size={16} aria-hidden="true" />}</Button>
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
      <Segmented<'articles' | 'books'> value={sub} onChange={setSub} label="Content type"
        options={[{ v: 'articles', label: 'Articles' }, { v: 'books', label: 'Books' }] as const} />
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={sub === 'articles' ? FileText : BookOpen} title={`No ${sub} yet`}
            description={<>Use <b>Share Data</b> to submit — everything is reviewed before publishing.</>} />
        ) : (
          <ul className="divide-y divide-rule">
            {rows.map((r: any) => (
              <li key={r.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-ink break-words sm:truncate">{r.title}</div>
                  <div className="text-xs text-muted">{r.authors || '—'}{sub === 'articles' && r.journalName ? ` • ${r.journalName}` : ''}{r.year ? ` • ${r.year}` : ''}</div>
                  {r.status === 'Rejected' && r.rejectionNote && (
                    <div className="mt-1 text-xs text-alarm flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {r.rejectionNote}</div>
                  )}
                  {r.pdfUrl && <a href={r.pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-accent font-semibold inline-flex items-center gap-1 mt-1 hover:underline"><ExternalLink size={12} aria-hidden="true" /> PDF</a>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.status === 'Published' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2 tabular-nums" title="Reads"><Eye size={12} className="text-faint" aria-hidden="true" /> {(r.views ?? 0).toLocaleString()}<span className="sr-only"> reads</span></span>}
                  <StatusPill status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted">Showing only content you have shared with us. Reviewed submissions appear as <b>Published</b>.</p>
    </div>
  );
}

/* ─────────── Agreements + e-signature ─────────── */
function AgreementsPanel({ agreements, me, onChanged }: any) {
  const [open, setOpen] = useState<any>(null);
  if (!agreements.length) {
    return <div className="card"><EmptyState icon={FileSignature} title="No agreements yet" description="When the STM team shares one, it will appear here to review and sign." /></div>;
  }
  return (
    <div className="space-y-3">
      {agreements.map((a: any) => (
        <div key={a.id} className="card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileSignature size={16} className="text-faint shrink-0" aria-hidden="true" />
              <span className="font-semibold text-ink truncate">{a.title}</span>
              <span className="text-xs text-muted shrink-0">v{a.version}</span>
            </div>
            {a.status === 'Accepted' && <p className="text-xs text-success mt-1 flex items-center gap-1"><ShieldCheck size={12} aria-hidden="true" /> Signed by {a.acceptedByName} · {new Date(a.decidedAt).toLocaleDateString()}</p>}
            {a.status === 'Declined' && <p className="text-xs text-muted mt-1">Declined{a.declineReason ? ` — ${a.declineReason}` : ''}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={a.status} />
            <Button size="sm" variant={['Sent', 'Viewed'].includes(a.status) ? 'primary' : 'outline'} onClick={() => setOpen(a)}>
              {['Sent', 'Viewed'].includes(a.status) ? 'Review & Sign' : 'View'}
            </Button>
          </div>
        </div>
      ))}
      {open && <AgreementModal agreement={open} me={me} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onChanged(); }} />}
    </div>
  );
}

function AgreementModal({ agreement, me, onClose: onCloseProp, onDone }: any) {
  const onClose = useStable(onCloseProp);
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
    } catch (e: any) { toast.error(friendlyError(e, 'Failed to sign')); } finally { setBusy(false); }
  };

  const decline = async () => {
    const reason = window.prompt('Reason for declining (optional):') ?? '';
    setBusy(true);
    try {
      const res = await fetch(`/api/publisher/agreements/${agreement.id}/decline`, { method: 'POST', headers: authJson(), body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast.success('Agreement declined'); onDone();
    } catch (e: any) { toast.error(friendlyError(e, 'Could not decline the agreement')); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={agreement.title}
      description={canSign
        ? `Version ${agreement.version}. Read the agreement, then sign below to accept it.`
        : `Version ${agreement.version}`}
      footer={<>
        {canSign && <Button variant="ghost" onClick={decline} disabled={busy} className="text-alarm sm:mr-auto">Decline</Button>}
        <Button variant="outline" onClick={onClose}>{canSign ? 'Cancel' : 'Close'}</Button>
        {canSign && (
          <Button onClick={sign} loading={busy}>
            {!busy && <ShieldCheck size={16} aria-hidden="true" />} Sign &amp; Accept
          </Button>
        )}
      </>}
    >
      {/* Document */}
      {agreement.documentUrl ? (
        <iframe src={agreement.documentUrl} title="Agreement" className="w-full h-[46vh] border border-rule rounded-lg bg-white" />
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm text-ink-2 leading-relaxed border border-rule rounded-lg p-4 bg-surface-2 min-h-[30vh]">{agreement.body || 'No document body provided.'}</div>
      )}

      {canSign && (
        <div className="mt-5 border-t border-rule pt-5">
          <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><PenLine size={16} className="text-accent" aria-hidden="true" /> Sign electronically</h3>
          <div className="mb-3">
            <Segmented<'typed' | 'drawn'> value={mode} onChange={setMode} label="Signature method"
              options={[{ v: 'typed', label: 'Type name' }, { v: 'drawn', label: 'Draw' }] as const} />
          </div>
          {mode === 'typed' ? (
            <Field label="Full legal name">
              <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your full legal name"
                className="input h-12 text-lg" />
            </Field>
          ) : (
            <div>
              {/* The pad stays white in both themes: the ink is dark. */}
              <canvas ref={canvasRef} width={520} height={130}
                onPointerDown={e => { drawing.current = true; canvasRef.current!.getContext('2d')!.beginPath(); }}
                onPointerMove={draw} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }}
                aria-label="Signature pad — draw your signature"
                className="w-full border border-rule-2 rounded-lg bg-white touch-none cursor-crosshair" />
              <Button variant="ghost" size="sm" onClick={clearCanvas} className="mt-1 -ml-3">Clear</Button>
            </div>
          )}
          <label className="flex items-start gap-3 mt-4 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 rounded accent-accent" />
            <span className="text-sm text-ink-2">I am authorised to sign on behalf of my organisation and I agree to the terms above. I understand this constitutes a legally binding electronic signature.</span>
          </label>
        </div>
      )}
    </Dialog>
  );
}

/* ─────────── Share Data (single + bulk, with real upload) ─────────── */
function SharePanel({ allowed, onChanged }: any) {
  const [modal, setModal] = useState<null | 'article' | 'book'>(null);
  const [bulk, setBulk] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card card-pad">
          <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true"><FileText size={18} /></span>
          <h3 className="card-title">Share one item</h3>
          <p className="text-sm text-muted mt-1 mb-4">Submit a single article or book with its PDF. It goes to our team for review before publishing.</p>
          <div className="flex flex-wrap gap-2">
            {allowed.includes('Journals') && <Button size="sm" onClick={() => setModal('article')}><Plus size={16} aria-hidden="true" /> Article</Button>}
            {allowed.includes('Books') && <Button size="sm" variant="outline" onClick={() => setModal('book')}><Plus size={16} aria-hidden="true" /> Book</Button>}
          </div>
        </div>
        <div className="card card-pad">
          <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true"><Layers size={18} /></span>
          <h3 className="card-title">Bulk upload</h3>
          <p className="text-sm text-muted mt-1 mb-4">Have many titles? Upload a CSV and we'll import them all as drafts for review.</p>
          <Button size="sm" variant="outline" onClick={() => setBulk(true)}><UploadCloud size={16} aria-hidden="true" /> Upload CSV</Button>
        </div>
      </div>
      <p className="text-xs text-muted flex items-center gap-1.5"><ShieldCheck size={14} className="shrink-0" aria-hidden="true" /> Nothing you share is published automatically — every item is reviewed by our team first.</p>
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
    catch (err: any) { toast.error(friendlyError(err, 'Upload failed')); }
    finally { setBusy(false); }
  };
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <label className={`flex items-center gap-2 border border-dashed rounded-lg px-3 h-10 text-sm cursor-pointer transition-colors duration-150 focus-within:border-accent ${current ? 'border-success bg-success-soft text-success' : 'border-rule-2 text-muted hover:border-accent'}`}>
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : current ? <CheckCircle2 size={16} aria-hidden="true" /> : <UploadCloud size={16} aria-hidden="true" />}
        <span className="truncate">{busy ? 'Uploading…' : current ? 'Uploaded — replace' : 'Choose file'}</span>
        <input type="file" accept={accept} onChange={pick} className="sr-only" aria-label={label} />
      </label>
    </div>
  );
}

/** One text field of the submission form. Lives out here, not inside the
    modal, so typing does not remount it and drop the caret. */
function SubmitField({ label, k, ph, form, set }: { label: string; k: string; ph?: string; form: any; set: (k: string, v: any) => void }) {
  return (
    <Field label={label}>
      <input className="input" value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={ph} />
    </Field>
  );
}

function SubmitModal({ type, onClose: onCloseProp, onSaved }: { type: 'article' | 'book'; onClose: () => void; onSaved: () => void }) {
  const onClose = useStable(onCloseProp);
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
    } catch (e: any) { toast.error(friendlyError(e, 'Submit failed')); } finally { setBusy(false); }
  };

  const fieldProps = { form, set };

  return (
    <Dialog
      open
      onClose={onClose}
      title={type === 'article' ? 'Share article' : 'Share book'}
      description="Add the details and the full-text PDF. Fields marked * are required."
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy}>Submit for Review</Button>
      </>}
    >
      <div className="space-y-4">
        <SubmitField {...fieldProps} label={type === 'article' ? 'Article Title *' : 'Book Title *'} k="title" />
        <SubmitField {...fieldProps} label="Authors" k="authors" ph="Comma separated" />
        <FilePicker label="Full-text PDF *" accept="application/pdf" current={form.pdfUrl} onUrl={u => set('pdfUrl', u)} />
        {type === 'book' && <FilePicker label="Cover image" accept="image/*" current={form.coverUrl} onUrl={u => set('coverUrl', u)} />}
        {type === 'article' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><SubmitField {...fieldProps} label="Journal Name" k="journalName" /><SubmitField {...fieldProps} label="ISSN" k="journalIssn" /></div>
            <div className="grid grid-cols-3 gap-3"><SubmitField {...fieldProps} label="Volume" k="volume" /><SubmitField {...fieldProps} label="Issue" k="issue" /><SubmitField {...fieldProps} label="Year" k="year" /></div>
            <SubmitField {...fieldProps} label="DOI" k="doi" />
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><SubmitField {...fieldProps} label="ISBN" k="isbn" /><SubmitField {...fieldProps} label="Year" k="year" /></div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><SubmitField {...fieldProps} label="Domain / Department" k="domain" /><SubmitField {...fieldProps} label="Subject" k="subject" /></div>
        <p className="text-xs text-muted">Your submission stays in <b>Draft</b> until our team reviews and publishes it.</p>
      </div>
    </Dialog>
  );
}

function BulkModal({ onClose: onCloseProp, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const onClose = useStable(onCloseProp);
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
    } catch (e: any) { toast.error(friendlyError(e, 'Import failed')); } finally { setBusy(false); }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Bulk upload (CSV)"
      description="Every row is imported as a draft for our team to review."
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy} disabled={!rows.length}>Import {rows.length || ''} as drafts</Button>
      </>}
    >
      <div className="space-y-4">
        <Segmented<'article' | 'book'> value={kind} onChange={setKind} label="What the CSV contains"
          options={[{ v: 'article', label: 'Articles' }, { v: 'book', label: 'Books' }] as const} />
        <p className="text-sm text-muted">CSV header row required. Recognised columns: <code className="text-xs bg-surface-2 px-1 rounded break-words">title, authors, pdfUrl, journalName, issn, volume, issue, year, doi, isbn, domain, subject</code>.</p>
        <label className="flex items-center gap-2 border border-dashed border-rule-2 rounded-lg px-3 h-12 text-sm cursor-pointer transition-colors duration-150 hover:border-accent focus-within:border-accent text-muted">
          <UploadCloud size={16} className="shrink-0" aria-hidden="true" /> <span className="truncate">{fileName || 'Choose CSV file'}</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" aria-label="CSV file" />
        </label>
        {rows.length > 0 && <p className="text-sm text-success font-medium flex items-center gap-1.5"><CheckCircle2 size={16} aria-hidden="true" /> {rows.length} row(s) ready to import</p>}
      </div>
    </Dialog>
  );
}
