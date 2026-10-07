import { TERM_GROUPS, dateDisplay, deptColumns, deptNo, moneyAuto, type QuoteRender } from './quotationModel';

/**
 * The quotation as a page: the same sheet is shown in the builder, opened from a
 * saved quotation, and printed. It is a complete HTML document, so it can sit in
 * an iframe — its styles cannot leak into the app, and printing the frame prints
 * only the quotation. It follows the PDF block for block: letterhead, parties,
 * the subscription line with its departments (new ones, then any the customer already
 * holds), summary beside totals, payment options with the signatory, then the terms in
 * two grouped columns. Solo and institutional quotations share it.
 */

/** The sheet is laid out at this width (A4 at 96 dpi) and scaled to fit wherever it is shown. */
export const SHEET_WIDTH = 794;

export const QUOTE_ASSETS = {
  logo: '/assets/quotation/logo.png',
  signature: '/assets/quotation/signature.png',
  qr: '/assets/quotation/upi-qr.jpg',
};

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));

/** `**bold**` inside a term becomes emphasis; everything else is escaped. */
const inline = (s: string): string => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

/** "0120-4781200 / 4781206 | 9810078958" — the STD code is not repeated for a second landline. */
export const phoneLine = (i: QuoteRender['issuer']): string =>
  `${i.tel.map((t, n) => (n === 0 ? t : t.replace(/^\d+-/, ''))).join(' / ')} | ${String(i.mobile || '').replace(/^\+91-?/, '')}`.replace(/ \| $/, '');

