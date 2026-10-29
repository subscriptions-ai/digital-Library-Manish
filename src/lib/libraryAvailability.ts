/**
 * What a library record offers a reader, said once.
 *
 * Three different things were being shown as one: whether the SOURCE says a work is open access, whether the full text is HELD here, and
 * whether this reader may open it. They are separate facts and the screen must not let one stand in for another — a work can be open at
 * its publisher and still be a catalogue entry here, because open access at the source is not a licence for us to host it.
 *
 *   availability   readable   the full text is served from here (the same test the Books counts use: src/lib/publicBooks.ts)
 *                  external   not held here, but the record names the source's own page; the reader is sent there
 *                  metadata   a catalogue entry: nothing to open here and nowhere validated to send the reader
 *   sourceOpenAccess.declared   the source calls it open access
 *   sourceOpenAccess.verified   …and a recorded open licence backs that (CC BY …). This is the only thing "Open access" may claim.
 */

export type Availability = 'readable' | 'external' | 'metadata';
export type RecordKind = 'article' | 'book' | 'content';

/** A web address safe to put behind a link: http(s) only, no embedded credentials. Anything else is not a destination. */
export function safeExternalUrl(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const raw = c.trim();
    if (!raw || raw.length > 2048) continue;
    let u: URL;
    try { u = new URL(raw); } catch { continue; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
    if (u.username || u.password) continue;
    return u.toString();
  }
  return null;
}

/**
 * Licences that are open licences. The catalogue stores them in two spellings ("cc-by-nc" from the article feeds, "CC BY-NC" from the book feeds),
 * so a prefix is listed in both. "Publisher terms (our own)" is ours, for hosted subscription content: it is not open access.
 */
export const OPEN_LICENCE_PREFIXES = ['cc-by', 'cc by', 'cc0', 'cc-zero', 'cc zero', 'public domain', 'public-domain'] as const;
const licenceKey = (licence: string) => licence.trim().toLowerCase().replace(/[\s_]+/g, '-');
export const isOpenLicence = (licence: unknown): boolean =>
  typeof licence === 'string' && OPEN_LICENCE_PREFIXES.some(p => licenceKey(licence).startsWith(licenceKey(p)));

export const isDeclaredOpen = (accessType: unknown) => accessType === 'OpenAccess' || accessType === 'Free';

/** `cc-by-nc-nd` or `CC BY-NC-ND` → `CC BY-NC-ND`, for display. Anything else is shown as stored. */
export function licenceLabel(licence: unknown): string | null {
  if (typeof licence !== 'string' || !licence.trim()) return null;
  const l = licence.trim();
  const k = licenceKey(l);
  if (k === 'cc0') return 'CC0';
  if (k === 'public-domain') return 'Public domain';
  const m = /^cc-(by(?:-[a-z]+)*)$/.exec(k);
  return m ? `CC ${m[1].toUpperCase()}` : l;
}

export type RecordAvailability = {
  availability: Availability;
  /** The record's own page at its source, validated; null when there is none (or it is not a web address). */
  externalUrl: string | null;
  sourceOpenAccess: { declared: boolean; verified: boolean; licence: string | null };
};

/**
 * `item` is a row of Article, Book or legacy Content.
 *
 *   article  readable = a file, and the record is not marked LinkOnly / MetadataOnly. A null status is "behave as before": a file opens.
 *   book     readable = ViewableHere with a file (the reconciled Books definition).
 *   content  readable = a file whose viewer check passed.
 */
export function availabilityOf(kind: RecordKind, item: any): RecordAvailability {
  const file = typeof item?.pdfUrl === 'string' ? item.pdfUrl : typeof item?.fileUrl === 'string' ? item.fileUrl : '';
  const status: string | null = item?.accessStatus ?? null;
  let hosted: boolean;
  if (kind === 'book') hosted = !!file && status === 'ViewableHere';
  else if (kind === 'article') hosted = !!file && (status === null || status === 'ViewableHere');
  else hosted = !!file && item?.validationStatus === 'VALID_VIEWABLE';

  const externalUrl = hosted ? null : safeExternalUrl(item?.originalUrl);
  const declared = isDeclaredOpen(item?.accessType);
  const licence = licenceLabel(item?.licence);
  return {
    availability: hosted ? 'readable' : externalUrl ? 'external' : 'metadata',
    externalUrl,
    sourceOpenAccess: { declared, verified: declared && isOpenLicence(item?.licence), licence },
  };
}
