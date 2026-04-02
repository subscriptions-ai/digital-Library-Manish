import { Router } from 'express';
import { db } from '../db';
import { subscriptions } from '../schema';
import { eq } from 'drizzle-orm';
import { authenticate, requireRole } from '../middleware/auth';

export const subscriptionsRouter = Router();

subscriptionsRouter.use(authenticate);

// Get my subscriptions
subscriptionsRouter.get('/my', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const mySubs = await db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId) });
    res.json(mySubs);
  } catch (error) {
    console.error('Fetch my subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all subscriptions - Admin / SubscriptionManager only
subscriptionsRouter.get('/', requireRole(['SuperAdmin', 'SubscriptionManager']), async (req, res) => {
  try {
    const allSubs = await db.query.subscriptions.findMany();
    res.json(allSubs);
  } catch (error) {
    console.error('Fetch subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update subscription
subscriptionsRouter.patch('/:id', requireRole(['SuperAdmin', 'SubscriptionManager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, usageLimitsViews, usageLimitsDownloads } = req.body;
    
    const [updatedSub] = await db.update(subscriptions).set({
      status,
      usageLimitsViews,
      usageLimitsDownloads,
    }).where(eq(subscriptions.id, id)).returning();

    if (!updatedSub) return res.status(404).json({ error: 'Subscription not found' });
    res.json(updatedSub);
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