const CSS = `
:root{--navy:#102b44;--teal:#087a7e;--ink:#243746;--gray:#586972;--soft:#7b8a92;--rule:#d1dbde;--pale:#f6fafa;--tint:#e8f6f6}
*{box-sizing:border-box}
html,body{margin:0}
body{background:#eef2f3;font-family:Inter,Arial,Helvetica,sans-serif;color:var(--ink)}
.quote{background:#fff;border:1px solid #ccd7da;border-radius:13px;max-width:794px;margin:0 auto;overflow:hidden;box-shadow:0 9px 28px rgba(16,43,68,.08);font-size:11px}
.qBand{height:9px;background:linear-gradient(90deg,#102b44 0 62%,#087a7e 62%)}
.qInner{padding:26px 30px 22px}
.cap{font-size:8.5px;color:var(--soft);text-transform:uppercase;font-weight:800;letter-spacing:.5px}

/* Letterhead */
.qHeader{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;padding-bottom:12px;border-bottom:2px solid var(--navy)}
.quoteBrand{display:flex;align-items:flex-start;gap:14px}
.qLogo{width:78px;height:78px;object-fit:contain;background:#fff;border-radius:50%;flex:0 0 78px}
.companyName{font-size:22px;font-weight:900;color:var(--navy);letter-spacing:.2px;line-height:1.15}
.productName{font-size:12.5px;font-weight:900;color:var(--teal);margin-top:4px}
.legal{font-size:10px;color:var(--gray);line-height:1.6;margin-top:6px}
.legal strong{color:var(--ink)}
.qMeta{text-align:right}
.qMeta .title{font-size:29px;font-weight:900;color:var(--navy);letter-spacing:1px;line-height:1}
.qMeta .kind{margin-top:7px;font-size:11px;font-weight:800;color:var(--teal)}

/* Parties */
.qInfoGrid{display:grid;grid-template-columns:1fr 1fr 1.12fr;gap:10px;margin-top:14px}
.qInfoBox{border:1px solid var(--rule);border-radius:9px;padding:11px 13px;background:#fff}
.qInfoBox.alt{background:var(--pale)}
.qInfoBox .cap{margin-bottom:7px}
.qInfoBox .main{font-size:13px;font-weight:900;color:var(--navy);line-height:1.3;margin-bottom:5px}
.infoLine{display:grid;grid-template-columns:62px 1fr;gap:6px;font-size:10px;line-height:1.45;margin:3px 0;color:var(--navy);overflow-wrap:anywhere}
.infoLine b{color:var(--soft);font-size:9px;text-transform:none;font-weight:700}

/* What is bought */
.qTitle{display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin:18px 0 8px}
.qTitle h2{margin:0;font-size:18px;color:var(--navy)}
.qTitle span{font-size:10px;color:var(--soft)}
.quote table{width:100%;border-collapse:collapse}
.quote th{background:var(--navy);color:#fff;font-size:9px;text-transform:uppercase;text-align:left;padding:9px;letter-spacing:.3px}
.quote td{padding:11px 10px;border:1px solid var(--rule);font-size:11px;vertical-align:top}
.quote td.num{text-align:right;white-space:nowrap}
.quote td.qty{text-align:center;width:70px;color:var(--gray)}
.descStrong{font-weight:900;color:var(--navy);font-size:12px;line-height:1.35}
.descSub{font-size:10px;color:var(--gray);margin-top:3px;line-height:1.5}
.empty{text-align:center;color:#879299}
.depts{margin-top:8px;border:1px solid var(--rule);border-radius:7px;background:var(--pale);padding:10px 12px}
.depts .cap{margin-bottom:7px}
.depts ul{list-style:none;margin:0;padding:0;column-gap:26px}
.depts-in ul{column-count:1}
.depts-in.two ul{column-count:2}
.depts-in.three ul{column-count:3}
.depts .sep{height:1px;background:var(--rule);margin:10px 0 9px}
.depts-in.existing li{font-size:9.8px}
.depts p{margin:0;font-size:10px;color:var(--gray);line-height:1.5}
.depts li{display:grid;grid-template-columns:22px 1fr;gap:4px;font-size:10.5px;line-height:1.4;color:var(--navy);margin:0 0 4px;break-inside:avoid}
.depts li i{font-style:normal;font-weight:800;color:var(--teal);font-variant-numeric:tabular-nums}

/* Summary beside totals */
.qTotals{display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-top:12px}
.qCard{border:1px solid var(--rule);border-radius:9px;padding:13px 15px;background:#fff}
.qCard.alt{background:var(--pale)}
.qCard .cap{margin-bottom:9px}
.sumRow{display:grid;grid-template-columns:150px 1fr;gap:8px;font-size:10.5px;line-height:1.45;margin:5px 0}
.sumRow span{color:var(--soft)}
.sumRow b{color:var(--navy);font-weight:800}
.totRow{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--gray);margin:6px 0}
.totRow b{font-weight:600;color:var(--ink)}
.totRow.strong,.totRow.strong b{color:var(--navy);font-weight:800}
.grand{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:11px 14px;border:1.5px solid var(--teal);border-radius:8px;background:var(--tint)}
.grand span{font-size:13px;font-weight:800;color:var(--navy)}
.grand b{font-size:21px;font-weight:900;color:var(--teal)}

/* Payment */
.payHead{display:flex;align-items:center;gap:10px;margin-top:18px}
.payHead h3{margin:0;font-size:11px;letter-spacing:.5px;color:var(--navy);text-transform:uppercase}
.payHead i{flex:1;height:1px;background:var(--rule)}
.payHead span{font-size:9.5px;font-weight:800;color:var(--soft)}
.payGrid{display:grid;grid-template-columns:1.9fr .85fr 1.05fr;gap:10px;margin-top:9px;align-items:stretch}
.payBox{border:1px solid var(--rule);border-radius:9px;padding:12px 14px;background:#fff}
.payBox.alt{background:var(--pale)}
.payBox .cap{margin-bottom:8px}
.bankGrid{display:grid;grid-template-columns:78px 1fr;gap:6px 8px;font-size:10.5px;color:var(--navy);line-height:1.4}
.bankGrid b{color:var(--gray);font-size:9.5px}
.upiBox{display:flex;flex-direction:column;align-items:center}
.upiBox .cap{align-self:flex-start}
.qrImage{width:84px;height:auto;display:block;border:1px solid #e2e7e8;border-radius:8px;padding:3px;background:#fff}
.signBox{display:flex;flex-direction:column;justify-content:flex-end;text-align:center;font-size:9.5px;color:var(--soft)}
.signImg{display:block;width:118px;height:42px;object-fit:contain;margin:4px auto 3px}
.signLine{border-top:1px solid #69767b;padding-top:5px;font-weight:900;color:var(--navy);font-size:10px}

/* Terms */
.terms{margin-top:18px;border-top:1px solid var(--rule);padding-top:13px}
.terms>h3{font-size:13px;color:var(--navy);margin:0 0 4px}
.termCols{column-count:2;column-gap:26px}
.tgroup{break-inside:auto}
.tgroup h4{margin:12px 0 6px;padding-bottom:4px;border-bottom:1.5px solid var(--teal);font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--navy);break-after:avoid}
.tgroup ol{margin:0;padding:0;list-style:none}
.tgroup li{display:grid;grid-template-columns:20px 1fr;font-size:10px;color:var(--gray);line-height:1.5;margin:0 0 6px;break-inside:avoid}
.tgroup li i{font-style:normal;font-weight:800;color:var(--teal)}
.tgroup li strong{color:var(--navy)}
.specialNote{margin-top:12px;padding:9px 12px;background:var(--pale);border:1px solid var(--rule);border-radius:7px;font-size:10px;color:var(--navy);font-weight:700;line-height:1.5}

/* Footer */
.qFooter{margin-top:16px;padding-top:9px;border-top:1px solid var(--rule);font-size:8.5px;line-height:1.6;color:var(--soft)}
.qFooter strong{color:var(--gray)}

@media print{
  @page{size:A4 portrait;margin:8mm}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{background:#fff}
  .quote{border:0;border-radius:0;box-shadow:none;width:100%;max-width:none;font-size:10pt}
  .qInner{padding:6mm}.qBand{height:4mm}
  .qInfoBox,.qCard,.payBox,tr,.depts{break-inside:avoid}
  .terms{break-before:page;margin-top:0;border-top:0;padding-top:0}
}
`;

