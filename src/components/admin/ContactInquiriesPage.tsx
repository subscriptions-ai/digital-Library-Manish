import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import {
  MessageSquare, Search, Mail, Phone, Building2, MapPin,
  Eye, Reply, Trash2, X, CheckCircle, Clock, AlertCircle,
  ChevronDown, Tag, Send, StickyNote, RefreshCw, Inbox
} from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  New:      'bg-red-100 text-red-700 border-red-200',
  Read:     'bg-blue-100 text-blue-700 border-blue-200',
  Replied:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  Resolved: 'bg-slate-100 text-slate-600 border-slate-200',
  Archived: 'bg-purple-100 text-purple-700 border-purple-200',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  New:      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />,
  Read:     <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />,
  Replied:  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />,
  Resolved: <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />,
  Archived: <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />,
};

const ALL_STATUSES = ['All', 'New', 'Read', 'Replied', 'Resolved', 'Archived'];

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {STATUS_ICONS[status]}
      {status}
    </span>
  );
}

const parseNotes = (notesStr: string | null) => {
  if (!notesStr || !notesStr.trim()) return [];
  try {
    const parsed = JSON.parse(notesStr);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // legacy format fallback
    return [{ text: notesStr, timestamp: new Date().toISOString() }];
  }
  return [{ text: notesStr, timestamp: new Date().toISOString() }];
};

