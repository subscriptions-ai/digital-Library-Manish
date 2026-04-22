import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  ShieldCheck, Play, AlertTriangle, CheckCircle, Clock, X,
  FileText, Eye, ChevronRight, Layers, Hash, Filter, CheckSquare,
  Square, BarChart3, Zap, Calendar, Database, GitCommit, User,
  ArrowRightCircle, Activity, Trash2, Download, Search, RefreshCw,
  ScanLine
} from 'lucide-react';
import { ViewerValidationPanel } from './ViewerValidationPanel';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Issue {
  contentId: string;
  title: string;
  contentType?: string;
  issueType: string;
  description: string;
}

interface TimelineEvent {
  action: string;
  by: string;
  at: string;
  count?: number;
  note: string;
}

interface ValidationReport {
  id: string;
  type: string;
  status: string;
  totalItemsScanned: number;
  issuesFound: number;
  issues: Issue[];
  draftedContentIds: string[];
  timeline: TimelineEvent[];
  startedAt: string;
  completedAt: string | null;
}

interface ValidationProgress {
  isRunning: boolean;
  totalItems: number;
  scannedItems: number;
  issuesFound: number;
  currentTask: string;
  startedAt?: number;
}

// ─── Static color maps (Tailwind JIT safe) ───────────────────────────────────

