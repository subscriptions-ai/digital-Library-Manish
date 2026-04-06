import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, UploadCloud, Tag } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { DOMAINS } from '../../../constants';

interface ContentSingleEditorProps {
  contentType: string;
}

export function ContentSingleEditor({ contentType }: ContentSingleEditorProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = id && id !== 'new';
  const slug = contentType.toLowerCase().replace(/\s+/g, '-');

  const [loading, setLoading] = useState(!!isEditing);
  const [saving, setSaving] = useState(false);

  const EMPTY_FORM = {
    title: '', description: '', authors: '', domain: DOMAINS[0]?.name || '',
    subjectArea: '', fileUrl: '', thumbnailUrl: '', tags: '',
    price: '0', accessType: 'Subscription', status: 'Published', publishingMode: 'Direct'
  };
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/content?contentType=${encodeURIComponent(contentType)}&limit=1000`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();
        const item = data.find((d: any) => d.id === id);
        if (!item) throw new Error('Not found');
        setForm({
          title: item.title || '', description: item.description || '', authors: item.authors || '',
          domain: item.domain || DOMAINS[0]?.name || '', subjectArea: item.subjectArea || '',
          fileUrl: item.fileUrl || '', thumbnailUrl: item.thumbnailUrl || '',
          tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
          price: String(item.price || 0), accessType: item.accessType || 'Subscription',
          status: item.status || 'Published', publishingMode: item.publishingMode || 'Direct'
        });
      } catch {
        toast.error('Failed to load item');
        navigate(`/admin/${slug}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEditing, contentType, navigate, slug]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.authors.trim()) {
      toast.error('Title and Author(s) are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        contentType,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        price: parseFloat(form.price) || 0
      };
      const url = isEditing ? `/api/admin/content/${id}` : '/api/admin/content';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success(`${contentType} ${isEditing ? 'updated' : 'created'} successfully`);
      navigate(`/admin/${slug}`);
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(`/admin/${slug}`)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={16} /> Back to list
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
          {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
          {isEditing ? 'Save Changes' : `Add ${contentType}`}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {/* Basic Info */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Basic Information</h3>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input name="title" value={form.title} onChange={handleChange}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
              placeholder="Enter title..." />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={3}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none resize-y"
              placeholder="Brief description or abstract..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Author(s) <span className="text-red-500">*</span></label>
              <input name="authors" value={form.authors} onChange={handleChange}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
                placeholder="Dr. John Doe, Jane Smith" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subject Area</label>
              <input name="subjectArea" value={form.subjectArea} onChange={handleChange}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
                placeholder="e.g. Cardiology" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              <Tag size={13} className="inline mr-1" />Tags (comma-separated)
            </label>
            <input name="tags" value={form.tags} onChange={handleChange}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
              placeholder="medicine, surgery, research" />
          </div>
        </div>

        {/* Classification */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Classification</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Domain <span className="text-red-500">*</span></label>
              <select name="domain" value={form.domain} onChange={handleChange}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none">
                {DOMAINS.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Publish Status</label>
              <select name="status" value={form.status} onChange={handleChange}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none">
                <option value="Published">Published</option>
                <option value="Draft">Draft (Hidden)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pricing & Access */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Pricing & Access</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Access Type</label>
              <select name="accessType" value={form.accessType} onChange={handleChange}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none">
                <option value="Subscription">Requires Subscription</option>
                <option value="One-time">One-time Purchase</option>
                <option value="Free">Free (Open Access)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Price (₹)</label>
              <input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleChange}
                disabled={form.accessType === 'Free' || form.accessType === 'Subscription'}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed" />
            </div>
          </div>
        </div>

        {/* Files & Media */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Files & Media</h3>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              <UploadCloud size={13} className="inline mr-1" />Document / Video URL
            </label>
            <input name="fileUrl" value={form.fileUrl} onChange={handleChange}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
              placeholder="https://... (PDF, Video embed, S3 link)" />
            <p className="text-xs text-slate-400 mt-1">Direct link to PDF, S3 bucket file, or YouTube embed URL</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Thumbnail URL</label>
            <div className="flex items-center gap-3">
              <input name="thumbnailUrl" value={form.thumbnailUrl} onChange={handleChange}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none"
                placeholder="https://..." />
              {form.thumbnailUrl && (
                <img src={form.thumbnailUrl} alt="thumb" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                  onError={e => (e.currentTarget.style.display = 'none')} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
