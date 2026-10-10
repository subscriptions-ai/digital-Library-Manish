/**
 * Read-only report: held books with NO licence for which a second provider declares a recognised
 * title-level licence. Nothing is written. Used to decide whether the fill-only-the-licence rule is
 * worth adopting; see the Phase C notes.
 *
 *   npx tsx scripts/books-licence-gap.ts [--pages 30]
 */
import { OAPEN_OAI, fetchPage, judgePage } from '../src/lib/ingestion/books/oaiHarvest.js';
import { ingestionDb as db } from '../src/lib/ingestion/db.js';
import { licenceAllowsCommercialUse } from '../src/lib/ingestion/eligibility.js';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const pages = Number(arg('--pages', '30'));
let token: string | null = null, matched = 0, gap = 0, conflict = 0, same = 0;
const examples: any[] = [];
for (let i = 0; i < pages; i++) {
  const got = await fetchPage(OAPEN_OAI, token, null);
  if ('error' in got || got.page.error) break;
  const { judged } = await judgePage(OAPEN_OAI, got.page.records, db);
  for (const j of judged) {
    if (!j.match || j.match.via === 'title') continue;
    matched++;
    const held = await db.book.findUnique({ where: { id: j.match.bookId }, select: { id: true, title: true, licence: true, rightsBasis: true, accessStatus: true, rightsStatus: true, source: true } });
    if (!held) continue;
    if (!held.licence && j.book.licence && j.book.licenceBasis === 'title') {
      gap++;
      if (examples.length < 8) examples.push({ id: held.id, title: held.title.slice(0, 60), heldLicence: held.licence, heldBasis: held.rightsBasis, heldAccess: held.accessStatus, oapenLicence: j.book.licence, wouldAllowCommercial: licenceAllowsCommercialUse(j.book.licence) });
    } else if (held.licence && j.book.licence && held.licence !== j.book.licence) conflict++;
    else if (held.licence && held.licence === j.book.licence) same++;
  }
  token = got.page.resumptionToken;
  if (!token) break;
  await new Promise(r => setTimeout(r, 300));
}
console.log(JSON.stringify({ pagesRead: pages, matchedToHeld: matched, heldHasNoLicenceButOapenDeclaresOne: gap, bothDeclareSameLicence: same, bothDeclareDifferentLicences: conflict, examples }, null, 2));
process.exit(0);
