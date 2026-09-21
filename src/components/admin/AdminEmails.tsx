import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, Mail, MailX, RefreshCw, Search, Send, User2, XCircle,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';

/**
 * The marketing mail screen.
 *
 * Two questions, one page. "What can I send, and to whom" — the templates, with
 * the mail rendered for the very member who would receive it, because a preview
 * of a different mail is worse than no preview. And "who has had what" — every
 * send, filterable, with the reason beside anything that did not go.
 */

type Template = {
  key: string; name: string; description: string; audience: string;
  kind: 'lifecycle' | 'broadcast'; sent: number; failed: number;
};
type Member = { id: string; displayName?: string | null; email: string; role: string; organization?: string | null };
type SendRow = {
  id: string; createdAt: string; email: string; templateKey: string; subject: string;
  status: string; reason?: string | null; sentBy?: string | null; error?: string | null;
  user?: Member | null;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const jsonHeaders = () => ({ ...authHeader(), 'Content-Type': 'application/json' });
const n = (x?: number) => Number(x || 0).toLocaleString('en-IN');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function AdminEmails() {
  const [sp, setSp] = useSearchParams();
  // Opened from a member's row on the Users screen: ?user=<id> lands on that
  // member's file rather than on a search box they have to fill in again.
  const [tab, setTab] = useState<'send' | 'member' | 'history'>(sp.get('user') ? 'member' : 'send');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch('/api/admin/email-templates', { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: Template[]) => { setTemplates(d); setChosen(c => c || d[0]?.key || ''); })
      .catch(() => toast.error('Could not load the templates'));
  }, [reload]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Emails</h1>
          <p className="mt-1 text-sm text-slate-500">
            Send a member one of the ready mails, and see every mail that has gone out.
          </p>
        </div>
        <div className="flex gap-1.5 rounded-xl border border-slate-200 bg-white p-1">
          {([['send', 'Send a mail'], ['member', "A member's mail"], ['history', 'Who got what']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                tab === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'send' && <SendPanel templates={templates} chosen={chosen} onChoose={setChosen} onSent={() => setReload(r => r + 1)} />}
      {tab === 'member' && (
        <MemberMail
          userId={sp.get('user') || ''}
          onPick={id => { const next = new URLSearchParams(sp); if (id) next.set('user', id); else next.delete('user'); setSp(next, { replace: true }); }}
        />
      )}
      {tab === 'history' && <History templates={templates} />}
    </div>
  );
}

// ── Send ────────────────────────────────────────────────────────────────────

function SendPanel({ templates, chosen, onChoose, onSent }: {
  templates: Template[]; chosen: string; onChoose: (k: string) => void; onSent: () => void;
}) {
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string; optedOut: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const template = templates.find(t => t.key === chosen);

  // Look members up as the admin types, without a request per keystroke.
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setMembers([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/users?search=${encodeURIComponent(term)}&limit=8`, { headers: authHeader() })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(d => setMembers(Array.isArray(d) ? d : (d?.data ?? [])))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    if (!chosen || !member) { setPreview(null); return; }
    setLoading(true);
    const p = new URLSearchParams({ userId: member.id });
    if (note.trim()) p.set('note', note.trim());
    fetch(`/api/admin/email-templates/${chosen}/preview?${p}`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setPreview)
      .catch(() => toast.error('Could not render that mail'))
      .finally(() => setLoading(false));
  }, [chosen, member, note]);

  useEffect(() => { const t = setTimeout(load, note ? 500 : 0); return () => clearTimeout(t); }, [load, note]);

  const send = async () => {
    if (!member || !chosen) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/email-templates/${chosen}/send`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ userId: member.id, note: note.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d.error || d.reason || 'Could not send'); return; }
      if (d.status === 'Skipped') toast(`Not sent — ${d.reason}`, { icon: '⏭️' });
      else toast.success(`Sent to ${member.email}`);
      onSent();
    } catch {
      toast.error('Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-4">
        {/* Which mail */}
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">The ready mails</p>
          {templates.map(t => (
            <button key={t.key} onClick={() => onChoose(t.key)}
              className={`block w-full rounded-xl px-3.5 py-3 text-left transition-colors ${
                t.key === chosen ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className={`text-sm font-bold ${t.key === chosen ? 'text-blue-700' : 'text-slate-800'}`}>{t.name}</span>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  t.kind === 'lifecycle' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {t.kind === 'lifecycle' ? 'Automatic' : 'By hand'}
                </span>
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-slate-500">{t.description}</span>
              <span className="mt-1.5 block text-[11px] text-slate-400">
                {t.audience} · {n(t.sent)} sent{t.failed ? `, ${n(t.failed)} failed` : ''}
              </span>
            </button>
          ))}
          {!templates.length && <div className="m-2 h-28 animate-pulse rounded-xl bg-slate-100" />}
        </div>

        {/* Which member */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Send to</p>
          <div className="relative mt-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email or institution…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
          </div>
          {members.length > 0 && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-100">
              {members.map(m => (
                <button key={m.id} onClick={() => { setMember(m); setMembers([]); setSearch(''); }}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50">
                  <span className="block truncate text-[13px] font-semibold text-slate-800">{m.displayName || m.email}</span>
                  <span className="block truncate text-[11px] text-slate-500">{m.email} · {m.role}{m.organization ? ` · ${m.organization}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {member && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-slate-800">{member.displayName || member.email}</span>
                <span className="block truncate text-[11.5px] text-slate-500">{member.email} · {member.role}</span>
              </span>
              <button onClick={() => { setMember(null); setPreview(null); }} className="shrink-0 text-[11px] font-bold text-slate-400 hover:text-slate-700">Change</button>
            </div>
          )}

          {template?.kind === 'broadcast' && (
            <label className="mt-3 block">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">What to say (optional)</span>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
                placeholder="What shipped, in your words. Left blank, the template's own wording is used."
                className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" />
            </label>
          )}

          <button onClick={send} disabled={!member || sending || !preview}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send this mail
          </button>
          {preview?.optedOut && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
              This member has unsubscribed from updates. The send will be recorded and skipped.
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Sending by hand ignores the frequency cap but never the unsubscribe.
          </p>
        </div>
      </div>

      {/* The mail itself */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Exactly what will arrive</p>
            <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{preview?.subject || '—'}</p>
          </div>
          <button onClick={load} disabled={!member} title="Render again"
            className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
        {preview ? (
          <iframe title="Email preview" srcDoc={preview.html} className="h-[720px] w-full bg-slate-100" />
        ) : (
          <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-slate-400">
            <Mail size={26} />
            <p className="text-sm">Choose a member to see the mail they would get.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── One member's mail file ──────────────────────────────────────────────────

type MemberFile = {
  member: { id: string; name?: string | null; email: string; role: string; organization?: string | null; createdAt: string; lastReadAt?: string | null; optedOut: boolean };
  cap: { lastMarketingAt: string | null; gapDays: number | null; sentThisMonth: number; perMonth: number; minGapDays: number; blockedByCap: boolean };
  templates: {
    key: string; name: string; kind: string; description: string;
    sentCount: number; lastSentAt: string | null;
    lastOutcome: { status: string; reason?: string | null; error?: string | null; at: string } | null;
    due: boolean; why: string;
  }[];
  timeline: { kind: 'template' | 'other'; id: string; at: string; title: string; templateKey?: string; status: string; reason?: string | null; error?: string | null; sentBy?: string | null }[];
};

function MemberMail({ userId, onPick }: { userId: string; onPick: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Member[]>([]);
  const [file, setFile] = useState<MemberFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingKey, setSendingKey] = useState('');

  const load = useCallback((id: string) => {
    if (!id) { setFile(null); return; }
    setLoading(true);
    fetch(`/api/admin/members/${id}/mail`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setFile)
      .catch(() => toast.error("Could not read this member's mail"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(userId); }, [userId, load]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setFound([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/users?search=${encodeURIComponent(term)}&limit=8`, { headers: authHeader() })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(d => setFound(Array.isArray(d) ? d : (d?.data ?? [])))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const sendOne = async (key: string) => {
    if (!file) return;
    setSendingKey(key);
    try {
      const res = await fetch(`/api/admin/email-templates/${key}/send`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ userId: file.member.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(d.error || d.reason || 'Could not send');
      else if (d.status === 'Skipped') toast(`Not sent — ${d.reason}`, { icon: '⏭️' });
      else toast.success('Sent');
      load(file.member.id);
    } catch {
      toast.error('Could not send');
    } finally {
      setSendingKey('');
    }
  };

  if (!userId || (!file && !loading)) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Open a member's file</p>
        <div className="relative mt-3 max-w-lg">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
            placeholder="Search by name, email or institution…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
        {found.length > 0 && (
          <div className="mt-2 max-w-lg overflow-hidden rounded-xl border border-slate-100">
            {found.map(m => (
              <button key={m.id} onClick={() => { onPick(m.id); setSearch(''); setFound([]); }}
                className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50">
                <span className="block truncate text-[13px] font-semibold text-slate-800">{m.displayName || m.email}</span>
                <span className="block truncate text-[11.5px] text-slate-500">{m.email} · {m.role}{m.organization ? ` · ${m.organization}` : ''}</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 text-[12.5px] text-slate-400">
          You will see every mail this member has had, which of the ready mails are still due, and why.
        </p>
      </div>
    );
  }

  if (!file) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;

  const m = file.member;
  const due = file.templates.filter(t => t.due && !t.sentCount).length;

  return (
    <div className="space-y-5">
      {/* Who this is */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><User2 size={20} /></span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900">{m.name || m.email}</p>
            <p className="truncate text-[12.5px] text-slate-500">
              {m.email} · {m.role}{m.organization ? ` · ${m.organization}` : ''}
            </p>
            <p className="mt-1 text-[11.5px] text-slate-400">
              Joined {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{m.lastReadAt ? `last read ${new Date(m.lastReadAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'has never opened anything'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {m.optedOut && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-[11.5px] font-bold text-rose-700">
              <MailX size={13} /> Unsubscribed
            </span>
          )}
          {file.cap.blockedByCap && !m.optedOut && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11.5px] font-bold text-amber-800">
              <AlertTriangle size={13} /> Automatic mail is capped right now
            </span>
          )}
          <button onClick={() => { onPick(''); setFile(null); }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50">
            Another member
          </button>
        </div>
      </div>

      {/* The cap, plainly */}
      <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4">
        {[
          ['Mails sent to them', file.timeline.filter(t => t.status === 'Sent').length],
          ['Of the ready mails', `${file.templates.filter(t => t.sentCount).length} of ${file.templates.length}`],
          ['Still due', due],
          ['This month', `${file.cap.sentThisMonth} of ${file.cap.perMonth}`],
        ].map(([label, value]) => (
          <div key={label as string} className="p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value as any}</p>
          </div>
        ))}
      </div>

      {/* Which of the ready mails have gone, and which are still to go */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <p className="border-b border-slate-100 px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          The ready mails, for this member
        </p>
        {file.templates.map(t => (
          <div key={t.key} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5 last:border-0">
            <div className="min-w-[220px] flex-1">
              <p className="text-[13.5px] font-bold text-slate-800">{t.name}</p>
              <p className="mt-0.5 text-[11.5px] text-slate-500">{t.why}</p>
            </div>
            <div className="min-w-[180px]">
              {t.sentCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[11.5px] font-bold text-emerald-700">
                  <CheckCircle2 size={13} />
                  Sent {t.lastSentAt ? new Date(t.lastSentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  {t.sentCount > 1 ? ` · ${t.sentCount}×` : ''}
                </span>
              ) : t.due ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[11.5px] font-bold text-blue-700">
                  <Clock size={13} /> Still to go
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[11.5px] font-bold text-slate-500">
                  Not due
                </span>
              )}
              {t.lastOutcome && t.lastOutcome.status !== 'Sent' && (
                <p className="mt-1 max-w-[220px] truncate text-[11px] text-slate-400" title={t.lastOutcome.error || t.lastOutcome.reason || ''}>
                  Last try: {t.lastOutcome.status} — {t.lastOutcome.reason || t.lastOutcome.error}
                </p>
              )}
            </div>
            <button onClick={() => sendOne(t.key)} disabled={sendingKey === t.key}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {sendingKey === t.key ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {t.sentCount ? 'Send again' : 'Send now'}
            </button>
          </div>
        ))}
      </div>

      {/* Everything this member has ever been sent */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <p className="border-b border-slate-100 px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Every mail they have had — updates and account mail both
        </p>
        <ul>
          {file.timeline.map(row => (
            <li key={`${row.kind}-${row.id}`} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0">
              <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                row.status === 'Sent' ? 'bg-emerald-50 text-emerald-600'
                  : row.status === 'Skipped' ? 'bg-slate-100 text-slate-500' : 'bg-rose-50 text-rose-600'}`}>
                {row.status === 'Sent' ? <CheckCircle2 size={14} /> : row.status === 'Skipped' ? <Clock size={14} /> : <XCircle size={14} />}
              </span>
              <span className="min-w-[200px] flex-1">
                <span className="block truncate text-[13px] text-slate-800">{row.title}</span>
                <span className="block truncate text-[11px] text-slate-400">
                  {row.kind === 'template' ? `Ready mail · ${row.sentBy === 'auto' ? 'automatic' : 'sent by hand'}` : 'Account mail'}
                  {row.reason || row.error ? ` · ${row.reason || row.error}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-[12px] text-slate-500">{when(row.at)}</span>
            </li>
          ))}
          {!file.timeline.length && (
            <li className="px-5 py-12 text-center text-sm text-slate-400">No mail has ever been sent to this member.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

function History({ templates }: { templates: Template[] }) {
  const [templateKey, setTemplateKey] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ sends: SendRow[]; total: number; limit: number; counts: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (templateKey) p.set('templateKey', templateKey);
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    return p;
  }, [templateKey, status, q]);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams(params);
    p.set('page', String(page));
    fetch(`/api/admin/email-sends?${p}`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => toast.error('Could not load the history'))
      .finally(() => setLoading(false));
  }, [params, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const name = (k: string) => templates.find(t => t.key === k)?.name || k;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4">
        {[
          ['All records', data?.total],
          ['Sent', data?.counts?.Sent],
          ['Skipped', data?.counts?.Skipped],
          ['Failed', data?.counts?.Failed],
        ].map(([label, value]) => (
          <div key={label as string} className="p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value === undefined ? '—' : n(value as number)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
        <select value={templateKey} onChange={e => { setTemplateKey(e.target.value); setPage(1); }}
          className={`rounded-xl border px-3 py-2 text-sm font-medium outline-none ${templateKey ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          <option value="">Any mail</option>
          {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className={`rounded-xl border px-3 py-2 text-sm font-medium outline-none ${status ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          <option value="">Any outcome</option>
          {['Sent', 'Skipped', 'Failed'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(templateKey || status || search) && (
          <button onClick={() => { setTemplateKey(''); setStatus(''); setSearch(''); setPage(1); }}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800">Clear</button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-5 py-3.5">Member</th>
                <th className="border-b border-slate-200 px-5 py-3.5">Mail</th>
                <th className="border-b border-slate-200 px-5 py-3.5">Outcome</th>
                <th className="border-b border-slate-200 px-5 py-3.5">Sent by</th>
                <th className="border-b border-slate-200 px-5 py-3.5 text-right">When</th>
              </tr>
            </thead>
            <tbody className={loading ? 'opacity-50' : ''}>
              {(data?.sends || []).map(r => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="max-w-[260px] px-5 py-3">
                    <p className="truncate text-[13.5px] font-semibold text-slate-800">{r.user?.displayName || r.email}</p>
                    <p className="truncate text-[11.5px] text-slate-400">{r.email}{r.user?.organization ? ` · ${r.user.organization}` : ''}</p>
                  </td>
                  <td className="max-w-[300px] px-5 py-3">
                    <p className="truncate text-[13px] text-slate-700">{name(r.templateKey)}</p>
                    <p className="truncate text-[11.5px] text-slate-400">{r.subject}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      r.status === 'Sent' ? 'bg-emerald-50 text-emerald-700'
                        : r.status === 'Skipped' ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-700'}`}>
                      {r.status === 'Sent' ? <CheckCircle2 size={12} /> : r.status === 'Skipped' ? <Clock size={12} /> : <XCircle size={12} />}
                      {r.status}
                    </span>
                    {(r.reason || r.error) && (
                      <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-400" title={r.error || r.reason || ''}>
                        {r.reason || r.error}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[12.5px] text-slate-500">{r.sentBy === 'auto' ? 'Automatic' : 'By hand'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-[12.5px] text-slate-500">{when(r.createdAt)}</td>
                </tr>
              ))}
              {!loading && data && !data.sends.length && (
                <tr><td colSpan={5} className="px-5 py-14 text-center text-sm text-slate-400">
                  <Mail size={22} className="mx-auto mb-2 text-slate-300" />No mail has gone out under these filters yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            <span>{n(data.total)} record{data.total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40">Previous</button>
              <span className="tabular-nums">Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
                className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
