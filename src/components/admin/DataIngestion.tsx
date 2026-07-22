import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { DOMAINS } from '../../constants';
import { Download, Play, Eye, Loader2, Database, CheckCircle2 } from 'lucide-react';

const SOURCES = [
  { id: 'openalex', label: 'OpenAlex', hint: 'Broad — full journal, ISSN, volume & issue metadata' },
  { id: 'doaj', label: 'DOAJ', hint: 'Open-access journals — journal, ISSN, volume & issue' },
  { id: 'europepmc', label: 'Europe PMC', hint: 'Journal structure + OA full text (medical / life sciences strong)' },
  { id: 'arxiv', label: 'arXiv', hint: 'Direct in-app PDFs, but preprints (no journal/ISSN/volume)' },
];

export function DataIngestion() {
  const deptNames = DOMAINS.map((d: any) => d.name);
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState('openalex');
  const [validatePdf, setValidatePdf] = useState(true);
  const [perDept, setPerDept] = useState(25);
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [preview, setPreview] = useState<any[]>([]);

  const token = () => localStorage.getItem('token');
  const toggle = (name: string) => setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);
  const allOn = () => setSelected(selected.length === deptNames.length ? [] : [...deptNames]);

  const runPreview = async () => {
    if (!selected.length) { toast.error('Select at least one department'); return; }
    setPreviewing(true); setSummary(null);
    try {
      const res = await fetch('/api/admin/ingest/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ source, departments: selected, perDept: Math.min(perDept, 10), trustedHostsOnly: validatePdf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data.items || []);
      toast.success(`Preview: ${data.count} items fetched (dry run, nothing saved)`);
    } catch (e: any) { toast.error(e.message || 'Preview failed'); } finally { setPreviewing(false); }
  };

  const runIngest = async () => {
    if (!selected.length) { toast.error('Select at least one department'); return; }
    if (!window.confirm(`Ingest ~${perDept} items/department for ${selected.length} department(s) from ${source.toUpperCase()}? New items publish directly; duplicates are skipped.`)) return;
    setRunning(true); setSummary(null); setPreview([]);
    try {
      const res = await fetch('/api/admin/ingest/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ source, departments: selected, perDept, validatePdf, trustedHostsOnly: validatePdf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingestion failed');
      if (!data.jobId) { setSummary(data); setRunning(false); return; } // legacy sync fallback
      setSummary({ ...data, status: 'running' });
      toast.success('Ingestion started — running in the background');
      // poll for live progress
      const jobId = data.jobId;
      const poll = async () => {
        try {
          const s = await fetch(`/api/admin/ingest/status/${jobId}`, { headers: { Authorization: `Bearer ${token()}` } });
          const sd = await s.json();
          if (!s.ok) throw new Error(sd.error || 'Lost job');
          setSummary(sd);
          if (sd.status === 'running') { setTimeout(poll, 2000); return; }
          setRunning(false);
          if (sd.status === 'done') toast.success(`Done: ${sd.inserted} new articles (${sd.duplicates} dupes, ${sd.skippedUnopenable} skipped)`);
          else toast.error(sd.error || 'Ingestion failed');
        } catch (e: any) { setRunning(false); toast.error(e.message || 'Lost track of job'); }
      };
      setTimeout(poll, 2000);
    } catch (e: any) { toast.error(e.message || 'Ingestion failed'); setRunning(false); }
  };

  const exportCsv = () => {
    if (!preview.length) { toast.error('Run a preview first'); return; }
    const headers = ['title', 'authors', 'journalName', 'issn', 'publisherName', 'volume', 'issue', 'year', 'doi', 'pdfUrl', 'department', 'source'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = preview.map(p => headers.map(h => esc(p[h])).join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ingest_preview_${source}.csv`; a.click();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Database size={24} className="text-blue-600" /> Data Ingestion</h1>
        <p className="text-sm text-slate-500">Pull open-access content into the new structured dataset. Free keyless sources — no API keys, OA only.</p>
      </div>

      {/* Source */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">1. Source</p>
        <div className="flex flex-wrap gap-3">
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setSource(s.id)}
              className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${source === s.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="font-bold text-slate-900 text-sm">{s.label}</div>
              <div className="text-[11px] text-slate-500">{s.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Departments */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">2. Departments ({selected.length} selected)</p>
          <button onClick={allOn} className="text-xs font-bold text-blue-600 hover:underline">{selected.length === deptNames.length ? 'Clear all' : 'Select all'}</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {deptNames.map(name => (
            <button key={name} onClick={() => toggle(name)}
              className={`text-left px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${selected.includes(name) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Items / department</label>
          <input type="number" min={1} max={300} value={perDept} onChange={e => setPerDept(parseInt(e.target.value) || 1)}
            className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={validatePdf} onChange={e => setValidatePdf(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
          Only trusted open-access publishers <span className="text-slate-400">(recommended — direct PDFs that open in the viewer; skips landing pages & Cloudflare-blocked sites)</span>
        </label>
        <div className="flex gap-2 ml-auto">
          <button onClick={runPreview} disabled={previewing || running}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl disabled:opacity-50">
            {previewing ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview (dry run)
          </button>
          <button onClick={exportCsv} disabled={!preview.length}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl disabled:opacity-40">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={runIngest} disabled={running || previewing}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50">
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Ingest Now
          </button>
        </div>
      </div>

      {/* Summary / live progress */}
      {summary && (
        <div className={`border rounded-2xl p-5 ${summary.status === 'running' ? 'bg-blue-50 border-blue-200' : summary.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className={`font-bold flex items-center gap-2 mb-3 ${summary.status === 'running' ? 'text-blue-800' : summary.status === 'error' ? 'text-red-800' : 'text-emerald-800'}`}>
            {summary.status === 'running'
              ? <><Loader2 size={18} className="animate-spin" /> Ingesting… {summary.currentDept ? `(${summary.currentDept})` : ''}</>
              : summary.status === 'error'
                ? <>Ingestion failed — {summary.error}</>
                : <><CheckCircle2 size={18} /> Ingestion Complete</>}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            {[['Fetched', summary.fetched], ['Inserted', summary.inserted], ['Duplicates', summary.duplicates], ['Skipped (unopenable)', summary.skippedUnopenable ?? 0], ['Publishers', summary.publishersDiscovered]].map(([l, v]: any) => (
              <div key={l}><div className="text-2xl font-black text-slate-900">{v ?? 0}</div><div className="text-[11px] font-bold text-slate-500 uppercase">{l}</div></div>
            ))}
          </div>
          {summary.status === 'running' && <p className="text-[11px] text-blue-600 mt-3">Running in the background — you can leave this page; numbers update live.</p>}
        </div>
      )}

      {/* Preview table */}
      {preview.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">Preview ({preview.length}) — dry run, nothing saved</div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 sticky top-0"><tr>
                {['Title', 'Journal', 'ISSN', 'Publisher', 'Vol/Iss', 'Year', 'Dept'].map(h => <th key={h} className="px-3 py-2 font-semibold text-slate-600">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {preview.slice(0, 100).map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 max-w-xs truncate" title={p.title}>{p.title}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{p.journalName || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{p.issn || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">{p.publisherName || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{[p.volume, p.issue].filter(Boolean).join('/') || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{p.year || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{p.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
