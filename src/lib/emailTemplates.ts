import { COMPANY_DETAILS } from '../config';
/**
 * Transactional email layout and content kit.
 *
 * Every email the platform sends is composed from these pieces, so a publisher
 * who gets an invitation, an agreement and a message sees one consistent house
 * style rather than three different-looking emails.
 *
 * Kept as pure functions in their own module so the templates can be rendered
 * and eyeballed without booting the server — see scripts/preview-emails.ts.
 */

/** Public base URL for links inside emails. Falls back to the live site so a
 *  missing APP_URL never produces a dead "#" link in a customer's inbox. */
export const MAIL_BASE = (process.env.APP_URL || 'https://journalslibrary.com').replace(/\/+$/, '');

/** Escape anything user-supplied before it goes into an HTML email — publisher
 *  names, message bodies and decline reasons are all attacker-controllable. */
export const esc = (s: any) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const escLines = (s: any) => esc(s).replace(/\r?\n/g, '<br/>');

/**
 * Wraps body rows in the branded shell — header, footer, accent bar.
 *
 * `bodyRows` is raw `<tr><td>…</td></tr>` markup, which is what the older call
 * sites already pass; new ones should use eBody() to build it.
 * `preheader` is the grey preview line inboxes show beside the subject. Left
 * empty, clients scrape the first body text, which is usually the salutation.
 */
export const buildEmail = (bodyRows: string, preheader = '') =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="color-scheme" content="light"/></head>` +
  `<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">` +
  (preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}</div>`
    : '') +
  `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center">` +
  `<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">` +
  `<tr><td style="border-top:4px solid #1e3a6e;padding:28px 40px 20px;text-align:center;"><img src="cid:stm-logo-email" alt="STM Digital Library" width="80" height="80" style="border-radius:50%;display:block;margin:0 auto 14px;border:3px solid #e2e8f0;"/>` +
  `<h2 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#1e3a6e;">STM Digital Library</h2>` +
  `<p style="margin:0;font-size:12px;color:#64748b;">${COMPANY_DETAILS.positioning}</p>` +
  `<div style="margin-top:16px;border-top:1px solid #f1f5f9;"></div></td></tr>` +
  bodyRows +
  `<tr><td style="background:#1e3a6e;padding:24px 40px;text-align:center;">` +
  `<p style="margin:0 0 12px;font-size:11px;color:#f59e0b;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">🏆 21 Years of Trusted Excellence in Education &amp; Academic Publishing</p>` +
  `<p style="margin:0 0 2px;font-size:13px;color:#cbd5e1;">Regards,</p>` +
  `<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#ffffff;">STM Digital Library Team</p>` +
  `<p style="margin:0 0 16px;font-size:12px;color:#94a3b8;">${COMPANY_DETAILS.positioning}</p>` +
  `<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:14px;">` +
  `<p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} STM Digital Library. All rights reserved.&nbsp;&nbsp;|&nbsp;&nbsp;` +
  `<a href="${MAIL_BASE}/privacy-policy" style="color:#93c5fd;text-decoration:none;">Privacy Policy</a>&nbsp;&nbsp;|&nbsp;&nbsp;` +
  `<a href="${MAIL_BASE}/terms-and-conditions" style="color:#93c5fd;text-decoration:none;">Terms &amp; Conditions</a></p></div></td></tr>` +
  `<tr><td style="height:4px;background:linear-gradient(90deg,#1e3a6e,#2563eb,#1e3a6e);"></td></tr>` +
  `</table></td></tr></table></body></html>`;

// ── Content kit ─────────────────────────────────────────────────────────────
// Small composable pieces. Each returns inline HTML; eBody() wraps the lot in
// the padded row buildEmail() expects, so call sites never hand-write <tr><td>.

export const eBody = (inner: string) => `<tr><td style="padding:30px 40px 34px;">${inner}</td></tr>`;

export const eH1 = (t: string) =>
  `<h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;font-weight:800;color:#0f172a;">${t}</h1>`;

export const eP = (t: string) =>
  `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">${t}</p>`;

export const eMuted = (t: string) =>
  `<p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#94a3b8;">${t}</p>`;

/** Table-based CTA — a styled <a> gets dropped or restyled by several clients. */
export const eBtn = (label: string, href: string) =>
  `<table cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr>` +
  `<td style="background:#1e3a6e;border-radius:10px;">` +
  `<a href="${href}" style="display:inline-block;padding:13px 30px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${label}</a>` +
  `</td></tr></table>`;

const TONES: Record<string, { bg: string; bar: string }> = {
  neutral: { bg: '#f8fafc', bar: '#cbd5e1' },
  info:    { bg: '#eff6ff', bar: '#2563eb' },
  success: { bg: '#ecfdf5', bar: '#059669' },
  warning: { bg: '#fffbeb', bar: '#d97706' },
  danger:  { bg: '#fef2f2', bar: '#dc2626' },
};

export const eCard = (inner: string, tone: string = 'neutral') => {
  const t = TONES[tone] || TONES.neutral;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:${t.bg};border-left:4px solid ${t.bar};border-radius:8px;">` +
    `<tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#334155;">${inner}</td></tr></table>`;
};

/** Label/value pairs — agreement details, message metadata, and the like. */
export const eRows = (pairs: [string, string][]) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:8px;">` +
  pairs.map(([k, v], i) =>
    `<tr>` +
    `<td style="padding:11px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;width:38%;${i ? 'border-top:1px solid #f1f5f9;' : ''}">${esc(k)}</td>` +
    `<td style="padding:11px 16px;font-size:14px;color:#0f172a;${i ? 'border-top:1px solid #f1f5f9;' : ''}">${v}</td>` +
    `</tr>`
  ).join('') + `</table>`;

/** A quoted message, shown the way a chat client would show it. */
export const eQuote = (author: string, text: string) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">` +
  `<tr><td style="padding:16px 18px;">` +
  `<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#1e3a6e;">${esc(author)}</p>` +
  `<div style="font-size:14px;line-height:1.65;color:#334155;">${escLines(text)}</div>` +
  `</td></tr></table>`;
