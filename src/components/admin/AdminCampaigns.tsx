import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link2, Loader2, Plus, Trash2, TrendingUp, Users, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * Campaigns: where our members came from, and who brought them.
 *
 * A campaign is registered here before it runs. Registering it mints the code
 * that goes on the link as `?ref=`, which is the whole mechanism: whatever tag
 * is on the link a visitor arrives by is stored on their signup and can never
 * be worked out afterwards. Typing the tag by hand into five ad managers is
 * how attribution breaks, so the link is generated and copied, never typed.
 *
 * The scoreboard is counted from the members themselves, so a campaign added
 * after its first signups still shows them, and a tag belonging to no campaign
 * here is listed rather than quietly dropped.
 */

type Campaign = {
  id: string; code: string; name: string; channel: string; ownerName: string;
  landing: string | null; notes: string | null; active: boolean; createdAt: string;
  signups: number; verified: number; readers: number; last30: number;
};
type Group = { name: string; campaigns: number; signups: number; verified: number; readers: number; last30: number };
type Board = {
  campaigns: Campaign[]; byOwner: Group[]; byChannel: Group[];
  loose: { code: string; signups: number; verified: number; readers: number }[];
  channels: string[]; untagged: number; tagged: number;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const n = (x: number) => Number(x || 0).toLocaleString('en-IN');
const SITE = 'https://journalslibrary.com';

const linkFor = (c: Campaign) => `${SITE}${c.landing || '/'}?ref=${c.code}`;

const CHANNEL_TONE: Record<string, string> = {
  Facebook: 'bg-blue-50 text-blue-700 border-blue-200',
  Instagram: 'bg-pink-50 text-pink-700 border-pink-200',
  WhatsApp: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LinkedIn: 'bg-sky-50 text-sky-700 border-sky-200',
  Email: 'bg-amber-50 text-amber-700 border-amber-200',
  Poster: 'bg-violet-50 text-violet-700 border-violet-200',
  Other: 'bg-slate-100 text-slate-700 border-slate-200',
};

function Copyable({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true); setTimeout(() => setDone(false), 1600);
        } catch { toast.error('Copy nahi hua — link select karke copy kar lijiye'); }
      }}
      title={value}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      <span className="truncate">{done ? 'Copied' : label}</span>
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{n(value)}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function AdminCampaigns() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<{ campaign: Campaign; members: any[] } | null>(null);
  const [form, setForm] = useState({ name: '', channel: 'Facebook', ownerName: '', landing: '/', notes: '' });

  const load = () => {
    setLoading(true);
    fetch('/api/admin/campaigns', { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setBoard)
      .catch(() => toast.error('Campaigns load nahi hue'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.ownerName.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Failed');
      toast.success(`Link ban gaya — ${d.campaign.code}`);
      setForm({ name: '', channel: form.channel, ownerName: form.ownerName, landing: '/', notes: '' });
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Campaign nahi bana');
    } finally { setSaving(false); }
  };

  const toggle = async (c: Campaign) => {
    await fetch(`/api/admin/campaigns/${c.id}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !c.active }),
    });
    load();
  };

  const remove = async (c: Campaign) => {
    if (!confirm(`"${c.name}" hata dein?`)) return;
    const r = await fetch(`/api/admin/campaigns/${c.id}`, { method: 'DELETE', headers: authHeader() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d?.error || 'Delete nahi hua');
    toast.success('Hata diya');
    load();
  };

  const openMembers = async (c: Campaign) => {
    const r = await fetch(`/api/admin/campaigns/${c.id}/members`, { headers: authHeader() });
    if (!r.ok) return toast.error('Members load nahi hue');
    setMembers(await r.json());
  };

  const leader = useMemo(() => board?.byOwner?.[0], [board]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">
            Har campaign ka apna link. Jo us link se register karega, wo yahin ginaa jayega — kis channel se aaya aur kisne laaya.
          </p>
        </div>
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          <Plus size={16} /> New campaign link
        </button>
      </div>

      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>}

      {board && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Tagged signups" value={board.tagged} hint="kisi campaign se aaye" />
            <Stat label="No tag" value={board.untagged} hint="seedha aaye ya purane" />
            <Stat label="Campaigns" value={board.campaigns.length} hint={`${board.campaigns.filter(c => c.active).length} chal rahe hain`} />
            <Stat label="Top marketer" value={leader?.signups || 0} hint={leader?.name || '—'} />
          </div>

          {/* Who brought how many — the question this screen exists for. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {([['By marketer', board.byOwner, Users], ['By channel', board.byChannel, TrendingUp]] as const).map(([title, rows, Icon]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white">
                <p className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Icon size={14} /> {title}
                </p>
                {rows.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">Abhi kuch nahi.</p>}
                {rows.map(r => (
                  <div key={r.name} className="flex items-center gap-4 border-b border-slate-50 px-5 py-3 last:border-b-0">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{r.name}</span>
                    <span className="text-[11.5px] text-slate-400">{r.campaigns} campaign{r.campaigns === 1 ? '' : 's'}</span>
                    <span className="w-16 text-right text-[11.5px] text-slate-500" title="Last 30 days">+{n(r.last30)}</span>
                    <span className="w-20 text-right text-sm font-bold text-slate-900">{n(r.signups)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left">Campaign</th>
                  <th className="px-5 py-3 text-left">Where</th>
                  <th className="px-5 py-3 text-left">Who</th>
                  <th className="px-5 py-3 text-left">The link</th>
                  <th className="px-3 py-3 text-right">Signups</th>
                  <th className="px-3 py-3 text-right">Verified</th>
                  <th className="px-3 py-3 text-right">Read</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {board.campaigns.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                    Abhi koi campaign nahi. "New campaign link" se shuru karein.
                  </td></tr>
                )}
                {board.campaigns.map(c => (
                  <tr key={c.id} className={`border-t border-slate-100 ${c.active ? '' : 'bg-slate-50/60'}`}>
                    <td className="px-5 py-3.5">
                      <button onClick={() => openMembers(c)} className="text-left font-semibold text-slate-900 hover:text-blue-600">
                        {c.name}
                      </button>
                      <p className="font-mono text-[11px] text-slate-400">{c.code}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${CHANNEL_TONE[c.channel] || CHANNEL_TONE.Other}`}>
                        {c.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{c.ownerName}</td>
                    <td className="max-w-[260px] px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        <Copyable value={linkFor(c)} label="Copy link" />
                        {c.channel === 'Email' && <Copyable value={`ref=${c.code}`} label="Sendy query string" />}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right font-bold text-slate-900">{n(c.signups)}</td>
                    <td className="px-3 py-3.5 text-right text-slate-600">{n(c.verified)}</td>
                    <td className="px-3 py-3.5 text-right text-slate-600">{n(c.readers)}</td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => toggle(c)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                          {c.active ? 'Stop' : 'Start'}
                        </button>
                        {c.signups === 0 && (
                          <button onClick={() => remove(c)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tags that arrived on links made outside this screen — our own
              lifecycle mail tags itself, and hand-written refs land here. */}
          {board.loose.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tags outside this list</p>
              <p className="mt-1 text-[12.5px] text-slate-500">
                Ye links yahan se nahi bane the. Inhe campaign banana ho to wahi code daal kar bana lijiye.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {board.loose.map(l => (
                  <span key={l.code} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[12px] text-slate-700">
                    <span className="font-mono">{l.code}</span>
                    <span className="font-bold">{n(l.signups)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* New campaign */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <form onClick={e => e.stopPropagation()} onSubmit={create}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">New campaign link</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>

            <label className="mt-5 block text-[12px] font-semibold text-slate-600">Campaign ka naam</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus
              placeholder="Librarians ko October drive"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400" />

            <label className="mt-4 block text-[12px] font-semibold text-slate-600">Kahan chalega</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(board?.channels || []).map(ch => (
                <button key={ch} type="button" onClick={() => setForm({ ...form, channel: ch })}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
                    form.channel === ch ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {ch}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-[12px] font-semibold text-slate-600">Kaun chala raha hai</label>
            <input value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })}
              list="campaign-owners" placeholder="Marketer ka naam"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-slate-400" />
            <datalist id="campaign-owners">
              {(board?.byOwner || []).map(o => <option key={o.name} value={o.name} />)}
            </datalist>

            <label className="mt-4 block text-[12px] font-semibold text-slate-600">Link kis page par le jaye</label>
            <input value={form.landing} onChange={e => setForm({ ...form, landing: e.target.value })}
              placeholder="/"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-[13px] outline-none focus:border-slate-400" />
            <p className="mt-1.5 text-[11.5px] text-slate-500">
              <Link2 size={12} className="mr-1 inline" />
              Banne ke baad link copy karke Facebook, WhatsApp ya Sendy ki "Query string" field mein daal dijiye.
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Rehne do</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />} Link banao
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Who this campaign brought */}
      {members && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setMembers(null)}>
          <div onClick={e => e.stopPropagation()} className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{members.campaign.name}</h2>
                <p className="text-[12px] text-slate-500">
                  {members.campaign.channel} · {members.campaign.ownerName} · {n(members.members.length)} members
                </p>
              </div>
              <button onClick={() => setMembers(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {members.members.length === 0 && <p className="mt-6 text-sm text-slate-400">Abhi koi nahi aaya is link se.</p>}
            {members.members.length > 0 && (
              <table className="mt-5 w-full text-sm">
                <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <tr><th className="py-2 text-left">Member</th><th className="py-2 text-left">Kahan se</th><th className="py-2 text-right">Joined</th><th className="py-2 text-right">Padha</th></tr>
                </thead>
                <tbody>
                  {members.members.map(m => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="py-2.5">
                        <p className="font-semibold text-slate-800">{m.displayName || '—'}</p>
                        <p className="text-[11.5px] text-slate-500">{m.email}</p>
                      </td>
                      <td className="py-2.5 text-[12.5px] text-slate-600">
                        {[m.organization, m.state].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="py-2.5 text-right text-[12px] text-slate-500">
                        {new Date(m.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-2.5 text-right text-[12px]">
                        {m.lastReadAt ? <span className="text-emerald-600">haan</span> : <span className="text-slate-400">nahi</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
