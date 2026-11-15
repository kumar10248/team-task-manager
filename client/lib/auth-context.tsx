'use client';
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authApi, subscriptionApi, tokenHelpers, User, Subscription } from './api';

interface AuthContextValue {
  user: User | null;
  subscription: Subscription | null;
  isCoveredByAdmin: boolean;
  coveringAdminName: string | null;
  ownedProjectsCount: number;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  setSubscription: (sub: Subscription | null) => void;
  refreshSubscription: () => Promise<Subscription | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                             = useState<User | null>(null);
  const [subscription, setSubscription]             = useState<Subscription | null>(null);
  const [isCoveredByAdmin, setIsCoveredByAdmin]     = useState<boolean>(false);
  const [coveringAdminName, setCoveringAdminName]   = useState<string | null>(null);
  const [ownedProjectsCount, setOwnedProjectsCount] = useState<number>(0);
  const [loading, setLoading]                       = useState<boolean>(true);

  const refreshSubscription = useCallback(async (): Promise<Subscription | null> => {
    try {
      const res = await subscriptionApi.get();
      if (res.success) {
        setSubscription(res.subscription);
        setIsCoveredByAdmin(Boolean(res.isCoveredByAdmin));
        setCoveringAdminName(res.coveringAdminName || null);
        setOwnedProjectsCount(res.ownedProjectsCount || 0);
        return res.subscription;
      }
    } catch {
      // ignore background refresh errors
    }
    return null;
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const d = await authApi.getMe();
        if (!isMounted) return;
        setUser(d.user);

        if (d.subscription) {
          setSubscription(d.subscription);
          setIsCoveredByAdmin(Boolean(d.isCoveredByAdmin));
          setCoveringAdminName(d.coveringAdminName || null);
          setOwnedProjectsCount(d.ownedProjectsCount || 0);
        } else {
          const sub = await refreshSubscription();
          if (isMounted && sub) {
            setSubscription(sub);
          }
        }
      } catch {
        if (!isMounted) return;
        tokenHelpers.clear();
        setUser(null);
        setSubscription(null);
        setIsCoveredByAdmin(false);
        setCoveringAdminName(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [refreshSubscription]);

  const login = async (email: string, password: string): Promise<void> => {
    const d = await authApi.login({ email, password });
    tokenHelpers.set(d.token);
    setUser(d.user);
    refreshSubscription();
  };

  const signup = async (name: string, email: string, password: string): Promise<void> => {
    const d = await authApi.signup({ name, email, password });
    tokenHelpers.set(d.token);
    setUser(d.user);
    refreshSubscription();
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      tokenHelpers.clear();
      setUser(null);
      setSubscription(null);
      setIsCoveredByAdmin(false);
      setCoveringAdminName(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      subscription,
      isCoveredByAdmin,
      coveringAdminName,
      ownedProjectsCount,
      loading,
      login,
      signup,
      logout,
      setUser,
      setSubscription,
      refreshSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}