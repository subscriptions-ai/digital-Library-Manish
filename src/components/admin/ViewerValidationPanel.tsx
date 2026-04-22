import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Eye, CheckCircle, FileText, AlertTriangle, Clock, Search,
  RefreshCw, Play, Layers, Trash2, X, Shield, ShieldCheck,
  ShieldX, HelpCircle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  RotateCcw, Maximize2, CheckSquare, Square, Zap, Database,
  AlertCircle, Loader2,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentItem {
  id: string;
  title: string;
  contentType: string;
  domain: string | null;
  fileUrl: string | null;
  validationStatus: string | null; // "Not Validated" | "VALID_VIEWABLE" | "FLAGGED_CONTENT"
  viewerStatus: string | null;
  isViewable: boolean | null;
  flaggedReason: string | null;
  lastValidatedAt: string | null;
  status: string;
}

interface Summary {
  notValidated: number;
  validViewable: number;
  flaggedContent: number;
}

interface ViewerProgress {
  isRunning: boolean;
  totalItems: number;
  scannedItems: number;
  validCount: number;
  flaggedCount: number;
  currentTask: string;
  startedAt?: number;
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; badge: string; icon: React.ReactNode; dot: string }> = {
  VALID_VIEWABLE: {
    label: 'Valid',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: <ShieldCheck size={11} />,
    dot: 'bg-emerald-500',
  },
  FLAGGED_CONTENT: {
    label: 'Flagged',
    badge: 'bg-red-100 text-red-700 border-red-200',
    icon: <ShieldX size={11} />,
    dot: 'bg-red-500',
  },
  'Not Validated': {
    label: 'Not Validated',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: <HelpCircle size={11} />,
    dot: 'bg-slate-400',
  },
};

function statusMeta(s: string | null) {
  return STATUS_META[s ?? 'Not Validated'] ?? STATUS_META['Not Validated'];
}

// ─── Inline PDF Canvas ────────────────────────────────────────────────────────

function InlinePdfPage({
  pdfDoc,
  pageNum,
  scale,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) setRendering(false);
      } catch {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div className="relative mb-4 mx-auto shadow-xl" style={{ display: 'inline-flex', justifyContent: 'center' }}>
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/40 z-10" style={{ minWidth: 200, minHeight: 280 }}>
          <Loader2 className="animate-spin text-blue-400" size={24} />
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 2, userSelect: 'none', filter: 'invert(0.88) hue-rotate(180deg)' }} />
    </div>
  );
}

// ─── Admin Viewer Modal ───────────────────────────────────────────────────────