const row = (l: QuoteRender['lines'][number], n: number) =>
  `<tr><td class="qty">${n}</td><td><div class="descStrong">${esc(l.title)}</div>${l.sub ? `<div class="descSub">${esc(l.sub)}</div>` : ''}</td>`
  + `<td class="qty">${esc(l.qty)}</td><td class="num">${moneyAuto(l.rate)}</td><td class="num"><strong>${moneyAuto(l.amount)}</strong></td></tr>`;

/** An optional fact is shown only when there is one; a blank is not "N/A". */
const has = (s?: string) => !!s && s.trim() !== '' && s.trim().toUpperCase() !== 'N/A';
const line = (label: string, value?: string) => (has(value) ? `<div class="infoLine"><b>${label}</b><span>${esc(value)}</span></div>` : '');

/** The terms, grouped, with the clause numbers running straight through. */
function termsHtml(r: QuoteRender): string {
  let n = 0;
  const groups: string[] = [];
  const order = [...TERM_GROUPS] as string[];
  const names = [...new Set(r.terms.map(t => t.group || TERM_GROUPS[3]))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const name of names) {
    // Clauses stay in their approved order: a group is a contiguous run, so numbers never jump.
    const items = r.terms.filter(t => (t.group || TERM_GROUPS[3]) === name).map(t => {
      n += 1;
      return `<li><i>${n}.</i><span>${t.lead ? `<strong>${esc(t.lead)}</strong> ` : ''}${inline(t.text)}</span></li>`;
    });
    groups.push(`<div class="tgroup"><h4>${esc(name)}</h4><ol>${items.join('')}</ol></div>`);
  }
  return groups.join('');
}

