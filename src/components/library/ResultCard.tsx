import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Copy, ExternalLink, Lock } from 'lucide-react';
import { Badge, buttonClass, type BadgeTone } from '../ui';
import { SaveButton } from './SaveButton';
import { MetadataModal } from '../MetadataModal';
import { abstractToPlainText } from '../../lib/abstractPreview';
import { availabilityOf, safeExternalUrl, type Availability } from '../../lib/libraryAvailability';

/**
 * One result, as a catalogue record.
 *
 * Reading order, top to bottom: the title, the authors, where it was published (journal or publisher, year, volume or edition), what it is
 * and what department it is in, then what a reader can DO with it. The actions are said in three words and mean three different things:
 *
 *   Read          the full text is held here AND this reader's plan covers it AND the free clock is not shut.
 *   Visit source  not held here; the record names its source's own page, and that address has been checked.
 *   View details  a catalogue entry (or anything the reader cannot open): everything we know about it, in a panel.
 *
 * "Open access" is the SOURCE's statement, shown only when a recorded licence backs it, and it is shown apart from "Full text here". Open at
 * the publisher is not a licence for us to host it, so the two never share a badge.
 *
 * The identifiers (DOI, ISSN/ISBN, pages, source) sit in a compact "More details" line rather than competing with the title.
 *
 * The actions are the LAST line of the card, on the left. The help and feedback buttons are fixed to the bottom-right of the screen, and a
 * Read or Save button at the right edge of a row is exactly where one of them ends up while the list scrolls under it.
 */

export type ResultKind = 'articles' | 'books';
export type ResultMode = 'new' | 'archived';

const AUTHORS_SHOWN = 3;

/** "A. Author, B. Author" or "Author, A.; Author, B." — a semicolon means the names themselves contain commas. */
export function splitAuthors(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const text = abstractToPlainText(raw);
  const parts = text.includes(';') ? text.split(';') : text.split(',');
  return parts.map(s => s.trim()).filter(Boolean);
}

