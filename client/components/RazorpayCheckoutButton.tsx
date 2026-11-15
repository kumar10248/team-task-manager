'use client';
import React, { useState } from 'react';
import { razorpayApi, RazorpayOptions, RazorpayResponse } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { CreditCard, Loader2 } from 'lucide-react';

/**
 * Loads Razorpay Standard Web Checkout script dynamically if not present
 */
export function loadRazorpayScript(): Promise<boolean> {
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

export interface RazorpayCheckoutButtonProps {
  amount: number; // in paise, minimum 100 paise (₹1)
  currency?: string;
  name?: string;
  description?: string;
  plan?: 'standard' | 'pro' | string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  buttonText?: string;
  className?: string;
  style?: React.CSSProperties;
  onSuccess?: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onError?: (err: Error | string) => void;
  onCancel?: () => void;
  children?: React.ReactNode;
}

export default function RazorpayCheckoutButton({
  amount,
  currency = 'INR',
  name = 'TaskForge CRM',
  description,
  plan,
  prefill,
  buttonText,
  className = 'btn-primary',
  style,
  onSuccess,
  onError,
  onCancel,
  children,
}: RazorpayCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleCheckout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Step 1: Ensure Razorpay Checkout SDK Script is loaded
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !window.Razorpay) {
        const errorMsg = 'Razorpay checkout script failed to load. Please check your internet connection and disable ad blockers.';
        toast(errorMsg, 'error');
        onError?.(new Error(errorMsg));
        setLoading(false);
        return;
      }

      // Step 2: Call backend endpoint to create order (POST /api/create-order)
      const orderRes = await razorpayApi.createOrder({
        amount,
        currency,
        plan,
        notes: plan ? { plan } : undefined,
      });

      if (!orderRes.success || !orderRes.order_id) {
        throw new Error(orderRes.message || 'Failed to create payment order with Razorpay');
      }

      const keyId =
        orderRes.key_id ||
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
        'rzp_test_U0Y6TMtnaOxcqC';

      // Step 3: Configure Razorpay Standard Checkout modal options
      const options: RazorpayOptions = {
        key: keyId,
        amount: orderRes.amount,
        currency: orderRes.currency || currency,
        name,
        description: description || (plan ? `${plan.toUpperCase()} Plan Subscription` : 'Payment'),
        order_id: orderRes.order_id,
        prefill: {
          name: prefill?.name || '',
          email: prefill?.email || '',
          contact: prefill?.contact || '',
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
            // Step 4: On success, send razorpay_payment_id, razorpay_order_id, razorpay_signature to verify endpoint
            const verifyRes = await razorpayApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan,
            });

            if (verifyRes.success && verifyRes.isPaid) {
              toast(verifyRes.message || 'Payment verified successfully!', 'success');
              onSuccess?.(response);
            } else {
              const errMsg = verifyRes.message || 'Payment signature verification failed on server.';
              toast(errMsg, 'error');
              onError?.(new Error(errMsg));
            }
          } catch (vErr) {
            console.error('Payment signature verification error:', vErr);
            const errMsg = vErr instanceof Error ? vErr.message : 'Payment verification failed.';
            toast(errMsg, 'error');
            onError?.(new Error(errMsg));
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            // Handle modal dismiss (user cancelled)
            setLoading(false);
            onCancel?.();
          },
        },
      };

      const rzp = new window.Razorpay(options);

      // Handle payment.failed event
      rzp.on('payment.failed', (failData: { error?: { description?: string } }) => {
        console.error('Razorpay payment failed:', failData);
        const errMsg = failData?.error?.description || 'Payment was unsuccessful or cancelled';
        toast(errMsg, 'error');
        onError?.(new Error(errMsg));
        setLoading(false);
      });

      // Open checkout modal
      rzp.open();
    } catch (err) {
      console.error('Checkout error:', err);
      const errMsg = err instanceof Error ? err.message : 'Could not initiate checkout';
      toast(errMsg, 'error');
      onError?.(new Error(errMsg));
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.75 : 1,
        ...style,
      }}
      onClick={handleCheckout}
      disabled={loading}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          <span>Processing…</span>
        </>
      ) : (
        children || (
          <>
            <CreditCard size={16} />
            <span>{buttonText || 'Pay with Razorpay'}</span>
          </>
        )
      )}
    </button>
  );
}
