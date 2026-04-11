const https = require('https');
https.get("https://mdpi-res.com/d_attachment/mathematics/mathematics-14-01243/article_deploy/mathematics-14-01243.pdf?version=1775656897", {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/pdf, text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  }
}, (res) => {
  console.log("Status:", res.statusCode);
  console.log("Headers:", res.headers);
  let bytes = 0;
  res.on('data', d => bytes += d.length);
  res.on('end', () => console.log("Total bytes:", bytes));
});
