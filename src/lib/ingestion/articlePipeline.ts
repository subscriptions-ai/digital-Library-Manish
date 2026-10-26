import { ingestionDb as db } from './db.js';
import { classifyCandidates, writeClassified, type Candidate, type Classified, type WriteSummary } from './importService.js';
import { checkFiles } from './articleSources.js';
import { bump, type DeptStats } from './departmentStats.js';
import { reconcileDuplicates, type DupResult } from './duplicates.js';

/**
 * Judge, check the files, write — the one pipeline every article source goes through, whether the continuous engine or an
 * administrator's Quick Import started it. A record is judged by the same rules, checked against the same catalogue, written by
 * the same writer; only who asked, and how many, differs.
 */

export type PipelineResult = {
  classified: Classified[]; sum: WriteSummary;
  heldAlready: number; rejected: number; viewable: number;
  /** The breakdown by department, counted from what actually happened to each record. */
  byDepartment: DeptStats;
  /** What the duplicates were worth: unchanged / enriched (an empty field filled) / conflicting (rights or DOI disagree; left alone). enriched ⊂ held. */
  dup: DupResult;
};

export async function judgeVerifyWrite(
  cands: Candidate[], admin: any,
  opts: { maxWrites?: number; skippedAtFetch?: number; progress?: (p: Record<string, any>) => void } = {},
): Promise<PipelineResult> {
  const progress = opts.progress || (() => {});
  progress({ stage: 'Checking what is already held…' });
  let classified: Classified[] = await classifyCandidates(cands);

  // A record is only offered as readable here if its file really opens. Only the ones that would be are checked.
  const toVerify = classified.map((c, i) => ({ c, i })).filter(({ c }) => c.outcome === 'ADD' && c.access === 'ViewableHere' && c.pdfUrl);
  if (toVerify.length) {
    progress({ stage: `Opening ${toVerify.length} file${toVerify.length === 1 ? '' : 's'} to confirm they work…` });
    const opens = await checkFiles(toVerify.map(({ c }) => c.pdfUrl || null));
    toVerify.forEach(({ i }, k) => { cands[i].fileOpensHere = opens[k]; });
    classified = await classifyCandidates(cands);
  }

  // A cap on what may be written (a journal that needs only a few more): the surplus is left for a later visit, not refused.
  const deferred = new Set<number>();
  if (opts.maxWrites != null) {
    let room = Math.max(0, opts.maxWrites);
    classified.forEach((c, i) => {
      if (c.outcome !== 'ADD' && c.outcome !== 'NEEDS_REVIEW') return;
      if (room > 0) room--; else { deferred.add(i); (c as any).result = 'deferred'; }
    });
  }

  const heldAlready = classified.filter(c => c.outcome === 'HELD').length;
  const rejected = classified.filter(c => c.outcome === 'REJECTED').length;
  progress({ stage: 'Adding records…', held: heldAlready, skipped: (opts.skippedAtFetch || 0) + rejected, review: 0, added: 0 });

  const sum = await writeClassified(classified, admin, {
    writeReview: true,
    onProgress: s => progress({ stage: 'Adding records…', added: s.added, review: s.reviewWritten, failed: s.failed, held: heldAlready + s.held, skipped: (opts.skippedAtFetch || 0) + rejected + s.rejected }),
  });
  classified.forEach((c, i) => { if (deferred.has(i)) delete (c as any).result; });

  await refreshCoverage(classified);

  // A duplicate from another source is compared with the record we hold: it may complete it, or disagree with it (duplicates.ts).
  const dup = await reconcileDuplicates(classified.filter(c => c.outcome === 'HELD' && c.heldId).map(c => ({
    heldId: c.heldId!, incoming: { authors: c.authors, volume: c.volume, issue: c.issue, subject: c.subject, publisherName: c.publisherName, journalName: c.journalName, issn: c.issn, licence: c.licence, doi: c.doi },
  })));

  // Every record is counted once, in the department it belongs to. (A Draft article keeps its journal's department; only books wait unplaced.)
  const byDepartment: DeptStats = {};
  classified.forEach((c, i) => {
    if (deferred.has(i)) return;
    const dept = (c as any).department || '';
    if (c.outcome === 'HELD' || c.result === 'held') bump(byDepartment, dept, 'held');
    else if (c.outcome === 'REJECTED' || c.result === 'rejected') bump(byDepartment, dept, 'skipped');
    else if (c.result === 'added') bump(byDepartment, dept, 'added');
    else if (c.result === 'review') bump(byDepartment, dept, 'sentToReview');
    else if (c.result === 'failed') bump(byDepartment, dept, 'failed');
  });
  if (opts.skippedAtFetch) bump(byDepartment, '', 'skipped', opts.skippedAtFetch);

  const viewable = classified.filter(c => c.result === 'added' && c.access === 'ViewableHere').length;
  return { classified, sum, heldAlready, rejected, viewable, byDepartment, dup };
}

/** A journal's counts are what its own page shows; they follow what was just written. Its cursor and cooldown are the engine's and are not touched. */
export async function refreshCoverage(items: Classified[]) {
  const issns = [...new Set(items.filter(i => i.result === 'added' || i.result === 'review').map(i => i.issn).filter(Boolean) as string[])];
  for (const issn of issns) {
    const j = await db.journal.findFirst({ where: { OR: [{ issn }, { eissn: issn }] }, select: { id: true } }).catch(() => null);
    if (!j) continue;
    const [s]: any[] = await db.$queryRawUnsafe(
      `select count(*)::int a, count(distinct volume)::int v, count(distinct issue)::int i, min(year) f, max(year) l from "Article" where "journalId" = $1`, j.id);
    await db.journal.update({ where: { id: j.id }, data: { articleCount: s.a, volumeCount: s.v, issueCount: s.i, firstYear: s.f, lastYear: s.l } }).catch(() => {});
  }
}