export function ContactInquiriesPage() {
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyMode, setReplyMode] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [parsedNotes, setParsedNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [sending, setSending] = useState(false);

  const token = () => localStorage.getItem('token');

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (searchTerm) params.set('search', searchTerm);
      const res = await fetch(`/api/admin/contact-inquiries?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      setInquiries(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to load inquiries'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchInquiries(); }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); fetchInquiries(); };

  const openDetail = async (inq: any) => {
    setDetailLoading(true);
    setSelected(inq);
    setReplyMode(false);
    setReplyText('');
    setReplySubject(`Re: Your Contact Inquiry – STM Digital Library`);
    setParsedNotes(parseNotes(inq.adminNotes));
    setNewNote('');
    try {
      const res = await fetch(`/api/admin/contact-inquiries/${inq.id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const updated = await res.json();
      setSelected(updated);
      setInquiries(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch { /* non-critical */ }
    finally { setDetailLoading(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/contact-inquiries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status }),
      });
      toast.success(`Marked as ${status}`);
      setInquiries(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      if (selected?.id === id) setSelected((s: any) => ({ ...s, status }));
    } catch { toast.error('Failed to update status'); }
  };

  const addNote = async () => {
    if (!selected || !newNote.trim()) return;
    const noteObj = { text: newNote.trim(), timestamp: new Date().toISOString() };
    const updatedNotes = [...parsedNotes, noteObj];
    const notesStr = JSON.stringify(updatedNotes);

    try {
      await fetch(`/api/admin/contact-inquiries/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ adminNotes: notesStr }),
      });
      toast.success('Note added');
      setSelected((s: any) => ({ ...s, adminNotes: notesStr }));
      setParsedNotes(updatedNotes);
      setNewNote('');
    } catch { toast.error('Failed to add note'); }
  };

  const sendReply = async () => {
    if (!selected || !replyText.trim()) { toast.error('Reply message is required'); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/admin/contact-inquiries/${selected.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ replyText, subject: replySubject }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success(`Reply sent to ${selected.email}!`);
      setReplyMode(false);
      setSelected((s: any) => ({ ...s, status: 'Replied', replyText, repliedAt: new Date().toISOString() }));
      setInquiries(prev => prev.map(i => i.id === selected.id ? { ...i, status: 'Replied' } : i));
    } catch (e: any) { toast.error(e.message || 'Failed to send reply'); }
    finally { setSending(false); }
  };

  const deleteInquiry = async (id: string) => {
    if (!window.confirm('Delete this inquiry permanently?')) return;
    try {
      await fetch(`/api/admin/contact-inquiries/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      toast.success('Deleted');
      setInquiries(prev => prev.filter(i => i.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch { toast.error('Failed to delete'); }
  };

  const stats = {
    total: inquiries.length,
    newCount: inquiries.filter(i => i.status === 'New').length,
    repliedCount: inquiries.filter(i => i.status === 'Replied').length,
    resolvedCount: inquiries.filter(i => i.status === 'Resolved').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare size={22} className="text-blue-600" /> Contact Inquiries
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage and respond to contact form submissions.</p>
        </div>
        <button onClick={fetchInquiries} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 shadow-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: <Inbox size={18} className="text-slate-500" />, bg: 'bg-slate-50' },
          { label: 'New', value: stats.newCount, icon: <AlertCircle size={18} className="text-red-500" />, bg: 'bg-red-50' },
          { label: 'Replied', value: stats.repliedCount, icon: <CheckCircle size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Resolved', value: stats.resolvedCount, icon: <Clock size={18} className="text-slate-400" />, bg: 'bg-slate-50' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${s.bg}`}>{s.icon}</div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${statusFilter === s ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}>
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by name, email, org or message…" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm" />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-sm">Search</button>
        </form>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-5 min-h-[520px]">
        {/* Inquiry list */}
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${selected ? 'w-[45%]' : 'flex-1'}`}>
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : inquiries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <Inbox size={36} strokeWidth={1.5} />
                <p className="font-medium">No inquiries found.</p>
              </div>
            ) : inquiries.map(inq => (
              <button key={inq.id} onClick={() => openDetail(inq)}
                className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors group ${selected?.id === inq.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {inq.status === 'New' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                      <span className={`font-bold text-sm truncate ${inq.status === 'New' ? 'text-slate-900' : 'text-slate-700'}`}>{inq.fullName}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{inq.email}</p>
                    {inq.organization && <p className="text-xs text-slate-400 truncate">{inq.organization}</p>}
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{inq.message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge status={inq.status} />
                    <span className="text-[10px] text-slate-400">{inq.createdAt ? format(new Date(inq.createdAt), 'dd MMM yy') : '—'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  {selected.fullName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{selected.fullName}</p>
                  <p className="text-xs text-slate-500">{selected.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={selected.status} />
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X size={16} />
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Contact info */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: <Mail size={13} />, label: 'Email', val: selected.email },
                    { icon: <Phone size={13} />, label: 'Mobile', val: selected.mobile || '—' },
                    { icon: <Phone size={13} />, label: 'WhatsApp', val: selected.whatsapp || '—' },
                    { icon: <Building2 size={13} />, label: 'Org', val: selected.organization || '—' },
                    { icon: <MapPin size={13} />, label: 'State', val: selected.state || '—' },
                    { icon: <Tag size={13} />, label: 'Designation', val: selected.designation || '—' },
                  ].map((f, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">{f.icon}{f.label}</p>
                      <p className="text-sm font-semibold text-slate-800 truncate">{f.val}</p>
                    </div>
                  ))}
                </div>

                {/* Departments */}
                {Array.isArray(selected.departments) && selected.departments.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Departments</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.departments.map((d: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">{d}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">Message</p>
                  <p className="text-sm text-indigo-900 leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                  <p className="text-[10px] text-indigo-400 mt-2">{selected.createdAt ? format(new Date(selected.createdAt), 'dd MMM yyyy, hh:mm a') : ''}</p>
                </div>

                {/* Previous reply */}
                {selected.replyText && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Reply size={12} /> Sent Reply</p>
                    <p className="text-sm text-emerald-900 leading-relaxed whitespace-pre-wrap">{selected.replyText}</p>
                    {selected.repliedAt && <p className="text-[10px] text-emerald-400 mt-2">{format(new Date(selected.repliedAt), 'dd MMM yyyy, hh:mm a')}</p>}
                  </div>
                )}

                {/* Admin notes Timeline */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-4">
                    <StickyNote size={12} /> Internal Notes Timeline
                  </label>
                  
                  {parsedNotes.length > 0 && (
                    <div className="relative border-l-2 border-slate-200 ml-2 mb-5 space-y-4">
                      {parsedNotes.map((note, idx) => (
                        <div key={idx} className="relative pl-5">
                          <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-slate-300 border-2 border-white" />
                          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.text}</p>
                            <p className="text-[10px] text-slate-400 mt-2 font-medium">
                              {format(new Date(note.timestamp), 'dd MMM yyyy, hh:mm a')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2}
                      placeholder="Add a new internal note..."
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none shadow-sm" />
                    <button onClick={addNote} disabled={!newNote.trim()} className="self-end px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-50 shrink-0 shadow-sm">
                      Add Note
                    </button>
                  </div>
                </div>

                {/* Reply composer */}
                {replyMode && (
                  <div className="border border-blue-200 bg-blue-50 rounded-2xl p-4 space-y-3">
                    <p className="text-sm font-bold text-blue-900 flex items-center gap-2"><Send size={14} /> Compose Reply</p>
                    <input type="text" value={replySubject} onChange={e => setReplySubject(e.target.value)}
                      placeholder="Subject" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none" />
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={5}
                      placeholder={`Write your reply to ${selected.fullName}…`}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => setReplyMode(false)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-100 rounded-xl">Cancel</button>
                      <button onClick={sendReply} disabled={sending}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-200 transition-all active:scale-95">
                        {sending ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={14} />}
                        Send Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action bar */}
            <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex flex-wrap items-center gap-2">
              {!replyMode && (
                <button onClick={() => setReplyMode(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 transition-all active:scale-95">
                  <Reply size={14} /> Reply
                </button>
              )}

              {/* Status change dropdown */}
              <div className="relative group">
                <button className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Tag size={13} /> Status <ChevronDown size={12} />
                </button>
                <div className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[130px] hidden group-hover:block z-10">
                  {['Read', 'Replied', 'Resolved', 'Archived'].map(s => (
                    <button key={s} onClick={() => updateStatus(selected.id, s)}
                      className="w-full text-left px-4 py-2 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2">
                      {STATUS_ICONS[s]} {s}
                    </button>
                  ))}
                </div>
              </div>

              <a href={`mailto:${selected.email}`}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Mail size={13} /> Email Client
              </a>

              <div className="flex-1" />

              <button onClick={() => deleteInquiry(selected.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-500 border border-red-100 hover:bg-red-50 rounded-xl">
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
