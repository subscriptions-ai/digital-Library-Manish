const fetch = require('node-fetch');

async function testOpenAlex() {
  const query = "Architecture Books";
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=has_oa_hosted_version:true,type:book&per-page=5`;
  console.log("Fetching:", url);
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Total OpenAlex:", data.meta.count);
    for (const work of data.results) {
      console.log("-", work.title, "=>", work.open_access?.oa_url);
    }
  } catch(e) {
    console.error(e);
  }
}

async function testCrossref() {
  const query = "Architecture Books";
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&filter=has-full-text:true&select=title,author,abstract,link&rows=5`;
  console.log("Fetching Crossref:", url);
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Total Crossref:", data.message['total-results']);
    for (const work of data.message.items) {
      const pdf = work.link?.find(l => l['content-type'] === 'application/pdf');
      console.log("-", work.title?.[0], "=>", pdf?.URL);
    }
  } catch(e) {
    console.error(e);
  }
}

testOpenAlex().then(testCrossref);
