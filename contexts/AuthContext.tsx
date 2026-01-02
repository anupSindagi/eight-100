'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import pb from '@/lib/pocketbase';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: any;
  loading: boolean;
  signUp: (email: string, password: string, passwordConfirm: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is already authenticated
    setUser(pb.authStore.model);
    setLoading(false);

    // Listen for auth changes
    pb.authStore.onChange((token, model) => {
      setUser(model);
    });
  }, []);

  const signUp = async (email: string, password: string, passwordConfirm: string) => {
    try {
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm,
      });
      // Auto login after signup
      await signIn(email, password);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign up');
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password);
      router.push('/');
    } catch (error: any) {
      throw new Error(error.message || 'Failed to sign in');
    }
  };

  const signOut = () => {
    pb.authStore.clear();
    router.push('/signin');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
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

