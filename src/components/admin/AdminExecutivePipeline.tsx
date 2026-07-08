import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Search, MapPin, Building2, User, CheckCircle2, Phone } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PIPELINE_STAGES = ['All', 'Positive', 'No Response', 'Subscriber', 'In Progress', 'Negative', 'Repeated'];

const STAGE_COLORS: Record<string, string> = {
  'All': 'bg-slate-100 border-slate-200 text-slate-800',
  'Positive': 'bg-blue-100 border-blue-200 text-blue-800',
  'No Response': 'bg-amber-100 border-amber-200 text-amber-800',
  'Subscriber': 'bg-emerald-100 border-emerald-200 text-emerald-800',
  'In Progress': 'bg-purple-100 border-purple-200 text-purple-800',
  'Negative': 'bg-rose-100 border-rose-200 text-rose-800',
  'Repeated': 'bg-orange-100 border-orange-200 text-orange-800',
};

export function AdminExecutivePipeline() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<any[]>([]);
  const [executive, setExecutive] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch executive details
      const teamRes = await fetch('/api/admin/sales-team', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (teamRes.ok) {
        const team = await teamRes.json();
        const exec = team.find((t: any) => t.id === id);
        if (exec) setExecutive(exec);
      }

      // Fetch all leads and filter
      const leadsRes = await fetch('/api/admin/leads', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (leadsRes.ok) {
        const allLeads = await leadsRes.json();
        setLeads(allLeads.filter((l: any) => l.assignedToId === id));
      }
    } catch {
      toast.error('Failed to load pipeline data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse p-6">Loading pipeline...</div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1400px] mx-auto w-full">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/sales-team')} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {executive?.displayName || 'Executive'}'s Pipeline
            </h1>
            <p className="text-sm text-slate-500 mt-1">Tracking lead progression and status.</p>
          </div>
        </div>
      </div>

      {/* Top Dashboard Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 mt-2">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Total Leads</p>
            <h3 className="text-2xl font-black text-slate-900">{leads.length}</h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
            <User size={20} />
          </div>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-600 uppercase">Subscribers</p>
            <h3 className="text-2xl font-black text-emerald-900">{leads.filter(l => l.status === 'Subscriber').length}</h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <CheckCircle2 size={20} />
          </div>
        </div>
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase">Positive</p>
            <h3 className="text-2xl font-black text-blue-900">{leads.filter(l => l.status === 'Positive').length}</h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <Phone size={20} />
          </div>
        </div>
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-amber-600 uppercase">In Progress</p>
            <h3 className="text-2xl font-black text-amber-900">{leads.filter(l => l.status === 'In Progress').length}</h3>
          </div>
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
            <Clock size={20} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start pb-12">
        {PIPELINE_STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.status === stage);
          return (
            <div key={stage} className="bg-slate-50/50 rounded-3xl p-4 border border-slate-200">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">{stage}</h3>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STAGE_COLORS[stage]}`}>
                  {stageLeads.length}
                </span>
              </div>
              
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative flex flex-col gap-3"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm leading-tight mb-1">{lead.name}</h4>
                      {lead.organization && (
                        <p className="text-xs text-slate-600 font-semibold flex items-start gap-1.5">
                          <Building2 size={12} className="shrink-0 mt-0.5 text-slate-400" />
                          <span className="line-clamp-1">{lead.organization}</span>
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      {lead.state && (
                        <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md w-fit">
                          <MapPin size={10} className="text-indigo-500" /> {lead.state}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1 font-medium"><Clock size={12} className="text-slate-400" /> {new Date(lead.createdAt || lead.updatedAt).toLocaleDateString()}</span>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider border border-indigo-100">{lead.source}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 bg-white/50 rounded-2xl text-slate-400 text-xs font-semibold">
                    No leads in this stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
