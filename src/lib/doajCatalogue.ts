import Papa from 'papaparse';
import { ingestionDb as p, licenceAllowsCommercialUse, normaliseIssn } from './ingestionWorker.js';

/**
 * Every journal DOAJ lists, in one go.
 *
 * The search API stops at 1,000 results for any query ("You cannot access
 * results beyond 1000 records via this API"), so a term such as "medicine",
 * which matches 5,377 journals, can never yield more than a fifth of them, and
 * searching by department plateaued near ten thousand of DOAJ's 23,000. DOAJ
 * publishes its whole journal list as one CSV instead, with each title's
 * licence and its Library of Congress class, and that is what this reads.
 *
 * The rights rule is the one discovery already applies: a title is Accepted —
 * full text may be served — only when every licence it declares allows
 * commercial use. Everything else is catalogued as metadata only.
 *
 * Journals already held are left exactly as they are: their department, their
 * licence decision and anything an admin set. Only new titles are written.
 */

export const DOAJ_CSV_URL = 'https://doaj.org/csv';

// ── Department, from the Library of Congress class ─────────────────────────

/** "TK5101-6720" → { cls: 'TK', num: 5101 } */
function parseLcc(code: string) {
  const m = /^([A-Z]+)\s*([0-9.]+)?/.exec(code.trim().toUpperCase());
  return m ? { cls: m[1], num: m[2] ? parseFloat(m[2]) : null } : null;
}

const within = (num: number | null, lo: number, hi: number) => num !== null && num >= lo && num <= hi;

function departmentFromLcc(cls: string, num: number | null): string | null {
  const c1 = cls[0];
  switch (c1) {
    case 'A': return cls === 'AZ' ? 'Arts' : 'Multidisciplinary';
    case 'B': return cls === 'BF' ? 'Education and Social Sciences' : 'Arts';
    case 'C': case 'D': case 'E': case 'F': return 'Arts';
    case 'G':
      if (cls === 'GE') return 'Life Sciences';
      if (['GF', 'GN', 'GR', 'GT', 'GV'].includes(cls)) return 'Education and Social Sciences';
      return 'Science';
    case 'H':
      if (cls === 'HA') return 'Science';
      if (['HB', 'HC', 'HG', 'HJ', 'HE'].includes(cls)) return 'Commerce';
      if (cls === 'HD') return within(num, 28, 70.99) ? 'Management' : 'Commerce';   // HD28–70 is management; the rest land, labour, industry
      if (cls === 'HF') {
        if (within(num, 5601, 5689)) return 'Commerce';            // accounting
        if (within(num, 5001, 6182)) return 'Management';          // business
        return 'Commerce';                                        // trade
      }
      return 'Education and Social Sciences';                     // HM–HX
    case 'J': return 'Education and Social Sciences';
    case 'K': return 'Law';
    case 'L': return 'Education and Social Sciences';
    case 'M': return 'Arts';
    case 'N': return cls === 'NA' ? 'Architecture' : 'Arts';
    case 'P': return 'Arts';
    case 'Q':
      if (cls === 'QA') return within(num, 75, 76.99) ? 'Computer / IT' : 'Science';
      if (cls === 'QD') return 'Chemistry';
      if (['QH', 'QK', 'QL', 'QM', 'QP', 'QR'].includes(cls)) return 'Life Sciences';
      return 'Science';                                           // Q, QB, QC, QE
    case 'R':
      if (cls === 'RK') return 'Dental';
      if (cls === 'RT') return 'Nursing';
      if (cls === 'RS') return 'Pharmacy';
      if (cls === 'RM') return within(num, 695, 893) ? 'Physiotherapy' : 'Pharmacy';
      if (cls === 'RZ' || cls === 'RV') return 'Ayurveda';
      return 'Medical Sciences';
    case 'S': return 'Agriculture';
    case 'T':
      if (cls === 'T') return 'Applied Sciences';
      if (cls === 'TA') {
        if (within(num, 349, 359)) return 'Applied Mechanics';
        if (within(num, 401, 492)) return 'Material Science';
        return 'Civil / Construction Engineering';
      }
      if (['TC', 'TD', 'TE', 'TF', 'TG', 'TH'].includes(cls)) return 'Civil / Construction Engineering';
      if (cls === 'TJ') return within(num, 807, 830) || within(num, 163, 163.99) ? 'Energy' : 'Mechanical Engineering';
      if (cls === 'TK') {
        if (within(num, 7885, 7895)) return 'Computer / IT';
        if (within(num, 5101, 6720) || within(num, 7800, 8360)) return 'Electronics & Telecommunication Engineering';
        if (within(num, 1001, 1841) || within(num, 9001, 9401)) return 'Energy';
        return 'Electrical Engineering';
      }
      if (cls === 'TL' || cls === 'TS') return 'Mechanical Engineering';
      if (cls === 'TN') return 'Material Science';
      if (cls === 'TP') {
        if (within(num, 248, 248.99)) return 'Bio Technology';
        if (within(num, 315, 360)) return 'Energy';
        return 'Chemical Engineering';
      }
      if (cls === 'TR' || cls === 'TT') return 'Arts';
      if (cls === 'TX') return 'Life Sciences';
      return 'Applied Sciences';
    case 'U': case 'V': return 'Applied Sciences';
    case 'Z': return 'Education and Social Sciences';
  }
  return null;
}

/**
 * Several departments have no class of their own in the Library of Congress
 * scheme — nanotechnology sits in physics, ayurveda in medicine, energy across
 * three classes. A journal that names itself one of these is put there. The
 * narrower terms are read from the title and keywords; the broader ones from
 * the title alone, so a medical journal with "rehabilitation" among twenty
 * keywords stays in medicine.
 */
