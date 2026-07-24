import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Building2, Plus, Search, X, Handshake, Mail, BookOpen, FileText, CheckCircle2, Globe, Settings2, ShieldCheck, CornerDownRight, LayoutGrid, List, Eye } from 'lucide-react';
import { PublisherDetail } from './PublisherDetail';

const STATUS_COLORS: Record<string, string> = {
  Discovered: 'bg-amber-100 text-amber-700 border-amber-200',
  Invited: 'bg-blue-100 text-blue-700 border-blue-200',
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};

const CONTENT_TYPE_OPTIONS = ['Journals', 'Books'];

export function PublisherManager() {
  const [publishers, setPublishers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [tieUp, setTieUp] = useState<any | null>(null);
  const [manage, setManage] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'pipeline'>('table');
  const [busy, setBusy] = useState(false);

  const token = () => localStorage.getItem('token');

  const moveStage = async (id: string, tieUpStatus: string) => {
    setPublishers(ps => ps.map(p => p.id === id ? { ...p, tieUpStatus } : p)); // optimistic
    try {
      await fetch(`/api/admin/publishers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ tieUpStatus }) });
    } catch { toast.error('Could not update stage'); fetchData(); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (statusFilter) q.set('status', statusFilter);
      if (search) q.set('search', search);
      const res = await fetch(`/api/admin/publishers?${q}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setPublishers(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load publishers'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [statusFilter]);

  const stats = {
    total: publishers.length,
    active: publishers.filter(p => p.tieUpStatus === 'Active').length,
    discovered: publishers.filter(p => p.tieUpStatus === 'Discovered').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Publishers</h1>
          <p className="text-sm text-slate-500">Discovered & partnered publishers. Tie up to grant a login and invite them.</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-xs font-bold text-white hover:bg-blue-700 shadow-sm">
          <Plus size={14} /> Add Publisher
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Publishers', value: stats.total, icon: <Building2 size={18} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Active (Tied Up)', value: stats.active, icon: <Handshake size={18} className="text-emerald-600" />, bg: 'bg-emerald-50' },
          { label: 'Discovered (Pending)', value: stats.discovered, icon: <Globe size={18} className="text-amber-600" />, bg: 'bg-amber-50' },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}>{s.icon}</div>
            <div><p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{s.label}</p><p className="text-xl font-bold text-slate-900">{s.value}</p></div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {['', 'Discovered', 'Active', 'Inactive'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${statusFilter === f ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              {f || 'All'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button onClick={() => setView('table')} title="Table" className={`p-1.5 rounded-lg ${view === 'table' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}><List size={15} /></button>
            <button onClick={() => setView('pipeline')} title="Pipeline" className={`p-1.5 rounded-lg ${view === 'pipeline' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}><LayoutGrid size={15} /></button>
          </div>
          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchData()}
              placeholder="Search name / email / country..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
          </div>
        </div>
      </div>

      {view === 'pipeline' ? (
        <PipelineBoard publishers={publishers} loading={loading} onMove={moveStage} onManage={setManage} onTieUp={setTieUp} />
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 font-semibold text-slate-600">Publisher</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Content (Ours)</th>
              <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="px-5 py-3 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={4} className="py-12 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div></td></tr>
            ) : publishers.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-slate-400">No publishers yet. They appear automatically as data is ingested, or add one manually.</td></tr>
            ) : publishers.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    {p.parentId && <CornerDownRight size={13} className="text-slate-300" />}
                    {p.name}
                    {p.verified && <ShieldCheck size={13} className="text-emerald-600" />}
                    {p.orgType && p.orgType !== 'Publisher' && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{p.orgType}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{p.email || '—'}{p.country ? ` • ${p.country}` : ''}</div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3 text-[12px] font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1"><BookOpen size={13} className="text-indigo-500" /> {p.counts?.books ?? 0} Books</span>
                    <span className="inline-flex items-center gap-1"><FileText size={13} className="text-emerald-500" /> {p.counts?.articles ?? 0} Articles</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase ${STATUS_COLORS[p.tieUpStatus] || ''}`}>{p.tieUpStatus}</span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setManage(p.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg">
                      <Settings2 size={14} /> Manage
                    </button>
                    {p.tieUpStatus === 'Active' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600"><CheckCircle2 size={13} /> Tied Up</span>
                    ) : (
                      <button onClick={() => setTieUp(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm">
                        <Handshake size={14} /> Tie Up
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {addOpen && <AddPublisherModal publishers={publishers} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); fetchData(); }} />}
      {tieUp && <TieUpModal publisher={tieUp} busy={busy} setBusy={setBusy} onClose={() => setTieUp(null)} onDone={() => { setTieUp(null); fetchData(); }} />}
      {manage && <PublisherDetail id={manage} allPublishers={publishers} onClose={() => setManage(null)} onChanged={fetchData} />}
    </div>
  );
}

function AddPublisherModal({ publishers, onClose, onSaved }: { publishers: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({ name: '', legalName: '', orgType: 'Publisher', parentId: '', email: '', country: '', website: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      // create, then set hierarchy fields (create endpoint takes the basics; PUT sets orgType/parent/legalName)
      const res = await fetch('/api/admin/publishers', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ name: form.name, email: form.email, country: form.country, website: form.website }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error || 'Failed');
      if (form.orgType !== 'Publisher' || form.parentId || form.legalName) {
        await fetch(`/api/admin/publishers/${created.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ orgType: form.orgType, parentId: form.parentId || null, legalName: form.legalName || null }),
        });
      }
      toast.success('Publisher added'); onSaved();
    } catch (e: any) { toast.error(e.message || 'Failed to add'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add Publisher" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Publisher / Imprint Name *"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Legal entity name"><input className={inputCls} value={form.legalName} onChange={e => setForm({ ...form, legalName: e.target.value })} placeholder="Registered legal name (optional)" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Organisation type">
            <select className={inputCls} value={form.orgType} onChange={e => setForm({ ...form, orgType: e.target.value })}>
              {['Group', 'Publisher', 'Imprint'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Parent organisation">
            <select className={inputCls} value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })}>
              <option value="">— none (top level) —</option>
              {publishers.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><input className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Country"><input className={inputCls} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></Field>
        </div>
        <Field label="Website"><input className={inputCls} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></Field>
      </div>
      <ModalActions onClose={onClose} onSave={save} busy={busy} label="Add" />
    </Modal>
  );
}

function TieUpModal({ publisher, busy, setBusy, onClose, onDone }: any) {
  const [form, setForm] = useState<any>({
    email: publisher.email || '', contactNumber: publisher.contactNumber || '', website: publisher.website || '',
    country: publisher.country || '', address: publisher.address || '', agreementNote: publisher.agreementNote || '',
    allowedContentTypes: publisher.allowedContentTypes || ['Journals', 'Books'],
  });
  const [creds, setCreds] = useState<{ email: string; password: string | null } | null>(null);
  const toggleType = (t: string) => setForm((f: any) => ({
    ...f, allowedContentTypes: f.allowedContentTypes.includes(t) ? f.allowedContentTypes.filter((x: string) => x !== t) : [...f.allowedContentTypes, t],
  }));
  const submit = async () => {
    if (!form.email.trim()) { toast.error('Email is required to create a login'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/publishers/${publisher.id}/tieup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCreds({ email: data.loginEmail || form.email, password: data.tempPassword });
      toast.success('Publisher tied up — credentials ready below');
    } catch (e: any) { toast.error(e.message || 'Tie-up failed'); } finally { setBusy(false); }
  };

  // Credentials view — shown after a successful tie-up (does not rely on email)
  if (creds) {
    const copy = () => {
      navigator.clipboard?.writeText(creds.password ? `Login: ${creds.email}\nPassword: ${creds.password}` : creds.email);
      toast.success('Copied');
    };
    return (
      <Modal title="Login credentials" onClose={onDone} icon={<Handshake size={20} className="text-emerald-600" />}>
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">Share these with {publisher.name}</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Login email</span><span className="font-mono font-bold text-slate-900 break-all">{creds.email}</span></div>
              {creds.password
                ? <div className="flex justify-between gap-3"><span className="text-slate-500">Temporary password</span><span className="font-mono font-bold text-slate-900">{creds.password}</span></div>
                : <p className="text-xs text-slate-500">This person already had an account — they log in with their existing password (now upgraded to a Publisher login).</p>}
            </div>
          </div>
          <p className="text-xs text-slate-500">We also emailed these, but email can land in spam — copy and share them directly to be safe. The publisher signs in at <b>/login</b> and lands on their portal.</p>
          <div className="flex justify-end gap-2">
            <button onClick={copy} className="px-4 py-2 text-sm font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-xl">Copy</button>
            <button onClick={onDone} className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Tie Up — ${publisher.name}`} onClose={onClose} icon={<Handshake size={20} className="text-emerald-600" />}>
      <div className="space-y-3">
        <Field label="Login Email * (credentials sent here)"><input className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Number"><input className={inputCls} value={form.contactNumber} onChange={e => setForm({ ...form, contactNumber: e.target.value })} /></Field>
          <Field label="Country"><input className={inputCls} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></Field>
        </div>
        <Field label="Website"><input className={inputCls} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></Field>
        <Field label="Address"><input className={inputCls} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Allowed Content Types">
          <div className="flex gap-2">
            {CONTENT_TYPE_OPTIONS.map(t => (
              <button key={t} type="button" onClick={() => toggleType(t)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${form.allowedContentTypes.includes(t) ? 'bg-emerald-600 text-white border-emerald-600' : 'text-slate-600 border-slate-200'}`}>{t}</button>
            ))}
          </div>
        </Field>
        <Field label="Agreement / Partnership Note (shown on their dashboard)">
          <textarea rows={3} className={inputCls} value={form.agreementNote} onChange={e => setForm({ ...form, agreementNote: e.target.value })}
            placeholder="e.g. Open-access content sharing partnership — increased visibility & citations." />
        </Field>
        <p className="text-xs text-slate-500 flex items-center gap-1"><Mail size={13} /> A login is created and the credentials are shown to you here (and emailed to the publisher).</p>
      </div>
      <ModalActions onClose={onClose} onSave={submit} busy={busy} label="Tie Up & Create Login" />
    </Modal>
  );
}

const PIPELINE_STAGES: { key: string; label: string; hint: string; accent: string }[] = [
  { key: 'Discovered', label: 'Discovered', hint: 'Auto-found, not yet contacted', accent: 'border-t-amber-400' },
  { key: 'Invited', label: 'Invited', hint: 'Invitation sent', accent: 'border-t-blue-400' },
  { key: 'Active', label: 'Active', hint: 'Partnership live', accent: 'border-t-emerald-500' },
  { key: 'Inactive', label: 'Inactive', hint: 'Paused / archived', accent: 'border-t-slate-400' },
];

function PipelineBoard({ publishers, loading, onMove, onManage, onTieUp }: any) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (loading) return <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {PIPELINE_STAGES.map(stage => {
        const cards = publishers.filter((p: any) => (p.tieUpStatus || 'Discovered') === stage.key);
        return (
          <div key={stage.key}
            onDragOver={e => { e.preventDefault(); setOver(stage.key); }}
            onDragLeave={() => setOver(o => (o === stage.key ? null : o))}
            onDrop={() => { if (dragId) onMove(dragId, stage.key); setDragId(null); setOver(null); }}
            className={`rounded-2xl border-t-4 ${stage.accent} border border-slate-200 bg-slate-50/70 p-3 min-h-[200px] transition-colors ${over === stage.key ? 'ring-2 ring-blue-400 bg-blue-50/50' : ''}`}>
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{stage.label}</span>
              <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-2">{cards.length}</span>
            </div>
            <p className="text-[10px] text-slate-400 px-1 mb-3">{stage.hint}</p>
            <div className="space-y-2">
              {cards.map((p: any) => (
                <div key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                  className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate flex items-center gap-1">{p.verified && <ShieldCheck size={12} className="text-emerald-600 shrink-0" />}{p.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{p.email || p.country || (p.orgType && p.orgType !== 'Publisher' ? p.orgType : '—')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-0.5"><FileText size={11} className="text-emerald-500" />{p.counts?.articles ?? 0}</span>
                    <span className="inline-flex items-center gap-0.5"><BookOpen size={11} className="text-indigo-500" />{p.counts?.books ?? 0}</span>
                    <span className="inline-flex items-center gap-0.5"><Eye size={11} className="text-rose-500" />{(p.counts?.totalReads ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
                    <button onClick={() => onManage(p.id)} className="flex-1 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg py-1">Manage</button>
                    {stage.key !== 'Active' && <button onClick={() => onTieUp(p)} className="flex-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg py-1">Tie Up</button>}
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div className="text-center text-[11px] text-slate-300 py-6 border-2 border-dashed border-slate-200 rounded-xl">Drop here</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>{children}</div>;
}
function Modal({ title, icon, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">{icon || <Building2 size={20} className="text-blue-600" />} {title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function ModalActions({ onClose, onSave, busy, label }: any) {
  return (
    <div className="flex justify-end gap-3 mt-6">
      <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl">Cancel</button>
      <button onClick={onSave} disabled={busy} className="px-5 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 disabled:opacity-50">
        {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />} {label}
      </button>
    </div>
  );
}
