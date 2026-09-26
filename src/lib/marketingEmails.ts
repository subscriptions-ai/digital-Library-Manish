import {
  MAIL_BASE, esc, buildEmail, eBody, eH1, eP, eMuted, eBtn, eCard, eRows,
} from './emailTemplates.js';

/**
 * The marketing and lifecycle mails: the five the product actually has a
 * reason to send, each with the rule that says who it is for.
 *
 * Three things are deliberate here.
 *
 * Every template is a pure function of a member and some context, so it can be
 * rendered for a preview, for a test send and for the real thing by the same
 * code — an admin looking at a preview is looking at the mail that will arrive.
 *
 * Every template declares its own audience rule. "Who should get this" lives
 * beside "what it says" rather than in a query somewhere else, because the two
 * go wrong together: a rule that drifts from its copy sends the wrong people a
 * mail that reads as if it were meant for someone else.
 *
 * The copy is English only. Nothing in the product is written in another
 * language, so every line here reads the same for every recipient.
 */

export type TemplateKey =
  | 'profile-incomplete'
  | 'never-read'
  | 'new-features'
  | 'pro-benefits'
  | 'librarian-add-users';

/** What a template is handed. Anything absent simply goes unmentioned. */
export type MailContext = {
  user: {
    id: string; email: string; displayName?: string | null; role: string;
    organization?: string | null; createdAt?: Date | string | null;
    institutionProfile?: any; lastReadAt?: Date | string | null;
  };
  /** Profile fields still blank, in the words the profile screen uses. */
  missingFields?: string[];
  /** What the library holds right now, for the lines that quote a figure. */
  library?: { total?: number; articles?: number; books?: number; departments?: number };
  /** For the librarian nudge. */
  institution?: { members?: number; readers?: number; lastAddedDays?: number | null };
  /** Departments this member said they care about, or their institution's. */
  departments?: string[];
  /** For the "you have read, here is what Pro changes" mail. */
  reading?: { items?: number; lastReadDays?: number | null };
  /** Written by the admin for a broadcast; the template falls back to its own. */
  note?: string;
  /** Appended to every link so signups carry the campaign that brought them. */
  ref?: string;
  /** One-click unsubscribe, built by the sender. */
  unsubscribeUrl?: string;
};

export type Template = {
  key: TemplateKey;
  name: string;
  /** One line for the admin list — what it says and who it is for. */
  description: string;
  audience: string;
  /** Lifecycle mails have an automatic rule; broadcasts are sent by hand. */
  kind: 'lifecycle' | 'broadcast';
  subject: (c: MailContext) => string;
  preheader: (c: MailContext) => string;
  body: (c: MailContext) => string;
};

const n = (x?: number) => (typeof x === 'number' ? x.toLocaleString('en-IN') : '');
const firstName = (c: MailContext) =>
  esc((c.user.displayName || '').trim().split(/\s+/)[0] || 'there');

/** Links carry the campaign, so a signup that follows is attributed to it. */
const link = (path: string, c: MailContext) => {
  const url = `${MAIL_BASE}${path}`;
  if (!c.ref) return url;
  return url + (url.includes('?') ? '&' : '?') + `ref=${encodeURIComponent(c.ref)}`;
};

/** Every marketing mail closes with a way out of marketing mail. */
const footer = (c: MailContext) => c.unsubscribeUrl
  ? eMuted(`You are receiving this because you have an account at STM Digital Library. `
    + `<a href="${esc(c.unsubscribeUrl)}" style="color:#64748b;">Unsubscribe from updates</a> — `
    + `your OTP, receipt and other essential account mails will still reach you.`)
  : '';

