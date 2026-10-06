import React, { useEffect, useState } from 'react';
import { CheckCircle2, Search, ArrowRight, Lock, ChevronLeft, LayoutGrid, BookOpen, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, buttonClass, EmptyState, Field, PageHeader, Skeleton } from '../ui';

/**
 * Send Browse to the shelf the items are actually on.
 *
 * These counts are drawn from Content, Article and Book together, but the two
 * datasets live on different shelves. A Nursing reader was told "1,821 items"
 * and then sent to the archived shelf, which holds none of them.
 */
function browseHref(mod: any, domain: string) {
  const q = new URLSearchParams({ domain });
  if ((mod.newCount ?? 0) > 0) {
    if (mod.contentType === 'Books') q.set('kind', 'books');
    return `/dashboard/library?${q}`;
  }
  q.set('mode', 'archived');
  if (mod.contentType) q.set('atype', mod.contentType);
  return `/dashboard/library?${q}`;
}

export function MyContentAccess() {
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
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card card-pad space-y-3" aria-hidden="true">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
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
      <div className="space-y-6 pb-12">
        <button 
          type="button"
          onClick={() => setSelectedDomain(null)}
          className="btn btn-ghost btn-sm -ml-3"
        >
          <ChevronLeft size={16} aria-hidden="true" /> Back to Departments
        </button>

        <div className="card overflow-hidden">
          <div className="flex flex-col justify-between gap-4 border-b border-rule bg-surface-2 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
            <div className="min-w-0">
              <h1 className="type-page-title flex items-center gap-3 text-ink">
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
              <a href={`/domain/${selectedDomain.toLowerCase().replace(/\s+/g, '-')}`} className={buttonClass('primary', 'md', 'w-max')}>
                <Lock size={16} aria-hidden="true" /> Upgrade Plan for More
              </a>
            )}
          </div>
          
          <div className="divide-y divide-rule">
            {modules.length === 0 ? (
              <EmptyState title="No content types found in this department." />
            ) : (
              modules.map((mod) => (
                <div key={mod.id} className="flex items-center justify-between gap-4 px-4 py-4 transition-colors duration-150 hover:bg-surface-2 sm:px-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rule ${mod.hasAccess ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-faint'}`} aria-hidden="true">
                      {mod.hasAccess ? <BookOpen size={20} /> : <Lock size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-base font-semibold ${mod.hasAccess ? 'text-ink' : 'text-muted'}`}>
                        {mod.contentType}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {mod.totalCount.toLocaleString()} item{mod.totalCount !== 1 ? 's' : ''} available
                      </p>
                    </div>
                  </div>
                  
                  {mod.hasAccess ? (
                    <Button
                      size="sm"
                      onClick={() => navigate(browseHref(mod, selectedDomain))}
                      className="shrink-0"
                      aria-label={`Browse ${mod.contentType}`}
                    >
                      Browse <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                  ) : (
                    <Badge tone="neutral" className="shrink-0">
                      <Lock size={12} aria-hidden="true" /> Locked
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  const visibleDomains = sortedDomains.filter(d => d.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        className="mb-0"
        title="My Content Access"
        description="Select a department below to see which content types (Books, Periodicals, etc.) you have unlocked. Browse and read instantly."
      />

      <Field label="Search departments" className="max-w-xl">
        <input
          type="search"
          placeholder="e.g. Nursing"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleDomains.map((domain) => {
            const modules = accessMap[domain] || [];
            const unlockedCount = modules.filter(m => m.hasAccess).length;
            const hasAnyAccess = unlockedCount > 0;

            return (
              <button 
                type="button"
                key={domain}
                onClick={() => setSelectedDomain(domain)}
                className={`card card-pad card-interactive group text-left ${hasAnyAccess ? '' : 'bg-surface-2'}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className={`text-lg font-semibold transition-colors duration-150 ${hasAnyAccess ? 'text-ink group-hover:text-accent' : 'text-ink-2'}`}>
                    {domain}
                  </h2>
                  {hasAnyAccess && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                </div>
                
                <div className="space-y-1">
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${hasAnyAccess ? 'text-accent' : 'text-muted'}`}>
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
        {domains.length > 0 && visibleDomains.length === 0 && (
          <div className="card col-span-full">
            <EmptyState
              icon={Search}
              title="No departments match your search"
              action={<Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
            />
          </div>
        )}
      </div>
    </div>
  );
}
