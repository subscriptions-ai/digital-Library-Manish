import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, UploadCloud } from 'lucide-react';
import { toast } from 'react-hot-toast';

const DOMAINS = ['Medical', 'Engineering', 'Pharmacy', 'Nursing', 'Management', 'Arts & Humanities', 'Law', 'Others'];
const CONTENT_TYPES = ['Books', 'Periodicals', 'Magazines', 'Case Reports', 'Theses', 'Conference Proceedings', 'Educational Videos', 'Newsletters'];

export function ContentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = id && id !== 'new';

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    authors: '',
    domain: DOMAINS[0],
    contentType: CONTENT_TYPES[0],
    subjectArea: 'General',
    fileUrl: '',
    thumbnailUrl: '',
    tags: '',
    price: 0,
    accessType: 'Subscription',
    status: 'Published',
    publishingMode: 'Direct'
  });

  useEffect(() => {
    if (isEditing) {
      const fetchItem = async () => {
        try {
          const res = await fetch(`/api/admin/content?search=${id}`); // Quick hack to fetch single via list, or we should create GET /:id but list is sufficient if we filter
          // Actually better to fetch all and filter or add GET /api/admin/content/:id. Since we don't have GET /:id, we'll fetch all and find it locally.
          const fetchRes = await fetch(`/api/admin/content`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          });
          const { data } = await fetchRes.json();
          const item = data.find((d: any) => d.id === id);
          if (!item) throw new Error("Item not found");
          
          setFormData({
            title: item.title || '',
            description: item.description || '',
            authors: item.authors || '',
            domain: item.domain || DOMAINS[0],
            contentType: item.contentType || CONTENT_TYPES[0],
            subjectArea: item.subjectArea || 'General',
            fileUrl: item.fileUrl || '',
            thumbnailUrl: item.thumbnailUrl || '',
            tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
            price: item.price || 0,
            accessType: item.accessType || 'Subscription',
            status: item.status || 'Published',
            publishingMode: item.publishingMode || 'Direct'
          });
        } catch (error) {
          toast.error("Failed to load content details");
          navigate('/admin/content');
        } finally {
          setLoading(false);
        }
      };
      fetchItem();
    }
  }, [id, isEditing, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!formData.title || !formData.authors || !formData.domain || !formData.contentType) {
      toast.error('Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        price: parseFloat(formData.price.toString()) || 0
      };

      const url = isEditing ? `/api/admin/content/${id}` : '/api/admin/content';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Save failed");
      
      toast.success(`Content ${isEditing ? 'updated' : 'created'} successfully`);
      navigate('/admin/content');
    } catch (error) {
      console.error(error);
      toast.error("Failed to save content");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin/content')}
            className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{isEditing ? 'Edit Content' : 'Add New Content'}</h1>
            <p className="text-sm text-slate-500">{isEditing ? 'Update existing digital resource.' : 'Publish a new resource to the digital library.'}</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
        >
          {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
          <span>{isEditing ? 'Save Changes' : 'Publish Content'}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 md:p-8 space-y-8">
          
          {/* Basic Info */}
          <section>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-full">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Title <span className="text-red-500">*</span></label>
                <input 
                  type="text" name="title" value={formData.title} onChange={handleChange} required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  placeholder="E.g., Principles of Internal Medicine"
                />
              </div>
              <div className="col-span-full">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                <textarea 
                  name="description" value={formData.description} onChange={handleChange} rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all resize-y"
                  placeholder="Detailed overview or abstract..."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Author(s) <span className="text-red-500">*</span></label>
                <input 
                  type="text" name="authors" value={formData.authors} onChange={handleChange} required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  placeholder="John Doe, Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tags / Keywords</label>
                <input 
                  type="text" name="tags" value={formData.tags} onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Comma separated (e.g., Medical, Surgery)"
                />
              </div>
            </div>
          </section>

          {/* Classification */}
          <section>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Classification</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Domain <span className="text-red-500">*</span></label>
                <select 
                  name="domain" value={formData.domain} onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                >
                  {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Content Type <span className="text-red-500">*</span></label>
                <select 
                  name="contentType" value={formData.contentType} onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                >
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Subject Area</label>
                <input 
                  type="text" name="subjectArea" value={formData.subjectArea} onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  placeholder="E.g., Cardiology"
                />
              </div>
            </div>
          </section>

          {/* Pricing & Access */}
          <section>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Access & Publishing</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Access Type <span className="text-red-500">*</span></label>
                <select 
                  name="accessType" value={formData.accessType} onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="Subscription">Requires Subscription</option>
                  <option value="One-time">One-time Purchase</option>
                  <option value="Free">Free (Open Access)</option>
                </select>
              </div>
              {formData.accessType === 'One-time' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Price (₹) <span className="text-red-500">*</span></label>
                  <input 
                    type="number" name="price" value={formData.price} onChange={handleChange} min="0" step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              )}
              {formData.accessType !== 'One-time' && <div className="hidden md:block"></div>}
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Publish Status</label>
                <select 
                  name="status" value={formData.status} onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                >
                  <option value="Published">Published</option>
                  <option value="Draft">Draft (Hidden)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Asset URLs */}
          <section>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Media & Files</h2>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Thumbnail URL</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="url" name="thumbnailUrl" value={formData.thumbnailUrl} onChange={handleChange}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    placeholder="https://example.com/image.jpg"
                  />
                  {formData.thumbnailUrl && (
                    <img src={formData.thumbnailUrl} alt="Thumbnail preview" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Document / Video URL</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <UploadCloud size={18} />
                  </div>
                  <input 
                    type="url" name="fileUrl" value={formData.fileUrl} onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    placeholder="https://example.com/document.pdf or Video Embed Link"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">Enter the direct link to the content file (PDF, AWS S3 link, YouTube embed, etc.)</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
