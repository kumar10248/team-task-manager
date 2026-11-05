'use client';
import { useState, useEffect, Suspense, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, tokenHelpers } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import { Zap, Eye, EyeOff, ArrowLeft, KeyRound, Mail, RefreshCw } from 'lucide-react';

function ForgotPasswordContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Force redirect to /dashboard if user has a valid token
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  // Resend cooldown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Request 6-digit reset code via email
  const handleRequestCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) {
      toast('Please enter your email address', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authApi.forgotPassword({ email: email.trim() });
      toast(res.message || 'Verification code sent! Please check your email.', 'success');
      setStep('reset');
      setCountdown(60);
      setCode('');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to request reset code', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Resend 6-digit code to email
  const handleResendCode = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    try {
      const res = await authApi.forgotPassword({ email: email.trim() });
      toast(res.message || 'A new verification code has been sent to your email.', 'success');
      setCountdown(60);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to resend verification code', 'error');
    } finally {
      setResending(false);
    }
  };

  // Submit reset password with verification code
  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!code.trim() || code.trim().length !== 6) {
      toast('Please enter the valid 6-digit verification code', 'error');
      return;
    }

    if (newPassword.length < 6) {
      toast('New password must be at least 6 characters', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast('Passwords do not match. Please verify and try again.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authApi.resetPassword({
        email: email.trim(),
        code: code.trim(),
        newPassword,
      });

      toast(res.message || 'Password reset successfully! You can now sign in.', 'success');
      router.push('/login');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to reset password', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  // If user is already authenticated
  if (user || (authLoading && tokenHelpers.get())) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#050505', padding:16 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:56, height:56, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:'0 0 30px rgba(129, 140, 248, 0.4)' }}>
            <Zap size={28} color="#ffffff" fill="#ffffff" />
          </div>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:24, color:'var(--text-primary)', marginBottom:8 }}>
            Redirecting to Dashboard…
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#050505', padding:16, position:'relative', overflow:'hidden' }}>
      {/* Deep Space Gradient & Floating Orbs */}
      <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:'radial-gradient(circle at 50% 10%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)', zIndex: 0 }} />
      <div className="animate-orb-1" style={{ position:'absolute', top:'15%', left:'25%', width:300, height:300, borderRadius:'50%', background:'rgba(129, 140, 248, 0.15)', filter:'blur(100px)', zIndex: 0 }} />
      <div className="animate-orb-2" style={{ position:'absolute', top:'55%', right:'20%', width:400, height:400, borderRadius:'50%', background:'rgba(192, 132, 252, 0.1)', filter:'blur(120px)', zIndex: 0 }} />

      <div className="animate-slide-up" style={{ width:'100%', maxWidth:440, position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:56, height:56, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:'0 0 30px rgba(129, 140, 248, 0.4)' }}>
            <KeyRound size={26} color="#ffffff" />
          </div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:34, fontWeight:400, color:'var(--text-primary)', marginBottom:8, letterSpacing:'-0.01em' }}>
            {step === 'request' ? 'Reset your password' : 'Create new password'}
          </h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14, fontFamily:'Outfit, sans-serif' }}>
            {step === 'request'
              ? 'Enter your account email to receive a password reset code'
              : 'Enter the 6-digit code sent to your email and set a new password'}
          </p>
        </div>

        <div className="glass-panel" style={{ padding:40, borderRadius:24, boxShadow:'0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          {step === 'request' ? (
            <form onSubmit={handleRequestCode}>
              <div style={{ marginBottom:28 }}>
                <label style={{ display:'block', fontSize:12, fontFamily:'Outfit, sans-serif', fontWeight:500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:8 }}>
                  Registered Email Address
                </label>
                <div style={{ position:'relative' }}>
                  <input
                    type="email" required autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ fontSize:15, padding:'14px 16px', background:'rgba(0,0,0,0.2)' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ width:'100%', justifyContent:'center', padding:'14px', fontSize:15, fontWeight:500, boxShadow:'0 0 20px rgba(129, 140, 248, 0.4)' }}
              >
                {submitting ? 'Sending Code…' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              {/* Notification Banner about Email Sent */}
              <div style={{ background:'rgba(99, 102, 241, 0.1)', border:'1px solid rgba(99, 102, 241, 0.25)', borderRadius:12, padding:'14px 16px', marginBottom:24, display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(99, 102, 241, 0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                  <Mail size={14} color="#818cf8" />
                </div>
                <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.5, fontFamily:'Outfit, sans-serif' }}>
                  A verification code was sent to <strong style={{ color:'var(--text-primary)' }}>{email}</strong>. Check your inbox and spam folder.
                </div>
              </div>

              {/* 6-Digit Code */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <label style={{ display:'block', fontSize:12, fontFamily:'Outfit, sans-serif', fontWeight:500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase' }}>
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={() => setStep('request')}
                    style={{ background:'none', border:'none', color:'var(--accent-primary)', fontSize:12, cursor:'pointer', fontFamily:'Outfit, sans-serif', padding:0 }}
                  >
                    Change email
                  </button>
                </div>
                <input
                  type="text" required maxLength={6} inputMode="numeric" autoComplete="one-time-code"
                  placeholder="• • • • • •"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  style={{ fontSize:20, letterSpacing:'0.25em', textAlign:'center', padding:'14px 16px', background:'rgba(0,0,0,0.2)', fontWeight:600 }}
                />

                {/* Resend Code Link */}
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={countdown > 0 || resending}
                    style={{
                      background:'none',
                      border:'none',
                      color: countdown > 0 ? 'var(--text-muted)' : 'var(--accent-primary)',
                      fontSize:12,
                      cursor: countdown > 0 ? 'default' : 'pointer',
                      fontFamily:'Outfit, sans-serif',
                      padding:0,
                      display:'inline-flex',
                      alignItems:'center',
                      gap:4,
                    }}
                  >
                    <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
                    {countdown > 0 ? `Resend code in ${countdown}s` : resending ? 'Resending…' : 'Resend code'}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:12, fontFamily:'Outfit, sans-serif', fontWeight:500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:8 }}>
                  New Password
                </label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'} required autoComplete="new-password"
                    placeholder="Min. 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ paddingRight:48, fontSize:15, padding:'14px 16px', background:'rgba(0,0,0,0.2)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex' }}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div style={{ marginBottom:32 }}>
                <label style={{ display:'block', fontSize:12, fontFamily:'Outfit, sans-serif', fontWeight:500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:8 }}>
                  Confirm New Password
                </label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'} required autoComplete="new-password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{
                      paddingRight:48,
                      fontSize:15,
                      padding:'14px 16px',
                      background:'rgba(0,0,0,0.2)',
                      borderColor: isMismatch ? '#ef4444' : undefined,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex' }}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {isMismatch && (
                  <p style={{ color:'#ef4444', fontSize:12, marginTop:6, fontFamily:'Outfit, sans-serif' }}>
                    Passwords do not match
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ width:'100%', justifyContent:'center', padding:'14px', fontSize:15, fontWeight:500, boxShadow:'0 0 20px rgba(129, 140, 248, 0.4)' }}
              >
                {submitting ? 'Resetting Password…' : 'Reset Password'}
              </button>
            </form>
          )}

          <div style={{ textAlign:'center', marginTop:24, fontSize:14, color:'var(--text-secondary)', fontFamily:'Outfit, sans-serif' }}>
            <Link href="/login" style={{ color:'var(--text-secondary)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6, transition:'color 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              <ArrowLeft size={16} /> Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#050505' }}>
        <div style={{ width:40, height:40, border:'3px solid rgba(129, 140, 248, 0.2)', borderTopColor:'var(--accent-primary)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  );
}
