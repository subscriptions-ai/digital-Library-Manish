import React, { useState, useEffect, Suspense, lazy } from 'react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

import { DashboardSummaryCards } from './dashboard/DashboardSummaryCards';
import { RecentActivityTable } from './dashboard/RecentActivityTable';

// Lazy load heavy charting libraries to optimize performance
const DashboardCharts = lazy(() => import('./dashboard/DashboardCharts').then(m => ({ default: m.DashboardCharts })));
const UsersGeoMap = lazy(() => import('./dashboard/UsersGeoMap'));

export function AdminDashboardHome() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!response.ok) throw new Error("Failed to fetch stats");
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error("Error fetching stats:", error);
        toast.error("Failed to load dashboard stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

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
      </div>

      {/* Top Value Cards */}
      <DashboardSummaryCards stats={stats} />

      {/* Main Charts - Lazy Loaded to keep bundle size efficient */}
      <Suspense fallback={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-50 animate-pulse border border-slate-100 rounded-3xl h-[350px]" />
          <div className="bg-slate-50 animate-pulse border border-slate-100 rounded-3xl h-[350px]" />
        </div>
      }>
        <DashboardCharts stats={stats} />
      </Suspense>

      {/* Bottom Grid Layout - Map & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* Geo Map takes 2 columns (40%) */}
        <motion.div variants={itemVariants as any} className="lg:col-span-2">
          <Suspense fallback={<div className="bg-slate-50 animate-pulse border border-slate-100 rounded-3xl h-[400px] w-full" />}>
            <UsersGeoMap stats={stats} />
          </Suspense>
        </motion.div>

        {/* Recent Activity takes 3 columns (60%) */}
        <motion.div variants={itemVariants as any} className="lg:col-span-3">
          <RecentActivityTable stats={stats} />
        </motion.div>

      </div>
    </motion.div>
  );
}
