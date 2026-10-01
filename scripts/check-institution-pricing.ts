// Run: npx tsx scripts/check-institution-pricing.ts
import assert from 'node:assert/strict';
import { priceDepartments, priceSeats, seatRate, termEnd } from '../src/lib/institutionPricing';

assert.deepEqual(priceDepartments(1), { quantity: 1, rate: 9990, base: 9990, gst: 1798.2, total: 11788.2 });
assert.equal(priceDepartments(2).rate, 9490);
assert.equal(priceDepartments(3).rate, 8990);
assert.equal(priceDepartments(4).rate, 8490);
assert.equal(priceDepartments(5).rate, 7990);
assert.equal(priceDepartments(29).base, 29 * 7990);
assert.equal(priceDepartments(0).total, 0);

assert.equal(seatRate(5), 0);
assert.equal(seatRate(6), 2490);
assert.equal(seatRate(100), 2490);
assert.equal(seatRate(101), 1990);
assert.equal(seatRate(250), 1990);
assert.equal(seatRate(251), 1490);
assert.equal(seatRate(500), 1490);
assert.equal(seatRate(501), 1190);
assert.equal(seatRate(999), 1190);
assert.equal(seatRate(1000), 1000);
assert.equal(seatRate(5000), 1000);

// 5 included -> 50 total: 45 extra at the 6–100 band.
assert.deepEqual(priceSeats(50), { quantity: 45, rate: 2490, base: 112050, gst: 20169, total: 132219 });
// Already at 50, growing to 300: 250 added at the 251–500 band.
assert.equal(priceSeats(300, 50).quantity, 250);
assert.equal(priceSeats(300, 50).rate, 1490);
// Nothing to buy.
assert.equal(priceSeats(5).total, 0);
assert.equal(priceSeats(40, 60).total, 0);

const end = termEnd(new Date('2026-10-15T10:00:00Z'));
assert.equal(end.toISOString().slice(0, 10), '2027-10-15');

console.log('institution pricing: all checks pass');
