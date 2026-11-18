'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/Toast';
import ConfirmModal from '@/components/ConfirmModal';
import {
  Video, PhoneOff, Copy, Check, Maximize2, Minimize2,
  ShieldCheck, Share2, ArrowLeft, Loader2, User, Sparkles
} from 'lucide-react';
import Link from 'next/link';

export default function MeetingRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();

  const [inCall, setInCall] = useState(false);
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const loadCountRef = useRef(0);

  // Set default display name from auth user or query parameter
  useEffect(() => {
    const queryName = searchParams?.get('name');
    if (queryName) {
      setDisplayName(queryName);
      setInCall(true);
      return;
    }
    if (user?.name) {
      setDisplayName(user.name);
      // Auto-join if user is already authenticated
      setInCall(true);
    }
  }, [user, searchParams]);

  // Call duration timer
  useEffect(() => {
    if (!inCall || meetingEnded) return;
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [inCall, meetingEnded]);

  // Detect iframe navigation (e.g. user clicked leave inside MiroTalk)
  const handleIframeLoad = () => {
    loadCountRef.current += 1;
    if (loadCountRef.current === 1) {
      setIframeLoaded(true);
    } else if (loadCountRef.current > 1) {
      // The user clicked "Leave" or MiroTalk navigated to its rating/newcall page!
      // Immediately unmount the iframe and show TaskForge's clean Meeting Ended summary!
      setInCall(false);
      setMeetingEnded(true);
    }
  };

  const handleRejoin = () => {
    loadCountRef.current = 0;
    setIframeLoaded(false);
    setMeetingEnded(false);
    setInCall(true);
  };

  // Format call duration MM:SS or HH:MM:SS
  const formatDuration = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Fullscreen listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleCopyLink = () => {
    const url = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
    if (url) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Meeting invitation link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleLeaveMeeting = () => {
    setShowLeaveConfirm(false);
    toast('You have left the meeting', 'success');
    setInCall(false);
    setMeetingEnded(true);
  };

  // Construct MiroTalk P2P embedded URL
  // Uses process.env.NEXT_PUBLIC_MIROTALK_URL or defaults to open-source p2p.mirotalk.com
  const mirotalkUrl = useMemo(() => {
    if (!id) return '';
    const baseUrl = process.env.NEXT_PUBLIC_MIROTALK_URL || 'https://p2p.mirotalk.com';
    const cleanRoom = encodeURIComponent(id);
    const participantName = encodeURIComponent(displayName || user?.name || 'TaskForge Member');
    const participantAvatar = encodeURIComponent(user?.avatar || searchParams?.get('avatar') || '');
    return `${baseUrl}/join?room=${cleanRoom}&name=${participantName}${participantAvatar ? `&avatar=${participantAvatar}` : ''}&notify=0`;
  }, [id, displayName, user, searchParams]);

  // Loading state while checking auth
  if (authLoading && !inCall) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={32} color="var(--accent-primary, #6366f1)" />
      </div>
    );
  }

  // Meeting Ended Summary Screen (shown when user leaves call)
  if (meetingEnded) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at 50% 20%, rgba(99, 102, 241, 0.12), transparent 70%), #090a10',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'Outfit, sans-serif',
          color: '#fff',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            background: 'rgba(15, 16, 24, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(30px)',
            borderRadius: 24,
            padding: '40px 32px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
            textAlign: 'center',
          }}
        >
          {/* Logo Badge */}
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 20px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(34, 197, 94, 0.4)',
            }}
          >
            <Check size={28} color="#fff" strokeWidth={2.5} />
          </div>

          <h1
            style={{
              fontFamily: 'Fraunces, serif',
              fontSize: 26,
              fontWeight: 600,
              color: 'var(--text-primary, #fff)',
              marginBottom: 8,
            }}
          >
            You Left the Meeting
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #94a3b8)', marginBottom: 24 }}>
            Thank you for participating in this TaskForge video session.
          </p>

          {/* Stats Box */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 16,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              marginBottom: 28,
            }}
          >
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', letterSpacing: '0.05em', marginBottom: 4 }}>
                Call Duration
              </div>
              <div style={{ fontSize: 18, fontFamily: 'monospace', fontWeight: 600, color: '#a5b4fc' }}>
                {formatDuration(callDuration)}
              </div>
            </div>
            <div style={{ width: 1, height: 32, background: 'rgba(255, 255, 255, 0.08)' }} />
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', letterSpacing: '0.05em', marginBottom: 4 }}>
                Room ID
              </div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 500, color: '#e2e8f0', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {id}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={handleRejoin}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.35)',
              }}
            >
              <Video size={16} /> Rejoin Meeting
            </button>

            <button
              type="button"
              onClick={() => router.push('/meetings')}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <ArrowLeft size={16} /> Return to Meetings Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pre-Meeting Lobby (shown if guest joins and needs to specify their name)
  if (!inCall) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at 50% 20%, rgba(99, 102, 241, 0.15), transparent 70%), #090a10',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'Outfit, sans-serif',
          color: '#fff',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            background: 'rgba(15, 16, 24, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(30px)',
            borderRadius: 24,
            padding: '36px 32px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
            textAlign: 'center',
          }}
        >
          {/* Logo Badge */}
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 20px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(99, 102, 241, 0.4)',
            }}
          >
            <Video size={28} color="#fff" />
          </div>

          <h1
            style={{
              fontFamily: 'Fraunces, serif',
              fontSize: 26,
              fontWeight: 600,
              color: 'var(--text-primary, #fff)',
              marginBottom: 8,
            }}
          >
            TaskForge Video Meet
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #94a3b8)', marginBottom: 24 }}>
            Direct encrypted P2P audio &amp; video conferencing
          </p>

          {/* Room info chip */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: 13,
              color: 'var(--text-primary, #e2e8f0)',
              marginBottom: 28,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            <span>Room:</span>
            <code style={{ color: '#a5b4fc', fontFamily: 'monospace' }}>{id}</code>
          </div>

          {/* Name input */}
          <div style={{ textAlign: 'left', marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary, #cbd5e1)', marginBottom: 8 }}>
              Your Display Name
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="var(--text-muted, #64748b)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Kumar Devashish"
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && displayName.trim()) {
                    setInCall(true);
                  }
                }}
              />
            </div>
          </div>

          {/* Join Button */}
          <button
            type="button"
            onClick={() => {
              if (!displayName.trim()) {
                toast('Please enter your name to enter the meeting', 'error');
                return;
              }
              setInCall(true);
            }}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.2s',
            }}
          >
            <Video size={18} /> Join Meeting Room
          </button>

          {/* Copy link option */}
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #94a3b8)',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                transition: 'all 0.2s',
              }}
            >
              {copied ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
              {copied ? 'Link Copied!' : 'Copy Invitation Link'}
            </button>
          </div>
        </div>

        {/* Back Link */}
        <div style={{ marginTop: 24 }}>
          <Link
            href="/meetings"
            style={{
              color: 'var(--text-muted, #94a3b8)',
              fontSize: 13,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowLeft size={14} /> Back to Meetings Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Active In-Call View (Integrated Video Conference Canvas)
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        overflow: 'hidden',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          height: 56,
          background: 'rgba(13, 14, 21, 0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 10,
        }}
      >
        {/* Left Section: Branding & Room Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(99, 102, 241, 0.4)',
              }}
            >
              <Video size={16} color="#fff" />
            </div>
            <span
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 16,
                fontWeight: 600,
                color: '#fff',
                letterSpacing: '-0.02em',
              }}
            >
              TaskForge Meet
            </span>
          </div>

          <div
            style={{
              height: 18,
              width: 1,
              background: 'rgba(255, 255, 255, 0.1)',
            }}
          />

          {/* Room Badge */}
          <div
            onClick={handleCopyLink}
            title="Click to copy invitation link"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '4px 10px',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>Room:</span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#a5b4fc', fontWeight: 500 }}>
              {id}
            </span>
            {copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} color="var(--text-muted, #94a3b8)" />}
          </div>

          {/* P2P Encrypted Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              color: '#4ade80',
              background: 'rgba(74, 222, 128, 0.1)',
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid rgba(74, 222, 128, 0.2)',
            }}
          >
            <ShieldCheck size={12} />
            <span>P2P Encrypted</span>
          </div>
        </div>

        {/* Center Section: Live Call Timer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 14px',
            borderRadius: 20,
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>
            {formatDuration(callDuration)}
          </span>
        </div>

        {/* Right Section: Actions & Leave Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Copy Link Button */}
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#e2e8f0',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {copied ? <Check size={14} color="#4ade80" /> : <Share2 size={14} />}
            <span>{copied ? 'Copied!' : 'Share Invite'}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          {/* Leave Call Button */}
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              border: 'none',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)',
              transition: 'all 0.2s',
            }}
          >
            <PhoneOff size={14} /> Leave Call
          </button>
        </div>
      </header>

      {/* Main Video Conference Area */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100vh - 56px)', background: '#07080c' }}>
        {/* Loading Spinner until iframe ready */}
        {!iframeLoaded && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              background: '#07080c',
              zIndex: 5,
            }}
          >
            <Loader2 className="animate-spin" size={36} color="var(--accent-primary, #6366f1)" />
            <div style={{ fontSize: 14, color: 'var(--text-secondary, #94a3b8)' }}>
              Connecting to TaskForge P2P mesh…
            </div>
          </div>
        )}

        {/* Embedded MiroTalk P2P WebRTC Canvas */}
        {mirotalkUrl && (
          <iframe
            src={mirotalkUrl}
            title="TaskForge P2P Video Meeting"
            allow="camera; microphone; speaker-selection; display-capture; fullscreen; clipboard-read; clipboard-write; web-share; autoplay; picture-in-picture"
            onLoad={handleIframeLoad}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              background: '#07080c',
            }}
          />
        )}
      </div>

      {/* Confirm Leave Modal */}
      <ConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeaveMeeting}
        title="Leave Meeting?"
        message="Are you sure you want to leave this video meeting room? You can rejoin anytime using the room link."
        confirmText="Leave Meeting"
        cancelText="Stay in Meeting"
        variant="danger"
        iconType="alert"
      />
    </div>
  );
}
