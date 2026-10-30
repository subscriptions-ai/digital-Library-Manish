/** Department breakdown: three separate figures, journal titles never added into the item total. npx tsx scripts/test-department-breakdown.ts */
import assert from 'node:assert/strict';
import { breakdownFor, breakdownLine } from '../src/lib/departmentBreakdown.js';
let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; console.log('  PASS ', name); };
const rows = [{ name: 'Medical Laboratory Technology', books: 8, articles: 0, other: 0, total: 8 }, { name: 'Nursing', books: 131, articles: 1871, other: 5, total: 2007 }];
t('books, articles and journal titles stay three separate figures', () => { const b = breakdownFor('Medical Laboratory Technology', rows, { 'Medical Laboratory Technology': 66 })!; assert.deepEqual(b, { books: 8, articles: 0, journalTitles: 66 }); assert.equal(breakdownLine(b), 'Books: 8 · Articles: 0 · Journal titles: 66'); });
t('the item total is not touched by journal titles', () => { const b = breakdownFor('Nursing', rows, { Nursing: 330 })!; assert.equal(b.books + b.articles, 2002); assert.equal(rows[1].total, 2007); });
t('a department with journals but no items still shows its titles', () => assert.deepEqual(breakdownFor('Radiology', rows, { Radiology: 60 }), { books: 0, articles: 0, journalTitles: 60 }));
t('invalid figures are refused, not shown', () => { assert.equal(breakdownFor('Nursing', [{ name: 'Nursing', books: -1, articles: 3 }], {}), null); assert.equal(breakdownFor('Nursing', 'x', {}), null); });
t('large numbers use the Indian grouping used elsewhere on the site', () => assert.equal(breakdownLine({ books: 105711, articles: 1197243, journalTitles: 29454 }), 'Books: 1,05,711 · Articles: 11,97,243 · Journal titles: 29,454'));
console.log(`\n${n} passed`);
