import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  SubscriberDashboardView, 
  SubscriptionManagerDashboardView, 
  AdminDashboardView 
} from './DashboardViews';

export function DashboardHome() {
  const { profile, isAdmin, isSubscriptionManager, isSubscriber } = useAuth();

  if (isAdmin) return <AdminDashboardView profile={profile} />;
  if (isSubscriptionManager) return <SubscriptionManagerDashboardView profile={profile} />;
  if (isSubscriber) return <SubscriberDashboardView profile={profile} />;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Welcome, {profile?.displayName || profile?.email}!</h1>
        <p className="text-slate-500">Your account is currently being set up. Please check back soon.</p>
      </div>
    </div>
  );
}