function AdminViewerModal({
  item,
  onClose,
  onMarkValid,
  onMoveDraft,
}: {
  item: ContentItem;
  onClose: () => void;
  onMarkValid: (id: string) => void;
  onMoveDraft: (id: string) => void;
}) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    if (!item.fileUrl && !item.contentType) return;

    const urlPath = (item.fileUrl || '').split('?')[0].toLowerCase();
    const isPdf =
      urlPath.endsWith('.pdf') ||
      urlPath.endsWith('/pdf') ||
      urlPath.includes('.pdf') ||
      (item.contentType || '').toLowerCase().includes('book') ||
      (item.contentType || '').toLowerCase().includes('periodical') ||
      (item.contentType || '').toLowerCase().includes('magazine') ||
      (item.contentType || '').toLowerCase().includes('thesis') ||
      (item.contentType || '').toLowerCase().includes('case report') ||
      (item.contentType || '').toLowerCase().includes('conference') ||
      (item.contentType || '').toLowerCase().includes('newsletter');

    if (!isPdf) return;

    setLoading(true);
    setPdfError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    const proxyUrl = `/api/content/${item.id}/proxy-pdf`;
    const token = localStorage.getItem('token') || '';

    const task = pdfjsLib.getDocument({
      url: proxyUrl,
      httpHeaders: { Authorization: `Bearer ${token}` },
      withCredentials: false,
      disableRange: false,
      isEvalSupported: false,
    });

    task.promise
      .then((doc) => { setPdfDoc(doc); setNumPages(doc.numPages); })
      .catch((err) => {
        if (err?.name === 'RenderingCancelledException' || err?.name === 'PromiseCancelledException') return;
        setPdfError('PDF failed to load — file may be unavailable or access is restricted.');
      })
      .finally(() => setLoading(false));

    return () => { try { task.destroy(); } catch {} };
  }, [item.id, item.fileUrl, item.contentType]);

  const urlPath = (item.fileUrl || '').split('?')[0].toLowerCase();
  const isPdf =
    urlPath.endsWith('.pdf') ||
    urlPath.endsWith('/pdf') ||
    urlPath.includes('.pdf') ||
    (item.contentType || '').toLowerCase().includes('book') ||
    (item.contentType || '').toLowerCase().includes('periodical') ||
    (item.contentType || '').toLowerCase().includes('magazine') ||
    (item.contentType || '').toLowerCase().includes('thesis') ||
    (item.contentType || '').toLowerCase().includes('case report') ||
    (item.contentType || '').toLowerCase().includes('conference') ||
    (item.contentType || '').toLowerCase().includes('newsletter');
  const isVideo = /\.(mp4|webm|ogg)$/i.test(urlPath);

  const handleMarkValid = async () => {
    setMarking(true);
    await onMarkValid(item.id);
    setMarking(false);
    onClose();
  };

  const handleMoveDraft = async () => {
    setDrafting(true);
    await onMoveDraft(item.id);
    setDrafting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-slate-950 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden border border-white/10" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="h-14 shrink-0 flex items-center justify-between px-5 bg-slate-900 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Shield size={16} className="text-emerald-400" />
              <span className="text-white font-bold text-sm">Admin Preview</span>
              <span className="text-slate-500 text-xs font-mono">— Second Auth</span>
            </div>
            <span className="text-slate-400 text-sm truncate hidden sm:block">| {item.title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Zoom controls (PDF only) */}
            {isPdf && pdfDoc && (
              <>
                <button onClick={() => setScale(s => Math.max(0.6, s - 0.2))} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition"><ZoomOut size={16} /></button>
                <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition"><ZoomIn size={16} /></button>
                <button onClick={() => setScale(1.2)} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition"><RotateCcw size={14} /></button>
              </>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition"><X size={18} /></button>
          </div>
        </div>

        {/* Page nav (PDF only) */}
        {isPdf && pdfDoc && numPages > 1 && (
          <div className="shrink-0 flex items-center justify-center gap-3 py-2 bg-slate-900/80 border-b border-white/5">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition">
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="text-slate-400 text-xs font-mono">Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{numPages}</strong></span>
            <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition">
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Viewer body */}
        <div className="flex-1 overflow-y-auto bg-slate-950" style={{ scrollBehavior: 'smooth' }}>
          {loading && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
              </div>
              <p className="text-slate-400 text-sm">Loading PDF for admin preview…</p>
            </div>
          )}
          {pdfError && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
              <AlertCircle size={48} className="text-red-400" />
              <p className="text-slate-300 max-w-sm">{pdfError}</p>
              <p className="text-xs text-red-400/70 bg-red-500/10 rounded-xl px-4 py-2 border border-red-500/20">{item.flaggedReason}</p>
            </div>
          )}
          {isPdf && pdfDoc && !loading && !pdfError && (
            <div className="py-6 px-4 flex flex-col items-center">
              <InlinePdfPage key={`${item.id}-${currentPage}`} pdfDoc={pdfDoc} pageNum={currentPage} scale={scale} />
            </div>
          )}
          {isVideo && (
            <div className="flex items-center justify-center min-h-[50vh] p-8">
              <video src={item.fileUrl || ''} controls controlsList="nodownload" disablePictureInPicture
                className="max-w-3xl w-full rounded-2xl shadow-2xl border border-white/10" />
            </div>
          )}
          {!isPdf && !isVideo && !loading && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
              <FileText size={48} className="text-slate-600" />
              <p className="text-slate-400">No viewable file available for this content item.</p>
              {item.fileUrl && <p className="text-xs font-mono text-slate-500 break-all max-w-sm">{item.fileUrl}</p>}
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className="shrink-0 flex flex-wrap gap-3 items-center justify-between p-5 bg-slate-900 border-t border-white/10">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Flag Reason</div>
            <p className="text-sm text-red-400 max-w-xl">{item.flaggedReason || 'No reason recorded.'}</p>
          </div>
          <div className="flex gap-3 flex-wrap shrink-0">
            <button
              onClick={handleMarkValid}
              disabled={marking}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-lg disabled:opacity-60"
            >
              {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Mark as Valid
            </button>
            <button
              onClick={handleMoveDraft}
              disabled={drafting}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-lg disabled:opacity-60"
            >
              {drafting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Move to Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ViewerValidationPanel() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ notValidated: 0, validViewable: 0, flaggedContent: 0 });
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ViewerProgress | null>(null);
  const [successScreen, setSuccessScreen] = useState(false);

  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  // Debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1); }, 280);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // Fetch content list
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        ...(filterStatus !== 'All' ? { status: filterStatus } : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res = await fetch(`/api/admin/validator/content-status?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setSummary(data.summary);
    } catch {
      toast.error('Failed to load validation data');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, debouncedSearch]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Poll viewer progress
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch('/api/admin/validator/viewer-progress', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.ok) {
          const data: ViewerProgress = await res.json();
          setProgress(prev => {
            if (prev?.isRunning && !data.isRunning) {
              setSuccessScreen(true);
              fetchItems();
              setTimeout(() => setSuccessScreen(false), 4000);
            }
            return data;
          });
          timer = setTimeout(poll, data.isRunning ? 1500 : 15000);
        }
      } catch {}
    };
    poll();
    return () => clearTimeout(timer);
  }, [fetchItems]);

  const isRunning = progress?.isRunning ?? false;

  // Computed progress values
  let percent = 0;
  let etaStr = 'Calculating…';
  if (progress && progress.totalItems > 0) {
    percent = Math.min(99, Math.floor((progress.scannedItems / progress.totalItems) * 100));
  }
  if (successScreen) { percent = 100; etaStr = 'Complete!'; }
  else if (progress?.startedAt && progress.scannedItems > 0 && progress.totalItems > 0) {
    const elapsed = (Date.now() - progress.startedAt) / 1000;
    const rate = progress.scannedItems / elapsed;
    const eta = (progress.totalItems - progress.scannedItems) / (rate || 1);
    etaStr = eta < 60 ? `~${Math.ceil(eta)}s remaining` : `~${Math.ceil(eta / 60)}m remaining`;
  }

  // Actions
  const runValidation = async () => {
    if (isRunning) return;
    const tid = toast.loading('Starting viewer validation…');
    try {
      const res = await fetch('/api/admin/validator/run-viewer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error();
      toast.dismiss(tid);
      toast.success('Viewer validation started!');
      setProgress({ isRunning: true, totalItems: 1, scannedItems: 0, validCount: 0, flaggedCount: 0, currentTask: 'Initializing…' });
    } catch {
      toast.dismiss(tid);
      toast.error('Failed to start validation');
    }
  };

  const markValid = async (id: string) => {
    const res = await fetch(`/api/admin/validator/content/${id}/mark-valid`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (res.ok) { toast.success('Marked as Valid ✓'); fetchItems(); }
    else toast.error('Failed to mark as valid');
  };

  const moveDraft = async (id: string) => {
    const res = await fetch(`/api/admin/validator/content/${id}/move-draft`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (res.ok) { toast.success('Moved to Draft'); fetchItems(); }
    else toast.error('Failed to move to draft');
  };

  const autoCleanup = async () => {
    if (!confirm(`This will move ALL ${summary.flaggedContent} flagged item(s) to Draft. Continue?`)) return;
    const tid = toast.loading('Running auto-cleanup…');
    try {
      const res = await fetch('/api/admin/validator/auto-cleanup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      toast.dismiss(tid);
      toast.success(data.message);
      fetchItems();
    } catch {
      toast.dismiss(tid);
      toast.error('Auto-cleanup failed');
    }
  };

  const reValidateSelected = async () => {
    if (selectedIds.size === 0) return;
    const tid = toast.loading(`Re-validating ${selectedIds.size} item(s)…`);
    try {
      const res = await fetch('/api/admin/validator/re-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ contentIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error();
      toast.dismiss(tid);
      toast.success(`Re-validated ${selectedIds.size} item(s)`);
      setSelectedIds(new Set());
      fetchItems();
    } catch {
      toast.dismiss(tid);
      toast.error('Re-validation failed');
    }
  };

  const toggleId = (id: string) => setSelectedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const toggleAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  const FILTER_TABS = ['All', 'FLAGGED_CONTENT', 'VALID_VIEWABLE', 'Not Validated'];

  return (
    <div className="space-y-5">

      {/* ── Progress overlay ─────────────────────────────────────────────────── */}
      {(isRunning || successScreen) && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-8 text-center bg-gradient-to-b from-violet-50 to-white border-b border-slate-100">
              {successScreen ? (
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <ShieldCheck size={40} className="text-emerald-600" />
                </div>
              ) : (
                <div className="relative w-24 h-24 mx-auto mb-5 flex items-center justify-center">
                  <div className="absolute inset-0 border-4 border-violet-100 rounded-full" />
                  <div className="absolute inset-0 border-4 border-violet-600 rounded-full border-t-transparent animate-spin" />
                  <Eye size={32} className="text-violet-600" />
                </div>
              )}
              <h2 className="text-3xl font-bold text-slate-800 mb-2">
                {successScreen ? 'Viewer Validation Complete!' : 'Viewer Validation Running'}
              </h2>
              <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                {successScreen
                  ? 'All content has been tested against the PDF viewer. Check results below.'
                  : 'Testing each content file for PDF magic bytes and HTTP accessibility — simulating what users see.'}
              </p>
            </div>
            <div className="p-8 pb-10 bg-slate-50">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Overall Progress</div>
                  <div className="text-4xl font-black text-violet-600">{percent}%</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-700">{etaStr}</div>
                  <div className="text-sm text-slate-500">{progress?.scannedItems ?? 0} / {progress?.totalItems ?? 0} items</div>
                </div>
              </div>
              <div className="h-5 bg-slate-200 rounded-full overflow-hidden mb-6 shadow-inner">
                <div
                  className={`h-full transition-all duration-1000 ease-out ${successScreen ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-500 via-purple-400 to-indigo-500'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Current Task', value: successScreen ? 'Done!' : (progress?.currentTask ?? 'Initializing…'), color: 'text-slate-700', bg: 'bg-white border-slate-100' },
                  { label: 'Valid Files', value: progress?.validCount ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
                  { label: 'Flagged Files', value: progress?.flaggedCount ?? 0, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`p-4 rounded-2xl border ${bg}`}>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                    <div className={`font-black text-lg ${color} truncate`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary stat cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Content', value: summary.notValidated + summary.validViewable + summary.flaggedContent, Icon: Database, c: 'bg-slate-50 text-slate-600 border-slate-100' },
          { label: 'Not Validated', value: summary.notValidated, Icon: HelpCircle, c: 'bg-slate-50 text-slate-600 border-slate-100' },
          { label: 'Valid & Viewable', value: summary.validViewable, Icon: ShieldCheck, c: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          { label: 'Flagged Content', value: summary.flaggedContent, Icon: ShieldX, c: 'bg-red-50 text-red-700 border-red-100' },
        ].map(({ label, value, Icon, c }) => (
          <div key={label} className={`rounded-2xl border p-5 flex flex-col gap-2 ${c}`}>
            <Icon size={20} />
            <div className="text-2xl font-black">{value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Controls bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap gap-3 items-center justify-between">
        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setFilterStatus(tab); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                filterStatus === tab
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {tab === 'VALID_VIEWABLE' ? '✓ Valid' : tab === 'FLAGGED_CONTENT' ? '⚑ Flagged' : tab === 'Not Validated' ? '? Not Validated' : 'All'}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search title or type…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
          />
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={runValidation}
            disabled={isRunning}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRunning ? <><RefreshCw size={14} className="animate-spin" /> Running…</> : <><Play size={14} fill="currentColor" /> Run Viewer Validation</>}
          </button>
          {summary.flaggedContent > 0 && (
            <button
              onClick={autoCleanup}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm"
            >
              <Zap size={14} /> Auto-Cleanup ({summary.flaggedContent})
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk action bar ───────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
          <span className="text-sm font-semibold text-violet-700">{selectedIds.size} item(s) selected</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={reValidateSelected}
              className="flex items-center gap-2 bg-violet-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-violet-700 transition"
            >
              <RefreshCw size={13} /> Re-validate Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-2 bg-white text-slate-600 border border-slate-200 text-xs font-bold px-4 py-2 rounded-xl hover:border-slate-400 transition"
            >
              <X size={13} /> Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* ── Content Table ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-3">
          <Eye size={18} className="text-violet-500" />
          <h3 className="font-bold text-slate-800 text-lg">Content Viewer Status</h3>
          <span className="ml-auto text-xs text-slate-400">{total} item{total !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <ShieldCheck size={40} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No items match your filter.</p>
            <p className="text-sm mt-1">Try "All" or run a viewer validation first.</p>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <button onClick={toggleAll} className="shrink-0">
                {selectedIds.size === items.length && items.length > 0
                  ? <CheckSquare size={16} className="text-violet-600" />
                  : <Square size={16} className="text-slate-300 hover:text-slate-500 transition" />}
              </button>
              <span className="flex-1">Title / Type</span>
              <span className="w-32 hidden sm:block">Viewer Status</span>
              <span className="w-28 hidden md:block">Validation</span>
              <span className="w-32 hidden lg:block">Last Checked</span>
              <span className="w-36">Actions</span>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map(item => {
                const meta = statusMeta(item.validationStatus);
                const isSelected = selectedIds.has(item.id);

                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-violet-50/50' : ''}`}
                  >
                    {/* Checkbox */}
                    <button onClick={() => toggleId(item.id)} className="mt-0.5 shrink-0">
                      {isSelected
                        ? <CheckSquare size={18} className="text-violet-600" />
                        : <Square size={18} className="text-slate-300 hover:text-slate-500 transition" />}
                    </button>

                    {/* Title / Type */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 truncate">{item.title}</span>
                        {item.status === 'Draft' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">DRAFT</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{item.contentType}</span>
                        {item.domain && <span className="text-[10px] text-slate-300">· {item.domain}</span>}
                      </div>
                      {item.flaggedReason && item.validationStatus === 'FLAGGED_CONTENT' && (
                        <p className="text-[11px] text-red-500 mt-1 line-clamp-2">{item.flaggedReason}</p>
                      )}
                    </div>

                    {/* Viewer status */}
                    <div className="w-32 hidden sm:flex items-center justify-start">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        item.viewerStatus === 'Rendered OK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        item.viewerStatus === 'Timeout' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        item.viewerStatus === 'No File' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                        item.viewerStatus === 'Load Failed' ? 'bg-red-50 text-red-700 border-red-200' :
                        item.viewerStatus === 'Manually Verified' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>{item.viewerStatus ?? '—'}</span>
                    </div>

                    {/* Validation badge */}
                    <div className="w-28 hidden md:flex items-center">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${meta.badge}`}>
                        {meta.icon}&nbsp;{meta.label}
                      </span>
                    </div>

                    {/* Last checked */}
                    <div className="w-32 hidden lg:block text-xs text-slate-400">
                      {item.lastValidatedAt
                        ? new Date(item.lastValidatedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                        : <span className="text-slate-300">Never</span>}
                    </div>

                    {/* Actions */}
                    <div className="w-36 flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                      <button
                        onClick={() => setPreviewItem(item)}
                        title="Preview in viewer (Admin)"
                        className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-700 transition"
                      >
                        <Eye size={14} />
                      </button>
                      {item.validationStatus === 'FLAGGED_CONTENT' && (
                        <button
                          onClick={() => markValid(item.id)}
                          title="Mark as Valid"
                          className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 transition"
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {item.status !== 'Draft' && (
                        <button
                          onClick={() => moveDraft(item.id)}
                          title="Move to Draft"
                          className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-700 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
                <span className="text-xs text-slate-400">Page {page} of {Math.ceil(total / LIMIT)}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-400 disabled:opacity-40 transition"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil(total / LIMIT)}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-400 disabled:opacity-40 transition"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Admin Viewer Modal ────────────────────────────────────────────────── */}
      {previewItem && (
        <AdminViewerModal
          key={previewItem.id}
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onMarkValid={markValid}
          onMoveDraft={moveDraft}
        />
      )}
    </div>
  );
}
