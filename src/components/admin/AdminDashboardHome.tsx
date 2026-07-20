import React, { useState, useEffect, Suspense, lazy } from 'react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

import { DashboardSummaryCards } from './dashboard/DashboardSummaryCards';
import { RecentActivityTable } from './dashboard/RecentActivityTable';

// Lazy load heavy charting libraries to optimize performance
const DashboardCharts = lazy(() => import('./dashboard/DashboardCharts').then(m => ({ default: m.DashboardCharts })));
const IndiaStateHeatmap = lazy(() => import('./dashboard/IndiaStateHeatmap'));
const TrafficAnalyticsChart = lazy(() => import('./dashboard/TrafficAnalyticsChart').then(m => ({ default: m.TrafficAnalyticsChart })));

export function AdminDashboardHome() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState<boolean>(true);
  const [publisherSafeMode, setPublisherSafeMode] = useState<boolean>(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!response.ok) throw new Error("Failed to fetch stats");
        const data = await response.json();
        setStats(data);

        // Fetch settings
        const settingsRes = await fetch('/api/admin/settings', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setEmailVerificationEnabled(s.emailVerificationEnabled);
          setPublisherSafeMode(Boolean(s.publisherSafeMode));
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
        toast.error("Failed to load dashboard stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const toggleEmailVerification = async () => {
    try {
      const newVal = !emailVerificationEnabled;
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ emailVerificationEnabled: newVal })
      });
      if (res.ok) {
        setEmailVerificationEnabled(newVal);
        toast.success(`Email verification ${newVal ? 'Enabled' : 'Disabled (Bypassed)'}`);
      } else {
        throw new Error();
      }
    } catch {
      toast.error('Failed to update settings');
    }
  };

  const togglePublisherSafeMode = async () => {
    try {
      const newVal = !publisherSafeMode;
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ publisherSafeMode: newVal })
      });
      if (res.ok) {
        setPublisherSafeMode(newVal);
        toast.success(`Stealth Mode ${newVal ? 'ON — commercial UI hidden' : 'OFF'}`);
      } else { throw new Error(); }
    } catch {
      toast.error('Failed to update stealth mode');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-slate-200 h-32 rounded-2xl w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-200 h-[350px] rounded-3xl w-full" />
          <div className="bg-slate-200 h-[350px] rounded-3xl w-full" />
        </div>
      </div>
    );
  }

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6 pb-12"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Analytics Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time overview of the library performance and user growth.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col text-right hidden sm:flex">
              <span className="text-sm font-bold text-slate-800">Email Verification</span>
              <span className="text-xs text-slate-500">{emailVerificationEnabled ? 'Active' : 'Bypassed (Off)'}</span>
            </div>
            <button
              onClick={toggleEmailVerification}
              title={emailVerificationEnabled ? "Disable verification to bypass OTPs" : "Enable email verification"}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                emailVerificationEnabled ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  emailVerificationEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col text-right hidden sm:flex">
              <span className="text-sm font-bold text-slate-800">Stealth Mode</span>
              <span className="text-xs text-slate-500">{publisherSafeMode ? 'ON — commercial UI hidden' : 'Off'}</span>
            </div>
            <button
              onClick={togglePublisherSafeMode}
              title={publisherSafeMode ? "Disable stealth (show commercial UI)" : "Enable stealth mode (hide search, quotation, plans, FAQ, agency, demo)"}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                publisherSafeMode ? 'bg-amber-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  publisherSafeMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Top Value Cards */}
      <DashboardSummaryCards stats={stats} />

      {/* Traffic Analytics */}
      <motion.div variants={itemVariants as any}>
        <Suspense fallback={<div className="bg-slate-50 animate-pulse border border-slate-100 rounded-3xl h-[400px] w-full" />}>
          <TrafficAnalyticsChart />
        </Suspense>
      </motion.div>

      {/* Main Charts - Lazy Loaded to keep bundle size efficient */}
      <Suspense fallback={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-50 animate-pulse border border-slate-100 rounded-3xl h-[350px]" />
          <div className="bg-slate-50 animate-pulse border border-slate-100 rounded-3xl h-[350px]" />
        </div>
      }>
        <DashboardCharts stats={stats} />
      </Suspense>

      {/* India State Distribution Map - full width */}
      <motion.div variants={itemVariants as any}>
        <Suspense fallback={<div className="bg-slate-50 animate-pulse border border-slate-100 rounded-3xl h-[420px] w-full" />}>
          <IndiaStateHeatmap />
        </Suspense>
      </motion.div>

      {/* Recent Activity - full width below map */}
      <motion.div variants={itemVariants as any}>
        <RecentActivityTable stats={stats} />
      </motion.div>
    </motion.div>
  );
}
