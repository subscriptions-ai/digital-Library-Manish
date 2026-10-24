import { COMPANY_DETAILS } from '../../config';

/**
 * The email that carries a quotation (the PDF is attached; this is the body).
 *
 * A concise quotation summary: the formal quotation is the attached PDF, so the body carries only what a reader needs at a glance (the
 * details, a few department names and a count, the total, how to pay, whom to ask). The full department list lives in the PDF and the
 * database; only this email shortens it (see MAX_DEPARTMENTS_SHOWN).
 *
 * One palette, used everywhere: ink #0F172B and brand blue #1B5DFC, on white and a pale neutral, with one very light blue tint to lift the
 * total. The layout is tables with inline styles, which is what Gmail and the desktop clients honour; the only <style> is a small media
 * query that stacks the header and the department names on a phone, and the email still reads correctly where it is ignored.
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

/** The email names this many departments; more than that are summarised as "+ N more departments". The PDF always lists them all. */
export const MAX_DEPARTMENTS_SHOWN = 4;

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
  `<tr><td class="px" style="padding:0 40px 18px;">` +
  `<p style="margin:0 0 8px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${BLUE};">${label}</p>` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border:1px solid ${RULE};border-radius:10px;">` +
  `<tr><td style="padding:4px 20px;">${inner}</td></tr></table></td></tr>`;

