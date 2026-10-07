import { renderQuotationDocument } from './quotationHtml';
import type { QuoteRender } from './quotationModel';

/**
 * Print a quotation. It is drawn into an off-screen frame so the browser's print
 * dialog shows the quotation alone — not the admin screen around it.
 */
export function printQuotation(r: QuoteRender): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '794px', height: '1123px', border: '0' });

  frame.onload = async () => {
    const win = frame.contentWindow;
    if (!win) { frame.remove(); return; }
    // The logo, QR and signature must be in before the page is printed.
    await Promise.all(Array.from(win.document.images).map(img =>
      img.complete ? Promise.resolve() : new Promise<void>(done => { img.onload = img.onerror = () => done(); })));
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  frame.srcdoc = renderQuotationDocument(r);
  document.body.appendChild(frame);
}
