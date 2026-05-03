'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import { Zap, Eye, EyeOff } from 'lucide-react';

interface SignupForm { name: string; email: string; password: string }

interface FieldConfig { key: keyof SignupForm; label: string; type: string; placeholder: string }

const fields: FieldConfig[] = [
  { key: 'name',  label: 'Full Name', type: 'text',  placeholder: 'Jane Smith' },
  { key: 'email', label: 'Email',     type: 'email', placeholder: 'you@company.com' },
];

export default function SignupPage() {
  const { signup }   = useAuth();
  const toast        = useToast();
  const router       = useRouter();
  const [form, setForm]         = useState<SignupForm>({ name: '', email: '', password: '' });
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }
    setLoading(true);
    try {
      await signup(form.name, form.email, form.password);
      router.push('/dashboard');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Signup failed', 'error');
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
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:32, fontWeight:600, color:'var(--text-primary)', marginBottom:6 }}>Create account</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:13, fontFamily:'DM Mono, monospace' }}>Join TaskForge today</p>
        </div>

        <div className="card" style={{ padding:32 }}>
          <form onSubmit={submit}>
            {fields.map(({ key, label, type, placeholder }) => (
              <div key={key} style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:11, fontFamily:'DM Mono, monospace', letterSpacing:'0.08em', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
                  {label}
                </label>
                <input
                  type={type} required
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}

            <div style={{ marginBottom:28 }}>
              <label style={{ display:'block', fontSize:11, fontFamily:'DM Mono, monospace', letterSpacing:'0.08em', color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} required
                  placeholder="Min. 6 characters"
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
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'var(--text-muted)', fontFamily:'DM Mono, monospace' }}>
            Already have one?{' '}
            <Link href="/login" style={{ color:'var(--amber)', textDecoration:'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}