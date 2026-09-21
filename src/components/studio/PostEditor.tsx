import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Strikethrough, Code, Heading2, Heading3, List, ListOrdered,
  Quote, Minus, Link2, Image as ImageIcon, Undo2, Redo2, Loader2, Eye, Send, Trash2, ArrowLeft,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { DOMAINS } from '../../constants';

/**
 * Writing a post.
 *
 * The body is a rich editor rather than a textarea of HTML, because the people
 * writing here are not going to hand-write markup — but what it produces is
 * cleaned on the server before it is stored, so a paste from Word cannot carry
 * a script in with it.
 *
 * Everything that decides how the post looks to a stranger — the excerpt, the
 * picture, the search-engine lines — sits beside the writing rather than behind
 * a settings tab, because a post published without them is the normal outcome
 * of hiding them.
 */

const CATEGORIES = ['Library updates', 'Research', 'How to', 'For librarians', 'For students', 'Announcements'];
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const jsonHeaders = () => ({ ...authHeader(), 'Content-Type': 'application/json' });

export function PostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [post, setPost] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [category, setCategory] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [coverTarget, setCoverTarget] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Write the post here…' }),
    ],
    content: '',
    onUpdate: () => setDirty(true),
    editorProps: {
      attributes: {
        class: 'prose-editor min-h-[420px] px-5 py-4 outline-none',
      },
    },
  });

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/studio/posts/${id}`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        setPost(d);
        setTitle(d.title || '');
        setExcerpt(d.excerpt || '');
        setCoverUrl(d.coverUrl || '');
        setCategory(d.category || '');
        setDomains(Array.isArray(d.domains) ? d.domains : []);
        setSeoTitle(d.seoTitle || '');
        setSeoDescription(d.seoDescription || '');
        editor?.commands.setContent(d.body || '');
      })
      .catch(() => toast.error('Could not open that post'));
  }, [id, isNew, editor]);

  const payload = useCallback(() => ({
    title, excerpt, coverUrl: coverUrl || null, category: category || null,
    domains, seoTitle, seoDescription, body: editor?.getHTML() || '',
  }), [title, excerpt, coverUrl, category, domains, seoTitle, seoDescription, editor]);

  const save = useCallback(async (quiet = false) => {
    if (!title.trim()) { if (!quiet) toast.error('Give the post a title first'); return null; }
    setSaving(true);
    try {
      const r = await fetch(isNew ? '/api/studio/posts' : `/api/studio/posts/${id}`, {
        method: isNew ? 'POST' : 'PUT', headers: jsonHeaders(), body: JSON.stringify(payload()),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save');
      setPost(d);
      setDirty(false);
      setSavedAt(new Date().toISOString());
      if (isNew) navigate(`/studio/posts/${d.id}`, { replace: true });
      if (!quiet) toast.success('Saved');
      return d;
    } catch (e: any) {
      if (!quiet) toast.error(e.message || 'Could not save');
      return null;
    } finally {
      setSaving(false);
    }
  }, [isNew, id, payload, navigate, title]);

  // A post being written for twenty minutes should not be lost to a closed tab.
  useEffect(() => {
    if (!dirty || isNew || !title.trim()) return;
    const t = setTimeout(() => { save(true); }, 4000);
    return () => clearTimeout(t);
  }, [dirty, isNew, title, save]);

  const publish = async (on: boolean) => {
    const saved = await save(true);
    const postId = saved?.id || post?.id;
    if (!postId) { toast.error('Give the post a title and save it first'); return; }
    const r = await fetch(`/api/studio/posts/${postId}/status`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ publish: on }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error || 'Could not do that'); return; }
    setPost(d);
    toast.success(on ? 'Published — it is on the site now' : 'Taken down — it is a draft again');
  };

  const remove = async () => {
    if (!post?.id || !window.confirm('Delete this post? This cannot be undone.')) return;
    const r = await fetch(`/api/studio/posts/${post.id}`, { method: 'DELETE', headers: authHeader() });
    if (!r.ok) { toast.error('Could not delete'); return; }
    toast.success('Deleted');
    navigate('/studio');
  };

  /** A picture, straight into the body — or as the post's cover. */
  const upload = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { toast.error('That picture is over 8 MB — use a smaller one'); return; }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const r = await fetch('/api/admin/media', {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ dataUrl, filename: file.name, title: file.name, folder: 'blog' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      if (coverTarget) { setCoverUrl(d.url); setDirty(true); }
      else editor?.chain().focus().setImage({ src: d.url, alt: file.name }).run();
      toast.success('Picture added');
    } catch (e: any) {
      toast.error(e.message || 'Could not upload that');
    } finally {
      setUploading(false);
      setCoverTarget(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const published = post?.status === 'Published';
  const Btn = ({ on, onClick, title: t, children }: { on?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" title={t} onClick={onClick}
      className={`rounded-lg p-2 transition-colors ${on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2'}`}>
      {children}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <input ref={fileInput} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />

      {/* What it is, and what to do with it */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/studio')} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink">
          <ArrowLeft size={15} /> All posts
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-faint">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          {post?.slug && (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-rule px-3 py-2 text-[13px] font-semibold text-ink-2 hover:bg-surface-2">
              <Eye size={14} /> {published ? 'View' : 'Preview'}
            </a>
          )}
          <button onClick={() => save()} disabled={saving}
            className="rounded-xl border border-rule px-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-50">
            Save draft
          </button>
          <button onClick={() => publish(!published)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white ${
              published ? 'bg-ink hover:opacity-90' : 'bg-accent hover:bg-accent-hover'}`}>
            <Send size={14} /> {published ? 'Take down' : 'Publish'}
          </button>
          {post?.id && (
            <button onClick={remove} title="Delete" className="rounded-xl border border-rule p-2 text-alarm hover:bg-alarm-soft">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {published && (
        <p className="mt-3 rounded-xl bg-accent-soft px-4 py-2.5 text-[12.5px] text-accent">
          Live at <b>/blog/{post.slug}</b> — published {post.publishedAt ? new Date(post.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
          {post.publishedBy ? ` by ${post.publishedBy}` : ''}. Saving now changes what readers see.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* The writing */}
        <div className="min-w-0">
          <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}
            placeholder="The title"
            className="w-full rounded-t-2xl border border-rule bg-surface px-5 py-4 font-serif text-[26px] text-ink outline-none placeholder:text-faint focus:border-accent" />

          <div className="flex flex-wrap items-center gap-0.5 border-x border-rule bg-surface px-3 py-2">
            <Btn title="Bold" on={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></Btn>
            <Btn title="Italic" on={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></Btn>
            <Btn title="Strikethrough" on={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></Btn>
            <span className="mx-1 h-5 w-px bg-rule" />
            <Btn title="Heading" on={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Btn>
            <Btn title="Sub-heading" on={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></Btn>
            <Btn title="Bulleted list" on={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></Btn>
            <Btn title="Numbered list" on={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>
            <Btn title="Quote" on={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={16} /></Btn>
            <Btn title="Code" on={editor?.isActive('code')} onClick={() => editor?.chain().focus().toggleCode().run()}><Code size={16} /></Btn>
            <Btn title="Line" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus size={16} /></Btn>
            <span className="mx-1 h-5 w-px bg-rule" />
            <Btn title="Link" on={editor?.isActive('link')} onClick={() => {
              const href = window.prompt('Link to where?', editor?.getAttributes('link').href || 'https://');
              if (href === null) return;
              if (!href.trim()) { editor?.chain().focus().unsetLink().run(); return; }
              editor?.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
            }}><Link2 size={16} /></Btn>
            <Btn title="Picture" onClick={() => { setCoverTarget(false); fileInput.current?.click(); }}>
              {uploading && !coverTarget ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
            </Btn>
            <span className="mx-1 h-5 w-px bg-rule" />
            <Btn title="Undo" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></Btn>
            <Btn title="Redo" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></Btn>
          </div>

          <div className="rounded-b-2xl border border-rule bg-surface">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* How it looks to a stranger */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-rule bg-surface p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Cover picture</p>
            <div className="mt-2 overflow-hidden rounded-xl border border-rule bg-surface-2">
              {coverUrl
                ? <img src={coverUrl} alt="" className="h-36 w-full object-cover" />
                : <div className="flex h-36 items-center justify-center text-[12px] text-faint">None yet</div>}
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => { setCoverTarget(true); fileInput.current?.click(); }}
                className="flex-1 rounded-lg border border-rule px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-surface-2">
                {uploading && coverTarget ? 'Uploading…' : coverUrl ? 'Change' : 'Add a picture'}
              </button>
              {coverUrl && (
                <button onClick={() => { setCoverUrl(''); setDirty(true); }}
                  className="rounded-lg border border-rule px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-surface-2">Remove</button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-rule bg-surface p-4">
            <label className="block">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">The line under the title</span>
              <textarea value={excerpt} onChange={e => { setExcerpt(e.target.value); setDirty(true); }} rows={3}
                placeholder="One or two sentences. Shown on the blog list and in search results."
                className="mt-1.5 w-full rounded-xl border border-rule bg-ground p-3 text-[13px] outline-none focus:border-accent" />
            </label>

            <label className="mt-3 block">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Category</span>
              <select value={category} onChange={e => { setCategory(e.target.value); setDirty(true); }}
                className="mt-1.5 w-full rounded-xl border border-rule bg-ground p-2.5 text-[13px] outline-none focus:border-accent">
                <option value="">None</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {/* The part that sends a reader into the library */}
          <div className="rounded-2xl border border-rule bg-surface p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Departments this is about</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Readers who finish the post are shown what the library holds in these.
            </p>
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
              {DOMAINS.map((d: any) => (
                <label key={d.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] text-ink-2 hover:bg-surface-2">
                  <input type="checkbox" checked={domains.includes(d.name)}
                    onChange={e => {
                      setDomains(v => e.target.checked ? [...v, d.name].slice(0, 6) : v.filter(x => x !== d.name));
                      setDirty(true);
                    }} />
                  {d.name}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-rule bg-surface p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">In Google</p>
            <input value={seoTitle} onChange={e => { setSeoTitle(e.target.value); setDirty(true); }}
              placeholder={title || 'Title shown in search'} maxLength={120}
              className="mt-2 w-full rounded-xl border border-rule bg-ground p-2.5 text-[12.5px] outline-none focus:border-accent" />
            <textarea value={seoDescription} onChange={e => { setSeoDescription(e.target.value); setDirty(true); }} rows={3}
              placeholder={excerpt || 'The two lines Google shows under the title'} maxLength={300}
              className="mt-2 w-full rounded-xl border border-rule bg-ground p-2.5 text-[12.5px] outline-none focus:border-accent" />
            <p className="mt-2 text-[11px] text-faint">Left blank, the title and the line above are used.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
