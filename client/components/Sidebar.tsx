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
    <aside style={{ width:240, height:'100vh', position:'sticky', top:0, background:'rgba(255,255,255,0.01)', backdropFilter:'blur(20px)', borderRight:'1px solid var(--bg-border)', display:'flex', flexDirection:'column', flexShrink:0, zIndex:50 }}>
      {/* Logo */}
      <div style={{ padding:'32px 24px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:32, height:32, background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 15px var(--accent-glow)' }}>
            <Zap size={16} color="#fff" fill="#fff" />
          </div>
          <span style={{ fontFamily:'Fraunces, serif', fontSize:20, fontWeight:500, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>TaskForge</span>
        </div>
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
      </nav>

      {/* User */}
      <div style={{ padding:'24px 16px', borderTop:'1px solid var(--bg-border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, marginBottom:16, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Outfit, sans-serif', fontSize:14, color:'#fff', fontWeight:500, flexShrink:0 }}>
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div style={{ overflow:'hidden' }}>
            <div style={{ fontSize:14, color:'var(--text-primary)', fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'Outfit, sans-serif' }}>{user?.name}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', fontFamily:'Outfit, sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.email}</div>
          </div>
        </div>
        <button className="btn-ghost" style={{ width:'100%', justifyContent:'center', padding:'12px', fontSize:13 }} onClick={logout}>
          <LogOut size={16} /> Logout
        </button>
      </div>
    </aside>
  );
}