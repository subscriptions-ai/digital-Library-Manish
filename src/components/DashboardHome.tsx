import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Users, 
  CreditCard, 
  FileText, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

export function DashboardHome() {
  const { profile } = useAuth();

  const stats = [
    { label: 'Total Users', value: '1,234', change: '+12%', trend: 'up', icon: Users, color: 'blue' },
    { label: 'Active Subs', value: '856', change: '+5%', trend: 'up', icon: CreditCard, color: 'green' },
    { label: 'Content Count', value: '45,678', change: '+2%', trend: 'up', icon: FileText, color: 'purple' },
    { label: 'Revenue', value: '₹12.5L', change: '-3%', trend: 'down', icon: BarChart3, color: 'orange' },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back, {profile?.displayName || 'User'}!</h1>
        <p className="text-slate-500">Here's what's happening with your platform today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl bg-${stat.color}-50 text-${stat.color}-600`}>
                <stat.icon size={24} />
              </div>
              <div className={`flex items-center gap-1 text-sm font-bold ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                {stat.trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {stat.change}
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Recent Activity</h3>
            <button className="text-sm text-blue-600 font-bold hover:underline">View All</button>
          </div>
          <div className="divide-y divide-slate-50">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <Clock size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">New subscription from IIT Delhi</p>
                  <p className="text-xs text-slate-500">2 hours ago • Institutional Plan</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">₹45,000</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-bold">
                    <CheckCircle2 size={10} /> Paid
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-bold text-slate-900 mb-6">System Health</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">Storage Usage</span>
                <span className="text-sm font-bold text-slate-900">75%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: '75%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">Active Sessions</span>
                <span className="text-sm font-bold text-slate-900">85%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '85%' }} />
              </div>
            </div>
            <div className="pt-4 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">API Status</p>
                <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Operational
                </p>
              </div>
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                <p className="text-xs text-orange-600 font-bold uppercase tracking-wider mb-1">Pending Tasks</p>
                <p className="text-sm font-bold text-orange-900 flex items-center gap-2">
                  <AlertCircle size={16} />
                  12 Approvals
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