/** The department box: the new (or subscribed) departments, then any the customer already holds. */
function deptsHtml(r: QuoteRender): string {
  const list = (names: string[], cols: number, existing = false) =>
    `<div class="depts-in${cols === 3 ? ' three' : cols === 2 ? ' two' : ''}${existing ? ' existing' : ''}"><ul>${names.map((d, n) => `<li><i>${deptNo(n)}</i><span>${esc(d)}</span></li>`).join('')}</ul></div>`;
  const parts: string[] = [];
  if (r.departments?.length) {
    parts.push(`<div class="cap">${esc(r.departmentsLabel ?? 'Subscribed departments')} &mdash; ${r.departments.length}</div>${list(r.departments, deptColumns(r.departments.length))}`);
  }
  if (r.existingDepartments) {
    const e = r.existingDepartments;
    const n = e.names.length;
    parts.push(`<div class="cap">Existing active departments &mdash; ${e.count}</div>${n
      ? list(e.names, n >= 5 ? 3 : n >= 3 ? 2 : 1, true)
      : `<p>${e.count} ${e.count === 1 ? 'department is' : 'departments are'} already active on this account. They count towards the pricing slab and are not charged again.</p>`}`);
  }
  return parts.length ? `<div class="depts">${parts.join('<div class="sep"></div>')}</div>` : '';
}

