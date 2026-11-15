'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/Sidebar';
import TrialExpiredPaywall from '@/components/TrialExpiredPaywall';
import TrialBanner from '@/components/TrialBanner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, subscription, isCoveredByAdmin, loading, refreshSubscription } = useAuth();

  // Pages & roles that are exempt from the paywall lock screen
  const isExempt = pathname === '/billing' || pathname === '/settings' || pathname === '/super-admin' || Boolean(user?.isSuperAdmin);

  // Always refresh subscription on navigation to prevent stale cache
  useEffect(() => {
    if (user) {
      refreshSubscription();
    }
  }, [pathname, user, refreshSubscription]);

  // If user is an invited member covered by an active admin's subscription, they are NEVER blocked!
  if (isCoveredByAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%', maxWidth: '100vw' }}>
        <TrialBanner />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' }}>
          {children}
        </div>
      </div>
    );
  }

  const isExpired = Boolean(
    subscription && (
      subscription.status === 'expired' ||
      (subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) < new Date() && subscription.status !== 'active') ||
      (subscription.status === 'trialing' && (subscription.daysRemaining ?? 0) <= 0)
    )
  );

  // If user is logged in but subscription status is still fetching, show loading state on protected pages
  if (loading || (user && !subscription && !isExempt)) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', width: '100%', background: 'var(--bg-base)' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>
            Verifying workspace access…
          </div>
        </div>
      </div>
    );
  }

  // Option A: Hard Paywall (Lock Screen) for expired subscriptions
  if (user && !isExempt && isExpired) {
    return <TrialExpiredPaywall />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%', maxWidth: '100vw' }}>
      <TrialBanner />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' }}>
        {children}
      </div>
    </div>
  );
}
