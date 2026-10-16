import React, { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { ImageOff, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { Button, friendlyError } from '../ui';
import {
  COVER_ACCEPT, COVER_ALT_MAX, COVER_MAX_MB, COVER_RECOMMENDED, COVER_SOFT_MESSAGE, LEGACY_COVER_MESSAGE,
  checkCoverImage, checkCoverSize, cleanAlt, failed, isOffRatio, isSoft,
} from '../../lib/blogCover';

/**
 * The cover picture of a post.
 *
 * It sits first in the settings rail because a post without one is the normal
 * outcome of putting it anywhere else. It is required to publish — the editor
 * and the server both enforce that — but never to save a draft.
 *
 * A file is checked here before it travels (size, then its own bytes) and again
 * on the server, which does not take the browser's word for anything.
 */

export type CoverPanelHandle = { focus: () => void };

type Props = {
  coverUrl: string;
  alt: string;
  postTitle: string;
  /** A live post that has no usable cover: it gets the explanation, not an error. */
  legacy: boolean;
  /** Set when a publish or a save of a live post was refused for want of a cover. */
  error?: string;
  /** A picture was stored. `alt` is what the alt field should now say. */
  onUploaded: (url: string, alt: string) => void;
  onRemove: () => void;
  onAlt: (alt: string) => void;
  /** The address is set but the picture does not load; the editor treats that as no cover. */
  onBrokenChange: (broken: boolean) => void;
};

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result));
  fr.onerror = () => reject(new Error('Could not read that file'));
  fr.readAsDataURL(file);
});

