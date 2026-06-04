async function test() {
  let baseUrl = 'https://engineeringjournals.stmjournals.in';
  let initRes = await fetch(`${baseUrl}/index.php/index/login`);
  let initCookies = initRes.headers.get('set-cookie');
  let cookieString = initCookies ? initCookies.split(',').map(c => c.split(';')[0]).join('; ') : '';
  console.log("Initial Cookie:", cookieString);
  
  let loginRes = await fetch(`${baseUrl}/index.php/index/login/signIn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      'Cookie': cookieString,
      'Referer': `${baseUrl}/index.php/index/login`
    },
    // redirect: 'follow' is default
    body: 'username=enggstm&password=EEEcal@STM%231&source=' 
  });
  
  console.log("Login Status (after redirects):", loginRes.status);
  
  // NOTE: the cookieString (OJSSID) didn't change in curl, so we just use it again
  let pdfResponse = await fetch('https://engineeringjournals.stmjournals.in/index.php/JoVDTT/article/download/1602/pdf', {
    headers: { 'Cookie': cookieString, 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow'
  });
  
  console.log("PDF Content-Type:", pdfResponse.headers.get('content-type'));
}
test();
