'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { Zap, CheckCircle2, Users, BarChart3, ArrowRight, Layers, Shield, Clock, LucideIcon } from 'lucide-react';

interface Feature { icon: LucideIcon; title: string; desc: string }

const features: Feature[] = [
  { icon: Layers,       title: 'Kanban Boards',    desc: 'Visual task boards with To Do, In Progress, and Done columns. Drag-and-drop clarity at a glance.' },
  { icon: Users,        title: 'Team Roles',       desc: 'Admins manage everything. Members update their own tasks. Role-based access keeps projects clean.' },
  { icon: BarChart3,    title: 'Live Dashboard',   desc: 'Real-time stats on task completion, overdue items, and workload per team member.' },
  { icon: Shield,       title: 'Secure Auth',      desc: 'JWT-based authentication with encrypted passwords. Your data stays yours.' },
  { icon: Clock,        title: 'Due Date Tracking',desc: 'Never miss a deadline. Overdue tasks are surfaced automatically across all views.' },
  { icon: CheckCircle2, title: 'Priority Levels',  desc: 'Low, medium, high, or urgent — color-coded priorities so teams always know what matters most.' },
];

const stats: Array<{ value: string; label: string }> = [
  { value: '3', label: 'Task Statuses' },
  { value: '4', label: 'Priority Levels' },
  { value: '2', label: 'Role Types' },
  { value: '∞', label: 'Projects' },
];

const steps = [
  { step: '01', title: 'Create a project', desc: 'You become the Admin. Set a name, color, and description.' },
  { step: '02', title: 'Invite your team', desc: 'Add members by email. Assign Admin or Member roles.' },
  { step: '03', title: 'Ship tasks',       desc: 'Create tasks, set priorities, assign people, track progress.' },
];

