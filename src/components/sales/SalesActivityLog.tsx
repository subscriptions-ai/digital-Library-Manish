import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Mail, Phone, Calendar, MessageSquare, Clock, ArrowRight, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function SalesActivityLog() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchActivity();
  }, []);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales/my-activity', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      setActivities(await res.json());
    } catch {
      toast.error('Failed to load activity log');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-100 rounded w-1/4"></div>
        <div className="h-12 bg-slate-100 rounded"></div>
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl"></div>)}
        </div>
      </div>
    );
  }

  // Icons based on interaction types
  const getIcon = (type: string) => {
    switch (type) {
      case 'Call':
        return <Phone size={14} className="text-emerald-600" />;
      case 'Email':
        return <Mail size={14} className="text-indigo-600" />;
      case 'Meeting':
        return <Calendar size={14} className="text-purple-600" />;
      default:
        return <MessageSquare size={14} className="text-amber-600" />;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'Call':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'Email':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'Meeting':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-100';
    }
  };

  // Filter activities
  const filteredActivities = activities.filter(act => {
    if (selectedType !== 'All' && act.type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const leadNameMatch = act.lead?.name?.toLowerCase().includes(q);
      const notesMatch = act.notes?.toLowerCase().includes(q);
      if (!leadNameMatch && !notesMatch) return false;
    }
    return true;
  });

  // Group activities by date category (Today, Yesterday, This Week, Older)
  const groupActivities = (list: any[]) => {
    const today: any[] = [];
    const yesterday: any[] = [];
    const thisWeek: any[] = [];
    const older: any[] = [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    list.forEach(act => {
      const date = new Date(act.createdAt);
      if (date >= todayStart) {
        today.push(act);
      } else if (date >= yesterdayStart) {
        yesterday.push(act);
      } else if (date >= weekStart) {
        thisWeek.push(act);
      } else {
        older.push(act);
      }
    });

    return { today, yesterday, thisWeek, older };
  };

  const groups = groupActivities(filteredActivities);

  const renderSection = (title: string, items: any[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">{title}</h3>
        <div className="space-y-3">
          {items.map(act => (
            <div 
              key={act.id} 
              onClick={() => navigate(`/sales/leads/${act.leadId}`)}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer flex gap-4 items-start group"
            >
              {/* Left icon wrapper */}
              <div className={`p-2.5 rounded-xl border shrink-0 ${getBadgeColor(act.type)}`}>
                {getIcon(act.type)}
              </div>
              
              {/* Middle details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-800 text-sm">{act.lead?.name || 'Unknown Lead'}</span>
                    {act.lead?.organization && (
                      <span className="text-xs text-slate-400 font-semibold truncate hidden md:inline">• {act.lead.organization}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(act.createdAt).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}
                    {title === 'Older' && ` - ${new Date(act.createdAt).toLocaleDateString()}`}
                  </span>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap font-medium">{act.notes}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-indigo-100">
                    {act.lead?.source}
                  </span>
                </div>
              </div>

              {/* Right View action */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
                <button className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 bg-slate-100 py-1.5 px-3 rounded-lg">
                  Lead Details <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasAnyActivities = filteredActivities.length > 0;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">Activity Log</h1>
        <p className="text-slate-500 text-sm font-semibold mt-1">A consolidated timeline of all your notes, phone calls, emails, and meetings.</p>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
        {/* Search */}
        <div className="relative w-full sm:flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search logs by lead name or note details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-400"
          />
        </div>

        {/* Interaction Type dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Clock size={15} className="text-slate-400" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none pr-6 cursor-pointer"
          >
            <option value="All">All Interactions</option>
            <option value="Note">Notes Only</option>
            <option value="Call">Phone Calls</option>
            <option value="Email">Emails Sent</option>
            <option value="Meeting">Meetings</option>
          </select>
        </div>
      </div>

      {/* Timeline List */}
      <div className="space-y-8 pb-12">
        {hasAnyActivities ? (
          <>
            {renderSection('Today', groups.today)}
            {renderSection('Yesterday', groups.yesterday)}
            {renderSection('This Week', groups.thisWeek)}
            {renderSection('Older Activities', groups.older)}
          </>
        ) : (
          <div className="text-center py-16 bg-slate-50/20 rounded-3xl border border-slate-200 border-dashed">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <User size={20} />
            </div>
            <h4 className="font-extrabold text-slate-700 text-sm">No Activities Logged</h4>
            <p className="text-slate-400 text-xs mt-1">You haven't logged any notes, calls, emails, or meetings matching the current filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
