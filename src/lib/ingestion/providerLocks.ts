/**
 * Who is working on a source right now, so two passes never do the same source's work at once.
 *
 * Journals have their own atomic claims for the continuous engine's article visits. This is the same
 * idea one level up: a PROVIDER (OpenAlex, DOAB…) is claimed by whoever is walking it — the timer, a
 * manual pass, or an administrator's Quick Import. Whichever asks first holds it; the other is told
 * who has it and carries on with something else (the engine) or says so (the screen).
 *
 * It lives in memory because the server is one process: the hand-off it protects is between a timer
 * and a request inside that process. A restart drops every lock, which is right — nothing is running.
 */

export type LockOwner = 'continuous' | 'manual';

const held = new Map<string, { owner: LockOwner; since: number }>();

/** Take a provider. Synchronous on purpose: two clicks in the same tick cannot both succeed. */
export function tryLockProvider(provider: string, owner: LockOwner): boolean {
  if (held.has(provider)) return false;
  held.set(provider, { owner, since: Date.now() });
  return true;
}

export function unlockProvider(provider: string, owner?: LockOwner) {
  const h = held.get(provider);
  if (h && (!owner || h.owner === owner)) held.delete(provider);
}

export function providerHolder(provider: string): { owner: LockOwner; since: number } | null {
  return held.get(provider) ?? null;
}

/** For tests: forget every lock. */
export function __resetProviderLocks() { held.clear(); }
