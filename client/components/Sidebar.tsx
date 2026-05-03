'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { LayoutDashboard, FolderKanban, CheckSquare, Settings, LogOut, Zap, LucideIcon } from 'lucide-react';

interface NavItem { label: string; href: string; icon: LucideIcon }

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: FolderKanban },
  { label: 'My Tasks',  href: '/tasks',     icon: CheckSquare },
  { label: 'Settings',  href: '/settings',  icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <aside style={{ width:220, minHeight:'100vh', background:'var(--bg-surface)', borderRight:'1px solid var(--bg-border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
      {/* Logo */}
      <div style={{ padding:'28px 24px 20px', borderBottom:'1px solid var(--bg-border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, background:'var(--amber)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Zap size={16} color="#0d0d0f" fill="#0d0d0f" />
          </div>
          <span style={{ fontFamily:'Fraunces, serif', fontSize:18, fontWeight:600, color:'var(--text-primary)' }}>TaskForge</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'16px 12px' }}>
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link key={href} href={href} style={{ textDecoration:'none' }}>
              <div style={{
                display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                borderRadius:7, marginBottom:2, cursor:'pointer', transition:'all 0.15s',
                background: active ? 'rgba(245,158,11,0.1)' : 'transparent',
                color: active ? 'var(--amber)' : 'var(--text-secondary)',
                fontFamily:'DM Mono, monospace', fontSize:12, letterSpacing:'0.04em',
                borderLeft: active ? '2px solid var(--amber)' : '2px solid transparent',
              }}>
                <Icon size={15} />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding:'16px 12px', borderTop:'1px solid var(--bg-border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:7, marginBottom:4 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg, var(--amber), #d97706)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Mono, monospace', fontSize:11, color:'#0d0d0f', fontWeight:600, flexShrink:0 }}>
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div style={{ overflow:'hidden' }}>
            <div style={{ fontSize:12, color:'var(--text-primary)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'DM Mono, monospace', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.email}</div>
          </div>
        </div>
        <button className="btn-ghost" style={{ width:'100%', justifyContent:'center', marginTop:4 }} onClick={logout}>
          <LogOut size={13} /> Logout
        </button>
      </div>
    </aside>
  );
}