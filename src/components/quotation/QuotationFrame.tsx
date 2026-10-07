import { useEffect, useMemo, useRef, useState } from 'react';
import { SHEET_WIDTH, renderQuotationDocument, renderQuotationSheet } from '../../lib/quotation/quotationHtml';
import type { QuoteRender } from '../../lib/quotation/quotationModel';

export type Zoom = 'fit' | number;

/**
 * The quotation sheet, shown exactly as it prints. It lives in a frame so its own
 * styles cannot touch the app (nor the app's, it). The sheet is always laid out at
 * its true A4 width and scaled: `fit` fills the width available (never beyond
 * `maxScale`), or a fixed zoom such as 1 or 1.25 scrolls sideways when it is wider
 * than the space. The frame is loaded once and then updated in place as the form
 * changes, so typing never makes it flicker.
 */
export function QuotationFrame({ render, zoom = 'fit', maxScale = 1, className }: {
  render: QuoteRender; zoom?: Zoom; maxScale?: number; className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(1123);
  const [width, setWidth] = useState(SHEET_WIDTH);
  const [ready, setReady] = useState(false);
  // The first document only; later changes are written into it.
  const initial = useMemo(() => renderQuotationDocument(render), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (!ready || !doc) return;
    doc.body.innerHTML = renderQuotationSheet(render);
    doc.title = render.quoteNo || 'Quotation';
  }, [render, ready]);

  useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (!ready || !doc) return;
    const measure = () => setHeight(doc.documentElement.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(doc.body);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = zoom === 'fit' ? Math.min(maxScale, width / SHEET_WIDTH) : zoom;
  const offset = Math.max(0, (width - SHEET_WIDTH * scale) / 2);

  return (
    <div ref={box} className={className ?? 'w-full'} style={{ overflowX: zoom === 'fit' ? 'hidden' : 'auto', overflowY: 'hidden' }}>
      <div style={{ width: SHEET_WIDTH * scale, height: height * scale, marginLeft: offset }}>
        <iframe
          ref={ref}
          title="Quotation preview"
          srcDoc={initial}
          sandbox="allow-same-origin"
          onLoad={() => setReady(true)}
          style={{ width: SHEET_WIDTH, height, border: 0, display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      </div>
    </div>
  );
}
