import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { authApi } from '../lib/authApi';

interface AuthContextType {
  user: any | null; // Profile from backend
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSubscriptionManager: boolean;
  isSubscriber: boolean;
  isContentManager: boolean;
  isInstitutionAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, organization?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const profileData = await authApi.getMe();
      setUser(profileData);
      setProfile(profileData as UserProfile);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setUser(response.user);
    setProfile(response.user as UserProfile);
  };

  const signup = async (email: string, password: string, name: string, organization?: string) => {
    const response = await authApi.signup(email, password, name, organization);
    setUser(response.user);
    setProfile(response.user as UserProfile);
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    setProfile(null);
  };

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'Admin' || profile?.role === 'SuperAdmin',
    isSubscriptionManager: profile?.role === 'SubscriptionManager' || profile?.role === 'Admin' || profile?.role === 'SuperAdmin',
    isSubscriber: profile?.role === 'Subscriber' || profile?.role === 'Student',
    isContentManager: profile?.role === 'ContentManager' || profile?.role === 'Admin' || profile?.role === 'SuperAdmin',
    isInstitutionAdmin: (profile?.role === 'College' || profile?.role === 'University' || profile?.role === 'Corporate') && !!profile?.institutionId,
    login,
    signup,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
