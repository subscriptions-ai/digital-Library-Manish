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
  legalName: "Consortium eLearning Network Pvt. Ltd.",
  shortName: "CELNET",
  /** Shown beneath the product name on documents, emails and the footer. */
  positioning: "A Division of Consortium eLearning Network Pvt. Ltd.",

  gstin: "09AACCC6494M1Z1",
  pan: "AACCC6494M",
  cin: "U80302DL2005PTC138759",
  /** Import Export Code — printed on receipts. */
  iec: "AACCC6494M",

  /**
   * The entity's registered state. This drives whether a customer is billed
   * CGST + SGST or IGST — see `COMPANY_STATE` in src/lib/gstUtils.ts, which
   * reads this value. Changing it changes the tax split on every new document.
   */
  state: "Uttar Pradesh",

  address: "A-118, 1st Floor, Sector 63, Noida, Uttar Pradesh, India - 201301",
  /** Shorter form used inside document footers. */
  registeredOffice: "A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India",

  tel: ["0120-4781200", "0120-4781206"],
  mobile: "+91-9810078958",
  whatsapp: "+91-9810078958",
  email: "info@celnet.in",

  bank: {
    accountNumber: "03942000001153",
    accountName: "Consortium eLearning Network Pvt. Ltd.",
    bankName: "HDFC Bank",
    branch: "Sector-62, Noida, U.P., India",
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

/** "GSTIN: … | PAN: … | CIN: …" — the statutory line at the foot of documents. */
export const STATUTORY_LINE =
  `GSTIN: ${COMPANY_DETAILS.gstin}  |  PAN: ${COMPANY_DETAILS.pan}  |  CIN: ${COMPANY_DETAILS.cin}`;
