export const GST_RATE = 0.18;
export const CGST_RATE = 0.09;
export const SGST_RATE = 0.09;
export const IGST_RATE = 0.18;

export interface GSTBreakdown {
  basePrice: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  totalAmount: number;
}

export function calculateGST(basePrice: number, isInterState: boolean): GSTBreakdown {
  const totalGst = basePrice * GST_RATE;
  const totalAmount = basePrice + totalGst;

  if (isInterState) {
    return {
      basePrice,
      cgst: 0,
      sgst: 0,
      igst: totalGst,
      totalGst,
      totalAmount,
    };
  } else {
    const cgst = basePrice * CGST_RATE;
    const sgst = basePrice * SGST_RATE;
    return {
      basePrice,
      cgst,
      sgst,
      igst: 0,
      totalGst,
      totalAmount,
    };
  }
}

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

export const COMPANY_STATE = "Uttar Pradesh";