/** The quotation sheet alone, without the document wrapper. */
export function renderQuotationSheet(r: QuoteRender): string {
  const c = r.customer;
  const i = r.issuer;
  const regName = esc(i.registeredName);
  const taxRows = r.tax === 'split'
    ? `<div class="totRow"><span>CGST @ 9%</span><b>${money2(r.cgst)}</b></div><div class="totRow"><span>SGST @ 9%</span><b>${money2(r.sgst)}</b></div>`
    : r.tax === 'igst'
      ? `<div class="totRow"><span>IGST @ 18%</span><b>${money2(r.igst)}</b></div>`
      : `<div class="totRow"><span>GST @ 18%</span><b>${money2(r.singleGst ?? 0)}</b></div>`;
  const phone = esc(phoneLine(i));

  const termsTitle = esc(r.termsHeading ?? 'Commercial Terms & Conditions');
  const terms = `<div class="terms"><h3>${termsTitle}</h3><div class="termCols">${termsHtml(r)}</div>${r.specialNote ? `<div class="specialNote">Special Note: ${esc(r.specialNote)}</div>` : ''}</div>`;

  return `<div class="quote"><div class="qBand"></div><div class="qInner">
<div class="qHeader"><div class="quoteBrand"><img class="qLogo" src="${QUOTE_ASSETS.logo}" alt="STM Digital Library"><div>
<div class="companyName">${regName}</div><div class="productName">STM DIGITAL LIBRARY</div>
<div class="legal">Registered Office: ${esc(i.registeredAddress)}<br>GSTIN: <strong>${esc(i.gstin)}</strong> &nbsp;|&nbsp; PAN: <strong>${esc(i.pan)}</strong> &nbsp;|&nbsp; CIN: <strong>${esc(i.cin)}</strong><br>Sales &amp; Marketing Office: ${esc(i.salesOffice)} &nbsp;|&nbsp; State Code: <strong>${esc(i.salesOfficeStateCode)}</strong><br>Contact: ${phone} &nbsp;|&nbsp; ${esc(i.email)}</div></div></div>
<div class="qMeta"><div class="title">QUOTATION</div><div class="kind">${esc(r.title)}</div></div></div>
<div class="qInfoGrid">
<div class="qInfoBox"><div class="cap">${esc(r.customerLabel ?? 'Institution / Customer')}</div><div class="main">${esc(c.name?.trim() || (r.customerLabel ? 'Customer' : 'Institution Name'))}</div>
${line('Contact', c.contact)}${line('Designation', c.designation)}${line('Email', c.email)}${line('Phone', c.phone)}</div>
<div class="qInfoBox alt"><div class="cap">Billing &amp; Tax / Supply Details</div>
${line('Address', c.address)}${line('State', c.state?.trim() || 'To be confirmed')}${line('State Code', c.stateCode || '-')}${line('GST No.', c.gstin)}</div>
<div class="qInfoBox"><div class="cap">Quotation Details</div>
${line('No.', r.quoteNo || '-')}${line('Date', dateDisplay(r.date))}${line('Valid Till', dateDisplay(r.validTill))}</div>
</div>
<div class="qTitle"><h2>${esc(r.title)}</h2><span>${esc(r.subtitle)}</span></div>
<table><thead><tr><th style="width:48px;text-align:center">S. No.</th><th>Description / Particulars</th><th style="width:70px;text-align:center">Qty</th><th style="width:100px;text-align:right">Rate</th><th style="width:110px;text-align:right">Amount</th></tr></thead>
<tbody>${r.lines.length ? r.lines.map((l, n) => row(l, n + 1)).join('') : '<tr><td colspan="5" class="empty">Select at least one department to build the quotation.</td></tr>'}</tbody></table>
${deptsHtml(r)}
<div class="qTotals">
${r.summary.length ? `<div class="qCard alt"><div class="cap">Subscription summary</div>${r.summary.map(s => `<div class="sumRow"><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('')}</div>` : '<div></div>'}
<div class="qCard"><div class="totRow"><span>Gross Subscription Amount</span><b>${moneyAuto(r.gross)}</b></div>
${r.discount > 0 ? `<div class="totRow"><span>Special Discount / Adjustment</span><b>- ${moneyAuto(r.discount)}</b></div>` : ''}
<div class="totRow strong"><span>Taxable Subtotal</span><b>${moneyAuto(r.subtotal)}</b></div>${taxRows}
<div class="grand"><span>Grand Total</span><b>${money2(r.total)}</b></div></div>
</div>
<div class="payHead"><h3>Payment options</h3><i></i><span>${esc(r.termsPointer ?? 'Commercial Terms & Conditions')}: see below</span></div>
<div class="payGrid">
<div class="payBox alt"><div class="cap">Bank transfer / cheque / DD</div><div class="bankGrid">
<b>In favour of</b><span>${regName}</span><b>Bank</b><span>${esc(i.bank.bankName)}, ${esc(i.bank.branch)}</span>
<b>Account No.</b><span>${esc(i.bank.accountNumber)}</span><b>IFSC</b><span>${esc(i.bank.ifscCode)}</span><b>Cheque / DD</b><span>Send to ${esc(i.salesOffice)}</span></div></div>
<div class="payBox upiBox"><div class="cap">UPI payment</div><img class="qrImage" src="${QUOTE_ASSETS.qr}" alt="UPI payment QR code"></div>
<div class="signBox"><div>For ${regName}</div><img class="signImg" src="${QUOTE_ASSETS.signature}" alt="Authorized Signature"><div class="signLine">Authorized Signatory</div></div>
</div>
${terms}
<div class="qFooter"><strong>${regName}</strong> &nbsp;|&nbsp; GSTIN: ${esc(i.gstin)} &nbsp;|&nbsp; PAN: ${esc(i.pan)} &nbsp;|&nbsp; CIN: ${esc(i.cin)}<br>Sales &amp; Marketing / Cheque &amp; DD Address: ${esc(i.salesOffice)} (Office State Code ${esc(i.salesOfficeStateCode)}) &nbsp;|&nbsp; ${phone} &nbsp;|&nbsp; ${esc(i.email)}</div>
</div></div>`;
}

const money2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A complete HTML document for the quotation — what the preview frame and Print show. */
export function renderQuotationDocument(r: QuoteRender): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.quoteNo || 'Quotation')}</title><style>${CSS}</style></head><body>${renderQuotationSheet(r)}</body></html>`;
}
