import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  X, Building2, MapPin, Users, FileSignature, Save, Trash2, Send, UploadCloud,
  ShieldCheck, GitMerge, Plus, Loader2, CheckCircle2, BookOpen, FileText, KeyRound, Eye,
} from 'lucide-react';

const authJson = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });
const api = async (url: string, method = 'GET', body?: any) => {
  const res = await fetch(url, { method, headers: authJson(), body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Request failed');
  return d;
};
async function uploadFile(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = () => reject(new Error('Read failed')); r.readAsDataURL(file);
  });
  const d = await api('/api/upload', 'POST', { dataUrl, filename: file.name });
  return d.url;
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500";
const AG_BADGE: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600', Sent: 'bg-blue-100 text-blue-700', Viewed: 'bg-indigo-100 text-indigo-700',
  Accepted: 'bg-emerald-100 text-emerald-700', Declined: 'bg-red-100 text-red-700',
};

type Tab = 'overview' | 'locations' | 'contacts' | 'agreements';

export function PublisherDetail({ id, allPublishers, onClose, onChanged }: { id: string; allPublishers: any[]; onClose: () => void; onChanged: () => void }) {
  const [p, setP] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setP(await api(`/api/admin/publishers/${id}`)); } catch { toast.error('Failed to load publisher'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const TABS: { k: Tab; label: string; icon: any; n?: number }[] = [
    { k: 'overview', label: 'Overview', icon: Building2 },
    { k: 'locations', label: 'Locations', icon: MapPin, n: p?.locations?.length },
    { k: 'contacts', label: 'Contacts', icon: Users, n: p?.contacts?.length },
    { k: 'agreements', label: 'Agreements', icon: FileSignature, n: p?.agreements?.length },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="bg-slate-50 w-full max-w-2xl h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-lg truncate">{p?.name || 'Publisher'}</h2>
              {p?.verified && <ShieldCheck size={16} className="text-emerald-600 shrink-0" />}
              {p?.orgType && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-900 text-white">{p.orgType}</span>}
            </div>
            {p?.parent && <p className="text-[11px] text-slate-400">under {p.parent.name}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        <div className="flex gap-1 px-6 pt-3 bg-white border-b border-slate-200">
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 ${tab === t.k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              <t.icon size={13} /> {t.label}{t.n ? <span className="text-[10px] bg-slate-100 px-1.5 rounded-full">{t.n}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading || !p ? (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : tab === 'overview' ? <Overview p={p} allPublishers={allPublishers} reload={() => { load(); onChanged(); }} onClose={onClose} />
            : tab === 'locations' ? <Locations p={p} reload={load} />
              : tab === 'contacts' ? <Contacts p={p} reload={load} />
                : <Agreements p={p} reload={load} />}
        </div>
      </div>
    </div>
  );
}

/* ── Overview: org details, hierarchy, verified, merge ── */
function Overview({ p, allPublishers, reload, onClose }: any) {
  const [f, setF] = useState<any>({
    name: p.name || '', legalName: p.legalName || '', orgType: p.orgType || 'Publisher', parentId: p.parentId || '',
    country: p.country || '', website: p.website || '', verified: !!p.verified, agreementNote: p.agreementNote || '',
  });
  const [busy, setBusy] = useState(false);
  const [mergeTo, setMergeTo] = useState('');
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const others = allPublishers.filter((x: any) => x.id !== p.id);

  const save = async () => {
    setBusy(true);
    try { await api(`/api/admin/publishers/${p.id}`, 'PUT', f); toast.success('Saved'); reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const merge = async () => {
    if (!mergeTo) return;
    if (!window.confirm('Merge this publisher INTO the selected one? All its content, journals, locations, contacts and agreements move over, and this record is deleted.')) return;
    setBusy(true);
    try { await api(`/api/admin/publishers/${p.id}/merge`, 'POST', { targetId: mergeTo }); toast.success('Merged'); onClose(); reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {[['Reads', (p.counts?.totalReads ?? 0).toLocaleString(), Eye, 'text-rose-600'], ['Articles', p.counts?.articles ?? 0, FileText, 'text-emerald-600'], ['Books', p.counts?.books ?? 0, BookOpen, 'text-indigo-600'], ['Published', p.counts?.articlesPublished ?? 0, CheckCircle2, 'text-blue-600'], ['Pending', p.counts?.articlesPending ?? 0, FileSignature, 'text-amber-600']].map(([l, v, Ic, c]: any) => (
          <div key={l} className="bg-white rounded-xl border border-slate-200 p-3 text-center"><Ic size={15} className={`${c} mx-auto mb-1`} /><div className="text-lg font-black text-slate-900">{v}</div><div className="text-[10px] font-bold text-slate-400 uppercase">{l}</div></div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <Field label="Publisher / Imprint Name"><input className={inputCls} value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Legal entity name"><input className={inputCls} value={f.legalName} onChange={e => set('legalName', e.target.value)} placeholder="Registered legal name" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Organisation type">
            <select className={inputCls} value={f.orgType} onChange={e => set('orgType', e.target.value)}>
              {['Group', 'Publisher', 'Imprint'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Parent organisation">
            <select className={inputCls} value={f.parentId} onChange={e => set('parentId', e.target.value)}>
              <option value="">— none (top level) —</option>
              {others.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country"><input className={inputCls} value={f.country} onChange={e => set('country', e.target.value)} /></Field>
          <Field label="Website"><input className={inputCls} value={f.website} onChange={e => set('website', e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={f.verified} onChange={e => set('verified', e.target.checked)} className="w-4 h-4 rounded text-emerald-600" />
          <span className="text-sm font-semibold text-slate-700 flex items-center gap-1"><ShieldCheck size={14} className="text-emerald-600" /> Verified partner</span>
        </label>
        <Field label="Partnership note (shown on their dashboard)"><textarea rows={2} className={inputCls} value={f.agreementNote} onChange={e => set('agreementNote', e.target.value)} /></Field>
        <div className="flex justify-end">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5"><GitMerge size={13} /> Merge duplicate</p>
        <p className="text-xs text-slate-500 mb-3">Fold this record into another (e.g. "Elsevier B.V." → "Elsevier"). Everything moves over.</p>
        <div className="flex gap-2">
          <select className={inputCls} value={mergeTo} onChange={e => setMergeTo(e.target.value)}>
            <option value="">Select target publisher…</option>
            {others.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button onClick={merge} disabled={!mergeTo || busy} className="px-4 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl disabled:opacity-40 whitespace-nowrap">Merge</button>
        </div>
      </div>
    </div>
  );
}

/* ── Locations ── */
function Locations({ p, reload }: any) {
  const [f, setF] = useState<any>({ label: '', type: 'Office', country: '', city: '', address: '', isPrimary: false });
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!f.country && !f.city && !f.label) { toast.error('Enter at least a label or city/country'); return; }
    setBusy(true);
    try { await api(`/api/admin/publishers/${p.id}/locations`, 'POST', f); setF({ label: '', type: 'Office', country: '', city: '', address: '', isPrimary: false }); reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const del = async (id: string) => { try { await api(`/api/admin/locations/${id}`, 'DELETE'); reload(); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {(p.locations || []).length === 0 && <p className="text-sm text-slate-400 text-center py-4">No offices added yet.</p>}
        {(p.locations || []).map((l: any) => (
          <div key={l.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0"><MapPin size={15} className="text-slate-400 shrink-0" />
              <div className="min-w-0"><div className="font-semibold text-sm text-slate-800 truncate">{l.label || l.type}{l.isPrimary && <span className="ml-2 text-[9px] font-bold text-emerald-600 uppercase">Primary</span>}</div>
                <div className="text-[11px] text-slate-500">{[l.city, l.country].filter(Boolean).join(', ') || '—'} · {l.type}</div></div></div>
            <button onClick={() => del(l.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-bold uppercase text-slate-500">Add office</p>
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Label (e.g. Global HQ)" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} />
          <select className={inputCls} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{['HQ', 'Regional', 'Editorial', 'Office'].map(t => <option key={t}>{t}</option>)}</select>
          <input className={inputCls} placeholder="City" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} />
          <input className={inputCls} placeholder="Country" value={f.country} onChange={e => setF({ ...f, country: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={f.isPrimary} onChange={e => setF({ ...f, isPrimary: e.target.checked })} className="w-4 h-4 rounded" /> Primary office</label>
        <div className="flex justify-end"><button onClick={add} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50"><Plus size={14} /> Add</button></div>
      </div>
    </div>
  );
}

/* ── Contacts + seat invite ── */
function Contacts({ p, reload }: any) {
  const [f, setF] = useState<any>({ name: '', email: '', title: '', phone: '', isPrimary: false });
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!f.name.trim()) { toast.error('Name required'); return; }
    setBusy(true);
    try { await api(`/api/admin/publishers/${p.id}/contacts`, 'POST', f); setF({ name: '', email: '', title: '', phone: '', isPrimary: false }); reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const del = async (id: string) => { try { await api(`/api/admin/contacts/${id}`, 'DELETE'); reload(); } catch (e: any) { toast.error(e.message); } };
  const invite = async (id: string) => {
    try {
      const d = await api(`/api/admin/contacts/${id}/invite`, 'POST');
      if (d.tempPassword) window.prompt('Login seat created. Share these credentials securely:', `${d.email} / ${d.tempPassword}`);
      else toast.success(d.note || 'Seat created');
      reload();
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {(p.contacts || []).length === 0 && <p className="text-sm text-slate-400 text-center py-4">No contacts yet.</p>}
        {(p.contacts || []).map((c: any) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-2">
            <div className="min-w-0"><div className="font-semibold text-sm text-slate-800 truncate">{c.name}{c.isPrimary && <span className="ml-2 text-[9px] font-bold text-emerald-600 uppercase">Primary</span>}{c.userId && <span className="ml-2 text-[9px] font-bold text-blue-600 uppercase">Has login</span>}</div>
              <div className="text-[11px] text-slate-500 truncate">{[c.title, c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div></div>
            <div className="flex items-center gap-1 shrink-0">
              {!c.userId && c.email && <button onClick={() => invite(c.id)} title="Give a login seat" className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"><KeyRound size={12} /> Invite</button>}
              <button onClick={() => del(c.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-xs font-bold uppercase text-slate-500">Add contact</p>
        <div className="grid grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input className={inputCls} placeholder="Job title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <input className={inputCls} placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <input className={inputCls} placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={f.isPrimary} onChange={e => setF({ ...f, isPrimary: e.target.checked })} className="w-4 h-4 rounded" /> Primary contact</label>
        <div className="flex justify-end"><button onClick={add} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50"><Plus size={14} /> Add</button></div>
      </div>
    </div>
  );
}

/* ── Agreement desk: create, upload PDF, send, track ── */
function Agreements({ p, reload }: any) {
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState<any>({ title: '', version: '1.0', body: '', documentUrl: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const create = async () => {
    if (!f.title.trim()) { toast.error('Title required'); return; }
    setBusy(true);
    try { await api(`/api/admin/publishers/${p.id}/agreements`, 'POST', f); setF({ title: '', version: '1.0', body: '', documentUrl: '' }); setCreating(false); reload(); toast.success('Agreement created'); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const send = async (id: string) => { try { await api(`/api/admin/agreements/${id}/send`, 'POST'); toast.success('Sent to publisher'); reload(); } catch (e: any) { toast.error(e.message); } };
  const del = async (id: string) => { if (!window.confirm('Delete this agreement?')) return; try { await api(`/api/admin/agreements/${id}`, 'DELETE'); reload(); } catch (e: any) { toast.error(e.message); } };
  const pickPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { set('documentUrl', await uploadFile(file)); toast.success('Contract uploaded'); } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      {!creating && <button onClick={() => setCreating(true)} className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"><Plus size={15} /> New agreement</button>}

      {creating && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Field label="Title"><input className={inputCls} value={f.title} onChange={e => set('title', e.target.value)} placeholder="Partnership Agreement 2026" /></Field></div>
            <Field label="Version"><input className={inputCls} value={f.version} onChange={e => set('version', e.target.value)} /></Field>
          </div>
          <Field label="Contract PDF (optional)">
            <label className={`flex items-center gap-2 border border-dashed rounded-lg px-3 py-2.5 text-sm cursor-pointer ${f.documentUrl ? 'border-emerald-300 bg-emerald-50/50 text-emerald-700' : 'border-slate-300 text-slate-500 hover:border-blue-400'}`}>
              {f.documentUrl ? <CheckCircle2 size={14} /> : <UploadCloud size={14} />} <span className="truncate">{f.documentUrl ? 'Uploaded — replace' : 'Upload contract PDF'}</span>
              <input type="file" accept="application/pdf" onChange={pickPdf} className="hidden" />
            </label>
          </Field>
          <Field label="Or type the terms (used if no PDF)"><textarea rows={4} className={inputCls} value={f.body} onChange={e => set('body', e.target.value)} placeholder="Partnership terms…" /></Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
            <button onClick={create} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(p.agreements || []).length === 0 && !creating && <p className="text-sm text-slate-400 text-center py-4">No agreements yet. Create one and send it for signature.</p>}
        {(p.agreements || []).map((a: any) => (
          <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><FileSignature size={15} className="text-slate-400 shrink-0" /><span className="font-bold text-sm text-slate-900 truncate">{a.title}</span><span className="text-[11px] text-slate-400">v{a.version}</span></div>
                {a.status === 'Accepted' && <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1"><ShieldCheck size={12} /> Signed by {a.acceptedByName} · {new Date(a.decidedAt).toLocaleString()}{a.ipAddress ? ` · ${a.ipAddress}` : ''}</p>}
                {a.status === 'Declined' && <p className="text-[11px] text-red-600 mt-1">Declined{a.declineReason ? ` — ${a.declineReason}` : ''}</p>}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 ${AG_BADGE[a.status] || ''}`}>{a.status}</span>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              {a.documentUrl && <a href={a.documentUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-600 inline-flex items-center gap-1"><FileText size={12} /> Contract</a>}
              <span className="text-[11px] text-slate-400">{Array.isArray(a.auditTrail) ? a.auditTrail.length : 0} audit events</span>
              <div className="ml-auto flex items-center gap-2">
                {a.status === 'Draft' && <button onClick={() => send(a.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"><Send size={12} /> Send</button>}
                <button onClick={() => del(a.id)} className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>{children}</div>;
}
