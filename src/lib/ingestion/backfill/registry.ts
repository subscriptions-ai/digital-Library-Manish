import { fixtureAdapter } from './fixtureAdapter.js';
import { openalexAdapter } from './openalexAdapter.js';
import { oapenAdapter } from './oapenAdapter.js';
import { doajAdapter } from './doajAdapter.js';
import { fixtureAllowed } from './config.js';
import type { BackfillAdapter, BackfillType } from './types.js';

/**
 * The adapters a backfill can use. The test fixture is listed only where BACKFILL_FIXTURE=1 outside production. The OpenAlex snapshot adapter is listed always but is AVAILABLE only where
 * a staged snapshot folder is configured (OPENALEX_SNAPSHOT_DIR): where it is not (production, today) the screen says no backfill provider is connected, instead of offering
 * something that is not there. The OAPEN adapter (books, OAI-PMH) is likewise AVAILABLE only where BACKFILL_OAPEN_ENABLED is set. The DOAJ enrichment adapter (journals already held; never creates one) is available only where BACKFILL_DOAJ_ENABLED is set and a staged DOAJ snapshot folder holds a file (DOAJ_SNAPSHOT_DIR). Each adapter has its own `available()`.
 */
const ALL: BackfillAdapter[] = [fixtureAdapter, openalexAdapter, oapenAdapter, doajAdapter];

export const listAdapters = (): BackfillAdapter[] => ALL.filter(a => !a.fixture || fixtureAllowed());
export const getAdapter = (id: string): BackfillAdapter | null => listAdapters().find(a => a.id === id) ?? null;
export const adaptersFor = (type: BackfillType) => listAdapters().filter(a => a.contentTypes.includes(type));
