import { ingestionDb as db } from './db.js';
import { bookMinYear, bookYearVerdict } from './yearPolicy.js';
import { canonicalLicence } from './books/licence.js';
import { judgeBookAccess } from './books/normalise.js';
import { licenceAllowsCommercialUse } from './eligibility.js';
import { feedOf, publishedTwin } from './localWork.js';

/**
 * May this Book be made public? One answer, kept in one place, for the Review Automation publication actions.
 *
 * Nothing here is a new policy. Each check is the application's own rule, applied to what is stored on the book now:
 *   - status / ownership / rejection      the single-record Approve and the harvest: only an undecided ingested Draft is published by the engine's rules;
 *   - year                                 yearPolicy.bookYearVerdict, with the engine's saved book year (older or no year waits for a person);
 *   - licence and rights                   books/licence.canonicalLicence + eligibility.licenceAllowsCommercialUse: a book is only listed on a licence
 *                                          that is declared and recognised, and the stored non-commercial flag must agree with it;
 *   - access                               books/normalise.judgeBookAccess re-derives how the book may be offered from its licence and its address;
 *                                          a stored "viewable here" with no right to host, or a listing with nowhere to send the reader, is refused;
 *   - source scope and duplicates          the feed's own department scope and localWork.publishedTwin, exactly as the held-books job applies them.
 *
 * It is stricter than the harvest in one place on purpose: the harvest lists a strong book from a self-publishing source even when its licence is
 * undeclared (as a metadata-only entry); Review Automation will not publish on a licence nobody has declared. Confidence in a department says nothing
 * about rights, so it is never an input here. Reading only: this function writes nothing and changes no licence, access or rights field.
 */

export type PublishReason =
  | 'no_verified_licence' | 'rights_unclear' | 'access_not_publishable' | 'metadata_only_policy' | 'metadata_incomplete'
  | 'rejected' | 'protected' | 'department_conflict' | 'classifier_changed' | 'confidence_dropped' | 'year_policy_failed'
  | 'no_longer_draft' | 'already_published' | 'record_missing' | 'concurrent_change' | 'duplicate_published' | 'outside_source_scope' | 'no_department' | 'no_suggestion';

export const PUBLISH_REASON_LABEL: Record<PublishReason, string> = {
  no_verified_licence: 'No verified licence', rights_unclear: 'Rights unclear', access_not_publishable: 'Access not publishable', metadata_only_policy: 'Nowhere to send the reader (metadata only)',
  metadata_incomplete: 'Metadata incomplete', rejected: 'Rejected', protected: 'Protected (not an ingested record)', department_conflict: 'Department conflict',
  classifier_changed: 'Classifier changed', confidence_dropped: 'Confidence dropped', year_policy_failed: 'Year policy', no_longer_draft: 'No longer a Draft', already_published: 'Already published',
  record_missing: 'Record missing', concurrent_change: 'Changed while being published', duplicate_published: 'Already published as another record', outside_source_scope: 'Outside the source’s department scope',
  no_department: 'No department', no_suggestion: 'No department suggested',
};

/** The stored fields the checks read. */
export const PUBLISH_COLUMNS = `id, title, status, "ownershipSource", source, year, licence, "licenceIsNC", "rightsBasis", "rightsStatus", "accessStatus", "accessType", "rejectionNote",
  "originalUrl", "pdfUrl", doi, isbn, fingerprint, domain, language, authors, "publisherName", left(description, 1200) description,
  (metadata->'licenceFill') is not null as "hasLicenceFill",
  metadata->'harvest'->'classifications' codes, metadata->'harvest'->'keywords' keywords,
  metadata->'harvest'->'provider'->'lcc' lcc, metadata->'harvest'->'provider'->'nlmClass' nlm, metadata->'harvest'->'provider'->'ddc' ddc`;

export type PublishBook = {
  id: string; title: string | null; status: string; ownershipSource: string; source: string | null; year: number | null; licence: string | null; licenceIsNC: boolean | null;
  rightsBasis: string | null; rightsStatus: string | null; accessStatus: string | null; rejectionNote: string | null; originalUrl: string | null; pdfUrl: string | null;
  doi: string | null; isbn: string | null; fingerprint: string | null; domain: string | null; hasLicenceFill?: boolean;
};

