async function test() {
  const fetchRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=Management%20OPEN_ACCESS:Y&format=json&resultType=core&pageSize=5`);
  const data = await fetchRes.json();
  const results = data.resultList.result;
  for (const result of results) {
    if (result.doi) {
      console.log("Checking DOI:", result.doi);
      const unpRes = await fetch(`https://api.unpaywall.org/v2/${result.doi}?email=admin@stmjournals.com`);
      if (unpRes.ok) {
        const unpData = await unpRes.json();
        console.log("PDF Link:", unpData.best_oa_location?.url_for_pdf);
      }
    }
  }
}
test();
