import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, ShieldCheck, Mail, Phone, Calendar, User, ArrowRight, UserPlus, FileText, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function AdminLeadManager() {
  const [leads, setLeads] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const handleSyncOldLeads = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/leads/migrate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sync');
      toast.success(data.message);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSyncing(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadsRes, teamRes] = await Promise.all([
        fetch('/api/admin/leads', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch('/api/admin/sales-team', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      ]);
      
      if (!leadsRes.ok || !teamRes.ok) throw new Error('Failed to fetch data');
      
      setLeads(await leadsRes.json());
      setTeam(await teamRes.json());
    } catch (error) {
      toast.error('Failed to load leads data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!assignTo || selectedLeads.length === 0) return;
    setAssigning(true);
    try {
      const res = await fetch('/api/admin/leads/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ leadIds: selectedLeads, assignedToId: assignTo })
      });
      if (!res.ok) throw new Error('Failed to assign');
      toast.success('Leads assigned successfully!');
      setSelectedLeads([]);
      setAssignTo('');
      fetchData(); // refresh list
    } catch (error) {
      toast.error('Failed to assign leads');
    } finally {
      setAssigning(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'New': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold uppercase">New</span>;
      case 'Contacted': return <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-xs font-bold uppercase">Contacted</span>;
      case 'In Progress': return <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md text-xs font-bold uppercase">In Progress</span>;
      case 'Converted': return <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-xs font-bold uppercase flex items-center gap-1"><CheckCircle2 size={12}/> Converted</span>;
      case 'Lost': return <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-md text-xs font-bold uppercase">Lost</span>;
      default: return <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-bold uppercase">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UserPlus className="text-indigo-600" />
            Lead Master
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage all incoming queries and assign them to executives.</p>
        </div>
        <button
          onClick={handleSyncOldLeads}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-bold disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync Old Inquiries'}
        </button>
      </div>

      {selectedLeads.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm"
        >
          <div className="font-bold text-indigo-900">
            {selectedLeads.length} Lead{selectedLeads.length > 1 && 's'} selected
          </div>
          <div className="flex items-center gap-3">
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="px-4 py-2 bg-white border border-indigo-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Select Executive --</option>
              {team.map(member => (
                <option key={member.id} value={member.id}>{member.displayName || member.email}</option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={!assignTo || assigning}
              className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {assigning ? 'Assigning...' : 'Assign Leads'}
            </button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-40 bg-slate-100 animate-pulse rounded-2xl"></div>
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No Leads Found</h3>
          <p className="text-slate-500">There are no incoming leads right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      checked={selectedLeads.length === leads.length && leads.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedLeads(leads.map(l => l.id));
                        else setSelectedLeads([]);
                      }}
                    />
                  </th>
                  <th className="p-4">Lead Details</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4">Source</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Assigned To</th>
                  <th className="p-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className={`hover:bg-slate-50 transition-colors ${selectedLeads.includes(lead.id) ? 'bg-indigo-50/30' : ''}`}>
                    <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        checked={selectedLeads.includes(lead.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedLeads([...selectedLeads, lead.id]);
                          else setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                        }}
                      />
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{lead.name}</div>
                      {lead.organization && <div className="text-xs text-slate-500 mt-0.5 font-medium">{lead.organization}</div>}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 text-xs text-slate-600">
                        <span className="flex items-center gap-1"><Mail size={12} className="text-slate-400"/> {lead.email}</span>
                        {lead.phone && <span className="flex items-center gap-1"><Phone size={12} className="text-slate-400"/> {lead.phone}</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        {lead.source}
                      </span>
                    </td>
                    <td className="p-4">{getStatusBadge(lead.status)}</td>
                    <td className="p-4">
                      {lead.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                            {lead.assignedTo.displayName?.[0] || lead.assignedTo.email[0].toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-slate-700">{lead.assignedTo.displayName || lead.assignedTo.email.split('@')[0]}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-rose-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock size={12}/> {new Date(lead.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
