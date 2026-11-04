'use client';

import { useEffect, useState, useMemo, FormEvent, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  meetingsApi,
  projectsApi,
  tasksApi,
  Meeting,
  Project,
  User,
  getPersonalizedMeetLink,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Model';
import {
  Video,
  Plus,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Circle,
  ExternalLink,
  Trash2,
  Copy,
  Check,
  Search,
  Sparkles,
  CheckSquare,
  Radio,
} from 'lucide-react';

function MeetingsContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number>(() => Date.now());

  // Protect route — redirect if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Filters
  const [scope, setScope] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [viewingMeeting, setViewingMeeting] = useState<Meeting | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formProject, setFormProject] = useState<string>('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formDurationMinutes, setFormDurationMinutes] = useState(30);
  const [formMeetLink, setFormMeetLink] = useState('');
  const [formAgenda, setFormAgenda] = useState<string[]>(['']);
  const [formParticipants, setFormParticipants] = useState<string[]>([]);
  const [projectMembers, setProjectMembers] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Quick task creation inside meeting modal
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskAssignee, setQuickTaskAssignee] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  // New agenda item inside viewing modal
  const [newAgendaItemTitle, setNewAgendaItemTitle] = useState('');

  // Update `now` ticker for live badge
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch meetings (only when user is authenticated)
  useEffect(() => {
    if (!user) return;
    let active = true;
    meetingsApi
      .list({ scope })
      .then((res) => {
        if (active) setMeetings(res.meetings || []);
      })
      .catch((err: unknown) => {
        console.error(err);
        toast('Failed to load meetings', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, scope, toast]);

  // Fetch projects (only when user is authenticated)
  useEffect(() => {
    if (!user) return;
    let active = true;
    projectsApi
      .list()
      .then((res) => {
        if (active) setProjects(res.projects || []);
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [user]);

  // When project changes in schedule form, load its members (or workspace teammates if general meeting)
  useEffect(() => {
    let active = true;
    if (!formProject) {
      meetingsApi
        .getTeammates()
        .then((res) => {
          if (!active) return;
          const mates = (res.teammates || []).filter(Boolean);
          setProjectMembers(mates);
          // Auto-select all teammates by default so meeting is available to everyone
          setFormParticipants(mates.map((u) => u._id));
        })
        .catch(console.error);
      return;
    }

    projectsApi
      .get(formProject)
      .then((res) => {
        if (!active) return;
        const mems = (res.members || []).map((m) => m.user).filter(Boolean);
        setProjectMembers(mems);
        // Auto-select all project members by default
        setFormParticipants(mems.map((u) => u._id));
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [formProject]);

  const generateInstantRoomUrl = (title: string) => {
    const slug = (title || 'sync')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 16);
    return `https://p2p.mirotalk.com/join?room=taskforge-${slug}-${Date.now().toString(36)}&notify=0`;
  };

  const openScheduleModal = useCallback((prefillProject?: string) => {
    const nextStart = new Date(Date.now() + 15 * 60000);
    // Align to 5-minute boundary
    nextStart.setMinutes(Math.ceil(nextStart.getMinutes() / 5) * 5, 0, 0);
    const localIso = new Date(nextStart.getTime() - nextStart.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setFormTitle('');
    setFormDescription('');
    setFormProject(prefillProject || '');
    setFormStartTime(localIso);
    setFormDurationMinutes(30);
    setFormMeetLink('');
    setFormAgenda(['Review progress and blockers', 'Plan next steps']);
    setShowScheduleModal(true);
  }, []);

  // Check URL query param ?action=new
  useEffect(() => {
    if (searchParams?.get('action') === 'new') {
      const timer = setTimeout(() => openScheduleModal(), 50);
      return () => clearTimeout(timer);
    }
  }, [searchParams, openScheduleModal]);

  const handleInstantMeeting = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const start = new Date();
      const end = new Date(start.getTime() + 45 * 60000);
      const meetLink = generateInstantRoomUrl('instant-meeting');
      const res = await meetingsApi.create({
        title: `Quick Sync (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        meetLink,
        agenda: [{ title: 'Ad-hoc discussion', completed: false }],
      });

      if (res.success) {
        toast('Instant meeting created! Joining now…', 'success');
        setMeetings((prev) => [res.meeting, ...prev]);
        const personalizedLink = getPersonalizedMeetLink(meetLink, user.name);
        window.open(personalizedLink, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      console.error(err);
      toast('Could not start instant meeting', 'error');
    }
  };

  const handleCreateMeeting = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!formTitle.trim()) {
      toast('Please enter a meeting title', 'error');
      return;
    }
    if (!formStartTime) {
      toast('Please select a start date and time', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const startDate = new Date(formStartTime);
      const endDate = new Date(startDate.getTime() + formDurationMinutes * 60000);
      const link = formMeetLink.trim() || generateInstantRoomUrl(formTitle);

      const agendaItems = formAgenda
        .map((t) => t.trim())
        .filter(Boolean)
        .map((title) => ({ title, completed: false }));

      const res = await meetingsApi.create({
        title: formTitle.trim(),
        description: formDescription.trim(),
        project: formProject || null,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        meetLink: link,
        participants: formParticipants,
        agenda: agendaItems,
      });

      if (res.success) {
        toast('Meeting scheduled successfully!', 'success');
        setMeetings((prev) => [res.meeting, ...prev]);
        setShowScheduleModal(false);
      }
    } catch (err: unknown) {
      console.error(err);
      toast('Failed to schedule meeting', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMeeting = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    try {
      await meetingsApi.delete(id);
      setMeetings((prev) => prev.filter((m) => m._id !== id));
      if (viewingMeeting?._id === id) setViewingMeeting(null);
      toast('Meeting cancelled and deleted', 'success');
    } catch (err: unknown) {
      console.error(err);
      toast('Failed to delete meeting', 'error');
    }
  };

  const copyMeetingLink = (m: Meeting, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(m.meetLink);
    setCopiedId(m._id);
    toast('Meeting link copied to clipboard!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle agenda item in viewing modal
  const toggleAgendaItem = async (index: number) => {
    if (!viewingMeeting) return;
    const updatedAgenda = [...(viewingMeeting.agenda || [])];
    updatedAgenda[index] = {
      ...updatedAgenda[index],
      completed: !updatedAgenda[index].completed,
    };

    // Optimistic update
    const updatedMeeting = { ...viewingMeeting, agenda: updatedAgenda };
    setViewingMeeting(updatedMeeting);
    setMeetings((prev) => prev.map((m) => (m._id === viewingMeeting._id ? updatedMeeting : m)));

    try {
      await meetingsApi.update(viewingMeeting._id, { agenda: updatedAgenda });
    } catch (err: unknown) {
      console.error(err);
      toast('Failed to update agenda item', 'error');
    }
  };

  // Add agenda item dynamically in viewing modal
  const addAgendaItemToViewing = async () => {
    if (!viewingMeeting || !newAgendaItemTitle.trim()) return;
    const currentAgenda = viewingMeeting.agenda || [];
    const updatedAgenda = [
      ...currentAgenda,
      { title: newAgendaItemTitle.trim(), completed: false },
    ];
    setNewAgendaItemTitle('');

    const updatedMeeting = { ...viewingMeeting, agenda: updatedAgenda };
    setViewingMeeting(updatedMeeting);
    setMeetings((prev) => prev.map((m) => (m._id === viewingMeeting._id ? updatedMeeting : m)));

    try {
      await meetingsApi.update(viewingMeeting._id, { agenda: updatedAgenda });
      toast('Agenda item added', 'success');
    } catch (err: unknown) {
      console.error(err);
      toast('Failed to add agenda item', 'error');
    }
  };

  // Create a project task directly from meeting action items
  const handleCreateTaskFromMeeting = async (e: FormEvent) => {
    e.preventDefault();
    if (!viewingMeeting?.project?._id) {
      toast('This meeting is not linked to a project. Cannot create task.', 'error');
      return;
    }
    if (!quickTaskTitle.trim()) {
      toast('Please enter an action item / task title', 'error');
      return;
    }

    try {
      setCreatingTask(true);
      await tasksApi.create(viewingMeeting.project._id, {
        title: quickTaskTitle.trim(),
        description: `Action item from meeting "${viewingMeeting.title}" on ${new Date(viewingMeeting.startTime).toLocaleDateString()}`,
        assignedTo: quickTaskAssignee || undefined,
        priority: 'high',
      });
      toast(`Task "${quickTaskTitle.trim()}" created in project!`, 'success');
      setQuickTaskTitle('');
      setQuickTaskAssignee('');
    } catch (err: unknown) {
      console.error(err);
      toast('Failed to create task from meeting', 'error');
    } finally {
      setCreatingTask(false);
    }
  };

  // Update meeting status (e.g. mark completed)
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await meetingsApi.update(id, { status: newStatus });
      setMeetings((prev) => prev.map((m) => (m._id === id ? res.meeting : m)));
      if (viewingMeeting?._id === id) setViewingMeeting(res.meeting);
      toast(`Meeting marked as ${newStatus}`, 'success');
    } catch (err: unknown) {
      console.error(err);
      toast('Failed to update meeting status', 'error');
    }
  };

  // Filtered list
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      // Project filter
      if (selectedProjectId !== 'all') {
        if (!m.project || m.project._id !== selectedProjectId) return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = m.title.toLowerCase().includes(q);
        const matchesDesc = (m.description || '').toLowerCase().includes(q);
        const matchesProject = (m.project?.name || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesProject) return false;
      }
      return true;
    });
  }, [meetings, selectedProjectId, searchQuery]);

  // Find live / starting soon meeting
  const activeHeroMeeting = useMemo(() => {
    return meetings.find((m) => {
      if (m.status === 'cancelled' || m.status === 'completed') return false;
      const start = new Date(m.startTime).getTime();
      const end = new Date(m.endTime).getTime();
      const isOngoing = now >= start && now <= end;
      const isStartingSoon = start > now && start - now <= 15 * 60000;
      return isOngoing || isStartingSoon;
    });
  }, [meetings, now]);

  if (authLoading || (!user && loading)) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-canvas)' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '40px 48px' }}>
          <div className="glass-panel" style={{ height: 260, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-canvas)' }}>
      <Sidebar />

      <main style={{ flex: 1, padding: '40px 48px', overflowY: 'auto' }}>
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                borderRadius: 20,
                background: 'rgba(129, 140, 248, 0.1)',
                border: '1px solid rgba(129, 140, 248, 0.2)',
                color: 'var(--accent-primary)',
                fontSize: 12,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 500,
                marginBottom: 10,
              }}
            >
              <Video size={13} />
              COLLABORATION & SYNC
            </div>
            <h1
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 36,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Meetings & Video Calls
            </h1>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 14,
                fontFamily: 'Outfit, sans-serif',
                marginTop: 6,
              }}
            >
              Schedule video rooms, manage live agendas, and turn action items into project tasks.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleInstantMeeting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 18px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 10,
                color: 'var(--text-primary)',
                fontFamily: 'Outfit, sans-serif',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              }}
            >
              <Sparkles size={16} color="#fbbf24" />
              Instant Meet
            </button>

            <button
              onClick={() => openScheduleModal()}
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 22px',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              Schedule Meeting
            </button>
          </div>
        </div>

        {/* ── Live / Upcoming Hero Banner ── */}
        {activeHeroMeeting && (
          <div
            style={{
              marginBottom: 32,
              padding: '24px 28px',
              borderRadius: 16,
              background:
                'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(129, 140, 248, 0.08) 100%)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              boxShadow: '0 10px 40px -10px rgba(34, 197, 94, 0.15)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 20,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -40,
                right: -40,
                width: 140,
                height: 140,
                background: '#22c55e',
                filter: 'blur(70px)',
                opacity: 0.15,
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 10px',
                    borderRadius: 12,
                    background: '#22c55e20',
                    border: '1px solid #22c55e50',
                    color: '#4ade80',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  <Radio size={12} className="animate-pulse" />
                  {activeHeroMeeting.status === 'ongoing' ? 'Meeting Live Now' : 'Starts In <15 Mins'}
                </span>
                {activeHeroMeeting.project && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: activeHeroMeeting.project.color || 'var(--accent-primary)',
                      }}
                    />
                    {activeHeroMeeting.project.name}
                  </span>
                )}
              </div>

              <h2
                style={{
                  fontFamily: 'Fraunces, serif',
                  fontSize: 22,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  margin: '0 0 6px 0',
                }}
              >
                {activeHeroMeeting.title}
              </h2>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  fontFamily: 'Outfit, sans-serif',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} />
                  <span>
                    {new Date(activeHeroMeeting.startTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    –{' '}
                    {new Date(activeHeroMeeting.endTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <span>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={14} />
                  <span>{activeHeroMeeting.participants?.length || 1} participant(s)</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setViewingMeeting(activeHeroMeeting)}
                style={{
                  padding: '10px 18px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Open Agenda
              </button>

              <a
                href={getPersonalizedMeetLink(activeHeroMeeting.meetLink, user?.name)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 24px',
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: '#fff',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'Outfit, sans-serif',
                  textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)',
                  transition: 'all 0.2s',
                }}
              >
                <Video size={16} />
                Join Video Call Now
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        {/* ── Tabs & Filter Controls ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 28,
            flexWrap: 'wrap',
            gap: 16,
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            paddingBottom: 16,
          }}
        >
          {/* Scope Tabs */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(
              [
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'past', label: 'Past & Done' },
                { id: 'all', label: 'All Syncs' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setScope(t.id)}
                style={{
                  background: scope === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border:
                    scope === t.id
                      ? '1px solid rgba(255,255,255,0.12)'
                      : '1px solid transparent',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: scope === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Project & Search Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search
                size={14}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: 12, pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Search meetings…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 14px 8px 34px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontFamily: 'Outfit, sans-serif',
                  width: 200,
                  outline: 'none',
                }}
              />
            </div>

            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 13,
                fontFamily: 'Outfit, sans-serif',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Meeting Cards Grid ── */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="glass-panel"
                style={{ height: 210, opacity: 0.5, animation: 'pulse 1.5s infinite' }}
              />
            ))}
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div
            style={{
              padding: '64px 20px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.01)',
              border: '1px dashed rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(129, 140, 248, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Video size={24} color="var(--accent-primary)" />
            </div>
            <h3
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: 8,
              }}
            >
              No {scope === 'upcoming' ? 'upcoming' : ''} meetings found
            </h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 14,
                fontFamily: 'Outfit, sans-serif',
                maxWidth: 400,
                margin: '0 auto 24px',
              }}
            >
              Get your team together for a sprint review, daily standup, or design discussion.
            </p>
            <button
              onClick={() => openScheduleModal()}
              className="btn-primary"
              style={{ padding: '10px 22px', fontSize: 13 }}
            >
              Schedule First Meeting
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 20,
            }}
          >
            {filteredMeetings.map((m) => {
              const start = new Date(m.startTime);
              const end = new Date(m.endTime);
              const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
              const completedAgenda = (m.agenda || []).filter((a) => a.completed).length;
              const totalAgenda = m.agenda?.length || 0;
              const isHost = user?._id === m.createdBy?._id;

              const statusColor =
                m.status === 'ongoing'
                  ? '#22c55e'
                  : m.status === 'completed'
                  ? 'var(--text-muted)'
                  : m.status === 'cancelled'
                  ? '#ef4444'
                  : '#818cf8';

              return (
                <div
                  key={m._id}
                  className="glass-panel"
                  style={{
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.25s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div>
                    {/* Top Row: Project badge & Status */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      {m.project ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 500,
                            color: 'var(--text-secondary)',
                            background: 'rgba(255,255,255,0.03)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: m.project.color || 'var(--accent-primary)',
                            }}
                          />
                          {m.project.name}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            background: 'rgba(255,255,255,0.02)',
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          Workspace Sync
                        </span>
                      )}

                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: statusColor,
                          background: `${statusColor}15`,
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: `1px solid ${statusColor}30`,
                        }}
                      >
                        {m.status}
                      </span>
                    </div>

                    {/* Title */}
                    <h3
                      onClick={() => setViewingMeeting(m)}
                      style={{
                        fontFamily: 'Fraunces, serif',
                        fontSize: 18,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        margin: '0 0 8px 0',
                        cursor: 'pointer',
                        lineHeight: 1.3,
                      }}
                    >
                      {m.title}
                    </h3>

                    {/* Time & Duration */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        fontFamily: 'Outfit, sans-serif',
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={13} />
                        <span>
                          {start.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            weekday: 'short',
                          })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={13} />
                        <span>
                          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (
                          {durationMin}m)
                        </span>
                      </div>
                    </div>

                    {/* Description excerpt */}
                    {m.description && (
                      <p
                        style={{
                          fontSize: 13,
                          color: 'var(--text-secondary)',
                          margin: '0 0 16px 0',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {m.description}
                      </p>
                    )}

                    {/* Agenda Progress Pill */}
                    {totalAgenda > 0 && (
                      <div
                        onClick={() => setViewingMeeting(m)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          marginBottom: 16,
                        }}
                      >
                        <CheckSquare size={13} color="var(--accent-primary)" />
                        <span>
                          {completedAgenda}/{totalAgenda} agenda items completed
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Attendees & Action buttons */}
                  <div
                    style={{
                      paddingTop: 14,
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                    }}
                  >
                    {/* Attendees avatars */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {(m.participants || []).slice(0, 4).map((p, idx) => (
                        <div
                          key={p._id || idx}
                          title={p.name}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background:
                              'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 600,
                            marginLeft: idx > 0 ? -6 : 0,
                            border: '2px solid #0f111a',
                          }}
                        >
                          {p.name?.[0]?.toUpperCase()}
                        </div>
                      ))}
                      {(m.participants?.length || 0) > 4 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                          +{(m.participants?.length || 0) - 4}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={(e) => copyMeetingLink(m, e)}
                        title="Copy meeting link"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedId === m._id ? '#4ade80' : 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 6,
                          borderRadius: 6,
                        }}
                      >
                        {copiedId === m._id ? <Check size={14} /> : <Copy size={14} />}
                      </button>

                      {isHost && (
                        <button
                          onClick={(e) => handleDeleteMeeting(m._id, e)}
                          title="Delete meeting"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: 6,
                            borderRadius: 6,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      <a
                        href={getPersonalizedMeetLink(m.meetLink, user?.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          background:
                            m.status === 'ongoing'
                              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                              : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                          borderRadius: 8,
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 500,
                          textDecoration: 'none',
                          boxShadow:
                            m.status === 'ongoing'
                              ? '0 0 15px rgba(34, 197, 94, 0.4)'
                              : '0 0 12px var(--accent-glow)',
                        }}
                      >
                        <Video size={13} />
                        Join
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ══ Schedule Meeting Modal ══ */}
      {showScheduleModal && (
        <Modal
          title="Schedule Video Meeting"
          onClose={() => setShowScheduleModal(false)}
          width={540}
        >
          <form onSubmit={handleCreateMeeting}>
            {/* Title */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  letterSpacing: '0.06em',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  fontWeight: 500,
                }}
              >
                Meeting Topic / Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sprint Kickoff & Roadmap Review"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            {/* Project Picker */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  letterSpacing: '0.06em',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  fontWeight: 500,
                }}
              >
                Linked Project (Optional)
              </label>
              <select
                value={formProject}
                onChange={(e) => setFormProject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'Outfit, sans-serif',
                }}
              >
                <option value="">None (Workspace General Meeting)</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date/Time & Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14, marginBottom: 18 }}>
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    fontWeight: 500,
                  }}
                >
                  <Calendar size={13} color="var(--accent-primary)" />
                  Start Date & Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  style={{ colorScheme: 'dark', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    fontWeight: 500,
                  }}
                >
                  <Clock size={13} color="var(--accent-primary)" />
                  Duration
                </label>
                <select
                  value={formDurationMinutes}
                  onChange={(e) => setFormDurationMinutes(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  <option value={15}>15 mins</option>
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                </select>
              </div>
            </div>

            {/* Video Call Link */}
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <label
                  style={{
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                  }}
                >
                  Video Call Link
                </label>
                <button
                  type="button"
                  onClick={() => setFormMeetLink(generateInstantRoomUrl(formTitle))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Sparkles size={12} /> Auto-generate room (No login required)
                </button>
              </div>
              <input
                type="url"
                placeholder="Leave blank for instant WebRTC room (no login) or paste Google Meet link"
                value={formMeetLink}
                onChange={(e) => setFormMeetLink(e.target.value)}
              />
            </div>

            {/* Agenda Topics */}
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  letterSpacing: '0.06em',
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  fontWeight: 500,
                }}
              >
                Agenda Topics
              </label>
              {formAgenda.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder={`Topic #${idx + 1}`}
                    value={item}
                    onChange={(e) => {
                      const updated = [...formAgenda];
                      updated[idx] = e.target.value;
                      setFormAgenda(updated);
                    }}
                  />
                  {formAgenda.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormAgenda(formAgenda.filter((_, i) => i !== idx))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 8,
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFormAgenda([...formAgenda, ''])}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                  marginTop: 4,
                }}
              >
                + Add another topic
              </button>
            </div>

            {/* Participants Picker */}
            {projectMembers.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontFamily: 'Outfit, sans-serif',
                      letterSpacing: '0.06em',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      fontWeight: 500,
                    }}
                  >
                    {formProject ? 'Project Teammates (Attendees)' : 'Invite Workspace Teammates'}
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {formParticipants.length} selected
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    maxHeight: 120,
                    overflowY: 'auto',
                    padding: 8,
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {projectMembers.map((m) => {
                    const isSelected = formParticipants.includes(m._id);
                    return (
                      <button
                        type="button"
                        key={m._id}
                        onClick={() => {
                          if (isSelected) {
                            setFormParticipants(formParticipants.filter((id) => id !== m._id));
                          } else {
                            setFormParticipants([...formParticipants, m._id]);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          background: isSelected
                            ? 'rgba(129, 140, 248, 0.2)'
                            : 'rgba(255, 255, 255, 0.05)',
                          border: isSelected
                            ? '1px solid var(--accent-primary)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? <Check size={12} color="var(--accent-primary)" /> : null}
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 28 }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowScheduleModal(false)}
                style={{ padding: '10px 18px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ padding: '10px 24px' }}
              >
                {submitting ? 'Scheduling…' : 'Schedule Meeting'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ Viewing Meeting Details & Live Agenda Modal ══ */}
      {viewingMeeting && (
        <Modal
          title={viewingMeeting.title}
          onClose={() => setViewingMeeting(null)}
          width={640}
        >
          <div>
            {/* Meta bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 16,
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                marginBottom: 20,
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  {viewingMeeting.project && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: viewingMeeting.project.color || 'var(--accent-primary)',
                        }}
                      />
                      {viewingMeeting.project.name}
                    </span>
                  )}

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color:
                        viewingMeeting.status === 'ongoing'
                          ? '#22c55e'
                          : viewingMeeting.status === 'completed'
                          ? 'var(--text-muted)'
                          : '#818cf8',
                    }}
                  >
                    ● {viewingMeeting.status}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span>
                    {new Date(viewingMeeting.startTime).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>•</span>
                  <span>Host: {viewingMeeting.createdBy?.name || 'Organizer'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => copyMeetingLink(viewingMeeting)}
                  className="btn-ghost"
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Copy size={13} />
                  Copy Link
                </button>

                <a
                  href={getPersonalizedMeetLink(viewingMeeting.meetLink, user?.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    textDecoration: 'none',
                  }}
                >
                  <Video size={14} />
                  Join Call
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {/* Description */}
            {viewingMeeting.description && (
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  marginBottom: 24,
                }}
              >
                {viewingMeeting.description}
              </p>
            )}

            {/* Live Agenda Checklist */}
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Meeting Agenda & Discussion Topics
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Click to check off discussed items
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(viewingMeeting.agenda || []).map((item, idx) => (
                  <div
                    key={item._id || idx}
                    onClick={() => toggleAgendaItem(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: item.completed
                        ? 'rgba(34, 197, 94, 0.05)'
                        : 'rgba(255, 255, 255, 0.02)',
                      border: item.completed
                        ? '1px solid rgba(34, 197, 94, 0.2)'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {item.completed ? (
                      <CheckCircle2 size={16} color="#4ade80" />
                    ) : (
                      <Circle size={16} color="var(--text-muted)" />
                    )}
                    <span
                      style={{
                        fontSize: 14,
                        color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: item.completed ? 'line-through' : 'none',
                        fontFamily: 'Outfit, sans-serif',
                        flex: 1,
                      }}
                    >
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>

              {/* Add Topic Inline */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  type="text"
                  placeholder="Add a new agenda topic…"
                  value={newAgendaItemTitle}
                  onChange={(e) => setNewAgendaItemTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAgendaItemToViewing();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 13,
                    background: 'rgba(255,255,255,0.02)',
                  }}
                />
                <button
                  type="button"
                  onClick={addAgendaItemToViewing}
                  className="btn-ghost"
                  style={{ padding: '8px 14px', fontSize: 13 }}
                >
                  Add Topic
                </button>
              </div>
            </div>

            {/* Quick Action Item -> Project Task Converter */}
            {viewingMeeting.project?._id && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(129, 140, 248, 0.04)',
                  border: '1px solid rgba(129, 140, 248, 0.15)',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Sparkles size={14} color="var(--accent-primary)" />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      fontFamily: 'Outfit, sans-serif',
                    }}
                  >
                    Add Action Item to {viewingMeeting.project.name}
                  </span>
                </div>
                <form
                  onSubmit={handleCreateTaskFromMeeting}
                  style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                >
                  <input
                    type="text"
                    placeholder="e.g. Kumar to update auth cookies by tomorrow"
                    value={quickTaskTitle}
                    onChange={(e) => setQuickTaskTitle(e.target.value)}
                    style={{ flex: 1, minWidth: 200, padding: '8px 12px', fontSize: 13 }}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={creatingTask}
                    style={{ padding: '8px 16px', fontSize: 13 }}
                  >
                    {creatingTask ? 'Adding…' : '+ Create Task'}
                  </button>
                </form>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 16,
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                {viewingMeeting.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(viewingMeeting._id, 'completed')}
                    style={{
                      padding: '7px 12px',
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Mark as Completed
                  </button>
                )}
                {viewingMeeting.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(viewingMeeting._id, 'cancelled')}
                    style={{
                      padding: '7px 12px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel Meeting
                  </button>
                )}
              </div>

              <button
                type="button"
                className="btn-ghost"
                onClick={() => setViewingMeeting(null)}
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading meetings…</div>}>
      <MeetingsContent />
    </Suspense>
  );
}
