'use client';
import { useEffect, useState } from 'react';
import { X, Bell, AtSign, CheckCircle2, MessageSquare, Plus } from 'lucide-react';
import { notificationsApi, Notification } from '../lib/api';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Fetch notifications
      setLoading(true);
      notificationsApi.list()
        .then(res => {
          if (res.success) setNotifications(res.notifications);
        })
        .finally(() => setLoading(false));
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (e) {}
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await notificationsApi.markAsRead([n._id]);
        setNotifications(prev => prev.map(notif => notif._id === n._id ? { ...notif, isRead: true } : notif));
      } catch (e) {}
    }
    // Ideally, navigate to the task here if n.task is present
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
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 14 }}>You're all caught up!</div>
            ) : notifications.map((n) => {
              const userIcon = n.sender?.avatar || n.sender?.name?.[0]?.toUpperCase() || 'S';
              const userName = n.sender?.name || 'System';
              let Icon = Bell;
              let color = 'var(--text-muted)';
              if (n.type === 'mention') { Icon = AtSign; color = 'var(--accent-primary)'; }
              if (n.type === 'assignment') { Icon = Plus; color = 'var(--amber)'; }
              if (n.type === 'status') { Icon = CheckCircle2; color = '#4ade80'; }
              if (n.type === 'comment') { Icon = MessageSquare; color = 'var(--text-muted)'; }

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
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 500 }}>
                      {userIcon}
                    </div>
                    <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0a0a0f' }}>
                      <Icon size={10} color={color} />
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: !n.isRead ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{userName}</span> {n.text}
                    </div>
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
