/**
 * The rule that fills the empty departments (src/lib/ingestion/books/deptFill.ts). No database, no network: OpenAlex-shaped fixtures.
 *
 *   npx tsx scripts/test-books-dept-fill.ts
 */
import { looksNonEnglish, candidateFromOpenAlex, judgeFill, fillRow, licenceFromOpenAlex, authorsCompatible, abstractOf } from '../src/lib/ingestion/books/deptFill.js';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };

const loc = (over: any = {}) => ({ is_oa: true, license: 'cc-by', landing_page_url: 'https://doi.org/10.3390/books1', raw_type: 'book', version: 'publishedVersion', source: { display_name: 'MDPI eBooks', type: 'ebook platform', host_organization_name: 'MDPI' }, ...over });
const work = (over: any = {}) => ({
  id: 'https://openalex.org/W1', doi: 'https://doi.org/10.3390/books1', display_name: 'Synthesis and Applications of Gold Nanoparticles', publication_year: 2023, language: 'en', type: 'book',
  authorships: [{ author: { display_name: 'Ada Lovelace' } }], primary_location: loc(),
  primary_topic: { display_name: 'Gold and Silver Nanoparticles Synthesis and Applications', field: { display_name: 'Materials Science' } }, topics: [],
  abstract_inverted_index: { Gold: [0], nanoparticles: [1], are: [2], studied: [3] }, ...over,
});
const judge = (w: any, minYear = 2001) => { const c = candidateFromOpenAlex(w)!; return { c, v: judgeFill(c, minYear) }; };

// ── licence ────────────────────────────────────────────────────────────────────────────────────────────────────────────
check('Creative Commons slugs map to the application spelling', licenceFromOpenAlex('cc-by') === 'CC BY' && licenceFromOpenAlex('cc-by-nc-nd') === 'CC BY-NC-ND' && licenceFromOpenAlex('cc-by-sa') === 'CC BY-SA' && licenceFromOpenAlex('cc-by-nc-sa') === 'CC BY-NC-SA' && licenceFromOpenAlex('cc0') === 'CC0');
check('"other-oa", "public-domain", "publisher-specific-oa", nothing: not a licence', ['other-oa', 'public-domain', 'publisher-specific-oa', '', null, undefined, 'cc-by-nd-sa'].every(s => licenceFromOpenAlex(s as any) === null));

