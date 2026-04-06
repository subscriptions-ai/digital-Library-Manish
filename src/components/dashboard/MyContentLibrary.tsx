import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Lock, FileText, ArrowLeft, Search } from 'lucide-react';

export function MyContentLibrary() {
  const [params] = useSearchParams();
  const domain = params.get('domain') || '';
  const type = params.get('type') || '';
  const navigate = useNavigate();

  const [contents, setContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/content/list?domain=${domain}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => {
        // Filter by type roughly
        const filtered = type ? data.filter((d: any) => d.contentType === type) : data;
        setContents(filtered);
      })
      .catch(() => toast.error("Failed to load content"))
      .finally(() => setLoading(false));
  }, [domain, type]);

  const handleOpen = (item: any) => {
    if (item.locked) {
      toast.error('This content is locked. Please upgrade your subscription.');
      navigate(`/domain/${domain.toLowerCase().replace(/\s+/g, '-')}`);
    } else {
      navigate(`/dashboard/viewer/${item.id}`);
    }
  };

  if (loading) return <div className="p-12 text-center text-slate-500">Loading library...</div>;

  const filteredContents = contents.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/dashboard/access')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} className="text-slate-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{type || 'Content Library'}</h1>
          <p className="text-sm text-slate-500 mt-1">{domain}</p>
        </div>
      </div>

      <div className="relative flex-1 w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          placeholder="Search items..."
          className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-100 transition-shadow outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredContents.map((content, idx) => (
          <motion.div
            key={content.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => handleOpen(content)}
            className={`relative p-6 rounded-3xl border transition-all cursor-pointer group ${
              content.locked 
                ? 'bg-slate-50 border-slate-200 hover:border-slate-300' 
                : 'bg-white border-slate-100 hover:shadow-lg hover:-translate-y-1'
            }`}
          >
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-4 ${
              content.locked ? 'bg-slate-200 text-slate-400' : 'bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform'
            }`}>
              {content.locked ? <Lock size={20} /> : <FileText size={20} />}
            </div>
            <h3 className={`font-bold text-lg leading-tight mb-2 ${content.locked ? 'text-slate-500' : 'text-slate-900'}`}>
              {content.title}
            </h3>
            <p className="text-xs text-slate-500 line-clamp-2 mb-4">
              {content.authors} • {content.subjectArea || 'General'}
            </p>
            {content.locked ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-200 w-max px-3 py-1 rounded-lg">
                <Lock size={12} /> Locked
              </span>
            ) : (
              <button className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-1.5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                Read Now
              </button>
            )}
          </motion.div>
        ))}

        {filteredContents.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-100">
            No content found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}
