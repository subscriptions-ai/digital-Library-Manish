/**
 * Catalogue discovery for the AI assistant (src/lib/catalogueDiscovery.ts), against the throwaway database `stm_ingestion_test`.
 * No network, no model: this is the search the assistant's tool runs, called directly.
 *
 *   npx tsx scripts/test-catalogue-discovery.ts
 */
import './support/noRealAi';
import { readFileSync } from 'node:fs';

const real = /^DATABASE_URL=(.*)$/m.exec(readFileSync(new URL('../.env', import.meta.url), 'utf8'))?.[1]?.replace(/^["']|["']$/g, '');
if (!real) throw new Error('no DATABASE_URL in .env');
process.env.DATABASE_URL = real.replace(/\/[^/?]+(\?.*)?$/, '/stm_ingestion_test');
const { ingestionDb: db } = await import('../src/lib/ingestion/db.js');
if ((await db.$queryRawUnsafe<any[]>('select current_database() d'))[0].d !== 'stm_ingestion_test') throw new Error('refusing to run against anything but stm_ingestion_test');
const { discoverCatalogue } = await import('../src/lib/catalogueDiscovery.js');
const { createDepartmentSpellings } = await import('../src/server/departmentSpellings.js');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const RUN = Date.now().toString(36);
const KW = `zqdisc${RUN}`;                 // a word only these rows contain
const ids = { book: [] as string[], journal: [] as string[], article: [] as string[], content: [] as string[] };
const mk = {
  book: async (d: any) => { const r = await db.book.create({ data: { status: 'Published', ...d } as any }); ids.book.push(r.id); return r; },
  journal: async (d: any) => { const r = await db.journal.create({ data: { status: 'Accepted', ...d } as any }); ids.journal.push(r.id); return r; },
  article: async (d: any) => { const r = await db.article.create({ data: { status: 'Published', ...d } as any }); ids.article.push(r.id); return r; },
  content: async (d: any) => { const r = await db.content.create({ data: { status: 'Published', authors: 'Legacy Author', ...d } as any }); ids.content.push(r.id); return r; },
};

try {
  // Radiology holds one of everything, in each visibility state.
  const bookRead = await mk.book({ title: `${KW} Atlas of Chest Imaging`, authors: 'R. Rao', domain: 'Radiology', accessStatus: 'ViewableHere', pdfUrl: 'https://example.invalid/a.pdf', doi: `10.1/${RUN}a` });
  await mk.book({ title: `${KW} Textbook of Radiographic Positioning`, authors: 'S. Iyer', domain: 'Radiology', accessStatus: 'LinkOnly' });
  await mk.book({ title: `${KW} Draft radiology manual`, authors: 'D. Draft', domain: 'Radiology', status: 'Draft' });
  await mk.book({ title: `${KW} Rejected radiology manual`, authors: 'D. Reject', domain: 'Radiology', status: 'Rejected' });
  await mk.journal({ title: `${KW} Journal of Imaging`, domain: 'Radiology', publisherName: 'Imaging Press' });
  await mk.journal({ title: `${KW} Held Journal of Imaging`, domain: 'Radiology', status: 'NeedsReview' });
  await mk.journal({ title: `${KW} Rejected Journal of Imaging`, domain: 'Radiology', status: 'Rejected' });
  await mk.article({ title: `${KW} Dose reduction in CT`, authors: 'K. Nair', domain: 'Radiology', journalName: 'Journal of Imaging', doi: `10.1/${RUN}b`, accessStatus: 'LinkOnly' });
  await mk.article({ title: `${KW} Unpublished CT draft`, authors: 'K. Nair', domain: 'Radiology', status: 'Draft' });
  // The same book also sits in the legacy archive, and one article is listed twice under one DOI.
  await mk.content({ title: `${KW} Atlas of Chest Imaging`, authors: 'R. Rao, A. Co-author', contentType: 'Books', domain: 'Radiology', validationStatus: 'VALID_VIEWABLE', fileUrl: 'https://example.invalid/legacy.pdf' });
  await mk.article({ title: `${KW} Dose reduction in CT (reprint)`, authors: 'K. Nair', domain: 'Radiology', doi: `https://doi.org/10.1/${RUN}b` });
  await mk.content({ title: `${KW} Thesis on mammography`, contentType: 'Theses', domain: 'Radiology', validationStatus: 'VALID_VIEWABLE', fileUrl: 'https://example.invalid/t.pdf' });
  await mk.content({ title: `${KW} Thesis without a working file`, contentType: 'Theses', domain: 'Radiology', fileUrl: 'https://example.invalid/missing.pdf' });
  await mk.content({ title: `${KW} Draft legacy radiology item`, contentType: 'Theses', domain: 'Radiology', status: 'Draft' });
  // Other departments, and an older spelling of one.
  await mk.book({ title: `${KW} Clinical Optics`, authors: 'O. Menon', domain: 'Optometry & Ophthalmology' });
  await mk.book({ title: `${KW} Emergency Care Handbook`, authors: 'E. Das', domain: 'Paramedical Sciences' });
  await mk.book({ title: `${KW} Pathology Primer`, authors: 'P. Roy', domain: 'Medical sciences' });
  await mk.book({ title: `${KW} Contract Law`, authors: 'L. Sen', domain: 'Law' });

  const spellings = createDepartmentSpellings(db as any, 0).expand;
  const find = (o: any) => discoverCatalogue(db, { q: KW, limit: 25, spellings, ...o });
  const titles = (r: any) => r.results.map((x: any) => x.title);

  console.log('\nWhat is listed');
  {
    const r = await find({ department: 'Radiology' });
    check('draft and rejected books, held and rejected journals, draft articles and draft legacy rows are never returned', !titles(r).some((t: string) => /Draft|Rejected|Held|Unpublished/.test(t)), titles(r));
    check('every shelf is searched: a book, a journal, an article and a legacy thesis all come back', ['book', 'journal', 'article', 'legacy'].every(k => r.results.some((x: any) => x.kind === k)), r.results.map((x: any) => x.kind));
    check('matches are counted per shelf from what is public (2 books, 1 journal, 2 articles, 3 archive rows)', r.matches.book === 2 && r.matches.journal === 1 && r.matches.article === 2 && r.matches.legacy === 3, r.matches);
  }

  console.log('\nNo duplicates');
  {
    const r = await find({ department: 'Radiology' });
    const atlas = r.results.filter((x: any) => /Atlas of Chest Imaging/.test(x.title));
    check('a book held in both collections appears once, as the structured record', atlas.length === 1 && atlas[0].kind === 'book', atlas);
    const dose = r.results.filter((x: any) => /Dose reduction in CT/.test(x.title));
    check('one DOI written two ways (bare and as a doi.org link) appears once', dose.length === 1, dose.map((x: any) => x.title));
    check('no record id appears twice', new Set(r.results.map((x: any) => `${x.kind}:${x.id}`)).size === r.results.length);
  }

  console.log('\nNo unsupported full-text claims');
  {
    const r = await find({ department: 'Radiology' });
    const by = (re: RegExp) => r.results.find((x: any) => re.test(x.title));
    check('a book this site serves (ViewableHere with a file) is full_text_here', by(/Atlas of Chest/)?.availability === 'full_text_here');
    check('a book that only links out is a catalogue record', by(/Radiographic Positioning/)?.availability === 'catalogue_record_only');
    check('an article that only links out is a catalogue record', by(/Dose reduction/)?.availability === 'catalogue_record_only');
    check('a journal title is always a catalogue record', by(/Journal of Imaging/)?.availability === 'catalogue_record_only');
    check('a legacy file whose viewer check passed is full_text_here; one that was never checked is not', by(/mammography/)?.availability === 'full_text_here' && by(/without a working file/)?.availability === 'catalogue_record_only');
    check('the note tells the model what it may not say, and that the visitor’s access is unknown', /full_text_here/.test(r.note) && /subscription/.test(r.note));
    check('no field promises access: nothing is called "free", "open" or "available to you"', !/free|open access|available to you/i.test(JSON.stringify(r.results)));
  }

  console.log('\nDepartments: names, aliases, spellings');
  {
    check('the official name finds the department', titles(await find({ department: 'Optometry & Ophthalmology' })).join().includes('Clinical Optics'));
    check('"optometry and ophthalmology" (and for &) finds it too', titles(await find({ department: 'optometry and ophthalmology' })).join().includes('Clinical Optics'));
    const para = await find({ department: 'Paramedical' });
    check('the alias "Paramedical" finds Paramedical Sciences and reports the official name', titles(para).join().includes('Emergency Care') && para.department.official === 'Paramedical Sciences', para.department);
    check('a half-name is not guessed: "Optometry" finds nothing in a department filter', (await find({ department: 'Optometry' })).results.length === 0);
    const med = await find({ department: 'Medical Sciences' });
    check('an older stored spelling ("Medical sciences") is found under the official name, and reported by it', med.results.some((x: any) => /Pathology Primer/.test(x.title) && x.department === 'Medical Sciences'), med.results);
    check('a department filter does not leak another department', !titles(await find({ department: 'Radiology' })).join().includes('Contract Law'));
    const byQuestion = await discoverCatalogue(db, { q: 'Radiology', limit: 25, spellings });
    check('a question that is itself a department name finds what is filed there', byQuestion.results.some((x: any) => x.department === 'Radiology'), byQuestion.results.length);
  }

  console.log('\nShelf filter');
  {
    check('"Books" searches books and the legacy books only', (await find({ department: 'Radiology', contentType: 'Books' })).results.every((x: any) => x.kind === 'book' || (x.kind === 'legacy' && x.contentType === 'Books')));
    const j = await find({ department: 'Radiology', contentType: 'Journals' });
    check('"Journals" returns journal titles only', j.results.length === 1 && j.results[0].kind === 'journal', j.results);
    const t = await find({ department: 'Radiology', contentType: 'Theses' });
    check('a legacy type ("Theses") reads the archive only', t.results.length === 2 && t.results.every((x: any) => x.kind === 'legacy' && x.contentType === 'Theses'), t.results);
    check('a one-letter question returns nothing', (await discoverCatalogue(db, { q: 'a', spellings })).results.length === 0);
  }
} finally {
  await db.book.deleteMany({ where: { id: { in: ids.book } } }).catch(() => {});
  await db.journal.deleteMany({ where: { id: { in: ids.journal } } }).catch(() => {});
  await db.article.deleteMany({ where: { id: { in: ids.article } } }).catch(() => {});
  await db.content.deleteMany({ where: { id: { in: ids.content } } }).catch(() => {});
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