export const ResultCard = React.memo(function ResultCard({ it, n, kind, mode, onOpen, journalBase, lockedLabel }: {
  it: any; n: number; kind: ResultKind; mode: ResultMode; onOpen: () => void; journalBase: string; lockedLabel: string;
}) {
  const isBook = kind === 'books' || it.contentType === 'Books';
  // The server says what the record offers; a row that arrived without that (older cache, another list) is worked out the same way here.
  const fallback = availabilityOf(mode === 'archived' ? 'content' : isBook ? 'book' : 'article', it);
  const availability: Availability = it.availability || fallback.availability;
  const externalUrl: string | null = it.externalUrl ?? fallback.externalUrl;
  const oa = it.sourceOpenAccess || fallback.sourceOpenAccess;
  // `entitled` is false when the plan does not include this department or type; a legacy row that came back locked is the same thing.
  const notInPlan = it.entitled === false || it.locked === true;
  const canRead = availability === 'readable' && !notInPlan;

  const [showMeta, setShowMeta] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allAuthors, setAllAuthors] = useState(false);
  const moreId = useId();
  const authorsId = useId();

  const title: string = abstractToPlainText(it.title) || 'Untitled';
  const authors = splitAuthors(it.authors);
  const shown = allAuthors ? authors : authors.slice(0, AUTHORS_SHOWN);
  const journalKey = it.journalIssn || it.journalId;

  // Volume and issue read as 9(3), the way a citation is written.
  const volIss = it.volume ? `${it.volume}${it.issue ? `(${it.issue})` : ''}` : (it.issue ? `(${it.issue})` : '');
  const bits: string[] = (isBook
    ? [it.publisherName, it.edition ? `${it.edition} ed.` : '', it.year]
    : [it.publisherName && !it.journalName ? it.publisherName : '', it.year, volIss]).filter(Boolean).map(String);

  const details: [string, string][] = ([
    ['DOI', it.doi], ['ISSN', it.journalIssn], ['ISBN', it.isbn], ['Pages', it.pages], ['Language', it.language],
    ['Licence', oa.licence], ['Source', it.source],
  ] as [string, any][]).filter(([, v]) => v).map(([k, v]) => [k, String(v)]);

  const copyDoi = () => {
    if (!it.doi) return;
    navigator.clipboard?.writeText(it.doi);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Content type only says something when it varies. Every article in the new collection is a periodical, so naming it on all of them is noise.
  const typeMark = isBook ? 'Book' : ((mode === 'archived' || (it.contentType && it.contentType !== 'Periodicals')) && it.contentType !== 'Periodicals' ? it.contentType : null);

  const open = canRead ? onOpen : () => setShowMeta(true);
  const titleHint = canRead ? 'Open to read' : 'View details';

  return (
    <article className="group flex gap-3 px-4 py-4 sm:gap-4 sm:px-5" aria-label={title}>
      <span className="tnum hidden shrink-0 pt-1 font-mono text-[11px] text-faint sm:block sm:w-7" aria-hidden="true">{n}</span>

      <div className="min-w-0 flex-1">
        <h3 className="font-serif text-[17px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">
          <button type="button" onClick={open} title={titleHint} className="text-left transition-colors hover:text-accent group-hover:text-accent">{title}</button>
        </h3>

        {authors.length > 0 && (
          <p id={authorsId} className="mt-1 text-[13px] leading-snug text-ink-2 [overflow-wrap:anywhere]">
            {shown.join(' · ')}
            {authors.length > AUTHORS_SHOWN && (
              <button type="button" onClick={() => setAllAuthors(v => !v)} aria-expanded={allAuthors} aria-controls={authorsId}
                className="ml-1.5 font-semibold text-accent hover:underline">
                {allAuthors ? 'Show fewer' : `+${authors.length - AUTHORS_SHOWN} more`}
              </button>
            )}
          </p>
        )}

        {((!isBook && it.journalName) || bits.length > 0) && (
          <p className="tnum mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11.5px] text-muted">
            {!isBook && it.journalName && (
              journalKey ? (
                <Link to={`${journalBase}/${encodeURIComponent(journalKey)}`} className="text-ink-2 hover:text-accent hover:underline">{it.journalName}</Link>
              ) : <span className="text-ink-2">{it.journalName}</span>
            )}
            {bits.map((b, i) => (
              <React.Fragment key={i}>
                {(i > 0 || (!isBook && it.journalName)) && <span className="text-rule-2" aria-hidden="true">·</span>}
                <span className="min-w-0 [overflow-wrap:anywhere]">{b}</span>
              </React.Fragment>
            ))}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* What this record offers HERE — one mark, never two that disagree. */}
          {availability === 'readable' && !notInPlan && <Mark tone="accent" title="The full text is held in this library">Full text here</Mark>}
          {availability === 'readable' && notInPlan && <Mark title="The full text is held here, but your plan does not include this department or content type">Not in your plan</Mark>}
          {availability === 'external' && <Mark title="Not held in this library: the record leads to its source">At the source</Mark>}
          {availability === 'metadata' && <Mark tone="caution" title="A catalogue entry: there is no full text here and no source page to send you to">Metadata only</Mark>}
          {/* What the SOURCE says — separate from the above, and only said when a licence backs it. */}
          {oa.verified && <Mark tone="accent" title={`Open access at its source${oa.licence ? ` (${oa.licence})` : ''}. This does not mean the full text is held here.`}>Open access{oa.licence ? ` · ${oa.licence}` : ''}</Mark>}
          {typeMark && <Mark>{typeMark}</Mark>}
          {it.domain && <Mark>{it.domain}</Mark>}
        </div>

        {details.length > 0 && (
          <div className="mt-2">
            <MoreToggle id={moreId} />
            <dl id={moreId} hidden className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] text-ink-2">
              {details.map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="font-semibold text-muted">{k}</dt>
                  <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">
                    {v}
                    {k === 'DOI' && (
                      <button type="button" onClick={copyDoi} className="ml-2 inline-flex items-center gap-1 font-sans font-semibold text-accent hover:underline">
                        {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SaveButton id={it.id} title={title} />
          {canRead ? (
            lockedLabel ? (
              // Said in words and with a lock, not by colour: reading is shut until the time shown.
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-caution" aria-label={`Reading is locked. ${lockedLabel}`}>
                <Lock size={12} aria-hidden="true" />
                <span className="leading-tight">{lockedLabel}</span>
              </span>
            ) : (
              <button type="button" onClick={onOpen} className={buttonClass('outline', 'sm')} aria-label={`Read ${title}`}>Read</button>
            )
          ) : (
            <>
              {availability === 'external' && externalUrl && safeExternalUrl(externalUrl) && (
                <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('outline', 'sm')} aria-label={`Visit source for ${title} (opens in a new tab)`}>
                  Visit source <ExternalLink size={13} aria-hidden="true" />
                </a>
              )}
              <button type="button" onClick={() => setShowMeta(true)} className={buttonClass(availability === 'external' ? 'ghost' : 'outline', 'sm')} aria-label={`View details of ${title}`}>View details</button>
            </>
          )}
        </div>
      </div>

      {showMeta && <MetadataModal item={it} isBook={isBook} onClose={() => setShowMeta(false)} />}
    </article>
  );
});

/** A status mark, in the shared badge shape. Colour is spent only on whether the record can be read. */
function Mark({ children, tone = 'neutral', title }: { children: React.ReactNode; tone?: BadgeTone; title?: string }) {
  return (
    <Badge tone={tone} className="max-w-full" {...(title ? { title } : {})}>
      <span className="truncate">{children}</span>
    </Badge>
  );
}

/** The "More details" control. It owns no state: it flips `hidden` on the list it names, so the list stays in the page for search and print. */
function MoreToggle({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" aria-expanded={open} aria-controls={id}
      onClick={() => { const el = document.getElementById(id); if (el) el.hidden = open; setOpen(o => !o); }}
      className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-ink-2">
      <ChevronDown size={13} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      {open ? 'Hide details' : 'More details'}
    </button>
  );
}
