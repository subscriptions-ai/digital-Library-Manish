import { COMPANY_DETAILS } from '../../config';

/**
 * The email that carries a quotation (the PDF is attached; this is the body).
 *
 * One palette, used everywhere: ink #0F172B and brand blue #1B5DFC, on white and a pale neutral, with one very light blue tint to lift the
 * total. Every section is the same shape (a small blue label, then a bordered card) so nothing competes with anything else. The layout is
 * tables with inline styles, which is what Gmail and the desktop clients honour; the only <style> is a small media query that lets
 * the card narrow on a phone, and the email still reads correctly where it is ignored.
 *
 * The logo is referenced as `src="cid:stm-logo"` exactly: the server attaches the file under that content id, and swaps the attribute for
 * a public address in the copy it stores for viewing in a browser.
 *
 * Pure: values in, HTML out. See scripts/preview-quotation-email.ts to look at it, and scripts/test-quotation-email.ts.
 */

const INK = '#0F172B';
const BLUE = '#1B5DFC';
const TEXT = '#334155';       // body copy
const MUTED = '#64748B';      // labels, small print
const RULE = '#E2E8F0';       // borders and dividers
const SURFACE = '#F8FAFC';    // card background
const TINT = '#EEF3FF';       // the one tint, for the total
const TINT_RULE = '#CBDAFE';
const PAGE = '#F1F5F9';
const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";

/** Every colour the template may use. A test holds the markup to this list. */
export const QUOTATION_EMAIL_PALETTE = [INK, BLUE, TEXT, MUTED, RULE, SURFACE, TINT, TINT_RULE, PAGE, '#FFFFFF', '#93B4FF'] as const;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[m]);
const money = (n: number) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export type QuotationEmailInput = {
  /** A logo file is attached as cid:stm-logo. */
  hasLogo: boolean;
  recipientName: string;
  quotationNumber: string;
  /** Already formatted for reading, e.g. "23 Oct 2026". */
  issuedDate: string;
  validityDays: number;
  duration: string;
  departments: string[];
  /** Rupees off the gross; 0 or less hides the line. */
  discount: number;
  /** Rupees, GST included. */
  total: number;
};

/** A section: a small blue label over a bordered card. */
const section = (label: string, inner: string) =>
  `<tr><td class="px" style="padding:0 40px 24px;">` +
  `<p style="margin:0 0 10px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${BLUE};">${label}</p>` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border:1px solid ${RULE};border-radius:10px;">` +
  `<tr><td style="padding:6px 20px;">${inner}</td></tr></table></td></tr>`;

