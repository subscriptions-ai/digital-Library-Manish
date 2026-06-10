import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, User, Monitor, Map, Globe, Search, ArrowRight, Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function DetailedAnalyticsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetailedAnalytics = async () => {
      try {
        const response = await fetch('/api/analytics/detailed', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!response.ok) throw new Error('Failed to fetch detailed analytics');
        const data = await response.json();
        setSessions(data);
      } catch (err) {
        console.error(err);
        toast.error('Failed to load detailed analytics');
      } finally {
        setLoading(false);
      }
    };
    fetchDetailedAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-12 bg-slate-200 rounded-xl w-64 mb-8" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-200 rounded-2xl w-full" />
        ))}
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pb-12"
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Activity className="text-blue-600" />
          Detailed Visitor Tracking
        </h1>
        <p className="text-sm text-slate-500 mt-2">Analyze individual visitor journeys, time spent, and behavior across the platform.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Recent Visitor Sessions</h2>
          <div className="flex gap-2 text-sm font-bold text-slate-500">
            Total Sessions: <span className="text-blue-600">{sessions.length}</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {sessions.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No sessions recorded yet. Wait for visitors to browse the site.
            </div>
          )}
          
          {sessions.map((session, idx) => (
            <div key={session.sessionId} className="hover:bg-slate-50 transition-colors">
              <div 
                className="p-6 cursor-pointer grid grid-cols-1 md:grid-cols-4 gap-4 items-center"
                onClick={() => setExpandedSession(expandedSession === session.sessionId ? null : session.sessionId)}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 truncate max-w-[200px]" title={session.userName || session.userRole}>
                      {session.userName || session.userRole}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Monitor size={12} /> {session.userAgent?.split(' ')[0] || 'Unknown Browser'}
                    </p>
                  </div>
                </div>

                <div className="text-sm text-slate-600">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={14} className="text-slate-400" />
                    {session.ipAddress || 'Unknown IP'}
                  </div>
                </div>

                <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Clock size={16} className="text-emerald-500" />
                  {session.timeSpentFormatted}
                </div>

                <div className="flex justify-end text-sm text-blue-600 font-bold">
                  {session.paths.length} Pages Visited
                </div>
              </div>

              {expandedSession === session.sessionId && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="px-6 pb-6 pt-2 border-t border-slate-100 bg-slate-50"
                >
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 ml-14">Visitor Journey</h4>
                  <div className="space-y-4 ml-14 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                    {session.paths.map((p: any, i: number) => (
                      <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-blue-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                          <div className="h-2 w-2 rounded-full bg-white" />
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-xl border border-slate-200 bg-white shadow-sm flex justify-between items-center">
                          <span className="text-sm font-bold text-slate-700">{p.path}</span>
                          <span className="text-xs text-slate-400">{new Date(p.time).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
