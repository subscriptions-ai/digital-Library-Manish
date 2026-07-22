import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, ArrowLeft, UploadCloud, Tag, Plus, Trash2, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { DOMAINS } from '../../../constants';

interface ContentSingleEditorProps {
  contentType: string;
}

// Type-specific metadata fields per content type (master plan Section 3).
// meta:true  -> stored in the JSON metadata blob; otherwise a real column.
type FieldDef = { key: string; label: string; ph?: string; meta?: boolean; type?: string };
const TYPE_FIELDS: Record<string, FieldDef[]> = {
  'Periodicals': [
    { key: 'journalName', label: 'Journal Name' }, { key: 'issn', label: 'ISSN' },
    { key: 'publisherName', label: 'Publisher' },
    { key: 'volume', label: 'Volume' }, { key: 'issue', label: 'Issue' },
    { key: 'year', label: 'Publication Year', type: 'number' }, { key: 'doi', label: 'DOI' },
  ],
  'Magazines': [
    { key: 'journalName', label: 'Magazine Name' }, { key: 'publisherName', label: 'Publisher' },
    { key: 'issueDate', label: 'Issue Date (Month/Year)', meta: true }, { key: 'issue', label: 'Issue Number' },
  ],
  'Case Reports': [
    { key: 'journalName', label: 'Journal Name' }, { key: 'publisherName', label: 'Publisher' },
    { key: 'hospital', label: 'Hospital / Institution', meta: true }, { key: 'specialty', label: 'Department / Specialty', meta: true },
    { key: 'year', label: 'Year of Publication', type: 'number' },
  ],
  'Theses': [
    { key: 'university', label: 'University / Institution', meta: true }, { key: 'publisherName', label: 'Publisher / Repository' },
    { key: 'degree', label: 'Degree Level (PhD, MSc...)', meta: true },
    { key: 'year', label: 'Award Year', type: 'number' }, { key: 'supervisor', label: 'Supervisor / Guide', meta: true },
  ],
  'Conference Proceedings': [
    { key: 'journalName', label: 'Conference Name' }, { key: 'publisherName', label: 'Publisher' },
    { key: 'location', label: 'Location (City / Country)', meta: true },
    { key: 'year', label: 'Conference Year', type: 'number' }, { key: 'sponsor', label: 'Sponsoring Body', meta: true },
  ],
  'Newsletters': [
    { key: 'publisherName', label: 'Organization / Publisher' }, { key: 'volume', label: 'Volume / Issue No.' },
    { key: 'releaseDate', label: 'Release Date', meta: true },
  ],
  'Books': [
    { key: 'publisherName', label: 'Publisher' }, { key: 'isbn', label: 'ISBN-13' },
    { key: 'year', label: 'Publication Year', type: 'number' }, { key: 'edition', label: 'Edition' }, { key: 'pages', label: 'Total Pages' },
  ],
  'Educational Videos': [
    { key: 'publisherName', label: 'Publisher / Producer' },
    { key: 'speaker', label: 'Speaker / Instructor', meta: true }, { key: 'duration', label: 'Duration', meta: true },
    { key: 'year', label: 'Year', type: 'number' },
  ],
};

const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:bg-white focus:border-blue-500 outline-none";

