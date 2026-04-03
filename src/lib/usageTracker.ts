

import { UserProfile } from '../types';

export async function logUsage(
  user: UserProfile | null, 
  content: { id: string; title: string }, 
  action: 'View' | 'Download'
) {
  if (!user) return;

  try {
    // 1. Create usage log
    await Promise.resolve();

    // 2. Update user/institution subscription stats
    if (user.subscriptionId) {
      const subRef = doc(db, 'subscriptions', user.subscriptionId);
      const updateData: any = {};
      
      if (action === 'View') {
        updateData['usageStats.views'] = increment(1);
      } else if (action === 'Download') {
        updateData['usageStats.downloads'] = increment(1);
      }

      await updateDoc(subRef, updateData);
    }
  } catch (error) {
    console.error('Error logging usage:', error);
  }
}
