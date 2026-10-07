import { jsPDF } from 'jspdf';
import { TERM_GROUPS, dateDisplay, deptColumns, deptNo, moneyAuto, type QuoteRender, type QuoteTerm } from './quotationModel';
import { phoneLine } from './quotationHtml';

/**
 * The quotation as a PDF, always two pages: page 1 is the quotation (parties, what is bought,
 * tax, payment, signature); page 2 carries the terms in two columns, grouped. Solo and
 * institutional quotations share this layout; what differs is what they say.
 *
 * The layout flows from the top of the page — each block is measured, then drawn — so a
 * quotation with few departments is not left with a gap and one with many does not collide
 * with what follows. The built-in fonts have no rupee sign or typographic dashes, so
 * amounts are written "INR".
 */

export type QuoteAssets = { logo: string; signature: string; qr: string };

const urlToDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
};

let assetCache: Promise<QuoteAssets> | null = null;

/** The logo, signature and UPI QR, fetched once and kept. */
export function loadQuoteAssets(): Promise<QuoteAssets> {
  if (!assetCache) {
    assetCache = Promise.all([
      urlToDataUrl('/assets/quotation/logo.jpg'),
      urlToDataUrl('/assets/quotation/signature.jpg'),
      urlToDataUrl('/assets/quotation/upi-qr.jpg'),
    ]).then(([logo, signature, qr]) => ({ logo, signature, qr }));
    assetCache.catch(() => { assetCache = null; });
  }
  return assetCache;
}

type RGB = [number, number, number];
const W = 595.28;
const H = 841.89;
const ML = 28;
const MR = 567;
const CW = MR - ML;
const NAVY: RGB = [16, 43, 68];
const TEAL: RGB = [8, 122, 126];
const GRAY: RGB = [88, 105, 114];
const SOFT: RGB = [123, 138, 146];
const PALE: RGB = [246, 250, 250];
const TINT: RGB = [232, 246, 246];
const RULE: RGB = [209, 219, 222];
const INK: RGB = [36, 55, 70];
const WHITE: RGB = [255, 255, 255];
/** Below this the page belongs to the footer. */
const BOTTOM = H - 52;

const ascii = (s: unknown): string =>
  String(s ?? '').replace(/₹/g, 'INR ').replace(/\*\*/g, '').replace(/[^\x20-\x7E\u2013\u2014]/g, ' ');

