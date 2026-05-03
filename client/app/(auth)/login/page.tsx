'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import { Zap, Eye, EyeOff } from 'lucide-react';

interface LoginForm { email: string; password: string }

export default function LoginPage() {
  const { login }    = useAuth();
  const toast        = useToast();
  const router       = useRouter();
  const [form, setForm]         = useState<LoginForm>({ email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      router.push('/dashboard');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:16, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:'30%', left:'50%', transform:'translate(-50%,-50%)', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(245,158,11,0.05) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div className="animate-slide-up" style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ width:48, height:48, background:'var(--amber)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <Zap size={24} color="#0d0d0f" fill="#0d0d0f" />
          </div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:32, fontWeight:600, color:'var(--text-primary)', marginBottom:6 }}>Welcome back</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:13, fontFamily:'DM Mono, monospace' }}>Sign in to TaskForge</p>
        </div>

        <div className="card" style={{ padding:32 }}>
          <form onSubmit={submit}>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontFamily:'DM Mono, monospace', letterSpacing:'0.08em', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
                Email
              </label>
              <input
                type="email" required autoComplete="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div style={{ marginBottom:28 }}>
              <label style={{ display:'block', fontSize:11, fontFamily:'DM Mono, monospace', letterSpacing:'0.08em', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} required autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={{ paddingRight:42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex' }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ width:'100%', justifyContent:'center' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'var(--text-muted)', fontFamily:'DM Mono, monospace' }}>
            No account?{' '}
            <Link href="/signup" style={{ color:'var(--amber)', textDecoration:'none' }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}