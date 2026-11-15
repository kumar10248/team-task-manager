'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { authApi } from '../lib/api';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Settings, LogOut,
  Zap, Bell, LucideIcon, Search, Video, CreditCard, Crown,
  Sparkles, Clock, ArrowRight
} from 'lucide-react';
import NotificationsPanel from './NotificationsPanel';
import CommandPalette from './CommandPalette';

interface NavItem { label: string; href: string; icon: LucideIcon }

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: FolderKanban },
  { label: 'My Tasks',  href: '/tasks',     icon: CheckSquare },
  { label: 'Meetings',  href: '/meetings',  icon: Video },
  { label: 'Billing',   href: '/billing',   icon: CreditCard },
  { label: 'Settings',  href: '/settings',  icon: Settings },
];

export default function Sidebar() {
  const { user, logout, setUser, subscription, isCoveredByAdmin } = useAuth();
  const pathname = usePathname();
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const isTrialing = Boolean(
    subscription?.status === 'trialing' &&
    !isCoveredByAdmin &&
    !user?.isSuperAdmin
  );

  const daysRemaining = subscription?.daysRemaining !== undefined
    ? Math.max(0, subscription.daysRemaining)
    : (subscription?.currentPeriodEnd
        ? Math.max(0, Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 14);

  const endDate = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const formattedEndDate = endDate
    ? endDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const isUrgent = daysRemaining <= 3;
  const percentUsed = Math.min(100, Math.max(0, Math.round(((14 - daysRemaining) / 14) * 100)));

  useEffect(() => {
    if (!user?.isClockedIn || !user?.lastClockIn) return;
    const interval = setInterval(() => setNow(Date.now()), 5000); // live ticker update every 5s
    return () => clearInterval(interval);
  }, [user?.isClockedIn, user?.lastClockIn]);

  let durationStr = '';
  if (user?.isClockedIn && user?.lastClockIn) {
    const clockInTime = new Date(user.lastClockIn).getTime();
    const elapsedMs = Math.max(0, now - clockInTime);
    const totalMinutes = Math.floor(elapsedMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    durationStr = hours >= 14 ? '14h cap' : `${hours}h ${mins}m`;
  }

  return (
    <>
      <aside style={{ width:240, height:'100vh', position:'sticky', top:0, background:'rgba(255,255,255,0.01)', backdropFilter:'blur(20px)', borderRight:'1px solid var(--bg-border)', display:'flex', flexDirection:'column', flexShrink:0, zIndex:50 }}>
        {/* Logo */}
        <div style={{ padding:'32px 24px 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:32, height:32, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 15px var(--accent-glow)' }}>
              <Zap size={16} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontFamily:'Fraunces, serif', fontSize:20, fontWeight:500, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>TaskForge</span>
          </div>
        </div>

        {/* ⌘K Command Palette Quick Launcher */}
        <div style={{ padding: '0 12px 12px' }}>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: 8,
              color: 'var(--text-muted)',
              fontSize: 12,
              fontFamily: 'Outfit, sans-serif',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.3)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.025)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={14} color="var(--accent-primary)" />
              <span>Search…</span>
            </div>
            <kbd style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>⌘K</kbd>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'16px 12px', display:'flex', flexDirection:'column', gap:4 }}>
          {nav.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link key={href} href={href} style={{ textDecoration:'none' }}>
                <div style={{
                  display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                  borderRadius:10, cursor:'pointer', transition:'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  background: active ? 'rgba(129, 140, 248, 0.1)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily:'Outfit, sans-serif', fontSize:14, fontWeight: active ? 500 : 400,
                  borderLeft: active ? '3px solid var(--accent-primary)' : '3px solid transparent',
                }}
                onMouseEnter={(e) => { if(!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                onMouseLeave={(e) => { if(!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}>
                  <Icon size={18} color={active ? 'var(--accent-primary)' : 'currentColor'} />
                  {label}
                </div>
              </Link>
            );
          })}

          {/* Super Admin Panel link (Visible to Super Admins) */}
          {user?.isSuperAdmin && (
            <Link href="/super-admin" style={{ textDecoration: 'none', marginTop: 10 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
                borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                background: pathname === '/super-admin' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.05)',
                color: pathname === '/super-admin' ? '#fbbf24' : 'var(--text-secondary)',
                fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500,
                border: pathname === '/super-admin' ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(251, 191, 36, 0.15)',
                boxShadow: pathname === '/super-admin' ? '0 0 15px rgba(251, 191, 36, 0.2)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Crown size={18} color="#fbbf24" />
                  <span style={{ color: pathname === '/super-admin' ? '#fbbf24' : 'var(--text-primary)' }}>Super Admin</span>
                </div>
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                  VIP
                </span>
              </div>
            </Link>
          )}
        </nav>

        {/* Persistent Free Trial Card */}
        {isTrialing && (
          <div style={{
            margin: '0 12px 14px',
            padding: '12px 14px',
            borderRadius: 14,
            background: isUrgent
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(220, 38, 38, 0.06))'
              : 'linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.04))',
            border: isUrgent
              ? '1px solid rgba(239, 68, 68, 0.4)'
              : '1px solid rgba(251, 191, 36, 0.35)',
            boxShadow: isUrgent
              ? '0 0 20px rgba(239, 68, 68, 0.15)'
              : '0 0 20px rgba(251, 191, 36, 0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 700,
                color: isUrgent ? '#f87171' : '#fbbf24',
                fontFamily: 'Outfit, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <Sparkles size={11} /> 14-Day Free Trial
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: isUrgent ? '#f87171' : '#fbbf24',
                fontFamily: 'Outfit, sans-serif',
              }}>
                {daysRemaining}d left
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div style={{
              width: '100%',
              height: 4,
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 2,
              overflow: 'hidden',
              marginBottom: 8,
            }}>
              <div style={{
                width: `${percentUsed}%`,
                height: '100%',
                background: isUrgent ? '#ef4444' : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }} />
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', marginBottom: 10, lineHeight: 1.4 }}>
              Ends on <strong style={{ color: 'var(--text-primary)', textDecoration: 'underline', textDecorationColor: isUrgent ? '#ef4444' : '#fbbf24' }}>{formattedEndDate}</strong>
            </div>

            <Link
              href="/billing"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
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
                  ? '0 0 12px rgba(239, 68, 68, 0.3)'
                  : '0 0 12px var(--accent-glow)',
                transition: 'all 0.2s',
              }}
            >
              <CreditCard size={13} />
              <span>Pay for Subscription</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        )}

        {/* User */}
        <div style={{ padding:'24px 16px', borderTop:'1px solid var(--bg-border)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:12, marginBottom:16, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)' }}>
            
            <div style={{ display:'flex', alignItems:'center', gap:10, overflow:'hidden' }}>
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(129, 140, 248, 0.5)' }}
                />
              ) : (
                <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Outfit, sans-serif', fontSize:14, color:'#fff', fontWeight:500, flexShrink:0 }}>
                  {user?.name?.[0]?.toUpperCase() ?? 'U'}
                </div>
              )}
              <div style={{ overflow:'hidden' }}>
                <div style={{ fontSize:13, color:'var(--text-primary)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'Outfit, sans-serif' }}>{user?.name}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'Outfit, sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.email}</div>
              </div>
            </div>

            <button 
              onClick={() => setNotifsOpen(true)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex', padding:4, position:'relative', transition:'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <Bell size={18} />
              <span style={{ position:'absolute', top:2, right:4, width:8, height:8, borderRadius:'50%', background:'var(--amber)', boxShadow:'0 0 8px var(--amber)' }} />
            </button>

          </div>

          <div style={{ display:'flex', gap: 8, marginBottom: 8 }}>
            <button 
              className={user?.isClockedIn ? "btn-secondary" : "btn-primary"} 
              style={{ 
                flex: 1, 
                padding: '8px 10px', 
                fontSize: 12, 
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 500,
                justifyContent: 'center', 
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: '0.01em'
              }}
              onClick={async () => {
                try {
                  const res = user?.isClockedIn ? await authApi.clockOut() : await authApi.clockIn();
                  if (res.success && setUser) {
                    setUser(res.user);
                  }
                } catch {}
              }}
            >
              {user?.isClockedIn && (
                <span 
                  style={{ 
                    width: 7, 
                    height: 7, 
                    borderRadius: '50%', 
                    background: '#4ade80', 
                    boxShadow: '0 0 8px #4ade80',
                    display: 'inline-block',
                    flexShrink: 0
                  }} 
                />
              )}
              {user?.isClockedIn 
                ? `Clock Out (${durationStr || '0h 0m'})` 
                : 'Clock In'}
            </button>
          </div>

          <button className="btn-ghost" style={{ width:'100%', justifyContent:'center', padding:'10px', fontSize:13 }} onClick={logout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <NotificationsPanel isOpen={notifsOpen} onClose={() => setNotifsOpen(false)} />
      <CommandPalette />
    </>
  );
}