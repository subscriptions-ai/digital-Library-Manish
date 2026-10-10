import type { OaiRecord } from './oaiXml.js';
import { normaliseDoi, isbn13s } from './identifiers.js';
import { licenceFromProse } from '../licenceProse.js';
import { licenceAllowsCommercialUse } from '../eligibility.js';
import { canonicalLicence } from './licence.js';

/**
 * One book, in the shape every book provider is reduced to before anything is decided about it.
 * DOAB is the first; OAPEN, Open Textbook Library and NCBI follow and use the same type, the same
 * matching and the same rights rules, so a decision is made once and is the same whichever
 * provider the book came from.
 */
export type NormalisedBook = {
  provider: string;
  /** The provider's own id for the title (a Handle for DOAB and OAPEN). */
  sourceRecordId: string | null;
  title: string;
  authors: string | null;
  editors: string | null;
  publisherName: string | null;
  year: number | null;
  doi: string | null;
  /** ISBN-13s, valid check digit only. */
  isbns: string[];
  language: string | null;
  description: string | null;
  /** Free-text subject keywords as the provider gave them. */
  subjects: string[];
  /** Classification codes (BIC for DOAB/OAPEN), uppercase. */
  classifications: string[];
  pages: string | null;
  /** Library of Congress call numbers, where the source gives them. */
  lcc: string[];
  edition: string | null;
  country: string | null;
  coverUrl: string | null;
  /** The provider's own page for the title. */
  landingUrl: string | null;
  /** Where the book itself can be read or downloaded, as the provider states it. Never assumed servable. */
  externalUrl: string | null;
  /** The provider's own PDF of the book (ORIGINAL bundle), if it lists one. A claim, not a fact: see verifyPdf. */
  fileUrl: string | null;
  licence: string | null;
  /** Where the licence came from. */
  licenceBasis: 'title' | 'publisher-statement' | 'none';
  modified: string | null;
  deleted: boolean;
  /** Provider-specific provenance kept in the book's metadata (e.g. how a licence was read). */
  extra?: Record<string, any>;
};

/**
 * The licence of one title.
 *
 * DOAB attaches a licence to the title's own bitstream (`rights`, `rightsuri`) — a declaration
 * about this book. That is read first. The publisher-wide sentence is the fallback and is
 * recorded as the weaker evidence it is. "Other open license" names no licence and so is not one.
 */
export function licenceOf(rec: OaiRecord): { licence: string | null; basis: NormalisedBook['licenceBasis'] } {
  // Every licence the title's files declare. One distinct value is the title's licence; two that
  // disagree mean we do not know which applies, and what we cannot establish we do not rely on.
  const declared = new Set<string>();
  for (const b of rec.bitstreams) {
    const l = canonicalLicence(licenceFromProse(b.rightsUri) || licenceFromProse(b.rights));
    if (l) declared.add(l);
  }
  if (declared.size === 1) return { licence: [...declared][0], basis: 'title' };
  if (declared.size > 1) return { licence: null, basis: 'none' };
  const prose = canonicalLicence(licenceFromProse(rec.meta.get('publisher.oalicense')?.[0]));
  if (prose) return { licence: prose, basis: 'publisher-statement' };
  return { licence: null, basis: 'none' };
}

const first = (r: OaiRecord, k: string) => r.meta.get(k)?.[0] ?? null;
const all = (r: OaiRecord, k: string) => r.meta.get(k) ?? [];

export type OaiSource = { provider: string; /** "https://host/handle/" — the provider's page for a title. */ handleBase: string };

