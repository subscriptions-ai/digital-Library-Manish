import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, User, Clock, CheckCircle2, AlertCircle, Plus, MessageSquare, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PIPELINE_STAGES = ['All', 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];

export function SalesLeadDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  const [noteType, setNoteType] = useState('Note');
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    fetchLead();
  }, [id]);

  const fetchLead = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/leads/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Lead not found');
      setLead(await res.json());
    } catch {
      toast.error('Failed to load lead details');
      navigate('/sales/pipeline');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/sales/leads/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error();
      toast.success('Status updated');
      setLead({ ...lead, status: newStatus });
      fetchLead(); // refresh to get possible auto-interactions
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/sales/leads/${id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ type: noteType, notes: noteText })
      });
      if (!res.ok) throw new Error();
      toast.success('Note added');
      setNoteText('');
      fetchLead(); // Refresh interactions
    } catch {
      toast.error('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  if (loading || !lead) {
    return <div className="animate-pulse space-y-4 p-6"><div className="h-8 bg-slate-100 rounded w-1/4"></div><div className="h-64 bg-slate-100 rounded"></div></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{lead.name}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-2">
              Source: <span className="font-bold text-slate-700">{lead.source}</span>
              {lead.state && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="font-bold text-slate-500 flex items-center gap-0.5"><MapPin size={12} className="text-indigo-500" /> {lead.state}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <a 
              href={`mailto:${lead.email}`}
              className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-colors"
              title="Send Email"
            >
              <Mail size={18} />
            </a>
            {lead.phone && (
              <a 
                href={`tel:${lead.phone}`}
                className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-colors"
                title="Call Lead"
              >
                <Phone size={18} />
              </a>
            )}
          </div>
          <span className="text-sm font-bold text-slate-500 uppercase">Status:</span>
          <select 
            value={lead.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updating}
            className="bg-white border border-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {lead.status === 'Subscriber' && (
            <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors">
              <CheckCircle2 size={16}/> Provision Account
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Contact Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-widest mb-4">Contact Information</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="text-slate-400 mt-0.5" size={16} />
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Email Address</div>
                  <a href={`mailto:${lead.email}`} className="text-sm font-semibold text-indigo-600 hover:underline">{lead.email}</a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="text-slate-400 mt-0.5" size={16} />
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Phone Number</div>
                  <div className="text-sm font-medium text-slate-700">{lead.phone || 'Not provided'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building2 className="text-slate-400 mt-0.5" size={16} />
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Organization</div>
                  <div className="text-sm font-medium text-slate-700">{lead.organization || 'Not provided'}</div>
                </div>
              </div>
              {lead.state && (
                <div className="flex items-start gap-3">
                  <MapPin className="text-slate-400 mt-0.5" size={16} />
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">State</div>
                    <div className="text-sm font-semibold text-slate-700">{lead.state}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {lead.notes && (
            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
              <h3 className="font-bold text-amber-900 text-sm uppercase tracking-widest mb-2 flex items-center gap-2">
                <AlertCircle size={14} /> Initial Request Details
              </h3>
              <p className="text-sm text-amber-800 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Right Column - Interactions & Timeline */}
        <div className="lg:col-span-2 flex flex-col bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-white">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-widest">Activity Timeline</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {lead.interactions?.length === 0 ? (
              <div className="text-center text-slate-400 py-10">No interactions recorded yet.</div>
            ) : (
              lead.interactions?.map((int: any) => (
                <div key={int.id} className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs mt-1">
                    {int.user?.displayName?.[0] || int.user?.email?.[0]?.toUpperCase() || 'S'}
                  </div>
                  <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">{int.user?.displayName || 'System'}</span>
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{int.type}</span>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">{new Date(int.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{int.notes}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-white border-t border-slate-200">
            <form onSubmit={handleAddInteraction} className="space-y-3">
              <div className="flex gap-3">
                <select 
                  value={noteType} 
                  onChange={e => setNoteType(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Note">Note</option>
                  <option value="Call">Call Log</option>
                  <option value="Email">Email Sent</option>
                  <option value="Meeting">Meeting</option>
                </select>
              </div>
              <div className="relative">
                <textarea
                  required
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Type your notes here..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pr-16 text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]"
                />
                <button 
                  type="submit" 
                  disabled={addingNote || !noteText.trim()}
                  className="absolute bottom-3 right-3 bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <MessageSquare size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
