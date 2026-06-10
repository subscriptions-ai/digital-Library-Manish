import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AnalyticsTracker() {
  const location = useLocation();
  const { profile } = useAuth();

  useEffect(() => {
    // Generate a simple session ID if not exists
    let sessionId = sessionStorage.getItem('stm_analytics_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      sessionStorage.setItem('stm_analytics_session_id', sessionId);
    }

    // Fire tracking event
    const trackVisit = async () => {
      try {
        await fetch('/api/analytics/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: location.pathname,
            userId: profile?.uid || null,
            userRole: profile?.role || 'Guest',
            sessionId: sessionId
          })
        });
      } catch (err) {
        console.error('Failed to track page visit:', err);
      }
    };

    // Use a small timeout to avoid blocking main thread rendering
    const timeout = setTimeout(() => {
      trackVisit();
    }, 500);

    return () => clearTimeout(timeout);
  }, [location.pathname, profile?.uid]);

  return null;
}
