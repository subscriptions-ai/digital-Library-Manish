/**
 * Run the OAI book harvest by hand.
 *
 *   npx tsx scripts/books-oai.ts --dry-run --pages 20          # judge 2,000 records, write nothing
 *   npx tsx scripts/books-oai.ts --write 8 --pages 5           # catalogue at most 8 new books (checkpoint untouched)
 *   npx tsx scripts/books-oai.ts --provider OAPEN --dry-run --pages 20
 *   npx tsx scripts/books-oai.ts --provider OTL --dry-run --pages 202   # Open Textbook Library (JSON, 10 books a page)
 *   npx tsx scripts/books-oai.ts --provider NCBI --dry-run --pages 60 --archives 25   # stage 1 over the list, stage 2 on a bounded sample
 *   npx tsx scripts/books-oai.ts --resume --pages 3            # the real thing: advances the saved checkpoint
 *
 * A dry run never writes a book or the checkpoint. A capped run (--write) writes books but leaves the
 * checkpoint alone. Only --resume moves the real harvest forward.
 */
import { harvestFeed, DOAB_OAI, OAPEN_OAI, OTL_FEED, NCBI_FEED } from '../src/lib/ingestion/books/oaiHarvest.js';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const has = (k: string) => process.argv.includes(k);

// A flag with a missing or non-numeric value used to be read as "not given" and the run carried on with
// defaults — a mistyped --start silently sampled page 1. Refuse instead.
const KNOWN = new Set(['--dry-run', '--write', '--resume', '--pages', '--from', '--start', '--delay', '--provider', '--sample', '--archives']);
const VALUED = new Set(['--write', '--pages', '--from', '--start', '--delay', '--provider', '--archives']);
const NUMERIC = new Set(['--write', '--pages', '--start', '--delay', '--archives']);
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { console.error(`unexpected argument "${a}" — values go right after their flag, one flag per value`); process.exit(2); }
  if (!KNOWN.has(a)) { console.error(`unknown flag ${a}`); process.exit(2); }
  if (VALUED.has(a)) {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--') || (NUMERIC.has(a) && !/^\d+$/.test(v))) { console.error(`${a} needs ${NUMERIC.has(a) ? 'a whole number' : 'a value'}, got ${v === undefined ? 'nothing' : `"${v}"`}`); process.exit(2); }
    i++;
  }
}

const dryRun = has('--dry-run');
const write = arg('--write');
if (!dryRun && !write && !has('--resume')) { console.error('choose one of --dry-run, --write N, --resume'); process.exit(2); }

const wanted = (arg('--provider') || 'DOAB').toUpperCase();
const cfg = wanted === 'OAPEN' ? OAPEN_OAI : wanted === 'OTL' ? OTL_FEED : wanted === 'NCBI' ? NCBI_FEED : DOAB_OAI;
const r = await harvestFeed(cfg, {
  dryRun,
  maxWrites: write ? Number(write) : undefined,
  maxPages: Number(arg('--pages') || 3),
  from: arg('--from') || null,
  startToken: arg('--start') || null,
  maxArchives: arg('--archives') ? Number(arg('--archives')) : undefined,
  ignoreCheckpoint: dryRun || !!write,
  pageDelayMs: Number(arg('--delay') || 1000),
});
const { sample, ...summary } = r;
console.log(JSON.stringify(summary, null, 2));
if (has('--sample')) console.log(JSON.stringify(sample, null, 2));
process.exit(0);
