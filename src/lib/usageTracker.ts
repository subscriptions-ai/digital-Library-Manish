import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

export async function logUsage(
  user: UserProfile | null, 
  content: { id: string; title: string }, 
  action: 'View' | 'Download'
) {
  if (!user) return;

  try {
    // 1. Create usage log
    await addDoc(collection(db, 'usage_logs'), {
      userId: user.uid,
      userEmail: user.email,
      institutionId: user.institutionId || null,
      contentId: content.id,
      contentTitle: content.title,
      action,
      timestamp: serverTimestamp()
    });

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
