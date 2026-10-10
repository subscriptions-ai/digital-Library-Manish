/**
 * Library of Congress class → department. Pure, shared by the journal catalogue and the book classifier.
 */

/** "TK5101-6720" → { cls: 'TK', num: 5101 } */
export function parseLcc(code: string) {
  const m = /^([A-Z]+)\s*([0-9.]+)?/.exec(code.trim().toUpperCase());
  return m ? { cls: m[1], num: m[2] ? parseFloat(m[2]) : null } : null;
}

export const within = (num: number | null, lo: number, hi: number) => num !== null && num >= lo && num <= hi;

export function departmentFromLcc(cls: string, num: number | null): string | null {
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
