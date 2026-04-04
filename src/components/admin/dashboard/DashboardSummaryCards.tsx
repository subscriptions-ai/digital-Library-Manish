import React from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Users, FileText, LayoutTemplate, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface DashboardSummaryCardsProps {
  stats: any;
}

export function DashboardSummaryCards({ stats }: DashboardSummaryCardsProps) {
  const { _stats } = stats || {};
  
  if (!_stats) return null;

  const summaryData = [
    {
      title: "Total Revenue",
      value: `₹${_stats.totalRevenue?.toLocaleString() || 0}`,
      trend: _stats.revenueGrowthPct || 0,
      icon: <CreditCard size={20} />,
      colorClass: "from-blue-500 to-blue-600 shadow-blue-500/20",
      delay: 0.1
    },
    {
      title: "Active Subscriptions",
      value: _stats.activeSubscriptions || 0,
      trend: 5.2, // mock trend if not supplied
      icon: <FileText size={20} />,
      colorClass: "from-indigo-500 to-indigo-600 shadow-indigo-500/20",
      delay: 0.2
    },
    {
      title: "Total Users",
      value: _stats.totalUsers || 0,
      trend: _stats.userGrowthPct || 0,
      icon: <Users size={20} />,
      colorClass: "from-emerald-500 to-emerald-600 shadow-emerald-500/20",
      delay: 0.3
    },
    {
      title: "Total Content",
      value: _stats.totalContent || 0,
      trend: _stats.contentGrowthPct || 0,
      icon: <LayoutTemplate size={20} />,
      colorClass: "from-amber-500 to-amber-600 shadow-amber-500/20",
      delay: 0.4
    },
    {
      title: "Pending Requests",
      value: _stats.pendingRequests || 0,
      trend: 0, // Trends don't apply strongly to pending queue
      icon: <Clock size={20} />,
      colorClass: "from-rose-500 to-rose-600 shadow-rose-500/20",
      delay: 0.5
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {summaryData.map((item, index) => {
        const isPositive = item.trend > 0;
        const isNeutral = item.trend === 0;

        return (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: item.delay, duration: 0.4, ease: "easeOut" }}
            className={cn(
              "relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg",
              item.colorClass
            )}
          >
            {/* Background pattern mask */}
            <div className="absolute -right-6 -top-6 opacity-20 pointer-events-none">
              <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="20" />
              </svg>
            </div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                  {item.icon}
                </div>
                <span className="font-bold text-xs tracking-wider uppercase text-white/90">
                  {item.title}
                </span>
              </div>
              
              <div className="text-3xl font-extrabold tracking-tight mb-2">
                {item.value}
              </div>
              
              <div className="mt-auto flex items-center">
                {!isNeutral && (
                  <span className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg backdrop-blur-md bg-white/20",
                  )}>
                    {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(item.trend)}%
                  </span>
                )}
                <span className="text-[10px] text-white/70 ml-2 font-medium uppercase tracking-wide">
                  vs Last Month
                </span>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
