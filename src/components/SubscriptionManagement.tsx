import React, { useState, useEffect } from 'react';


import { Subscription, SubscriptionPlan } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  CreditCard, 
  Calendar, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Filter,
  Search,
  Download,
  Plus
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export function SubscriptionManagement() {
  const { isAdmin, isSubscriptionManager } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'subscriptions'));
      const querySnapshot = await getDocs(q);
      const fetchedSubs = querySnapshot.docs.map(doc => doc.data() as Subscription);
      setSubscriptions(fetchedSubs);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const filteredSubs = subscriptions.filter(sub => 
    sub.planName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscription Management</h1>
          <p className="text-slate-500">Track active plans, renewals, and usage limits.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-all">
            <Download size={18} />
            Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
            <Plus size={18} />
            Create Plan
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <CreditCard size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Subscriptions</p>
              <p className="text-2xl font-bold text-slate-900">{subscriptions.filter(s => s.status === 'Active').length}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-green-600 font-bold">
            <TrendingUp size={14} />
            +8% from last month
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-orange-50 text-orange-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Expiring Soon</p>
              <p className="text-2xl font-bold text-slate-900">12</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">Next 7 days</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Renewal Rate</p>
              <p className="text-2xl font-bold text-slate-900">92%</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">Average across all plans</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search by plan name or ID..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <select className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Expired">Expired</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Plan Details</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Usage (Views/DL)</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Expiry Date</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 font-medium">Loading subscriptions...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-slate-500 font-medium">No subscriptions found.</p>
                  </td>
                </tr>
              ) : (
                filteredSubs.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{sub.planName}</p>
                        <p className="text-xs text-slate-500">ID: {sub.id}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-slate-500">
                          <span>Views: {sub.usageStats.views}/{sub.usageLimits.views}</span>
                          <span>{Math.round((sub.usageStats.views / sub.usageLimits.views) * 100)}%</span>
                        </div>
                        <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              (sub.usageStats.views / sub.usageLimits.views) > 0.9 ? 'bg-red-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, (sub.usageStats.views / sub.usageLimits.views) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        sub.status === 'Active' ? 'bg-green-50 text-green-600' : 
                        sub.status === 'Expired' ? 'bg-red-50 text-red-600' : 
                        'bg-orange-50 text-orange-600'
                      }`}>
                        {sub.status === 'Active' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar size={12} />
                        {sub.expiryDate?.toDate ? sub.expiryDate.toDate().toLocaleDateString() : 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-sm font-bold text-blue-600 hover:underline">Manage</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
