'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { Zap, CheckCircle2, Users, BarChart3, ArrowRight, Layers, Shield, Clock, LucideIcon } from 'lucide-react';

interface Feature { icon: LucideIcon; title: string; desc: string }

const features: Feature[] = [
  { icon: Layers,       title: 'Kanban Boards',    desc: 'Visual task boards with To Do, In Progress, and Done columns. Drag-and-drop clarity at a glance.' },
  { icon: Users,        title: 'Team Roles',        desc: 'Admins manage everything. Members update their own tasks. Role-based access keeps projects clean.' },
  { icon: BarChart3,    title: 'Live Dashboard',    desc: 'Real-time stats on task completion, overdue items, and workload per team member.' },
  { icon: Shield,       title: 'Secure Auth',       desc: 'JWT-based authentication with encrypted passwords. Your data stays yours.' },
  { icon: Clock,        title: 'Due Date Tracking', desc: 'Never miss a deadline. Overdue tasks are surfaced automatically across all views.' },
  { icon: CheckCircle2, title: 'Priority Levels',   desc: 'Low, medium, high, or urgent — colour-coded priorities so teams always know what matters most.' },
];

const stats: Array<{ value: string; label: string }> = [
  { value: '3', label: 'Task Statuses' },
  { value: '4', label: 'Priority Levels' },
  { value: '2', label: 'Role Types' },
  { value: '∞', label: 'Projects' },
];

