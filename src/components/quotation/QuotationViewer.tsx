import { useEffect, useState } from 'react';
import { Download, Maximize2, Printer, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '../ui';
import { cn } from '../../lib/utils';
import type { QuoteRender } from '../../lib/quotation/quotationModel';
import { downloadQuotationPdf } from '../../lib/quotation/quotationPdf';
import { printQuotation } from '../../lib/quotation/quotationPrint';
import { QuotationFrame, type Zoom } from './QuotationFrame';

const ZOOMS: { label: string; value: Zoom }[] = [
  { label: 'Fit Page', value: 'fit' },
  { label: '100%', value: 1 },
  { label: '125%', value: 1.25 },
];

/** Fit Page / 100% / 125%, as one segmented control. */
function ZoomControl({ zoom, onChange }: { zoom: Zoom; onChange: (z: Zoom) => void }) {
  return (
    <div role="group" aria-label="Preview size" className="inline-flex rounded-lg border border-rule bg-surface p-0.5">
      {ZOOMS.map(z => (
        <button
          key={z.label}
          type="button"
          aria-pressed={zoom === z.value}
          onClick={() => onChange(z.value)}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            zoom === z.value ? 'bg-accent text-accent-on' : 'text-ink-2 hover:bg-surface-2',
          )}
        >
          {z.label}
        </button>
      ))}
    </div>
  );
}

/** The quotation on a full screen, for reading it properly. */
function FullPreview({ render, onClose }: { render: QuoteRender; onClose: () => void }) {
  const [zoom, setZoom] = useState<Zoom>('fit');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-2" role="dialog" aria-modal="true" aria-label="Full quotation preview">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface px-4 py-2.5">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-ink">{render.quoteNo || 'Quotation'}</p>
          <ZoomControl zoom={zoom} onChange={setZoom} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => printQuotation(render)}><Printer size={14} aria-hidden="true" />Print</Button>
          <Button size="sm" variant="outline" onClick={() => downloadQuotationPdf(render).catch(() => toast.error('Could not create the PDF.'))}><Download size={14} aria-hidden="true" />Download PDF</Button>
          <Button size="sm" onClick={onClose} autoFocus><X size={14} aria-hidden="true" />Close</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <QuotationFrame render={render} zoom={zoom} maxScale={1.6} />
      </div>
    </div>
  );
}

/**
 * The live preview: a toolbar to change its size or open it full screen, over a
 * scrolling page. The page scrolls inside its own panel, so the form beside it can
 * be edited while the quotation stays in view.
 */
export function QuotationViewer({ render, className }: { render: QuoteRender; className?: string }) {
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [full, setFull] = useState(false);
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Live preview</span>
        <div className="flex items-center gap-2">
          <ZoomControl zoom={zoom} onChange={setZoom} />
          <Button size="sm" variant="outline" onClick={() => setFull(true)}><Maximize2 size={14} aria-hidden="true" />Open Full Preview</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-rule bg-surface-2 p-3 sm:p-4">
        <QuotationFrame render={render} zoom={zoom} />
      </div>
      {full && <FullPreview render={render} onClose={() => setFull(false)} />}
    </div>
  );
}
