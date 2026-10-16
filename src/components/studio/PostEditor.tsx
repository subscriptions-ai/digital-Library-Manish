import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Strikethrough, Code, Heading2, Heading3, List, ListOrdered,
  Quote, Minus, Link2, Image as ImageIcon, Undo2, Redo2, Loader2, Eye, Send, Trash2, ArrowLeft, ChevronDown, TriangleAlert,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { DOMAINS } from '../../constants';
import { Button, buttonClass, friendlyError } from '../ui';
import { CoverImagePanel, type CoverPanelHandle } from './CoverImagePanel';
import { publishProblems, cleanAlt, type PublishProblems } from '../../lib/blogCover';

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
/** Notices sit at the bottom here: the top right is where Save, Publish and Take down are. */
const say = {
  success: (m: string) => toast.success(m, { position: 'bottom-center' }),
  error: (m: string) => toast.error(m, { position: 'bottom-center' }),
};
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
  const [coverAlt, setCoverAlt] = useState('');
  // The address is set but the picture does not load: as good as no cover.
  const [coverBroken, setCoverBroken] = useState(false);
  // True only when the writer pressed Remove. A cover is cleared by that, and by nothing else: a save that merely has no address in it
  // (a post that had not finished loading) is told by the server to keep the one it has.
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [errors, setErrors] = useState<PublishProblems>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const coverPanel = useRef<CoverPanelHandle>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Write the post here…' }),
    ],
    content: '',
    onUpdate: ({ editor: ed }) => {
      setDirty(true);
      setErrors(prev => (prev.body && ed.getText().trim() ? { ...prev, body: undefined } : prev));
    },
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
        setCoverAlt(d.coverAlt || '');
        setCategory(d.category || '');
        setDomains(Array.isArray(d.domains) ? d.domains : []);
        setSeoTitle(d.seoTitle || '');
        setSeoDescription(d.seoDescription || '');
        // Loading a post is not editing it: no "Unsaved changes", no pointless autosave.
        editor?.commands.setContent(d.body || '', { emitUpdate: false });
      })
      .catch(() => say.error('Could not open that post'));
  }, [id, isNew, editor]);

  const payload = useCallback(() => ({
    title, excerpt, coverUrl: coverUrl || null, coverAlt: coverUrl ? cleanAlt(coverAlt) : null,
    ...(coverRemoved && !coverUrl ? { removeCover: true } : {}),
    category: category || null, domains, seoTitle, seoDescription, body: editor?.getHTML() || '',
  }), [title, excerpt, coverUrl, coverAlt, coverRemoved, category, domains, seoTitle, seoDescription, editor]);

  const published = post?.status === 'Published';
  const hasCover = !!coverUrl.trim() && !coverBroken;

  /** Scroll to the first thing wrong, in the order a reader of the page meets them. */
  const focusFirst = (e: PublishProblems) => {
    if (e.title) { titleInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); titleInput.current?.focus({ preventScroll: true }); }
    else if (e.body) { editor?.commands.focus(); document.getElementById('post-body')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else if (e.cover) { setSettingsOpen(true); coverPanel.current?.focus(); }
  };

  /** What publishing — or saving something already live — would be refused for. */
  const problems = useCallback(
    () => publishProblems({ title, body: editor?.getHTML() || '', hasCover }),
    [title, editor, hasCover],
  );

  // An error goes away the moment what it asked for is done.
  useEffect(() => {
    setErrors(prev => {
      if (!prev.cover && !prev.title) return prev;
      const next = { ...prev };
      if (hasCover) delete next.cover;
      if (title.trim()) delete next.title;
      return next;
    });
  }, [hasCover, title]);

  /** Writes the post as it stands. Whether it may be written is `save`'s question. */
  const persist = useCallback(async (quiet = false) => {
    setSaving(true);
    try {
      const r = await fetch(isNew ? '/api/studio/posts' : `/api/studio/posts/${id}`, {
        method: isNew ? 'POST' : 'PUT', headers: jsonHeaders(), body: JSON.stringify(payload()),
      });
      const d = await r.json();
      if (r.status === 422 && d.fields) {
        if (!quiet) { setErrors(d.fields); focusFirst(d.fields); }
        return null;
      }
      if (!r.ok) throw new Error(d.error || 'Could not save');
      setPost(d);
      setDirty(false);
      setSavedAt(new Date().toISOString());
      if (isNew) navigate(`/studio/posts/${d.id}`, { replace: true });
      if (!quiet) say.success('Saved');
      return d;
    } catch (e: any) {
      if (!quiet) say.error(friendlyError(e, 'Could not save'));
      return null;
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, id, payload, navigate]);

  const save = useCallback(async (quiet = false) => {
    if (!title.trim()) { if (!quiet) say.error('Give the post a title first'); return null; }
    // A draft may be saved half-finished. A live post is on the site as you type,
    // so saving it asks what publishing asks. The automatic save just waits.
    if (published) {
      const found = problems();
      if (Object.keys(found).length) {
        if (!quiet) { setErrors(found); focusFirst(found); }
        return null;
      }
    }
    return persist(quiet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, published, problems, persist]);

  // Leaving with unsaved words is the one way to lose them.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // A post being written for twenty minutes should not be lost to a closed tab.
  useEffect(() => {
    if (!dirty || isNew || !title.trim()) return;
    const t = setTimeout(() => { save(true); }, 4000);
    return () => clearTimeout(t);
  }, [dirty, isNew, title, save]);

  const [publishing, setPublishing] = useState(false);

  const publish = async (on: boolean) => {
    if (publishing) return;
    if (on) {
      const found = problems();
      if (Object.keys(found).length) { setErrors(found); focusFirst(found); return; }
    }
    setPublishing(true);
    try {
      // Taking a post down needs nothing from it, so it must not be held up by
      // the save: the status changes first, and what was typed is kept after.
      const saved = on ? await save(true) : null;
      const postId = saved?.id || post?.id;
      if (!postId) { say.error('Give the post a title and save it first'); return; }
      const r = await fetch(`/api/studio/posts/${postId}/status`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ publish: on }),
      });
      const d = await r.json();
      if (r.status === 422 && d.fields) { setErrors(d.fields); focusFirst(d.fields); return; }
      if (!r.ok) { say.error(friendlyError(d, 'Could not do that')); return; }
      setPost(d);
      setErrors({});
      say.success(on ? 'Published — it is on the site now' : 'Taken down — it is a draft again');
      if (!on && dirty) await persist(true);
    } finally {
      setPublishing(false);
    }
  };

  const remove = async () => {
    if (!post?.id || !window.confirm('Delete this post? This cannot be undone.')) return;
    const r = await fetch(`/api/studio/posts/${post.id}`, { method: 'DELETE', headers: authHeader() });
    if (!r.ok) { say.error('Could not delete'); return; }
    say.success('Deleted');
    navigate('/studio');
  };

  /** A picture, straight into the body. (The cover has its own panel.) */
  const upload = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { say.error('That picture is over 8 MB — use a smaller one'); return; }
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
      editor?.chain().focus().setImage({ src: d.url, alt: '' }).run();
      say.success('Picture added');
    } catch (e: any) {
      say.error(friendlyError(e, 'Could not upload that'));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  // Toggles pass `on` as a boolean even before the editor exists, so they
  // always announce a pressed state.
  const is = (name: string, attrs?: Record<string, any>) => !!editor?.isActive(name, attrs);

  const errorList = (Object.entries(errors) as [keyof PublishProblems, string | undefined][])
    .filter((e): e is [keyof PublishProblems, string] => !!e[1]);
  const savedLabel = saving ? 'Saving…' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : '';

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-hidden="true" tabIndex={-1}
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />

      {/* What it is, and what to do with it. Stays in reach on a long post. */}
      <div className="z-20 -mx-4 border-b border-rule bg-ground/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:sticky md:top-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <button onClick={() => navigate('/studio')} className={buttonClass('ghost', 'sm', '-ml-3')}>
            <ArrowLeft size={16} aria-hidden="true" /> All posts
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" role="status" aria-live="polite">
              {dirty && !saving
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-2.5 py-1 font-semibold text-caution">
                    <span className="h-1.5 w-1.5 rounded-full bg-caution" aria-hidden="true" /> Unsaved changes
                  </span>
                : <span className="text-muted">{savedLabel}</span>}
            </span>
            {post?.slug && (
              <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className={buttonClass('outline', 'sm')}>
                <Eye size={16} aria-hidden="true" /> {published ? 'View' : 'Preview'}
              </a>
            )}
            {published ? (
              <>
                <Button variant="primary" size="sm" onClick={() => save()} loading={saving} disabled={publishing}>
                  Save changes
                </Button>
                <Button variant="secondary" size="sm" onClick={() => publish(false)} loading={publishing} disabled={saving}>
                  Take down
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => save()} loading={saving} disabled={publishing}>
                  Save draft
                </Button>
                <Button variant="primary" size="sm" onClick={() => publish(true)} loading={publishing} disabled={saving}>
                  <Send size={16} aria-hidden="true" /> Publish
                </Button>
              </>
            )}
            {post?.id && (
              <button onClick={remove} title="Delete" aria-label="Delete post" className={buttonClass('outline', 'sm', 'btn-icon text-alarm')}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {published && (
        <p className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm text-ink-2">
          Live at <b className="text-accent break-all">/blog/{post.slug}</b> — published {post.publishedAt ? new Date(post.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
          {post.publishedBy ? ` by ${post.publishedBy}` : ''}. Saving now changes what readers see.
        </p>
      )}

      {errorList.length > 1 && (
        <div role="alert" className="mt-4 rounded-lg border border-alarm bg-alarm-soft px-4 py-3 text-sm text-alarm">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert size={16} aria-hidden="true" /> Fix these {errorList.length} things before publishing
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-9">
            {errorList.map(([k, msg]) => (
              <li key={k}>
                <button type="button" className="text-left underline underline-offset-2 hover:no-underline" onClick={() => focusFirst({ [k]: msg })}>
                  {msg}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* The writing */}
        <div className="min-w-0">
          <input ref={titleInput} value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }}
            placeholder="The title" aria-label="Post title"
            aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? 'post-title-error' : undefined}
            className={`w-full rounded-t-xl border bg-surface px-4 py-4 font-serif text-2xl text-ink outline-none transition-colors placeholder:text-faint focus:border-accent sm:px-5 sm:text-[26px] ${errors.title ? 'border-alarm' : 'border-rule'}`} />
          {errors.title && <p id="post-title-error" className="field-error border-x border-alarm bg-surface px-4 pb-2 sm:px-5">{errors.title}</p>}

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
            <ToolButton title="Picture in the text" onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ImageIcon size={16} aria-hidden="true" />}
            </ToolButton>
            <ToolDivider />
            <ToolButton title="Undo" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} aria-hidden="true" /></ToolButton>
            <ToolButton title="Redo" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} aria-hidden="true" /></ToolButton>
          </div>

          <div id="post-body" className={`rounded-b-xl border bg-surface ${errors.body ? 'border-alarm' : 'border-rule'}`}>
            <EditorContent editor={editor} />
          </div>
          {errors.body && <p role="alert" className="field-error mt-2">{errors.body}</p>}
        </div>

        {/* How it looks to a stranger. On a wide screen it follows you down a long
            post; on a narrow one it simply comes after the writing. */}
        <div className="space-y-4 lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100vh-6rem)] lg:-m-1 lg:overflow-y-auto lg:p-1">
          <CoverImagePanel ref={coverPanel}
            coverUrl={coverUrl} alt={coverAlt} postTitle={title}
            legacy={published && !coverUrl.trim()} error={errors.cover}
            onUploaded={(url, alt) => { setCoverUrl(url); setCoverAlt(alt); setCoverRemoved(false); setDirty(true); }}
            onRemove={() => { setCoverUrl(''); setCoverAlt(''); setCoverRemoved(true); setDirty(true); }}
            onAlt={v => { setCoverAlt(v); setDirty(true); }}
            onBrokenChange={setCoverBroken} />

          {/* Below a laptop the rest folds away, so the picture stays in reach
              without pushing the writing off the screen. */}
          <button type="button" onClick={() => setSettingsOpen(o => !o)} aria-expanded={settingsOpen} aria-controls="post-settings"
            className="btn btn-outline btn-block lg:hidden">
            Post settings
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-150 ${settingsOpen ? 'rotate-180' : ''}`} />
          </button>

          <div id="post-settings" className={`space-y-4 ${settingsOpen ? '' : 'hidden'} lg:block`}>
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
              <div className="mt-2 space-y-0.5">
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
              <p className="field-help">Left blank, the title and the line above are used. The cover image is what appears when the post is shared.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