// ── the accepted shape ─────────────────────────────────────────────────────────────────────────────────────────────────
const ok = judge(work());
check('a publisher-hosted CC BY book with the word in its title and a matching topic is listed under Nano Technology', ok.v.department === 'Nano Technology' && ok.v.reasons.length === 0, JSON.stringify(ok.v));
const row = fillRow(ok.c, 'Nano Technology', ok.v);
check('the row is link-only metadata: no file, rights MetadataOnly, Published, source OpenAlex, licence and its recorded basis', row.pdfUrl === null && row.rightsStatus === 'MetadataOnly' && row.accessStatus === 'LinkOnly' && row.status === 'Published' && row.source === 'OpenAlex' && row.licence === 'CC BY' && /OpenAlex record licence \(cc-by/.test(row.rightsBasis) && row.ownershipSource === 'Ingested' && row.fingerprint === 'openalex:doi:10.3390/books1');
check('non-commercial licences are flagged non-commercial, commercial-friendly ones are not', fillRow(judge(work({ primary_location: loc({ license: 'cc-by-nc-nd' }) })).c, 'Nano Technology', ok.v).licenceIsNC === true && row.licenceIsNC === false);
check('the abstract is rebuilt in reading order', abstractOf({ b: [1], a: [0], c: [2] }) === 'a b c' && ok.c.book.description === 'Gold nanoparticles are studied nanoparticles'.replace('nanoparticles are studied nanoparticles', 'nanoparticles are studied'));

// ── what is refused, and why ───────────────────────────────────────────────────────────────────────────────────────────
const why = (w: any, minYear?: number) => { const r = judge(w, minYear).v; return r.department ? 'LISTED' : r.reasons.join(' | '); };
check('a book whose title does not name the department is not listed', /title_has_no_department_word/.test(why(work({ display_name: 'Chemistry of Materials' }))));
check('a title naming two of these departments is held for a person, never guessed', /title_names_several_departments/.test(why(work({ display_name: 'Interdisciplinary Nanotechnology' }))));
check('a licence only on a repository copy (the primary record is closed) means no licence', /no_licence_on_own_record/.test(why(work({ primary_location: loc({ is_oa: false, license: null }) }))));
check('an unrecognised licence is named in the reason', /licence_not_recognised:other-oa/.test(why(work({ primary_location: loc({ license: 'other-oa' }) }))));
check('a self-deposit repository (Zenodo) is held, whatever it calls the record', /self_deposit_repository/.test(why(work({ primary_location: loc({ source: { display_name: 'Zenodo (CERN)', type: 'repository' } }) }))));
check('a Zenodo or Figshare DOI is held even when the host is not named', /self_deposit_repository/.test(why(work({ doi: 'https://doi.org/10.5281/zenodo.1', primary_location: loc({ source: { display_name: 'Some Platform', type: 'ebook platform' } }) }))) && /self_deposit_repository/.test(why(work({ doi: 'https://doi.org/10.6084/m9.figshare.1' }))));
check('a record with no identified host is held', /host_not_identified/.test(why(work({ primary_location: loc({ source: null }) }))));
check('a bulk conference-volume publisher and a thesis series are held for a person', /host_held_for_a_person/.test(why(work({ primary_location: loc({ source: { display_name: 'Primedia eLaunch LLC eBooks', type: 'ebook platform' } }) }))) && /host_held_for_a_person/.test(why(work({ primary_location: loc({ source: { display_name: 'Linköping studies in science and technology. Dissertations', type: 'book series' } }) }))));
check('a notebook, dataset or thesis record type is not a book', /record_type_not_book/.test(why(work({ primary_location: loc({ raw_type: 'ComputationalNotebook' }) }))) && /record_type_not_book/.test(why(work({ primary_location: loc({ raw_type: 'info:eu-repo/semantics/doctoralThesis' }) }))));
check('conference volumes, abstracts and proceedings are not whole books', /not_a_whole_book/.test(why(work({ display_name: 'III International Conference on Nanotechnology' }))) && /not_a_whole_book/.test(why(work({ display_name: 'Nanomaterials Abstracts 2024' }))));
check('a proceedings volume whose title is a plain book title but whose author is the conference is held', /conference_as_author/.test(why(work({ display_name: 'Transdisciplinary Engineering for Complex Systems', authorships: [{ author: { display_name: 'ISTE International Conference on Transdisciplinary Engineering 2020' } }, { author: { display_name: 'Pokojski' } }] }))));
check('a forthcoming volume listed under a [Working Title] is not a book yet', /not_published_yet/.test(why(work({ display_name: 'Nanotechnology and Nanodevices Annual Volume 2026 [Working Title]' }))));
check('a chapter is not a whole book', /not_a_whole_book/.test(why(work({ display_name: 'Chapter 4 Nanoparticles in Medicine' }))));
check('not English, no DOI, no year, before the policy year', /language_not_english/.test(why(work({ language: 'de' }))) && /no_doi/.test(why(work({ doi: null }))) && /no_year/.test(why(work({ publication_year: null }))) && /year_before_policy:1999/.test(why(work({ publication_year: 1999 }))));
check('a topic that does not agree holds the book (a nanotechnology title filed under social science)', /topic_disagrees/.test(why(work({ primary_topic: { display_name: 'Higher Education', field: { display_name: 'Social Sciences' } } }))));
check('an article, chapter or dataset record is not even a candidate', candidateFromOpenAlex(work({ type: 'article' })) === null && candidateFromOpenAlex(work({ type: 'book-chapter' })) === null && candidateFromOpenAlex(work({ display_name: '' })) === null);

// ── Ayurveda, Applied Sciences, Multidisciplinary ──────────────────────────────────────────────────────────────────────
const ay = judge(work({ display_name: 'Basic Concepts of Ayurveda', primary_topic: { display_name: 'Traditional medicine studies', field: { display_name: 'Medicine' } } }));
check('Ayurveda needs the word in the title plus a medicine topic', ay.v.department === 'Ayurveda', JSON.stringify(ay.v.reasons));
const ap = judge(work({ display_name: 'Advances in Applied Science and Technology', primary_topic: { display_name: 'Physics and Engineering Research', field: { display_name: 'Engineering' } } }));
check('Applied Sciences accepts an "Applied Science(s)" title with a science or engineering topic', ap.v.department === 'Applied Sciences', JSON.stringify(ap.v.reasons));
check('...but not when the topic is outside the sciences', judge(work({ display_name: 'Applied Sciences in Society', primary_topic: { display_name: 'Cultural Studies', field: { display_name: 'Arts and Humanities' } } })).v.reasons.some(r => /topic_disagrees/.test(r)));
const md = judge(work({ display_name: 'Interdisciplinary Research Journeys', primary_topic: { display_name: 'Interdisciplinary Research and Collaboration', field: { display_name: 'Multidisciplinary' } } }));
check('Multidisciplinary accepts an interdisciplinary-research book', md.v.department === 'Multidisciplinary', JSON.stringify(md.v.reasons));
const claimed = judge(work({ display_name: 'Interdisciplinary Approaches to Nursing Practice', primary_topic: { display_name: 'Interdisciplinary Research and Collaboration', field: { display_name: 'Multidisciplinary' } } }));
check('the department of last resort is not used when a real subject claims the book', claimed.v.department === null && claimed.v.reasons.some(r => /claimed_by_other_department:Nursing/.test(r)), JSON.stringify(claimed.v.reasons));

// ── the short-of-books subject departments ─────────────────────────────────────────────────────────────────────────────
const ms = (title: string, topic: string, field: string) => judge(work({ display_name: title, primary_topic: { display_name: topic, field: { display_name: field } } }), 1980);
check('a subject department takes a book whose title and topic agree (Mechanical Engineering: heat transfer)', ms('Heat Transfer and Fluid Flow in Microstructures', 'Heat transfer and fluid flow', 'Engineering').v.department === 'Mechanical Engineering');
check('the same words in a history or social-science book do not (ceramics and the Spanish conquest)', ms('Ceramics and the Spanish Conquest', 'Archaeological ceramics', 'Arts and Humanities').v.department === null && ms('Petrochemical Planet', 'Oil and society', 'Social Sciences').v.department === null);
check('the year floor is the caller\'s (1980 accepts a 1995 book, 2001 refuses it)', judge(work({ publication_year: 1995 }), 1980).v.reasons.every(r => !/year/.test(r)) && /year_before_policy:1995/.test(judge(work({ publication_year: 1995 }), 2001).v.reasons.join()));
check('a target list restricts the departments (Nano is not a target here)', judgeFill(judge(work()).c, 1980, ['Ayurveda']).reasons.some(r => /department_not_a_target:Nano Technology/.test(r)));

const sf = (title: string, topic: string, subfield: string, field = 'Engineering') => judge(work({ display_name: title, primary_topic: { display_name: topic, field: { display_name: field }, subfield: { display_name: subfield } } }), 2001);
check('no department word in the title: listed when the OpenAlex subfield maps to the department AND the topic wording names it', sf('Lecture Notes on Circuits', 'Power systems and smart grid', 'Electrical and Electronic Engineering').v.department === 'Electrical Engineering');
check('...but not when the subfield maps elsewhere, or the topic wording is silent', sf('Lecture Notes on Circuits', 'Power systems and smart grid', 'Civil and Structural Engineering').v.department === null && sf('Lecture Notes', 'Applications', 'Electrical and Electronic Engineering').v.department === null);

check('a workshop or Italian congress volume, and a title in Italian, are held', /not_a_whole_book/.test(why(work({ display_name: 'International Workshop on Nanotechnology Devices' }))) && /not_a_whole_book/.test(why(work({ display_name: 'Nanomaterials. Atti del XVII Congresso' }))) && /language_not_english/.test(why(work({ display_name: 'Nanotechnology e ricerca' }))));

check('Management and Architecture take books in their own field (the humanities guard is engineering-only)', judge(work({ display_name: 'Strategic Management of Small Firms', primary_topic: { display_name: 'Strategic management', field: { display_name: 'Business, Management and Accounting' }, subfield: { display_name: 'Strategy and Management' } } }), 2001).v.department === 'Management' && judge(work({ display_name: 'Urban Design and Public Space', primary_topic: { display_name: 'Urban design', field: { display_name: 'Social Sciences' }, subfield: { display_name: 'Urban Studies' } } }), 2001).v.department === 'Architecture');

check('Italian, Polish and Indonesian titles are recognised as not English; English business titles are not', ['Conoscere le organizzazioni', 'Proces podejmowania decyzji w organizacjach – teoria i praktyka', 'METODOLOGI PENELITIAN BISNIS', 'Città e territori da vivere oggi e domani'].every(x => looksNonEnglish(x)) && ['Sustainable Supply Chains', 'Leadership Approaches From Classical to Contemporary', 'Contemporary Financial Management', 'The Open City and its Allies'].every(x => !looksNonEnglish(x)));
check('a numbered chapter heading is not a whole book', /not_a_whole_book:numbered_heading/.test(why(work({ display_name: '13.2 Nanotechnology incubators' }))));

// ── authors ────────────────────────────────────────────────────────────────────────────────────────────────────────────
check('authors agree whichever order the names are written', authorsCompatible('Nico Cloete, Peter Maassen', 'Cloete, Nico') && authorsCompatible('Cloete, Nico', 'Maassen, Peter; Cloete, Nico') && authorsCompatible('J. Marsh', 'Marsh, J.'));
check('a missing author on either side agrees (a title twin with nothing to contradict it is held); different people do not', authorsCompatible(null, 'Marsh, J.') && authorsCompatible('Marsh, J.', '') && !authorsCompatible('Jane Different', 'Cloete, Nico'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