export function normaliseOaiBook(src: OaiSource, rec: OaiRecord): NormalisedBook | null {
  const provider = src.provider;
  const title = (first(rec, 'dc.title') || '').replace(/\s+/g, ' ').trim();
  const lic = licenceOf(rec);
  const year = Number(String(first(rec, 'dc.date.issued') || '').slice(0, 4)) || null;

  const cover = rec.bitstreams.find(b => b.bundle === 'THUMBNAIL' || /^image\//i.test(b.format));
  const handleUrl = rec.handle ? `${src.handleBase}${rec.handle}` : null;
  const original = rec.bitstreams.find(b => b.bundle === 'ORIGINAL' && /pdf/i.test(b.format) && /^https?:\/\//.test(b.url));
  const doi = normaliseDoi(first(rec, 'oapen.identifier.doi'));

  // The book's own address, as the provider states it, best first. DOAB never holds the file; this
  // is where the publisher or OAPEN does.
  const external =
    rec.bitstreams.map(b => b.downloadUrl).find(Boolean)
    || all(rec, 'dc.identifier.uri').find(u => /^https?:\/\//.test(u) && !/doabooks\.org/.test(u))
    || (doi ? `https://doi.org/${doi}` : null);

  return {
    provider,
    sourceRecordId: rec.handle,
    title,
    authors: all(rec, 'dc.contributor.author').join(', ') || null,
    editors: all(rec, 'dc.contributor.editor').join(', ') || null,
    publisherName: rec.publisherName || first(rec, 'oapen.imprint'),
    year,
    doi,
    isbns: isbn13s([...all(rec, 'oapen.relation.isbn'), ...all(rec, 'dc.identifier.isbn')]),
    language: first(rec, 'dc.language'),
    description: first(rec, 'dc.description.abstract'),
    subjects: all(rec, 'dc.subject.other').flatMap(s => s.split(/\s*;\s*/)).map(s => s.trim()).filter(Boolean),
    classifications: all(rec, 'dc.subject.classification').map(s => s.trim().toUpperCase()).filter(Boolean),
    pages: first(rec, 'oapen.pages'),
    lcc: [],
    edition: null,
    country: first(rec, 'publisher.country'),
    coverUrl: cover?.url || null,
    landingUrl: handleUrl,
    externalUrl: external,
    fileUrl: original?.url || null,
    licence: lic.licence,
    licenceBasis: lic.basis,
    modified: rec.datestamp,
    deleted: rec.deleted,
  };
}

/**
 * How a book may be offered — one decision, three outcomes.
 *
 * FullText       the file may be served from here: a declared licence that allows commercial use AND a
 *                file we hold or have verified opens. No provider of this kind hands us one yet, so
 *                nothing is FullText today, and a URL that merely looks like a PDF never makes it so.
 * OpenExternal   the licence is declared open and there is an address to read it at; catalogued and
 *                linked, never hosted.
 * MetadataOnly   licence not established, or nowhere to send the reader.
 */
/**
 * TODO: BOOK_FULLTEXT_READER_ENABLEMENT
 *
 * A backend "Full Text" status is a promise that a reader can open the book here. The Book reader does
 * not yet consume or enforce it, so until it does nothing is promoted: a book whose licence permits
 * hosting and whose PDF really opens is recorded as such (the verified URL and verdict stay in the
 * book's metadata) but is offered as Open External Access. When the reader supports Book PDFs, switch
 * this on (BOOK_FULLTEXT=1) after access/security QA, and promote CC BY / CC BY-SA only; non-commercial
 * licences stay link-only under the current policy.
 */
export const bookFullTextEnabled = () => process.env.BOOK_FULLTEXT === '1';

export type BookAccess = 'FullText' | 'OpenExternal' | 'MetadataOnly';

export function judgeBookAccess(b: Pick<NormalisedBook, 'licence' | 'externalUrl' | 'landingUrl'>, opts: { verifiedFileUrl?: string | null } = {}): {
  access: BookAccess; accessStatus: 'ViewableHere' | 'LinkOnly' | 'MetadataOnly';
  rightsStatus: 'Accepted' | 'MetadataOnly'; licenceIsNC: boolean; reason: string;
} {
  const nc = !licenceAllowsCommercialUse(b.licence);
  if (!b.licence) {
    return { access: 'MetadataOnly', accessStatus: 'MetadataOnly', rightsStatus: 'MetadataOnly', licenceIsNC: true, reason: 'no licence declared for this title' };
  }
  if (!nc && opts.verifiedFileUrl && !bookFullTextEnabled()) {
    return { access: 'OpenExternal', accessStatus: 'LinkOnly', rightsStatus: 'MetadataOnly', licenceIsNC: false,
      reason: `${b.licence}, file verified — held as Open External Access until the Book reader supports full text` };
  }
  if (!nc && opts.verifiedFileUrl) {
    return { access: 'FullText', accessStatus: 'ViewableHere', rightsStatus: 'Accepted', licenceIsNC: false, reason: `${b.licence}, file verified` };
  }
  if (b.externalUrl) {
    return { access: 'OpenExternal', accessStatus: 'LinkOnly', rightsStatus: 'MetadataOnly', licenceIsNC: nc,
      reason: nc ? `${b.licence} does not allow hosting; linked to the source` : `${b.licence}; no file of ours to serve, linked to the source` };
  }
  return { access: 'MetadataOnly', accessStatus: 'MetadataOnly', rightsStatus: 'MetadataOnly', licenceIsNC: nc, reason: 'no address to read the book at' };
}
