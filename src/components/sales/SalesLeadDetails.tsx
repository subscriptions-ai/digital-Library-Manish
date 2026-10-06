import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Building2, CheckCircle2, AlertCircle, MessageSquare, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, EmptyState, Field, Skeleton } from '../ui';

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
      navigate('/sales/leads');
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
    return (
      <div className="space-y-6" role="status" aria-label="Loading lead">
        <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-40" /></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-rule pb-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="btn btn-ghost btn-icon shrink-0 -ml-2" aria-label="Back">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="type-page-title text-ink break-words">{lead.name}</h1>
            <p className="text-sm text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Source: <span className="font-semibold text-ink-2">{lead.source}</span></span>
              {lead.state && (
                <>
                  <span className="text-faint" aria-hidden="true">•</span>
                  <span className="font-medium flex items-center gap-1"><MapPin size={12} className="text-faint" aria-hidden="true" /> {lead.state}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1">
            <a
              href={`mailto:${lead.email}`}
              className="btn btn-outline btn-icon text-accent"
              title="Send Email"
              aria-label="Send Email"
            >
              <Mail size={18} aria-hidden="true" />
            </a>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="btn btn-outline btn-icon text-success"
                title="Call Lead"
                aria-label="Call Lead"
              >
                <Phone size={18} aria-hidden="true" />
              </a>
            )}
          </div>
          <label htmlFor="lead-status" className="text-sm font-medium text-muted">Status</label>
          <select
            id="lead-status"
            value={lead.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updating}
            className="input w-auto font-semibold"
          >
            {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {lead.status === 'Subscriber' && (
            <button className="btn btn-primary">
              <CheckCircle2 size={16} aria-hidden="true" /> Provision Account
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Contact Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card card-pad">
            <h2 className="card-title mb-4">Contact Information</h2>
            <dl className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="text-faint mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted">Email Address</dt>
                  <dd><a href={`mailto:${lead.email}`} className="text-sm font-medium text-accent hover:underline break-all">{lead.email}</a></dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="text-faint mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <div>
                  <dt className="text-xs font-medium text-muted">Phone Number</dt>
                  <dd className="text-sm font-medium text-ink-2">{lead.phone || 'Not provided'}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building2 className="text-faint mt-0.5 shrink-0" size={16} aria-hidden="true" />
                <div>
                  <dt className="text-xs font-medium text-muted">Organization</dt>
                  <dd className="text-sm font-medium text-ink-2">{lead.organization || 'Not provided'}</dd>
                </div>
              </div>
              {lead.state && (
                <div className="flex items-start gap-3">
                  <MapPin className="text-faint mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <div>
                    <dt className="text-xs font-medium text-muted">State</dt>
                    <dd className="text-sm font-medium text-ink-2">{lead.state}</dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          {lead.notes && (
            <div className="rounded-xl p-5 border border-rule bg-caution-soft">
              <h2 className="font-semibold text-ink text-sm mb-2 flex items-center gap-2">
                <AlertCircle size={16} className="text-caution" aria-hidden="true" /> Initial Request Details
              </h2>
              <p className="text-sm text-ink-2 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Right Column - Interactions & Timeline */}
        <div className="lg:col-span-2 flex flex-col card overflow-hidden">
          <div className="px-5 py-4 border-b border-rule">
            <h2 className="card-title">Activity Timeline</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-surface-2/50">
            {lead.interactions?.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No interactions recorded yet" description="Log a call, email or note below." className="py-8" />
            ) : (
              lead.interactions?.map((int: any) => (
                <div key={int.id} className="flex gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center font-semibold text-xs mt-1" aria-hidden="true">
                    {int.user?.displayName?.[0] || int.user?.email?.[0]?.toUpperCase() || 'S'}
                  </div>
                  <div className="flex-1 min-w-0 bg-surface p-4 rounded-xl border border-rule">
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-sm">{int.user?.displayName || 'System'}</span>
                        <span className="badge badge-neutral">{int.type}</span>
                      </div>
                      <span className="text-xs text-muted">{new Date(int.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed break-words">{int.notes}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-rule">
            <form onSubmit={handleAddInteraction} className="space-y-3">
              <Field label="Type" className="sm:w-48">
                <select
                  value={noteType}
                  onChange={e => setNoteType(e.target.value)}
                  className="input"
                >
                  <option value="Note">Note</option>
                  <option value="Call">Call Log</option>
                  <option value="Email">Email Sent</option>
                  <option value="Meeting">Meeting</option>
                </select>
              </Field>
              <Field label="Notes">
                <textarea
                  required
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Type your notes here..."
                  className="input min-h-[80px]"
                />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" loading={addingNote} disabled={!noteText.trim()}>
                  <MessageSquare size={16} aria-hidden="true" /> Add to timeline
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
