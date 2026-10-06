import React, { useEffect, useState } from 'react';
import { CheckCircle2, Search, ArrowRight, Lock, ChevronLeft, LayoutGrid, BookOpen, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Badge, EmptyState, PageHeader, Skeleton, buttonClass } from '../ui';

export function InstitutionContentAccess() {
  const [accessMap, setAccessMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/user/content-access', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setAccessMap)
      .catch(() => toast.error("Failed to load access map"))
      .finally(() => setLoading(false));
  }, []);

  const domains = Object.keys(accessMap);

  // Sort domains: those with any access come first
  const sortedDomains = [...domains].sort((a, b) => {
    const aAccess = accessMap[a].some(m => m.hasAccess) ? 1 : 0;
    const bAccess = accessMap[b].some(m => m.hasAccess) ? 1 : 0;
    if (aAccess !== bAccess) return bAccess - aAccess;
    return a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6" role="status" aria-label="Loading departments">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (selectedDomain) {
    const modules = accessMap[selectedDomain] || [];
    const unlockedCount = modules.filter(m => m.hasAccess).length;
    const isFullyUnlocked = unlockedCount > 0 && unlockedCount === modules.length;

    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          type="button"
          onClick={() => setSelectedDomain(null)}
          className="btn btn-ghost btn-sm -ml-3"
        >
          <ChevronLeft size={16} aria-hidden="true" /> Back to Departments
        </button>

        <div className="card overflow-hidden">
          <div className="flex flex-col justify-between gap-4 border-b border-rule bg-surface-2/50 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div className="min-w-0">
              <h1 className="flex items-center gap-3 text-ink">
                <LayoutGrid className="shrink-0 text-accent" size={24} aria-hidden="true" /> <span className="min-w-0 break-words">{selectedDomain}</span>
              </h1>
              <p className="mt-1 text-sm text-muted">
                {unlockedCount} of {modules.length} content types unlocked
              </p>
            </div>
            {isFullyUnlocked ? (
              <Badge tone="success" className="w-max">
                <CheckCircle2 size={14} aria-hidden="true" /> Full Access
              </Badge>
            ) : (
              <a href={`/domain/${selectedDomain.toLowerCase().replace(/\s+/g, '-')}`} className={buttonClass('outline', 'md', 'w-max')}>
                <Lock size={16} aria-hidden="true" /> Upgrade Plan for More
              </a>
            )}
          </div>

          <div className="divide-y divide-rule">
            {modules.length === 0 ? (
               <EmptyState title="No content types found in this department." />
            ) : (
              modules.map((mod) => (
                <div key={mod.id} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-2/50 sm:px-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-rule ${mod.hasAccess ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`} aria-hidden="true">
                      {mod.hasAccess ? <BookOpen size={20} /> : <Lock size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-base font-semibold ${mod.hasAccess ? 'text-ink' : 'text-muted'}`}>
                        {mod.contentType}
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {mod.totalCount.toLocaleString()} item{mod.totalCount !== 1 ? 's' : ''} available
                      </p>
                    </div>
                  </div>
                  
                  {mod.hasAccess ? (
                    <button 
                      onClick={() => navigate(
                        // One library for both datasets. Periodicals are mostly in the
                        // ingested collection; every other type lives in the archive.
                        mod.contentType === 'Periodicals'
                          ? `/institution/explore?domain=${encodeURIComponent(selectedDomain)}&mode=new`
                          : `/institution/explore?domain=${encodeURIComponent(selectedDomain)}&mode=archived&atype=${encodeURIComponent(mod.contentType)}`
                      )}
                      className="btn btn-primary btn-sm shrink-0"
                      aria-label={`Browse ${mod.contentType} in ${selectedDomain}`}
                    >
                      Browse <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  ) : (
                    <Badge tone="neutral" className="shrink-0"><Lock size={12} aria-hidden="true" /> Locked</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-3"><Layers className="shrink-0 text-accent" size={28} aria-hidden="true" /> My Content Access</span>}
        description="Select a department below to see which content types (Books, Periodicals, etc.) you have unlocked. Browse and read instantly."
        className="!mb-0"
      />

      <div className="relative max-w-xl">
        <label htmlFor="dept-search" className="sr-only">Search departments</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" size={16} aria-hidden="true" />
        <input
          id="dept-search"
          type="search"
          placeholder="Search departments..."
          className="input pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedDomains
          .filter(d => d.toLowerCase().includes(search.toLowerCase()))
          .map((domain) => {
            const modules = accessMap[domain] || [];
            const unlockedCount = modules.filter(m => m.hasAccess).length;
            const hasAnyAccess = unlockedCount > 0;

            return (
              <button
                type="button"
                key={domain}
                onClick={() => setSelectedDomain(domain)}
                className={`card card-interactive group relative p-5 text-left ${hasAnyAccess ? 'hover:border-accent' : 'bg-surface-2/50'}`}
              >
                <h2 className={`pr-6 text-lg font-semibold ${hasAnyAccess ? 'text-ink group-hover:text-accent' : 'text-ink-2'}`}>
                  {domain}
                </h2>

                <div className="mt-4 space-y-1.5">
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${hasAnyAccess ? 'text-success' : 'text-muted'}`}>
                    {hasAnyAccess ? <CheckCircle2 size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
                    {unlockedCount} of {modules.length} accessible
                  </p>
                  <p className="text-xs text-muted">
                    Total {modules.reduce((acc, m) => acc + m.totalCount, 0).toLocaleString()} items
                  </p>
                </div>
              </button>
            );
        })}
        {domains.length === 0 && !loading && (
          <div className="card col-span-full">
            <EmptyState icon={Layers} title="No departments available." />
          </div>
        )}
        {domains.length > 0 && !sortedDomains.some(d => d.toLowerCase().includes(search.toLowerCase())) && (
          <div className="card col-span-full">
            <EmptyState icon={Search} title="No departments match this search" description="Try another name." />
          </div>
        )}
      </div>
    </div>
  );
}
