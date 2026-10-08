// Loaded into the test server only (see test-ingestion-api.ts). Blocks every outbound request except to this machine,
// and answers the one source the API test uses (Europe PMC) with fixed records. No test can reach the internet.
const real = globalThis.fetch;
const RUN = process.env.API_TEST_RUN || 'x';
const DELAY = Number(process.env.API_TEST_BLOCK_DELAY_MS || 1200);
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return real(input, init);
  if (url.includes('europepmc/webservices/rest/search')) {
    const mk = (n, license, file) => ({
      id: `PMC${RUN}${n}`, pmcid: `PMC${RUN}${n}`, title: `API test article ${RUN} ${n}`, authorString: 'A. Author', doi: `10.7777/${RUN}.${n}`, license,
      journalInfo: { volume: '3', issue: '4', yearOfPublication: new Date().getFullYear(), journal: { title: `API Test Journal ${RUN}`, issn: process.env.API_TEST_ISSN } },
      fullTextUrlList: { fullTextUrl: [{ documentStyle: 'pdf', url: `http://127.0.0.1:${process.env.API_TEST_FILE_PORT}/${file}?n=${n}` }] },
    });
    return new Response(JSON.stringify({ resultList: { result: [mk(1, 'cc by', 'ok.pdf'), mk(2, 'cc by-nc', 'ok.pdf'), mk(3, 'cc by', 'bad.pdf'), mk(4, 'cc by', 'ok.pdf')] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  await new Promise(r => setTimeout(r, DELAY));
  throw new Error('network blocked in test');
};
