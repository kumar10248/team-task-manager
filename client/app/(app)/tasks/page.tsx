'use client';
import { useEffect, useState, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, tasksApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import { CheckSquare, Filter } from 'lucide-react';

/* ================= TYPES ================= */

type TaskStatus   = 'todo' | 'in_progress' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type Role         = 'admin' | 'member' | string;

interface TaskUser {
  _id: string;
  name: string;
  email: string;
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  assignedTo?: TaskUser | null;
  /** Joined from project list */
  projectName: string;
  projectId: string;
  myRole: string;
}

interface Project {
  _id: string;
  name: string;
  myRole: Role;
}

interface TaskFilter {
  status: TaskStatus | '';
  priority: TaskPriority | '';
}

/* ================= CONSTANTS ================= */

const STATUS_MAP: Record<TaskStatus, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
};

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/* ================= PAGE ================= */

export default function MyTasksPage(): ReactElement {
  const { user, loading: authLoading } = useAuth() as {
    user: TaskUser | null;
    loading: boolean;
  };
  const router = useRouter();
  const toast  = useToast();

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading]   = useState<boolean>(true);
  const [filter, setFilter]     = useState<TaskFilter>({ status: '', priority: '' });

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;

    const load = async (): Promise<void> => {
      try {
        const projectsRes = await projectsApi.list();
        const taskArrays: Task[][] = await Promise.all(
          projectsRes.projects.map((p) =>
            tasksApi
              .list(p._id, { assignedTo: user._id })
              .then((r) =>
                r.tasks.map((t) => ({
                  ...t,
                  projectName: p.name,
                  projectId:   p._id,
                  myRole:      p.myRole || 'member',
                }))
              )
              .catch((): Task[] => [])
          )
        );
        setAllTasks(taskArrays.flat());
      } catch {
        toast('Failed to load tasks', 'error');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const updateStatus = async (task: Task, status: TaskStatus): Promise<void> => {
    try {
      await tasksApi.update(task.projectId, task._id, { status });
      setAllTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, status } : t)));
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    }
  };

  const filtered = allTasks.filter((t) => {
    if (filter.status   && t.status   !== filter.status)   return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    return true;
  });

  const overdue = filtered.filter(
    (t) => t.dueDate && t.status !== 'done' && new Date() > new Date(t.dueDate)
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '40px 48px', overflow: 'auto', position: 'relative', zIndex: 1 }}>
        
        {/* Subtle background glow */}
        <div style={{ position:'absolute', top:'-10%', left:'50%', transform:'translateX(-50%)', width:'60vw', height:'40vw', background:'radial-gradient(circle, rgba(192, 132, 252, 0.05) 0%, transparent 60%)', filter:'blur(80px)', zIndex:-1, pointerEvents:'none' }} />

        <div className="animate-fade-in">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
            <div>
              <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, color: 'var(--accent-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Personal
              </p>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                My Tasks
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: 12, backdropFilter: 'blur(20px)' }}>
              <Filter size={16} color="var(--text-secondary)" />
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
              <select
                value={filter.status}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFilter({ ...filter, status: e.target.value as TaskStatus | '' })
                }
                style={{ width: 'auto', padding: '6px 12px', fontSize: 13, fontFamily: 'Outfit, sans-serif', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
              >
                <option value="" style={{ background: '#0a0a0f', color: '#fff' }}>All Statuses</option>
                <option value="todo" style={{ background: '#0a0a0f', color: '#fff' }}>To Do</option>
                <option value="in_progress" style={{ background: '#0a0a0f', color: '#fff' }}>In Progress</option>
                <option value="done" style={{ background: '#0a0a0f', color: '#fff' }}>Done</option>
              </select>
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />
              <select
                value={filter.priority}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFilter({ ...filter, priority: e.target.value as TaskPriority | '' })
                }
                style={{ width: 'auto', padding: '6px 12px', fontSize: 13, fontFamily: 'Outfit, sans-serif', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
              >
                <option value="" style={{ background: '#0a0a0f', color: '#fff' }}>All Priorities</option>
                {PRIORITIES.map((p) => <option key={p} value={p} style={{ background: '#0a0a0f', color: '#fff' }}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Overdue banner */}
          {overdue.length > 0 && (
            <div style={{ background: 'rgba(248, 113, 113, 0.08)', border: '1px solid rgba(248, 113, 113, 0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, color: '#f87171', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', boxShadow: '0 0 10px #f87171' }} />
              You have {overdue.length} task{overdue.length > 1 ? 's that are' : ' that is'} overdue!
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--bg-border)', borderTopColor: 'var(--accent-secondary)', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <CheckSquare size={32} color="var(--text-muted)" />
              </div>
              <p style={{ fontFamily: 'Fraunces, serif', fontSize: 24, color: 'var(--text-primary)', marginBottom: 12 }}>No tasks found</p>
              <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, color: 'var(--text-secondary)' }}>
                {allTasks.length > 0 ? 'Try adjusting your filters.' : "You're all caught up! No tasks assigned to you yet."}
              </p>
            </div>
          ) : (
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['Task', 'Project', 'Status', 'Priority', 'Due Date', 'Update Status'].map((h) => (
                      <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const isOverdue = !!t.dueDate && t.status !== 'done' && new Date() > new Date(t.dueDate);
                    return (
                      <tr
                        key={t._id}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }}
                        onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '16px 20px', maxWidth: 300 }}>
                          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'Outfit, sans-serif' }}>{t.title}</div>
                          {t.description && (
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'Outfit, sans-serif', lineHeight: 1.5 }}>
                              {t.description.slice(0, 60)}{t.description.length > 60 ? '…' : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>
                          {t.projectName}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span className={`badge badge-${t.status === 'in_progress' ? 'progress' : t.status}`}>
                            {STATUS_MAP[t.status]}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <select
                            value={t.status}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                              updateStatus(t, e.target.value as TaskStatus)
                            }
                            style={{ fontSize: 12, padding: '6px 12px', width: 'auto', fontFamily: 'Outfit, sans-serif', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, color: 'var(--text-primary)' }}
                          >
                            <option value="todo" style={{ background: '#0a0a0f', color: '#fff' }}>To Do</option>
                            <option value="in_progress" style={{ background: '#0a0a0f', color: '#fff' }}>In Progress</option>
                            <option value="done" style={{ background: '#0a0a0f', color: '#fff' }}>Done</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}