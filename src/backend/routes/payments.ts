import { Router } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { db } from '../db';
import { orders, subscriptions } from '../schema';
import { authenticate } from '../middleware/auth';
import { eq } from 'drizzle-orm';

export const paymentsRouter = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret',
});

// Create Order (public or authenticated)
paymentsRouter.post('/order', async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;
    const options = {
      amount: Math.round(amount * 100), // convert to paise
      currency,
      receipt,
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

paymentsRouter.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, items } = req.body;
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "placeholder_secret")
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      // Create order record and trigger subscription
      await db.transaction(async (tx) => {
        // Find existing order if any (assuming not, this creates it)
        const [newOrder] = await tx.insert(orders).values({
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          amount,
          status: 'Paid'
        }).returning();

        // Create subscription if items exist (mocked parsing)
        if(items && items.length > 0) {
          // implementation to add subscriptions...
        }
      });
      res.json({ status: "success", message: "Payment verified successfully" });
    } else {
      res.status(400).json({ status: "failure", message: "Invalid signature" });
    }
  } catch (error) {
    console.error("Payment Verification Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

paymentsRouter.post('/webhook', (req, res) => {
  // Webhook handling logic
  res.json({ status: 'ok' });
});
