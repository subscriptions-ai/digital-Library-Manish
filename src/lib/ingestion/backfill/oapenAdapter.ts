import { OAPEN_OAI } from '../books/oaiHarvest.js';
import { normaliseOaiBook } from '../books/normalise.js';
import type { OaiRecord } from '../books/oaiXml.js';
import { judgeBookItems, applyBookItems, type BookItem } from './bookCommon.js';
import { oapenBackfillEnabled, oapenIdentity, readOapen, describeOapen } from './oapenSource.js';
import type { BackfillAdapter } from './types.js';

/**
 * OAPEN's historical catalogue as a backfill adapter for BOOKS. Read docs/oapen-backfill-audit-2026-10.md.
 *
 * Source: OAPEN's OAI-PMH feed (xoai format, the Books set): the same records, the same normaliser and the same rights reading as the continuous OAPEN harvest, so a book means the same
 * thing whichever path brought it. Being in OAPEN is never a reason to publish or to host: a licence is taken only from the title's own file declarations, a file is offered only if the
 * engine's file check passes (and, with the Book reader not yet serving full text, nothing is ever offered as Full Text), and every rule of the book pipeline applies unchanged.
 *
 * Independence: the checkpoint lives on the job (BackfillJob.cursor). The continuous OAPEN harvest's resumption token (BookHarvestCheckpoint), the provider's health row, the rotation
 * and Quick Import are never written. The lock key is the continuous engine's own ('OAPEN'), so the two never work the provider in the same moment. The adapter is available only where
 * BACKFILL_OAPEN_ENABLED is set at deployment time.
 */

export const oapenAdapter: BackfillAdapter<OaiRecord, BookItem> = {
  id: 'oapen', label: 'OAPEN Library (OAI-PMH)', contentTypes: ['BOOK'],
  lock: OAPEN_OAI.provider,
  params: [
    { key: 'verifyFiles', label: 'Check that a free book file really opens before offering it', type: 'boolean', default: true, help: 'The engine\'s own check (the first bytes must be a PDF). When off, nothing is offered as a file: books are catalogued as links only.' },
    { key: 'modifiedFrom', label: 'Records changed at OAPEN since (optional)', type: 'text', placeholder: 'YYYY-MM-DD', help: 'Narrows the feed by when OAPEN last changed a record, not by publication year. The publication period above is applied on top.' },
    { key: 'modifiedUntil', label: 'Records changed at OAPEN until (optional)', type: 'text', placeholder: 'YYYY-MM-DD', help: 'The list is always closed at the moment the job is created, so a running job never sees later changes.' },
  ],
  available: () => (oapenBackfillEnabled() ? true : 'OAPEN backfill is not enabled on this server (BACKFILL_OAPEN_ENABLED is not set)'),
  stableId: r => r.handle || r.identifier,

  async sourceIdentity(a) { return oapenIdentity(a); },
  describe: () => describeOapen(),

  fetchPage: (job, cursor, limit) => readOapen(job, cursor, limit),

  normalize(r) {
    const book = normaliseOaiBook(OAPEN_OAI, r);
    if (!book || !book.title) return { error: 'no title' };
    return { book };
  },

  judge: (items, job) => judgeBookItems(items, job, OAPEN_OAI, { verifyFiles: job.adapter.verifyFiles !== false }),
  apply: (write, enrich, job) => applyBookItems(write, enrich, job, OAPEN_OAI),
};
