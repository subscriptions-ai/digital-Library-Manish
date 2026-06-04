const { validateContentUrl } = require('./src/lib/pdfValidator.js');

async function test() {
  const fetchRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=Management%20OPEN_ACCESS:Y&format=json&resultType=core&pageSize=5`);
  const data = await fetchRes.json();
  const results = data.resultList.result;
  for (const result of results) {
    let urlInfo = result.fullTextUrlList?.fullTextUrl?.find((u) => u.documentStyle === 'pdf' && u.site === 'Europe_PMC');
    if (!urlInfo) urlInfo = result.fullTextUrlList?.fullTextUrl?.find((u) => u.documentStyle === 'pdf');
    if (urlInfo && urlInfo.url) {
      console.log("Checking:", urlInfo.url);
      const val = await validateContentUrl(urlInfo.url, 'application/pdf');
      console.log("Result:", val);
    }
  }
}
test();
