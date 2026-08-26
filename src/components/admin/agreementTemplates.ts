import { COMPANY_DETAILS } from '../../config';
/**
 * Ready-made agreement templates for the publisher tie-up desk.
 *
 * These ship in code rather than in the AgreementTemplate table so they are
 * present on a fresh deploy with no seeding step, and cannot be lost. Anything
 * the admin edits and saves with "Save as template" still goes to the database
 * and appears alongside these.
 *
 * Placeholders are filled from the publisher record at the moment a template is
 * applied — see fillPlaceholders(). A field the publisher record does not have
 * yet becomes a visible blank line rather than silently disappearing, so the
 * admin can see what still needs completing before sending.
 *
 * These are commercial drafts prepared for internal use, not settled by counsel.
 * Have them reviewed before they go out on a real tie-up.
 */

export interface BuiltInTemplate {
  id: string;
  title: string;
  version: string;
  description: string;
  body: string;
}

/** The company side of every agreement — from the corporate record. */
const COMPANY = {
  NAME: COMPANY_DETAILS.legalName,
  SHORT: COMPANY_DETAILS.shortName,
  PLATFORM: 'STM Digital Library',
  PLATFORM_URL: 'https://journalslibrary.com',
  ADDRESS: 'A-118, 1st Floor, Sector 63, Noida, Uttar Pradesh — 201301, India',
  REGISTERED_OFFICE: 'New Delhi, India',
  EMAIL: COMPANY_DETAILS.email,
  PHONE: '+91-9810078958 / 0120-4781200',
  GSTIN: COMPANY_DETAILS.gstin,
};

/** Shown under the template picker so the admin knows what they can type. */
export const PLACEHOLDER_HELP = [
  '{{PUBLISHER_NAME}}', '{{PUBLISHER_LEGAL_NAME}}', '{{PUBLISHER_COUNTRY}}',
  '{{PUBLISHER_ADDRESS}}', '{{PUBLISHER_EMAIL}}', '{{PUBLISHER_WEBSITE}}',
  '{{PUBLISHER_CONTACT}}', '{{CONTENT_TYPES}}', '{{DATE}}',
];

const BLANK = '_______________';

/**
 * Substitutes every {{TOKEN}} in `text` for this publisher's details.
 * Missing values become a blank line so they stay visible to the admin.
 */
export function fillPlaceholders(text: string, p: any): string {
  if (!text) return '';

  let types = BLANK;
  const raw = p?.allowedContentTypes;
  const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? safeParse(raw) : null);
  if (Array.isArray(list) && list.length) types = list.join(', ');

  const values: Record<string, string> = {
    PUBLISHER_NAME: p?.name || BLANK,
    PUBLISHER_LEGAL_NAME: p?.legalName || p?.name || BLANK,
    PUBLISHER_COUNTRY: p?.country || BLANK,
    PUBLISHER_ADDRESS: p?.address || BLANK,
    PUBLISHER_EMAIL: p?.email || BLANK,
    PUBLISHER_WEBSITE: p?.website || BLANK,
    PUBLISHER_CONTACT: p?.contactNumber || BLANK,
    CONTENT_TYPES: types,
    DATE: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    COMPANY_NAME: COMPANY.NAME,
    COMPANY_SHORT: COMPANY.SHORT,
    COMPANY_ADDRESS: COMPANY.ADDRESS,
    COMPANY_REGISTERED_OFFICE: COMPANY.REGISTERED_OFFICE,
    COMPANY_EMAIL: COMPANY.EMAIL,
    COMPANY_PHONE: COMPANY.PHONE,
    COMPANY_GSTIN: COMPANY.GSTIN,
    PLATFORM: COMPANY.PLATFORM,
    PLATFORM_URL: COMPANY.PLATFORM_URL,
  };

  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole
  );
}

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

/** Every template opens with the same parties block. */
const PARTIES = `This Agreement is made on {{DATE}} between:

(1) {{COMPANY_NAME}} ("{{COMPANY_SHORT}}"), a company incorporated under the
    Companies Act, with its registered office at {{COMPANY_REGISTERED_OFFICE}} and its
    principal place of operations at {{COMPANY_ADDRESS}} (GSTIN {{COMPANY_GSTIN}}),
    which operates the digital library platform {{PLATFORM}} at {{PLATFORM_URL}}; and

(2) {{PUBLISHER_LEGAL_NAME}} ("the Publisher"), of {{PUBLISHER_ADDRESS}},
    {{PUBLISHER_COUNTRY}}.

{{COMPANY_SHORT}} and the Publisher are referred to individually as a "Party" and
together as the "Parties".`;

