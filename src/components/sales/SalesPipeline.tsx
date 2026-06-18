import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, Clock, CheckCircle2, XCircle, MoreVertical } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const PIPELINE_STAGES = ['New', 'Contacted', 'In Progress', 'Converted', 'Lost'];

const STAGE_COLORS: Record<string, string> = {
  'New': 'bg-blue-100 border-blue-200 text-blue-800',
  'Contacted': 'bg-amber-100 border-amber-200 text-amber-800',
  'In Progress': 'bg-purple-100 border-purple-200 text-purple-800',
  'Converted': 'bg-emerald-100 border-emerald-200 text-emerald-800',
  'Lost': 'bg-rose-100 border-rose-200 text-rose-800',
};

export function SalesPipeline() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/my-leads', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch pipeline');
      setLeads(await res.json());
    } catch (error) {
      toast.error('Could not load pipeline data');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error();
      toast.success(`Status updated to ${newStatus}`);
      fetchLeads(); // refresh
    } catch {
      toast.error('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-slate-100 rounded-lg"></div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => <div key={i} className="h-64 bg-slate-50 rounded-2xl"></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Pipeline</h1>
          <p className="text-sm text-slate-500 mt-1">Drag or update leads across different stages to close them.</p>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[1000px] h-full items-start">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.status === stage);
            return (
              <div key={stage} className="flex-1 w-64 bg-slate-50 rounded-2xl p-3 border border-slate-100 min-h-[400px]">
                <div className="flex items-center justify-between mb-4 px-1">
                  <h3 className="font-bold text-sm text-slate-700 uppercase tracking-wider">{stage}</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[stage]}`}>
                    {stageLeads.length}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {stageLeads.map(lead => (
                    <motion.div
                      layoutId={lead.id}
                      key={lead.id}
                      onClick={() => navigate(`/sales/leads/${lead.id}`)}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative group"
                    >
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">{lead.name}</h4>
                      {lead.organization && <p className="text-xs text-slate-500 font-medium mt-0.5">{lead.organization}</p>}
                      
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Clock size={12}/> {new Date(lead.createdAt).toLocaleDateString()}</span>
                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase">{lead.source}</span>
                      </div>

                      {/* Quick Action Overlay (Hidden by default, shows on hover) */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <select 
                          className="text-[10px] bg-slate-800 text-white border-none rounded py-1 px-2 font-bold cursor-pointer"
                          value={stage}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); updateStatus(lead.id, e.target.value); }}
                        >
                          {PIPELINE_STAGES.map(s => <option key={s} value={s}>Move to: {s}</option>)}
                        </select>
                      </div>
                    </motion.div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-center p-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-semibold">
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
