import { classifyCandidates, writeClassified, type Candidate, type Classified } from '../importService.js';
import { judgeDuplicates, applyEnrichment } from '../duplicates.js';
import { checkFiles } from '../articleSources.js';
import { crashPoint } from './testHooks.js';
import type { Judged, JobView, WriteResult } from './types.js';

/**
 * The judging and the writing of ARTICLES, shared by every adapter that brings articles: the same existing judge (rights, licence, year policy, duplicate detection) and the same
 * existing writer the continuous engine and Quick Import use. An adapter only turns its source's record into a Candidate; this decides what that Candidate is.
 *
 *   publish  would be added and passes every rule                  review    waits for a person (including "open access first" without a verifiable open licence)
 *   duplicate  already in the catalogue: unchanged / enriched (an empty descriptive field would be filled) / conflicting (licence or DOI disagrees; left alone)
 *   refused  a rule says no (too old, …)
 *
 * Nothing here can publish what the rules would not: "open access first" can only turn a publish into a review; a file is offered only if `verifyFiles` is on and the file really
 * opens (the same check as the engine), and with it off a record is catalogued as a link and no file is served.
 */

export type ArticleItem = { candidate: Candidate };
const SLICE = 10;

export async function judgeArticles(items: { id: string; item: ArticleItem }[], job: JobView, opts: { verifyFiles?: boolean } = {}): Promise<Judged<ArticleItem>[]> {
  const verify = opts.verifyFiles !== false;
  const cands: Candidate[] = items.map(i => ({ ...i.item.candidate, ...(verify ? {} : { pdfUrl: null }) }));
  let cl: Classified[] = await classifyCandidates(cands);
  // A file is offered as readable only if it really opens — the engine's own check, only for what would be viewable.
  const toVerify = cl.map((c, i) => ({ c, i })).filter(({ c }) => c.outcome === 'ADD' && c.access === 'ViewableHere' && c.pdfUrl);
  if (verify && toVerify.length) {
    const opens = await checkFiles(toVerify.map(({ c }) => c.pdfUrl || null));
    toVerify.forEach(({ i }, k) => { cands[i] = { ...cands[i], fileOpensHere: opens[k] }; });
    cl = await classifyCandidates(cands);
  }
  const heldPairs = cl.filter(c => c.outcome === 'HELD' && c.heldId).map(c => ({
    heldId: c.heldId!, incoming: { authors: c.authors, volume: c.volume, issue: c.issue, subject: c.subject, publisherName: c.publisherName, journalName: c.journalName, issn: c.issn, licence: c.licence, doi: c.doi },
  }));
  const dups = await judgeDuplicates(heldPairs);
  return items.map(({ id, item }, k): Judged<ArticleItem> => {
    const c = cl[k];
    if (c.outcome === 'HELD') { const d = c.heldId ? dups.get(c.heldId) : null; return { id, item, outcome: 'duplicate', dup: d?.kind ?? 'unchanged', reason: d?.kind === 'conflicting' ? 'licence or DOI disagrees with the held record' : null, extra: { heldId: c.heldId, patch: d?.patch } }; }
    if (c.outcome === 'REJECTED') return { id, item, outcome: 'refused', reason: c.reasons.join('; ') };
    if (c.outcome === 'NEEDS_REVIEW') return { id, item, outcome: 'review', reason: c.reasons.join('; '), extra: { classified: c } };
    // Would be added. "Open access first": without a verifiable open licence it goes to a person instead of being catalogued as a link. Stricter than the engine, never looser.
    if (job.accessPreference === 'OAFirst' && c.licenceVerdict !== 'allows-commercial') return { id, item, outcome: 'review', reason: 'no verifiable open licence (open access first)', extra: { classified: { ...c, outcome: 'NEEDS_REVIEW', status: 'Draft', access: 'LinkOnly', forceReview: true } } };
    return { id, item, outcome: 'publish', extra: { classified: c } };
  });
}

export async function applyArticles(write: Judged<ArticleItem>[], enrich: Judged<ArticleItem>[], job: JobView): Promise<Map<string, WriteResult>> {
  const out = new Map<string, WriteResult>();
  let n = 0;
  for (let s = 0; s < write.length; s += SLICE) {
    const slice = write.slice(s, s + SLICE);
    const classified: Classified[] = slice.map(j => j.extra.classified);
    // Written by the engine's own writer, which judges each record AGAIN against the catalogue as it is now, so a record already there is "held", never written twice.
    await writeClassified(classified, { email: `Backfill:${job.id}` }, { writeReview: true });
    slice.forEach((j, k) => { const r = classified[k].result; out.set(j.id, r === 'added' || r === 'review' ? 'written' : r === 'held' ? 'present' : 'failed'); });
    n += slice.length;
    crashPoint('mid-apply', n);
  }
  for (const j of enrich) if (j.extra?.heldId && j.extra?.patch) await applyEnrichment(j.extra.heldId, j.extra.patch);
  return out;
}
