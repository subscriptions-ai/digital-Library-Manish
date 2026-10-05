import { MAIL_BASE, esc, buildEmail, eBody, eH1, eP, eMuted, eBtn } from './emailTemplates.js';

/** Asia/Kolkata is UTC+05:30 all year (no daylight saving), so the offset is a constant. */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** At most this many registrations are listed; the count above the table is always the true total. */
export const DIGEST_ROW_LIMIT = 50;

export const DIGEST_TEMPLATE_KEY = 'admin-daily-new-users';

export interface DigestWindow {
  /** Inclusive start, 00:00:00.000 IST of the day being reported. */
  start: Date;
  /** Exclusive end, 00:00:00.000 IST the day after (= 23:59:59.999 IST of the reported day). */
  end: Date;
  /** "2026-10-05" — the reported day in IST. Also the dedupe key's suffix. */
  isoDay: string;
  /** "05 Oct 2026" */
  label: string;
  dedupeKey: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The previous calendar day in IST, relative to `now`.
 *
 * Done with arithmetic on a shifted clock rather than the server's local
 * timezone, so a server running in UTC gives the same answer as one in Delhi.
 * At 2026-10-06 00:00 IST (= 2026-10-05 18:30 UTC) this returns 5 Oct 2026.
 */
export function previousIstDay(now: Date = new Date()): DigestWindow {
  const istNow = now.getTime() + IST_OFFSET_MS;
  const todayIstMidnight = Math.floor(istNow / DAY_MS) * DAY_MS; // in the shifted frame
  const startShifted = todayIstMidnight - DAY_MS;
  const start = new Date(startShifted - IST_OFFSET_MS);
  const end = new Date(todayIstMidnight - IST_OFFSET_MS);
  const d = new Date(startShifted); // read with the UTC getters: it is the IST wall clock
  const isoDay = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const label = `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return { start, end, isoDay, label, dedupeKey: `daily-new-users:${isoDay}` };
}

export const formatIst = (d: Date) => {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return `${pad(s.getUTCDate())} ${MONTHS[s.getUTCMonth()]}, ${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())} IST`;
};

export interface DigestUser {
  displayName: string | null;
  email: string;
  organization: string | null;
  registrantType: string | null;
  signupSource: string | null;
  institutionId: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface DigestStats {
  total: number;
  verified: number;
  unverified: number;
  institutionLinked: number;
  individual: number;
}

export function buildDailyUserDigest(win: DigestWindow, total: DigestStats, users: DigestUser[]) {
  const subject = `STM Digital Library — ${total.total} New User${total.total === 1 ? '' : 's'} Registered on ${win.label}`;

  const stat = (label: string, n: number) =>
    `<td style="padding:10px 14px;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;">` +
    `<div style="font-size:20px;font-weight:800;color:#1e3a6e;">${n}</div>` +
    `<div style="font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.8px;">${esc(label)}</div></td>`;

  const th = (t: string) =>
    `<td style="padding:8px 10px;font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;">${t}</td>`;
  const td = (t: string, color = '#475569') =>
    `<td style="padding:8px 10px;font-size:12px;color:${color};vertical-align:top;">${t}</td>`;

  // Only columns somebody actually filled in are shown.
  const hasOrg = users.some(u => u.organization);
  const hasType = users.some(u => u.registrantType);
  const hasSource = users.some(u => u.signupSource);

  const rows = users.slice(0, DIGEST_ROW_LIMIT).map((u, i) =>
    `<tr style="background:${i % 2 ? '#fafbfc' : '#fff'};">` +
    td(esc(u.displayName || '—'), '#1e293b') +
    td(esc(u.email), '#1e3a6e') +
    (hasOrg ? td(esc(u.organization || '—')) : '') +
    (hasType ? td(esc(u.registrantType || '—')) : '') +
    (hasSource ? td(esc(u.signupSource || '—')) : '') +
    td(esc(formatIst(u.createdAt))) +
    `</tr>`
  ).join('');

  const more = total.total - Math.min(users.length, DIGEST_ROW_LIMIT);

  const html = buildEmail(
    eBody(
      eH1('Daily New User Registration Summary') +
      eP(`<b>Date:</b> ${esc(win.label)}<br/><b>New users registered:</b> ${total.total}`) +
      `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;"><tr>` +
      stat('Individual', total.individual) + stat('Institution-linked', total.institutionLinked) +
      stat('Verified', total.verified) + stat('Unverified', total.unverified) +
      `</tr></table>` +
      `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">` +
      `<tr style="background:#f8fafc;">${th('Name')}${th('Email')}${hasOrg ? th('Institution / Organization') : ''}` +
      `${hasType ? th('Role / Type') : ''}${hasSource ? th('Signup Source') : ''}${th('Registered At')}</tr>${rows}</table>` +
      (more > 0 ? eMuted(`+ ${more} more user${more === 1 ? '' : 's'}`) : '') +
      eBtn('View All Users', `${MAIL_BASE}/admin/users`)
    ),
    `${total.total} new user${total.total === 1 ? '' : 's'} registered on ${win.label}`,
  );

  return { subject, html };
}
