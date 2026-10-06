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
import { Button, buttonClass, friendlyError } from '../ui';

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

/** A toolbar button. `on` is passed only for toggles (bold, lists…), which then
    announce whether they are pressed; one-shot actions (undo, line) leave it out. */
function ToolButton({ on, onClick, title, children }: { on?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      aria-pressed={on === undefined ? undefined : !!on}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 ${on ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
      {children}
    </button>
  );
}

const ToolDivider = () => <span className="mx-1 h-5 w-px bg-rule" aria-hidden="true" />;

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
      if (!quiet) toast.error(friendlyError(e, 'Could not save'));
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
    if (!r.ok) { toast.error(friendlyError(d, 'Could not do that')); return; }
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
      toast.error(friendlyError(e, 'Could not upload that'));
    } finally {
      setUploading(false);
      setCoverTarget(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const published = post?.status === 'Published';
  // Toggles pass `on` as a boolean even before the editor exists, so they
  // always announce a pressed state.
  const is = (name: string, attrs?: Record<string, any>) => !!editor?.isActive(name, attrs);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-hidden="true" tabIndex={-1}
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />

      {/* What it is, and what to do with it */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/studio')} className={buttonClass('ghost', 'sm', '-ml-3')}>
          <ArrowLeft size={16} aria-hidden="true" /> All posts
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted" aria-live="polite">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          {post?.slug && (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className={buttonClass('outline', 'sm')}>
              <Eye size={16} aria-hidden="true" /> {published ? 'View' : 'Preview'}
            </a>
          )}
          <Button variant="outline" size="sm" onClick={() => save()} disabled={saving}>
            Save draft
          </Button>
          <Button variant={published ? 'secondary' : 'primary'} size="sm" onClick={() => publish(!published)}>
            <Send size={16} aria-hidden="true" /> {published ? 'Take down' : 'Publish'}
          </Button>
          {post?.id && (
            <button onClick={remove} title="Delete" aria-label="Delete post" className={buttonClass('outline', 'sm', 'btn-icon text-alarm')}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {published && (
        <p className="mt-3 rounded-lg bg-accent-soft px-4 py-3 text-sm text-ink-2">
          Live at <b className="text-accent break-all">/blog/{post.slug}</b> — published {post.publishedAt ? new Date(post.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
          {post.publishedBy ? ` by ${post.publishedBy}` : ''}. Saving now changes what readers see.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* The writing */}
        <div className="min-w-0">
          <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}
            placeholder="The title" aria-label="Post title"
            className="w-full rounded-t-xl border border-rule bg-surface px-4 py-4 font-serif text-2xl text-ink outline-none transition-colors placeholder:text-faint focus:border-accent sm:px-5 sm:text-[26px]" />

          <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-x border-rule bg-surface px-2 py-2 sm:px-3">
            <ToolButton title="Bold" on={is('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Italic" on={is('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Strikethrough" on={is('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={16} aria-hidden="true" /></ToolButton>
            <ToolDivider />
            <ToolButton title="Heading" on={is('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Sub-heading" on={is('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Bulleted list" on={is('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Numbered list" on={is('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Quote" on={is('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Code" on={is('code')} onClick={() => editor?.chain().focus().toggleCode().run()}><Code size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Line" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus size={16} aria-hidden="true" /></ToolButton>
            <ToolDivider />
            <ToolButton title="Link" on={is('link')} onClick={() => {
              const href = window.prompt('Link to where?', editor?.getAttributes('link').href || 'https://');
              if (href === null) return;
              if (!href.trim()) { editor?.chain().focus().unsetLink().run(); return; }
              editor?.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
            }}><Link2 size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Picture" onClick={() => { setCoverTarget(false); fileInput.current?.click(); }}>
              {uploading && !coverTarget ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImageIcon size={16} aria-hidden="true" />}
            </ToolButton>
            <ToolDivider />
            <ToolButton title="Undo" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Redo" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} aria-hidden="true" /></ToolButton>
          </div>

          <div className="rounded-b-xl border border-rule bg-surface">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* How it looks to a stranger */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="field-label">Cover picture</h2>
            <div className="mt-2 overflow-hidden rounded-lg border border-rule bg-surface-2">
              {coverUrl
                ? <img src={coverUrl} alt="Cover preview" className="h-36 w-full object-cover" />
                : <div className="flex h-36 items-center justify-center text-sm text-muted">None yet</div>}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setCoverTarget(true); fileInput.current?.click(); }}>
                {uploading && coverTarget ? 'Uploading…' : coverUrl ? 'Change' : 'Add a picture'}
              </Button>
              {coverUrl && (
                <Button variant="ghost" size="sm" onClick={() => { setCoverUrl(''); setDirty(true); }}>Remove</Button>
              )}
            </div>
          </div>

          <div className="card p-4 space-y-4">
            <div className="field">
              <label htmlFor="post-excerpt" className="field-label">The line under the title</label>
              <textarea id="post-excerpt" value={excerpt} onChange={e => { setExcerpt(e.target.value); setDirty(true); }} rows={3}
                placeholder="One or two sentences. Shown on the blog list and in search results."
                className="input" />
            </div>

            <div className="field">
              <label htmlFor="post-category" className="field-label">Category</label>
              <select id="post-category" value={category} onChange={e => { setCategory(e.target.value); setDirty(true); }}
                className="input">
                <option value="">None</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* The part that sends a reader into the library */}
          <fieldset className="card p-4">
            <legend className="sr-only">Departments this is about</legend>
            <p className="field-label" aria-hidden="true">Departments this is about</p>
            <p className="field-help mt-1">
              Readers who finish the post are shown what the library holds in these.
            </p>
            <div className="mt-2 max-h-44 space-y-0.5 overflow-y-auto">
              {DOMAINS.map((d: any) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-accent" checked={domains.includes(d.name)}
                    onChange={e => {
                      setDomains(v => e.target.checked ? [...v, d.name].slice(0, 6) : v.filter(x => x !== d.name));
                      setDirty(true);
                    }} />
                  {d.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="card p-4 space-y-3">
            <h2 className="field-label">In Google</h2>
            <div className="field">
              <label htmlFor="post-seo-title" className="field-help">Search title</label>
              <input id="post-seo-title" value={seoTitle} onChange={e => { setSeoTitle(e.target.value); setDirty(true); }}
                placeholder={title || 'Title shown in search'} maxLength={120}
                className="input" />
            </div>
            <div className="field">
              <label htmlFor="post-seo-description" className="field-help">Search description</label>
              <textarea id="post-seo-description" value={seoDescription} onChange={e => { setSeoDescription(e.target.value); setDirty(true); }} rows={3}
                placeholder={excerpt || 'The two lines Google shows under the title'} maxLength={300}
                className="input" />
            </div>
            <p className="field-help">Left blank, the title and the line above are used.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
