// Run: npx tsx scripts/check-institution-pricing.ts
import assert from 'node:assert/strict';
import { priceDepartments, termEnd, MAX_INSTITUTION_USERS } from '../src/lib/institutionPricing';

assert.deepEqual(priceDepartments(1), { quantity: 1, rate: 9990, base: 9990, gst: 1798.2, total: 11788.2 });
assert.equal(priceDepartments(2).rate, 9490);
assert.equal(priceDepartments(3).rate, 8990);
assert.equal(priceDepartments(4).rate, 8490);
assert.equal(priceDepartments(5).rate, 7990);
assert.equal(priceDepartments(29).base, 29 * 7990);
assert.equal(priceDepartments(0).total, 0);

// Users are not priced: one limit, and nothing per user.
assert.equal(MAX_INSTITUTION_USERS, 1000);

const end = termEnd(new Date('2026-10-15T10:00:00Z'));
assert.equal(end.toISOString().slice(0, 10), '2027-10-15');

console.log('institution pricing: all checks pass');
