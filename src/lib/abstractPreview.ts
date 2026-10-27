/**
 * The short abstract preview the content viewer shows.
 *
 * Deterministic truncation of an abstract we already hold. Nothing here fetches a page, reads a PDF or asks a model,
 * and nothing is stored: the preview is worked out when a record is opened, from `Article.abstract` / `Book.description`.
 *
 * The limit is a fixed number of display characters, the ellipsis included, so the viewer's behaviour is the same for
 * every record whatever the length of its abstract.
 */

export const ABSTRACT_PREVIEW_MAX = 400;

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', plusmn: '±', times: '×',
  micro: 'µ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
};

const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    // Control characters and out-of-range values are dropped rather than decoded.
    return Number.isFinite(n) && n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
  }
  return NAMED[e.toLowerCase()] ?? m;
});

/** Markup removed, entities decoded, whitespace collapsed. The result is plain text meant for a text node. */
export function abstractToPlainText(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  let s = raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // Whole elements whose contents are never prose.
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    // Any tag at all, including JATS (<jats:p>, <jats:title>), a '<' that never closes is left as text, which a text node shows literally.
    .replace(/<\/?[a-z][^<>]*>/gi, ' ');
  s = decodeEntities(s);
  // An entity-encoded tag ("&lt;b&gt;") decodes into a tag: strip those once more rather than show markup as text.
  s = s.replace(/<\/?[a-z][^<>]*>/gi, ' ');
  // Control characters (but not the whitespace ones, which the next step collapses) and the zero-width ones.
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​‌‍⁠﻿]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof (Intl as any).Segmenter === 'function' ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Display characters: grapheme clusters where the runtime can tell, code points otherwise. Never a UTF-16 unit. */
const characters = (s: string): string[] => segmenter ? Array.from(segmenter.segment(s), x => x.segment) : Array.from(s);

/**
 * Up to `max` display characters of an abstract, or null when there is nothing to show.
 * Cut at a word boundary when one is near enough; text without spaces (Chinese, Japanese) is cut between characters.
 * "…" is added only when something was cut, and counts towards `max`.
 */
export function buildAbstractPreview(raw: unknown, max: number = ABSTRACT_PREVIEW_MAX): string | null {
  const text = abstractToPlainText(raw);
  if (!text) return null;
  const chars = characters(text);
  if (chars.length <= max) return text;

  const head = chars.slice(0, max - 1);
  // A word boundary is used only if it keeps at least 60% of the allowance; otherwise one long token would collapse the preview.
  let cut = head.length;
  const nextIsSpace = /^\s/.test(chars[head.length]);
  if (!nextIsSpace) {
    for (let i = head.length - 1; i >= Math.floor(max * 0.6); i--) {
      if (/^\s/.test(head[i])) { cut = i; break; }
    }
  }
  const out = head.slice(0, cut).join('').replace(/[\s,;:\-–—(\[]+$/, '');
  return out ? `${out}…` : null;
}

/**
 * Ingested records whose descriptions we may show in part. Everything else that was ingested keeps its abstract
 * on file and shows none: where a source's terms are not recorded here, the record points to the publisher instead.
 *
 * Articles are deliberately absent: article ingestion stores no abstract (see the abstract decision in ingestionWorker),
 * so an ingested article that has one came from a path nobody has cleared.
 */
const INGESTED_BOOK_SOURCES = new Set(['DOAB', 'OAPEN', 'OpenTextbookLibrary', 'NCBIBookshelf', 'Pressbooks', 'Crossref', 'OpenLibrary']);

/** Whether the preview of this record's abstract may be shown at all. */
export function abstractMayBeShown(kind: 'article' | 'book', item: any): boolean {
  if (!item) return false;
  if (item.rightsStatus === 'Rejected') return false;
  // Entered by us or submitted by the publisher itself.
  if (item.ownershipSource === 'AdminEntered' || item.ownershipSource === 'PublisherSubmitted') return true;
  return kind === 'book' && INGESTED_BOOK_SOURCES.has(String(item.source || ''));
}

/** The preview for a catalogue record as the viewer receives it. null for legacy content and for anything not cleared. */
export function abstractPreviewFor(kind: string, item: any): string | null {
  if (kind === 'article') return abstractMayBeShown('article', item) ? buildAbstractPreview(item.abstract) : null;
  if (kind === 'book') return abstractMayBeShown('book', item) ? buildAbstractPreview(item.description) : null;
  return null;
}
