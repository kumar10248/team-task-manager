'use client';
import { useEffect, useState, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { dashboardApi, AttendanceLog } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import { CheckCircle2, Clock, AlertTriangle, Layers, TrendingUp, Users, LucideIcon, ArrowRight } from 'lucide-react';
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
  teamAttendance?: {
    _id: string;
    name: string;
    email: string;
    avatar: string | null;
    isClockedIn?: boolean;
    lastClockIn?: string | null;
    lastClockOut?: string | null;
  }[];
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

function StatCard({ icon: Icon, label, value, sub, color = 'var(--accent-primary)' }: StatCardProps): ReactElement {
  return (
    <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-20, right:-20, width:80, height:80, background:color, filter:'blur(40px)', opacity:0.15, borderRadius:'50%' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex:1 }}>
        <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight:500, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 42, fontWeight: 300, color: 'var(--text-primary)', lineHeight: 1, zIndex:1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', zIndex:1 }}>{sub}</div>
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
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
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

    dashboardApi
      .getAttendanceLogs()
      .then((res) => setAttendanceLogs(res.logs))
      .catch(console.error);
  }, [user]);

  if (authLoading || loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width:24, height:24, borderRadius:'50%', border:'2px solid var(--bg-border)', borderTopColor:'var(--accent-primary)', animation:'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
    teamAttendance   = [],
  } = data ?? {};

  const doneCount  = tasksByStatus.done ?? 0;
  const completion = totalTasks ? Math.round((doneCount / totalTasks) * 100) : 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)', position:'relative' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '40px 48px', overflow: 'auto', position:'relative', zIndex:1 }}>
        
        {/* Subtle background glow for the main area */}
        <div style={{ position:'absolute', top:'-10%', left:'50%', transform:'translateX(-50%)', width:'60vw', height:'40vw', background:'radial-gradient(circle, rgba(129, 140, 248, 0.05) 0%, transparent 60%)', filter:'blur(80px)', zIndex:-1, pointerEvents:'none' }} />

        <div className="animate-fade-in">

          {/* Header */}
          <div style={{ marginBottom: 40, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight:500, color: 'var(--accent-primary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Overview
              </p>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, color: 'var(--text-primary)', letterSpacing:'-0.01em' }}>
                Good day, {user?.name?.split(' ')[0]}
              </h1>
            </div>
            <Link href="/tasks" style={{ textDecoration:'none' }}>
              <button className="btn-primary" style={{ padding:'10px 24px' }}>New Task <ArrowRight size={14}/></button>
            </Link>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 40 }}>
            <StatCard icon={Layers}        label="Total Tasks"  value={totalTasks}                         sub={`${completion}% complete`} color="var(--accent-secondary)" />
            <StatCard icon={CheckCircle2}  label="Done"         value={doneCount}                          color="#4ade80" />
            <StatCard icon={Clock}         label="In Progress"  value={tasksByStatus.in_progress ?? 0}     color="#60a5fa" />
            <StatCard icon={AlertTriangle} label="Overdue"      value={overdueCount}                       color="#f87171" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>

            {/* Projects */}
            <div className="glass-panel" style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight:400, color: 'var(--text-primary)' }}>Projects</h2>
                <Link href="/projects" style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight:500, color: 'var(--accent-primary)', textDecoration: 'none', transition:'color 0.2s' }} onMouseEnter={(e)=>e.currentTarget.style.color='var(--accent-secondary)'} onMouseLeave={(e)=>e.currentTarget.style.color='var(--accent-primary)'}>
                  View all →
                </Link>
              </div>

              {projectSummaries.length === 0 ? (
                <div style={{ padding:'40px 0', textAlign:'center', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px dashed var(--bg-border)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>No projects yet.</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {projectSummaries.slice(0, 5).map((p) => {
                    const total = p.taskStats.total || 1;
                    const pct   = Math.round(((p.taskStats.done ?? 0) / total) * 100);
                    return (
                      <Link key={p._id} href={`/projects/${p._id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ padding: '16px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:12, transition:'all 0.2s', cursor: 'pointer' }}
                          onMouseEnter={(e)=>{ e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' }}
                          onMouseLeave={(e)=>{ e.currentTarget.style.background='rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.05)' }}>
                          
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color ?? 'var(--accent-primary)', flexShrink: 0, boxShadow:`0 0 8px ${p.color ?? 'var(--accent-primary)'}` }} />
                              <span style={{ fontSize: 15, fontFamily:'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                            </div>
                            <span style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight:500, color: 'var(--text-secondary)' }}>{pct}%</span>
                          </div>
                          
                          <div style={{ height: 6, background: 'var(--bg-border)', borderRadius: 3, overflow:'hidden', marginBottom: 8 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: p.color ?? 'var(--accent-primary)', borderRadius: 3, transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                          </div>
                          
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                            <span>{p.taskStats.done ?? 0} of {p.taskStats.total ?? 0} tasks completed</span>
                            <span className={`badge badge-${p.myRole}`}>{p.myRole}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tasks per user */}
            <div className="glass-panel" style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Users size={16} color="var(--accent-secondary)" />
                </div>
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight:400, color: 'var(--text-primary)' }}>By Member</h2>
              </div>

              {tasksPerUser.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>No data.</p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {tasksPerUser.slice(0, 6).map((u) => (
                    <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid transparent', transition:'all 0.2s' }}
                         onMouseEnter={(e)=>e.currentTarget.style.borderColor='rgba(255,255,255,0.05)'}
                         onMouseLeave={(e)=>e.currentTarget.style.borderColor='transparent'}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 600, flexShrink: 0 }}>
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: 14, fontFamily:'Outfit, sans-serif', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.name}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {u.count}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent + Overdue */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Recent Activity */}
            <div className="glass-panel" style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <TrendingUp size={16} color="var(--accent-primary)" />
                </div>
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight:400, color: 'var(--text-primary)' }}>Recent Activity</h2>
              </div>

              {recentTasks.length === 0 ? (
                <div style={{ padding:'30px 0', textAlign:'center', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px dashed var(--bg-border)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>No recent tasks.</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {recentTasks.slice(0, 5).map((t) => (
                    <div key={t._id} style={{ padding: '14px 16px', background:'rgba(255,255,255,0.02)', borderRadius:10, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontFamily:'Outfit, sans-serif', fontWeight:500, color: 'var(--text-primary)', marginBottom: 4 }}>{t.title}</div>
                        <div style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                          {typeof t.project === 'string' ? t.project : t.project?.name}
                        </div>
                      </div>
                      <span className={`badge badge-${t.status === 'in_progress' ? 'progress' : t.status}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overdue */}
            <div className="glass-panel" style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(248, 113, 113, 0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <AlertTriangle size={16} color="#f87171" />
                </div>
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight:400, color: 'var(--text-primary)' }}>Overdue</h2>
              </div>

              {overdueTasks.length === 0 ? (
                <div style={{ padding:'30px 0', textAlign:'center', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px dashed var(--bg-border)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>No overdue tasks 🎉</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {overdueTasks.slice(0, 5).map((t) => (
                    <div key={t._id} style={{ padding: '14px 16px', background:'rgba(248, 113, 113, 0.05)', border:'1px solid rgba(248, 113, 113, 0.1)', borderRadius:10, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontFamily:'Outfit, sans-serif', fontWeight:500, color: 'var(--text-primary)', marginBottom: 4 }}>{t.title}</div>
                        {t.dueDate && (
                          <div style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                            Due {new Date(t.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
        
        {teamAttendance.length > 0 && (
          <div className="glass-panel" style={{ padding: 32, marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Users size={16} color="var(--accent-primary)" />
              </div>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight:400, color: 'var(--text-primary)' }}>Team Attendance</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
              {teamAttendance.map(member => (
                <div key={member._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 600, flexShrink: 0 }}>
                      {member.name?.[0]?.toUpperCase()}
                    </div>
                    {/* Status Dot */}
                    <span style={{ position:'absolute', bottom:-2, right:-2, width:12, height:12, borderRadius:'50%', background: member.isClockedIn ? '#4ade80' : 'var(--text-muted)', border:'2px solid #0a0a0f', boxShadow: member.isClockedIn ? '0 0 8px #4ade80' : 'none' }} />
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 15, fontFamily:'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {member.name}
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                      {member.isClockedIn 
                        ? `Clocked in at ${member.lastClockIn ? new Date(member.lastClockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown'}` 
                        : member.lastClockOut 
                          ? `Clocked out at ${new Date(member.lastClockOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                          : 'Offline'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {attendanceLogs.length > 0 && (
          <div className="glass-panel" style={{ padding: 32, marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Clock size={16} color="var(--accent-primary)" />
              </div>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight:400, color: 'var(--text-primary)' }}>Attendance History</h2>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 500 }}>User</th>
                    <th style={{ padding: '12px 16px', fontWeight: 500 }}>Clock In</th>
                    <th style={{ padding: '12px 16px', fontWeight: 500 }}>Clock Out</th>
                    <th style={{ padding: '12px 16px', fontWeight: 500 }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceLogs.map((log) => (
                    <tr key={log._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
                          {log.user.name?.[0]?.toUpperCase()}
                        </div>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{log.user.name}</span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{new Date(log.clockIn).toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{new Date(log.clockOut).toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                        {Math.floor(log.durationMinutes / 60)}h {log.durationMinutes % 60}m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}