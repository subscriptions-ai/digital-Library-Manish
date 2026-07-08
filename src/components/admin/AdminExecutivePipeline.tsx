import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Search } from 'lucide-react';
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

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[1000px] h-full items-start">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.status === stage);
            return (
              <div key={stage} className="flex-1 w-64 bg-slate-50 rounded-3xl p-4 border border-slate-200 min-h-[500px]">
                <div className="flex items-center justify-between mb-4 px-1">
                  <h3 className="font-bold text-sm text-slate-700 uppercase tracking-wider">{stage}</h3>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STAGE_COLORS[stage]}`}>
                    {stageLeads.length}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative"
                    >
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">{lead.name}</h4>
                      {lead.organization && <p className="text-xs text-slate-500 font-medium mt-0.5">{lead.organization}</p>}
                      
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Clock size={12}/> {new Date(lead.updatedAt).toLocaleDateString()}</span>
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase">{lead.source}</span>
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-semibold">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
