import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSubscriptionManager: boolean;
  isSubscriber: boolean;
  isContentManager: boolean;
  isInstitutionAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch or create profile
        const profileRef = doc(db, 'users', currentUser.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          setProfile(profileSnap.data() as UserProfile);
        } else {
          // Check if this is the bootstrap admin email
          const isBootstrapAdmin = currentUser.email === 'subscriptions@stmjournals.com';
          
          // Create default profile for new users
          const newProfile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            role: isBootstrapAdmin ? 'SuperAdmin' : 'Subscriber',
            displayName: currentUser.displayName || '',
            status: 'Active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(profileRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await auth.signOut();
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
