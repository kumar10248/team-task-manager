'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Bell, AtSign, CheckCircle2, MessageSquare, Plus, UserPlus, Check, UserMinus, UserCheck } from 'lucide-react';
import { notificationsApi, projectsApi, Notification } from '../lib/api';
import { useToast } from './Toast';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [handledInvites, setHandledInvites] = useState<Record<string, 'accepted' | 'declined'>>({});

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      let active = true;
      queueMicrotask(() => {
        if (active) setLoading(true);
      });
      notificationsApi.list()
        .then(res => {
          if (active && res.success) setNotifications(res.notifications);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
        document.body.style.overflow = 'auto';
      };
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await notificationsApi.markAsRead([n._id]);
        setNotifications(prev => prev.map(notif => notif._id === n._id ? { ...notif, isRead: true } : notif));
      } catch {}
    }
    const pid = typeof n.project === 'object' && n.project ? n.project._id : (typeof n.project === 'string' ? n.project : null);
    if (pid) {
      onClose();
      router.push(`/projects/${pid}`);
    }
  };

  const handleAcceptInvite = async (invitationId: string, notifId: string) => {
    try {
      const res = await projectsApi.acceptInvitation(invitationId);
      toast(res.message || 'Invitation accepted! You are now a member.', 'success');
      setHandledInvites(prev => ({ ...prev, [invitationId]: 'accepted' }));
      setNotifications(prev => prev.map(n => {
        const thisInvId = typeof n.invitation === 'object' && n.invitation ? n.invitation._id : n.invitation;
        if (n._id === notifId || thisInvId === invitationId) {
          return {
            ...n,
            isRead: true,
            isJoined: true,
            invitationStatus: 'accepted',
            text: n.text ? n.text.replace(/\s*Please accept or decline the invitation\.?/gi, '').trim() : n.text,
          };
        }
        return n;
      }));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to accept invitation', 'error');
    }
  };

  const handleDeclineInvite = async (invitationId: string, notifId: string) => {
    try {
      await projectsApi.declineInvitation(invitationId);
      toast('Invitation declined', 'success');
      setHandledInvites(prev => ({ ...prev, [invitationId]: 'declined' }));
      setNotifications(prev => prev.map(n => {
        const thisInvId = typeof n.invitation === 'object' && n.invitation ? n.invitation._id : n.invitation;
        if (n._id === notifId || thisInvId === invitationId) {
          return { ...n, isRead: true, isJoined: false, invitationStatus: 'declined' };
        }
        return n;
      }));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to decline invitation', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="animate-fade-in"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 100 }}
        onClick={onClose}
      />
      
      {/* Sliding Panel */}
      <div 
        style={{ 
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '100%', 
          background: 'rgba(10, 10, 15, 0.85)', backdropFilter: 'blur(40px)', borderLeft: '1px solid rgba(255,255,255,0.05)', 
          zIndex: 101, display: 'flex', flexDirection: 'column',
          boxShadow: '-20px 0 40px rgba(0,0,0,0.5)',
          animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        
        {/* Header */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(129, 140, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={16} color="var(--accent-primary)" />
            </div>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text-primary)', fontWeight: 500 }}>Activity Feed</h2>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: '0 8px' }}>
            <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Recent</span>
            {notifications.some(n => !n.isRead) && (
              <button 
                onClick={handleMarkAllRead}
                style={{ background: 'none', border: 'none', fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--accent-primary)', cursor: 'pointer' }}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 14 }}>You&apos;re all caught up!</div>
            ) : notifications.map((n) => {
              const userName = n.sender?.name || 'System';
              let Icon = Bell;
              let color = 'var(--text-muted)';
              if (n.type === 'mention') { Icon = AtSign; color = 'var(--accent-primary)'; }
              if (n.type === 'assignment') { Icon = Plus; color = 'var(--amber)'; }
              if (n.type === 'status') { Icon = CheckCircle2; color = '#4ade80'; }
              if (n.type === 'comment') { Icon = MessageSquare; color = 'var(--text-muted)'; }
              if (n.type === 'invitation') { Icon = UserPlus; color = '#c084fc'; }
              if (n.type === 'system') {
                if (n.text.includes('removed')) {
                  Icon = UserMinus;
                  color = '#f87171';
                } else if (n.text.includes('joined') || n.text.includes('accepted') || n.text.includes('added')) {
                  Icon = UserCheck;
                  color = '#4ade80';
                } else {
                  Icon = Bell;
                  color = 'var(--accent-primary)';
                }
              }

              const invId = typeof n.invitation === 'object' && n.invitation ? n.invitation._id : (typeof n.invitation === 'string' ? n.invitation : null);

              const isJoined = Boolean(
                n.isJoined ||
                (invId && handledInvites[invId] === 'accepted') ||
                n.invitationStatus === 'accepted' ||
                (typeof n.invitation === 'object' && n.invitation?.status === 'accepted')
              );

              const isDeclined = Boolean(
                (!isJoined && (invId && handledInvites[invId] === 'declined')) ||
                n.invitationStatus === 'declined' ||
                (typeof n.invitation === 'object' && n.invitation?.status === 'declined')
              );

              const isExpired = Boolean(
                !isJoined && !isDeclined && (n.invitationStatus === 'expired' || (!invId && !n.isJoined))
              );

              return (
                <div 
                  key={n._id} 
                  onClick={() => handleNotificationClick(n)}
                  style={{ 
                    display: 'flex', gap: 16, padding: 16, borderRadius: 16, cursor: 'pointer', transition: 'all 0.2s',
                    background: !n.isRead ? 'rgba(255,255,255,0.03)' : 'transparent',
                    border: !n.isRead ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = !n.isRead ? 'rgba(255,255,255,0.03)' : 'transparent'; }}
                >
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 500, overflow: 'hidden' }}>
                      {n.sender?.avatar ? (
                        <img
                          src={n.sender.avatar}
                          alt={userName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        n.sender?.name?.[0]?.toUpperCase() || 'S'
                      )}
                    </div>
                    <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0a0a0f' }}>
                      <Icon size={10} color={color} />
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: !n.isRead ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{userName}</span>{' '}
                      {isJoined && n.text ? n.text.replace(/\s*Please accept or decline the invitation\.?/gi, '').trim() : n.text}
                    </div>

                    {n.type === 'invitation' && (
                      <div style={{ marginTop: 10 }}>
                        {isJoined ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: 'Outfit, sans-serif',
                              color: '#4ade80',
                              background: 'rgba(74, 222, 128, 0.12)',
                              border: '1px solid rgba(74, 222, 128, 0.3)',
                            }}
                          >
                            <Check size={13} strokeWidth={2.5} /> Joined
                          </span>
                        ) : isDeclined ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontFamily: 'Outfit, sans-serif',
                              color: 'var(--text-muted)',
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            <X size={12} /> Invitation declined
                          </span>
                        ) : isExpired ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontFamily: 'Outfit, sans-serif',
                              color: 'var(--text-muted)',
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            Invitation no longer active
                          </span>
                        ) : invId ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAcceptInvite(invId, n._id);
                              }}
                              style={{
                                padding: '5px 14px',
                                fontSize: 12,
                                background: 'rgba(74, 222, 128, 0.15)',
                                color: '#4ade80',
                                border: '1px solid rgba(74, 222, 128, 0.3)',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                transition: 'all 0.2s',
                              }}
                            >
                              <Check size={13} strokeWidth={2.5} /> Accept &amp; Join
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeclineInvite(invId, n._id);
                              }}
                              style={{
                                padding: '5px 12px',
                                fontSize: 12,
                                background: 'rgba(255, 255, 255, 0.04)',
                                color: 'var(--text-muted)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 6,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                transition: 'all 0.2s',
                              }}
                            >
                              <X size={13} /> Decline
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {new Date(n.createdAt).toLocaleDateString()}
                      {!n.isRead && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)', boxShadow: '0 0 10px var(--accent-primary)' }} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: 24, borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
          <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}>
            View Notification Settings
          </button>
        </div>
      </div>
    </>
  );
}
