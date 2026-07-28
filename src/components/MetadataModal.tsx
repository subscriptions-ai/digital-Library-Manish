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
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Record details"
    >
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">

        {/* header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {book ? 'Book' : (item?.contentType || 'Journal Article')}
            </Pill>
            {isOA
              ? <Pill className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><Unlock size={9} className="inline -mt-0.5 mr-0.5" />Open Access</Pill>
              : <Pill className="bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Lock size={9} className="inline -mt-0.5 mr-0.5" />Subscription</Pill>}
            {!hasFile && <Pill className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Metadata Only</Pill>}
            {item?.domain && <Pill className="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{item.domain}</Pill>}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <h2 className="text-lg sm:text-xl font-black leading-snug text-slate-900 dark:text-white">
              {book ? <BookOpen size={16} className="inline -mt-1 mr-1.5 text-indigo-500" /> : <FileText size={16} className="inline -mt-1 mr-1.5 text-emerald-500" />}
              {item?.title || 'Untitled'}
            </h2>
            {authors.length > 0 && (
              <p className="text-[13px] mt-2 text-slate-600 dark:text-slate-300 leading-relaxed">
                {authors.map((a, i) => (
                  <span key={i}><span className="text-blue-700 dark:text-blue-400 font-medium">{a}</span>{i < authors.length - 1 ? ', ' : ''}</span>
                ))}
              </p>
            )}
            {citation && <p className="text-[12px] italic text-slate-500 dark:text-slate-400 mt-1">{citation}</p>}
          </div>

          {abstract ? (
            <Section icon={<Quote size={13} />} title="Abstract">
              <p className="text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">{abstract}</p>
            </Section>
          ) : (
            <Section icon={<Quote size={13} />} title="Abstract">
              <p className="text-[13px] italic text-slate-400">No abstract available for this record.</p>
            </Section>
          )}

          {keywords.length > 0 && (
            <Section icon={<Tag size={13} />} title="Keywords &amp; Tags">
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">{k}</span>
                ))}
              </div>
            </Section>
          )}

          {shown.length > 0 && (
            <Section icon={<Info size={13} />} title="Bibliographic Details">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {shown.map(([label, value]) => (
                  <Row key={label} label={label} value={String(value)} />
                ))}
              </dl>
            </Section>
          )}

          {doi && (
            <Section icon={<ExternalLink size={13} />} title="DOI">
              <div className="flex flex-wrap items-center gap-2">
                <a href={doiUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[13px] font-mono text-blue-700 dark:text-blue-400 hover:underline break-all">{doi}</a>
                <button onClick={() => copy(doi, 'doi')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600">
                  {copied === 'doi' ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
            </Section>
          )}

          {extras.length > 0 && (
            <Section icon={<Info size={13} />} title="Additional Details">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {extras.map(([k, v]) => <Row key={k} label={labelize(k)} value={String(v)} />)}
              </dl>
            </Section>
          )}

          {book && Array.isArray(item?.chapters) && item.chapters.length > 0 && (
            <Section icon={<BookOpen size={13} />} title={`Chapters (${item.chapters.length})`}>
              <ul className="space-y-1.5">
                {item.chapters.map((ch: any, i: number) => (
                  <li key={ch.id || i} className="text-[13px] text-slate-600 dark:text-slate-300 flex gap-2">
                    <span className="text-slate-400 shrink-0">{ch.chapterNumber ?? i + 1}.</span>
                    <span>{ch.title}{ch.pages ? <span className="text-slate-400"> · pp. {ch.pages}</span> : null}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
          <p className="text-[11px] text-slate-400">
            {hasFile ? 'Full text available in the secure viewer.' : 'Full text not hosted — cite using the details above.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="text-xs font-bold px-3.5 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700">
              Close
            </button>
            {hasFile && onOpen && (
              <button onClick={onOpen}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-lg shadow-sm">
                Read Full Text
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── small helpers ─────────
function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${className}`}>{children}</span>;
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">{icon} {title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <dt className="text-[12px] font-semibold text-slate-400 shrink-0 w-28">{label}</dt>
      <dd className="text-[13px] text-slate-700 dark:text-slate-200 min-w-0 break-words">{value}</dd>
    </div>
  );
}
