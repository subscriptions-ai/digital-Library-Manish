import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { ingestionDb as db } from './db.js';
import { INGESTION_POLICY, minutes } from './policy.js';
import { audit } from './audit.js';

/**
 * Atomic processing claims, so two passes never work on the same journal or sweep at once.
 *
 * The timer, the "run a pass" button and the backfill scripts can all be running together, and
 * nothing stopped two of them choosing the same journal, fetching the same page and writing the
 * same records twice (the second then reports them all "held"). A claim is a compare-and-set in
 * one UPDATE: whichever worker's UPDATE matches the unclaimed row wins, the other matches nothing
 * and moves to the next candidate. It does not rely on the screen disabling a button.
 *
 * A worker that dies holds its claim for ever unless something takes it back, so a claim older
 * than the timeout is treated as abandoned and recovered, and the recovery is audited.
 */

/** One id per process, stamped on every claim it takes. */
export const WORKER_ID = `${os.hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`;

const staleCutoff = () => new Date(Date.now() - minutes(INGESTION_POLICY.claim.staleAfterMinutes));
const claimable = (cutoff: Date) => ({ OR: [{ claimedAt: null }, { claimedAt: { lt: cutoff } }] });

type Claimed<T> = { row: T; recovered: boolean; previousWorker: string | null };

async function claimOne<T>(model: 'journal' | 'departmentSweep', where: any, orderBy: any, label: (r: any) => string): Promise<Claimed<T> | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cutoff = staleCutoff();
    const candidate = await db[model].findFirst({ where: { AND: [where, claimable(cutoff)] }, orderBy });
    if (!candidate) return null;
    const won = await db[model].updateMany({
      where: { id: candidate.id, ...claimable(cutoff) },
      data: { claimedAt: new Date(), claimedBy: WORKER_ID },
    });
    if (won.count === 1) {
      const recovered = candidate.claimedAt != null;               // it was only claimable because the claim was stale
      if (recovered) {
        await audit(null, 'STALE_CLAIM_RECOVERED', {
          model, id: candidate.id, name: label(candidate), previousWorker: candidate.claimedBy, claimedAt: candidate.claimedAt,
          takenBy: WORKER_ID,
        });
      }
      return { row: candidate, recovered, previousWorker: candidate.claimedBy ?? null };
    }
    // Someone else's UPDATE won; look for the next candidate.
  }
  return null;
}

export const claimJournal = (where: any, orderBy: any) =>
  claimOne<any>('journal', where, orderBy, r => r.title);

export const claimSweepRow = (where: any, orderBy: any) =>
  claimOne<any>('departmentSweep', where, orderBy, r => `${r.department} / ${r.source} / ${r.term}`);

/** Give a claim back. Only the worker that holds it can; a stale claim another worker took over is not ours to release. */
export async function releaseClaim(model: 'journal' | 'departmentSweep', id: string) {
  await db[model].updateMany({ where: { id, claimedBy: WORKER_ID }, data: { claimedAt: null, claimedBy: null } }).catch(() => {});
}