export default function HomePage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ minHeight:'100vh', position: 'relative', overflowX:'hidden' }}>

      {/* ── Dynamic Background Orbs ── */}
      <div style={{ position:'absolute', top:'10%', left:'15%', width:'40vw', height:'40vw', background:'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', filter:'blur(60px)', opacity:0.6, zIndex:-1, pointerEvents:'none', animation:'float 8s ease-in-out infinite' }} />
      <div style={{ position:'absolute', top:'40%', right:'5%', width:'35vw', height:'35vw', background:'radial-gradient(circle, rgba(192, 132, 252, 0.2) 0%, transparent 70%)', filter:'blur(60px)', opacity:0.5, zIndex:-1, pointerEvents:'none', animation:'float 10s ease-in-out infinite reverse' }} />

      {/* ── Navbar ── */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:100,
        padding:'0 48px', height:70, display:'flex', alignItems:'center', justifyContent:'space-between',
        background: scrolled ? 'var(--bg-surface)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--bg-border)' : '1px solid transparent',
        transition:'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 15px var(--accent-glow)' }}>
            <Zap size={16} color="#fff" fill="#fff" />
          </div>
          <span style={{ fontFamily:'Fraunces, serif', fontSize:20, fontWeight:600, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>TaskForge</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          {user ? (
            <Link href="/dashboard" style={{ textDecoration:'none' }}>
              <button className="btn-primary" style={{ padding:'8px 20px' }}>Go to Dashboard <ArrowRight size={14} /></button>
            </Link>
          ) : (
            <>
              <Link href="/login" style={{ textDecoration:'none' }}>
                <button className="btn-ghost" style={{ padding:'8px 20px', border:'none', background:'transparent' }}>Sign In</button>
              </Link>
              <Link href="/signup" style={{ textDecoration:'none' }}>
                <button className="btn-primary" style={{ padding:'8px 24px' }}>Get Started</button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'140px 24px 80px', textAlign:'center', position:'relative' }}>
        
        <div className="animate-slide-up" style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.03)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:100, padding:'6px 20px', marginBottom:32, boxShadow:'0 4px 20px rgba(0,0,0,0.2)' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent-secondary)', animation:'pulseGlow 2s ease-in-out infinite' }} />
            <span style={{ fontFamily:'Outfit, sans-serif', fontSize:12, fontWeight:500, letterSpacing:'0.06em', color:'var(--text-primary)', textTransform:'uppercase' }}>Introducing TaskForge 2.0</span>
          </div>

          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(46px, 7vw, 90px)', fontWeight:400, color:'var(--text-primary)', lineHeight:1.05, marginBottom:28, maxWidth:860, letterSpacing:'-0.02em' }}>
            Where teams turn{' '}
            <em style={{ color:'var(--accent-secondary)', fontStyle:'italic', paddingRight:'6px' }}>chaos</em>{' '}
            into execution
          </h1>

          <p style={{ fontSize:18, color:'var(--text-secondary)', maxWidth:560, margin:'0 auto 48px', lineHeight:1.6, fontWeight:300 }}>
            Manage projects, assign tasks, and track progress — all in one breathtakingly fast, focused workspace built for modern teams.
          </p>

          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
            <Link href="/signup" style={{ textDecoration:'none' }}>
              <button className="btn-primary" style={{ padding:'14px 32px', fontSize:14 }}>
                Start for free <ArrowRight size={16} />
              </button>
            </Link>
            <Link href="/login" style={{ textDecoration:'none' }}>
              <button className="btn-ghost" style={{ padding:'14px 32px', fontSize:14 }}>Sign in →</button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ borderTop:'1px solid var(--bg-border)', borderBottom:'1px solid var(--bg-border)', padding:'40px 48px', background:'rgba(255,255,255,0.01)', backdropFilter:'blur(10px)' }}>
        <div style={{ maxWidth:1000, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4, 1fr)' }}>
          {stats.map(({ value, label }, i) => (
            <div key={label} style={{ textAlign:'center', padding:'12px 0', borderRight: i < 3 ? '1px solid var(--bg-border)' : 'none' }}>
              <div style={{ fontFamily:'Fraunces, serif', fontSize:48, fontWeight:300, color:'var(--accent-primary)', lineHeight:1, marginBottom:10 }}>{value}</div>
              <div style={{ fontFamily:'DM Mono, monospace', fontSize:12, letterSpacing:'0.06em', color:'var(--text-muted)', textTransform:'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Dashboard mockup ── */}
      <section style={{ padding:'120px 48px', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:80 }}>
          <p style={{ fontFamily:'Outfit, sans-serif', fontSize:13, fontWeight:500, color:'var(--accent-primary)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>The Interface</p>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(32px, 4vw, 56px)', fontWeight:400, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>Immersive focus.</h2>
        </div>

        <div className="glass-panel" style={{ overflow:'hidden', padding:0, border:'1px solid rgba(255,255,255,0.15)', transform:'perspective(1000px) rotateX(2deg)', boxShadow:'0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset' }}>
          {/* Window chrome */}
          <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--bg-border)', display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.02)' }}>
            {(['#ff5f56','#ffbd2e','#27c93f'] as const).map((c) => (
              <div key={c} style={{ width:12, height:12, borderRadius:'50%', background:c, boxShadow:`0 0 4px ${c}` }} />
            ))}
            <div style={{ flex:1, margin:'0 16px', background:'rgba(0,0,0,0.2)', borderRadius:8, height:28, display:'flex', alignItems:'center', paddingLeft:16, border:'1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--text-muted)' }}>taskforge.app/dashboard</span>
            </div>
          </div>

          <div style={{ display:'flex', background:'rgba(0,0,0,0.1)' }}>
            {/* Fake sidebar */}
            <div style={{ width:220, borderRight:'1px solid var(--bg-border)', padding:'24px 16px', flexShrink:0, background:'rgba(255,255,255,0.01)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', marginBottom:24 }}>
                <div style={{ width:24, height:24, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Zap size={14} color="#fff" fill="#fff" />
                </div>
                <span style={{ fontFamily:'Fraunces, serif', fontSize:16, color:'var(--text-primary)' }}>TaskForge</span>
              </div>
              {(['Dashboard', 'Projects', 'My Tasks', 'Settings'] as const).map((label, i) => (
                <div key={label} style={{ padding:'10px 14px', borderRadius:8, marginBottom:4, background: i===0 ? 'rgba(129, 140, 248, 0.15)' : 'transparent', borderLeft:`2px solid ${i===0 ? 'var(--accent-primary)' : 'transparent'}`, display:'flex', alignItems:'center' }}>
                  <span style={{ fontFamily:'Outfit, sans-serif', fontSize:13, fontWeight: i===0 ? 500:400, color: i===0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Fake content */}
            <div style={{ flex:1, padding:32 }}>
              <div style={{ marginBottom:28 }}>
                <div style={{ height:12, width:100, background:'var(--bg-border)', borderRadius:6, marginBottom:12 }} />
                <div style={{ height:24, width:240, background:'rgba(255,255,255,0.05)', borderRadius:6 }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16, marginBottom:32 }}>
                {(['var(--accent-primary)','#4ade80','#60a5fa','#f87171'] as const).map((color, i) => (
                  <div key={i} className="glass-panel-elevated" style={{ padding:20 }}>
                    <div style={{ height:8, width:60, background:'var(--bg-border)', borderRadius:4, marginBottom:16 }} />
                    <div style={{ fontFamily:'Fraunces, serif', fontSize:32, fontWeight:300, color, lineHeight:1 }}>{[24,18,4,2][i]}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
                {([['To Do',['Design mockups','Write tests'],'var(--text-muted)'],['In Progress',['API integration','Auth flow'],'var(--accent-primary)'],['Done',['DB schema'],'#4ade80']] as Array<[string, string[], string]>).map(([col, items, color]) => (
                  <div key={col}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:color, boxShadow:`0 0 8px ${color}` }} />
                      <span style={{ fontFamily:'Outfit, sans-serif', fontSize:12, fontWeight:500, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{col}</span>
                    </div>
                    {items.map((item) => (
                      <div key={item} className="glass-panel-elevated" style={{ padding:'14px 16px', marginBottom:12 }}>
                        <div style={{ height:8, width:'70%', background:'var(--bg-border)', borderRadius:4, marginBottom:12 }} />
                        <div style={{ fontFamily:'Outfit, sans-serif', fontSize:13, color:'var(--text-secondary)' }}>{item}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding:'80px 48px 120px', maxWidth:1200, margin:'0 auto', position:'relative' }}>
        <div style={{ textAlign:'center', marginBottom:80 }}>
          <p style={{ fontFamily:'Outfit, sans-serif', fontSize:13, fontWeight:500, color:'var(--accent-primary)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>Powerful Features</p>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(32px, 4vw, 56px)', fontWeight:400, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>Crafted for perfection.</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:24 }}>
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div key={title} className="glass-panel" style={{ padding:36, transition:'all 0.3s ease', cursor:'default' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--bg-border)' }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20, border:'1px solid rgba(255,255,255,0.05)' }}>
                <Icon size={22} color="var(--accent-primary)" />
              </div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:22, fontWeight:400, color:'var(--text-primary)', marginBottom:12 }}>{title}</h3>
              <p style={{ fontFamily:'Outfit, sans-serif', fontSize:15, color:'var(--text-secondary)', lineHeight:1.6, fontWeight:300 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding:'100px 48px', position:'relative' }}>
        <div style={{ position:'absolute', inset:0, background:'rgba(255,255,255,0.01)', backdropFilter:'blur(20px)', borderTop:'1px solid var(--bg-border)', borderBottom:'1px solid var(--bg-border)', zIndex:-1 }} />
        <div style={{ maxWidth:1000, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:80 }}>
            <p style={{ fontFamily:'Outfit, sans-serif', fontSize:13, fontWeight:500, color:'var(--accent-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>Workflow</p>
            <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(32px, 4vw, 56px)', fontWeight:400, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>Three steps to clarity.</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:32 }}>
            {steps.map(({ step, title, desc }, i) => (
              <div key={step} style={{ padding:'16px', position:'relative' }}>
                {i < 2 && <div style={{ position:'absolute', top:40, right:-16, width:32, height:1, background:'var(--bg-border)' }} />}
                <div style={{ fontFamily:'Fraunces, serif', fontSize:72, fontWeight:300, color:'rgba(255,255,255,0.05)', lineHeight:1, marginBottom:20, userSelect:'none' }}>{step}</div>
                <h3 style={{ fontFamily:'Fraunces, serif', fontSize:22, fontWeight:400, color:'var(--text-primary)', marginBottom:12 }}>{title}</h3>
                <p style={{ fontFamily:'Outfit, sans-serif', fontSize:15, color:'var(--text-secondary)', lineHeight:1.6, fontWeight:300 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding:'140px 24px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'50vw', height:'50vw', background:'radial-gradient(circle, var(--accent-glow) 0%, transparent 50%)', filter:'blur(80px)', pointerEvents:'none', opacity:0.6 }} />
        <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(40px, 6vw, 64px)', fontWeight:400, color:'var(--text-primary)', marginBottom:20, maxWidth:700, margin:'0 auto 20px', letterSpacing:'-0.02em', lineHeight:1.1 }}>
            Ready to experience clarity?
          </h2>
          <p style={{ color:'var(--text-secondary)', fontSize:18, marginBottom:48, fontFamily:'Outfit, sans-serif', fontWeight:300 }}>Start today. No credit card required.</p>
          <Link href="/signup" style={{ textDecoration:'none' }}>
            <button className="btn-primary" style={{ padding:'16px 40px', fontSize:15 }}>
              Create free account <ArrowRight size={18} />
            </button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop:'1px solid var(--bg-border)', padding:'40px 48px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:24, height:24, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Zap size={12} color="#fff" fill="#fff" />
          </div>
          <span style={{ fontFamily:'Fraunces, serif', fontSize:16, color:'var(--text-secondary)', letterSpacing:'-0.02em' }}>TaskForge</span>
        </div>
        <div style={{ display:'flex', gap:32 }}>
          {([['Login','/login'],['Sign up','/signup'],['Dashboard','/dashboard']] as const).map(([label, href]) => (
            <Link key={label} href={href}
              style={{ fontFamily:'Outfit, sans-serif', fontSize:13, color:'var(--text-muted)', textDecoration:'none', transition:'color 0.2s', fontWeight:400 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color='var(--text-primary)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color='var(--text-muted)')}>
              {label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}