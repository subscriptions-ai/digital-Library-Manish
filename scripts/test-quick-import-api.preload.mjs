// Loaded into the Quick Import API test's server only. Blocks every outbound request except to this machine and answers the few
// sources the test uses with fixed, per-run records, so no test can reach the internet.
const real = globalThis.fetch;
const RUN = process.env.QI_RUN || 'x';
const SLOW = Number(process.env.QI_SLOW_MS || 0);
const YEAR = new Date().getFullYear();
// ISSNs are unique in the database and the scratch database is never wiped, so each run draws its own four digits.
const H = [...RUN].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 7) + 1000;
const issn = (a, b) => `${H}-${String(a).padStart(2, '0')}${String(b).padStart(2, '0')}`;
const csvRow = (cells) => cells.map(x => `"${x}"`).join(',');
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return real(input, init);
  const u = new URL(url);

  if (u.hostname === 'www.ebi.ac.uk') {
    if (SLOW) await new Promise(r => setTimeout(r, SLOW));
    const q = decodeURIComponent(u.searchParams.get('query') || '');
    const dept = ['Medical Sciences', 'Life Sciences', 'Bio Technology', 'Pharmacy', 'Nursing', 'Dental', 'Physiotherapy', 'Ayurveda'].find(d => q.startsWith(d));
    const page = Number(u.searchParams.get('page') || 1);
    const slug = String(dept || 'x').replace(/\W+/g, '');
    const result = page > 1 ? [] : [1, 2, 3].map(n => ({
      id: `PMC${RUN}${slug}${n}`, pmcid: `PMC${RUN}${slug}${n}`, title: `Quick API ${RUN} ${slug} ${n}`, authorString: 'A. Author', doi: `10.7950/${RUN}.${slug}.${n}`, license: 'cc by',
      journalInfo: { volume: '1', issue: '1', yearOfPublication: YEAR, journal: { title: `Quick API Journal ${RUN} ${slug}`, issn: issn(slug.length, n) } },
      fullTextUrlList: { fullTextUrl: [{ documentStyle: 'pdf', url: `http://127.0.0.1:${process.env.QI_FILE_PORT}/ok.pdf?n=${slug}${n}` }] },
    }));
    return new Response(JSON.stringify({ resultList: { result } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.hostname === 'api.crossref.org') return new Response('down', { status: 503 });
  if (u.hostname === 'doaj.org' && u.pathname === '/csv') {
    const COLS = ['Journal title', 'Journal URL', 'Journal ISSN (print version)', 'Journal EISSN (online version)', 'Publisher', 'Country of publisher', 'Languages in which the journal accepts manuscripts', 'Subjects', 'LCC Codes', 'Keywords', 'Journal license', 'License attributes'];
    const row = (t, issn, lic) => csvRow([t, 'https://j.example', issn, '', 'Pub', 'India', 'EN', 'Medicine', '', '', lic, '']);
    const n = (k) => issn(50 + k, k);
    return new Response([csvRow(COLS), row(`Quick API ${RUN} Nursing One`, n(1), 'CC BY'), row(`Quick API ${RUN} Nursing Two`, n(2), 'CC BY'), row(`Quick API ${RUN} Dental Three`, n(3), 'CC BY')].join('\n'), { status: 200 });
  }
  throw new Error('network blocked in test');
};