const inr = (n: number, decimals?: number): string => {
  if (decimals === undefined) return moneyAuto(n).replace('₹', 'INR ');
  return 'INR ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/** A word in one weight, for text that has a bold run-in heading. */
type Word = { s: string; bold: boolean };

/**
 * Draw the quotation. `stretch` is extra space added between the blocks of page 1; it is zero on
 * the first pass, which measures how much room is left, so a short quotation is spread over the
 * page instead of being left with an empty band at the bottom.
 */
function draw(r: QuoteRender, assets: QuoteAssets | null, stretch: number, dense = false): { doc: jsPDF; spare: number; spilled: boolean } {
  let spare = 0;
  // True when page 1's content did not fit and a third page had to be started.
  let spilled = false;
  /** A gap, tightened when page 1 is full. */
  const gap = (n: number) => (dense ? Math.round(n * 0.62) : n);
  const g = stretch;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const i = r.issuer;
  const reg = i.registeredName;
  const c = r.customer;

  // ── Helpers (y runs down the page) ──
  const font = (size: number, bold = false, color: RGB = INK) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
  };
  const t = (x: number, y: number, s: string, size = 8, bold = false, color: RGB = INK, align: 'left' | 'right' | 'center' = 'left') => {
    font(size, bold, color); doc.text(ascii(s), x, y, { align });
  };
  const wrap = (s: string, width: number, size: number, bold = false): string[] => {
    font(size, bold);
    const out = (doc.splitTextToSize(ascii(s), width) as string[]).filter(Boolean);
    return out.length ? out : [''];
  };
  const ln = (x1: number, y1: number, x2: number, y2: number, color: RGB = RULE, w = 0.6) => {
    doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(x1, y1, x2, y2);
  };
  const box = (x: number, y: number, w: number, h: number, fill: RGB | null, stroke: RGB | null = RULE, radius = 3) => {
    if (fill) doc.setFillColor(...fill);
    if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(0.6); }
    doc.roundedRect(x, y, w, h, radius, radius, fill && stroke ? 'FD' : fill ? 'F' : 'S');
  };
  const image = (data: string | undefined, x: number, y: number, w: number, h: number) => {
    if (!data) return;
    try { doc.addImage(data, 'JPEG', x, y, w, h); } catch { /* the quotation stands without it */ }
  };
  const band = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W * 0.62, 7, 'F');
    doc.setFillColor(...TEAL); doc.rect(W * 0.62, 0, W * 0.38, 7, 'F');
  };
  const dot = (x: number, y: number) => { doc.setFillColor(...TEAL); doc.circle(x + 2, y - 2.6, 1.6, 'F'); };
  const caption = (x: number, y: number, s: string) => t(x, y, s.toUpperCase(), 6.8, true, SOFT);

  /**
   * The width text is actually drawn at. jsPDF measures with kerning but draws without it, so
   * words placed by its own measure collide ("PRIVATE LIMITED" runs together).
   */
  const tw = (s: string, size: number, bold: boolean) => {
    font(size, bold);
    // jsPDF's `kerning` flag is the wrong way round for this: only `true` gives the unkerned width.
    return doc.getStringUnitWidth(s, { kerning: true } as any) * size * 1.006;
  };

  /** Text with a bold run-in heading, wrapped to a width. */
  const runs = (lead: string | undefined, text: string, width: number, size: number): Word[][] => {
    const words: Word[] = [];
    if (lead) ascii(lead).split(/\s+/).filter(Boolean).forEach(s => words.push({ s, bold: true }));
    ascii(text).split(/\s+/).filter(Boolean).forEach(s => words.push({ s, bold: false }));
    const lines: Word[][] = [];
    let line: Word[] = [];
    let used = 0;
    for (const w of words) {
      const wid = tw(w.s, size, w.bold);
      const space = line.length ? tw(' ', size, false) : 0;
      if (line.length && used + space + wid > width) { lines.push(line); line = []; used = 0; }
      used += (line.length ? space : 0) + wid;
      line.push(w);
    }
    if (line.length) lines.push(line);
    return lines.length ? lines : [[]];
  };
  const drawRuns = (x: number, y: number, lines: Word[][], size: number, lead: number, color: RGB) => {
    lines.forEach((line, n) => {
      let cx = x;
      line.forEach((w, k) => {
        if (k) cx += tw(' ', size, false);
        font(size, w.bold, w.bold ? NAVY : color);
        doc.text(w.s, cx, y + n * lead);
        cx += tw(w.s, size, w.bold);
      });
    });
  };

  // ── Page furniture ──
  const letterhead = (): number => {
    band();
    image(assets?.logo, ML, 20, 64, 64);
    t(104, 38, reg, 16, true, NAVY);
    t(104, 53, 'STM DIGITAL LIBRARY', 10, true, TEAL);
    const legal = [
      `Registered Office: ${i.registeredAddress}`,
      `GSTIN: ${i.gstin}   |   PAN: ${i.pan}   |   CIN: ${i.cin}`,
      `Sales & Marketing Office: ${i.salesOffice}   |   State Code: ${i.salesOfficeStateCode}`,
      `Contact: ${phoneLine(i)}   |   ${i.email}`,
    ].flatMap(l => wrap(l, 340, 7));
    legal.forEach((l, n) => t(104, 66 + n * 9.2, l, 7, false, GRAY));
    t(MR, 42, 'QUOTATION', 23, true, NAVY, 'right');
    wrap(r.title, 170, 8.6, true).forEach((l, n) => t(MR, 58 + n * 11, l, 8.6, true, TEAL, 'right'));
    const end = Math.max(66 + legal.length * 9.2, 92) + 8;
    ln(ML, end, MR, end, NAVY, 1.2);
    return end;
  };
  let pagesAdded = 0;
  const continuation = (heading: string): number => {
    pagesAdded += 1;
    if (heading === 'QUOTATION (CONTINUED)') spilled = true;
    doc.addPage(); band();
    image(assets?.logo, ML, 18, 40, 40);
    t(76, 36, reg, 12, true, NAVY);
    t(76, 49, 'STM DIGITAL LIBRARY', 8, true, TEAL);
    t(MR, 36, heading, 10, true, NAVY, 'right');
    t(MR, 49, `Quotation ${r.quoteNo}`, 7.4, false, GRAY, 'right');
    ln(ML, 66, MR, 66, NAVY, 1);
    return 80;
  };

  const termsHeading = (r.termsHeading ?? 'Commercial Terms & Conditions').toUpperCase();

  // ── Page 1 ──
  let y = letterhead() + 10 + g;

  // The three boxes
  const boxes = [{ x: ML, w: 181, lw: 50 }, { x: ML + 189, w: 182, lw: 50 }, { x: ML + 379, w: 160, lw: 36 }];
  const pad = 10;
  const kv = (b: { x: number; w: number; lw: number }, top: number, label: string, value: string): number => {
    const lines = wrap(value, b.w - pad * 2 - b.lw, 7.8);
    t(b.x + pad, top, label, 6.8, true, SOFT);
    lines.forEach((l, n) => t(b.x + pad + b.lw, top + n * 9.6, l, 7.8, false, NAVY));
    return top + lines.length * 9.6 + 3.5;
  };
  const measureKv = (b: { w: number; lw: number }, value: string) => wrap(value, b.w - pad * 2 - b.lw, 7.8).length * 9.6 + 3.5;
  const has = (s?: string) => !!s && s.trim() !== '' && s.trim().toUpperCase() !== 'N/A';

  const custName = wrap(c.name?.trim() || (r.customerLabel ? 'Customer' : 'Institution Name'), boxes[0].w - pad * 2, 10, true).slice(0, 2);
  const custRows: [string, string][] = [];
  if (has(c.contact)) custRows.push(['Contact', c.contact]);
  if (has(c.designation)) custRows.push(['Designation', c.designation]);
  if (has(c.email)) custRows.push(['Email', c.email]);
  if (has(c.phone)) custRows.push(['Phone', c.phone]);
  const billRows: [string, string][] = [];
  if (has(c.address)) billRows.push(['Address', c.address]);
  billRows.push(['State', c.state?.trim() || 'To be confirmed']);
  billRows.push(['State Code', c.stateCode || '-']);
  if (has(c.gstin)) billRows.push(['GST No.', c.gstin]);
  const metaRows: [string, string][] = [['No.', r.quoteNo || '-'], ['Date', dateDisplay(r.date)], ['Valid Till', dateDisplay(r.validTill)]];

  const h1 = 30 + custName.length * 12 + 4 + custRows.reduce((n, [, v]) => n + measureKv(boxes[0], v), 0);
  const h2 = 30 + billRows.reduce((n, [, v]) => n + measureKv(boxes[1], v), 0);
  const h3 = 30 + metaRows.reduce((n, [, v]) => n + measureKv(boxes[2], v), 0);
  const boxH = Math.max(h1, h2, h3, 76);
  box(boxes[0].x, y, boxes[0].w, boxH, WHITE); box(boxes[1].x, y, boxes[1].w, boxH, PALE); box(boxes[2].x, y, boxes[2].w, boxH, WHITE);
  caption(boxes[0].x + pad, y + 14, r.customerLabel ?? 'Institution / Customer');
  caption(boxes[1].x + pad, y + 14, 'Billing & Tax / Supply Details');
  caption(boxes[2].x + pad, y + 14, 'Quotation Details');
  custName.forEach((l, n) => t(boxes[0].x + pad, y + 29 + n * 12, l, 10, true, NAVY));
  let cy = y + 29 + custName.length * 12 + 2;
  custRows.forEach(([k, v]) => { cy = kv(boxes[0], cy, k, v); });
  let by = y + 31;
  billRows.forEach(([k, v]) => { by = kv(boxes[1], by, k, v); });
  let my = y + 31;
  metaRows.forEach(([k, v]) => { my = kv(boxes[2], my, k, v); });
  y += boxH + gap(14) + g;

  // Title bar
  t(ML, y, r.title, 12.5, true, NAVY);
  t(MR, y, r.subtitle, 7.8, false, SOFT, 'right');
  y += 8;

  // The subscription lines
  const cols = { no: ML, desc: ML + 28, qty: ML + 320, rate: ML + 364, amt: ML + 448 };
  const tableHead = () => {
    doc.setFillColor(...NAVY); doc.rect(ML, y, CW, 20, 'F');
    t(cols.no + 14, y + 13, 'S. No.', 7, true, WHITE, 'center');
    t(cols.desc + 8, y + 13, 'DESCRIPTION / PARTICULARS', 7, true, WHITE);
    t(cols.qty + 22, y + 13, 'QTY', 7, true, WHITE, 'center');
    t(cols.amt - 8, y + 13, 'RATE', 7, true, WHITE, 'right');
    t(MR - 8, y + 13, 'AMOUNT', 7, true, WHITE, 'right');
    y += 20;
  };
  tableHead();
  r.lines.forEach((l, n) => {
    const tl = wrap(l.title, cols.qty - cols.desc - 16, 9, true);
    const sl = l.sub ? wrap(l.sub, cols.qty - cols.desc - 16, 7.6) : [];
    const rh = Math.max(34, 16 + tl.length * 11 + sl.length * 9.4);
    if (y + rh > BOTTOM - 40) { y = continuation('QUOTATION (CONTINUED)'); tableHead(); }
    doc.setDrawColor(...RULE); doc.setLineWidth(0.6);
    doc.rect(ML, y, CW, rh, 'S');
    [cols.desc, cols.qty, cols.rate, cols.amt].forEach(x => ln(x, y, x, y + rh));
    t(cols.no + 14, y + 17, String(n + 1), 8.2, false, GRAY, 'center');
    tl.forEach((s, k) => t(cols.desc + 8, y + 17 + k * 11, s, 9, true, NAVY));
    sl.forEach((s, k) => t(cols.desc + 8, y + 17 + tl.length * 11 + 1 + k * 9.4, s, 7.6, false, GRAY));
    t(cols.qty + 22, y + 17, l.qty, 8.4, false, INK, 'center');
    t(cols.amt - 8, y + 17, inr(l.rate), 8.4, false, INK, 'right');
    t(MR - 8, y + 17, inr(l.amount), 8.8, true, NAVY, 'right');
    y += rh;
  });
  if (!r.lines.length) {
    doc.rect(ML, y, CW, 26, 'S'); t(ML + CW / 2, y + 16, 'No subscription lines.', 8, false, SOFT, 'center'); y += 26;
  }

  // The departments, beneath the line they belong to. When the price depends on departments the
  // customer already holds, they follow the new ones in the same box — shown, never charged.
  type DeptSection = { caption: string; names: string[]; cols: 1 | 2 | 3 | 4; size: number; note?: string };
  const sections: DeptSection[] = [];
  if (r.departments?.length) {
    sections.push({
      caption: `${r.departmentsLabel ?? 'Subscribed departments'} — ${r.departments.length}`,
      names: r.departments, cols: dense && r.departments.length >= 9 ? 3 : deptColumns(r.departments.length), size: 8,
    });
  }
  if (r.existingDepartments) {
    const e = r.existingDepartments;
    const n = e.names.length;
    sections.push({
      caption: `Existing active departments — ${e.count}`,
      names: e.names, cols: dense && n >= 9 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : 1, size: 7.6,
      note: n ? undefined : `${e.count} ${e.count === 1 ? 'department is' : 'departments are'} already active on this account. They count towards the pricing slab and are not charged again.`,
    });
  }
  if (sections.length) {
    const numW = 17;
    const dLead = dense ? 8.8 : 9.6;
    const colGap = 22;
    const laid = sections.map((sec, idx) => {
      const colW = (CW - 20 - colGap * (sec.cols - 1)) / sec.cols;
      const perCol = Math.max(1, Math.ceil(sec.names.length / sec.cols));
      const cells = sec.names.map(d => wrap(d, colW - numW, sec.size));
      // Read down each column, so a list runs in order the way a person reads it.
      const colH = Array.from({ length: sec.cols }, (_, k) => cells.slice(k * perCol, (k + 1) * perCol).reduce((acc, l) => acc + l.length * dLead + (dense ? 2.4 : 3.4), 0));
      const noteLines = sec.note ? wrap(sec.note, CW - 20, 7.6) : [];
      const h = (idx === 0 ? 28 : 24) + Math.max(0, ...colH) + noteLines.length * 9.6;
      return { sec, colW, perCol, cells, noteLines, h };
    });
    const dh = laid.reduce((acc, l) => acc + l.h, 0) + (dense ? 0 : 2);
    if (y + 8 + dh > BOTTOM - 40) y = continuation('QUOTATION (CONTINUED)'); else y += gap(8);
    box(ML, y, CW, dh, PALE);
    let top = y;
    laid.forEach(({ sec, colW, perCol, cells, noteLines }, idx) => {
      if (idx > 0) ln(ML + 10, top + 1, MR - 10, top + 1, RULE, 0.6);
      caption(ML + 10, top + (idx === 0 ? 14 : 15), sec.caption);
      Array.from({ length: sec.cols }, (_, k) => k).forEach(cIdx => {
        let ry = top + (idx === 0 ? 29 : 28);
        const x = ML + 10 + cIdx * (colW + colGap);
        cells.slice(cIdx * perCol, (cIdx + 1) * perCol).forEach((lines, k) => {
          t(x, ry, deptNo(cIdx * perCol + k), sec.size - 0.2, true, TEAL);
          lines.forEach((s2, n) => t(x + numW, ry + n * dLead, s2, sec.size, false, NAVY));
          ry += lines.length * dLead + (dense ? 2.4 : 3.4);
        });
      });
      noteLines.forEach((l, k) => t(ML + 10, top + 29 + k * 9.6, l, 7.6, false, GRAY));
      top += laid[idx].h;
    });
    y += dh;
  }
  y += gap(12) + g;

  // Summary and totals, side by side
  const sumW = 300, totX = ML + sumW + 12, totW = CW - sumW - 12;
  const totals: [string, string, boolean][] = [['Gross Subscription Amount', inr(r.gross), false]];
  if (r.discount > 0) totals.push(['Special Discount / Adjustment', '- ' + inr(r.discount), false]);
  totals.push(['Taxable Subtotal', inr(r.subtotal), true]);
  if (r.tax === 'split') totals.push(['CGST @ 9%', inr(r.cgst, 2), false], ['SGST @ 9%', inr(r.sgst, 2), false]);
  else if (r.tax === 'igst') totals.push(['IGST @ 18%', inr(r.igst, 2), false]);
  else totals.push(['GST @ 18%', inr(r.singleGst ?? 0, 2), false]);
  // The label column is as wide as its longest label, so a long one ("New departments in this
  // quotation") is never cut and the values start in one straight line.
  const labW = Math.max(78, ...r.summary.map(x => tw(x.label, 7.4, false))) + 10;
  const rowGap = dense ? 3 : 5;
  const summary = r.summary.map(s => ({ label: s.label, lines: wrap(s.value, sumW - 20 - labW, 8, true) }));
  const sumH = summary.length ? 28 + summary.reduce((a, s) => a + s.lines.length * 10 + rowGap, 0) : 0;
  const totH = 14 + totals.length * 15 + 10 + 34;
  const rowH = Math.max(sumH, totH);
  if (y + rowH > BOTTOM - 20) y = continuation('QUOTATION (CONTINUED)');

  if (summary.length) {
    box(ML, y, sumW, rowH, PALE);
    caption(ML + 10, y + 15, 'Subscription summary');
    let sy = y + 31;
    summary.forEach(s => {
      t(ML + 10, sy, s.label, 7.4, false, SOFT);
      s.lines.forEach((l, n) => t(ML + 10 + labW, sy + n * 10, l, 8, true, NAVY));
      sy += s.lines.length * 10 + rowGap;
    });
  }
  const tx0 = summary.length ? totX : ML + CW - totW;
  box(tx0, y, totW, rowH, WHITE);
  let ty0 = y + 21;
  totals.forEach(([label, val, strong]) => {
    t(tx0 + 12, ty0, label, 8.2, strong, strong ? NAVY : GRAY);
    t(tx0 + totW - 12, ty0, val, 8.4, strong, strong ? NAVY : INK, 'right');
    ty0 += 15;
  });
  const gtH = 34;
  const gtY = y + rowH - gtH - 8;
  doc.setFillColor(...TINT); doc.setDrawColor(...TEAL); doc.setLineWidth(0.8);
  doc.roundedRect(tx0 + 8, gtY, totW - 16, gtH, 3, 3, 'FD');
  t(tx0 + 20, gtY + 21, 'Grand Total', 10.5, true, NAVY);
  // A large total shrinks to fit rather than running into its label.
  const gtText = inr(r.total, 2);
  const gtSize = Math.min(15, Math.max(10, 15 * (totW - 40 - tw('Grand Total', 10.5, true) - 8) / Math.max(1, tw(gtText, 15, true))));
  t(tx0 + totW - 20, gtY + 22, gtText, gtSize, true, TEAL, 'right');
  y += rowH + gap(13) + g;

  // Payment options, with the signatory in the same band
  const bankW = 262, upiW = 108, sigW = CW - bankW - upiW - 20;
  const bank: [string, string][] = [
    ['In favour of', reg],
    ['Bank', `${i.bank.bankName}, ${i.bank.branch}`],
    ['Account No.', i.bank.accountNumber],
    ['IFSC', i.bank.ifscCode],
    ['Cheque / DD', `Send to ${i.salesOffice}`],
  ];
  const bankLines = bank.map(([, v]) => wrap(v, bankW - 24 - 70, 8.2));
  const qh = 84, qw = qh * (462 / 604);
  const payH = Math.max(dense ? 112 : 126, 34 + bankLines.reduce((a2, l) => a2 + l.length * 10 + (dense ? 5 : 7), 0) + 4, 27 + qh + 10);
  if (y + 14 + payH > BOTTOM) y = continuation('QUOTATION (CONTINUED)');
  t(ML, y + 4, 'PAYMENT OPTIONS', 8.4, true, NAVY);
  ln(ML + 92, y + 1.5, MR - 214, y + 1.5, RULE, 0.8);
  t(MR, y + 4, `${r.termsPointer ?? 'Commercial Terms & Conditions'}: see the next page`, 7, true, SOFT, 'right');
  y += 14;
  const upiX = ML + bankW + 10;
  box(ML, y, bankW, payH, PALE);
  box(upiX, y, upiW, payH, WHITE);
  caption(ML + 12, y + 16, 'Bank transfer / cheque / DD');
  let py = y + 34;
  bank.forEach(([k], n) => {
    t(ML + 12, py, k, 7.4, true, GRAY);
    bankLines[n].forEach((l, m) => t(ML + 82, py + m * 10, l, 8.2, false, NAVY));
    py += Math.max(1, bankLines[n].length) * 10 + (dense ? 5 : 7);
  });
  caption(upiX + 12, y + 16, 'UPI payment');
  image(assets?.qr, upiX + (upiW - qw) / 2, y + 27, qw, qh);
  // The signatory sits with the payment details, not under a gap.
  const sx = upiX + upiW + 10;
  const sBottom = y + payH;
  t(sx + sigW / 2, sBottom - 62, `For ${reg}`, 6.6, false, GRAY, 'center');
  image(assets?.signature, sx + (sigW - 100) / 2, sBottom - 58, 100, 36);
  ln(sx, sBottom - 20, sx + sigW, sBottom - 20, GRAY, 0.6);
  t(sx + sigW / 2, sBottom - 9, 'Authorized Signatory', 7.2, true, NAVY, 'center');
  y += payH + 10;
  if (pagesAdded === 0) spare = BOTTOM - 6 - y;

  {
    // ── Terms: two columns, grouped, numbered as approved ──
    // When the payment block had to move to a second page, the terms follow it there rather
    // than leaving that page mostly empty.
    let ty: number;
    if (pagesAdded > 0) {
      ty = y + 6;
      t(ML, ty, termsHeading, 10, true, NAVY);
      ln(ML, ty + 5, MR, ty + 5, NAVY, 1);
      ty += 14;
    } else {
      ty = continuation(termsHeading);
    }
    const colW = (CW - 20) / 2;
    const SIZE = 7.8, LEAD = 9.7, NUM = 16;
    type Block = { head?: string; lines?: Word[][]; num?: string; h: number };
    let n = 0;
    const flat: Block[] = [];
    let lastGroup = '';
    (r.terms as QuoteTerm[]).forEach(term => {
      const group = term.group || TERM_GROUPS[3];
      if (group !== lastGroup) { flat.push({ head: group, h: 22 }); lastGroup = group; }
      n += 1;
      const lines = runs(term.lead, term.text, colW - NUM, SIZE);
      flat.push({ lines, num: `${n}.`, h: lines.length * LEAD + 4.5 });
    });
    // A heading never ends a column: it travels with the clause after it.
    const atoms: Block[][] = [];
    flat.forEach((b, k) => { if (b.head) atoms.push([b, flat[k + 1]]); else if (!flat[k - 1]?.head) atoms.push([b]); });
    const atomH = (a: Block[]) => a.reduce((s, b) => s + b.h, 0);
    const noteLines = r.specialNote ? wrap('Special Note: ' + r.specialNote, CW - 20, 7.8, true) : [];
    const noteH = noteLines.length ? noteLines.length * 10 + 18 : 0;
    let avail = BOTTOM - ty - noteH;
    const totalH = atoms.reduce((s, a) => s + atomH(a), 0);

    // Fill the left column to about half, then the right; a long set flows on to a new page,
    // where what is left is balanced across the two columns again.
    const colsX = [ML, ML + colW + 20];
    let remaining = totalH;
    const half = () => Math.min(avail, Math.ceil(remaining / 2) + 14);
    let col = 0, cy3 = ty, limit = half(), bottom = ty;
    for (const a of atoms) {
      const h = atomH(a);
      if (cy3 + h > ty + limit && cy3 > ty) {
        if (col === 0) { col = 1; cy3 = ty; limit = avail; }
        else { ty = continuation(`${termsHeading} (CONTINUED)`); avail = BOTTOM - ty; col = 0; cy3 = ty; limit = half(); bottom = ty; }
      }
      for (const b of a) {
        if (b.head) {
          t(colsX[col], cy3 + 12, b.head.toUpperCase(), 7.8, true, NAVY);
          ln(colsX[col], cy3 + 17, colsX[col] + colW, cy3 + 17, TEAL, 0.8);
        } else if (b.lines) {
          t(colsX[col], cy3 + 7.4, b.num!, SIZE, true, TEAL);
          drawRuns(colsX[col] + NUM, cy3 + 7.4, b.lines, SIZE, LEAD, GRAY);
        }
        cy3 += b.h;
        bottom = Math.max(bottom, cy3);
      }
      remaining -= h;
    }
    if (noteLines.length) {
      const ny = bottom + 8;
      box(ML, ny, CW, noteH - 6, PALE);
      noteLines.forEach((l, k) => t(ML + 10, ny + 14 + k * 10, l, 7.8, true, NAVY));
    }
  }

  // ── Footers, once the page count is known ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    ln(ML, H - 42, MR, H - 42, RULE, 0.6);
    t(ML, H - 31, `${reg}   |   GSTIN: ${i.gstin}   |   PAN: ${i.pan}   |   CIN: ${i.cin}`, 6.6, true, GRAY);
    t(MR, H - 31, `Page ${p} of ${total}`, 6.6, true, GRAY, 'right');
    t(ML, H - 21, `Sales & Marketing / Cheque & DD Address: ${i.salesOffice} (Office State Code ${i.salesOfficeStateCode})   |   ${phoneLine(i)}   |   ${i.email}`, 6.4, false, SOFT);
  }
  return { doc, spare, spilled };
}

