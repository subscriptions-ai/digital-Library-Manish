async function test() {
  const query = "Management";
  const res = await fetch(`http://export.arxiv.org/api/query?search_query=all:${query}&start=0&max_results=5`);
  const text = await res.text();
  console.log(text);
}
test();
