import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, ExternalLink, Edit } from 'lucide-react';
import toast from 'react-hot-toast';

export function ExtractionJobDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/extraction/jobs/${id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(data => {
        setJob(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        toast.error("Failed to load job details");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading job details...</div>;
  }

  if (!job) {
    return <div className="p-8 text-center text-slate-500">Job not found.</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <button 
        onClick={() => navigate('/admin/extraction')}
        className="flex items-center gap-2 text-slate-500 hover:text-blue-600 mb-6 transition-colors"
      >
        <ArrowLeft size={20} /> Back to Extraction Dashboard
      </button>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{job.name}</h1>
        <div className="flex gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span>Status: <strong className="text-slate-700 dark:text-slate-300">{job.status}</strong></span>
          <span>Domain: <strong className="text-slate-700 dark:text-slate-300">{job.targetDomain}</strong></span>
          <span>Type: <strong className="text-slate-700 dark:text-slate-300">{job.targetContentType}</strong></span>
          <span>Total Processed: <strong className="text-slate-700 dark:text-slate-300">{job.totalProcessed}</strong></span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Extracted Items ({job.items?.length || 0})</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Title</th>
                <th className="p-4 font-medium">Authors</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {job.items?.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                      ${item.status === 'Inserted' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        item.status === 'Failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                        item.status === 'Duplicate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}
                    >
                      {item.status === 'Inserted' && <CheckCircle size={12} />}
                      {item.status === 'Failed' && <XCircle size={12} />}
                      {(item.status === 'Duplicate' || item.status === 'Flagged') && <AlertTriangle size={12} />}
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1" title={item.title || "Unknown"}>
                      {item.title || "Unknown"}
                    </div>
                    {item.errorMessage && (
                      <div className="text-xs text-rose-500 mt-1 line-clamp-1" title={item.errorMessage}>
                        Error: {item.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-sm text-slate-600 dark:text-slate-400 line-clamp-1" title={item.authors || "-"}>
                    {item.authors || "-"}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.fileUrl && (
                        <a 
                          href={item.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title="View Source File"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                      {item.contentId && item.contentType && (
                        <button
                          onClick={() => {
                            const slug = item.contentType.toLowerCase().replace(/\s+/g, '-');
                            navigate(`/admin/${slug}/${item.contentId}`);
                          }}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title="Edit Content"
                        >
                          <Edit size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              
              {(!job.items || job.items.length === 0) && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    No items extracted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
