import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Copy, Check, ExternalLink, FileText, BookOpen, Unlock, Lock,
  Tag, Info, Quote,
} from 'lucide-react';

/**
 * Full-metadata popup for library entries.
 *
 * Used mainly for records that have rich metadata but no PDF — there is nothing to
 * open in the viewer, so the card offers "Read More" and everything we know about
 * the record is shown here instead.
 *
 * Accepts a row from any of the three shapes the library serves:
 *   - Article  (/api/library/articles)
 *   - Book     (/api/library/books)
 *   - Content  (/api/content/list — legacy "Archived" collection)
 */

type Props = {
  item: any;
  isBook?: boolean;
  onClose: () => void;
  /** Rendered only when the record actually has a file to open. */
  onOpen?: () => void;
};

// metadata is a Json column — it can arrive as an object or as a stringified object.
const parseMeta = (m: any): Record<string, any> => {
  if (!m) return {};
  if (typeof m === 'string') { try { return JSON.parse(m) || {}; } catch { return {}; } }
  return typeof m === 'object' && !Array.isArray(m) ? m : {};
};

const toList = (v: any): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) { try { return toList(JSON.parse(s)); } catch { /* fall through */ } }
    return s.split(',').map(x => x.trim()).filter(Boolean);
  }
  return [];
};

// Keys already rendered as first-class fields, or that are plumbing rather than metadata.
const META_SKIP = new Set(['tags', 'keywords', 'thumbnailUrl', 'coverUrl', 'fingerprint']);

const labelize = (k: string) =>
  k.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()).trim();