export function ContentSingleEditor({ contentType }: ContentSingleEditorProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isArchived = searchParams.get('src') === 'archived';   // editing a legacy Content record
  const isEditing = id && id !== 'new';
  const slug = contentType.toLowerCase().replace(/\s+/g, '-');
  const kind = contentType === 'Books' ? 'book' : 'article';
  const typeFields = TYPE_FIELDS[contentType] || TYPE_FIELDS['Periodicals'];

  const [loading, setLoading] = useState(!!isEditing);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Record<string, any>>({
    title: '', description: '', authors: '', domain: DOMAINS[0]?.name || '',
    subjectArea: '', fileUrl: '', thumbnailUrl: '', tags: '',
    accessType: 'Subscription', status: 'Published',
  });
  const [chapters, setChapters] = useState<any[]>([]);

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const url = isArchived ? `/api/admin/content/${id}` : `/api/admin/library/items/${kind}/${id}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const item = await res.json();
        if (!res.ok || !item) throw new Error('Not found');
        if (isArchived) {
          // Legacy Content record — generic fields only
          setForm({
            title: item.title || '', description: item.description || '', authors: item.authors || '',
            domain: item.domain || DOMAINS[0]?.name || '', subjectArea: item.subjectArea || '',
            fileUrl: item.fileUrl || '', thumbnailUrl: item.thumbnailUrl || '',
            tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
            accessType: item.accessType || 'Subscription', status: item.status || 'Published',
          });
          setLoading(false);
          return;
        }
        const meta = item.metadata || {};
        const next: Record<string, any> = {
          title: item.title || '', description: item.abstract || item.description || '', authors: item.authors || '',
          domain: item.domain || DOMAINS[0]?.name || '', subjectArea: item.subject || '',
          fileUrl: item.pdfUrl || '', thumbnailUrl: item.coverUrl || meta.thumbnailUrl || '',
          tags: Array.isArray(meta.tags) ? meta.tags.join(', ') : '',
          accessType: item.accessType || 'Subscription', status: item.status || 'Published',
        };
        typeFields.forEach(f => {
          if (f.key === 'issn') next.issn = item.journalIssn || '';
          else if (f.meta) next[f.key] = meta[f.key] ?? '';
          else next[f.key] = item[f.key] ?? '';
        });
        setForm(next);
        if (kind === 'book') setChapters(item.chapters || []);
      } catch {
        toast.error('Failed to load item');
        navigate(`/admin/${slug}`);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim() || !form.authors.trim()) { toast.error('Title and Author(s) are required'); return; }
    setSaving(true);
    try {
      const tagsArr = form.tags.split(',').map((t: string) => t.trim()).filter(Boolean);

      // Editing a legacy Content record → save via the legacy content endpoint (generic fields)
      if (isArchived) {
        const res = await fetch(`/api/admin/content/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({
            contentType, title: form.title, authors: form.authors, description: form.description,
            domain: form.domain, subjectArea: form.subjectArea, fileUrl: form.fileUrl, thumbnailUrl: form.thumbnailUrl,
            accessType: form.accessType, status: form.status, tags: tagsArr,
          }),
        });
        if (!res.ok) throw new Error('Save failed');
        toast.success(`${contentType} updated`);
        navigate(`/admin/${slug}`);
        return;
      }

      const metadata: Record<string, any> = {};
      const cols: Record<string, any> = {};
      typeFields.forEach(f => { if (f.meta) metadata[f.key] = form[f.key] || null; else cols[f.key] = form[f.key] || null; });

      const payload: any = {
        contentType,
        title: form.title, authors: form.authors, description: form.description,
        domain: form.domain, subjectArea: form.subjectArea, fileUrl: form.fileUrl, thumbnailUrl: form.thumbnailUrl,
        accessType: form.accessType, status: form.status,
        tags: tagsArr,
        ...cols, metadata,
      };
      if (kind === 'book') payload.chapters = chapters.filter(c => c.title?.trim());

      const url = isEditing ? `/api/admin/library/items/${kind}/${id}` : '/api/admin/library/items';
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success(`${contentType} ${isEditing ? 'updated' : 'created'} successfully`);
      navigate(`/admin/${slug}`);
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="max-w-3xl space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(`/admin/${slug}`)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={16} /> Back to list
        </button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
          {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
          {isEditing ? 'Save Changes' : `Add ${contentType.replace(/s$/, '')}`}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {/* Basic Info */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Basic Information</h3>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="Enter title..." />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{kind === 'book' ? 'Description' : 'Abstract / Description'}</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className={`${inputCls} resize-y`} placeholder="Brief description or abstract..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Author(s) <span className="text-red-500">*</span></label>
              <input value={form.authors} onChange={e => set('authors', e.target.value)} className={inputCls} placeholder="Dr. John Doe, Jane Smith" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subject Area</label>
              <input value={form.subjectArea} onChange={e => set('subjectArea', e.target.value)} className={inputCls} placeholder="e.g. Cardiology" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5"><Tag size={13} className="inline mr-1" />Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} placeholder="medicine, surgery, research" />
          </div>
        </div>

        {/* Type-specific metadata (new dataset only; legacy Content has no such fields) */}
        {!isArchived && (
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{contentType} Details</h3>
          <div className="grid grid-cols-2 gap-4">
            {typeFields.map(f => (
              <div key={f.key}>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{f.label}</label>
                <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} className={inputCls} placeholder={f.ph || ''} />
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Chapters (Books only) */}
        {!isArchived && kind === 'book' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1"><Layers size={13} /> Chapters</h3>
              <button onClick={() => setChapters(c => [...c, { title: '', authors: '', pdfUrl: '', pages: '' }])}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"><Plus size={14} /> Add Chapter</button>
            </div>
            {chapters.length === 0 && <p className="text-xs text-slate-400">No chapters. Add chapters so readers can open a specific chapter.</p>}
            {chapters.map((ch, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Chapter {i + 1}</span>
                  <button onClick={() => setChapters(c => c.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
                <input value={ch.title} onChange={e => setChapters(c => c.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} className={inputCls} placeholder="Chapter title *" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={ch.authors || ''} onChange={e => setChapters(c => c.map((x, j) => j === i ? { ...x, authors: e.target.value } : x))} className={inputCls} placeholder="Authors" />
                  <input value={ch.pages || ''} onChange={e => setChapters(c => c.map((x, j) => j === i ? { ...x, pages: e.target.value } : x))} className={inputCls} placeholder="Pages" />
                  <input value={ch.pdfUrl || ''} onChange={e => setChapters(c => c.map((x, j) => j === i ? { ...x, pdfUrl: e.target.value } : x))} className={inputCls} placeholder="Chapter PDF URL" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Classification */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Classification</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Domain <span className="text-red-500">*</span></label>
              <select value={form.domain} onChange={e => set('domain', e.target.value)} className={inputCls}>
                {DOMAINS.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Publish Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                <option value="Published">Published</option>
                <option value="Draft">Draft (Hidden)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Access */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Access</h3>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Access Type</label>
            <select value={form.accessType} onChange={e => set('accessType', e.target.value)} className={inputCls}>
              <option value="OpenAccess">Open Access (Free)</option>
              <option value="Subscription">Requires Subscription</option>
            </select>
          </div>
        </div>

        {/* Files */}
        <div className="p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Files & Media</h3>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5"><UploadCloud size={13} className="inline mr-1" />{kind === 'book' ? 'Book PDF URL (optional if chapters)' : 'Document / PDF URL'}</label>
            <input value={form.fileUrl} onChange={e => set('fileUrl', e.target.value)} className={inputCls} placeholder="https://... (PDF, S3 link)" />
            <p className="text-xs text-slate-400 mt-1">Direct link to the open-access PDF.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Thumbnail / Cover URL</label>
            <div className="flex items-center gap-3">
              <input value={form.thumbnailUrl} onChange={e => set('thumbnailUrl', e.target.value)} className={`flex-1 ${inputCls}`} placeholder="https://..." />
              {form.thumbnailUrl && <img src={form.thumbnailUrl} alt="thumb" className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
