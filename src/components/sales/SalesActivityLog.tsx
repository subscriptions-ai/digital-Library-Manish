import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Mail, Phone, Calendar, MessageSquare, Clock, ArrowRight, ClipboardList } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmptyState, Skeleton } from '../ui';

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
      <div className="space-y-6" role="status" aria-label="Loading activity">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Icons based on interaction types
  const getIcon = (type: string) => {
    switch (type) {
      case 'Call':
        return <Phone size={16} aria-hidden="true" />;
      case 'Email':
        return <Mail size={16} aria-hidden="true" />;
      case 'Meeting':
        return <Calendar size={16} aria-hidden="true" />;
      default:
        return <MessageSquare size={16} aria-hidden="true" />;
    }
  };

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'Call':
        return 'bg-success-soft text-success';
      case 'Email':
        return 'bg-accent-soft text-accent';
      case 'Meeting':
        return 'bg-surface-2 text-ink-2';
      default:
        return 'bg-caution-soft text-caution';
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
      <section className="space-y-3" aria-label={title}>
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider pl-1">{title}</h2>
        <div className="space-y-3">
          {items.map(act => (
            <button
              type="button"
              key={act.id}
              onClick={() => navigate(`/sales/leads/${act.leadId}`)}
              className="card card-interactive w-full text-left p-4 sm:p-5 flex gap-3 sm:gap-4 items-start group"
            >
              {/* Left icon wrapper */}
              <span className={`h-9 w-9 flex items-center justify-center rounded-lg shrink-0 ${getBadgeColor(act.type)}`} title={act.type}>
                {getIcon(act.type)}
              </span>

              {/* Middle details */}
              <span className="flex-1 min-w-0 block">
                <span className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-ink text-sm truncate">{act.lead?.name || 'Unknown Lead'}</span>
                    {act.lead?.organization && (
                      <span className="text-xs text-muted truncate hidden md:inline">• {act.lead.organization}</span>
                    )}
                  </span>
                  <span className="text-xs text-muted flex items-center gap-1 shrink-0">
                    <Clock size={12} aria-hidden="true" />
                    {new Date(act.createdAt).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}
                    {title === 'Older Activities' && ` - ${new Date(act.createdAt).toLocaleDateString()}`}
                  </span>
                </span>
                <span className="block text-ink-2 text-sm leading-relaxed whitespace-pre-wrap break-words">{act.notes}</span>
                <span className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="badge badge-neutral">{act.type}</span>
                  {act.lead?.source && <span className="badge badge-neutral">{act.lead.source}</span>}
                </span>
              </span>

              {/* Right View action */}
              <span className="hidden sm:inline-flex self-center shrink-0 items-center gap-1 text-xs font-semibold text-accent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                Lead Details <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const hasAnyActivities = filteredActivities.length > 0;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="type-page-title text-ink">Activity Log</h1>
        <p className="text-muted text-sm mt-1">A consolidated timeline of all your notes, phone calls, emails, and meetings.</p>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div className="field">
          <label htmlFor="activity-search" className="field-label">Search</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              id="activity-search"
              type="text"
              placeholder="Lead name or note details"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9"
            />
          </div>
        </div>

        {/* Interaction Type dropdown */}
        <div className="field">
          <label htmlFor="activity-type" className="field-label">Interaction type</label>
          <select
            id="activity-type"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input sm:w-48"
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
          <div className="card">
            <EmptyState
              icon={ClipboardList}
              title="No activities logged"
              description="You haven't logged any notes, calls, emails, or meetings matching the current filters."
            />
          </div>
        )}
      </div>
    </div>
  );
}