/** One flat shape: this project does not narrow unions without strict null checks. `ok` true: eligible, `checks` lists what passed. Otherwise `reason` says why. */
export type Eligibility = { ok: boolean; checks?: string[]; reason?: PublishReason; detail?: string };
const no = (reason: PublishReason, detail?: string): Eligibility => ({ ok: false, reason, detail });

/** The engine's saved book year, read once per run. */
export async function currentBookMinYear(): Promise<number> {
  return bookMinYear(await db.ingestionState.findUnique({ where: { id: 'singleton' }, select: { bookMinYear: true } }).catch(() => null));
}

/**
 * `department` is the department the book would be published under (the one it has, or the one Review Automation would give it).
 * `minYear` is the engine's book policy year. Pass `checkDuplicates: false` only where a twin has already been looked for.
 */
export async function bookPublicationEligibility(b: PublishBook, department: string | null, minYear: number, opts: { checkDuplicates?: boolean } = {}): Promise<Eligibility> {
  const checks: string[] = [];
  // Standing
  if (b.status === 'Published') return no('already_published');
  if (b.status === 'Rejected' || b.rejectionNote) return no('rejected');
  if (b.status !== 'Draft') return no('no_longer_draft', b.status);
  if (b.ownershipSource !== 'Ingested') return no('protected', b.ownershipSource);
  checks.push('standing');
  if (!department) return no('no_department');
  if (!String(b.title || '').trim()) return no('metadata_incomplete', 'no title');
  checks.push('metadata');
  // Year policy
  const yv = bookYearVerdict(b.year, minYear);
  if (!yv.ok) return no('year_policy_failed', yv.reason);
  checks.push('year');
  // Licence and rights
  if (b.rightsStatus === 'Rejected') return no('rights_unclear', 'rights refused');
  const lic = canonicalLicence(b.licence);
  if (!b.licence || !String(b.licence).trim() || !lic) return no('no_verified_licence', b.licence ? `"${b.licence}" is not a recognised licence` : 'no licence declared');
  // The harvest records "record, licence undeclared" as the basis when it found none; a licence filled in later by another provider is kept in metadata.licenceFill.
  if ((!b.rightsBasis || /undeclared/i.test(b.rightsBasis)) && !b.hasLicenceFill) return no('rights_unclear', 'the licence has no recorded source');
  if (b.licenceIsNC != null && b.licenceIsNC !== !licenceAllowsCommercialUse(lic)) return no('rights_unclear', 'the stored non-commercial flag disagrees with the licence');
  checks.push('licence');
  // Access: how the book may be offered, re-derived from its licence and address
  const derived = judgeBookAccess({ licence: lic, externalUrl: b.originalUrl, landingUrl: b.originalUrl });
  if (derived.access === 'MetadataOnly') return no('metadata_only_policy', derived.reason);
  // Publishing never opens a file. The reader serves whatever file address a Published book carries, so a book that holds one (or is marked viewable here) is not
  // published by this action: serving full text is a separate decision, made when the Book reader is enabled, not a side effect of a department being confident.
  if (b.pdfUrl || b.accessStatus === 'ViewableHere') return no('access_not_publishable', 'carries an internal file or is marked viewable here; full text is never published automatically');
  if (b.accessStatus && !['ViewableHere', 'LinkOnly', 'MetadataOnly'].includes(b.accessStatus)) return no('access_not_publishable', `unknown access "${b.accessStatus}"`);
  checks.push('access');
  // Source scope and duplicates, as the held-books job applies them
  const cfg = feedOf(b.source);
  if (cfg?.allowedDepartments && !cfg.allowedDepartments.includes(department)) return no('outside_source_scope', `${b.source} is limited to ${cfg.allowedDepartments.length} departments`);
  checks.push('scope');
  if (opts.checkDuplicates !== false && await publishedTwin({ id: b.id, doi: b.doi, isbn: b.isbn, fingerprint: b.fingerprint })) return no('duplicate_published');
  checks.push('duplicates');
  return { ok: true, checks };
}
