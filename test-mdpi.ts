import jwt from 'jsonwebtoken';
import 'dotenv/config';

async function run() {
  const PORT_INTERNAL = process.env.PORT || 3000;
  const contentId = "06d1473d-f512-44c2-b81d-0941300aa2e6"; 
  const proxyUrl = `http://127.0.0.1:${PORT_INTERNAL}/api/content/${contentId}/proxy-pdf`;
  const validatorToken = jwt.sign({ uid: "__validator__", role: "SuperAdmin" }, process.env.JWT_SECRET || "your-fallback-secret-for-dev-only", { expiresIn: "10m" });
  
  console.log("Fetching:", proxyUrl);
  try {
    const proxyRes = await fetch(proxyUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${validatorToken}` },
    });
    
    console.log("Status:", proxyRes.status);
    console.log("Headers:", proxyRes.headers);
    
    if (proxyRes.ok) {
        const rawBuf = await proxyRes.arrayBuffer();
        console.log("Size:", rawBuf.byteLength);
        const rawBytes = new Uint8Array(rawBuf.slice(0, 16));
        const magic = new TextDecoder("latin1").decode(rawBytes).substring(0, 5);
        console.log("Magic bytes:", JSON.stringify(magic));
        console.log("First 16 chars:", new TextDecoder("latin1").decode(rawBytes));
    } else {
        const text = await proxyRes.text();
        console.log("Error body:", text);
    }
  } catch (err) {
      console.error(err);
  }
}
run();
