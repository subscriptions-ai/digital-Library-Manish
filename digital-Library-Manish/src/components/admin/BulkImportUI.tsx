import React, { useState } from 'react';
import { UploadCloud, CheckCircle, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import Papa from 'papaparse';
import { toast } from 'react-hot-toast';

const EXPECTED_FIELDS = [
  { key: 'title', label: 'Title (Required)', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'authors', label: 'Author(s) (Required)', required: true },
  { key: 'domain', label: 'Domain', required: false },
  { key: 'contentType', label: 'Content Type', required: false },
  { key: 'subjectArea', label: 'Subject Area', required: false },
  { key: 'fileUrl', label: 'File/Video URL', required: false },
  { key: 'thumbnailUrl', label: 'Thumbnail URL', required: false },
  { key: 'tags', label: 'Tags (Comma separated)', required: false },
  { key: 'price', label: 'Price (Number)', required: false },
  { key: 'accessType', label: 'Access Type (Subscription/One-time/Free)', required: false },
  { key: 'status', label: 'Status (Published/Draft)', required: false },
  { key: 'publishingMode', label: 'Publishing Mode', required: false },
];

export function BulkImportUI() {
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // { expectedField: csvHeader }
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: any[] } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.meta.fields) {
            setCsvHeaders(results.meta.fields);
            setCsvData(results.data);
            
            // Auto-map where possible
            const autoMap: Record<string, string> = {};
            EXPECTED_FIELDS.forEach(field => {
              const match = results.meta.fields!.find(h => h.toLowerCase() === field.key.toLowerCase());
              if (match) autoMap[field.key] = match;
            });
            setMapping(autoMap);
            setStep(2);
          } else {
            toast.error("Could not read headers from the file");
          }
        },
        error: (error) => {
          toast.error(`Error parsing file: ${error.message}`);
        }
      });
    }
  };

  const handleMappingChange = (expectedKey: string, csvHeader: string) => {
    setMapping(prev => ({
      ...prev,
      [expectedKey]: csvHeader
    }));
  };

  const processImport = async () => {
    // Validate required fields
    const missingRequired = EXPECTED_FIELDS.filter(f => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      toast.error(`Please map required fields: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }

    setUploading(true);
    
    // Transform CSV data to payload using mapping
    const payloadItems = csvData.map(row => {
      const item: any = {};
      const rowData = row as Record<string, any>;
      Object.entries(mapping).forEach(([expectedKey, csvHeader]) => {
        if (csvHeader && rowData[csvHeader] !== undefined) {
          item[expectedKey] = rowData[csvHeader];
        }
      });
      return item;
    });

    try {
      const res = await fetch('/api/admin/content/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ items: payloadItems })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to process bulk import");

      setImportResult(result);
      setStep(3);
      if (result.failed > 0) {
        toast.error(`Imported with ${result.failed} errors`);
      } else {
        toast.success(`Successfully imported ${result.success} items!`);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "An error occurred during import");
    } finally {
      setUploading(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setCsvHeaders([]);
    setCsvData([]);
    setMapping({});
    setImportResult(null);
    setStep(1);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Data Import</h1>
          <p className="text-sm text-slate-500">Upload CSV/Excel to bulk insert digital library content.</p>
        </div>
        {step > 1 && (
          <button 
            onClick={resetImport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <RefreshCw size={16} /> Start Over
          </button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between max-w-2xl mx-auto mb-12 relative">
        <div className="absolute top-1/2 left-0 w-full h-[2px] bg-slate-200 -z-10 -translate-y-1/2"></div>
        {[
          { num: 1, label: 'Upload CSV' },
          { num: 2, label: 'Map Columns' },
          { num: 3, label: 'Results' }
        ].map((s) => (
          <div key={s.num} className="flex flex-col items-center bg-slate-50 px-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-colors ${
              step >= s.num ? 'bg-blue-600 text-white shadow-md' : 'bg-white border-2 border-slate-200 text-slate-400'
            }`}>
              {step > s.num ? <CheckCircle size={18} /> : s.num}
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${step >= s.num ? 'text-blue-600' : 'text-slate-400'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 1: Upload */}
      {step === 1 && (
        <div className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
            <UploadCloud size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Upload your CSV file</h2>
          <p className="text-slate-500 max-w-md mx-auto mb-8 text-sm">
            Please ensure your file has header rows. The system supports uploading thousands of rows at once.
          </p>
          <label className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all cursor-pointer shadow-sm">
            Select File
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {/* STEP 2: Map Columns */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800">Map Columns</h2>
              <div className="text-sm text-slate-500">Found {csvData.length} records.</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {EXPECTED_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <select 
                    value={mapping[field.key] || ''}
                    onChange={(e) => handleMappingChange(field.key, e.target.value)}
                    className={`w-full appearance-none bg-slate-50 border rounded-xl py-2.5 px-4 text-sm outline-none transition-all ${
                      field.required && !mapping[field.key] ? 'border-amber-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500' : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  >
                    <option value="">-- Ignore / Not present --</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button 
              onClick={processImport}
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
            >
              {uploading ? (
                <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div> Importing...</>
              ) : (
                <>Run Import <ChevronRight size={18} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Results */}
      {step === 3 && importResult && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                <CheckCircle size={24} />
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-700">{importResult.success}</div>
                <div className="text-sm font-medium text-emerald-600 uppercase tracking-wider">Successfully Imported</div>
              </div>
            </div>
            
            <div className={`p-6 rounded-2xl flex items-center gap-4 border ${importResult.failed > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
              <div className={`p-3 rounded-xl ${importResult.failed > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                <AlertCircle size={24} />
              </div>
              <div>
                <div className={`text-3xl font-bold ${importResult.failed > 0 ? 'text-red-700' : 'text-slate-500'}`}>{importResult.failed}</div>
                <div className={`text-sm font-medium uppercase tracking-wider ${importResult.failed > 0 ? 'text-red-600' : 'text-slate-500'}`}>Failed Records</div>
              </div>
            </div>
          </div>

          {importResult.failed > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-red-50">
                <h3 className="font-bold text-red-800">Error Log</h3>
                <p className="text-sm text-red-600">Review the rows below that failed to import.</p>
              </div>
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="border-b border-slate-200">
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Row</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Input Title</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Error Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importResult.errors.map((err, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-medium text-slate-900"># {err.row}</td>
                        <td className="px-6 py-3 text-sm text-slate-600 truncate max-w-[200px]">{err.item.title || 'N/A'}</td>
                        <td className="px-6 py-3 text-sm text-red-600">{err.error}</td>
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
