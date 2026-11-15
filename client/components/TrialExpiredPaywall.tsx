'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { subscriptionApi, RazorpayOptions, RazorpayResponse } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import { triggerConfetti } from '@/lib/confetti';
import {
  Lock, ShieldCheck, Check, ArrowRight, RefreshCw, CreditCard
} from 'lucide-react';

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

export default function TrialExpiredPaywall() {
  const { user, refreshSubscription } = useAuth();
  const toast = useToast();
  const [subscribingPlan, setSubscribingPlan] = useState<'standard' | 'pro' | null>(null);

  const handleSubscribe = async (planKey: 'standard' | 'pro') => {
    setSubscribingPlan(planKey);
    try {
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) {
        toast('Razorpay checkout SDK failed to load. Please check your internet connection.', 'error');
        setSubscribingPlan(null);
        return;
      }

      const orderRes = await subscriptionApi.createOrder(planKey);
      if (!orderRes.success || !orderRes.orderId) {
        throw new Error(orderRes.message || 'Could not initiate payment order with Razorpay');
      }

      const options: RazorpayOptions = {
        key: orderRes.razorpayKeyId,
        amount: orderRes.amountInPaise,
        currency: orderRes.currency || 'INR',
        name: 'TaskForge CRM',
        description: `${orderRes.plan.name} - ₹${orderRes.amount.toLocaleString('en-IN')}/month`,
        order_id: orderRes.orderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: {
          color: '#818cf8',
        },
        config: {
          display: {
            sequence: ['upi', 'card', 'netbanking', 'wallet'],
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
              toast(verifyRes.message || '🎉 Subscription activated! Welcome back.', 'success');
              triggerConfetti();
              await refreshSubscription();
            } else {
              toast('Payment signature verification failed.', 'error');
            }
          } catch (vErr) {
            console.error('Verification error:', vErr);
            toast('Payment verification failed on server.', 'error');
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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />

      <main style={{
        flex: 1,
        padding: '48px 40px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {/* Background glow ambiance */}
        <div style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 500,
          height: 300,
          background: 'radial-gradient(circle, rgba(239, 68, 68, 0.12) 0%, rgba(129, 140, 248, 0.05) 50%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        <div style={{ maxWidth: 840, width: '100%', position: 'relative', zIndex: 1, textAlign: 'center' }}>
          {/* Lock Icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(248, 113, 113, 0.1))',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 40px rgba(239, 68, 68, 0.3)',
          }}>
            <Lock size={30} color="#f87171" />
          </div>

          {/* Heading */}
          <h1 style={{
            fontFamily: 'Fraunces, serif',
            fontSize: 34,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
          }}>
            Your Free Trial Has Ended
          </h1>

          <p style={{
            color: 'var(--text-secondary)',
            fontSize: 15,
            fontFamily: 'Outfit, sans-serif',
            maxWidth: 600,
            margin: '0 auto 24px',
            lineHeight: 1.6,
          }}>
            Your 14-day free trial has expired. To unlock your workspace, task boards, meetings, and team collaboration, select a subscription plan below.
          </p>

          {/* Data Protection Safe Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(74, 222, 128, 0.08)',
            border: '1px solid rgba(74, 222, 128, 0.25)',
            borderRadius: 30,
            padding: '8px 20px',
            color: '#4ade80',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'Outfit, sans-serif',
            marginBottom: 40,
          }}>
            <ShieldCheck size={16} />
            <span>All your existing projects, tasks, and data are safely saved</span>
          </div>

          {/* Pricing Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 24,
            marginBottom: 36,
            textAlign: 'left',
          }}>
            {/* Standard Tier */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-border)',
              borderRadius: 20,
              padding: '32px 28px',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-primary)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                  Standard Tier
                </span>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'rgba(129, 140, 248, 0.12)', color: 'var(--accent-primary)', border: '1px solid rgba(129, 140, 248, 0.25)' }}>
                  Most Popular
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                    ₹2,000
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>
                    / month
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginTop: 4 }}>
                  Full workspace access for growing teams with project taglines and meetings.
                </p>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 18, marginBottom: 24, flex: 1 }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    'Up to 15 Active Projects',
                    'Up to 25 Team Members',
                    'Kanban Boards & Subtasks',
                    'Custom Taglines (with DB Delete)',
                    'Schedule Video Meetings',
                    'CSV Data Export',
                  ].map((feat, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif' }}>
                      <Check size={14} color="var(--accent-primary)" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleSubscribe('standard')}
                disabled={subscribingPlan !== null}
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  fontFamily: 'Outfit, sans-serif',
                  cursor: subscribingPlan !== null ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 20px rgba(129, 140, 248, 0.4)',
                  transition: 'all 0.2s',
                }}
              >
                {subscribingPlan === 'standard' ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    Subscribe for ₹2,000/mo <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>

            {/* Pro Tier */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '2px solid #c084fc',
              borderRadius: 20,
              padding: '32px 28px',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 0 35px rgba(192, 132, 252, 0.3)',
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c084fc', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                  Pro / Enterprise
                </span>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'rgba(192, 132, 252, 0.2)', color: '#e879f9', border: '1px solid rgba(192, 132, 252, 0.4)', fontWeight: 600 }}>
                  ★ Best Value
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 36, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                    ₹3,000
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>
                    / month
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginTop: 4 }}>
                  Unlimited power, multi-member task assignment & priority support.
                </p>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 18, marginBottom: 24, flex: 1 }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    'Unlimited Active Projects',
                    'Unlimited Team Members',
                    'Multi-Member Task Assignment',
                    '14-Hour Cap Attendance Logs',
                    'Meeting Agendas & Custom Rooms',
                    'Priority 24/7 VIP Support',
                  ].map((feat, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>
                      <Check size={14} color="#c084fc" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleSubscribe('pro')}
                disabled={subscribingPlan !== null}
                style={{
                  width: '100%',
                  padding: '13px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #818cf8, #c084fc)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  fontFamily: 'Outfit, sans-serif',
                  cursor: subscribingPlan !== null ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 25px rgba(192, 132, 252, 0.4)',
                  transition: 'all 0.2s',
                }}
              >
                {subscribingPlan === 'pro' ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    Subscribe for ₹3,000/mo <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 10 }}>
            <Link
              href="/billing"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--accent-primary)',
                fontSize: 14,
                fontFamily: 'Outfit, sans-serif',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              <CreditCard size={15} /> View Full Billing & Payment Details →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
