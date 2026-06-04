const fs = require('fs');

async function testOJS() {
  // 1. Get initial cookie
  let initRes = await fetch('https://engineeringjournals.stmjournals.in/index.php/index/login');
  let initCookies = initRes.headers.get('set-cookie');
  let cookieString = initCookies ? initCookies.split(',').map(c => c.split(';')[0]).join('; ') : '';
  
  // 2. Perform Login
  let res = await fetch('https://engineeringjournals.stmjournals.in/index.php/index/login/signIn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      'Cookie': cookieString,
      'Referer': 'https://engineeringjournals.stmjournals.in/index.php/index/login'
    },
    body: 'username=enggstm&password=EEEcal@STM%231&source=' 
  });
  
  // fetch follows redirects. The final url:
  console.log("Final URL after login:", res.url);
  
  let loginHtml = await res.text();
  console.log("Is logged in?", loginHtml.includes('logout') || loginHtml.includes('Log Out'));
  
  // 3. Fetch PDF
  let pdfRes = await fetch('https://engineeringjournals.stmjournals.in/index.php/JoVDTT/article/download/6907/pdf', {
    headers: {
      'Cookie': cookieString,
      'User-Agent': 'Mozilla/5.0'
    }
  });
  
  console.log("PDF Response Type:", pdfRes.headers.get('content-type'));
  
  const buffer = await pdfRes.arrayBuffer();
  const preview = Buffer.from(buffer).slice(0, 100).toString('utf-8');
  console.log("Preview of bytes:", preview);
}

testOJS();
