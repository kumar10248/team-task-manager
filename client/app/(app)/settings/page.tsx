'use client';
import { useEffect, useState, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import { User, Lock, Save } from 'lucide-react';

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

  const [profile, setProfile]     = useState<ProfileForm>({ name: '', email: '' });
  const [passwords, setPasswords] = useState<PasswordForm>({ currentPassword: '', newPassword: '' });
  const [saving, setSaving]       = useState<boolean>(false);
  const [savingPw, setSavingPw]   = useState<boolean>(false);

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
      toast('Profile updated');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (passwords.newPassword.length < 6) {
      toast('New password must be at least 6 chars', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await authApi.changePassword(passwords);
      toast('Password changed');
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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '32px 36px', overflow: 'auto' }}>
        <div className="animate-fade-in" style={{ maxWidth: 560 }}>
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Account
            </p>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 30, fontWeight: 600, color: 'var(--text-primary)' }}>
              Settings
            </h1>
          </div>

          {/* Profile */}
          <div className="card" style={{ padding: 28, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={15} color="var(--amber)" />
              </div>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)' }}>Profile</h2>
            </div>
            <form onSubmit={saveProfile}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,var(--amber),#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: 'DM Mono, monospace', color: '#0d0d0f', fontWeight: 600, flexShrink: 0 }}>
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>{user?.name}</div>
                  <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{user?.email}</div>
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile({ ...profile, name: e.target.value })}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Email (read only)
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  style={{ opacity: 0.5, cursor: 'not-allowed' }}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Password */}
          <div className="card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={15} color="var(--amber)" />
              </div>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)' }}>Change Password</h2>
            </div>
            <form onSubmit={changePassword}>
              {passwordFields.map(({ key, label }) => (
                <div key={key} style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                    {label}
                  </label>
                  <input
                    type="password"
                    required
                    value={passwords[key]}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswords({ ...passwords, [key]: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              ))}
              <button type="submit" className="btn-primary" disabled={savingPw}>
                <Lock size={13} /> {savingPw ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}