export const TEMPLATES: Record<TemplateKey, Template> = {
  // ── 1. The librarian's profile is still half empty ───────────────────────
  'profile-incomplete': {
    key: 'profile-incomplete',
    name: 'Complete your institution profile',
    description: 'Names the fields still blank on the institution profile and links straight to it.',
    audience: 'Institution accounts (librarians) registered 2+ days ago with fields still blank',
    kind: 'lifecycle',
    subject: c => `${c.user.organization ? `${c.user.organization}: ` : ''}your library profile is almost done`,
    preheader: c => `${(c.missingFields || []).length} details left — it takes two minutes.`,
    body: c => {
      const missing = c.missingFields || [];
      return eBody(
        eH1(`Hello ${firstName(c)}, your profile is nearly there`)
        + eP('Your institution is set up and your people can read today. A few details on the '
          + 'profile are still blank, and they are the ones that make your dashboard useful — '
          + 'the contact we reach you on, and the size and courses that let us tell you which '
          + 'departments your library is thin in.')
        + (missing.length
          ? eCard(`<p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1e3a6e;">Still blank</p>`
            + `<p style="margin:0;font-size:14px;line-height:24px;color:#334155;">`
            + missing.map(f => `• ${esc(f)}`).join('<br/>') + `</p>`, 'warning')
          : '')
        + eBtn('Complete the profile', link('/institution/profile', c))
        + eMuted('Nothing about your members changes while it is blank — this only improves what we can show you.')
        + footer(c),
      );
    },
  },

  // ── 2. Registered, never opened anything ─────────────────────────────────
  'never-read': {
    key: 'never-read',
    name: 'You have not opened anything yet',
    description: 'For members who registered and never read. Shows what is waiting in their departments.',
    audience: 'Members registered 3+ days ago who have never opened an item',
    kind: 'lifecycle',
    subject: c => c.departments?.length
      ? `${n(c.library?.total)} items are waiting — starting with ${esc(c.departments[0])}`
      : `Your library is open — ${n(c.library?.total)} items are waiting`,
    preheader: () => 'Sign in and open the first one. Free, no request form, nothing to install.',
    body: c => eBody(
      eH1(`${firstName(c)}, your library is open`)
      + eP(`You registered, and since then nothing has been opened. There is no approval to wait for `
        + `and nothing to install — ${n(c.library?.total)} items across ${n(c.library?.departments)} `
        + `departments are already available to you, and they open in the browser.`)
      + (c.departments?.length
        ? eCard(`<p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1e3a6e;">Your departments</p>`
          + `<p style="margin:0;font-size:14px;line-height:24px;color:#334155;">`
          + c.departments.slice(0, 4).map(d => `• ${esc(d)}`).join('<br/>') + `</p>`)
        : '')
      + eBtn('Open the library', link('/dashboard/library', c))
      + eMuted('Free membership reads in half-hour sessions. Nothing is charged, and nothing is asked for.')
      + footer(c),
    ),
  },

  // ── 3. What is new ───────────────────────────────────────────────────────
  'new-features': {
    key: 'new-features',
    name: 'What is new in the library',
    description: 'Broadcast. The admin writes what shipped; the mail sets it in the house style.',
    audience: 'Chosen by the admin when sending — any filter of members',
    kind: 'broadcast',
    subject: () => "What's new in your digital library",
    preheader: c => (c.note || 'New in the library this month.').slice(0, 120),
    body: c => eBody(
      eH1('New in the library')
      + (c.note
        ? `<p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#334155;">${esc(c.note).replace(/\n/g, '<br/>')}</p>`
        : eP('The library has grown and a few things work better than they did. '
          + 'Sign in and have a look.'))
      + (c.library?.total
        ? eCard(eRows([
          ['Items in the library', n(c.library.total)],
          ['Research articles', n(c.library.articles)],
          ['Books', n(c.library.books)],
          ['Departments', n(c.library.departments)],
        ]))
        : '')
      + eBtn('See what changed', link('/dashboard', c))
      + footer(c),
    ),
  },

  // ── 4. What Pro changes, for people who have actually read ───────────────
  'pro-benefits': {
    key: 'pro-benefits',
    name: 'What Pro changes',
    description: 'For members who have read something, so the half-hour session is a limit they have met. No prices.',
    audience: 'Members who have opened at least one item and have no active subscription',
    kind: 'broadcast',
    subject: () => 'Reading without the half-hour session',
    preheader: () => 'Pro removes the session clock, for you and everyone you add.',
    body: c => eBody(
      eH1(`${firstName(c)}, you have been reading — here is what Pro changes`)
      + eP('On free membership the library is whole, but the clock is not: a session lasts half an '
        + 'hour, and if you have been reading you will have met it mid-article. Pro is the same '
        + 'library with that clock removed.')
      + eCard(`<p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#1e3a6e;">What changes</p>`
        + `<p style="margin:0;font-size:14px;line-height:24px;color:#334155;">`
        + `• No session limit — read for as long as the work takes<br/>`
        + `• The same for everyone your institution adds<br/>`
        + `• Students can be added to your institution's account<br/>`
        + `• Reading reports for the whole institution, by week and by subject`
        + `</p>`, 'success')
      + (c.reading?.items
        ? eMuted(`You have opened ${n(c.reading.items)} item${c.reading.items === 1 ? '' : 's'} so far.`)
        : '')
      + eBtn('See what Pro includes', link('/for-institutions', c))
      + eMuted('Questions about what suits your institution? Reply to this mail and a person will answer.')
      + footer(c),
    ),
  },

  // ── 5. Librarian: add the rest of your faculty ───────────────────────────
  'librarian-add-users': {
    key: 'librarian-add-users',
    name: 'Add more of your faculty',
    description: 'For librarians whose member list has stopped growing. Says how many they have and what it costs them.',
    audience: 'Institution accounts with no new member added in the last 30 days',
    kind: 'lifecycle',
    subject: c => c.institution?.members
      ? `${c.user.organization || 'Your institution'}: ${n(c.institution.members)} people have access so far`
      : 'Add your faculty and researchers to the library',
    preheader: () => 'Every person you add reads on the same account, at no extra cost.',
    body: c => eBody(
      eH1(`${firstName(c)}, who else should be reading?`)
      + eP(`${c.institution?.members ? `${n(c.institution.members)} people from your institution can open the library today. ` : ''}`
        + `Adding the rest of your faculty and researchers takes a name and an email each, and `
        + `there is no limit on how many you add — the account covers them all.`)
      + (c.institution?.members
        ? eCard(eRows([
          ['People with access', n(c.institution.members)],
          ...(typeof c.institution.readers === 'number'
            ? [['Of them, have read something', n(c.institution.readers)] as [string, string]] : []),
          ...(c.institution.lastAddedDays
            ? [['Last person added', `${c.institution.lastAddedDays} days ago`] as [string, string]] : []),
        ]))
        : '')
      + eBtn('Add users', link('/institution/students', c))
      + eMuted('Bulk import takes a spreadsheet, if it is easier than adding them one at a time.')
      + footer(c),
    ),
  },
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);

/** Render one, ready for the wire. */
export function renderTemplate(key: TemplateKey, c: MailContext) {
  const t = TEMPLATES[key];
  if (!t) throw new Error(`No such template: ${key}`);
  return {
    subject: t.subject(c),
    html: buildEmail(t.body(c), t.preheader(c)),
    preheader: t.preheader(c),
  };
}

/**
 * Which of the institution profile's fields are still blank.
 *
 * The names are the profile screen's own, so the mail names what the reader
 * will see when they get there rather than a database column.
 */
export function missingInstitutionFields(user: any): string[] {
  const p = (user?.institutionProfile as any) || {};
  const pairs: [string, any][] = [
    ['Contact person', user?.displayName],
    ['Contact phone', p.contactPhone],
    ['City', user?.state || p.city],
    ['Address', p.address],
    ['Website', p.website],
    ['Logo', p.logoUrl],
    ['Courses offered', p.coursesOffered],
    ['Number of courses', p.totalCourses],
    ['Student body size', p.studentBodySize],
  ];
  return pairs.filter(([, v]) => !String(v ?? '').trim()).map(([label]) => label);
}
