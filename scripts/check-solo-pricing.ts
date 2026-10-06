// Run: npx tsx scripts/check-solo-pricing.ts
import assert from 'node:assert/strict';
import { calculateSoloSubscriptionPrice as solo, soloRateFor, SOLO_FOUR_DEPT_MESSAGE } from '../src/lib/soloPricing';
import { priceDepartments, departmentRate } from '../src/lib/institutionPricing';

// Solo: 1–4 at ₹4,990, 5+ at ₹3,990 on every department.
assert.equal(solo(0).subtotal, 0);
assert.equal(solo(0).total, 0);
assert.equal(solo(1).subtotal, 4990);
assert.equal(solo(2).subtotal, 9980);
assert.equal(solo(3).subtotal, 14970);
assert.equal(solo(4).subtotal, 19960);
assert.equal(solo(5).subtotal, 19950);
assert.equal(solo(6).subtotal, 23940);
assert.equal(solo(4).rate, 4990);
assert.equal(solo(5).rate, 3990);
assert.equal(soloRateFor(29), 3990);

// The nudge and the badge.
assert.equal(solo(4).toUnlockBulk, 1);
assert.equal(solo(3).toUnlockBulk, 0);
assert.equal(solo(5).toUnlockBulk, 0);
assert.equal(solo(4).bulkApplied, false);
assert.equal(solo(5).bulkApplied, true);
assert.equal(SOLO_FOUR_DEPT_MESSAGE, 'Add one more department to unlock the ₹3,990 per department annual rate.');

// GST: 18% on top; CGST+SGST in Delhi, IGST elsewhere, no guess when unknown.
const delhi = solo(1, { state: 'Delhi' });
assert.equal(delhi.gst, 898.2);
assert.equal(delhi.total, 5888.2);
assert.equal(delhi.gstSplit, 'cgst-sgst');
assert.equal(delhi.cgst + delhi.sgst, delhi.gst);
assert.equal(delhi.igst, 0);
const up = solo(5, { state: 'Uttar Pradesh' });
assert.equal(up.gstSplit, 'igst');
assert.equal(up.igst, up.gst);
assert.equal(up.cgst + up.sgst, 0);
assert.equal(up.gst, 3591);
assert.equal(up.total, 23541);
assert.equal(solo(2).gstSplit, 'unknown');

// Institution pricing is untouched: same slabs as scripts/check-institution-pricing.ts.
assert.deepEqual(
  [1, 2, 3, 4, 5, 6].map(departmentRate),
  [9990, 9490, 8990, 8490, 7990, 7990],
);
assert.deepEqual(priceDepartments(1), { quantity: 1, rate: 9990, base: 9990, gst: 1798.2, total: 11788.2 });
assert.equal(priceDepartments(5).base, 5 * 7990);

console.log('solo pricing: all checks pass (institution rates unchanged)');
