'use client';
import { useEffect, useState, useCallback, useRef, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { authApi, projectsApi, ProjectInvitation, ProjectAddPrivacy } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import ConfirmModal from '@/components/ConfirmModal';
import {
  User, Lock, Save, Bell, Moon, Smartphone, ShieldCheck, Mail,
  Shield, Users, UserPlus, ShieldAlert, Check, X, Clock, CheckCircle2,
  Camera, Trash2, Loader2, Cloud
} from 'lucide-react';

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

  const [tab, setTab]                         = useState<'profile' | 'privacy' | 'preferences' | 'security'>('profile');
  const [profile, setProfile]                 = useState<ProfileForm>({ name: '', email: '' });
  const [privacy, setPrivacy]                 = useState<ProjectAddPrivacy>('anyone');
  const [savingPrivacy, setSavingPrivacy]     = useState<boolean>(false);
  const [invitations, setInvitations]         = useState<ProjectInvitation[]>([]);
  const [loadingInvites, setLoadingInvites]   = useState<boolean>(false);
  const [passwords, setPasswords]             = useState<PasswordForm>({ currentPassword: '', newPassword: '' });
  const [saving, setSaving]                   = useState<boolean>(false);
  const [savingPw, setSavingPw]               = useState<boolean>(false);
  
  const fileInputRef                          = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState<boolean>(false);
  const [showRemoveAvatarConfirm, setShowRemoveAvatarConfirm] = useState<boolean>(false);

  // Preferences state
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
    if (user) {
      queueMicrotask(() => {
        setProfile({ name: user.name, email: user.email });
        if (user.projectAddPrivacy) {
          setPrivacy(user.projectAddPrivacy);
        }
      });
    }
  }, [user]);

  const fetchInvitations = useCallback(() => {
    setLoadingInvites(true);
    projectsApi.getInvitations()
      .then((res) => {
        if (res.success) setInvitations(res.invitations);
      })
      .catch(console.error)
      .finally(() => setLoadingInvites(false));
  }, []);

  useEffect(() => {
    let active = true;
    if (user && tab === 'privacy') {
      projectsApi.getInvitations()
        .then((res) => {
          if (active && res.success) setInvitations(res.invitations);
        })
        .catch(console.error);
    }
    return () => {
      active = false;
    };
  }, [user, tab]);

  const handleAvatarSelect = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast('Please select an image file (PNG, JPG, WebP, etc.)', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast('Image file size must be less than 5MB', 'error');
      return;
    }

    setUploadingAvatar(true);
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await authApi.uploadAvatar(base64Data);
        if (res.success) {
          setUser(res.user);
          toast(res.isCloudinary ? '☁️ Avatar uploaded to Cloudinary!' : 'Avatar updated successfully', 'success');
        }
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Failed to upload avatar', 'error');
      } finally {
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast('Failed to read image file', 'error');
      setUploadingAvatar(false);
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setShowRemoveAvatarConfirm(true);
  };

  const confirmRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const res = await authApi.deleteAvatar();
      if (res.success) {
        setUser(res.user);
        toast('Avatar removed successfully', 'success');
        setShowRemoveAvatarConfirm(false);
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to remove avatar', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfile = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await authApi.updateMe({ name: profile.name });
      setUser(d.user);
      toast('Profile updated successfully', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePrivacy = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSavingPrivacy(true);
    try {
      const res = await authApi.updateMe({ projectAddPrivacy: privacy });
      setUser(res.user);
      toast('Project member privacy settings updated successfully!', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update privacy settings', 'error');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleAcceptInvitation = async (invId: string) => {
    try {
      const res = await projectsApi.acceptInvitation(invId);
      toast(res.message || 'Successfully joined project! 🎉', 'success');
      setInvitations((prev) => prev.filter((i) => i._id !== invId));
      fetchInvitations();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to accept invitation', 'error');
    }
  };

  const handleDeclineInvitation = async (invId: string) => {
    try {
      await projectsApi.declineInvitation(invId);
      toast('Invitation declined', 'success');
      setInvitations((prev) => prev.filter((i) => i._id !== invId));
      fetchInvitations();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to decline invitation', 'error');
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
      toast('Password changed successfully', 'success');
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
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', flex: 1, background: 'var(--bg-base)', position: 'relative' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, width: '100%', padding: '40px 48px', overflow: 'auto', position: 'relative', zIndex: 1 }}>
        
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
            {(['profile', 'privacy', 'preferences', 'security'] as const).map((t) => (
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
                  {/* Glowing Cloudinary Avatar */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ 
                        width: 104, height: 104, borderRadius: '50%', 
                        background: user?.avatar ? 'transparent' : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: 40, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 600,
                        boxShadow: '0 0 35px rgba(129, 140, 248, 0.4)',
                        border: '3px solid rgba(129, 140, 248, 0.35)',
                        marginBottom: 14,
                        overflow: 'hidden',
                        position: 'relative',
                      }}>
                        {user?.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          user?.name?.[0]?.toUpperCase() ?? 'U'
                        )}

                        {uploadingAvatar && (
                          <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(0, 0, 0, 0.75)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: 4,
                          }}>
                            <Loader2 size={24} color="#818cf8" className="animate-spin" />
                            <span style={{ fontSize: 10, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>Uploading…</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleAvatarSelect}
                        disabled={uploadingAvatar}
                        title="Upload Photo"
                        style={{
                          position: 'absolute', bottom: 12, right: 0,
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                          border: '2px solid var(--bg-surface)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', cursor: 'pointer',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                        }}
                      >
                        <Camera size={15} />
                      </button>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleAvatarChange}
                      style={{ display: 'none' }}
                    />

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={handleAvatarSelect}
                        disabled={uploadingAvatar}
                        className="btn-ghost"
                        style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <Camera size={13} /> {uploadingAvatar ? 'Uploading…' : (user?.avatar ? 'Change' : 'Upload Avatar')}
                      </button>

                      {user?.avatar && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          disabled={uploadingAvatar}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 12,
                            color: '#f87171',
                            cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontFamily: 'Outfit, sans-serif',
                          }}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </div>

                    {user?.avatar && user.avatar.includes('cloudinary.com') && (
                      <span style={{
                        marginTop: 8, fontSize: 10, color: '#38bdf8',
                        background: 'rgba(56, 189, 248, 0.1)',
                        padding: '2px 8px', borderRadius: 10,
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontFamily: 'Outfit, sans-serif',
                      }}>
                        <Cloud size={10} /> Cloudinary CDN Active
                      </span>
                    )}
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

          {/* ══ PRIVACY TAB ══ */}
          {tab === 'privacy' && (
            <div className="animate-slide-up">
              {/* Privacy Setting Card */}
              <div className="glass-panel" style={{ padding: 32, marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(129, 140, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(129, 140, 248, 0.25)' }}>
                    <Shield size={18} color="var(--accent-primary)" />
                  </div>
                  <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', fontWeight: 400 }}>
                    Project Member Privacy
                  </h2>
                </div>
                <p style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
                  Configure who can add you to projects and whether additions require your review and acceptance.
                </p>

                <form onSubmit={savePrivacy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
                    {/* Option 1: Anyone */}
                    <div
                      onClick={() => setPrivacy('anyone')}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                        padding: 18,
                        borderRadius: 14,
                        background: privacy === 'anyone' ? 'rgba(129, 140, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: privacy === 'anyone' ? '1px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="radio"
                        name="privacy"
                        checked={privacy === 'anyone'}
                        onChange={() => setPrivacy('anyone')}
                        style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <Users size={16} color="var(--accent-primary)" />
                          <span style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Anyone can add you directly
                          </span>
                          <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                            Default
                          </span>
                        </div>
                        <p style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                          Any project admin can immediately add you as a project member. You become a member instantly without prior approval.
                        </p>
                      </div>
                    </div>

                    {/* Option 2: Request */}
                    <div
                      onClick={() => setPrivacy('request')}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                        padding: 18,
                        borderRadius: 14,
                        background: privacy === 'request' ? 'rgba(129, 140, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: privacy === 'request' ? '1px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="radio"
                        name="privacy"
                        checked={privacy === 'request'}
                        onChange={() => setPrivacy('request')}
                        style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <UserPlus size={16} color="var(--accent-primary)" />
                          <span style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Request for adding in project member (Requires acceptance)
                          </span>
                          <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', padding: '2px 8px', borderRadius: 10, background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                            Recommended
                          </span>
                        </div>
                        <p style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                          When an admin adds you, an invitation request is sent to you first. You are only added to the project after you review and accept the request.
                        </p>
                      </div>
                    </div>

                    {/* Option 3: Nobody */}
                    <div
                      onClick={() => setPrivacy('nobody')}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                        padding: 18,
                        borderRadius: 14,
                        background: privacy === 'nobody' ? 'rgba(248, 113, 113, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: privacy === 'nobody' ? '1px solid #f87171' : '1px solid rgba(255, 255, 255, 0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="radio"
                        name="privacy"
                        checked={privacy === 'nobody'}
                        onChange={() => setPrivacy('nobody')}
                        style={{ marginTop: 4, width: 18, height: 18, accentColor: '#f87171', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <ShieldAlert size={16} color="#f87171" />
                          <span style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Nobody can add you as project member
                          </span>
                          <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', padding: '2px 8px', borderRadius: 10, background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                            Strict
                          </span>
                        </div>
                        <p style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                          Completely blocks everyone from adding you to any project. Admins who try to add you will be notified that your privacy settings do not permit it.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingPrivacy}
                    style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <Save size={16} /> {savingPrivacy ? 'Saving Privacy Setting…' : 'Save Privacy Setting'}
                  </button>
                </form>
              </div>

              {/* Pending Invitations Section */}
              <div className="glass-panel" style={{ padding: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255, 255, 255, 0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <Clock size={18} color="var(--accent-secondary)" />
                    </div>
                    <div>
                      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', fontWeight: 400 }}>
                        Pending Project Invitations
                      </h2>
                    </div>
                  </div>
                  {invitations.length > 0 && (
                    <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', padding: '3px 10px', borderRadius: 12, background: 'rgba(129, 140, 248, 0.15)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      {invitations.length} Pending
                    </span>
                  )}
                </div>

                {loadingInvites ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: 14 }}>
                    Loading invitations…
                  </div>
                ) : invitations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 16px', background: 'rgba(255, 255, 255, 0.01)', borderRadius: 12, border: '1px dashed var(--bg-border)' }}>
                    <CheckCircle2 size={32} color="var(--accent-primary)" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', marginBottom: 6 }}>
                      No Pending Invitations
                    </p>
                    <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, color: 'var(--text-muted)' }}>
                      When a team admin requests to add you to their project, invitations will appear here for you to accept or decline.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {invitations.map((inv) => (
                      <div
                        key={inv._id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px 20px',
                          borderRadius: 12,
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          flexWrap: 'wrap',
                          gap: 16,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: inv.project?.color || 'var(--accent-primary)', boxShadow: `0 0 10px ${inv.project?.color || 'var(--accent-primary)'}` }} />
                          <div>
                            <div style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {inv.project?.name || 'Project'}
                            </div>
                            <div style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', marginTop: 2 }}>
                              Invited by <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{inv.invitedBy?.name || 'Admin'}</span> as <span className="badge badge-progress" style={{ fontSize: 10, padding: '1px 6px' }}>{inv.role}</span> • {new Date(inv.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => handleAcceptInvitation(inv._id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 16px',
                              fontSize: 13,
                              background: 'rgba(74, 222, 128, 0.15)',
                              color: '#4ade80',
                              border: '1px solid rgba(74, 222, 128, 0.3)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              fontWeight: 600,
                              transition: 'all 0.2s',
                            }}
                          >
                            <Check size={14} /> Accept & Join
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclineInvitation(inv._id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 14px',
                              fontSize: 13,
                              background: 'rgba(255, 255, 255, 0.04)',
                              color: 'var(--text-muted)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            <X size={14} /> Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                      <input type="checkbox" checked={prefs.darkMode} onChange={() => {
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

      {/* ══ Remove Avatar Confirmation Card ══ */}
      <ConfirmModal
        isOpen={showRemoveAvatarConfirm}
        title="Remove Profile Avatar"
        confirmText="Remove Avatar"
        variant="danger"
        iconType="trash"
        isLoading={uploadingAvatar}
        onClose={() => setShowRemoveAvatarConfirm(false)}
        onConfirm={confirmRemoveAvatar}
        message={
          <>
            Are you sure you want to remove your custom profile avatar? Your display initials will be shown across the workspace instead.
          </>
        }
      />
    </div>
  );
}
