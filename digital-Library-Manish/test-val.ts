import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-for-dev-only";
const makeValidatorToken = () => jwt.sign({ uid: "__validator__", role: "SuperAdmin" }, JWT_SECRET, { expiresIn: "10m" });

const validateFileViewability = async (
    contentId: string,
    url: string,
    contentType: string
  ) => {
    // Paste exact implementation from server.ts
    const lowerUrl = url.split("?")[0].toLowerCase();
    const isVideo = /\.(mp4|webm|ogg|avi|mov)$/i.test(lowerUrl);
    const isPdf = true;

    try {
      const PORT_INTERNAL = process.env.PORT || 3000;
      const proxyUrl = `http://127.0.0.1:${PORT_INTERNAL}/api/content/${contentId}/proxy-pdf`;
      const validatorToken = makeValidatorToken();

      const proxyCtrl = new AbortController();
      const proxyTid = setTimeout(() => proxyCtrl.abort(), 15000);

      const proxyRes = await fetch(proxyUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${validatorToken}` },
        signal: proxyCtrl.signal as any,
      }).catch(() => null);
      clearTimeout(proxyTid);

      if (!proxyRes) return { isViewable: false, viewerStatus: "Timeout" };
      if (proxyRes.status >= 400) return { isViewable: false, viewerStatus: "Load Failed" };

      if (isVideo) return { isViewable: true, viewerStatus: "Rendered OK" };

      const rawBuf = await proxyRes.arrayBuffer();
      const rawBytes = new Uint8Array(rawBuf.slice(0, 16));
      const magic = new TextDecoder("latin1").decode(rawBytes).substring(0, 5);

      const first16Str = magic.toLowerCase();
      
      console.log({ magic, first16Str });
      
      const isHtml = first16Str.startsWith("<!doc") || first16Str.startsWith("<html") ||
                     first16Str.startsWith("<!-") || first16Str.trimStart().startsWith("<");
                     
      console.log({ isHtml });
                     
      if (isHtml) {
        return {
          isViewable: false,
          viewerStatus: "Load Failed",
          flaggedReason: `HTML webpage`,
        };
      }

      if (isPdf) {
        if (!magic.startsWith("%PDF")) {
          return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: "Not %PDF" };
        }
        return { isViewable: true, viewerStatus: "Rendered OK" };
      }

      return { isViewable: true, viewerStatus: "Rendered OK" };
    } catch (err: any) {
      return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: err?.message };
    }
  };

async function run() {
  const res = await validateFileViewability("06d1473d-f512-44c2-b81d-0941300aa2e6", "https://www.mdpi.com/1424-8220/26/8/2307/pdf", "Periodicals");
  console.log(res);
}
run();
