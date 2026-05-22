export interface ValidationResult {
  isValid: boolean;
  pdfReachable: boolean;
  pdfMagicBytesOk: boolean;
  contentTypeHeader: string;
  responseStatus: number;
  errors: string[];
  warnings: string[];
}

export async function validateContentUrl(url: string, expectedType: string = 'application/pdf'): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: false,
    pdfReachable: false,
    pdfMagicBytesOk: false,
    contentTypeHeader: '',
    responseStatus: 0,
    errors: [],
    warnings: []
  };

  if (!url) {
    result.errors.push("URL is empty");
    return result;
  }

  try {
    // 1. HEAD request to check reachability and headers without downloading
    const headController = new AbortController();
    const headTimeout = setTimeout(() => headController.abort(), 10000);
    
    let headResponse;
    try {
      headResponse = await fetch(url, { 
        method: 'HEAD', 
        signal: headController.signal as any,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*'
        }
      });
      clearTimeout(headTimeout);
    } catch (e: any) {
      clearTimeout(headTimeout);
      if (e.name === 'AbortError' || e.code === 'ECONNRESET') {
        throw e;
      }
    }

    let targetResponse = headResponse;

    // If HEAD failed or returned 405, use GET with Range header
    if (!targetResponse || targetResponse.status === 405) {
      const getController = new AbortController();
      const getTimeout = setTimeout(() => getController.abort(), 10000);
      
      targetResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-8192',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: getController.signal as any
      });
      clearTimeout(getTimeout);
      
      if (targetResponse.ok) {
        result.pdfReachable = true;
        result.responseStatus = targetResponse.status;
        result.contentTypeHeader = targetResponse.headers.get('content-type') || '';
        
        if (expectedType === 'application/pdf') {
          const ab = await targetResponse.arrayBuffer();
          const buffer = Buffer.from(ab);
          if (buffer.toString('utf8', 0, 5) === '%PDF-') {
            result.pdfMagicBytesOk = true;
          } else {
            result.errors.push("File does not start with PDF magic bytes");
          }
        }
      }
    } else {
      // HEAD succeeded
      result.responseStatus = targetResponse.status;
      result.contentTypeHeader = targetResponse.headers.get('content-type') || '';
      
      if (targetResponse.ok) {
        result.pdfReachable = true;
        
        if (expectedType === 'application/pdf') {
          const rangeController = new AbortController();
          const rangeTimeout = setTimeout(() => rangeController.abort(), 10000);
          
          try {
            const rangeRes = await fetch(url, {
              headers: { 'Range': 'bytes=0-8192', 'User-Agent': 'Mozilla/5.0' },
              signal: rangeController.signal as any
            });
            clearTimeout(rangeTimeout);
            
            if (rangeRes.ok) {
              const ab = await rangeRes.arrayBuffer();
              const buffer = Buffer.from(ab);
              if (buffer.toString('utf8', 0, 5) === '%PDF-') {
                result.pdfMagicBytesOk = true;
              } else {
                result.errors.push("File does not start with PDF magic bytes");
              }
            } else {
              result.warnings.push(`Range request failed with status: ${rangeRes.status}.`);
            }
          } catch (e: any) {
            clearTimeout(rangeTimeout);
            result.warnings.push(`Failed to download magic bytes: ${e.message}`);
          }
        }
      } else {
        result.errors.push(`URL returned non-OK status: ${targetResponse.status}`);
      }
    }

    if (!result.pdfReachable) {
      result.errors.push("URL is not reachable or returned an error.");
    }

    if (expectedType === 'application/pdf') {
      if (!result.contentTypeHeader.toLowerCase().includes('pdf')) {
        result.warnings.push(`Content-Type is '${result.contentTypeHeader}', expected 'application/pdf'`);
      }
      
      if (result.pdfReachable && result.pdfMagicBytesOk) {
        result.isValid = true;
      }
    } else {
      result.isValid = result.pdfReachable;
    }

  } catch (error: any) {
    result.errors.push(`Validation exception: ${error.message}`);
  }

  return result;
}
