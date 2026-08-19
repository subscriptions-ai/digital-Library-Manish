// One-time, idempotent backfill for quotations that were marked Paid before the
// payments ledger was wired up.
//
// Payment rows used to be created only by the Razorpay verify webhook, so a
// quotation marked Paid by an admin left /admin/payments empty. This creates the
// missing ledger entry for every already-Paid quotation, using the receipt's
// payment method and date where a receipt exists.
//
// Safe to re-run: keyed on Payment.orderId = Quotation.id, which is unique.
//
//   node scripts/backfill-quotation-payments.cjs           # report only
//   node scripts/backfill-quotation-payments.cjs --apply   # write changes
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

(async () => {
  const paid = await prisma.quotation.findMany({ where: { status: 'Paid' } });
  console.log(`Paid quotations found: ${paid.length}`);

  let created = 0, already = 0;
  for (const q of paid) {
    const existing = await prisma.payment.findUnique({ where: { orderId: q.id } });
    if (existing) { already++; continue; }

    const receipt = await prisma.receipt.findFirst({ where: { quotationId: q.id } });
    const data = {
      orderId:   q.id,
      paymentId: receipt ? receipt.receiptNumber : null,
      amount:    q.total,
      status:    'Success',
      method:    receipt ? receipt.paymentMethod : 'Bank Transfer',
      userId:    q.userId || null,
      items:     q.items || [],
      createdAt: receipt ? receipt.paymentDate : q.createdAt,
    };

    console.log(
      `${APPLY ? 'creating' : 'would create'}  ${q.id}  ${q.userName}  ` +
      `₹${q.total}  method=${data.method}  receipt=${data.paymentId || 'none'}`
    );
    if (APPLY) await prisma.payment.create({ data });
    created++;
  }

  console.log(
    `\n${APPLY ? 'Created' : 'Would create'}: ${created}   Already present: ${already}`
  );
  if (!APPLY && created > 0) console.log('Re-run with --apply to write these.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