export function MetadataModal({ item, isBook = false, onClose, onOpen }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const meta = useMemo(() => parseMeta(item?.metadata), [item]);
  const book = isBook || item?.contentType === 'Books';

  const abstract: string = item?.abstract || item?.description || '';
  const keywords = useMemo(() => {
    const merged = [...toList(meta.keywords), ...toList(meta.tags), ...toList(item?.tags)];
    return [...new Set(merged)];
  }, [meta, item]);

  const authors = toList(item?.authors);
  const hasFile = !!(item?.pdfUrl || item?.fileUrl);
  const isOA = ['OpenAccess', 'Free', 'Open'].includes(item?.accessType);
  const doi: string = item?.doi || '';
  const doiUrl = doi ? (/^https?:\/\//i.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`) : '';

  // Where the reader actually goes when the file is not ours to serve.
  //
  // Most books in the catalogue are like this, and by nature rather than by
  // omission: DOAB, which supplies them, holds no book file at all — only a
  // cover and the metadata — so the book lives with its publisher and this link
  // is the entire point of the record. Without it the popup ended on "cite using
  // the details above", which is a dead end dressed up as an answer.
  const linkOut: string = item?.originalUrl || doiUrl || '';
  const cover: string = book ? (item?.coverUrl || meta.coverUrl || '') : '';
  const [coverBroken, setCoverBroken] = useState(false);

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1600);
    }).catch(() => { });
  };

  // Ordered label/value pairs — empty ones are dropped before render.
  const fields: [string, any][] = book
    ? [
      ['Publisher', item?.publisherName],
      ['ISBN', item?.isbn],
      ['Edition', item?.edition],
      ['Year', item?.year],
      ['Pages', item?.pages],
      ['Department', item?.domain],
      ['Subject', item?.subject || item?.subjectArea],
      ['Language', item?.language],
      ['Country', item?.country],
      ['Licence', item?.licence],
      ['Chapters', Array.isArray(item?.chapters) && item.chapters.length ? item.chapters.length : null],
    ]
    : [
      ['Journal', item?.journalName || item?.journal?.title],
      ['ISSN', item?.journalIssn || item?.journal?.issn || item?.issn],
      ['e-ISSN', item?.journal?.eissn],
      ['Publisher', item?.publisherName || item?.journal?.publisherName],
      ['Volume', item?.volume],
      ['Issue', item?.issue],
      ['Pages', item?.pages],
      ['Year', item?.year],
      ['Department', item?.domain],
      ['Subject', item?.subject || item?.subjectArea || item?.journal?.subject],
      ['Language', item?.language],
      ['Country', item?.country],
      ['Licence', item?.licence],
      ['Content Type', item?.contentType],
    ];
  const shown = fields.filter(([, v]) => v !== null && v !== undefined && v !== '');

  // Anything type-specific the ingest/import kept in metadata (hospital, degree, speaker…).
  const extras = Object.entries(meta)
    .filter(([k, v]) => !META_SKIP.has(k) && v !== null && v !== undefined && v !== '' && typeof v !== 'object');

  const citation = book
    ? [item?.publisherName, item?.edition ? `${item.edition} ed.` : '', item?.year].filter(Boolean).join(' · ')
    : [item?.journalName || item?.journal?.title, item?.volume ? `Vol. ${item.volume}` : '', item?.issue ? `No. ${item.issue}` : '',
    item?.pages ? `pp. ${item.pages}` : '', item?.year].filter(Boolean).join(' · ');

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="metadata-modal-title"
    >
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-rule bg-surface shadow-2xl sm:max-h-[88vh] sm:max-w-3xl sm:rounded-2xl">

        {/* header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="badge badge-accent">
              {book ? 'Book' : (item?.contentType || 'Journal Article')}
            </span>
            {isOA
              ? <span className="badge badge-success"><Unlock size={12} aria-hidden="true" />Open Access</span>
              : <span className="badge badge-caution"><Lock size={12} aria-hidden="true" />Subscription</span>}
            {!hasFile && <span className="badge badge-neutral">Metadata Only</span>}
            {item?.domain && <span className="badge badge-neutral max-w-full truncate">{item.domain}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" autoFocus
            className="btn btn-ghost btn-sm btn-icon -mr-2 shrink-0 text-muted">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* body */}
        <div className="space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="flex gap-4">
            {cover && !coverBroken && (
              <img src={cover} alt="" loading="lazy" onError={() => setCoverBroken(true)}
                className="h-28 w-20 shrink-0 rounded-md border border-rule object-cover sm:h-32 sm:w-22" />
            )}
            <div className="min-w-0 flex-1">
            <h2 id="metadata-modal-title" className="break-words text-lg font-bold leading-snug text-ink sm:text-xl">
              {book ? <BookOpen size={16} className="mr-1.5 -mt-1 inline text-accent" aria-hidden="true" /> : <FileText size={16} className="mr-1.5 -mt-1 inline text-accent" aria-hidden="true" />}
              {item?.title || 'Untitled'}
            </h2>
            {authors.length > 0 && (
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                {authors.map((a, i) => (
                  <span key={i}><span className="font-medium text-ink">{a}</span>{i < authors.length - 1 ? ', ' : ''}</span>
                ))}
              </p>
            )}
            {citation && <p className="mt-1 text-xs italic text-muted">{citation}</p>}
            </div>
          </div>

          {abstract ? (
            <Section icon={<Quote size={14} />} title="Abstract">
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{abstract}</p>
            </Section>
          ) : (
            <Section icon={<Quote size={14} />} title="Abstract">
              <p className="text-sm italic text-muted">No abstract available for this record.</p>
            </Section>
          )}

          {keywords.length > 0 && (
            <Section icon={<Tag size={14} />} title="Keywords &amp; Tags">
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k, i) => (
                  <span key={i} className="badge badge-neutral max-w-full truncate">{k}</span>
                ))}
              </div>
            </Section>
          )}

          {shown.length > 0 && (
            <Section icon={<Info size={14} />} title="Bibliographic Details">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {shown.map(([label, value]) => (
                  <Row key={label} label={label} value={String(value)} />
                ))}
              </dl>
            </Section>
          )}

          {doi && (
            <Section icon={<ExternalLink size={14} />} title="DOI">
              <div className="flex flex-wrap items-center gap-2">
                <a href={doiUrl} target="_blank" rel="noopener noreferrer"
                  className="break-all font-mono text-sm text-accent hover:underline">{doi}</a>
                <button type="button" onClick={() => copy(doi, 'doi')} aria-label={copied === 'doi' ? 'DOI copied' : 'Copy DOI'}
                  className="btn btn-outline btn-sm">
                  {copied === 'doi' ? <><Check size={14} aria-hidden="true" /> Copied</> : <><Copy size={14} aria-hidden="true" /> Copy</>}
                </button>
              </div>
            </Section>
          )}

          {extras.length > 0 && (
            <Section icon={<Info size={14} />} title="Additional Details">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {extras.map(([k, v]) => <Row key={k} label={labelize(k)} value={String(v)} />)}
              </dl>
            </Section>
          )}

          {book && Array.isArray(item?.chapters) && item.chapters.length > 0 && (
            <Section icon={<BookOpen size={14} />} title={`Chapters (${item.chapters.length})`}>
              <ul className="space-y-1.5">
                {item.chapters.map((ch: any, i: number) => (
                  <li key={ch.id || i} className="flex gap-2 text-sm text-ink-2">
                    <span className="shrink-0 tabular-nums text-muted">{ch.chapterNumber ?? i + 1}.</span>
                    <span className="min-w-0 break-words">{ch.title}{ch.pages ? <span className="text-muted"> · pp. {ch.pages}</span> : null}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* footer */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-rule bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted">
            {hasFile ? 'Full text available in the secure viewer.'
              : linkOut ? 'Not hosted here — the full text opens at the publisher.'
              : 'Full text not hosted — cite using the details above.'}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-outline btn-sm">
              Close
            </button>
            {hasFile && onOpen && (
              <button type="button" onClick={onOpen} className="btn btn-primary btn-sm">
                Read Full Text
              </button>
            )}
            {!hasFile && linkOut && (
              <a href={linkOut} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                <ExternalLink size={14} aria-hidden="true" /> Read at publisher
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── small helpers ─────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"><span aria-hidden="true" className="inline-flex">{icon}</span> {title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-28 shrink-0 text-xs font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}
