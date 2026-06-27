import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  Heart,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

// Correctly import PDF.js worker as a static url reference using Vite's ?url suffix
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

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
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);

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
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });

        await renderTask.promise;
        
        if (!cancelled) {
          const textContent = await page.getTextContent();
          const textLayerDiv = textLayerRef.current;
          if (textLayerDiv) {
            textLayerDiv.innerHTML = '';
            textLayerDiv.style.setProperty('--scale-factor', viewport.scale.toString());
            textLayerDiv.style.width = `${viewport.width}px`;
            textLayerDiv.style.height = `${viewport.height}px`;
            
            const textLayer = new pdfjsLib.TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: viewport,
            });
            await textLayer.render();
          }
          setRendering(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      // Intentionally NOT calling renderTask.cancel() as it frequently hangs 
      // the pdfjs-dist worker in React 18 Strict Mode during fast remounts.
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
        }}
      />
      <div 
        ref={textLayerRef}
        className="textLayer"
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
  const [searchParams] = useSearchParams();

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
  const [scale, setScale] = useState(() => window.innerWidth < 640 ? 0.6 : 1.4);
  const [darkMode, setDarkMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [iframeFallback, setIframeFallback] = useState(false);

  // Reading progress
  const [savedPage, setSavedPage] = useState(1);
  const [resumeToastShown, setResumeToastShown] = useState(false);
  const saveProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Favorites
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewerWrapperRef = useRef<HTMLDivElement>(null);

  // ── Auto-save reading progress (debounced 3s) ────────────────────────────
  const saveProgress = useCallback((page: number) => {
    if (!id) return;
    if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current);
    saveProgressTimer.current = setTimeout(() => {
      fetch('/api/user/reading-progress', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ contentId: id, lastPage: page, timeSpent: 30 })
      }).catch(() => {}); // fire-and-forget
    }, 3000);
  }, [id]);

  // Save on page change
  useEffect(() => {
    if (currentPage > 1 || numPages > 0) saveProgress(currentPage);
  }, [currentPage, saveProgress, numPages]);

  // ── Security limits removed to allow copying ─────

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
  
  // ── Fetch saved reading progress ──────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`/api/user/reading-progress/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.lastPage > 1) {
          setSavedPage(data.lastPage);
        }
      })
      .catch((err) => console.error('Failed to load progress:', err));
  }, [id]);

  // ── Fetch favorite status ─────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`/api/user/favorites/check/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setIsFavorite(data.favorited);
      })
      .catch((err) => console.error('Failed to load favorite status:', err));
  }, [id]);

  // ── Toggle favorite ───────────────────────────────────
  const toggleFavorite = async () => {
    if (!id || togglingFavorite) return;
    setTogglingFavorite(true);
    try {
      const res = await fetch('/api/user/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ contentId: id })
      });
      const data = await res.json();
      if (data.success) {
        setIsFavorite(data.favorited);
        toast.success(data.favorited ? "Added to your Wish List!" : "Removed from Wish List");
      }
    } catch (err) {
      toast.error("Failed to update Wish List");
    } finally {
      setTogglingFavorite(false);
    }
  };

  // ── Load PDF once we have the URL ───────────────────
  useEffect(() => {
    let isMounted = true;
    if (!content?.url) return;
    const isVideo = !!content.url.toLowerCase().match(/\.(mp4|webm|ogg)$/i);
    if (isVideo || iframeFallback) return;

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
        if (!isMounted) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);

        // ── Resume from saved page ───────────────────
        // Priority: ?page= URL param > API-saved progress
        const urlPage = parseInt(searchParams.get('page') || '0');
        const targetPage = urlPage > 1 ? urlPage : (savedPage > 1 ? savedPage : 1);

        if (targetPage > 1 && targetPage <= doc.numPages) {
          // Auto-scroll to the target page after a short delay to allow rendering
          setTimeout(() => {
            const pageEl = document.getElementById(`pdf-page-${targetPage}`);
            if (pageEl && scrollAreaRef.current) {
              pageEl.scrollIntoView({ behavior: 'smooth' });
              setCurrentPage(targetPage);
              if (!resumeToastShown) {
                toast.success(`Resumed from page ${targetPage}`, { icon: '📖' });
                setResumeToastShown(true);
              }
            }
          }, 1000);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err && (err.name === 'RenderingCancelledException' || err.name === 'PromiseCancelledException' || err.message?.includes('cancelled'))) {
          return;
        }
        console.warn('[viewer] PDF load error:', err.message || err);
        
        const msg = (err.message || '').toLowerCase();
        // If it's a network error from WAF (403, 503) or dead link (404), do not use iframe.
        // Iframe will either be blocked by Chrome or show a blank Cloudflare challenge.
        if (msg.includes('403') || msg.includes('404') || msg.includes('500') || msg.includes('502') || msg.includes('503')) {
          setPdfError("This document is currently restricted by the publisher's security firewall or is temporarily unavailable. Our system has automatically flagged this item for administrative review.");
        } else {
          // If it's an "Invalid PDF structure" error, it's likely a valid HTML article page!
          setIframeFallback(true);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingPdf(false);
      });

    return () => {
      isMounted = false;
      try { loadingTask.destroy(); } catch {}
    };
  }, [content, id, savedPage]);

  // ── Fetch saved progress on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    fetch(`/api/user/reading-progress/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.lastPage > 1) setSavedPage(data.lastPage); })
      .catch(() => {});
  }, [id]);

  // Cleanup debounce timer on unmount
  useEffect(() => () => { if (saveProgressTimer.current) clearTimeout(saveProgressTimer.current); }, []);



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

  const isVideo = !!content?.url?.toLowerCase().match(/\.(mp4|webm|ogg)$/i);
  const isPdf = !isVideo && !iframeFallback;

  // ────────────────────────────────────────────────────
  //  Render: Main viewer
  // ────────────────────────────────────────────────────
  return (
    <div
      ref={viewerWrapperRef}
      className={`flex flex-col h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'} transition-colors duration-300`}
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
              onClick={() => setScale(s => Math.max(0.4, s - 0.2))}
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

          {/* Reset zoom (Hidden on mobile to save space) */}
          {isPdf && (
            <button
              onClick={() => setScale(window.innerWidth < 640 ? 0.6 : 1.4)}
              title="Reset Zoom"
              className={`hidden sm:block p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <RotateCcw size={16} />
            </button>
          )}

          {/* Favorite Toggle */}
          <button
            onClick={toggleFavorite}
            disabled={togglingFavorite}
            title={isFavorite ? "Remove from Wish List" : "Add to Wish List"}
            className={`p-2 rounded-xl transition-all ${isFavorite ? 'text-red-500 hover:bg-red-500/10' : (darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-white/10' : 'text-slate-500 hover:text-red-500 hover:bg-slate-100')}`}
          >
            <Heart size={18} fill={isFavorite ? "currentColor" : "none"} className={isFavorite ? "animate-pulse" : ""} />
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
            className={`p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Fullscreen (Hidden on mobile) */}
          <button
            onClick={toggleFullscreen}
            title="Fullscreen"
            className={`hidden sm:block p-2 rounded-xl transition-colors ${darkMode ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
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
        {pdfError && !iframeFallback && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-4">
            <AlertCircle size={56} className="text-rose-500 mb-2" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Content Temporarily Unavailable</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
              {pdfError}
            </p>
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
              className="max-w-4xl w-full rounded-2xl shadow-2xl border border-white/10"
            />
          </div>
        )}

        {/* Iframe Fallback Viewer for web content */}
        {iframeFallback && !isVideo && (
          <iframe 
            src={`/api/content/${id}/proxy-frame?token=${localStorage.getItem('token')}`} 
            className="w-full h-[85vh] border-0 bg-white" 
            title={content.title}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
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
