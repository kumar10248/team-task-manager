'use client';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, AlertTriangle, ArrowRight, Clock, CreditCard } from 'lucide-react';

export default function TrialBanner() {
  const { user, subscription, isCoveredByAdmin, ownedProjectsCount } = useAuth();
  const pathname = usePathname();

  // Do not show banner if:
  // 1. User not logged in
  // 2. User is Super Admin (root VIP access)
  // 3. User does not own any projects or is covered by a workspace admin (invited team member)
  // 4. Subscription is not in trialing status
  if (!user || user.isSuperAdmin || !subscription || isCoveredByAdmin || ownedProjectsCount === 0) {
    return null;
  }

  if (subscription.status !== 'trialing') {
    return null;
  }

  const daysRemaining = subscription.daysRemaining !== undefined
    ? Math.max(0, subscription.daysRemaining)
    : (subscription.currentPeriodEnd
        ? Math.max(0, Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 14);

  const endDate = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const formattedEndDate = endDate
    ? endDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'soon';

  const isUrgent = daysRemaining <= 3;
  const isOnBillingPage = pathname === '/billing';

  return (
    <aside
      aria-label="Subscription Trial Status"
      style={{
        width: '100%',
        background: isUrgent
          ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.16) 0%, rgba(220, 38, 38, 0.1) 50%, rgba(239, 68, 68, 0.16) 100%)'
          : 'linear-gradient(90deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.08) 50%, rgba(245, 158, 11, 0.14) 100%)',
        borderBottom: isUrgent ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(245, 158, 11, 0.3)',
        padding: '10px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 60,
        backdropFilter: 'blur(16px)',
        boxShadow: isUrgent ? '0 2px 20px rgba(239, 68, 68, 0.15)' : '0 2px 16px rgba(245, 158, 11, 0.1)',
      }}
    >
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        {/* Left: Highlighted Trial Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Badge */}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontFamily: 'Outfit, sans-serif',
            background: isUrgent ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)',
            color: isUrgent ? '#fca5a5' : '#fde047',
            border: isUrgent ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(245, 158, 11, 0.5)',
            boxShadow: isUrgent ? '0 0 10px rgba(239, 68, 68, 0.3)' : '0 0 10px rgba(245, 158, 11, 0.25)',
          }}>
            {isUrgent ? <AlertTriangle size={12} /> : <Sparkles size={12} />}
            {isUrgent ? 'Trial Ending Soon' : 'Free Trial Active'}
          </span>

          {/* Detailed highlighted text */}
          <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', lineHeight: 1.4 }}>
            <span>You are currently using the <strong>14-Day Free Trial</strong>. Your trial ends in </span>
            <span style={{
              fontWeight: 700,
              color: isUrgent ? '#ef4444' : '#fbbf24',
              background: isUrgent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)',
              padding: '2px 8px',
              borderRadius: 6,
              border: isUrgent ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(251, 191, 36, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <Clock size={12} />
              {daysRemaining === 0 ? 'today!' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
            </span>
            <span> on </span>
            <strong style={{
              color: 'var(--text-primary)',
              textDecoration: 'underline',
              textDecorationColor: isUrgent ? '#ef4444' : '#fbbf24',
              textUnderlineOffset: 3,
            }}>
              {formattedEndDate}
            </strong>.
            <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
              {isUrgent
                ? 'Upgrade today to prevent workspace lockout.'
                : 'Subscribe to lock in full workspace access and features.'}
            </span>
          </div>
        </div>

        {/* Right: Action Button to Pay */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            href="/billing"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'Outfit, sans-serif',
              textDecoration: 'none',
              color: '#fff',
              background: isUrgent
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              boxShadow: isUrgent
                ? '0 0 15px rgba(239, 68, 68, 0.4)'
                : '0 0 15px var(--accent-glow)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = isUrgent
                ? '0 4px 20px rgba(239, 68, 68, 0.6)'
                : '0 4px 20px var(--accent-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = isUrgent
                ? '0 0 15px rgba(239, 68, 68, 0.4)'
                : '0 0 15px var(--accent-glow)';
            }}
          >
            <CreditCard size={14} />
            <span>{isOnBillingPage ? 'Choose Your Plan' : 'Pay for Subscription'}</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
