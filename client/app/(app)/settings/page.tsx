'use client';
import { useEffect, useState, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import { User, Lock, Save, Bell, Moon, Smartphone, ShieldCheck, Mail } from 'lucide-react';

interface ProfileForm {
  name: string;
  email: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
}

export default function SettingsPage(): ReactElement {
  const { user, loading: authLoading, setUser } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab]             = useState<'profile' | 'preferences' | 'security'>('profile');
  const [profile, setProfile]     = useState<ProfileForm>({ name: '', email: '' });
  const [passwords, setPasswords] = useState<PasswordForm>({ currentPassword: '', newPassword: '' });
  const [saving, setSaving]       = useState<boolean>(false);
  const [savingPw, setSavingPw]   = useState<boolean>(false);
  
  // Dummy preferences state
  const [prefs, setPrefs] = useState({
    emailNotifs: true,
    pushNotifs: false,
    weeklyReport: true,
    darkMode: true
  });

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) setProfile({ name: user.name, email: user.email });
  }, [user]);

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await authApi.updateMe({ name: profile.name });
      setUser(d.user);
      toast('Profile updated successfully');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (passwords.newPassword.length < 6) {
      toast('New password must be at least 6 characters', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await authApi.changePassword(passwords);
      toast('Password changed successfully');
      setPasswords({ currentPassword: '', newPassword: '' });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const passwordFields: { key: keyof PasswordForm; label: string }[] = [
    { key: 'currentPassword', label: 'Current Password' },
    { key: 'newPassword',     label: 'New Password (min 6 chars)' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '40px 48px', overflow: 'auto', position: 'relative', zIndex: 1 }}>
        
        {/* Subtle background glow */}
        <div style={{ position:'absolute', top:'0%', right:'0%', width:'50vw', height:'50vw', background:'radial-gradient(circle, rgba(192, 132, 252, 0.04) 0%, transparent 60%)', filter:'blur(80px)', zIndex:-1, pointerEvents:'none' }} />

        <div className="animate-fade-in" style={{ maxWidth: 760 }}>
          
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, color: 'var(--accent-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Account
            </p>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Settings Hub
            </h1>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 40 }}>
            {(['profile', 'preferences', 'security'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '12px 24px',
                fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (tab !== t) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { if (tab !== t) e.currentTarget.style.color = 'var(--text-muted)' }}>
                {t}
              </button>
            ))}
          </div>

          {/* ══ PROFILE TAB ══ */}
          {tab === 'profile' && (
            <div className="animate-slide-up">
              <div className="glass-panel" style={{ padding: 32, marginBottom: 24, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(180deg, rgba(129, 140, 248, 0.1) 0%, transparent 100%)' }} />
                
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 32, alignItems: 'flex-start' }}>
                  {/* Glowing Avatar */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ 
                      width: 100, height: 100, borderRadius: '50%', 
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      fontSize: 40, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 600,
                      boxShadow: '0 0 40px rgba(129, 140, 248, 0.4)',
                      border: '4px solid rgba(255,255,255,0.1)',
                      marginBottom: 16
                    }}>
                      {user?.name?.[0]?.toUpperCase()}
                    </div>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Change Avatar</button>
                  </div>

                  <form onSubmit={saveProfile} style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                      <User size={18} color="var(--accent-primary)" />
                      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', fontWeight: 400 }}>Personal Information</h2>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: 'block', fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile({ ...profile, name: e.target.value })}
                        style={{ fontSize: 15, padding: '12px 16px', background: 'rgba(255,255,255,0.02)' }}
                      />
                    </div>
                    
                    <div style={{ marginBottom: 32 }}>
                      <label style={{ display: 'block', fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={profile.email}
                        disabled
                        style={{ fontSize: 15, padding: '12px 16px', background: 'rgba(255,255,255,0.01)', opacity: 0.6, cursor: 'not-allowed', color: 'var(--text-muted)' }}
                      />
                      <p style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)', marginTop: 8 }}>Your email address is used for login and cannot be changed.</p>
                    </div>

                    <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Save size={16} /> {saving ? 'Saving Changes…' : 'Save Changes'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* ══ PREFERENCES TAB ══ */}
          {tab === 'preferences' && (
            <div className="animate-slide-up">
              <div className="glass-panel" style={{ padding: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Bell size={18} color="var(--accent-secondary)" />
                  </div>
                  <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', fontWeight: 400 }}>App Preferences</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Toggle 1 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <Mail size={20} color="var(--text-muted)" />
                      <div>
                        <div style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>Email Notifications</div>
                        <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>Receive task assignments and updates via email.</div>
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={prefs.emailNotifs} onChange={(e) => setPrefs({...prefs, emailNotifs: e.target.checked})} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  
                  {/* Toggle 2 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <Smartphone size={20} color="var(--text-muted)" />
                      <div>
                        <div style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>Push Notifications</div>
                        <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>Get notified instantly in your browser.</div>
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={prefs.pushNotifs} onChange={(e) => setPrefs({...prefs, pushNotifs: e.target.checked})} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  {/* Toggle 3 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <Moon size={20} color="var(--text-muted)" />
                      <div>
                        <div style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>Dark Mode</div>
                        <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>Enable the immersive glassmorphic dark theme.</div>
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={prefs.darkMode} onChange={(e) => {
                        toast('Dark mode is permanently locked in for this aesthetic!', 'success');
                        setPrefs({...prefs, darkMode: true});
                      }} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ SECURITY TAB ══ */}
          {tab === 'security' && (
            <div className="animate-slide-up">
              <div className="glass-panel" style={{ padding: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <ShieldCheck size={18} color="#f87171" />
                  </div>
                  <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', fontWeight: 400 }}>Security Settings</h2>
                </div>

                <form onSubmit={changePassword} style={{ maxWidth: 400 }}>
                  <p style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
                    Regularly updating your password helps keep your account secure. Ensure your new password is at least 6 characters long.
                  </p>

                  {passwordFields.map(({ key, label }) => (
                    <div key={key} style={{ marginBottom: 24 }}>
                      <label style={{ display: 'block', fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                        {label}
                      </label>
                      <input
                        type="password"
                        required
                        value={passwords[key]}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswords({ ...passwords, [key]: e.target.value })}
                        placeholder="••••••••"
                        style={{ fontSize: 15, padding: '12px 16px', background: 'rgba(255,255,255,0.02)' }}
                      />
                    </div>
                  ))}

                  <button type="submit" className="btn-primary" disabled={savingPw} style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Lock size={16} /> {savingPw ? 'Updating Password…' : 'Update Password'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}