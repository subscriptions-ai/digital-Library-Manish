async function test() {
  const fetchRes = await fetch(`https://api.crossref.org/works?query=Management&filter=has-full-text:true&select=title,author,abstract,link&rows=5`);
  const data = await fetchRes.json();
  const results = data.message.items;
  for (const item of results) {
    console.log("Title:", item.title?.[0]);
    const pdfLink = item.link?.find((l: any) => l['content-type'] === 'application/pdf');
    console.log("PDF Link:", pdfLink?.URL);
  }
}
test();