const ISSUE_COLORS: Record<string, { badge: string; dot: string }> = {
  BrokenLink:      { badge: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-500'     },
  DummyData:       { badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  DuplicateTitle:  { badge: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  DuplicateFile:   { badge: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  MissingMetadata: { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
};
function issueBadge(type: string) {
  return ISSUE_COLORS[type]?.badge ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

const STAT_COLORS: Record<string, { bg: string; icon: string; text: string }> = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   text: 'text-blue-700'   },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', text: 'text-indigo-700' },
  red:    { bg: 'bg-red-50',    icon: 'text-red-600',    text: 'text-red-700'    },
  green:  { bg: 'bg-green-50',  icon: 'text-green-600',  text: 'text-green-700'  },
};

const TIMELINE_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  drafted:        { color: 'bg-green-500',  icon: <CheckCircle size={12} />,      label: 'Content Drafted'  },
  status_changed: { color: 'bg-blue-500',   icon: <ArrowRightCircle size={12} />, label: 'Status Changed'   },
  scan_started:   { color: 'bg-indigo-500', icon: <Play size={12} />,             label: 'Scan Started'     },
  scan_completed: { color: 'bg-emerald-500',icon: <ShieldCheck size={12} />,      label: 'Scan Completed'   },
};
function tlConfig(action: string) {
  return TIMELINE_CONFIG[action] ?? { color: 'bg-slate-400', icon: <GitCommit size={12} />, label: action };
}

const ALL_ISSUE_TYPES = ['BrokenLink', 'DummyData', 'DuplicateTitle', 'DuplicateFile', 'MissingMetadata'];
type ModalTab = 'issues' | 'timeline';

// ─── Export CSV helper ────────────────────────────────────────────────────────

function exportIssuesToCSV(report: ValidationReport) {
  const headers = ['Content ID', 'Title', 'Content Type', 'Issue Type', 'Description'];
  const rows = (report.issues || []).map(i => [
    i.contentId,
    `"${(i.title || '').replace(/"/g, '""')}"`,
    i.contentType || '',
    i.issueType,
    `"${(i.description || '').replace(/"/g, '""')}"`
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `validation_report_${report.id.slice(0, 8)}_${new Date(report.startedAt).toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

type DashboardTab = 'metadata' | 'viewer';

export function ValidatorDashboard() {
  const [activeTab, setActiveTab]           = useState<DashboardTab>('metadata');
  const [reports, setReports]               = useState<ValidationReport[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedReport, setSelectedReport] = useState<ValidationReport | null>(null);
  const [progress, setProgress]             = useState<ValidationProgress | null>(null);
  const [successScreen, setSuccessScreen]   = useState(false);
  const [modalTab, setModalTab]             = useState<ModalTab>('issues');
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [filterType, setFilterType]         = useState<string>('All');
  const [searchQuery, setSearchQuery]       = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/validator/reports', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      const data: ValidationReport[] = await res.json();
      setReports(data);
      setSelectedReport(prev => {
        if (!prev) return null;
        return data.find(r => r.id === prev.id) ?? null;
      });
    } catch {
      toast.error('Failed to load validation reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // ─── Adaptive progress polling ──────────────────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const res = await fetch('/api/admin/validator/progress', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data: ValidationProgress = await res.json();
          setProgress(prev => {
            if (prev?.isRunning && !data.isRunning) {
              setSuccessScreen(true);
              fetchReports();
              setTimeout(() => setSuccessScreen(false), 4500);
            }
            return data;
          });
          // Slow down polling when idle
          const delay = data.isRunning ? 1500 : 15000;
          interval = setTimeout(poll, delay) as any;
        }
      } catch {}
    };

    poll();
    return () => clearTimeout(interval as any);
  }, [fetchReports]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const isRunning = progress?.isRunning ?? false;

  const runValidation = async () => {
    if (isRunning) return;
    const tid = toast.loading('Starting validation engine...');
    try {
      const res = await fetch('/api/admin/validator/run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      toast.dismiss(tid);
      toast.success('Validation triggered! Running in background.');
      setProgress({ isRunning: true, totalItems: 1, scannedItems: 0, issuesFound: 0, currentTask: 'Initializing Engine...' });
    } catch {
      toast.dismiss(tid);
      toast.error('Failed to start validator');
    }
  };

  const draftContent = async (reportId: string, contentIds: string[]) => {
    const report = reports.find(r => r.id === reportId);
    const alreadyDrafted = new Set<string>(report?.draftedContentIds ?? []);
    const unique = contentIds.filter(id => !alreadyDrafted.has(id));
    if (unique.length === 0) { toast.success('All selected items are already drafted!'); return; }

    const tid = toast.loading(`Drafting ${unique.length} item(s)...`);
    try {
      const res = await fetch('/api/admin/validator/draft-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ contentIds: unique, reportId })
      });
      if (!res.ok) throw new Error();
      toast.dismiss(tid);
      toast.success(`${unique.length} item(s) moved to Draft ✓`);
      setSelectedIds(new Set());
      await fetchReports();
    } catch {
      toast.dismiss(tid);
      toast.error('Failed to draft content. Please retry.');
    }
  };

  const updateReportStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/validator/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error();
      toast.success('Report status updated');
      await fetchReports();
    } catch {
      toast.error('Failed to update report status');
    }
  };

  const deleteReport = async (id: string) => {
    if (!confirm('Delete this validation report permanently? This cannot be undone.')) return;
    const tid = toast.loading('Deleting report...');
    try {
      const res = await fetch(`/api/admin/validator/reports/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error();
      toast.dismiss(tid);
      toast.success('Report deleted');
      if (selectedReport?.id === id) setSelectedReport(null);
      await fetchReports();
    } catch {
      toast.dismiss(tid);
      toast.error('Failed to delete report');
    }
  };

  // ─── Progress bar values ────────────────────────────────────────────────────
  let percent = 0;
  let etaString = 'Calculating...';
  if (progress && progress.totalItems > 0) {
    percent = Math.min(99, Math.floor((progress.scannedItems / progress.totalItems) * 100));
  }
  if (successScreen) percent = 100;
  if (progress?.startedAt && progress.scannedItems > 0 && progress.totalItems > 0) {
    const elapsed = (Date.now() - progress.startedAt) / 1000;
    const rate = progress.scannedItems / (elapsed || 1);
    const left = Math.max(0, progress.totalItems - progress.scannedItems);
    const eta = left / (rate || 1);
    etaString = eta < 60 ? `~${Math.ceil(eta)}s remaining` : `~${Math.ceil(eta / 60)}m remaining`;
  }
  if (successScreen) etaString = 'Complete!';

  // ─── Checkbox helpers ───────────────────────────────────────────────────────
  const openReport = (report: ValidationReport) => {
    setSelectedReport(report);
    setSelectedIds(new Set());
    setModalTab('issues');
    setFilterType('All');
    setSearchQuery('');
    setDebouncedSearch('');
  };

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  // Fix: deduplicate contentIds before comparing length
  const toggleAll = (issues: Issue[], draftedSet: Set<string>) => {
    const draftableIds = [...new Set(
      issues.map(i => i.contentId).filter(id => !draftedSet.has(id))
    )];
    if (selectedIds.size === draftableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(draftableIds));
    }
  };

  // ─── Aggregate stats ────────────────────────────────────────────────────────
  const totalScanned = reports.reduce((s, r) => s + r.totalItemsScanned, 0);
  const totalFlagged  = reports.reduce((s, r) => s + r.issuesFound, 0);
  const totalDrafted  = reports.reduce((s, r) => s + (r.draftedContentIds?.length ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-blue-600" /> System Validator
            </h2>
            <p className="text-slate-500 mt-1 text-sm">
              {activeTab === 'metadata'
                ? 'Automated data-hygiene engine — broken links, dummy data, duplicates & missing metadata.'
                : 'Viewer-based engine — validates every file by simulating how users open it in the PDF viewer.'}
            </p>
          </div>
          {activeTab === 'metadata' && (
            <button
              onClick={runValidation}
              disabled={isRunning}
              title={isRunning ? 'Validation is already running' : 'Run a manual validation scan'}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRunning
                ? <><RefreshCw size={16} className="animate-spin" /> Running...</>
                : <><Play size={16} fill="currentColor" /> Run Manual Validation</>
              }
            </button>
          )}
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab('metadata')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'metadata'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Database size={15} />
            Metadata Checks
          </button>
          <button
            onClick={() => setActiveTab('viewer')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'viewer'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ScanLine size={15} />
            Viewer Validation
            <span className="ml-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">NEW</span>
          </button>
        </div>
      </div>

      {/* ── Viewer Validation Panel ── */}
      {activeTab === 'viewer' && <ViewerValidationPanel />}

      {/* ── Metadata Checks content ── */}
      {activeTab === 'metadata' && <>

      {/* ── Summary stat cards (static Tailwind classes) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {([
          { label: 'Total Runs',     value: reports.length, Icon: BarChart3,     c: 'blue'   },
          { label: 'Items Scanned',  value: totalScanned,   Icon: Database,      c: 'indigo' },
          { label: 'Issues Flagged', value: totalFlagged,   Icon: AlertTriangle, c: 'red'    },
          { label: 'Items Drafted',  value: totalDrafted,   Icon: CheckCircle,   c: 'green'  },
        ] as const).map(({ label, value, Icon, c }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${STAT_COLORS[c].bg}`}>
              <Icon size={18} className={STAT_COLORS[c].icon} />
            </div>
            <div className={`text-2xl font-black ${STAT_COLORS[c].text}`}>{value}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Progress overlay ── */}
      {(isRunning || successScreen) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-8 text-center bg-gradient-to-b from-blue-50 to-white border-b border-slate-100">
              {successScreen ? (
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                  <CheckCircle size={40} className="text-green-600" />
                </div>
              ) : (
                <div className="relative w-24 h-24 mx-auto mb-5 flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                  <ShieldCheck size={32} className="text-blue-600" />
                </div>
              )}
              <h2 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">
                {successScreen ? 'Validation Complete!' : 'System Validation Running'}
              </h2>
              <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
                {successScreen
                  ? 'The scan finished. A fresh detailed report is ready.'
                  : 'Scanning your database for broken links, duplicate files, missing metadata, and dummy data.'}
              </p>
            </div>
            <div className="p-8 pb-10 bg-slate-50">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Overall Progress</div>
                  <div className="text-4xl font-black text-blue-600">{percent}%</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-700">{etaString}</div>
                  <div className="text-sm text-slate-500">
                    {successScreen ? (progress?.totalItems ?? 0) : (progress?.scannedItems ?? 0)} / {progress?.totalItems ?? 0} items
                  </div>
                </div>
              </div>
              <div className="h-5 bg-slate-200 rounded-full overflow-hidden mb-6 shadow-inner relative">
                <div
                  className={`h-full transition-all duration-1000 ease-out relative ${successScreen ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-500'}`}
                  style={{ width: `${percent}%` }}
                >
                  {!successScreen && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                    <Zap size={12} className="text-blue-500" /> Current Operation
                  </div>
                  <div className="font-semibold text-slate-700 text-sm truncate bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {successScreen ? 'Finalizing Reports...' : (progress?.currentTask ?? 'Initializing...')}
                  </div>
                </div>
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100 shadow-sm">
                  <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                    <AlertTriangle size={12} className="text-red-500" /> Anomalies Found
                  </div>
                  <div className="font-black text-red-600 text-2xl">
                    {progress?.issuesFound ?? 0} <span className="text-sm font-semibold text-red-400">flagged</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Validation History ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <FileText size={18} className="text-slate-500" />
          <h3 className="font-bold text-slate-800 text-lg">Validation History</h3>
          <span className="ml-auto text-xs text-slate-400">{reports.length} run{reports.length !== 1 ? 's' : ''}</span>
        </div>
        {reports.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <ShieldCheck size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No validation runs yet.</p>
            <p className="text-sm mt-1">Click "Run Manual Validation" to start your first scan.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reports.map((report) => {
              const draftedCount = report.draftedContentIds?.length ?? 0;
              const pendingCount = Math.max(0, report.issuesFound - draftedCount);
              const isResolved   = report.status === 'Resolved';
              const duration     = report.completedAt
                ? Math.round((new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()) / 1000)
                : null;

              // Issue type breakdown
              const typeCounts: Record<string, number> = {};
              report.issues?.forEach(i => { typeCounts[i.issueType] = (typeCounts[i.issueType] ?? 0) + 1; });

              return (
                <div key={report.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-wrap items-start gap-4 justify-between">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isResolved || report.issuesFound === 0 ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {isResolved || report.issuesFound === 0
                          ? <CheckCircle size={20} className="text-green-600" />
                          : <AlertTriangle size={20} className="text-red-500" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${report.type === 'Automatic' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {report.type}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            report.status === 'Reviewing' ? 'bg-amber-100 text-amber-700' :
                            report.status === 'Resolved'  ? 'bg-green-100 text-green-700'  :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {report.status === 'Reviewing' ? <Clock size={10} /> : report.status === 'Resolved' ? <CheckCircle size={10} /> : <Filter size={10} />}
                            &nbsp;{report.status}
                          </span>
                          {report.timeline?.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                              <Activity size={10} /> {report.timeline.length} event{report.timeline.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 text-slate-500 text-xs">
                          <Calendar size={11} />
                          {new Date(report.startedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          {duration !== null && <span className="ml-2 text-slate-400">· {duration}s</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap shrink-0">
                      <div className="text-center px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-lg font-black text-slate-800 leading-none">{report.totalItemsScanned}</div>
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Scanned</div>
                      </div>
                      <div className={`text-center px-3 py-1.5 rounded-xl border ${report.issuesFound > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                        <div className={`text-lg font-black leading-none ${report.issuesFound > 0 ? 'text-red-600' : 'text-green-600'}`}>{report.issuesFound}</div>
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Flagged</div>
                      </div>
                      {draftedCount > 0 && (
                        <div className="text-center px-3 py-1.5 bg-green-50 rounded-xl border border-green-100">
                          <div className="text-lg font-black text-green-600 leading-none">{draftedCount}</div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Drafted</div>
                        </div>
                      )}
                      {pendingCount > 0 && (
                        <div className="text-center px-3 py-1.5 bg-orange-50 rounded-xl border border-orange-100">
                          <div className="text-lg font-black text-orange-600 leading-none">{pendingCount}</div>
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Pending</div>
                        </div>
                      )}
                      <button
                        onClick={() => openReport(report)}
                        className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition shadow-sm"
                      >
                        <Eye size={13} /> View Report <ChevronRight size={12} />
                      </button>
                      <button
                        onClick={() => deleteReport(report.id)}
                        title="Delete this report"
                        className="flex items-center gap-1.5 text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 bg-white text-xs font-semibold px-3 py-2 rounded-xl transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Issue-type breakdown pills */}
                  {Object.keys(typeCounts).length > 0 && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {Object.entries(typeCounts).map(([type, cnt]) => (
                        <span key={type} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${issueBadge(type)}`}>
                          {type}: {cnt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {selectedReport && (() => {
        const issues     = selectedReport.issues ?? [];
        const draftedSet = new Set<string>(selectedReport.draftedContentIds ?? []);
        const timeline   = [...(selectedReport.timeline ?? [])].reverse();

        // Unique draftable contentIds (deduplicated)
        const draftableIds = [...new Set(
          issues.map(i => i.contentId).filter(id => !draftedSet.has(id))
        )];
        const allSelected = draftableIds.length > 0 && selectedIds.size === draftableIds.length;

        // Filtered + searched issues
        const visibleIssues = issues.filter(i => {
          const matchesFilter = filterType === 'All' || i.issueType === filterType;
          const matchesSearch = debouncedSearch.trim().length === 0
            || i.title.toLowerCase().includes(debouncedSearch.toLowerCase())
            || i.contentId.toLowerCase().includes(debouncedSearch.toLowerCase());
          return matchesFilter && matchesSearch;
        });

        // Available filter types from current issues
        const availableTypes = [...new Set(issues.map(i => i.issueType))];

        return (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex py-6 px-4 justify-center items-start overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-100 flex flex-col">

              {/* Modal header */}
              <div className="p-6 border-b border-slate-100 flex flex-wrap gap-3 items-start justify-between sticky top-0 bg-white rounded-t-2xl z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={18} className="text-blue-600" /> Validation Report Detail
                  </h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Run on {new Date(selectedReport.startedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => exportIssuesToCSV(selectedReport)}
                    className="flex items-center gap-1.5 text-slate-600 hover:text-green-700 border border-slate-200 hover:border-green-300 bg-white text-sm font-semibold px-3 py-2 rounded-lg transition"
                    title="Export issues as CSV"
                  >
                    <Download size={14} /> Export CSV
                  </button>
                  <select
                    value={selectedReport.status}
                    onChange={(e) => updateReportStatus(selectedReport.id, e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-2 outline-none"
                  >
                    <option value="Draft">Draft (Needs fix)</option>
                    <option value="Reviewing">Reviewing</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                  <button
                    onClick={() => deleteReport(selectedReport.id)}
                    className="flex items-center gap-1 text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-3 py-2 text-sm transition"
                    title="Delete this report"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => setSelectedReport(null)} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-2 text-sm transition">
                    <X size={15} /> Close
                  </button>
                </div>
              </div>

              {/* Stats bar */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-slate-100 border-b border-slate-100">
                {([
                  { label: 'Items Scanned', value: selectedReport.totalItemsScanned, Icon: Database,      color: 'text-indigo-600' },
                  { label: 'Flagged',        value: selectedReport.issuesFound,       Icon: AlertTriangle, color: 'text-red-600'    },
                  { label: 'Drafted',        value: draftedSet.size,                  Icon: CheckCircle,   color: 'text-green-600'  },
                  { label: 'Pending',        value: Math.max(0, selectedReport.issuesFound - draftedSet.size), Icon: Clock, color: 'text-amber-600' },
                  { label: 'Selected',       value: selectedIds.size,                Icon: CheckSquare,   color: 'text-blue-600'   },
                ] as const).map(({ label, value, Icon, color }) => (
                  <div key={label} className="bg-white p-4 text-center">
                    <Icon size={16} className={`${color} mx-auto mb-1`} />
                    <div className={`text-2xl font-black ${color}`}>{value}</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
                  </div>
                ))}
              </div>

              {/* Tab bar */}
              <div className="flex border-b border-slate-100 bg-slate-50">
                {([
                  { id: 'issues',   label: 'Issues',   icon: <AlertTriangle size={14} /> },
                  { id: 'timeline', label: 'Timeline', icon: <Activity size={14} /> },
                ] as { id: ModalTab; label: string; icon: React.ReactNode }[]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setModalTab(tab.id)}
                    className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold transition border-b-2 ${
                      modalTab === tab.id
                        ? 'border-blue-600 text-blue-700 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab.icon} {tab.label}
                    {tab.id === 'timeline' && timeline.length > 0 && (
                      <span className="ml-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full px-1.5 py-0.5">{timeline.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ISSUES tab */}
              {modalTab === 'issues' && (
                <>
                  {/* Filters + search toolbar */}
                  <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
                    {/* Filter chips */}
                    <div className="flex flex-wrap gap-2 items-center">
                      <Hash size={13} className="text-slate-400" />
                      {(['All', ...availableTypes]).map(type => (
                        <button
                          key={type}
                          onClick={() => setFilterType(type)}
                          className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${
                            filterType === type
                              ? 'bg-blue-600 text-white border-blue-600'
                              : type === 'All'
                                ? 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                                : `${issueBadge(type)} hover:opacity-80`
                          }`}
                        >
                          {type}{type !== 'All' && ` (${issues.filter(i => i.issueType === type).length})`}
                        </button>
                      ))}
                    </div>
                    {/* Search */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by title or ID..."
                        className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                      />
                    </div>
                    {/* Select/Draft toolbar */}
                    {visibleIssues.length > 0 && (
                      <div className="flex flex-wrap gap-3 items-center justify-between">
                        <button
                          onClick={() => toggleAll(visibleIssues, draftedSet)}
                          className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700 transition"
                        >
                          {allSelected
                            ? <CheckSquare size={18} className="text-blue-600" />
                            : <Square size={18} className="text-slate-400" />}
                          {allSelected ? 'Deselect All' : 'Select All Pending'}
                        </button>
                        <div className="flex gap-2 flex-wrap">
                          {selectedIds.size > 0 && (
                            <button
                              onClick={() => draftContent(selectedReport.id, Array.from(selectedIds))}
                              className="flex items-center gap-2 bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-rose-700 transition shadow-sm"
                            >
                              <Layers size={14} /> Draft Selected ({selectedIds.size})
                            </button>
                          )}
                          {draftableIds.length > 0 && (
                            <button
                              onClick={() => draftContent(selectedReport.id, draftableIds)}
                              className="flex items-center gap-2 bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-700 transition shadow-sm"
                            >
                              <Zap size={14} /> Draft All Flagged ({draftableIds.length})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-6 overflow-y-auto max-h-[50vh]">
                    {!selectedReport.completedAt && (
                      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl mb-5 text-sm">
                        <Clock size={16} /> Validation is still running. Revisit this report later for the complete issue list.
                      </div>
                    )}
                    {visibleIssues.length > 0 ? (
                      <div className="space-y-3">
                        {visibleIssues.map((issue, idx) => {
                          const isDrafted  = draftedSet.has(issue.contentId);
                          const isSelected = selectedIds.has(issue.contentId);
                          return (
                            <div
                              key={idx}
                              className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                                isDrafted
                                  ? 'bg-green-50 border-green-200 opacity-70'
                                  : isSelected
                                    ? 'bg-blue-50 border-blue-300'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <button
                                onClick={() => !isDrafted && toggleId(issue.contentId)}
                                disabled={isDrafted}
                                className="mt-0.5 shrink-0"
                              >
                                {isDrafted
                                  ? <CheckCircle size={20} className="text-green-500" />
                                  : isSelected
                                    ? <CheckSquare size={20} className="text-blue-600" />
                                    : <Square size={20} className="text-slate-300 hover:text-slate-500 transition" />}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-start gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded border text-xs font-bold uppercase ${issueBadge(issue.issueType)}`}>
                                    {issue.issueType}
                                  </span>
                                  {issue.contentType && (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium">
                                      {issue.contentType}
                                    </span>
                                  )}
                                  {isDrafted && (
                                    <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-bold border border-green-200">
                                      ✓ Drafted
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-semibold text-slate-800 text-sm truncate">{issue.title}</h4>
                                <p className="text-xs text-slate-500 mt-0.5">{issue.description}</p>
                                <p className="text-[10px] text-slate-300 font-mono mt-1">ID: {issue.contentId}</p>
                              </div>

                              {!isDrafted && (
                                <button
                                  onClick={() => draftContent(selectedReport.id, [issue.contentId])}
                                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition shadow-sm"
                                >
                                  Draft
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-14 text-slate-400">
                        {debouncedSearch || filterType !== 'All' ? (
                          <>
                            <Search size={40} className="mx-auto text-slate-300 mb-3" />
                            <p className="font-semibold text-lg text-slate-600">No matching issues</p>
                            <p className="text-sm mt-1">Try adjusting your filter or search query.</p>
                          </>
                        ) : (
                          <>
                            <CheckCircle size={44} className="mx-auto text-green-400 mb-3" />
                            <p className="font-semibold text-lg text-slate-600">No issues found!</p>
                            <p className="text-sm mt-1">Database looks perfectly clean.</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TIMELINE tab */}
              {modalTab === 'timeline' && (
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  {timeline.length === 0 ? (
                    <div className="text-center py-14 text-slate-400">
                      <Activity size={40} className="mx-auto mb-3 text-slate-300" />
                      <p className="font-medium text-slate-600">No activity yet</p>
                      <p className="text-sm mt-1">Actions like drafting content or changing report status will appear here.</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-slate-200 z-0"></div>
                      <div className="space-y-0">
                        {timeline.map((event, idx) => {
                          const cfg = tlConfig(event.action);
                          return (
                            <div key={idx} className="relative flex gap-4 pb-6">
                              <div className={`relative z-10 w-10 h-10 rounded-full ${cfg.color} flex items-center justify-center text-white shrink-0 shadow-md`}>
                                {cfg.icon}
                              </div>
                              <div className="flex-1 bg-white border rounded-xl p-4 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                                  <span className="font-bold text-slate-800 text-sm">{cfg.label}</span>
                                  <span className="text-xs text-slate-400 font-mono">
                                    {new Date(event.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-600">{event.note}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <User size={12} className="text-slate-400" />
                                  <span className="text-xs font-semibold text-slate-500">{event.by}</span>
                                  {event.count !== undefined && (
                                    <>
                                      <span className="text-slate-300">·</span>
                                      <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                                        {event.count} item{event.count !== 1 ? 's' : ''}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Scan start anchor */}
                        <div className="relative flex gap-4">
                          <div className="relative z-10 w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md">
                            <Play size={12} />
                          </div>
                          <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                              <span className="font-bold text-indigo-800 text-sm">Scan Started</span>
                              <span className="text-xs text-indigo-400 font-mono">
                                {new Date(selectedReport.startedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                            </div>
                            <p className="text-sm text-indigo-600">
                              {selectedReport.type} validation scan initiated.
                              {selectedReport.completedAt && ` Completed in ${Math.round((new Date(selectedReport.completedAt).getTime() - new Date(selectedReport.startedAt).getTime()) / 1000)}s.`}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Database size={12} className="text-indigo-400" />
                              <span className="text-xs font-semibold text-indigo-500">{selectedReport.totalItemsScanned} items scanned · {selectedReport.issuesFound} issues found</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      </>}

    </div>
  );
}