/** Label on the left, value on the right, a hairline between rows. */
const rows = (pairs: [string, string, boolean?][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
  pairs.map(([k, v, bold], i) =>
    `<tr><td style="padding:8px 0;font-size:13px;line-height:18px;color:${MUTED};width:42%;vertical-align:top;${i ? `border-top:1px solid ${RULE};` : ''}">${k}</td>` +
    `<td style="padding:8px 0;font-size:13px;line-height:18px;color:${INK};font-weight:${bold ? 700 : 600};text-align:right;vertical-align:top;${i ? `border-top:1px solid ${RULE};` : ''}">${v}</td></tr>`
  ).join('') + `</table>`;

export function buildQuotationEmailHtml(p: QuotationEmailInput): string {
  const co = COMPANY_DETAILS;
  const year = new Date().getFullYear();

  const logo = p.hasLogo
    ? `<img src="cid:stm-logo" alt="STM Digital Library" width="64" height="64" style="display:block;width:64px;height:64px;border:0;border-radius:50%;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:64px;height:64px;background:${BLUE};border-radius:50%;text-align:center;font-size:16px;font-weight:800;letter-spacing:1px;color:#FFFFFF;">STM</td></tr></table>`;

  // Up to four names, two to a row (one to a row on a phone). Any more are a count: the attached PDF has the complete list.
  const all = p.departments;
  const shown = all.slice(0, MAX_DEPARTMENTS_SHOWN);
  const remaining = all.length - shown.length;
  const deptCell = (d: string) =>
    `<td class="dcell" style="padding:4px 8px 4px 0;font-size:13px;line-height:18px;color:${INK};vertical-align:top;width:50%;"><span style="color:${BLUE};font-weight:700;">&#10003;</span>&nbsp; ${esc(d)}</td>`;
  const deptRows: string[] = [];
  for (let i = 0; i < shown.length; i += 2) {
    const pair = shown.slice(i, i + 2);
    deptRows.push(`<tr>${pair.map(deptCell).join('')}${pair.length === 1 ? `<td class="dcell" style="width:50%;"></td>` : ''}</tr>`);
  }
  const departmentBlock = shown.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr><td style="padding-top:10px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${deptRows.join('')}</table>` +
      (remaining > 0
        ? `<p style="margin:6px 0 2px;font-size:13px;line-height:18px;font-weight:700;color:${BLUE};">+ ${remaining} more department${remaining === 1 ? '' : 's'}</p>` +
          `<p style="margin:0 0 6px;font-size:12px;line-height:18px;color:${MUTED};">Complete department-wise details are included in the attached quotation.</p>`
        : `<div style="height:6px;line-height:6px;font-size:0;">&nbsp;</div>`) +
      `</td></tr></table>`
    : '';

  const details =
    rows([
      ['Quotation number', esc(p.quotationNumber), true],
      ['Quotation date', esc(p.issuedDate)],
      ['Valid for', `${esc(p.validityDays)} days from issue`],
      ['Subscription duration', esc(p.duration)],
      ['Selected departments', all.length === 1 ? '1 department' : `${all.length} departments`],
    ]) +
    departmentBlock +
    (p.discount > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr>` +
        `<td style="padding:9px 0;font-size:13px;line-height:18px;color:${MUTED};">Special discount / adjustment</td>` +
        `<td style="padding:9px 0;font-size:13px;line-height:18px;color:${INK};font-weight:600;text-align:right;">&minus;&#8377;${money(p.discount)}</td></tr></table>`
      : '');

  const total =
    `<tr><td class="px" style="padding:0 40px 14px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${TINT};border:1px solid ${TINT_RULE};border-radius:10px;"><tr>` +
    `<td style="padding:14px 20px;font-size:13px;line-height:18px;font-weight:600;color:${INK};vertical-align:middle;">Total amount<br/><span style="font-weight:400;color:${MUTED};font-size:12px;">including GST</span></td>` +
    `<td style="padding:14px 20px;text-align:right;vertical-align:middle;font-size:26px;line-height:30px;font-weight:800;color:${INK};white-space:nowrap;">&#8377;${money(p.total)}</td>` +
    `</tr></table></td></tr>`;

  const attachment =
    `<tr><td class="px" style="padding:0 40px 18px;">` +
    `<p style="margin:0;font-size:13px;line-height:20px;color:${TEXT};">Please refer to the attached PDF for the complete quotation, department details, pricing and applicable terms.</p>` +
    `</td></tr>`;

  const about =
    `<tr><td class="px" style="padding:0 40px 22px;">` +
    `<p style="margin:0;font-size:12px;line-height:19px;color:${MUTED};"><strong style="color:${INK};font-weight:600;">STM Digital Library</strong> &mdash; A single organised academic platform for discovering, accessing and managing research and learning resources.</p>` +
    `</td></tr>`;

  const bank = co.bank;
  const payment =
    `<p style="margin:10px 0 0;font-size:13px;line-height:20px;font-weight:600;color:${INK};">Payments must be made only to:</p>` +
    rows([
      ['Account name', esc(co.legalName), true],
      ['Account number', esc(bank.accountNumber), true],
      ['Bank', esc(bank.bankName)],
      ['Branch', esc(bank.branch)],
      ['IFSC code', esc(bank.ifscCode), true],
    ]);

  // The phone number is the one in the company details, shown with a space (+91 9810078958); the tel: link carries digits only.
  const link = (href: string, text: string) => `<a href="${href}" style="color:${BLUE};text-decoration:none;font-weight:600;white-space:nowrap;">${text}</a>`;
  const phoneText = esc(co.mobile.replace(/-/g, ' '));
  const sep = `<span style="color:${MUTED};"> &middot; </span>`; // plain spaces, so a narrow screen wraps between the three, never inside one
  const contact =
    `<tr><td class="px" style="padding:0 40px 20px;">` +
    `<p style="margin:0 0 4px;font-size:13px;line-height:20px;font-weight:700;color:${INK};">Need assistance?</p>` +
    `<p style="margin:0;font-size:13px;line-height:22px;color:${TEXT};">` +
    `${link(`mailto:${esc(co.email)}`, esc(co.email))}${sep}${link(`tel:+${co.mobile.replace(/\D/g, '')}`, phoneText)}${sep}${link('https://journalslibrary.com/', 'journalslibrary.com')}</p>` +
    `</td></tr>`;

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
    .hcol { display:block !important; width:100% !important; }
    .hright { padding-top:14px !important; text-align:left !important; }
    .hqn { float:none !important; border-left:0 !important; }
    .hqn td { padding-left:0 !important; }
    .dcell { display:block !important; width:100% !important; padding-right:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Quotation ${esc(p.quotationNumber)} for the selected department(s): &#8377;${money(p.total)} including GST.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#FFFFFF;border:1px solid ${RULE};border-radius:12px;">

  <!-- Header: logo on the left, the name beside it, the quotation number on the right -->
  <tr><td class="px" bgcolor="${INK}" style="background:${INK};border-radius:12px 12px 0 0;padding:24px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="hcol" style="vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="64" style="width:64px;vertical-align:middle;">${logo}</td>
          <td style="padding-left:18px;vertical-align:middle;">
            <p style="margin:0;font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF;">STM Digital Library</p>
            <p style="margin:4px 0 0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#93B4FF;">Subscription Quotation</p>
          </td>
        </tr></table>
      </td>
      <td class="hcol hright" align="right" style="vertical-align:middle;">
        <table role="presentation" class="hqn" cellpadding="0" cellspacing="0" align="right" style="border-left:1px solid ${MUTED};"><tr><td style="padding:2px 0 2px 20px;text-align:left;">
          <p style="margin:0;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#93B4FF;">Quotation No.</p>
          <p style="margin:3px 0 0;font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;white-space:nowrap;">${esc(p.quotationNumber)}</p>
        </td></tr></table>
      </td>
    </tr></table>
  </td></tr>
  <tr><td bgcolor="${BLUE}" style="height:4px;line-height:4px;font-size:0;background:${BLUE};">&nbsp;</td></tr>

  <!-- Introduction -->
  <tr><td class="px" style="padding:26px 40px 20px;">
    <p style="margin:0 0 10px;font-size:16px;line-height:24px;font-weight:700;color:${INK};">Dear ${esc(p.recipientName)},</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:${TEXT};">Thank you for your interest in <strong style="color:${INK};">STM Digital Library</strong>.</p>
    <p style="margin:0;font-size:14px;line-height:22px;color:${TEXT};">Please find attached our subscription quotation for the selected department(s) and subscription period.</p>
  </td></tr>

  ${section('Quotation details', details)}
  ${total}
  ${attachment}
  ${about}
  ${section('Payment information', payment)}
  ${contact}

  <!-- Signature -->
  <tr><td class="px" style="padding:4px 40px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr>
      <td style="padding-top:18px;vertical-align:top;">
        <p style="margin:0 0 4px;font-size:14px;line-height:20px;color:${TEXT};">Warm regards,</p>
        <p style="margin:0 0 2px;font-size:15px;line-height:20px;font-weight:700;color:${INK};">STM Digital Library Team</p>
        <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};">${esc(co.legalName)}</p>
        <p style="margin:2px 0 0;font-size:12px;line-height:18px;color:${MUTED};">A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- Footer: quiet -->
  <tr><td class="px" style="background:${SURFACE};border-top:1px solid ${RULE};border-radius:0 0 12px 12px;padding:16px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:11px;line-height:16px;font-weight:600;color:${MUTED};">21 Years of Trusted Excellence in Education &amp; Academic Publishing</p>
    <p style="margin:0 0 2px;font-size:11px;line-height:16px;color:${MUTED};">&copy; ${year} ${esc(co.legalName)} All rights reserved.</p>
    <p style="margin:0;font-size:11px;line-height:16px;color:${MUTED};">GSTIN: ${esc(co.gstin)} &nbsp;|&nbsp; PAN: ${esc(co.pan)} &nbsp;|&nbsp; CIN: ${esc(co.cin)}</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
