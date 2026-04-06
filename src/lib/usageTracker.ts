import { UserProfile } from '../types';

export async function logUsage(
  user: UserProfile | null, 
  content: { id: string; title: string }, 
  action: 'View' | 'Download'
) {
  if (!user) return;

  try {
    if (user.role === 'Student' || user.role === 'Subscriber') {
      await fetch('/api/student/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          contentId: content.id, 
          timeSpent: action === 'View' ? 120 : 0 // Arbitrary simple weighting 
        })
      });
    }
  } catch (error) {
    console.error('Error logging usage:', error);
  }
}

