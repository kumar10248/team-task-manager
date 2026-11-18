'use client';
import { useEffect, ReactNode } from 'react';
import { AlertTriangle, Trash2, UserMinus, X, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  iconType?: 'trash' | 'alert' | 'user-minus';
  isLoading?: boolean;
  width?: number;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  iconType = 'trash',
  isLoading = false,
  width = 440,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, isLoading]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const accentColor = isDanger ? '#ef4444' : (isWarning ? '#f59e0b' : 'var(--accent-primary)');
  const accentGlow = isDanger ? 'rgba(239, 68, 68, 0.25)' : (isWarning ? 'rgba(245, 158, 11, 0.25)' : 'var(--accent-glow)');
  const buttonBg = isDanger
    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
    : (isWarning
        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
        : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))');

  const IconComponent = iconType === 'user-minus'
    ? UserMinus
    : (iconType === 'alert' ? AlertTriangle : Trash2);

  return (
    <div
      onClick={() => { if (!isLoading) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 16,
        animation: 'fadeIn 0.15s ease-out forwards',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-slide-up"
        style={{
          background: 'rgba(15, 15, 22, 0.96)',
          border: `1px solid ${isDanger ? 'rgba(239, 68, 68, 0.3)' : (isWarning ? 'rgba(245, 158, 11, 0.3)' : 'var(--bg-border)')}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: width,
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px ${accentGlow}`,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Subtle top indicator line */}
        <div style={{ height: 3, background: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />

        <div style={{ padding: '24px 28px' }}>
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: isDanger ? 'rgba(239, 68, 68, 0.12)' : (isWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(129, 140, 248, 0.12)'),
                border: `1px solid ${isDanger ? 'rgba(239, 68, 68, 0.3)' : (isWarning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(129, 140, 248, 0.3)')}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconComponent size={22} color={accentColor} />
            </div>

            <div style={{ flex: 1, paddingTop: 2 }}>
              <h3
                style={{
                  fontFamily: 'Fraunces, serif',
                  fontSize: 19,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                background: 'none',
                border: 'none',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                color: 'var(--text-muted)',
                padding: 4,
                display: 'flex',
                borderRadius: 6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body message */}
          <div
            style={{
              fontSize: 14,
              fontFamily: 'Outfit, sans-serif',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              marginBottom: 26,
            }}
          >
            {message}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={isLoading}
              style={{
                padding: '9px 18px',
                fontSize: 13,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 500,
                borderRadius: 8,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 22px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'Outfit, sans-serif',
                color: '#fff',
                background: buttonBg,
                border: 'none',
                borderRadius: 8,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                boxShadow: `0 4px 14px ${accentGlow}`,
                transition: 'all 0.2s',
                opacity: isLoading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = `0 6px 20px ${accentGlow}`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 4px 14px ${accentGlow}`;
                }
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
