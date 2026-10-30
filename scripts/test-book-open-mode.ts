/** The book record page's three honest states. npx tsx scripts/test-book-open-mode.ts */
import assert from 'node:assert/strict';
import { bookOpenMode } from '../src/lib/bookOpenMode.js';
const u = 'https://www.ncbi.nlm.nih.gov/nlmcatalog/1';
let n = 0; const t = (name: string, got: unknown, want: unknown) => { assert.equal(got, want, name); n++; console.log('  PASS ', name); };
t('metadata-only entry with a catalogue address is a catalogue entry, not "at source"', bookOpenMode({ accessStatus: 'MetadataOnly', originalUrl: u }, true), 'catalogue');
t('a record with no access status and an address is a catalogue entry', bookOpenMode({ accessStatus: null, originalUrl: u }, true), 'catalogue');
t('LinkOnly with an address is "at source"', bookOpenMode({ accessStatus: 'LinkOnly', originalUrl: 'https://doi.org/10.1/x' }, false), 'source');
t('viewable here and the reader can open it: read', bookOpenMode({ accessStatus: 'ViewableHere', originalUrl: u }, true), 'read');
t('viewable here but the reader cannot open it falls back to the source link, never a Read button', bookOpenMode({ accessStatus: 'ViewableHere', originalUrl: u }, false), 'source');
t('metadata-only is never readable, even for a member who can read', bookOpenMode({ accessStatus: 'MetadataOnly', originalUrl: null }, true), 'none');
t('nothing held and no address', bookOpenMode({ accessStatus: 'MetadataOnly' }, true), 'none');
console.log(`\n${n} passed`);
