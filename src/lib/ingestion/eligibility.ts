import type { Held } from './dedup.js';
import { normaliseDoi } from './dedup.js';

/**
 * Is this record one we should take, and how? One set of rules for the continuous engine, the
 * dry run, the one-off import and the check before a mass import.
 *
 * A record reported as eligible in a preview must be judged the same way when it is written, or a
 * preview is a promise nobody keeps. So the rules live here, nowhere else, and the write step
 * calls them again with fresh facts rather than trusting the preview's verdict.
 */

/** Licences that permit commercial use. Everything else is catalogued, not served. */
const COMMERCIAL_OK = /^(cc[\s-]?by([\s-]?(sa|nd))?|cc0|public[\s-]?domain)$/i;

export function licenceAllowsCommercialUse(raw?: string | null, ncFlag?: boolean | null): boolean {
  if (ncFlag === true) return false;
  const t = String(raw || '').trim();
  if (!t) return false;                     // undeclared is treated as not permitted
  if (/nc/i.test(t.replace(/[^a-z]/gi, ''))) return false;
  return COMMERCIAL_OK.test(t.replace(/\s+/g, ' '));
}

export type Outcome = 'ADD' | 'HELD' | 'NEEDS_REVIEW' | 'REJECTED';

export type Decision = {
  outcome: Outcome;
  /** For a record that will be written: whether its file may be served here. */
  access?: 'ViewableHere' | 'LinkOnly';
  /** For a record that will be written: Published, or Draft so it lands in Content Review. */
  status?: 'Published' | 'Draft';
  /** What the licence said, for the record and for the preview. */
  licenceVerdict?: 'allows-commercial' | 'non-commercial' | 'not-verifiable';
  reasons: string[];
};

export type JudgeWork = {
  title?: string | null;
  doi?: string | null;
  pdfUrl?: string | null;
  licence?: string | null;
  year?: number | null;
};

export type JudgeContext = {
  /** The journal the record will belong to, when it is known; carries the title-level licence decision. */
  journal?: { licenceIsNC?: boolean | null; rightsBasis?: string | null } | null;
  held?: Held | null;
  possibleDuplicateOf?: string | null;
  /** Some sources serve files only from hosts we can fetch from. False means the file cannot open here. */
  fileOpensHere?: boolean;
};

const DOI_SHAPE = /^10\.\d{4,9}\/\S+$/i;

export function judgeArticle(w: JudgeWork, ctx: JudgeContext = {}): Decision {
  if (ctx.held) return { outcome: 'HELD', reasons: [`already in the catalogue (matched by ${ctx.held.via})`] };

  const title = String(w.title || '').trim();
  if (!title || /^untitled$/i.test(title)) return { outcome: 'REJECTED', reasons: ['no usable title'] };

  const doi = normaliseDoi(w.doi);
  if (doi && !DOI_SHAPE.test(doi)) return { outcome: 'NEEDS_REVIEW', status: 'Draft', access: 'LinkOnly', reasons: ['malformed DOI'] };

  const thisYear = new Date().getFullYear();
  if (w.year != null && (w.year > thisYear + 1 || w.year < 1500)) {
    return { outcome: 'NEEDS_REVIEW', status: 'Draft', access: 'LinkOnly', reasons: [`implausible publication year ${w.year}`] };
  }

  if (ctx.possibleDuplicateOf) {
    return { outcome: 'NEEDS_REVIEW', status: 'Draft', access: 'LinkOnly', reasons: [`possible duplicate of ${ctx.possibleDuplicateOf}`] };
  }

  // Rights. The article's own licence wins; failing that, the journal's declaration; failing that, we do
  // not know — and what we cannot establish we do not serve.
  const reasons: string[] = [];
  let verdict: Decision['licenceVerdict'];
  if (w.licence && String(w.licence).trim()) {
    verdict = licenceAllowsCommercialUse(w.licence) ? 'allows-commercial' : 'non-commercial';
    if (verdict === 'non-commercial') reasons.push(`licence "${w.licence}" does not allow hosting`);
  } else if (ctx.journal && ctx.journal.rightsBasis === 'DOAJ declaration' && ctx.journal.licenceIsNC === false) {
    verdict = 'allows-commercial';
  } else {
    verdict = 'not-verifiable';
    reasons.push('licence not verifiable — catalogued with a link, no file served');
  }

  const fileOpensHere = ctx.fileOpensHere !== false;
  const viewable = verdict === 'allows-commercial' && !!w.pdfUrl && fileOpensHere;
  if (verdict === 'allows-commercial' && !w.pdfUrl) reasons.push('no file offered');
  if (verdict === 'allows-commercial' && w.pdfUrl && !fileOpensHere) reasons.push('file does not open from this server');

  return { outcome: 'ADD', status: 'Published', access: viewable ? 'ViewableHere' : 'LinkOnly', licenceVerdict: verdict, reasons };
}
