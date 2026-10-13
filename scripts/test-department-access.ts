/**
 * The pure rules behind the signed-in Department page: which library an account reads in and with what address, and what "latest" and
 * "added today" mean. No database, no network.
 *
 *   npx tsx scripts/test-department-access.ts
 */
import { getLibraryPaths, libraryUrl } from '../src/lib/libraryRoute.js';
import { getDashboardRoute } from '../src/lib/dashboardRoute.js';
import { toItems, latest, addedToday, istDayStart } from '../src/lib/departmentContent.js';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const section = (t: string) => console.log(`\n${t}`);

section('Where each kind of account reads (one rule, derived from its dashboard)');
const reader = { role: 'Subscriber' }, student = { role: 'Student', institutionId: 'i1' }, inst = { role: 'Institution' }, admin = { role: 'SuperAdmin' }, college = { role: 'College', institutionId: 'i1' };
check('a reader browses in the reader dashboard', getLibraryPaths(reader).browse === '/dashboard/library' && getLibraryPaths(reader).viewer === '/dashboard/viewer' && getLibraryPaths(reader).reads);
check('a student of an institution reads in the reader dashboard', getLibraryPaths(student).browse === '/dashboard/library');
check('an institution account reads in the institution’s library', getLibraryPaths(inst).browse === '/institution/explore' && getLibraryPaths(inst).viewer === '/institution/viewer' && getLibraryPaths(inst).membership === '/institution/membership');
check('a college account that belongs to an institution is run from the institution’s', getLibraryPaths(college).browse === '/institution/explore');
check('a staff account has no reading shell: browse is its own workspace', getLibraryPaths(admin).browse === '/admin' && !getLibraryPaths(admin).reads);
check('it never disagrees with the dashboard route', [reader, student, inst, admin, college, { role: 'Publisher' }, { role: 'SalesExecutive' }].every(a => { const home = getDashboardRoute(a), p = getLibraryPaths(a); return p.browse.startsWith(home) || (home === '/dashboard' && p.browse.startsWith('/dashboard')) || (home === '/institution' && p.browse.startsWith('/institution')) || p.browse === home; }));

section('The address that opens the existing library, already narrowed');
check('Browse <Department> Content: the department, nothing else', libraryUrl(reader, { domain: 'Computer / IT' }) === '/dashboard/library?domain=Computer+%2F+IT');
check('the department round-trips through the library’s own address reader', new URLSearchParams(libraryUrl(reader, { domain: 'Computer / IT' }).split('?')[1]).get('domain') === 'Computer / IT');
check('View all Books: department + Books', libraryUrl(reader, { domain: 'Management', kind: 'books' }) === '/dashboard/library?kind=books&domain=Management');
check('View all Articles: department + Articles', libraryUrl(reader, { domain: 'Management', kind: 'articles' }) === '/dashboard/library?kind=articles&domain=Management');
check('Periodicals: the archived shelf, that type, that department', libraryUrl(reader, { domain: 'Law', mode: 'archived', atype: 'Periodicals' }) === '/dashboard/library?mode=archived&domain=Law&atype=Periodicals');
check('an institution account gets the same filters in its own library', libraryUrl(inst, { domain: 'Law', kind: 'books' }) === '/institution/explore?kind=books&domain=Law');
check('no filter: the whole library', libraryUrl(reader) === '/dashboard/library');
check('a staff account is sent to its workspace, filters dropped (they would be bounced)', libraryUrl(admin, { domain: 'Law' }) === '/admin');

section('Latest in a department');
const NOW = Date.parse('2026-10-13T08:00:00Z');                     // 13:30 in India
const TODAY = Date.parse('2026-10-12T20:00:00Z');                   // 01:30 IST on 13 Oct — today in India, yesterday in UTC
const YESTERDAY = Date.parse('2026-10-12T17:00:00Z');                // 22:30 IST on 12 Oct
const art = (id: string, t: number, title = `A ${id}`) => ({ id, title, createdAt: new Date(t).toISOString() });
check('India midnight is 18:30 UTC the day before', istDayStart(NOW) === Date.parse('2026-10-12T18:30:00Z'));
const items = [
  ...toItems('articles', [art('a1', TODAY), art('a2', YESTERDAY), art('a3', YESTERDAY - 3600_000)]),
  ...toItems('books', [art('b1', YESTERDAY + 600_000), { id: 'b2', title: '   ' }, { id: 'b3', title: 'No date' }]),
  ...toItems('periodicals', [{ id: 'p1', title: 'Old periodical', publishedAt: new Date(YESTERDAY - 86_400_000).toISOString() }]),
];
check('an untitled record is not offered', !items.some(i => i.raw.id === 'b2'));
check('an archived row’s date comes from publishedAt', items.find(i => i.raw.id === 'p1')!.addedAt === YESTERDAY - 86_400_000);
check('newest first across shelves', latest(items, 'all', 10).map(i => i.raw.id).join() === 'a1,b1,a2,a3,p1,b3', latest(items, 'all', 10).map(i => i.raw.id).join());
check('Books only shows Books only', latest(items, 'books', 10).every(i => i.shelf === 'books') && latest(items, 'books', 10).length === 2);
check('Articles only shows Articles only', latest(items, 'articles', 10).every(i => i.shelf === 'articles') && latest(items, 'articles', 10).length === 3);
check('Periodicals only shows Periodicals only', latest(items, 'periodicals', 10).map(i => i.raw.id).join() === 'p1');
check('the limit is honoured', latest(items, 'all', 2).length === 2);
check('“added today” uses India’s day, not UTC’s: 01:30 IST counts as today', addedToday(latest(items, 'all', 10), NOW) === true);
check('with nothing from today, it says so (so the page can show the fallback line)', addedToday(latest(items.filter(i => i.raw.id !== 'a1'), 'all', 10), NOW) === false);
check('an empty department yields nothing to show and no crash', latest(toItems('articles', null), 'all', 8).length === 0 && addedToday([], NOW) === false);
check('equal times keep a stable order (the list does not shuffle)', latest(toItems('articles', [art('x', YESTERDAY), art('y', YESTERDAY)]), 'all', 5).map(i => i.raw.id).join() === 'x,y');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
