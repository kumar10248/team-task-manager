'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { adminApi, AdminMetrics, AdminUser, AdminProject } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import {
  Crown, Users, FolderKanban, TrendingUp, ShieldCheck,
  Search, RefreshCw, Sparkles, Clock, CheckCircle2,
  XCircle, Filter, ArrowUpRight, CheckSquare, Video
} from 'lucide-react';

export default function SuperAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'payments'>('users');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [accessDenied, setAccessDenied] = useState(false);

  // Edit Plan Modal
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'standard' | 'pro' | 'free'>('pro');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, uRes, pRes] = await Promise.all([
        adminApi.getMetrics(),
        adminApi.getUsers({ search, status: statusFilter, plan: planFilter }),
        adminApi.getProjects(),
      ]);

      if (mRes.success) setMetrics(mRes.metrics);
      if (uRes.success) setUsers(uRes.users);
      if (pRes.success) setProjects(pRes.projects);
      setAccessDenied(false);
    } catch (err: unknown) {
      console.error('Super Admin fetch error:', err);
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Access denied') || msg.includes('403') || msg.includes('privileges')) {
        setAccessDenied(true);
      } else {
        toast('Failed to load Super Admin data', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, planFilter, toast]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadData();
      }
    }
  }, [user, authLoading, router, loadData]);

  // Handle Subscription Overrides
  const handleGrantLifetime = async (u: AdminUser) => {
    if (!confirm(`Grant permanent LIFETIME PRO access to ${u.name} (${u.email})? They will never expire and never be charged.`)) {
      return;
    }
    setActionLoading(u._id);
    try {
      const res = await adminApi.updateSubscription(u._id, { action: 'grant_lifetime' });
      if (res.success) {
        toast(`👑 Lifetime Pro VIP access granted to ${u.name}!`, 'success');
        loadData();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtendTrial = async (u: AdminUser, days = 14) => {
    setActionLoading(u._id);
    try {
      const res = await adminApi.updateSubscription(u._id, { action: 'extend_trial', days });
      if (res.success) {
        toast(`Added +${days} days free trial to ${u.name}`, 'success');
        loadData();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExpireUser = async (u: AdminUser) => {
    if (!confirm(`Force expire subscription for ${u.name}? They will immediately see the Option A Paywall.`)) {
      return;
    }
    setActionLoading(u._id);
    try {
      const res = await adminApi.updateSubscription(u._id, { action: 'expire' });
      if (res.success) {
        toast(`Subscription expired for ${u.name}`, 'success');
        loadData();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApplyPlanEdit = async () => {
    if (!editingUser) return;
    setActionLoading(editingUser._id);
    try {
      const res = await adminApi.updateSubscription(editingUser._id, {
        action: 'set_plan',
        plan: selectedPlan,
      });
      if (res.success) {
        toast(`Successfully set ${editingUser.name} to ${selectedPlan.toUpperCase()} plan!`, 'success');
        setEditingUser(null);
        loadData();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update plan', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSuperAdmin = async (u: AdminUser) => {
    const nextState = !u.isSuperAdmin;
    if (!confirm(`${nextState ? 'Promote' : 'Demote'} ${u.name} ${nextState ? 'to' : 'from'} Super Admin?`)) {
      return;
    }
    setActionLoading(u._id);
    try {
      const res = await adminApi.toggleSuperAdmin(u._id, nextState);
      if (res.success) {
        toast(res.message, 'success');
        loadData();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to toggle Super Admin role', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const getSubBadge = (sub: AdminUser['subscription']) => {
    if (sub.isLifetime) {
      return (
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.4)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          👑 Lifetime VIP
        </span>
      );
    }
    if (sub.status === 'active') {
      return (
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
          Active • {sub.plan.toUpperCase()}
        </span>
      );
    }
    if (sub.status === 'trialing') {
      return (
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
          Trialing ({sub.daysRemaining}d left)
        </span>
      );
    }
    return (
      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)' }}>
        Expired
      </span>
    );
  };

  if (accessDenied) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', width: '100%', flex: 1, background: 'var(--bg-base)' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, width: '100%', padding: '60px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            maxWidth: 520,
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 20,
            padding: 36,
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Crown size={28} color="#f87171" />
            </div>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, color: 'var(--text-primary)', margin: '0 0 10px' }}>
              Super Admin Access Required
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'Outfit, sans-serif', lineHeight: 1.6, margin: '0 0 20px' }}>
              You are currently logged in as <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong>. This section is restricted to platform Super Admins.
            </p>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: 14, textAlign: 'left', marginBottom: 24, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
              <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>👑 To promote your account:</div>
              Open terminal in project root and run:<br />
              <code style={{ color: 'var(--text-primary)', background: 'rgba(0,0,0,0.4)', padding: '4px 8px', borderRadius: 4, display: 'inline-block', marginTop: 6 }}>
                cd server && npm run make-admin {user?.email}
              </code>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Back to Dashboard
              </button>
              <button
                type="button"
                onClick={() => { setAccessDenied(false); loadData(); }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry Access
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', flex: 1, background: 'var(--bg-base)' }}>
      <Sidebar />

      <main style={{ flex: 1, minWidth: 0, width: '100%', padding: '36px 44px', overflowY: 'auto' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.2))',
              border: '1px solid rgba(251, 191, 36, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(251, 191, 36, 0.3)',
            }}>
              <Crown size={22} color="#fbbf24" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                  Super Admin Control Center
                </h1>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.4)', fontWeight: 700 }}>
                  ROOT ACCESS
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', margin: '4px 0 0' }}>
                Global user directory, subscription lifecycle overrides, VIP lifetime grants, and system-wide revenue metrics.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 10,
              padding: '9px 16px',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'Outfit, sans-serif',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Global Business & System Metrics (4 Cards) */}
        {metrics && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 18,
            marginBottom: 32,
          }}>
            {/* MRR Card */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-border)',
              borderRadius: 16,
              padding: '20px 22px',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                  Estimated MRR
                </span>
                <TrendingUp size={16} color="#4ade80" />
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: '#4ade80' }}>
                ₹{metrics.estimatedMRR.toLocaleString('en-IN')}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}> / mo</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>
                {metrics.subscriptions.active} active paying subscribers ({metrics.subscriptions.activeStandard} Standard • {metrics.subscriptions.activePro} Pro)
              </div>
            </div>

            {/* Total Users Card */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-border)',
              borderRadius: 16,
              padding: '20px 22px',
              backdropFilter: 'blur(16px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                  Registered Users
                </span>
                <Users size={16} color="var(--accent-primary)" />
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                {metrics.totalUsers}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>
                {metrics.subscriptions.trialing} in trial • {metrics.subscriptions.lifetime} VIP Lifetime • {metrics.subscriptions.expired} expired
              </div>
            </div>

            {/* Platform Projects & Tasks */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-border)',
              borderRadius: 16,
              padding: '20px 22px',
              backdropFilter: 'blur(16px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                  Workspaces & Tasks
                </span>
                <FolderKanban size={16} color="#c084fc" />
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                {metrics.totalProjects}
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}> projects</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>
                {metrics.totalTasks} total tasks • {metrics.totalMeetings} scheduled meetings
              </div>
            </div>

            {/* Razorpay Gateway Status */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-border)',
              borderRadius: 16,
              padding: '20px 22px',
              backdropFilter: 'blur(16px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                  Razorpay Gateway
                </span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80' }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                Live & Connected
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, fontFamily: 'Outfit, sans-serif' }}>
                Mode: Sandbox (UPI, Cards, Netbanking active)
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'users' ? '2px solid #fbbf24' : '2px solid transparent',
              padding: '10px 18px',
              color: activeTab === 'users' ? '#fbbf24' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 14,
              fontFamily: 'Outfit, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Users size={16} /> User Directory & Subscription Overrides ({users.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'projects' ? '2px solid #fbbf24' : '2px solid transparent',
              padding: '10px 18px',
              color: activeTab === 'projects' ? '#fbbf24' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 14,
              fontFamily: 'Outfit, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <FolderKanban size={16} /> Platform Workspaces ({projects.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'payments' ? '2px solid #fbbf24' : '2px solid transparent',
              padding: '10px 18px',
              color: activeTab === 'payments' ? '#fbbf24' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: 14,
              fontFamily: 'Outfit, sans-serif',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <TrendingUp size={16} /> Razorpay Payment Audit Log
          </button>
        </div>

        {/* TAB 1: USERS DIRECTORY */}
        {activeTab === 'users' && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--bg-border)',
            borderRadius: 18,
            padding: '24px 28px',
            backdropFilter: 'blur(16px)',
          }}>
            {/* Search & Filter Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '8px 14px', width: 320 }}>
                <Search size={15} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search user by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Filter size={13} /> Filter:
                </span>
                {[
                  { id: 'all', label: 'All Users' },
                  { id: 'active', label: 'Active Paid' },
                  { id: 'trialing', label: 'Free Trial' },
                  { id: 'lifetime', label: '👑 Lifetime VIP' },
                  { id: 'expired', label: 'Expired' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    style={{
                      background: statusFilter === f.id ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: statusFilter === f.id ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                      color: statusFilter === f.id ? '#fbbf24' : 'var(--text-secondary)',
                      borderRadius: 8,
                      padding: '5px 12px',
                      fontSize: 12,
                      fontFamily: 'Outfit, sans-serif',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Users Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 14px' }}>User Details</th>
                    <th style={{ padding: '12px 14px' }}>Subscription Plan</th>
                    <th style={{ padding: '12px 14px' }}>Access Status</th>
                    <th style={{ padding: '12px 14px' }}>Workspaces</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Super Admin Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            background: u.isSuperAdmin ? 'linear-gradient(135deg, #fbbf24, #d97706)' : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#fff',
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}>
                            {u.avatar ? (
                              <img src={u.avatar} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              u.name[0]?.toUpperCase()
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</span>
                              {u.isSuperAdmin && (
                                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px 14px' }}>
                        {getSubBadge(u.subscription)}
                      </td>

                      <td style={{ padding: '14px 14px' }}>
                        {u.subscription.isLifetime ? (
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>Permanent Access</span>
                        ) : u.subscription.currentPeriodEnd ? (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ color: 'var(--text-primary)' }}>
                              {new Date(u.subscription.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <div style={{ color: u.subscription.daysRemaining > 0 ? 'var(--text-muted)' : '#f87171' }}>
                              {u.subscription.daysRemaining > 0 ? `${u.subscription.daysRemaining} days left` : 'Expired'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 14px', color: 'var(--text-secondary)' }}>
                        <div><strong>{u.ownedProjectsCount}</strong> owned</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.memberProjectsCount} joined</div>
                      </td>

                      <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {/* Grant Lifetime VIP Pro */}
                          {!u.subscription.isLifetime && (
                            <button
                              type="button"
                              onClick={() => handleGrantLifetime(u)}
                              disabled={actionLoading === u._id}
                              title="Grant Free Lifetime Pro Access"
                              style={{
                                background: 'rgba(251, 191, 36, 0.1)',
                                border: '1px solid rgba(251, 191, 36, 0.3)',
                                borderRadius: 8,
                                padding: '6px 10px',
                                color: '#fbbf24',
                                fontSize: 11,
                                fontWeight: 600,
                                fontFamily: 'Outfit, sans-serif',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Crown size={12} /> VIP Pro
                            </button>
                          )}

                          {/* +14 Days Trial */}
                          <button
                            type="button"
                            onClick={() => handleExtendTrial(u, 14)}
                            disabled={actionLoading === u._id}
                            title="Add +14 Days to Free Trial"
                            style={{
                              background: 'rgba(129, 140, 248, 0.1)',
                              border: '1px solid rgba(129, 140, 248, 0.25)',
                              borderRadius: 8,
                              padding: '6px 10px',
                              color: 'var(--accent-primary)',
                              fontSize: 11,
                              fontFamily: 'Outfit, sans-serif',
                              cursor: 'pointer',
                            }}
                          >
                            +14d
                          </button>

                          {/* Set Plan Dialog */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setSelectedPlan(u.subscription.plan === 'standard' ? 'standard' : 'pro');
                            }}
                            title="Override or change plan tier"
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: 8,
                              padding: '6px 10px',
                              color: 'var(--text-secondary)',
                              fontSize: 11,
                              fontFamily: 'Outfit, sans-serif',
                              cursor: 'pointer',
                            }}
                          >
                            Plan…
                          </button>

                          {/* Expire User */}
                          {u.subscription.status !== 'expired' && (
                            <button
                              type="button"
                              onClick={() => handleExpireUser(u)}
                              disabled={actionLoading === u._id}
                              title="Force Expire Subscription"
                              style={{
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                borderRadius: 8,
                                padding: '6px 8px',
                                color: '#f87171',
                                fontSize: 11,
                                fontFamily: 'Outfit, sans-serif',
                                cursor: 'pointer',
                              }}
                            >
                              Expire
                            </button>
                          )}

                          {/* Toggle Super Admin */}
                          <button
                            type="button"
                            onClick={() => handleToggleSuperAdmin(u)}
                            disabled={actionLoading === u._id}
                            title={u.isSuperAdmin ? 'Remove Super Admin role' : 'Grant Super Admin role'}
                            style={{
                              background: 'none',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: 8,
                              padding: '6px 8px',
                              color: u.isSuperAdmin ? '#fbbf24' : 'var(--text-muted)',
                              fontSize: 11,
                              fontFamily: 'Outfit, sans-serif',
                              cursor: 'pointer',
                            }}
                          >
                            <ShieldCheck size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PLATFORM WORKSPACES */}
        {activeTab === 'projects' && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--bg-border)',
            borderRadius: 18,
            padding: '24px 28px',
            backdropFilter: 'blur(16px)',
          }}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', margin: '0 0 16px' }}>
              All Workspaces Across Platform
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 14px' }}>Project Name</th>
                    <th style={{ padding: '12px 14px' }}>Owner / Creator</th>
                    <th style={{ padding: '12px 14px' }}>Team Members</th>
                    <th style={{ padding: '12px 14px' }}>Tasks Completed</th>
                    <th style={{ padding: '12px 14px' }}>Created Date</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const pct = p.taskStats.total > 0 ? Math.round((p.taskStats.done / p.taskStats.total) * 100) : 0;
                    return (
                      <tr key={p._id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '14px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: p.color || 'var(--accent-primary)', flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                              {p.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '14px 14px', color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#fff',
                              flexShrink: 0,
                              overflow: 'hidden',
                            }}>
                              {p.createdBy?.avatar ? (
                                <img src={p.createdBy.avatar} alt={p.createdBy.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                (p.createdBy?.name?.[0] || 'U').toUpperCase()
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500 }}>{p.createdBy?.name || 'Unknown'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.createdBy?.email}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '14px 14px', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Users size={14} color="var(--accent-primary)" />
                            <span>{p.memberCount} members</span>
                          </div>
                        </td>

                        <td style={{ padding: '14px 14px' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>
                            {p.taskStats.done} / {p.taskStats.total} done ({pct}%)
                          </div>
                          <div style={{ width: 100, height: 4, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#4ade80' }} />
                          </div>
                        </td>

                        <td style={{ padding: '14px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                          {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: TRANSACTIONS AUDIT LOG */}
        {activeTab === 'payments' && metrics && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--bg-border)',
            borderRadius: 18,
            padding: '24px 28px',
            backdropFilter: 'blur(16px)',
          }}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', margin: '0 0 16px' }}>
              Razorpay Transactions & Overrides Log
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, fontFamily: 'Outfit, sans-serif' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Plan</th>
                    <th style={{ padding: '12px 14px' }}>Amount</th>
                    <th style={{ padding: '12px 14px' }}>Payment ID</th>
                    <th style={{ padding: '12px 14px' }}>Method</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    metrics.recentPayments.map((tx, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <td style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>
                          {new Date(tx.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {tx.plan}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#4ade80' }}>
                          ₹{tx.amount.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                          {tx.paymentId || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {tx.method || 'razorpay'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80' }}>
                            Captured
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL: Override User Plan */}
        {editingUser && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--bg-border)',
              borderRadius: 20,
              padding: '28px 32px',
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}>
              <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                Change Subscription Plan
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', margin: '0 0 20px' }}>
                Set plan tier for <strong>{editingUser.name}</strong> ({editingUser.email}). This will give them 30 days active access under this plan.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {[
                  { id: 'standard', name: 'Standard Plan', price: '₹2,000 / mo', desc: '15 active projects • 25 team members' },
                  { id: 'pro', name: 'Pro Plan', price: '₹3,000 / mo', desc: 'Unlimited projects & members • VIP support' },
                ].map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id as 'standard' | 'pro')}
                    style={{
                      border: selectedPlan === p.id ? '2px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 12,
                      padding: '14px 16px',
                      background: selectedPlan === p.id ? 'rgba(129, 140, 248, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{p.name}</span>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: 13 }}>{p.price}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 8,
                    padding: '8px 16px',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                    fontFamily: 'Outfit, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyPlanEdit}
                  disabled={actionLoading !== null}
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 13,
                    fontFamily: 'Outfit, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  Apply Plan Change
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
