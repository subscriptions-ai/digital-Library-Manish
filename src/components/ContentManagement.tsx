import React, { useState, useEffect } from 'react';


import { Submission, SubmissionStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Library, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText, 
  Search, 
  Filter,
  MoreVertical,
  ExternalLink,
  Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export function ContentManagement() {
  const { isAdmin, isContentManager } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedSubmissions = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        submissionId: doc.id
      }) as Submission);
      setSubmissions(fetchedSubmissions);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: SubmissionStatus) => {
    try {
      await Promise.resolve();
      setSubmissions(prev => prev.map(s => s.submissionId === id ? { ...s, status } : s));
      toast.success(`Content ${status.toLowerCase()}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const filteredSubmissions = submissions.filter(s => 
    statusFilter === 'all' || s.status === statusFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Content Management</h1>
          <p className="text-slate-500">Review, approve, and manage library content.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
            <Upload size={18} />
            Bulk Upload
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Search by title or author..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Filter size={18} />
            Status:
          </div>
          <select 
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Content Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Content</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Submitted</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 font-medium">Loading content...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <p className="text-slate-500 font-medium">No content found matching your criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((sub) => (
                  <tr key={sub.submissionId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 line-clamp-1">{sub.title}</p>
                          <p className="text-xs text-slate-500">{sub.authors}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                        {sub.contentType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        sub.status === 'Approved' ? 'bg-green-50 text-green-600' : 
                        sub.status === 'Rejected' ? 'bg-red-50 text-red-600' : 
                        'bg-orange-50 text-orange-600'
                      }`}>
                        {sub.status === 'Approved' ? <CheckCircle2 size={12} /> : 
                         sub.status === 'Rejected' ? <XCircle size={12} /> : 
                         <Clock size={12} />}
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500">
                        {sub.createdAt?.toDate ? sub.createdAt.toDate().toLocaleDateString() : 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a 
                          href={sub.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all"
                          title="View File"
                        >
                          <Eye size={18} />
                        </a>
                        {sub.status === 'Pending' && (
                          <>
                            <button 
                              onClick={() => updateStatus(sub.submissionId, 'Approved')}
                              className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-all"
                              title="Approve"
                            >
                              <CheckCircle2 size={18} />
                            </button>
                            <button 
                              onClick={() => updateStatus(sub.submissionId, 'Rejected')}
                              className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-all"
                              title="Reject"
                            >
                              <XCircle size={18} />
                            </button>
                          </>
                        )}
                        <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-all">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
