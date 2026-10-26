import { fixtureAdapter } from './fixtureAdapter.js';
import { fixtureAllowed } from './config.js';
import type { BackfillAdapter, BackfillType } from './types.js';

/**
 * The adapters a backfill can use. Phase 2A has exactly one, a test fixture, and it is listed only where BACKFILL_FIXTURE=1 outside production — so in production
 * the list is empty and the screen says no backfill provider is connected, instead of offering something that is not there. Real adapters (Phase 2B onward) are added
 * to `ALL`, each with its own `available()`.
 */
const ALL: BackfillAdapter[] = [fixtureAdapter];

export const listAdapters = (): BackfillAdapter[] => ALL.filter(a => !a.fixture || fixtureAllowed());
export const getAdapter = (id: string): BackfillAdapter | null => listAdapters().find(a => a.id === id) ?? null;
export const adaptersFor = (type: BackfillType) => listAdapters().filter(a => a.contentTypes.includes(type));
