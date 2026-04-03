import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CreditCard, 
  FileText, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Download,
  History,
  ShieldCheck,
  Zap,
  User,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { UserProfile, Subscription, UsageLog } from '../types';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';

// --- Subscriber View ---
export function SubscriberDashboardView({ profile }: { profile: UserProfile | null }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usageHistory, setUsageHistory] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.uid) return;
      try {
        // Fetch subscription
        const subQ = query(collection(db, 'subscriptions'), where('userId', '==', profile.uid), limit(1));
        const subSnap = await getDocs(subQ);
        if (!subSnap.empty) {
          setSubscription(subSnap.docs[0].data() as Subscription);
        }

        // Fetch usage history
        const usageQ = query(
          collection(db, 'usage_logs'), 
          where('userId', '==', profile.uid), 
          orderBy('timestamp', 'desc'),
          limit(5)
        );
        const usageSnap = await getDocs(usageQ);
        setUsageHistory(usageSnap.docs.map(doc => doc.data() as UsageLog));
      } catch (error) {
        console.error('Error fetching subscriber data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [profile]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Dashboard</h1>
          <p className="text-slate-500">Welcome back, {profile?.displayName || 'Subscriber'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${
            subscription?.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
          }`}>
            {subscription?.status || 'No Active Subscription'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile & Subscription Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <User size={20} className="text-blue-600" />
              Subscription Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Current Plan</p>
                  <p className="text-lg font-bold text-slate-900">{subscription?.planName || 'Free Access'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                  <p className={`text-sm font-bold ${subscription?.status === 'Active' ? 'text-green-600' : 'text-slate-500'}`}>
                    {subscription?.status || 'Inactive'}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Start Date</p>
                  <p className="text-sm font-bold text-slate-900">
                    {subscription?.startDate?.toDate ? subscription.startDate.toDate().toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Expiry Date</p>
                  <p className="text-sm font-bold text-red-600">
                    {subscription?.expiryDate?.toDate ? subscription.expiryDate.toDate().toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-slate-100">
              <Link to="/subscriptions" className="inline-flex items-center gap-2 text-blue-600 font-bold hover:underline">
                Upgrade or Renew Plan <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                  <BookOpen size={24} />
                </div>
                <span className="text-xs font-bold text-slate-400">VIEWS</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{subscription?.usageStats.views || 0}</p>
              <p className="text-xs text-slate-500 mt-1">Total journals viewed</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
                  <Download size={24} />
                </div>
                <span className="text-xs font-bold text-slate-400">DOWNLOADS</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{subscription?.usageStats.downloads || 0}</p>
              <p className="text-xs text-slate-500 mt-1">PDFs downloaded</p>
            </div>
          </div>
        </div>

        {/* Usage History */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <History size={18} className="text-slate-400" />
              Recent Activity
            </h3>
          </div>
          <div className="flex-1 divide-y divide-slate-50">
            {usageHistory.length > 0 ? (
              usageHistory.map((log) => (
                <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <p className="text-sm font-bold text-slate-900 line-clamp-1">{log.contentTitle}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      log.action === 'View' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                    }`}>
                      {log.action}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : 'Recently'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">
                <p className="text-sm">No recent activity found.</p>
              </div>
            )}
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100">
            <button className="w-full text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors">
              View Full History
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Subscription Manager View ---
export function SubscriptionManagerDashboardView({ profile }: { profile: UserProfile | null }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubs: 0,
    expiringSoon: 0,
    pendingApprovals: 0
  });

  useEffect(() => {
    // Mock fetching stats for now
    setStats({
      totalUsers: 1240,
      activeSubs: 856,
      expiringSoon: 42,
      pendingApprovals: 15
    });
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Subscription Management</h1>
        <p className="text-slate-500">Overview of users and active subscriptions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'blue' },
          { label: 'Active Subs', value: stats.activeSubs, icon: CreditCard, color: 'green' },
          { label: 'Expiring Soon', value: stats.expiringSoon, icon: AlertCircle, color: 'orange' },
          { label: 'Pending', value: stats.pendingApprovals, icon: Clock, color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className={`p-3 w-12 h-12 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 mb-4 flex items-center justify-center`}>
              <stat.icon size={24} />
            </div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link to="/dashboard/users" className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-100 transition-all group">
              <Users className="text-slate-400 group-hover:text-blue-600 mb-2" size={24} />
              <p className="font-bold text-slate-900">Manage Users</p>
              <p className="text-xs text-slate-500">View and edit user profiles</p>
            </Link>
            <Link to="/dashboard/subscriptions" className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-green-50 hover:border-green-100 transition-all group">
              <Zap className="text-slate-400 group-hover:text-green-600 mb-2" size={24} />
              <p className="font-bold text-slate-900">Assign Plans</p>
              <p className="text-xs text-slate-500">Update user subscriptions</p>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Expiring Soon</h3>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">JD</div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">John Doe</p>
                    <p className="text-[10px] text-slate-500">Expires in 3 days</p>
                  </div>
                </div>
                <button className="text-xs font-bold text-blue-600 hover:underline">Send Reminder</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Admin View ---
export function AdminDashboardView({ profile }: { profile: UserProfile | null }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Control Center</h1>
          <p className="text-slate-500">Full control over users, content, and system analytics.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-xl font-bold text-sm">
          <ShieldCheck size={18} />
          Super Admin Access
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Users', value: '15.2k', icon: Users, color: 'blue' },
          { label: 'Active Subs', value: '8.4k', icon: CreditCard, color: 'green' },
          { label: 'Total Content', value: '124k', icon: BookOpen, color: 'purple' },
          { label: 'Daily Views', value: '45k', icon: BarChart3, color: 'orange' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className={`p-3 w-12 h-12 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 mb-4 flex items-center justify-center`}>
              <stat.icon size={24} />
            </div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">Content Management</h3>
            <div className="space-y-4">
              <Link to="/dashboard/content" className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-blue-50 transition-all group">
                <div className="flex items-center gap-3">
                  <Upload size={20} className="text-slate-400 group-hover:text-blue-600" />
                  <span className="font-bold text-slate-700">Upload New Content</span>
                </div>
                <ArrowRight size={16} className="text-slate-300" />
              </Link>
              <Link to="/dashboard/content" className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-blue-50 transition-all group">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-slate-400 group-hover:text-blue-600" />
                  <span className="font-bold text-slate-700">Edit Publications</span>
                </div>
                <ArrowRight size={16} className="text-slate-300" />
              </Link>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-6">User & Role Control</h3>
            <div className="space-y-4">
              <Link to="/dashboard/users" className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-purple-50 transition-all group">
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-slate-400 group-hover:text-purple-600" />
                  <span className="font-bold text-slate-700">Manage All Users</span>
                </div>
                <ArrowRight size={16} className="text-slate-300" />
              </Link>
              <Link to="/dashboard/users" className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-purple-50 transition-all group">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={20} className="text-slate-400 group-hover:text-purple-600" />
                  <span className="font-bold text-slate-700">Role Permissions</span>
                </div>
                <ArrowRight size={16} className="text-slate-300" />
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-6">System Analytics</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Uptime</span>
              <span className="text-sm font-bold text-green-600">99.9%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Active Sessions</span>
              <span className="text-sm font-bold text-slate-900">4,231</span>
            </div>
            <div className="pt-6 border-t border-slate-100">
              <Link to="/dashboard/analytics" className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-all">
                <BarChart3 size={18} />
                Full Analytics Report
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Upload({ size, className }: { size?: number, className?: string }) {
  return <BookOpen size={size} className={className} />;
}