export function buildQuotationPdf(r: QuoteRender, assets: QuoteAssets | null): jsPDF {
  const first = draw(r, assets, 0);
  // Page 1 is meant to hold everything but the terms. When a long department list or a full
  // summary would push the payment block onto a third page, the blocks are drawn again closer
  // together — two pages are the contract, and spacing is what gives.
  if (first.spilled) return draw(r, assets, 0, true).doc;
  // Five gaps share whatever room page 1 has left, within reason.
  if (first.spare > 30) return draw(r, assets, Math.min(22, first.spare / 5)).doc;
  return first.doc;
}

export const quotationFileName = (r: QuoteRender): string =>
  `${(r.quoteNo || 'STM_Digital_Library_Quotation').replace(/[\\/:*?"<>|\s]+/g, '-')}.pdf`;

/** Build the quotation PDF and hand it to the browser as a download. */
export async function downloadQuotationPdf(r: QuoteRender, fileName?: string): Promise<void> {
  const assets = await loadQuoteAssets().catch(() => null);
  buildQuotationPdf(r, assets).save(fileName || quotationFileName(r));
}

/** The PDF as base64, for attaching to an email. */
export async function quotationPdfBase64(r: QuoteRender): Promise<string> {
  const assets = await loadQuoteAssets().catch(() => null);
  return buildQuotationPdf(r, assets).output('datauristring').split(',')[1];
}
