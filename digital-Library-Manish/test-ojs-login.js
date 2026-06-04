const fs = require('fs');

async function testOJS() {
  // 1. Get login page to get any cookies (like OJSSID)
  let res = await fetch('https://engineeringjournals.stmjournals.in/index.php/JoVDTT/login/signIn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'username=enggstm&password=EEEcal@STM#1'
  });
  
  let cookies = res.headers.get('set-cookie');
  console.log("Cookies after login:", cookies);
  
  // Clean up cookies
  let cookieString = '';
  if (cookies) {
    cookieString = cookies.split(',').map(c => c.split(';')[0]).join('; ');
  }
  
  // 2. Fetch the article download link
  let pdfRes = await fetch('https://engineeringjournals.stmjournals.in/index.php/JoVDTT/article/download/6907/pdf', {
    headers: {
      'Cookie': cookieString
    }
  });
  
  console.log("PDF Response Type:", pdfRes.headers.get('content-type'));
  
  // Save first 100 bytes to see what it is
  const buffer = await pdfRes.arrayBuffer();
  const preview = Buffer.from(buffer).slice(0, 100).toString('utf-8');
  console.log("Preview of bytes:", preview);
}

testOJS();
