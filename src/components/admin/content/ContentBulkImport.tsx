import React, { useState } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, RefreshCw, ChevronRight, Download } from 'lucide-react';
import Papa from 'papaparse';
import { toast } from 'react-hot-toast';

const TEMPLATE_HEADERS = ['title','description','authors','domain','subjectArea','fileUrl','thumbnailUrl','tags','price','accessType','status'];

const EXPECTED_FIELDS = [
  { key: 'title',        label: 'Title',        required: true  },
  { key: 'description',  label: 'Description',  required: false },
  { key: 'authors',      label: 'Author(s)',     required: true  },
  { key: 'domain',       label: 'Domain',        required: false },
  { key: 'subjectArea',  label: 'Subject Area',  required: false },
  { key: 'fileUrl',      label: 'File URL',      required: false },
  { key: 'thumbnailUrl', label: 'Thumbnail URL', required: false },
  { key: 'tags',         label: 'Tags (comma)',  required: false },
  { key: 'price',        label: 'Price',         required: false },
  { key: 'accessType',   label: 'Access Type',   required: false },
  { key: 'status',       label: 'Status',        required: false },
];

interface ContentBulkImportProps {
  contentType: string;
}

export function ContentBulkImport({ contentType }: ContentBulkImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: any[] } | null>(null);

  const downloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(',') + '\n"Sample Title","Description here","John Doe","Medical","Cardiology","https://...","","tag1,tag2","0","Subscription","Published"';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${contentType.toLowerCase().replace(/\s+/g, '-')}-template.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    Papa.parse(f, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields) { toast.error('Could not read headers'); return; }
        setCsvHeaders(results.meta.fields);
        setCsvData(results.data as any[]);
        // Auto-map
        const autoMap: Record<string, string> = {};
        EXPECTED_FIELDS.forEach(field => {
          const match = results.meta.fields!.find(h => h.toLowerCase() === field.key.toLowerCase());
          if (match) autoMap[field.key] = match;
        });
        setMapping(autoMap);
        setStep(2);
      },
      error: (err) => toast.error(`Parse error: ${err.message}`)
    });
  };

  const processImport = async () => {
    const missing = EXPECTED_FIELDS.filter(f => f.required && !mapping[f.key]);
    if (missing.length > 0) {
      toast.error(`Map required: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setUploading(true);
    const items = csvData.map(row => {
      const rowData = row as Record<string, any>;
      const item: any = { contentType };
      Object.entries(mapping).forEach(([key, header]) => {
        if (header && rowData[header] !== undefined) item[key] = rowData[header];
      });
      return item;
    });

    try {
      const res = await fetch('/api/admin/content/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ items })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');
      setImportResult(result);
      setStep(3);
      result.failed > 0 ? toast.error(`Imported with ${result.failed} errors`) : toast.success(`${result.success} records imported!`);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const reset = () => { setFile(null); setCsvHeaders([]); setCsvData([]); setMapping({}); setImportResult(null); setStep(1); };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Step Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h2 className="font-bold text-slate-900">Bulk Import — {contentType}</h2>
          <p className="text-sm text-slate-500">Upload a CSV file to import up to 1000+ records at once.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
            <Download size={14} /> Download Template
          </button>
          {step > 1 && (
            <button onClick={reset}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
              <RefreshCw size={14} /> Start Over
            </button>
          )}
        </div>
      </div>

      {/* Step Indicators */}
      <div className="flex items-center gap-3">
        {[{ n: 1, label: 'Upload CSV' }, { n: 2, label: 'Map Columns' }, { n: 3, label: 'Results' }].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className={`flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg ${step >= s.n ? 'text-blue-700 bg-blue-50' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${step > s.n ? 'bg-emerald-500 text-white' : step === s.n ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {step > s.n ? '✓' : s.n}
              </span>
              {s.label}
            </div>
            {i < 2 && <div className={`flex-1 h-px ${step > s.n ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-16 text-center cursor-pointer transition-colors bg-white">
          <UploadCloud size={36} className="text-blue-400 mb-4" />
          <div className="font-bold text-slate-700 text-lg mb-1">Drop your CSV here or click to browse</div>
          <div className="text-sm text-slate-400 mb-6">Supports .csv files. Max 1000+ rows.</div>
          <span className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors">
            Select CSV File
          </span>
          <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
        </label>
      )}

      {/* Step 2: Map Columns */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            Found <strong>{csvData.length}</strong> records in <strong>{file?.name}</strong>. Map columns to the required fields below.
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {EXPECTED_FIELDS.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <select value={mapping[field.key] || ''}
                    onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className={`w-full text-sm border rounded-xl px-3 py-2 outline-none bg-slate-50 ${field.required && !mapping[field.key] ? 'border-amber-400' : 'border-slate-200 focus:border-blue-500'}`}>
                    <option value="">— Ignore —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={processImport} disabled={uploading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-7 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 transition-colors">
              {uploading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing...</> : <>Run Import <ChevronRight size={16} /></>}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && importResult && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4">
              <CheckCircle size={28} className="text-emerald-500 shrink-0" />
              <div>
                <div className="text-3xl font-bold text-emerald-700">{importResult.success}</div>
                <div className="text-sm font-semibold text-emerald-600">Successfully Imported</div>
              </div>
            </div>
            <div className={`border rounded-2xl p-5 flex items-center gap-4 ${importResult.failed > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-200'}`}>
              <AlertCircle size={28} className={importResult.failed > 0 ? 'text-red-500 shrink-0' : 'text-slate-400 shrink-0'} />
              <div>
                <div className={`text-3xl font-bold ${importResult.failed > 0 ? 'text-red-700' : 'text-slate-500'}`}>{importResult.failed}</div>
                <div className={`text-sm font-semibold ${importResult.failed > 0 ? 'text-red-600' : 'text-slate-500'}`}>Failed</div>
              </div>
            </div>
          </div>
          {importResult.errors.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <h3 className="font-bold text-red-800 text-sm">Failed Records Log</h3>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-semibold text-slate-500">Row</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-500">Title</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-500">Error</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {importResult.errors.map((err, i) => (
                      <tr key={i}><td className="px-4 py-2 text-slate-600">#{err.row}</td>
                        <td className="px-4 py-2 text-slate-600 max-w-[150px] truncate">{err.item?.title || '—'}</td>
                        <td className="px-4 py-2 text-red-600">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
