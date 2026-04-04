import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Users, IndianRupee, FileText } from 'lucide-react';
import { cn } from '../../../lib/utils';

export function RecentActivityTable({ stats }: { stats: any }) {
  const [activeTab, setActiveTab] = useState<'quotations' | 'users' | 'payments'>('quotations');

  const tabs = [
    { id: 'quotations', label: 'Recent Quotations', icon: <FileText size={16} /> },
    { id: 'payments', label: 'Payments', icon: <IndianRupee size={16} /> },
    { id: 'users', label: 'New Users', icon: <Users size={16} /> }
  ];

  if (!stats) return null;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800">Recent Activity</h2>
        
        <div className="flex bg-slate-50 p-1 rounded-xl w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                activeTab === tab.id 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              {tab.icon} <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-0 min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-md text-xs font-bold text-slate-500 uppercase tracking-widest">
                {activeTab === 'quotations' && (
                  <tr>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Plan (Domain)</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                )}
                {activeTab === 'payments' && (
                  <tr>
                    <th className="px-6 py-4">Transaction / User</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                )}
                {activeTab === 'users' && (
                  <tr>
                    <th className="px-6 py-4">User Details</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4">Role</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100/60">
                {activeTab === 'quotations' && stats.quotations?.slice(0, 5).map((q: any) => (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{q.userName}</div>
                      <div className="text-xs text-slate-500">{q.userEmail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-700">{q.planType}</div>
                      <div className="text-[11px] text-slate-400 max-w-[150px] truncate">{q.allowedDomain || 'All'}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900 border-r border-transparent">
                      ₹{q.total?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md",
                        q.status === 'Pending' ? "bg-amber-100 text-amber-700" :
                        q.status === 'Approved' ? "bg-blue-100 text-blue-700" :
                        q.status === 'Paid' ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {q.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {activeTab === 'payments' && stats.payments?.slice(0, 5).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{p.id.split('_').pop()?.toUpperCase()}</div>
                      <div className="text-xs text-slate-500">{p.user?.displayName || p.user?.email || 'Unknown User'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      ₹{p.amount?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md",
                        p.status === 'Success' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      )}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {activeTab === 'users' && stats.users?.slice(0, 5).map((u: any) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase">
                        {u.displayName?.substring(0, 2) || u.email?.substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{u.displayName || 'No Name'}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                       <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded-md">
                        {u.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
