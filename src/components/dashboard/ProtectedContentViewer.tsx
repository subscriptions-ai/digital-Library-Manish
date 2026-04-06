import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Loader2, Download, AlertCircle, FileText } from 'lucide-react';

export function ProtectedContentViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/content/${id}/view`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        if (!res.ok) {
          if (res.status === 403) throw new Error('Access denied. Please upgrade your subscription.');
          throw new Error('Failed to load content');
        }
        return res.json();
      })
      .then(data => setContent(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Securing connection and loading content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center space-y-4">
        <div className="h-16 w-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-2">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-slate-600">{error}</p>
        <button 
          onClick={() => navigate('/dashboard/access')}
          className="mt-4 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
        >
          Return to My Access
        </button>
      </div>
    );
  }

  const isPdf = content?.url?.toLowerCase().endsWith('.pdf');
  const isVideo = content?.url?.toLowerCase().match(/\.(mp4|webm|ogg)$/i);

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] bg-slate-950 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">
      {/* Header toolbar */}
      <div className="h-16 bg-slate-900 border-b border-white/10 flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-bold text-white leading-tight line-clamp-1">{content.title}</h1>
            <p className="text-xs text-slate-400">{content.contentType}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded-lg">
            Secure Access
          </span>
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-colors"
          >
            <Download size={16} /> <span className="hidden sm:inline">Download</span>
          </a>
        </div>
      </div>

      {/* Viewer Content */}
      <div className="flex-1 overflow-hidden relative bg-slate-950 flex items-center justify-center">
        {isPdf ? (
          <iframe 
            src={`${content.url}#toolbar=0`} 
            className="w-full h-full border-none bg-white"
            title={content.title}
          />
        ) : isVideo ? (
          <video 
            src={content.url} 
            controls 
            controlsList="nodownload"
            className="max-w-full max-h-full aspect-video rounded-lg shadow-2xl border border-white/10"
          />
        ) : (
          <div className="text-center text-slate-400">
            <FileText size={64} className="mx-auto mb-4 opacity-50" />
            <p className="mb-6">This document format cannot be previewed in the browser.</p>
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all"
            >
              <Download size={18} /> Download to View
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
