import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Moon,
  Sun,
  BookOpen,
  Shield,
  RotateCcw,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source — use the bundled worker from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ────────────────────────────────────────────────────────
//  Single rendered page canvas
// ────────────────────────────────────────────────────────
interface PageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNum: number;
  scale: number;
  darkMode: boolean;
  onVisible?: (num: number) => void;
}

function PageCanvas({ pdfDoc, pageNum, scale, darkMode, onVisible }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Intersection observer — report which page is visible
  useEffect(() => {
    if (!containerRef.current || !onVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onVisible(pageNum); },
      { threshold: 0.3 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pageNum, onVisible]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!canvasRef.current) return;

      // Cancel any existing render task
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }

      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!cancelled) setRendering(false);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
    };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNum}`}
      className="relative mb-6 shadow-2xl mx-auto"
      style={{
        display: 'inline-flex',
        justifyContent: 'center',
      }}
    >
      {rendering && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-slate-800/40 rounded-sm z-10"
          style={{ minWidth: 200, minHeight: 280 }}
        >
          <Loader2 className="animate-spin text-blue-400" size={28} />
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          filter: darkMode ? 'invert(0.88) hue-rotate(180deg)' : 'none',
          borderRadius: 2,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none', // prevent context-menu on canvas
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────
//  Main Viewer
// ────────────────────────────────────────────────────────
export function ProtectedContentViewer() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Content meta
  const [content, setContent] = useState<any>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Viewer controls
  const [scale, setScale] = useState(1.4);
  const [darkMode, setDarkMode] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewerWrapperRef = useRef<HTMLDivElement>(null);

  // ── Security: block right-click, Ctrl+S, Ctrl+P ─────
  useEffect(() => {
    const blockContext = (e: MouseEvent) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ['s', 'p', 'u', 'a'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('contextmenu', blockContext);
    document.addEventListener('keydown', blockKeys);
    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown', blockKeys);
    };
  }, []);

  // ── Fetch content metadata ───────────────────────────
  useEffect(() => {
    setLoadingMeta(true);
    fetch(`/api/content/${id}/view`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403) throw new Error('Access denied. Please upgrade your subscription.');
          throw new Error('Failed to load content');
        }
        return res.json();
      })
      .then((data) => setContent(data))
      .catch((err) => setMetaError(err.message))
      .finally(() => setLoadingMeta(false));
  }, [id]);

  // ── Load PDF once we have the URL ───────────────────
  useEffect(() => {
    if (!content?.url) return;
    const url: string = content.url;
    const urlPath = url.split('?')[0].toLowerCase();
    const isPdf = urlPath.endsWith('.pdf') || urlPath.endsWith('/pdf') || urlPath.includes('.pdf') || content.contentType?.toLowerCase().includes('pdf');
    if (!isPdf) return; // video handled separately

    setLoadingPdf(true);
    setPdfError(null);

    // Use server-side proxy endpoint to bypass CORS from third-party PDF hosts
    const proxyUrl = `/api/content/${id}/proxy-pdf`;
    const token = localStorage.getItem('token') || '';

    const loadingTask = pdfjsLib.getDocument({
      url: proxyUrl,
      httpHeaders: { Authorization: `Bearer ${token}` },
      withCredentials: false,
      disableRange: false,
      isEvalSupported: false,
    });

    loadingTask.promise
      .then((doc) => {
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      })
      .catch((err) => {
        // Ignore cancellations during strict-mode re-renders
        if (err && (err.name === 'RenderingCancelledException' || err.name === 'PromiseCancelledException' || err.message?.includes('cancelled'))) {
          return;
        }
        console.error('[viewer] PDF load error:', err);
        setPdfError('PDF failed to load. The file may be unavailable or access is restricted.');
      })
      .finally(() => setLoadingPdf(false));

    return () => { try { loadingTask.destroy(); } catch {} };
  }, [content, id]);


  // ── Page navigation ───────────────────────────────
  const goToPage = useCallback((n: number) => {
    const target = Math.max(1, Math.min(numPages, n));
    setCurrentPage(target);
    const el = document.getElementById(`pdf-page-${target}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [numPages]);

  // ── Visible page tracker from IntersectionObserver ─
  const handlePageVisible = useCallback((num: number) => setCurrentPage(num), []);

  // ── Fullscreen ──────────────────────────────────────
  const toggleFullscreen = () => {
    if (!viewerWrapperRef.current) return;
    if (!document.fullscreenElement) {
      viewerWrapperRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ────────────────────────────────────────────────────
  //  Render: Loading meta
  // ────────────────────────────────────────────────────
  if (loadingMeta) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-slate-950">
        <div className="flex flex-col items-center gap-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-lg">Verifying Access</p>
            <p className="text-slate-400 text-sm mt-1">Establishing a secure reading session…</p>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────
  //  Render: Access error
  // ────────────────────────────────────────────────────
  if (metaError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] bg-slate-950 text-center px-4">
        <div className="max-w-md space-y-5">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle size={36} className="text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Access Restricted</h2>
          <p className="text-slate-400">{metaError}</p>
          <button
            onClick={() => navigate('/dashboard/access')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all"
          >
            <BookOpen size={18} /> View My Access
          </button>
        </div>
      </div>
    );
  }

  const urlPath = (content?.url || '').split('?')[0].toLowerCase();
  const isPdf = urlPath.endsWith('.pdf') || urlPath.endsWith('/pdf') || urlPath.includes('.pdf');
  const isVideo = content?.url?.toLowerCase().match(/\.(mp4|webm|ogg)$/i);

  // ────────────────────────────────────────────────────
  //  Render: Main viewer
  // ────────────────────────────────────────────────────
  return (
    <div
      ref={viewerWrapperRef}
      className={`flex flex-col h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'} transition-colors duration-300`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* ─── TOP BAR ─────────────────────────────────── */}
      <div className={`h-14 shrink-0 flex items-center justify-between px-3 sm:px-5 border-b ${darkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'} shadow-md z-20`}>
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className={`p-2 rounded-xl transition-colors shrink-0 ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className={`font-bold leading-tight line-clamp-1 text-sm sm:text-base ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {content?.title}
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{content?.contentType}</p>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Page indicator (PDF only) */}
          {isPdf && numPages > 0 && (
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold ${darkMode ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
              <span>{currentPage}</span>
              <span className="text-slate-500">/</span>
              <span>{numPages}</span>
            </div>
          )}

          {/* Zoom out */}
          {isPdf && (
            <button
              onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
              title="Zoom Out"
              className={`p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <ZoomOut size={18} />
            </button>
          )}

          {/* Zoom in */}
          {isPdf && (
            <button
              onClick={() => setScale(s => Math.min(3.0, s + 0.2))}
              title="Zoom In"
              className={`p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <ZoomIn size={18} />
            </button>
          )}

          {/* Reset zoom */}
          {isPdf && (
            <button
              onClick={() => setScale(1.4)}
              title="Reset Zoom"
              className={`p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <RotateCcw size={16} />
            </button>
          )}

          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
            className={`p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title="Fullscreen"
            className={`p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <Maximize2 size={18} />
          </button>

          {/* Secure badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
            <Shield size={11} /> Secure
          </div>
        </div>
      </div>

      {/* ─── PDF PAGE NAV BAR (prev / next) ─────────── */}
      {isPdf && numPages > 0 && (
        <div className={`shrink-0 flex items-center justify-center gap-3 py-2 border-b ${darkMode ? 'bg-slate-900/80 border-white/5' : 'bg-white/80 border-slate-200'} backdrop-blur z-10`}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30 ${darkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span className={`text-xs font-mono ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Page <strong className={darkMode ? 'text-white' : 'text-slate-900'}>{currentPage}</strong> of <strong className={darkMode ? 'text-white' : 'text-slate-900'}>{numPages}</strong>
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30 ${darkMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ─── BODY ────────────────────────────────────── */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto overflow-x-auto"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* PDF Error */}
        {pdfError && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
            <AlertCircle size={48} className="text-red-400" />
            <p className="text-slate-300 max-w-sm">{pdfError}</p>
          </div>
        )}

        {/* PDF Loading spinner */}
        {loadingPdf && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-blue-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-slate-400 text-sm">Loading PDF…</p>
          </div>
        )}

        {/* PDF Pages — one canvas per page */}
        {isPdf && pdfDoc && !loadingPdf && !pdfError && (
          <div className="py-6 px-4 flex flex-col items-center">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <PageCanvas
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                scale={scale}
                darkMode={darkMode}
                onVisible={handlePageVisible}
              />
            ))}
          </div>
        )}

        {/* Video viewer */}
        {isVideo && (
          <div className="flex items-center justify-center min-h-[70vh] p-8">
            <video
              src={content.url}
              controls
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className="max-w-4xl w-full rounded-2xl shadow-2xl border border-white/10"
            />
          </div>
        )}

        {/* Unknown format */}
        {!isPdf && !isVideo && !loadingPdf && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
            <BookOpen size={56} className="text-slate-600" />
            <p className="text-slate-400 max-w-sm">
              This content format is not supported for in-browser preview. Please contact support.
            </p>
          </div>
        )}
      </div>

      {/* ─── BOTTOM STATUS BAR ───────────────────────── */}
      {isPdf && numPages > 0 && (
        <div className={`shrink-0 h-9 flex items-center justify-between px-5 border-t text-[11px] ${darkMode ? 'bg-slate-900 border-white/10 text-slate-500' : 'bg-white border-slate-200 text-slate-400'}`}>
          <span className="flex items-center gap-2">
            <Shield size={11} className="text-emerald-500" />
            Protected Content — Reading session is logged
          </span>
          <span className="font-mono">
            Zoom {Math.round(scale * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
