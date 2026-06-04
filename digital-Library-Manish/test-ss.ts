async function test() {
  const query = "Electrical Engineering";
  const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=20&fields=title,authors,openAccessPdf`);
  const data = await res.json();
  
  if (data.data) {
    for (const paper of data.data) {
      if (paper.openAccessPdf?.url) {
        console.log("PDF URL:", paper.openAccessPdf.url);
      }
    }
  }
}
test();
