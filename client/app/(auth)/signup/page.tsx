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
  { key: 'email', label: 'Email Address',     type: 'email', placeholder: 'you@company.com' },
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#050505', padding:16, position:'relative', overflow:'hidden' }}>
      
      {/* Deep Space Gradient & Floating Orbs */}
      <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:'radial-gradient(circle at 50% 10%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)', zIndex: 0 }} />
      <div className="animate-orb-1" style={{ position:'absolute', top:'10%', left:'20%', width:300, height:300, borderRadius:'50%', background:'rgba(129, 140, 248, 0.15)', filter:'blur(100px)', zIndex: 0 }} />
      <div className="animate-orb-2" style={{ position:'absolute', top:'60%', right:'15%', width:400, height:400, borderRadius:'50%', background:'rgba(192, 132, 252, 0.1)', filter:'blur(120px)', zIndex: 0 }} />
      <div className="animate-orb-3" style={{ position:'absolute', bottom:'20%', left:'30%', width:250, height:250, borderRadius:'50%', background:'rgba(245, 158, 11, 0.1)', filter:'blur(80px)', zIndex: 0 }} />

      <div className="animate-slide-up" style={{ width:'100%', maxWidth:440, position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ width:56, height:56, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:'0 0 30px rgba(129, 140, 248, 0.4)' }}>
            <Zap size={28} color="#ffffff" fill="#ffffff" />
          </div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:36, fontWeight:400, color:'var(--text-primary)', marginBottom:8, letterSpacing:'-0.01em' }}>Create account</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14, fontFamily:'Outfit, sans-serif' }}>Join TaskForge today and get started</p>
        </div>

        <div className="glass-panel" style={{ padding:40, borderRadius:24, boxShadow:'0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <form onSubmit={submit}>
            {fields.map(({ key, label, type, placeholder }) => (
              <div key={key} style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:12, fontFamily:'Outfit, sans-serif', fontWeight:500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:8 }}>
                  {label}
                </label>
                <input
                  type={type} required
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  style={{ fontSize:15, padding:'14px 16px', background:'rgba(0,0,0,0.2)' }}
                />
              </div>
            ))}

            <div style={{ marginBottom:32 }}>
              <label style={{ display:'block', fontSize:12, fontFamily:'Outfit, sans-serif', fontWeight:500, letterSpacing:'0.06em', color:'var(--text-secondary)', textTransform:'uppercase', marginBottom:8 }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} required
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
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

            <button type="submit" className="btn-primary" disabled={loading} style={{ width:'100%', justifyContent:'center', padding:'14px', fontSize:15, fontWeight:500, boxShadow:'0 0 20px rgba(129, 140, 248, 0.4)' }}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div style={{ textAlign:'center', marginTop:24, fontSize:14, color:'var(--text-secondary)', fontFamily:'Outfit, sans-serif' }}>
            Already have one?{' '}
            <Link href="/login" style={{ color:'var(--accent-primary)', textDecoration:'none', fontWeight:500 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}