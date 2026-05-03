'use client';
import { useEffect, useState, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { dashboardApi } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import { CheckCircle2, Clock, AlertTriangle, Layers, TrendingUp, Users, LucideIcon } from 'lucide-react';
import Link from 'next/link';

/* ================= TYPES ================= */

type TaskStatus   = 'todo' | 'in_progress' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type Role         = 'admin' | 'member' | string;

interface TaskStats {
  total: number;
  done: number;
}

interface ProjectSummary {
  _id: string;
  name: string;
  color?: string;
  myRole: Role;
  taskStats: TaskStats;
}

interface TaskUser {
  _id: string;
  name: string;
}

interface RecentTask {
  _id: string;
  title: string;
  status: TaskStatus;
  project?: { name: string } | string;
}

interface OverdueTask {
  _id: string;
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
}

interface TasksPerUser {
  userId: string;
  name: string;
  count: number;
}

interface TasksByStatus {
  todo?: number;
  in_progress?: number;
  done?: number;
}

interface DashboardData {
  totalTasks: number;
  tasksByStatus: TasksByStatus;
  overdueCount: number;
  tasksPerUser: TasksPerUser[];
  projectSummaries: ProjectSummary[];
  recentTasks: RecentTask[];
  overdueTasks: OverdueTask[];
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  color?: string;
}

/* ================= CONSTANTS ================= */

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low:    '#4ade80',
  medium: '#fbbf24',
  high:   '#fb923c',
  urgent: '#f87171',
};

/* ================= STAT CARD ================= */

function StatCard({ icon: Icon, label, value, sub, color = 'var(--amber)' }: StatCardProps): ReactElement {
  return (
    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace' }}>{sub}</div>
      )}
    </div>
  );
}

/* ================= PAGE ================= */

export default function DashboardPage(): ReactElement {
  const { user, loading: authLoading } = useAuth() as {
    user: { _id: string; name: string; email: string } | null;
    loading: boolean;
  };
  const router = useRouter();

  const [data, setData]     = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    dashboardApi
      .get()
      .then((d) => setData(d.dashboard))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
        </div>
      </div>
    );
  }

  const {
    totalTasks       = 0,
    tasksByStatus    = {},
    overdueCount     = 0,
    tasksPerUser     = [],
    projectSummaries = [],
    recentTasks      = [],
    overdueTasks     = [],
  } = data ?? {};

  const doneCount  = tasksByStatus.done ?? 0;
  const completion = totalTasks ? Math.round((doneCount / totalTasks) * 100) : 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '32px 36px', overflow: 'auto' }}>
        <div className="animate-fade-in">

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Overview
            </p>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 30, fontWeight: 600, color: 'var(--text-primary)' }}>
              Good day, {user?.name?.split(' ')[0]}
            </h1>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
            <StatCard icon={Layers}        label="Total Tasks"  value={totalTasks}                         sub={`${completion}% complete`} />
            <StatCard icon={CheckCircle2}  label="Done"         value={doneCount}                          color="#4ade80" />
            <StatCard icon={Clock}         label="In Progress"  value={tasksByStatus.in_progress ?? 0}     color="#60a5fa" />
            <StatCard icon={AlertTriangle} label="Overdue"      value={overdueCount}                       color="#f87171" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>

            {/* Projects */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)' }}>Projects</h2>
                <Link href="/projects" style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--amber)', textDecoration: 'none', letterSpacing: '0.05em' }}>
                  View all →
                </Link>
              </div>

              {projectSummaries.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'DM Mono, monospace' }}>No projects yet.</p>
              ) : (
                projectSummaries.slice(0, 5).map((p) => {
                  const total = p.taskStats.total || 1;
                  const pct   = Math.round(((p.taskStats.done ?? 0) / total) * 100);
                  return (
                    <Link key={p._id} href={`/projects/${p._id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--bg-border)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color ?? 'var(--amber)', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 3, background: 'var(--bg-border)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: p.color ?? 'var(--amber)', borderRadius: 2, transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                          {p.taskStats.done ?? 0}/{p.taskStats.total ?? 0} tasks · <span className={`badge badge-${p.myRole}`}>{p.myRole}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {/* Tasks per user */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <Users size={15} color="var(--amber)" />
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)' }}>By Member</h2>
              </div>

              {tasksPerUser.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'DM Mono, monospace' }}>No data.</p>
              ) : (
                tasksPerUser.slice(0, 6).map((u) => (
                  <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--bg-border)' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,var(--amber),#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#0d0d0f', fontWeight: 600, flexShrink: 0 }}>
                      {u.name?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.name}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>
                      {u.count}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent + Overdue */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Recent Activity */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <TrendingUp size={15} color="var(--amber)" />
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)' }}>Recent Activity</h2>
              </div>

              {recentTasks.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'DM Mono, monospace' }}>No recent tasks.</p>
              ) : (
                recentTasks.slice(0, 5).map((t) => (
                  <div key={t._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>{t.title}</div>
                      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                        {typeof t.project === 'string' ? t.project : t.project?.name}
                      </div>
                    </div>
                    <span className={`badge badge-${t.status === 'in_progress' ? 'progress' : t.status}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Overdue */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <AlertTriangle size={15} color="#f87171" />
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)' }}>Overdue</h2>
              </div>

              {overdueTasks.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'DM Mono, monospace' }}>No overdue tasks 🎉</p>
              ) : (
                overdueTasks.slice(0, 5).map((t) => (
                  <div key={t._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>{t.title}</div>
                      {t.dueDate && (
                        <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                          Due {new Date(t.dueDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}