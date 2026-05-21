import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Plus, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, FileText, Database, Settings, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

export function ExtractionDashboard() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  // Job Creation State
  const [newJobName, setNewJobName] = useState('');
  const [sourceType, setSourceType] = useState('OpenAccess');
  const [targetDomain, setTargetDomain] = useState('');
  const [manualUrls, setManualUrls] = useState('');
  const [searchTopic, setSearchTopic] = useState('');

  const fetchJobs = () => {
    fetch('/api/admin/extraction/jobs', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(data => {
        setJobs(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        toast.error("Failed to load extraction jobs");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobName) return toast.error("Job name is required");
    
    if (sourceType === 'Manual' && !manualUrls.trim()) {
      return toast.error("Please enter at least one URL");
    }
    
    try {
      const reqBody: any = {
        name: newJobName,
        sourceType,
        targetDomain: targetDomain || null,
      };

      if (sourceType === 'Manual') {
        reqBody.sourceConfig = { urls: manualUrls.split('\n').map(u => u.trim()).filter(Boolean) };
      } else if (sourceType === 'OpenAccess') {
        if (!searchTopic.trim()) return toast.error("Please enter a search topic");
        reqBody.sourceConfig = { searchTopic };
      }

      const res = await fetch('/api/admin/extraction/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(reqBody)
      });
      
      if (!res.ok) throw new Error("Failed to create job");
      
      const newJob = await res.json();
      
      // Auto-start the job
      if (sourceType === 'Manual' || sourceType === 'OpenAccess') {
        const startRes = await fetch(`/api/admin/extraction/jobs/${newJob.id}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(sourceType === 'Manual' ? { items: manualUrls.split('\n').map(u => u.trim()).filter(Boolean).map(url => ({ url })) } : {})
        });
        if (startRes.ok) toast.success("Job created and Auto-Discovery started!");
        else toast.success("Job created, but failed to start automatically");
      } else {
        toast.success("Extraction job created");
      }
      
      setIsCreating(false);
      setNewJobName('');
      setManualUrls('');
      setSearchTopic('');
      fetchJobs();
    } catch (err) {
      toast.error("Error creating job");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
            <Database className="text-blue-600" />
            AI Extraction Engine
          </h1>
          <p className="text-slate-500 mt-1">Discover, extract, classify, and validate content automatically.</p>
        </div>
        
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm shadow-blue-500/20"
        >
          <Plus size={18} />
          New Extraction Job
        </button>
      </div>

      {isCreating && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6">Create Extraction Job</h2>
          <form onSubmit={handleCreateJob} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Job Name</label>
                <input
                  type="text"
                  required
                  value={newJobName}
                  onChange={e => setNewJobName(e.target.value)}
                  placeholder="e.g. Medical Journals Batch 1"
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Source Type</label>
                <select
                  value={sourceType}
                  onChange={e => setSourceType(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                >
                  <option value="OpenAccess">Open Access Auto-Discovery (Internet API)</option>
                  <option value="Manual">Manual URL Batch</option>
                  <option value="OJS" disabled>OJS Integration (Coming Soon)</option>
                  <option value="CSV" disabled>CSV AI Enrichment (Coming Soon)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Target Domain (Optional)</label>
                <select
                  value={targetDomain}
                  onChange={e => setTargetDomain(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                >
                  <option value="">Auto-Detect via AI</option>
                  <option value="Medical Sciences">Medical Sciences</option>
                  <option value="Computer/IT">Computer/IT</option>
                  <option value="Electrical Engineering">Electrical Engineering</option>
                  {/* Add others as needed */}
                </select>
              </div>
            </div>

            {sourceType === 'OpenAccess' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Search Topic (e.g. "Cardiology", "Quantum Physics")</label>
                <input
                  type="text"
                  required
                  value={searchTopic}
                  onChange={e => setSearchTopic(e.target.value)}
                  placeholder="What open access PDFs should we find?"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                />
                <p className="text-xs text-slate-500 mt-2">We will automatically scan global open access databases for real, valid PDFs matching this query.</p>
              </div>
            )}

            {sourceType === 'Manual' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Source URLs (One per line)</label>
                <textarea
                  required
                  rows={5}
                  value={manualUrls}
                  onChange={e => setManualUrls(e.target.value)}
                  placeholder="https://example.com/paper1.pdf&#10;https://example.com/video2.mp4"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white resize-none font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-2">Enter direct links to PDFs or MP4 videos.</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
              >
                Create Job
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {loading ? (
        <div className="flex justify-center p-12"><RefreshCw className="animate-spin text-slate-400" /></div>
      ) : (
        <div className="grid gap-4">
          {jobs.length === 0 ? (
            <div className="text-center p-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500">
              No extraction jobs found. Create one to get started!
            </div>
          ) : (
            jobs.map(job => (
              <div key={job.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm">
                
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">{job.name}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold
                      ${job.status === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        job.status === 'Running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse' :
                        job.status === 'Failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }
                    `}>
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1"><Settings size={14} /> {job.sourceType}</span>
                    <span className="flex items-center gap-1"><Clock size={14} /> {new Date(job.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex gap-6 items-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{job.totalProcessed}</div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Processed</div>
                  </div>
                  
                  <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {job.totalProcessed - job.totalDuplicates - job.totalFailed - job.totalFlagged}
                    </div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Valid</div>
                  </div>
                  
                  <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-500">{job.totalFlagged + job.totalDuplicates}</div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Flag/Dup</div>
                  </div>
                  
                  <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>

                  <div className="text-center">
                    <div className="text-2xl font-bold text-rose-500">{job.totalFailed}</div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Failed</div>
                  </div>
                </div>

                <div className="pl-4 border-l border-slate-200 dark:border-slate-700 ml-2">
                  <button className="p-3 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 dark:bg-slate-900/50 dark:hover:bg-blue-900/20 rounded-xl transition-colors">
                    <ArrowRight size={20} />
                  </button>
                </div>
                
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