/** Label on the left, value on the right, a hairline between rows. */
const rows = (pairs: [string, string, boolean?][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
  pairs.map(([k, v, bold], i) =>
    `<tr><td style="padding:11px 0;font-size:13px;line-height:18px;color:${MUTED};width:42%;vertical-align:top;${i ? `border-top:1px solid ${RULE};` : ''}">${k}</td>` +
    `<td style="padding:11px 0;font-size:13px;line-height:18px;color:${INK};font-weight:${bold ? 700 : 600};text-align:right;vertical-align:top;${i ? `border-top:1px solid ${RULE};` : ''}">${v}</td></tr>`
  ).join('') + `</table>`;

export function buildQuotationEmailHtml(p: QuotationEmailInput): string {
  const co = COMPANY_DETAILS;
  const year = new Date().getFullYear();

  const logo = p.hasLogo
    ? `<img src="cid:stm-logo" alt="STM Digital Library" width="64" height="64" style="display:block;width:64px;height:64px;border:0;border-radius:50%;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:64px;height:64px;background:${BLUE};border-radius:50%;text-align:center;font-size:16px;font-weight:800;letter-spacing:1px;color:#FFFFFF;">STM</td></tr></table>`;

  // Two columns, so fourteen departments do not become a very tall list.
  const depts = p.departments.length ? p.departments : ['—'];
  const deptCells = (list: string[]) => list.map(d =>
    `<td style="padding:5px 8px 5px 0;font-size:13px;line-height:18px;color:${INK};vertical-align:top;width:50%;"><span style="color:${BLUE};font-weight:700;">&#10003;</span>&nbsp; ${esc(d)}</td>`).join('');
  const deptRows: string[] = [];
  for (let i = 0; i < depts.length; i += 2) {
    const pair = depts.slice(i, i + 2);
    if (pair.length === 1) pair.push('');
    deptRows.push(`<tr>${pair.map(d => d ? deptCells([d]) : `<td style="width:50%;"></td>`).join('')}</tr>`);
  }
  const departmentBlock =
    `<p style="margin:0 0 6px;font-size:13px;line-height:18px;color:${MUTED};">Selected department${p.departments.length === 1 ? '' : 's'}` +
    `${p.departments.length > 1 ? ` &middot; ${p.departments.length}` : ''}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${deptRows.join('')}</table>`;

  const details =
    rows([
      ['Quotation number', esc(p.quotationNumber), true],
      ['Quotation date', esc(p.issuedDate)],
      ['Valid for', `${esc(p.validityDays)} days from issue`],
      ['Subscription duration', esc(p.duration)],
    ]) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr><td style="padding-top:12px;">${departmentBlock}</td></tr></table>` +
    (p.discount > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr>` +
        `<td style="padding:11px 0;font-size:13px;line-height:18px;color:${MUTED};">Special discount / adjustment</td>` +
        `<td style="padding:11px 0;font-size:13px;line-height:18px;color:${INK};font-weight:600;text-align:right;">&minus;&#8377;${money(p.discount)}</td></tr></table>`
      : '');

  const total =
    `<tr><td class="px" style="padding:0 40px 28px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TINT};border:1px solid ${TINT_RULE};border-radius:10px;"><tr>` +
    `<td style="padding:16px 20px;font-size:13px;line-height:18px;font-weight:600;color:${INK};vertical-align:middle;">Total amount<br/><span style="font-weight:400;color:${MUTED};font-size:12px;">including GST</span></td>` +
    `<td style="padding:16px 20px;text-align:right;vertical-align:middle;font-size:26px;line-height:30px;font-weight:800;color:${INK};white-space:nowrap;">&#8377;${money(p.total)}</td>` +
    `</tr></table></td></tr>`;

  const about =
    `<p style="margin:12px 0 6px;font-size:13px;line-height:20px;color:${TEXT};">STM Digital Library is a curated academic platform providing access to:</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">` +
    ['Academic journals', 'Conference proceedings', 'Educational videos', 'E-books &amp; reference materials', 'Theses &amp; research content', 'Legally sourced open-access academic resources']
      .map(t => `<tr><td style="padding:3px 10px 3px 0;font-size:13px;line-height:18px;color:${BLUE};vertical-align:top;">&bull;</td><td style="padding:3px 0;font-size:13px;line-height:18px;color:${INK};">${t}</td></tr>`).join('') +
    `</table>`;

  const bank = co.bank;
  const payment =
    `<p style="margin:12px 0 0;font-size:13px;line-height:20px;font-weight:600;color:${INK};">Payments must be made only to:</p>` +
    rows([
      ['Account name', esc(co.legalName), true],
      ['Account number', esc(bank.accountNumber), true],
      ['Bank', esc(bank.bankName)],
      ['Branch', esc(bank.branch)],
      ['IFSC code', esc(bank.ifscCode), true],
    ]);

  const link = (href: string, text: string) => `<a href="${href}" style="color:${BLUE};text-decoration:none;font-weight:600;">${text}</a>`;
  const contact =
    `<p style="margin:12px 0 0;font-size:13px;line-height:20px;color:${TEXT};">For any assistance regarding subscription, quotation or payment:</p>` +
    rows([
      ['Email', link(`mailto:${esc(co.email)}`, esc(co.email))],
      ['Phone', link('tel:+919810078958', '+91-9810078958')],
      ['Website', link('https://journalslibrary.com/', 'journalslibrary.com')],
    ]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<title>Quotation ${esc(p.quotationNumber)} — STM Digital Library</title>
<style>
  @media only screen and (max-width:640px) {
    .container { width:100% !important; border-radius:0 !important; }
    .px { padding-left:20px !important; padding-right:20px !important; }
    .hdr-right { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Quotation ${esc(p.quotationNumber)} for the selected department(s): &#8377;${money(p.total)} including GST.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#FFFFFF;border:1px solid ${RULE};border-radius:12px;">

  <!-- Header: logo on the left, the name beside it, the quotation number on the right -->
  <tr><td class="px" bgcolor="${INK}" style="background:${INK};border-radius:12px 12px 0 0;padding:28px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="64" style="width:64px;vertical-align:middle;">${logo}</td>
      <td style="padding-left:18px;vertical-align:middle;">
        <p style="margin:0;font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF;">STM Digital Library</p>
        <p style="margin:4px 0 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#93B4FF;">Subscription Quotation</p>
      </td>
      <td class="hdr-right" align="right" style="vertical-align:middle;white-space:nowrap;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="right" style="border-left:1px solid ${MUTED};"><tr><td style="padding:2px 0 2px 20px;text-align:left;">
          <p style="margin:0;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#93B4FF;">Quotation No.</p>
          <p style="margin:3px 0 0;font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;">${esc(p.quotationNumber)}</p>
        </td></tr></table>
      </td>
    </tr></table>
  </td></tr>
  <tr><td bgcolor="${BLUE}" style="height:4px;line-height:4px;font-size:0;background:${BLUE};">&nbsp;</td></tr>

  <!-- Introduction -->
  <tr><td class="px" style="padding:32px 40px 24px;">
    <p style="margin:0 0 12px;font-size:16px;line-height:24px;font-weight:700;color:${INK};">Dear ${esc(p.recipientName)},</p>
    <p style="margin:0 0 10px;font-size:14px;line-height:22px;color:${TEXT};">Thank you for your interest in <strong style="color:${INK};">STM Digital Library</strong> and its subscription services.</p>
    <p style="margin:0;font-size:14px;line-height:22px;color:${TEXT};">Please find attached the quotation for the selected department(s) and subscription duration.</p>
  </td></tr>

  ${section('Quotation details', details)}
  ${total}
  ${section('About STM Digital Library', about)}
  ${section('Payment information', payment)}
  ${section('Contact information', contact)}

  <!-- Signature -->
  <tr><td class="px" style="padding:4px 40px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr>
      <td style="padding-top:20px;vertical-align:top;">
        <p style="margin:0 0 4px;font-size:14px;line-height:20px;color:${TEXT};">Warm regards,</p>
        <p style="margin:0 0 2px;font-size:15px;line-height:20px;font-weight:700;color:${INK};">STM Digital Library Team</p>
        <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};">${esc(co.legalName)}</p>
        <p style="margin:2px 0 0;font-size:12px;line-height:18px;color:${MUTED};">A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India</p>
      </td>
      <td align="right" style="padding-top:20px;vertical-align:bottom;">
        <p style="margin:0 0 3px;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};">For Publisher</p>
        <p style="margin:0 0 3px;font-size:13px;line-height:18px;font-weight:700;color:${INK};">STM Digital Library</p>
        <p style="margin:0;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};">Authorized Signatory</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- Footer: quiet -->
  <tr><td class="px" style="background:${SURFACE};border-top:1px solid ${RULE};border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;line-height:18px;font-weight:600;color:${INK};">21 Years of Trusted Excellence in Education &amp; Academic Publishing</p>
    <p style="margin:0 0 2px;font-size:11px;line-height:16px;color:${MUTED};">&copy; ${year} ${esc(co.legalName)} All rights reserved.</p>
    <p style="margin:0;font-size:11px;line-height:16px;color:${MUTED};">GSTIN: ${esc(co.gstin)} &nbsp;|&nbsp; PAN: ${esc(co.pan)} &nbsp;|&nbsp; CIN: ${esc(co.cin)}</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
