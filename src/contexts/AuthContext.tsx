import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';
import { UserProfile } from '../types';

interface AuthContextType {
  user: any | null; // JWT token payload equivalent or user from API
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSubscriptionManager: boolean;
  isContentManager: boolean;
  isInstitutionAdmin: boolean;
  login: (data: any) => Promise<void>;
  signup: (data: any) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.auth.me();
          if (res.user) {
            setUser(res.user);
            setProfile(res.user);
          } else {
            // Invalid token
            localStorage.removeItem('token');
            setUser(null);
            setProfile(null);
          }
        } catch (error) {
          console.error("Auth init error:", error);
          localStorage.removeItem('token');
          setUser(null);
          setProfile(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (data: any) => {
    const res = await api.auth.login(data);
    if (res.token) {
      localStorage.setItem('token', res.token);
      setUser(res.user);
      setProfile(res.user);
    }
  };

  const signup = async (data: any) => {
    const res = await api.auth.signup(data);
    if (res.token) {
      localStorage.setItem('token', res.token);
      setUser(res.user);
      setProfile(res.user);
    }
  };

  const logout = async () => {
    localStorage.removeItem('token');
    setUser(null);
    setProfile(null);
    try {
      await api.auth.logout();
    } catch(e) {
      // Ignore network errors on logout
    }
  };

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'SuperAdmin',
    isSubscriptionManager: profile?.role === 'SubscriptionManager' || profile?.role === 'SuperAdmin',
    isContentManager: profile?.role === 'ContentManager' || profile?.role === 'SuperAdmin',
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
