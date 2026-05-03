'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, tokenHelpers, User } from './api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = tokenHelpers.get();
    if (!token) { setLoading(false); return; }
    authApi.getMe()
      .then((d) => setUser(d.user))
      .catch(() => tokenHelpers.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const d = await authApi.login({ email, password });
    tokenHelpers.set(d.token);
    setUser(d.user);
  };

  const signup = async (name: string, email: string, password: string): Promise<void> => {
    const d = await authApi.signup({ name, email, password });
    tokenHelpers.set(d.token);
    setUser(d.user);
  };

  const logout = (): void => {
    tokenHelpers.clear();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}