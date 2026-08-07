import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UploadCloud, Search, Copy, Check, Trash2, X, FileText, FileSpreadsheet,
  Presentation, FileType, Film, Music, Archive, File as FileIcon, Loader2, ExternalLink, HardDrive
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // must match MEDIA_MAX_BYTES on the server

const KIND_FILTERS = [
  { key: 'all',          label: 'All' },
  { key: 'image',        label: 'Images' },
  { key: 'pdf',          label: 'PDFs' },
  { key: 'document',     label: 'Documents' },
  { key: 'spreadsheet',  label: 'Spreadsheets' },
  { key: 'presentation', label: 'Presentations' },
  { key: 'video',        label: 'Video' },
  { key: 'audio',        label: 'Audio' },
  { key: 'archive',      label: 'Archives' },
];

const ACCEPT = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.ico',
  '.pdf', '.doc', '.docx', '.rtf', '.txt', '.md',
  '.xls', '.xlsx', '.csv', '.ppt', '.pptx',
  '.mp4', '.webm', '.mp3', '.wav', '.zip',
].join(',');

interface MediaAsset {
  id: string;
  fileName: string;
  originalName: string;
  url: string;
  absoluteUrl: string;
  mimeType: string;
  ext: string | null;
  kind: string;
  size: number;
  width: number | null;
  height: number | null;
  title: string | null;
  altText: string | null;
  caption: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

const formatBytes = (b: number) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

const kindIcon = (kind: string, size = 28) => {
  switch (kind) {
    case 'pdf':          return <FileType size={size} className="text-red-500" />;
    case 'document':     return <FileText size={size} className="text-blue-500" />;
    case 'spreadsheet':  return <FileSpreadsheet size={size} className="text-emerald-600" />;
    case 'presentation': return <Presentation size={size} className="text-orange-500" />;
    case 'video':        return <Film size={size} className="text-purple-500" />;
    case 'audio':        return <Music size={size} className="text-pink-500" />;
    case 'archive':      return <Archive size={size} className="text-amber-600" />;
    default:             return <FileIcon size={size} className="text-slate-400" />;
  }
};

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Copies to the clipboard, falling back to a hidden textarea on browsers that
// block the async Clipboard API outside a secure context.
const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

export function MediaLibrary() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalSize, setTotalSize] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const LIMIT = 40;

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), kind });
      if (debouncedSearch) params.set('q', debouncedSearch);
      const r = await fetch(`/api/admin/media?${params}`, { headers: authHeaders() });
      if (!r.ok) throw new Error('load failed');
      const d = await r.json();
      setAssets(d.data || []);
      setTotal(d.total || 0);
      setCounts(d.counts || {});
      setTotalSize(d.totalSize || 0);
    } catch {
      toast.error('Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [page, kind, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('Could not read file'));
    fr.readAsDataURL(file);
  });

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;

    const tooBig = files.filter(f => f.size > MAX_FILE_BYTES);
    tooBig.forEach(f => toast.error(`${f.name} is ${formatBytes(f.size)} — max is 25 MB`));
    const queue = files.filter(f => f.size <= MAX_FILE_BYTES);
    if (!queue.length) return;

    setUploading({ done: 0, total: queue.length });
    let ok = 0;
    // Sequential: each file is a base64 body, so parallel uploads would spike memory.
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      try {
        const dataUrl = await readAsDataUrl(file);
        const r = await fetch('/api/admin/media', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, filename: file.name }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Upload failed');
        ok++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e.message || 'Upload failed'}`);
      }
      setUploading({ done: i + 1, total: queue.length });
    }
    setUploading(null);
    if (ok) {
      toast.success(`${ok} file${ok > 1 ? 's' : ''} uploaded`);
      setPage(1);
      load();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files || []));
  };

  const handleCopy = async (asset: MediaAsset, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await copyText(asset.absoluteUrl);
    setCopiedId(asset.id);
    toast.success('URL copied');
    setTimeout(() => setCopiedId(c => (c === asset.id ? null : c)), 1800);
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (!window.confirm(`Delete "${asset.originalName}"? Any page still using this URL will break.`)) return;
    try {
      const r = await fetch(`/api/admin/media/${asset.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) throw new Error();
      toast.success('Deleted');
      setSelected(null);
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleSaveMeta = async (asset: MediaAsset, patch: Partial<MediaAsset>) => {
    try {
      const r = await fetch(`/api/admin/media/${asset.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setAssets(list => list.map(a => (a.id === updated.id ? updated : a)));
      setSelected(updated);
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const totalPages = Math.ceil(total / LIMIT) || 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Media Library</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload images, PDFs, Word, Excel and PowerPoint files — copy the public link and use it anywhere.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <HardDrive size={14} /> {formatBytes(totalSize)} stored
          </div>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={!!uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {uploading ? `Uploading ${uploading.done}/${uploading.total}` : 'Upload Files'}
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={e => { uploadFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
      />

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInput.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'
        }`}
      >
        <UploadCloud size={32} className={`mx-auto mb-2 ${dragOver ? 'text-blue-600' : 'text-slate-400'}`} />
        <p className="text-sm font-bold text-slate-700">Drop files here, or click to select</p>
        <p className="text-xs text-slate-500 mt-1">
          Images, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV, TXT, MP4, MP3, ZIP — up to 25 MB each
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by file name, title or caption…"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => { setKind(f.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                kind === f.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
              {f.key !== 'all' && counts[f.key] ? <span className="ml-1 opacity-60">{counts[f.key]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-blue-600" />
        </div>
      ) : assets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-20 text-center">
          <FileIcon size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">No media found</p>
          <p className="text-xs text-slate-400 mt-1">
            {debouncedSearch || kind !== 'all' ? 'Try a different search or filter.' : 'Upload your first file to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {assets.map(a => (
            <div
              key={a.id}
              onClick={() => setSelected(a)}
              className="group bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
            >
              <div className="aspect-square bg-slate-50 flex items-center justify-center relative overflow-hidden">
                {a.kind === 'image' ? (
                  <img src={a.url} alt={a.altText || a.originalName} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {kindIcon(a.kind, 30)}
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{a.ext}</span>
                  </div>
                )}
                <button
                  onClick={e => handleCopy(a, e)}
                  title="Copy URL"
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 backdrop-blur border border-slate-200 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-blue-600 transition-opacity"
                >
                  {copiedId === a.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="p-2.5 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-700 truncate" title={a.originalName}>{a.originalName}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{formatBytes(a.size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages} · {total} file{total !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selected && (
        <DetailsDrawer
          asset={selected}
          onClose={() => setSelected(null)}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onSave={handleSaveMeta}
          copied={copiedId === selected.id}
        />
      )}
    </div>
  );
}

function DetailsDrawer({ asset, onClose, onCopy, onDelete, onSave, copied }: {
  asset: MediaAsset;
  onClose: () => void;
  onCopy: (a: MediaAsset) => void;
  onDelete: (a: MediaAsset) => void;
  onSave: (a: MediaAsset, patch: Partial<MediaAsset>) => void;
  copied: boolean;
}) {
  const [title, setTitle] = useState(asset.title || '');
  const [altText, setAltText] = useState(asset.altText || '');
  const [caption, setCaption] = useState(asset.caption || '');

  useEffect(() => {
    setTitle(asset.title || '');
    setAltText(asset.altText || '');
    setCaption(asset.caption || '');
  }, [asset.id]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const embedSnippet = asset.kind === 'image'
    ? `<img src="${asset.absoluteUrl}" alt="${(altText || asset.originalName).replace(/"/g, '&quot;')}" />`
    : `<a href="${asset.absoluteUrl}" target="_blank" rel="noopener">${title || asset.originalName}</a>`;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Attachment Details</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center min-h-[180px]">
            {asset.kind === 'image' ? (
              <img src={asset.url} alt={asset.altText || asset.originalName} className="max-h-72 w-auto object-contain" />
            ) : asset.kind === 'video' ? (
              <video src={asset.url} controls className="w-full max-h-72" />
            ) : asset.kind === 'audio' ? (
              <audio src={asset.url} controls className="w-full px-4" />
            ) : (
              <div className="flex flex-col items-center gap-2 py-10">
                {kindIcon(asset.kind, 44)}
                <span className="text-xs font-bold text-slate-400 uppercase">{asset.ext}</span>
              </div>
            )}
          </div>

          {/* Facts */}
          <div className="text-xs text-slate-500 space-y-1">
            <div className="font-bold text-slate-700 break-all">{asset.originalName}</div>
            <div>{new Date(asset.createdAt).toLocaleString()}</div>
            <div>
              {formatBytes(asset.size)}
              {asset.width && asset.height ? ` · ${asset.width} × ${asset.height} px` : ''}
              {` · ${asset.mimeType}`}
            </div>
            {asset.uploadedBy && <div>Uploaded by {asset.uploadedBy}</div>}
          </div>

          {/* URL */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">File URL</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={asset.absoluteUrl}
                onFocus={e => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-700"
              />
              <button
                onClick={() => onCopy(asset)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shrink-0"
                title="Copy URL"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <a
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg shrink-0"
                title="Open in new tab"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </div>

          {/* Embed snippet */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              {asset.kind === 'image' ? 'Image tag' : 'Link tag'}
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={embedSnippet}
                onFocus={e => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-700"
              />
              <button
                onClick={async () => { await copyText(embedSnippet); toast.success('Snippet copied'); }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg shrink-0"
                title="Copy snippet"
              >
                <Copy size={15} />
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="space-y-3">
            <Field label="Title" value={title} onChange={setTitle} />
            {asset.kind === 'image' && (
              <Field label="Alt text" value={altText} onChange={setAltText} placeholder="Describe the image for screen readers" />
            )}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Caption</label>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onSave(asset, { title, altText, caption })}
              className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl"
            >
              Save Changes
            </button>
            <button
              onClick={() => onDelete(asset)}
              className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold rounded-xl flex items-center gap-1.5"
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

export default MediaLibrary;
