'use client';
import React, { useState } from 'react';
import { useTimer, formatStopwatch } from '@/lib/timer-context';
import { Clock, Square, X, ChevronRight, Check } from 'lucide-react';
import Link from 'next/link';
import ConfirmModal from '@/components/ConfirmModal';

export default function ActiveTimerWidget() {
  const { activeTimer, elapsedSeconds, stopAndLog, cancelTimer } = useTimer();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [customDesc, setCustomDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!activeTimer) return null;

  const currentMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

  const handleStopAndLogDirect = async () => {
    setSubmitting(true);
    await stopAndLog(undefined, customDesc.trim() || undefined);
    setSubmitting(false);
    setShowLogModal(false);
    setCustomDesc('');
  };

  return (
    <>
      <div
        className="active-timer-pill animate-fade-in"
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 16px 40px -4px rgba(0, 0, 0, 0.6), 0 0 24px -2px rgba(56, 189, 248, 0.3)',
          borderRadius: 16,
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          maxWidth: '90vw',
        }}
      >
        {/* Pulsing indicator */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 10px #ef4444',
            }}
          />
          <span
            style={{
              position: 'absolute',
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '2px solid #ef4444',
              opacity: 0.6,
              animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
        </div>

        {/* Task Title & Project */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 600,
                color: '#38bdf8',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Tracking Time
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 500,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 200,
            }}
            title={activeTimer.taskTitle}
          >
            {activeTimer.taskTitle}
          </div>
        </div>

        {/* Stopwatch display */}
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 15,
            fontWeight: 700,
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.1)',
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid rgba(56, 189, 248, 0.2)',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          {formatStopwatch(elapsedSeconds)}
        </div>

        {/* Stop & Log Action Button */}
        <button
          type="button"
          disabled={submitting}
          onClick={handleStopAndLogDirect}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: 'none',
            color: '#fff',
            fontSize: 12,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
          title="Stop timer and log elapsed time to task"
        >
          <Square size={11} fill="#fff" />
          <span>Stop & Log</span>
        </button>

        {/* Discard button */}
        <button
          type="button"
          onClick={() => setShowDiscardConfirm(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          title="Discard timer"
        >
          <X size={14} />
        </button>
      </div>

      {/* ══ Discard Timer Confirmation Card ══ */}
      <ConfirmModal
        isOpen={showDiscardConfirm}
        title="Discard Active Timer"
        confirmText="Discard Timer"
        variant="danger"
        iconType="trash"
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          cancelTimer();
          setShowDiscardConfirm(false);
        }}
        message={
          <>
            Are you sure you want to discard the current running timer for{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{activeTimer.taskTitle}</strong>?
            The elapsed time ({formatStopwatch(elapsedSeconds)}) will not be logged.
          </>
        }
      />
    </>
  );
}
