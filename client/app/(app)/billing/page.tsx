'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { subscriptionApi, Subscription, RazorpayOptions, RazorpayResponse } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import { triggerConfetti } from '@/lib/confetti';
import {
  CreditCard, Check, Sparkles, Zap, ShieldCheck,
  Calendar, ArrowRight, RefreshCw, HelpCircle, FileText, Lock
} from 'lucide-react';

// Load Razorpay Checkout SDK Script
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);

    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      if (window.Razorpay) return resolve(true);
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BillingPage() {
  const { user, loading: authLoading, setSubscription: setGlobalSubscription, refreshSubscription, isCoveredByAdmin, coveringAdminName } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [subscribingPlan, setSubscribingPlan] = useState<'standard' | 'pro' | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [canceling, setCanceling] = useState(false);

  const syncSubscription = useCallback((sub: Subscription | null) => {
    setSubscription(sub);
    setGlobalSubscription(sub);
  }, [setGlobalSubscription]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  // Pre-load Razorpay checkout SDK
  useEffect(() => {
    loadRazorpayScript().catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) return;

    subscriptionApi.get()
      .then((res) => {
        if (active && res.success) {
          syncSubscription(res.subscription);
          setIsConfigured(res.isConfigured);
          setRazorpayKeyId(res.razorpayKeyId || '');
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load subscription:', err);
          toast('Failed to load subscription details', 'error');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, toast, syncSubscription]);

  const handleSubscribe = async (planKey: 'standard' | 'pro') => {
    setSubscribingPlan(planKey);
    try {
      // 1. Ensure Razorpay SDK script is loaded
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) {
        toast('Razorpay checkout SDK failed to load. Please disable ad blockers and refresh.', 'error');
        setSubscribingPlan(null);
        return;
      }

      // 2. Create Razorpay order on backend
      const orderRes = await subscriptionApi.createOrder(planKey);
      if (!orderRes.success || !orderRes.orderId) {
        throw new Error(orderRes.message || 'Could not initiate payment order with Razorpay');
      }

      // 3. Configure Razorpay modal options
      const options: RazorpayOptions = {
        key: orderRes.razorpayKeyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_U0Y6TMtnaOxcqC',
        amount: orderRes.amountInPaise,
        currency: orderRes.currency || 'INR',
        name: 'TaskForge CRM',
        description: `${orderRes.plan.name} - ₹${orderRes.amount.toLocaleString('en-IN')}/month`,
        order_id: (orderRes as any).order_id || orderRes.orderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: {
          color: '#818cf8',
        },
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay using UPI (QR / UPI ID)',
                instruments: [
                  {
                    method: 'upi',
                    flows: ['collect', 'qr', 'intent'],
                  },
                ],
              },
            },
            sequence: ['block.upi', 'card', 'netbanking', 'wallet'],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
        handler: async (response: RazorpayResponse) => {
          try {
            const verifyRes = await subscriptionApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: planKey,
            });
            if (verifyRes.success) {
              toast(verifyRes.message || '🎉 Subscription activated successfully!', 'success');
              triggerConfetti();
              syncSubscription(verifyRes.subscription);
              await refreshSubscription();
            } else {
              toast('Payment signature verification failed on server.', 'error');
            }
          } catch (vErr) {
            console.error('Verification error:', vErr);
            toast('Payment verification failed. Please contact support.', 'error');
          } finally {
            setSubscribingPlan(null);
          }
        },
        modal: {
          ondismiss: () => {
            setSubscribingPlan(null);
          },
        },
      };

      // 4. Open Razorpay Checkout modal
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (failData: unknown) => {
        console.error('Payment failed:', failData);
        toast('Payment was cancelled or unsuccessful', 'error');
        setSubscribingPlan(null);
      });
      rzp.open();
    } catch (err) {
      console.error('Subscription error:', err);
      toast(err instanceof Error ? err.message : 'Checkout initiation failed', 'error');
      setSubscribingPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel automatic subscription renewal? You will keep access until your current billing period ends.')) {
      return;
    }
    setCanceling(true);
    try {
      const res = await subscriptionApi.cancel();
      if (res.success) {
        toast(res.message, 'success');
        syncSubscription(res.subscription);
        await refreshSubscription();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to cancel subscription', 'error');
    } finally {
      setCanceling(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)' }}>Active</span>;
      case 'trialing':
        return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)' }}>Free Trial</span>;
      case 'expired':
        return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)' }}>Expired</span>;
      default:
        return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)' }}>Inactive</span>;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', flex: 1, background: 'var(--bg-base)' }}>
      <Sidebar />

      <main style={{ flex: 1, minWidth: 0, width: '100%', padding: '40px 48px', overflowY: 'auto' }}>
        {/* Page Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px var(--accent-glow)' }}>
              <CreditCard size={18} color="#fff" />
            </div>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              Subscription & Plans
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'Outfit, sans-serif', margin: 0 }}>
            Manage your TaskForge CRM subscription, automated monthly payments via Razorpay (UPI, Cards, Netbanking), and billing history.
          </p>
        </div>

        {/* Razorpay Setup Warning Banner if unconfigured */}
        {!isConfigured && !loading && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <Sparkles size={18} color="#f87171" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>
              <strong style={{ color: '#f87171' }}>Razorpay API Keys Needed:</strong> Set your <code style={{ color: '#c084fc', background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: 4 }}>RAZORPAY_KEY_ID</code> and <code style={{ color: '#c084fc', background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: 4 }}>RAZORPAY_KEY_SECRET</code> in <code style={{ color: '#c084fc', background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: 4 }}>server/.env</code> to enable live Razorpay Checkout modal with UPI, Cards, and Netbanking.
            </div>
          </div>
        )}

        {/* Razorpay Sandbox Test Mode Guide */}
        {isConfigured && razorpayKeyId?.startsWith('rzp_test_') && (
          <div style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: 14,
            padding: '16px 20px',
            marginBottom: 28,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(129, 140, 248, 0.25)', color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                🧪 Razorpay Test Mode Sandbox Active
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Test Key: <code style={{ color: '#a5b4fc', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>{razorpayKeyId}</code>
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'Outfit, sans-serif' }}>
              <p style={{ margin: '0 0 6px 0' }}>
                <strong style={{ color: '#e0e7ff' }}>Why scanning the QR code says &quot;Receiver UPI is invalid or inactive&quot;:</strong> Because this is Razorpay Test Mode. Real banking apps (PhonePe, Google Pay, Paytm) verify accounts against NPCI; since test accounts do not hold real bank funds, NPCI automatically marks the sandbox QR code as inactive.
              </p>
              <p style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                How to test simulated payments in Test Mode:
              </p>
              <ul style={{ margin: '0 0 8px 18px', padding: 0 }}>
                <li><strong>Cards (Fastest &amp; Recommended):</strong> Click <em>Cards</em> in the checkout modal &rarr; Enter card <code style={{ color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 4 }}>4012 0000 0000 0002</code>, any future expiry (e.g., 12/28), CVV <code style={{ color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 4 }}>123</code> &rarr; Click <em>Success</em> on Razorpay&apos;s simulation screen.</li>
                <li><strong>Netbanking:</strong> Click <em>Netbanking</em> &rarr; Select any bank &rarr; Click <em>Success</em>.</li>
                <li><strong>UPI Simulation:</strong> Under UPI, enter test VPA <code style={{ color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 4 }}>success@razorpay</code> to test an instant success response.</li>
              </ul>
              <div style={{ fontSize: 12, color: '#34d399', display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                <span>✨ <strong>Want real PhonePe/GPay QR code scanning?</strong> Switch to <strong>Live Mode keys</strong> (<code style={{ color: '#6ee7b7' }}>rzp_live_...</code>) from your Razorpay Dashboard. Live QR codes work with all real banking apps.</span>
              </div>
            </div>
          </div>
        )}

        {/* Team Member Covered Banner */}
        {isCoveredByAdmin && (
          <div style={{
            background: 'rgba(74, 222, 128, 0.08)',
            border: '1px solid rgba(74, 222, 128, 0.25)',
            borderRadius: 14,
            padding: '18px 24px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <ShieldCheck size={28} color="#4ade80" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 15, marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>
                Team Member Access — Covered by {coveringAdminName || 'Workspace Admin'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, fontFamily: 'Outfit, sans-serif' }}>
                You are an invited team member. Your workspace access, task management, checklists, and video meeting privileges are fully covered by your workspace admin. You do not need to purchase a personal subscription.
              </div>
            </div>
          </div>
        )}

        {/* Trial Expired Alert Banner */}
        {subscription?.status === 'expired' && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 14,
            padding: '16px 20px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}>
            <Lock size={20} color="#f87171" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>
              <strong style={{ color: '#f87171' }}>Free Trial Has Ended:</strong> Workspace access is currently locked under Option A. Select a plan below (Standard ₹2,000/mo or Pro ₹3,000/mo) to unlock your workspace.
            </div>
          </div>
        )}

        {/* Current Subscription Status Card */}
        {subscription && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--bg-border)',
            backdropFilter: 'blur(16px)',
            borderRadius: 16,
            padding: '24px 28px',
            marginBottom: 36,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  {user?.avatar && (
                    <img src={user.avatar} alt={user.name} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                    Current Subscription {user?.name ? `(${user.name})` : ''}
                  </span>
                  {getStatusBadge(subscription.status)}
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {subscription.plan === 'pro' ? 'Pro Plan' : (subscription.plan === 'standard' ? 'Standard Plan' : 'Free Trial')}
                  {subscription.amount > 0 && (
                    <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-secondary)' }}>
                      • ₹{subscription.amount.toLocaleString('en-IN')} / month
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                {subscription.currentPeriodEnd && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                      {subscription.status === 'trialing' ? 'Trial Ends' : (subscription.cancelAtPeriodEnd ? 'Access Expires' : 'Renews On')}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <Calendar size={13} color="var(--accent-primary)" />
                      {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span style={{ fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600 }}>
                        ({subscription.daysRemaining} days left)
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && (
                    <button
                      type="button"
                      onClick={handleCancelSubscription}
                      disabled={canceling}
                      style={{
                        background: 'none',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12,
                        fontFamily: 'Outfit, sans-serif',
                        color: 'var(--text-muted)',
                        cursor: canceling ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'; }}
                    >
                      {canceling ? 'Cancelling…' : 'Cancel Renewal'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Tier Grid (Standard 2k / Pro 3k) */}
        <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 20 }}>
          Select Your Monthly Plan
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 48 }}>
          {/* Standard Plan: 2k/month */}
          <div style={{
            background: 'var(--bg-surface)',
            backdropFilter: 'blur(20px)',
            border: subscription?.plan === 'standard' && subscription?.status === 'active'
              ? '2px solid var(--accent-primary)'
              : '1px solid var(--bg-border)',
            borderRadius: 20,
            padding: '32px 28px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: subscription?.plan === 'standard' && subscription?.status === 'active'
              ? '0 0 30px var(--accent-glow)'
              : '0 8px 32px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-primary)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                Standard Tier
              </span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'rgba(129, 140, 248, 0.12)', color: 'var(--accent-primary)', border: '1px solid rgba(129, 140, 248, 0.25)', fontWeight: 500 }}>
                Most Popular
              </span>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                  ₹2,000
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>
                  / month
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginTop: 6 }}>
                Ideal for growing teams needing full project tracking, subtasks, custom taglines & video meetings.
              </p>
            </div>

            {/* Features */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 20, marginBottom: 28, flex: 1 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 14, fontWeight: 500 }}>
                Everything included:
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Up to 15 Active Projects',
                  'Up to 25 Team Members',
                  'Kanban Board with Drag & Drop',
                  'Interactive Subtask Checklists',
                  'Project-Specific Custom Taglines (with DB deletion)',
                  'Schedule Video Meetings with Jitsi sync',
                  'Attendance & Shift Clock-In/Clock-Out logs',
                  'Export Tasks & Reports to CSV',
                  'Standard Email Support',
                ].map((feat, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(129, 140, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Check size={11} color="var(--accent-primary)" />
                    </div>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Subscribe Button */}
            <button
              type="button"
              onClick={() => handleSubscribe('standard')}
              disabled={subscribingPlan !== null || (subscription?.plan === 'standard' && subscription?.status === 'active')}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: 10,
                border: 'none',
                background: subscription?.plan === 'standard' && subscription?.status === 'active'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                color: subscription?.plan === 'standard' && subscription?.status === 'active'
                  ? 'var(--text-muted)'
                  : '#fff',
                fontWeight: 600,
                fontSize: 14,
                fontFamily: 'Outfit, sans-serif',
                cursor: (subscribingPlan !== null || (subscription?.plan === 'standard' && subscription?.status === 'active')) ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: subscription?.plan === 'standard' && subscription?.status === 'active' ? 'none' : '0 4px 20px rgba(129, 140, 248, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              {subscribingPlan === 'standard' ? (
                <>
                  <RefreshCw size={15} className="animate-spin" /> Processing…
                </>
              ) : subscription?.plan === 'standard' && subscription?.status === 'active' ? (
                'Current Plan'
              ) : (
                <>
                  Subscribe for ₹2,000/mo <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>

          {/* Pro Plan: 3k/month */}
          <div style={{
            background: 'var(--bg-surface)',
            backdropFilter: 'blur(20px)',
            border: subscription?.plan === 'pro' && subscription?.status === 'active'
              ? '2px solid #c084fc'
              : '1px solid rgba(192, 132, 252, 0.3)',
            borderRadius: 20,
            padding: '32px 28px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: subscription?.plan === 'pro' && subscription?.status === 'active'
              ? '0 0 35px rgba(192, 132, 252, 0.4)'
              : '0 8px 32px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c084fc', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                Pro / Enterprise
              </span>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.2), rgba(192, 132, 252, 0.2))', color: '#e879f9', border: '1px solid rgba(192, 132, 252, 0.4)', fontWeight: 600 }}>
                ★ Best Value
              </span>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 38, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                  ₹3,000
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>
                  / month
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginTop: 6 }}>
                For high-velocity organizations requiring unlimited capacity, multi-member task assignment, and VIP support.
              </p>
            </div>

            {/* Features */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 20, marginBottom: 28, flex: 1 }}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#c084fc', marginBottom: 14, fontWeight: 500 }}>
                Everything in Standard, plus:
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Unlimited Active Projects (No limits)',
                  'Unlimited Team Members & Collaborators',
                  'Multi-Member Task Assignment & Co-owners',
                  'Advanced Clock-In/Clock-Out & 14-Hour Cap Automation',
                  'Meeting Agendas & Custom Jitsi Room Links',
                  'Subtask Progress Tracking & Instant Analytics',
                  'CSV Data Export with Assignee Breakdown',
                  'Priority 24/7 VIP Customer Support',
                  'Early Access to Upcoming Features & API integrations',
                ].map((feat, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(192, 132, 252, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Check size={11} color="#c084fc" />
                    </div>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Subscribe Button */}
            <button
              type="button"
              onClick={() => handleSubscribe('pro')}
              disabled={subscribingPlan !== null || (subscription?.plan === 'pro' && subscription?.status === 'active')}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: 10,
                border: 'none',
                background: subscription?.plan === 'pro' && subscription?.status === 'active'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'linear-gradient(135deg, #818cf8, #c084fc)',
                color: subscription?.plan === 'pro' && subscription?.status === 'active'
                  ? 'var(--text-muted)'
                  : '#fff',
                fontWeight: 600,
                fontSize: 14,
                fontFamily: 'Outfit, sans-serif',
                cursor: (subscribingPlan !== null || (subscription?.plan === 'pro' && subscription?.status === 'active')) ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: subscription?.plan === 'pro' && subscription?.status === 'active' ? 'none' : '0 4px 25px rgba(192, 132, 252, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              {subscribingPlan === 'pro' ? (
                <>
                  <RefreshCw size={15} className="animate-spin" /> Processing…
                </>
              ) : subscription?.plan === 'pro' && subscription?.status === 'active' ? (
                'Current Plan'
              ) : (
                <>
                  Subscribe for ₹3,000/mo <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Payment History Table */}
        {subscription && subscription.history && subscription.history.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--bg-border)',
            borderRadius: 16,
            padding: '24px 28px',
            marginBottom: 40,
          }}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={16} color="var(--accent-primary)" /> Payment History & Receipts
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 14px' }}>Date</th>
                    <th style={{ padding: '10px 14px' }}>Plan</th>
                    <th style={{ padding: '10px 14px' }}>Amount</th>
                    <th style={{ padding: '10px 14px' }}>Payment Gateway</th>
                    <th style={{ padding: '10px 14px' }}>Payment Method</th>
                    <th style={{ padding: '10px 14px' }}>Transaction ID</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subscription.history.map((tx, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                      <td style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>
                        {new Date(tx.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {tx.plan}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        ₹{tx.amount.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: tx.gateway === 'Admin Panel' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: tx.gateway === 'Admin Panel' ? '#fde047' : '#93c5fd',
                          border: `1px solid ${tx.gateway === 'Admin Panel' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                          fontWeight: 600,
                          letterSpacing: '0.02em',
                        }}>
                          {tx.gateway || 'Razorpay'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(192, 132, 252, 0.12)', color: '#d8b4fe', border: '1px solid rgba(192, 132, 252, 0.25)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          {tx.paymentMethod || tx.method || 'UPI'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                        {tx.paymentId || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', fontWeight: 600, border: '1px solid rgba(74, 222, 128, 0.3)' }}>
                          Paid
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Security & FAQ Footer */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: 16,
          padding: '24px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>
              <ShieldCheck size={16} color="#4ade80" /> 100% Bank-Grade Security
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, fontFamily: 'Outfit, sans-serif', margin: 0 }}>
              All transactions are encrypted and processed by Razorpay, an RBI-regulated Payment Aggregator. Your card & bank details are never stored on our servers.
            </p>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>
              <Zap size={16} color="var(--accent-primary)" /> Instant Plan Activation
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, fontFamily: 'Outfit, sans-serif', margin: 0 }}>
              Once your UPI, Card, or Netbanking payment completes, your account limits and features are instantly unlocked across all team workspaces.
            </p>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>
              <HelpCircle size={16} color="var(--accent-secondary)" /> Flexible Renewal & Support
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, fontFamily: 'Outfit, sans-serif', margin: 0 }}>
              Cancel renewal anytime with 1 click. You retain full access to all your projects and data until the end of your prepaid monthly cycle.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
