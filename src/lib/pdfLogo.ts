/**
 * The seal for the top of a generated PDF.
 *
 * The logo is a ~200 KB base64 string, so it is fetched only when a PDF is actually being made
 * rather than being carried in the main bundle. A PDF is still produced if it cannot be loaded.
 */
export async function loadPdfLogo(): Promise<string | null> {
  try {
    return (await import('../logoBase64')).STM_LOGO_BASE64;
  } catch {
    return null;
  }
}
