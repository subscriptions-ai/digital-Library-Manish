import { PrismaClient } from '@prisma/client';

/**
 * The one connection the ingestion code shares.
 *
 * The worker used to open its own client and hand it to the catalogue import. The new
 * services (claims, dedup, audit, previews) need the same connection, and importing it
 * from the worker would make the worker and its own helpers import each other, so it
 * lives here and everything imports it from here.
 */
export const ingestionDb: any = new PrismaClient();