const steps = [
  { step: '01', title: 'Create a project', desc: 'You become the Admin. Set a name, colour, and description.' },
  { step: '02', title: 'Invite your team',  desc: 'Add members by email. Assign Admin or Member roles.' },
  { step: '03', title: 'Ship tasks',        desc: 'Create tasks, set priorities, assign people, track progress.' },
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
    <div style={{ minHeight:'100vh', background:'var(--bg-base)', overflowX:'hidden' }}>

      {/* ── Navbar ── */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:100,
        padding:'0 48px', height:60, display:'flex', alignItems:'center', justifyContent:'space-between',
        background: scrolled ? 'rgba(13,13,15,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--bg-border)' : '1px solid transparent',
        transition:'all 0.3s',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:28, height:28, background:'var(--amber)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Zap size={15} color="#0d0d0f" fill="#0d0d0f" />
          </div>
          <span style={{ fontFamily:'Fraunces, serif', fontSize:17, fontWeight:600, color:'var(--text-primary)' }}>TaskForge</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {user ? (
            <Link href="/dashboard" style={{ textDecoration:'none' }}>
              <button className="btn-primary" style={{ padding:'7px 18px' }}>Go to Dashboard <ArrowRight size={13} /></button>
            </Link>
          ) : (
            <>
              <Link href="/login" style={{ textDecoration:'none' }}>
                <button className="btn-ghost" style={{ padding:'7px 16px' }}>Sign In</button>
              </Link>
              <Link href="/signup" style={{ textDecoration:'none' }}>
                <button className="btn-primary" style={{ padding:'7px 18px' }}>Get Started</button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'120px 24px 80px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'40%', left:'50%', transform:'translate(-50%,-50%)', width:700, height:500, background:'radial-gradient(ellipse, rgba(245,158,11,0.07) 0%, transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize:'60px 60px', pointerEvents:'none' }} />

        <div className="animate-slide-up" style={{ position:'relative', zIndex:1 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:100, padding:'5px 16px', marginBottom:32 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--amber)', animation:'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontFamily:'DM Mono, monospace', fontSize:11, letterSpacing:'0.08em', color:'var(--amber)', textTransform:'uppercase' }}>Team Collaboration Tool</span>
          </div>

          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(42px, 7vw, 80px)', fontWeight:600, color:'var(--text-primary)', lineHeight:1.05, marginBottom:24, maxWidth:800 }}>
            Where teams turn{' '}
            <em style={{ color:'var(--amber)', fontStyle:'italic' }}>chaos</em>{' '}
            into execution
          </h1>

          <p style={{ fontSize:17, color:'var(--text-secondary)', maxWidth:520, margin:'0 auto 48px', lineHeight:1.7 }}>
            Manage projects, assign tasks, and track progress — all in one focused workspace built for modern teams.
          </p>

          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <Link href="/signup" style={{ textDecoration:'none' }}>
              <button className="btn-primary" style={{ padding:'12px 28px', fontSize:12 }}>
                Start for free <ArrowRight size={14} />
              </button>
            </Link>
            <Link href="/login" style={{ textDecoration:'none' }}>
              <button className="btn-ghost" style={{ padding:'12px 28px', fontSize:12 }}>Sign in →</button>
            </Link>
          </div>

          <div style={{ marginTop:72, display:'flex', flexDirection:'column', alignItems:'center', gap:6, opacity:0.4 }}>
            <div style={{ width:1, height:40, background:'linear-gradient(to bottom, transparent, var(--text-muted))' }} />
            <span style={{ fontFamily:'DM Mono, monospace', fontSize:10, letterSpacing:'0.12em', color:'var(--text-muted)', textTransform:'uppercase' }}>Scroll</span>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ borderTop:'1px solid var(--bg-border)', borderBottom:'1px solid var(--bg-border)', padding:'32px 48px' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4, 1fr)' }}>
          {stats.map(({ value, label }, i) => (
            <div key={label} style={{ textAlign:'center', padding:'8px 0', borderRight: i < 3 ? '1px solid var(--bg-border)' : 'none' }}>
              <div style={{ fontFamily:'Fraunces, serif', fontSize:44, fontWeight:600, color:'var(--amber)', lineHeight:1 }}>{value}</div>
              <div style={{ fontFamily:'DM Mono, monospace', fontSize:11, letterSpacing:'0.08em', color:'var(--text-muted)', textTransform:'uppercase', marginTop:6 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Dashboard mockup ── */}
      <section style={{ padding:'100px 48px', maxWidth:1100, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:60 }}>
          <p style={{ fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--amber)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>Interface</p>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(28px, 4vw, 44px)', fontWeight:600, color:'var(--text-primary)' }}>Built for focus</h2>
        </div>

        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--bg-border)', borderRadius:16, overflow:'hidden', boxShadow:'0 40px 120px rgba(0,0,0,0.5)' }}>
          {/* Window chrome */}
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--bg-border)', display:'flex', alignItems:'center', gap:8 }}>
            {(['#ef4444','#f59e0b','#22c55e'] as const).map((c) => (
              <div key={c} style={{ width:12, height:12, borderRadius:'50%', background:c, opacity:0.7 }} />
            ))}
            <div style={{ flex:1, margin:'0 12px', background:'var(--bg-elevated)', borderRadius:6, height:24, display:'flex', alignItems:'center', paddingLeft:12 }}>
              <span style={{ fontFamily:'DM Mono, monospace', fontSize:10, color:'var(--text-muted)' }}>taskforge.app/dashboard</span>
            </div>
          </div>

          <div style={{ display:'flex' }}>
            {/* Fake sidebar */}
            <div style={{ width:180, borderRight:'1px solid var(--bg-border)', padding:'20px 12px', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', marginBottom:16 }}>
                <div style={{ width:22, height:22, background:'var(--amber)', borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Zap size={12} color="#0d0d0f" fill="#0d0d0f" />
                </div>
                <span style={{ fontFamily:'Fraunces, serif', fontSize:13, color:'var(--text-primary)' }}>TaskForge</span>
              </div>
              {(['Dashboard', 'Projects', 'My Tasks', 'Settings'] as const).map((label, i) => (
                <div key={label} style={{ padding:'7px 12px', borderRadius:6, marginBottom:2, background: i===0 ? 'rgba(245,158,11,0.1)' : 'transparent', borderLeft:`2px solid ${i===0 ? 'var(--amber)' : 'transparent'}` }}>
                  <span style={{ fontFamily:'DM Mono, monospace', fontSize:11, color: i===0 ? 'var(--amber)' : 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Fake content */}
            <div style={{ flex:1, padding:24 }}>
              <div style={{ marginBottom:20 }}>
                <div style={{ height:10, width:80, background:'var(--bg-border)', borderRadius:4, marginBottom:8 }} />
                <div style={{ height:18, width:200, background:'var(--bg-elevated)', borderRadius:4 }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 }}>
                {(['var(--amber)','#4ade80','#60a5fa','#f87171'] as const).map((color, i) => (
                  <div key={i} style={{ background:'var(--bg-elevated)', border:'1px solid var(--bg-border)', borderRadius:8, padding:14 }}>
                    <div style={{ height:8, width:50, background:'var(--bg-border)', borderRadius:4, marginBottom:10 }} />
                    <div style={{ fontFamily:'Fraunces, serif', fontSize:26, color, lineHeight:1 }}>{[24,18,4,2][i]}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
                {([['To Do',['Design mockups','Write tests'],'var(--text-muted)'],['In Progress',['API integration','Auth flow'],'#60a5fa'],['Done',['DB schema'],'#4ade80']] as Array<[string, string[], string]>).map(([col, items, color]) => (
                  <div key={col}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:color }} />
                      <span style={{ fontFamily:'DM Mono, monospace', fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{col}</span>
                    </div>
                    {items.map((item) => (
                      <div key={item} style={{ background:'var(--bg-elevated)', border:'1px solid var(--bg-border)', borderRadius:6, padding:'10px 12px', marginBottom:8 }}>
                        <div style={{ height:8, width:'80%', background:'var(--bg-border)', borderRadius:3, marginBottom:8 }} />
                        <div style={{ fontFamily:'DM Mono, monospace', fontSize:10, color:'var(--text-secondary)' }}>{item}</div>
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
      <section style={{ padding:'80px 48px 100px', maxWidth:1100, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:60 }}>
          <p style={{ fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--amber)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>Features</p>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(28px, 4vw, 44px)', fontWeight:600, color:'var(--text-primary)' }}>Everything your team needs</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:1, border:'1px solid var(--bg-border)', borderRadius:14, overflow:'hidden' }}>
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div key={title}
              style={{ padding:32, background:'var(--bg-surface)', borderRight:(i+1)%2===0?'none':'1px solid var(--bg-border)', borderBottom:i<4?'1px solid var(--bg-border)':'none', transition:'background 0.2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background='var(--bg-elevated)')}
              onMouseLeave={(e) => (e.currentTarget.style.background='var(--bg-surface)')}>
              <div style={{ width:36, height:36, borderRadius:9, background:'rgba(245,158,11,0.1)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
                <Icon size={17} color="var(--amber)" />
              </div>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:17, fontWeight:600, color:'var(--text-primary)', marginBottom:8 }}>{title}</h3>
              <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.7 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding:'80px 48px', background:'var(--bg-surface)', borderTop:'1px solid var(--bg-border)', borderBottom:'1px solid var(--bg-border)' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:60 }}>
            <p style={{ fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--amber)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>Workflow</p>
            <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(28px, 4vw, 44px)', fontWeight:600, color:'var(--text-primary)' }}>Up and running in 3 steps</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)' }}>
            {steps.map(({ step, title, desc }, i) => (
              <div key={step} style={{ padding:'32px 36px', borderRight: i<2 ? '1px solid var(--bg-border)' : 'none' }}>
                <div style={{ fontFamily:'Fraunces, serif', fontSize:64, fontWeight:600, color:'rgba(245,158,11,0.08)', lineHeight:1, marginBottom:16, userSelect:'none' }}>{step}</div>
                <h3 style={{ fontFamily:'Fraunces, serif', fontSize:18, color:'var(--text-primary)', marginBottom:10 }}>{title}</h3>
                <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.7 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding:'120px 24px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:600, height:400, background:'radial-gradient(ellipse, rgba(245,158,11,0.06) 0%, transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'relative', zIndex:1 }}>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'clamp(32px, 5vw, 56px)', fontWeight:600, color:'var(--text-primary)', marginBottom:16, maxWidth:600, margin:'0 auto 16px' }}>
            Ready to forge your first project?
          </h2>
          <p style={{ color:'var(--text-secondary)', fontSize:15, marginBottom:40, fontFamily:'DM Mono, monospace' }}>Free to start. No credit card required.</p>
          <Link href="/signup" style={{ textDecoration:'none' }}>
            <button className="btn-primary" style={{ padding:'14px 36px', fontSize:13 }}>
              Create free account <ArrowRight size={15} />
            </button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop:'1px solid var(--bg-border)', padding:'28px 48px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:20, height:20, background:'var(--amber)', borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Zap size={11} color="#0d0d0f" fill="#0d0d0f" />
          </div>
          <span style={{ fontFamily:'Fraunces, serif', fontSize:14, color:'var(--text-secondary)' }}>TaskForge</span>
        </div>
        <div style={{ display:'flex', gap:24 }}>
          {([['Login','/login'],['Sign up','/signup'],['Dashboard','/dashboard']] as const).map(([label, href]) => (
            <Link key={label} href={href}
              style={{ fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--text-muted)', textDecoration:'none', letterSpacing:'0.04em' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color='var(--amber)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color='var(--text-muted)')}>
              {label}
            </Link>
          ))}
        </div>
      </footer>

      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
    </div>
  );
}