export const CoverImagePanel = forwardRef<CoverPanelHandle, Props>(function CoverImagePanel(
  { coverUrl, alt, postTitle, legacy, error, onUploaded, onRemove, onAlt, onBrokenChange }, ref,
) {
  const uid = useId();
  const headingId = `${uid}-h`, hintId = `${uid}-hint`, errorId = `${uid}-err`, altId = `${uid}-alt`, altHelpId = `${uid}-alt-help`;
  const section = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const action = useRef<HTMLButtonElement>(null);

  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  // Said aloud to screen readers; sighted writers see the preview appear. (A toast would sit on top of Publish.)
  const [announce, setAnnounce] = useState('');

  useImperativeHandle(ref, () => ({
    focus() {
      section.current?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      action.current?.focus({ preventScroll: true });
    },
  }));

  // A new address starts afresh: it has not failed, and its size is not known yet.
  useEffect(() => {
    setBroken(false);
    setDims(null);
    onBrokenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverUrl]);

  const choose = () => picker.current?.click();

  const take = async (file: File) => {
    setFileError(null);
    setAnnounce('');
    // Size first, so a huge file is refused before it is read into memory.
    const tooBig = checkCoverSize(file.size);
    if (tooBig) { setFileError(tooBig.message); return; }
    setUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkCoverImage(bytes, file.type);
      if (failed(check)) { setFileError(check.message); return; }

      const r = await fetch('/api/studio/cover', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: await readAsDataUrl(file), filename: file.name, altText: cleanAlt(alt) || cleanAlt(postTitle) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFileError(friendlyError(d, 'Could not upload that image. Please try again.')); return; }

      setDims({ w: check.info.width, h: check.info.height });
      onUploaded(d.url, cleanAlt(alt) || cleanAlt(postTitle));
      setAnnounce('Cover image added.');
    } catch (e) {
      setFileError(friendlyError(e, 'Could not upload that image. Please try again.'));
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) take(file);
  };
  const dropProps = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); },
    onDrop,
  };

  const shown = !!coverUrl;
  const soft = dims ? isSoft(dims.w, dims.h) : false;
  const offRatio = dims ? isOffRatio(dims.w, dims.h) : false;
  const message = fileError || error || '';
  const describedBy = [hintId, message ? errorId : ''].filter(Boolean).join(' ');

  return (
    <section ref={section} aria-labelledby={headingId} id="cover-image"
      className={`card p-4 ${error ? 'ring-2 ring-alarm/60' : ''}`}>
      <input ref={picker} type="file" accept={COVER_ACCEPT} className="hidden" tabIndex={-1} aria-hidden="true"
        onChange={e => { const f = e.target.files?.[0]; if (f) take(f); }} />

      <p role="status" className="sr-only">{announce}</p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id={headingId} className="field-label">
          Cover image <span className="req" aria-hidden="true">*</span>
        </h2>
        <span className="text-xs font-medium text-muted">Required to publish</span>
      </div>

      {legacy && !error && (
        <p className="mt-2 rounded-lg bg-caution-soft px-3 py-2 text-[13px] leading-snug text-caution" role="note">
          <b className="font-semibold">Cover image required.</b>{' '}
          {LEGACY_COVER_MESSAGE.replace('Cover image required. ', '')}
        </p>
      )}

      <div className="mt-2" {...dropProps}>
        {!shown ? (
          <button ref={action} type="button" onClick={choose} disabled={uploading}
            aria-describedby={describedBy} aria-invalid={error ? true : undefined}
            className={`flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-center transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-wait
              ${dragging ? 'border-accent bg-accent-soft' : error ? 'border-alarm bg-alarm-soft' : 'border-rule-2 bg-surface-2 hover:border-accent hover:bg-accent-soft'}`}>
            {uploading
              ? <><Loader2 size={22} className="animate-spin text-accent" aria-hidden="true" /><span className="text-sm font-medium text-ink">Uploading…</span></>
              : <>
                  <UploadCloud size={22} className={error ? 'text-alarm' : 'text-accent'} aria-hidden="true" />
                  <span className="text-sm font-medium text-ink">{dragging ? 'Drop to upload' : 'Drop image here'}</span>
                  <span className="text-[13px] text-ink-2">or <span className="font-semibold text-accent underline underline-offset-2">Upload image</span></span>
                </>}
          </button>
        ) : (
          <div className={`relative aspect-video overflow-hidden rounded-lg border bg-surface-2 ${dragging ? 'border-accent ring-2 ring-accent' : 'border-rule'}`}>
            <img key={coverUrl} src={coverUrl} alt={alt ? `Cover preview: ${alt}` : 'Cover preview'}
              className={`h-full w-full object-cover ${broken ? 'hidden' : ''}`}
              onLoad={e => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (!w || !h) { setBroken(true); onBrokenChange(true); return; }
                setBroken(false); onBrokenChange(false); setDims({ w, h });
              }}
              onError={() => { setBroken(true); onBrokenChange(true); }} />
            {broken && (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
                <ImageOff size={22} className="text-muted" aria-hidden="true" />
                <p className="text-sm font-medium text-ink">Cover image unavailable — replace image</p>
                <p className="text-[13px] text-muted">The saved address is kept until you replace it. Nothing was changed on the post.</p>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/80 text-sm font-medium text-ink" role="status">
                <Loader2 size={18} className="animate-spin text-accent" aria-hidden="true" /> Uploading…
              </div>
            )}
          </div>
        )}
      </div>

      {shown && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button ref={action} variant="outline" size="sm" onClick={choose} disabled={uploading} aria-describedby={describedBy}>
            <RefreshCw size={14} aria-hidden="true" /> Replace image
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={uploading}>
            <Trash2 size={14} aria-hidden="true" /> Remove
          </Button>
        </div>
      )}

      <div id={hintId} className="mt-3 text-[13px] leading-snug text-muted">
        <p>
          Recommended: {COVER_RECOMMENDED.width} × {COVER_RECOMMENDED.height} (16:9)
        </p>
        <p>JPG, PNG or WebP · Maximum {COVER_MAX_MB} MB</p>
      </div>

      {message && (
        <p id={errorId} role="alert" className="field-error mt-2 flex items-start gap-1.5">
          <span aria-hidden="true">⚠</span><span>{message}</span>
        </p>
      )}

      {shown && !broken && (soft || offRatio) && (
        <div className="mt-2 space-y-1 text-[13px] leading-snug text-caution" role="status">
          {soft && <p>{COVER_SOFT_MESSAGE}</p>}
          {offRatio && <p>This image isn’t 16:9, so its edges will be trimmed (centred) to fit.</p>}
        </div>
      )}

      {shown && (
        <div className="field mt-4">
          <label htmlFor={altId} className="field-label">Image alt text</label>
          <input id={altId} value={alt} onChange={e => onAlt(e.target.value)} maxLength={COVER_ALT_MAX}
            placeholder={postTitle || 'Describe the picture'} aria-describedby={altHelpId} className="input" />
          <p id={altHelpId} className="field-help mt-1">
            Describe the picture for readers who can’t see it. Not the file name.
          </p>
        </div>
      )}
    </section>
  );
});
