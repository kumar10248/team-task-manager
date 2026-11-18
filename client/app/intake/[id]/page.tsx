'use client';
import { useEffect, useState, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { intakeApi } from '@/lib/api';
import type { TicketCategory, TicketPriority } from '@/lib/api';
import {
  Inbox, Send, CheckCircle2, AlertCircle, ArrowLeft,
  LifeBuoy, Sparkles, Building, Mail, User, Flag, MessageSquare
} from 'lucide-react';
import Link from 'next/link';

export default function PublicIntakePage() {
  const { id } = useParams<{ id: string }>();

  const [projectInfo, setProjectInfo] = useState<{
    _id: string;
    name: string;
    description?: string;
    color?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form State
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [company, setCompany] = useState('');
  const [category, setCategory] = useState<TicketCategory>('feature_request');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<{ _id: string; title: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    intakeApi
      .getPublicInfo(id)
      .then((res) => {
        if (res.success && res.project) {
          setProjectInfo(res.project);
        } else {
          setLoadError('Project not found or intake portal is inactive.');
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to connect to intake portal.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim() || !description.trim() || !clientName.trim() || !clientEmail.trim()) {
      setSubmitError('Please complete all required fields.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await intakeApi.submitPublic(id, {
        title: title.trim(),
        description: description.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        company: company.trim() || undefined,
        category,
        priority,
      });

      if (res.success && res.ticket) {
        setSubmittedTicket(res.ticket);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setTitle('');
    setDescription('');
    setCompany('');
    setCategory('feature_request');
    setPriority('medium');
    setSubmittedTicket(null);
    setSubmitError(null);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-base, #0a0a0f)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Outfit, sans-serif',
        color: 'var(--text-secondary, #94a3b8)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 36,
            height: 36,
            border: '3px solid rgba(129, 140, 248, 0.2)',
            borderTopColor: 'var(--accent-primary, #818cf8)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 14 }}>Connecting to client portal…</p>
        </div>
      </div>
    );
  }

  if (loadError || !projectInfo) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-base, #0a0a0f)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Outfit, sans-serif',
      }}>
        <div style={{
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 20,
          padding: '40px 28px',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <AlertCircle size={26} color="#f87171" />
          </div>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: '#fff', margin: '0 0 8px' }}>
            Portal Unavailable
          </h3>
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
            {loadError || 'This intake portal link is invalid or the project no longer exists.'}
          </p>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ padding: '10px 20px', fontSize: 13 }}>
              Return to TaskForge
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(129, 140, 248, 0.08), transparent 70%), var(--bg-base, #0a0a0f)',
      padding: '48px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: 'Outfit, sans-serif',
    }}>
      {/* Brand Header */}
      <div style={{ maxWidth: 640, width: '100%', marginBottom: 32, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 20, background: 'rgba(129, 140, 248, 0.1)', border: '1px solid rgba(129, 140, 248, 0.25)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
          <Sparkles size={13} /> TaskForge Client Intake
        </div>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 32, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
          {projectInfo.name}
        </h1>
        {projectInfo.description && (
          <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14, margin: '0 auto', maxWidth: 520, lineHeight: 1.5 }}>
            {projectInfo.description}
          </p>
        )}
      </div>

      {/* Main Container */}
      <div style={{
        maxWidth: 640,
        width: '100%',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: 20,
        padding: '36px 32px',
        boxShadow: '0 20px 50px -15px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(20px)',
      }}>
        {submittedTicket ? (
          /* Success Screen */
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(74, 222, 128, 0.12)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle2 size={34} color="#4ade80" />
            </div>

            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, color: '#fff', margin: '0 0 10px' }}>
              Request Received!
            </h3>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 24px' }}>
              Thank you, <strong>{clientName}</strong>. Your ticket has been logged into the project triage queue. Our team has been notified and will review it shortly.
            </p>

            <div style={{
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: 12,
              marginBottom: 32,
              display: 'inline-block',
              textAlign: 'left',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Reference Ticket ID
              </div>
              <div style={{ fontSize: 13, color: 'var(--accent-primary, #818cf8)', fontFamily: 'monospace', fontWeight: 600 }}>
                #{submittedTicket._id}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleReset}
                className="btn-primary"
                style={{ padding: '10px 24px', fontSize: 13 }}
              >
                Submit Another Request
              </button>
            </div>
          </div>
        ) : (
          /* Intake Form */
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 24, borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: 16 }}>
              <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: '#fff', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Inbox size={20} color="var(--accent-primary, #818cf8)" />
                Submit a Request or Bug Ticket
              </h3>
              <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 13, margin: 0 }}>
                Please provide detailed information so our team can prioritize and triage your request quickly.
              </p>
            </div>

            {submitError && (
              <div style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                fontSize: 13,
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <AlertCircle size={16} />
                <span>{submitError}</span>
              </div>
            )}

            {/* Client Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 500 }}>
                  Your Name *
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={14} color="var(--text-muted, #64748b)" style={{ position: 'absolute', left: 12, top: 13 }} />
                  <input
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 500 }}>
                  Work Email *
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} color="var(--text-muted, #64748b)" style={{ position: 'absolute', left: 12, top: 13 }} />
                  <input
                    type="email"
                    required
                    placeholder="alex@company.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 500 }}>
                Company / Organization (Optional)
              </label>
              <div style={{ position: 'relative' }}>
                <Building size={14} color="var(--text-muted, #64748b)" style={{ position: 'absolute', left: 12, top: 13 }} />
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  style={{ paddingLeft: 34 }}
                />
              </div>
            </div>

            {/* Category & Priority Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 500 }}>
                  Request Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                >
                  <option value="feature_request">💡 Feature Request</option>
                  <option value="bug_report">🐛 Bug Report</option>
                  <option value="inquiry">💬 Inquiry / Proposal</option>
                  <option value="support">🛠️ Technical Support</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 500 }}>
                  Urgency / Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                >
                  <option value="low">Low - Nice to have</option>
                  <option value="medium">Medium - Standard</option>
                  <option value="high">High - Important</option>
                  <option value="urgent">🔥 Urgent - Blocker</option>
                </select>
              </div>
            </div>

            {/* Subject */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 500 }}>
                Subject / Summary *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Inability to export analytics CSV in Safari"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 500 }}>
                Detailed Description & Expected Outcome *
              </label>
              <textarea
                required
                rows={5}
                placeholder="Please describe what happened, expected behavior, screenshots or steps to reproduce..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Submit Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                Powered by <strong>TaskForge CRM</strong>
              </span>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary"
                style={{ padding: '12px 28px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {submitting ? (
                  'Submitting…'
                ) : (
                  <>
                    <Send size={15} /> Submit Request
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
