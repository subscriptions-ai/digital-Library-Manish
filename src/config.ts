/**
 * One source of truth for who operates this platform.
 *
 * Invoices, quotations, receipts, emails and legal pages must read from here
 * rather than hardcoding the name, GSTIN or bank block inline. Changing the
 * operating entity should be an edit to this file, not a search across the
 * codebase.
 *
 * The product and the company are deliberately separate below: STM Digital
 * Library is what we operate, and the entity is who operates it. The platform
 * does not own the content it indexes — that stays with the rights holders.
 */
export const COMPANY_DETAILS = {
  // ── The product ─────────────────────────────────────────────────────────
  name: "STM Digital Library",
  website: "https://journalslibrary.com/",

  // ── The operating entity ────────────────────────────────────────────────
  legalName: "IT Break COM Pvt. Ltd.",
  shortName: "IT Break",
  /** Shown beneath the product name on documents, emails and the footer. */
  positioning: "A product of IT Break COM Pvt. Ltd.",

  gstin: "07AAACI8666D1ZI",
  pan: "AAACI8666D",   // derived from the GSTIN — confirm against the PAN card
  cin: "U74899DL2001PTC109327",
  /** Import Export Code — printed on receipts. */
  iec: "AAACI8666D",   // TODO: confirm IT Break's actual Import Export Code

  /**
   * The entity's registered state. This drives whether a customer is billed
   * CGST + SGST or IGST — see `COMPANY_STATE` in src/lib/gstUtils.ts, which
   * reads this value. Changing it changes the tax split on every new document.
   */
  state: "Delhi",

  address: "A-118, 1st Floor, Sector 63, Noida, Uttar Pradesh, India - 201301",
  /** Shorter form used inside document footers. */
  registeredOffice: "A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India",

  tel: ["0120-4781200", "0120-4781206"],
  mobile: "+91-9810078958",
  whatsapp: "+91-9810078958",
  email: "info@celnet.in",

  bank: {
    accountNumber: "50200039946701",
    accountName: "IT Break COM Private Limited",
    bankName: "HDFC Bank",
    branch: "Sector 62, Noida, India",
    ifscCode: "HDFC0002649",
  },
} as const;

/**
 * The bank block as label/value pairs, in the order documents print it.
 * Kept here so the invoice and quotation renderers cannot drift apart.
 */
export const BANK_ROWS: [string, string][] = [
  ["Account Name", COMPANY_DETAILS.bank.accountName],
  ["Account Number", COMPANY_DETAILS.bank.accountNumber],
  ["Bank Name", COMPANY_DETAILS.bank.bankName],
  ["Branch", COMPANY_DETAILS.bank.branch],
  ["IFSC Code", COMPANY_DETAILS.bank.ifscCode],
];

/**
 * The issuing entity as it stands right now, in the shape stamped onto a
 * quotation or receipt when it is created.
 *
 * Documents must render from their own stamp rather than from this — see
 * `issuerOf`. That is what keeps an invoice issued last July naming the
 * company that actually issued it, after the operating entity changes.
 */
export function currentIssuer() {
  return {
    legalName: COMPANY_DETAILS.legalName,
    positioning: COMPANY_DETAILS.positioning,
    gstin: COMPANY_DETAILS.gstin,
    pan: COMPANY_DETAILS.pan,
    cin: COMPANY_DETAILS.cin,
    iec: COMPANY_DETAILS.iec,
    state: COMPANY_DETAILS.state,
    address: COMPANY_DETAILS.address,
    registeredOffice: COMPANY_DETAILS.registeredOffice,
    email: COMPANY_DETAILS.email,
    tel: [...COMPANY_DETAILS.tel],
    bank: { ...COMPANY_DETAILS.bank },
  };
}

export type Issuer = ReturnType<typeof currentIssuer>;

/**
 * The issuer a document should render with: its own stamp when it has one,
 * otherwise today's entity. The fallback covers rows created before stamping
 * existed and previews that have not been saved yet.
 */
export function issuerOf(record: any): Issuer {
  const stamped = record?.issuer;
  return stamped && typeof stamped === "object"
    ? { ...currentIssuer(), ...stamped }
    : currentIssuer();
}

/** Bank rows for a specific issuer, in the order documents print them. */
export function bankRowsOf(issuer: Issuer): [string, string][] {
  return [
    ["Account Name", issuer.bank.accountName],
    ["Account Number", issuer.bank.accountNumber],
    ["Bank Name", issuer.bank.bankName],
    ["Branch", issuer.bank.branch],
    ["IFSC Code", issuer.bank.ifscCode],
  ];
}

/** "GSTIN | PAN | CIN" for a specific issuer. */
export function statutoryLineOf(issuer: Issuer): string {
  return `GSTIN: ${issuer.gstin}  |  PAN: ${issuer.pan}  |  CIN: ${issuer.cin}`;
}

export const STATUTORY_LINE =
  `GSTIN: ${COMPANY_DETAILS.gstin}  |  PAN: ${COMPANY_DETAILS.pan}  |  CIN: ${COMPANY_DETAILS.cin}`;
