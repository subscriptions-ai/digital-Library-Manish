const fetch = require('node-fetch');

async function test() {
  const query = "Management";
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=10`;
  console.log("Fetching:", url);
  try {
    const res = await fetch(url);
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response starts with:", text.substring(0, 100));
  } catch(e) {
    console.error(e);
  }
}
test();
