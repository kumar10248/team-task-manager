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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '32px 36px', overflow: 'auto' }}>
        <div className="animate-fade-in">

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Personal
              </p>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 30, fontWeight: 600, color: 'var(--text-primary)' }}>
                My Tasks
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Filter size={14} color="var(--text-muted)" />
              <select
                value={filter.status}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFilter({ ...filter, status: e.target.value as TaskStatus | '' })
                }
                style={{ width: 'auto', padding: '6px 10px', fontSize: 11 }}
              >
                <option value="">All Status</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <select
                value={filter.priority}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFilter({ ...filter, priority: e.target.value as TaskPriority | '' })
                }
                style={{ width: 'auto', padding: '6px 10px', fontSize: 11 }}
              >
                <option value="">All Priority</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Overdue banner */}
          {overdue.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#f87171' }}>
              ⚠ {overdue.length} task{overdue.length > 1 ? 's are' : ' is'} overdue
            </div>
          )}

          {/* Body */}
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>Loading…</p>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <CheckSquare size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
              <p style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text-secondary)' }}>No tasks found</p>
              <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                {allTasks.length > 0 ? 'Try adjusting filters' : 'No tasks assigned to you yet'}
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bg-border)' }}>
                    {['Task', 'Project', 'Status', 'Priority', 'Due Date', 'Update Status'].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 500 }}>
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
                        style={{ borderBottom: '1px solid var(--bg-border)' }}
                        onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{t.title}</div>
                          {t.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                              {t.description.slice(0, 60)}{t.description.length > 60 ? '…' : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>
                          {t.projectName}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`badge badge-${t.status === 'in_progress' ? 'progress' : t.status}`}>
                            {STATUS_MAP[t.status]}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <select
                            value={t.status}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                              updateStatus(t, e.target.value as TaskStatus)
                            }
                            style={{ fontSize: 10, padding: '4px 8px', width: 'auto', fontFamily: 'DM Mono, monospace', cursor: 'pointer' }}
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
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