const SIGNATURES = `SIGNED for and on behalf of the Parties.

For {{COMPANY_NAME}}          For {{PUBLISHER_LEGAL_NAME}}

Name:  _______________________       Name:  _______________________
Title: _______________________       Title: _______________________
Date:  _______________________       Date:  _______________________`;

export const BUILT_IN_AGREEMENT_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'builtin-partnership',
    title: 'Content Partnership & Tie-Up Agreement — {{PUBLISHER_NAME}}',
    version: '1.0',
    description: 'The main tie-up. Publisher joins the platform, gets a portal login, keeps control of its content.',
    body: `CONTENT PARTNERSHIP & TIE-UP AGREEMENT

${PARTIES}

BACKGROUND

A. {{COMPANY_SHORT}} operates {{PLATFORM}}, a subscription platform that aggregates,
   indexes and makes scholarly content discoverable to institutional and individual
   subscribers.

B. The Publisher publishes scholarly content and wishes to make that content
   discoverable through the Platform on the terms set out below.

1. WHAT THE PUBLISHER PROVIDES

1.1 The Publisher agrees to make available to the Platform the following categories of
    its content: {{CONTENT_TYPES}}.

1.2 The Publisher may supply content through the Platform's publisher portal, by bulk
    file transfer, or by permitting the Platform to harvest it from a source the
    Publisher nominates in writing.

1.3 The Publisher will supply, for each item, the bibliographic metadata the Platform
    requires — title, authors, journal or book title, ISSN or ISBN, volume, issue,
    pages, year of publication, DOI where one exists, and the licence under which the
    item is made available.

2. WHAT {{COMPANY_SHORT}} PROVIDES

2.1 A publisher portal login from which the Publisher may submit content, correct
    metadata, see readership analytics for its own titles, and withdraw any item at
    any time without going through {{COMPANY_SHORT}}.

2.2 Attribution of every item to the Publisher, displayed to every visitor, including
    those who are not signed in and hold no subscription.

2.3 Inclusion of the Publisher's titles in the Platform's discovery, search and
    subject classification features.

2.4 A "verified partner" designation against the Publisher's profile on the Platform.

3. OWNERSHIP AND LICENCE

3.1 Nothing in this Agreement transfers ownership of any content. All content supplied
    by the Publisher remains the property of the Publisher or its licensors.

3.2 The Publisher grants {{COMPANY_SHORT}} a non-exclusive, revocable, worldwide
    licence to index, store the metadata of, display and make accessible the content
    described at clause 1.1 through the Platform, for the term of this Agreement.

3.3 The licence at clause 3.2 does not permit {{COMPANY_SHORT}} to re-brand the
    content, to create derivative works from it, to sub-licence it to any third party,
    or to sell any individual item of it.

3.4 {{COMPANY_SHORT}} charges its subscribers for access to the Platform's software
    and services. It does not charge for, and does not represent that it sells, the
    Publisher's content.

4. THE PUBLISHER'S WARRANTIES

4.1 The Publisher warrants that it holds the rights necessary to grant the licence at
    clause 3.2, and that the content it supplies does not infringe the rights of any
    third party.

4.2 The Publisher will notify {{COMPANY_SHORT}} promptly if its rights in any supplied
    item change or lapse.

5. WITHDRAWAL AND TAKEDOWN

5.1 The Publisher may withdraw any item, or all of its content, at any time and for
    any reason, from its own portal or by written notice to {{COMPANY_EMAIL}}.

5.2 {{COMPANY_SHORT}} will give effect to a withdrawal within seven working days of
    receipt, and will not require the Publisher to give reasons, prove infringement or
    enter into any discussion as a condition of withdrawal.

5.3 On withdrawal, the Publisher may require that its titles be placed on a standing
    exclusion list so that the content is not re-acquired.

6. TERM AND TERMINATION

6.1 This Agreement takes effect on {{DATE}} and continues until terminated.

6.2 Either Party may terminate on thirty (30) days' written notice, without cause.

6.3 On termination, {{COMPANY_SHORT}} will cease to make the Publisher's content
    accessible through the Platform and will remove it within thirty (30) days.
    Bibliographic metadata may be retained where required for the Platform's records.

7. CONFIDENTIALITY

Neither Party will disclose the commercial terms of this Agreement, or any non-public
information received from the other Party, to any third party without prior written
consent, except where disclosure is required by law.

8. GENERAL

8.1 Nothing in this Agreement creates a partnership, joint venture, agency or
    employment relationship between the Parties.

8.2 This Agreement is governed by the laws of India. The competent courts at Delhi,
    India have exclusive jurisdiction.

8.3 This Agreement may be varied only in writing signed by both Parties.

8.4 Notices to {{COMPANY_SHORT}} go to {{COMPANY_EMAIL}}. Notices to the Publisher go
    to {{PUBLISHER_EMAIL}}.

${SIGNATURES}`,
  },

  {
    id: 'builtin-mou',
    title: 'Memorandum of Understanding — {{PUBLISHER_NAME}}',
    version: '1.0',
    description: 'Non-binding first step. Use when the publisher is interested but not ready to commit.',
    body: `MEMORANDUM OF UNDERSTANDING

${PARTIES}

PURPOSE

The Parties wish to explore a working relationship under which content published by
{{PUBLISHER_NAME}} would be made discoverable through {{PLATFORM}}. This Memorandum
records what each Party intends to do during that exploration. It is not a binding
contract, other than as stated at paragraph 5.

1. WHAT THE PARTIES INTEND TO EXPLORE

1.1 The inclusion of the Publisher's {{CONTENT_TYPES}} in the Platform's index.

1.2 The technical route by which content and metadata would be exchanged.

1.3 The attribution, analytics and withdrawal controls the Publisher would receive.

1.4 Whether a full Content Partnership & Tie-Up Agreement should follow.

2. WHAT {{COMPANY_SHORT}} WILL DO DURING THIS PERIOD

2.1 Provide the Publisher with a demonstration of the Platform and of the publisher
    portal.

2.2 Prepare, at no cost to the Publisher, a sample of how the Publisher's titles would
    be presented, attributed and discovered on the Platform.

2.3 Answer the Publisher's questions on sourcing, licensing, attribution and takedown.

3. WHAT THE PUBLISHER WILL DO DURING THIS PERIOD

3.1 Nominate a contact point for the discussion.

3.2 Indicate which of its titles would be in scope.

3.3 Identify any licensing restriction that would affect inclusion.

4. NO OBLIGATION

Neither Party is obliged to enter into any further agreement. Neither Party may
represent to any third party that a partnership exists unless and until a binding
agreement is signed. Each Party bears its own costs.

5. THE BINDING PARTS

Paragraphs 5, 6 and 7 are binding on the Parties. The remainder is a statement of
intent only.

6. CONFIDENTIALITY

Each Party will keep confidential any non-public information disclosed by the other
during this exploration, and will use it only for the purpose stated at "Purpose"
above. This obligation continues for two (2) years from the date of this Memorandum.

7. GOVERNING LAW

This Memorandum is governed by the laws of India, and the competent courts at Delhi,
India have exclusive jurisdiction over any dispute arising from paragraphs 5 to 7.

8. DURATION

This Memorandum takes effect on {{DATE}} and lapses six (6) months later unless the
Parties agree otherwise in writing.

${SIGNATURES}`,
  },

  {
    id: 'builtin-licence',
    title: 'Content Licensing & Hosting Agreement — {{PUBLISHER_NAME}}',
    version: '1.0',
    description: 'For a straight licence grant — no portal, no partnership, just permission to host and display.',
    body: `CONTENT LICENSING & HOSTING AGREEMENT

${PARTIES}

1. GRANT OF LICENCE

1.1 The Publisher grants {{COMPANY_SHORT}} a non-exclusive, non-transferable,
    worldwide licence to host, index, display, and make accessible to users of
    {{PLATFORM}} the content described at clause 2.

1.2 The licence is granted for the term at clause 6 and is revocable in accordance
    with clause 5.

1.3 The licence does not include any right to sub-licence, to sell individual items,
    to create derivative works, or to use the Publisher's trade marks other than to
    identify the Publisher as the source of the content.

2. LICENSED CONTENT

2.1 The content licensed under this Agreement is: {{CONTENT_TYPES}} published by
    {{PUBLISHER_NAME}}.

2.2 The Parties may add or remove titles from the licensed content by written
    agreement. A list of titles in scope may be annexed to this Agreement and updated
    from time to time.

3. ATTRIBUTION

3.1 {{COMPANY_SHORT}} will display, against every licensed item, the author names, the
    journal or book title, the ISSN or ISBN where available, the Publisher's name, the
    volume, issue, pages and year of publication, and the DOI where one exists.

3.2 {{COMPANY_SHORT}} will not substitute its own name, logo or imprint for that of
    the Publisher, and will not present the licensed content as its own.

3.3 Attribution will be shown to every visitor, whether or not they hold a
    subscription.

4. INTEGRITY OF THE CONTENT

{{COMPANY_SHORT}} will serve the licensed content as received. It will not overlay its
branding on it, re-typeset it, abridge it, translate it, or create any derivative
version of it.

5. REVOCATION

5.1 The Publisher may revoke this licence in whole or in part at any time by written
    notice to {{COMPANY_EMAIL}}, without giving reasons.

5.2 {{COMPANY_SHORT}} will cease serving the affected content within seven working
    days of receipt, and will confirm in writing when it has done so.

6. TERM

This Agreement takes effect on {{DATE}} and continues until revoked under clause 5 or
terminated by either Party on thirty (30) days' written notice.

7. WARRANTIES AND INDEMNITY

7.1 The Publisher warrants that it is entitled to grant the licence at clause 1.

7.2 The Publisher will indemnify {{COMPANY_SHORT}} against any third-party claim
    arising from a breach of the warranty at clause 7.1, provided {{COMPANY_SHORT}}
    notifies the Publisher promptly and does not settle without consent.

7.3 {{COMPANY_SHORT}} will indemnify the Publisher against any claim arising from
    {{COMPANY_SHORT}}'s use of the licensed content outside the scope of clause 1.

8. NO FEE FOR CONTENT

Subscription fees charged by {{COMPANY_SHORT}} are consideration for access to the
Platform's software and services. No part of any fee is charged as the purchase price
of the licensed content, and no revenue-sharing obligation arises under this Agreement
unless separately agreed in writing.

9. GOVERNING LAW

This Agreement is governed by the laws of India. The competent courts at Delhi, India
have exclusive jurisdiction.

${SIGNATURES}`,
  },

  {
    id: 'builtin-nda',
    title: 'Mutual Non-Disclosure Agreement — {{PUBLISHER_NAME}}',
    version: '1.0',
    description: 'Send before sharing commercials, subscriber numbers or roadmap. Both sides protected.',
    body: `MUTUAL NON-DISCLOSURE AGREEMENT

${PARTIES}

1. PURPOSE

The Parties wish to discuss a possible content partnership in relation to
{{PLATFORM}} (the "Purpose"). In the course of those discussions each Party may
disclose confidential information to the other. This Agreement governs that
disclosure.

2. WHAT IS CONFIDENTIAL

2.1 "Confidential Information" means any non-public information disclosed by one Party
    (the "Discloser") to the other (the "Recipient") in connection with the Purpose,
    whether disclosed in writing, orally, or by demonstration, including commercial
    terms, pricing, subscriber and readership data, technical architecture, product
    roadmap, and the existence and content of the discussions themselves.

2.2 Confidential Information does not include information which: (a) is or becomes
    public through no breach of this Agreement; (b) the Recipient already held without
    obligation of confidence; (c) the Recipient receives from a third party entitled to
    disclose it; or (d) the Recipient develops independently without reference to the
    Discloser's information.

3. THE RECIPIENT'S OBLIGATIONS

3.1 The Recipient will keep the Confidential Information confidential, will use it
    only for the Purpose, and will protect it with at least the care it applies to its
    own confidential information.

3.2 The Recipient may disclose Confidential Information to its officers, employees and
    professional advisers who need it for the Purpose, provided they are bound by
    obligations no less protective than these.

3.3 The Recipient will not reverse-engineer, decompile or attempt to derive the
    structure of any software or system demonstrated to it under this Agreement.

4. COMPELLED DISCLOSURE

If the Recipient is required by law, regulation or court order to disclose
Confidential Information, it may do so, provided it gives the Discloser prompt written
notice where lawful to do so, and discloses only what is required.

5. NO LICENCE, NO OBLIGATION

5.1 Nothing in this Agreement grants either Party any licence or right in the other's
    intellectual property.

5.2 Nothing in this Agreement obliges either Party to disclose anything, or to enter
    into any further agreement.

6. RETURN AND DESTRUCTION

On written request, the Recipient will return or destroy the Confidential Information
in its possession, save for one copy retained for legal or record-keeping purposes and
for copies held in routine electronic backups, which remain subject to this Agreement.

7. DURATION

7.1 This Agreement takes effect on {{DATE}}.

7.2 The obligations at clause 3 continue for three (3) years from the date of
    disclosure of the information concerned.

8. GOVERNING LAW

This Agreement is governed by the laws of India. The competent courts at Delhi, India
have exclusive jurisdiction.

${SIGNATURES}`,
  },

  {
    id: 'builtin-oa-consent',
    title: 'Open Access Indexing & Attribution Undertaking — {{PUBLISHER_NAME}}',
    version: '1.0',
    description: 'For OA publishers already being indexed — records their consent and your attribution promises.',
    body: `OPEN ACCESS INDEXING & ATTRIBUTION UNDERTAKING

${PARTIES}

BACKGROUND

{{PLATFORM}} indexes Open Access scholarly content that is already lawfully and freely
available to the public, and makes it discoverable to its users. Content published by
{{PUBLISHER_NAME}} is, or may become, discoverable in this way. This Undertaking
records what {{COMPANY_SHORT}} does with that content, what it does not claim, and the
rights the Publisher holds over it.

1. WHAT {{COMPANY_SHORT}} UNDERTAKES

1.1 Attribution. Every item is displayed under the name of the journal and publisher
    that produced it, together with the author names, ISSN where available, volume,
    issue, pages, year and DOI. {{COMPANY_SHORT}} does not substitute its own name,
    logo or imprint for the Publisher's.

1.2 No ownership claim. {{COMPANY_SHORT}} claims no ownership of, and no exclusive
    right in, the Publisher's content. Inclusion on the Platform implies no
    endorsement, affiliation or sponsorship.

1.3 No alteration. Content is served as received. It is not re-branded, watermarked,
    re-typeset, abridged or translated, and no derivative version is created.

1.4 The DOI is displayed and resolvable, so that a reader can always reach the
    Publisher's own site of publication directly.

1.5 Licence terms are honoured. Content carrying a non-commercial restriction is not
    made available within any paid tier of the Platform without the Publisher's
    express written permission.

1.6 Fees are for the software. Subscription fees are consideration for the Platform's
    software and services, not for the Publisher's scholarship. Content that is Open
    Access at source remains Open Access at source, unaffected.

2. THE PUBLISHER'S RIGHTS

2.1 Removal on request. The Publisher may require {{COMPANY_SHORT}} to remove any item
    or all of its content at any time, by written notice to {{COMPANY_EMAIL}}. No
    reason need be given, no infringement need be alleged, and no fee is charged.

2.2 Standing exclusion. The Publisher may require that its titles, ISSNs or imprints be
    placed on a permanent exclusion list, so that its content is not acquired by any
    future harvest.

2.3 Correction. The Publisher may require the correction of any attribution or metadata
    it considers inaccurate.

2.4 Timelines. {{COMPANY_SHORT}} will acknowledge any request under this clause within
    twenty-four (24) hours, suspend access to the material concerned within
    seventy-two (72) hours where it is identifiable, and confirm the action taken
    within fifteen (15) days.

3. THE PUBLISHER'S CONFIRMATION

By signing, the Publisher confirms that it is aware its Open Access content is
discoverable through the Platform on the terms above, and that it has the rights at
clause 2 available to it at any time.

Signing this Undertaking does not oblige the Publisher to enter into any commercial
arrangement with {{COMPANY_SHORT}}, and declining to sign it does not affect any right
at clause 2.

4. CONTACT

Rights and takedown: {{COMPANY_EMAIL}} · {{COMPANY_PHONE}}
Postal: {{COMPANY_ADDRESS}}

5. GOVERNING LAW

This Undertaking is governed by the laws of India. The competent courts at Delhi, India
have exclusive jurisdiction. Nothing in this clause prevents the Publisher from making
a request under clause 2 from any jurisdiction.

${SIGNATURES}`,
  },
];
