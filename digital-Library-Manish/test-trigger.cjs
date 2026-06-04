async function trigger() {
  const fetch = (await import('node-fetch')).default;
  
  const res = await fetch('http://localhost:3000/api/admin/extraction/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: "AI Extractor Test - Management",
      sourceType: "AutomatedMassScraper",
      targetDomain: "Management",
      targetContentType: "Periodicals"
    })
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log("API Trigger Success:", data);
  } else {
    console.log("API Trigger Failed:", await res.text());
  }
}

trigger();