const BY_TITLE_OR_KEYWORD: [RegExp, string][] = [
  [/\bnano/, 'Nano Technology'],
  [/biotechnolog/, 'Bio Technology'],
  [/ayurved|\bunani\b|\bsiddha\b|homoeopath|homeopath|traditional (chinese |indian )?medicine|herbal medicine|pharmacognosy|ethnopharmacolog/, 'Ayurveda'],
];
const BY_TITLE: [RegExp, string][] = [
  [/physiotherap|physical therapy|rehabilitat/, 'Physiotherapy'],
  [/nursing|midwifery/, 'Nursing'],
  [/\bdental|dentistry|\boral (health|surgery|medicine|science)|orthodont|periodont|endodont/, 'Dental'],
  [/renewable|solar|\benergy\b|\bfuels?\b|petroleum|power systems?/, 'Energy'],
  [/materials? science|metallurg|polymer|ceramic|composite materials/, 'Material Science'],
  [/(?<!quantum )(?<!fluid )\bmechanics\b/, 'Applied Mechanics'],
  [/\bmanagement\b|marketing|human resource|business administration|entrepreneur|tourism|hospitality/, 'Management'],
];

export function departmentForDoajRow(row: Record<string, string>): string | null {
  const title = (row['Journal title'] || '').toLowerCase();
  const keywords = (row['Keywords'] || '').toLowerCase();
  for (const [re, dep] of BY_TITLE_OR_KEYWORD) if (re.test(title) || re.test(keywords)) return dep;
  for (const [re, dep] of BY_TITLE) if (re.test(title)) return dep;
  for (const code of (row['LCC Codes'] || '').split('|')) {
    const lcc = parseLcc(code);
    const dep = lcc && departmentFromLcc(lcc.cls, lcc.num);
    if (dep) return dep;
  }
  return null;
}

// ── The import ─────────────────────────────────────────────────────────────

export type CatalogueResult = {
  inFile: number; alreadyHeld: number; added: number; accepted: number; metadataOnly: number;
  noDepartment: number; byDepartment: Record<string, number>; dryRun: boolean;
};

export function doajRowToJournal(row: Record<string, string>) {
  const pissn = normaliseIssn(row['Journal ISSN (print version)']);
  const eissn = normaliseIssn(row['Journal EISSN (online version)']);
  const issn = pissn || eissn;
  const title = (row['Journal title'] || '').trim();
  if (!issn || !title) return null;

  // "CC BY, CC BY-NC-ND" is a journal that publishes under either; only a title
  // whose every licence allows commercial use is cleared for full text.
  const licences = (row['Journal license'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const ncAttr = /no commercial/i.test(row['License attributes'] || '');
  const ok = licences.length > 0 && !ncAttr && licences.every(l => licenceAllowsCommercialUse(l, false));

  return {
    title,
    issn,
    eissn: eissn && eissn !== issn ? eissn : (pissn ? eissn : null),
    publisherName: (row['Publisher'] || '').trim() || null,
    country: (row['Country of publisher'] || '').trim() || null,
    language: (row['Languages in which the journal accepts manuscripts'] || '').trim() || null,
    domain: departmentForDoajRow(row),
    subject: (row['Subjects'] || '').split('|')[0]?.trim() || null,
    subjects: (row['Subjects'] || '').split('|').map(s => s.trim()).filter(Boolean),
    homepage: (row['Journal URL'] || '').trim() || null,
    licence: licences.join(', ') || null,
    licenceIsNC: !ok,
    rightsBasis: 'DOAJ declaration',
    rightsVerifiedAt: new Date(),
    rightsVerifiedBy: 'ingestion',
    status: ok ? 'Accepted' : 'MetadataOnly',
  };
}

export async function importDoajCatalogue(opts: { dryRun?: boolean; csvText?: string } = {}): Promise<CatalogueResult> {
  const text = opts.csvText ?? await (async () => {
    const r = await fetch(DOAJ_CSV_URL, { headers: { 'User-Agent': 'STM Digital Library (mailto:info@celnet.in)' } });
    if (!r.ok) throw new Error(`DOAJ answered HTTP ${r.status} for the journal list`);
    return r.text();
  })();
  const rows = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;

  // Everything already held, by every ISSN it is known by, read once.
  const held = new Set<string>();
  const heldTitles = new Set<string>();
  for (const j of await p.journal.findMany({ select: { issn: true, eissn: true, title: true } })) {
    if (j.issn) held.add(j.issn);
    if (j.eissn) held.add(j.eissn);
    heldTitles.add(j.title.trim().toLowerCase());
  }

  const result: CatalogueResult = {
    inFile: rows.length, alreadyHeld: 0, added: 0, accepted: 0, metadataOnly: 0,
    noDepartment: 0, byDepartment: {}, dryRun: !!opts.dryRun,
  };
  const fresh: any[] = [];
  for (const row of rows) {
    const j = doajRowToJournal(row);
    if (!j) continue;
    if (held.has(j.issn) || (j.eissn && held.has(j.eissn)) || heldTitles.has(j.title.toLowerCase())) {
      result.alreadyHeld++;
      continue;
    }
    // The same title can appear twice in the file under its two ISSNs.
    held.add(j.issn); if (j.eissn) held.add(j.eissn);
    fresh.push(j);
    j.status === 'Accepted' ? result.accepted++ : result.metadataOnly++;
    if (!j.domain) result.noDepartment++;
    const k = j.domain || '(none)';
    result.byDepartment[k] = (result.byDepartment[k] || 0) + 1;
  }

  if (!opts.dryRun) {
    for (let i = 0; i < fresh.length; i += 500) {
      const r = await p.journal.createMany({ data: fresh.slice(i, i + 500), skipDuplicates: true });
      result.added += r.count;
    }
  }
  return result;
}
