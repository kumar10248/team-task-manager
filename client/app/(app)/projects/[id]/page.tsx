'use client';
import { useEffect, useState, ReactElement } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, tasksApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Model';
import { Plus, ArrowLeft, Trash2, UserPlus } from 'lucide-react';

/* ================= TYPES ================= */

type Role = 'admin' | 'member' | string;
type TaskStatus = 'todo' | 'in_progress' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type TabKey = 'board' | 'list' | 'members';

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
}

interface Member {
  _id: string;
  role: Role;
  user: TaskUser;
}

interface Project {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  myRole: Role;
}

interface TaskCardProps {
  task: Task;
  myRole: Role;
  onUpdate: (taskId: string, data: Partial<Pick<Task, 'status' | 'priority'>>) => void;
  onDelete: (task: Task) => void;
}

interface StatusColumn {
  key: TaskStatus;
  label: string;
  color: string;
}

interface TaskForm {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assignedTo: string;
}

interface MemberForm {
  email: string;
  role: 'admin' | 'member';
}

/* ================= CONSTANTS ================= */

const STATUS_COLS: StatusColumn[] = [
  { key: 'todo',        label: 'To Do',       color: 'var(--text-muted)' },
  { key: 'in_progress', label: 'In Progress',  color: '#60a5fa' },
  { key: 'done',        label: 'Done',         color: '#4ade80' },
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

const TABS: TabKey[] = ['board', 'list', 'members'];

/* ================= TASK CARD ================= */

function TaskCard({ task, myRole, onUpdate, onDelete }: TaskCardProps): ReactElement {
  const isOverdue = !!task.dueDate && task.status !== 'done' && new Date() > new Date(task.dueDate);

  return (
    <div
      className="card"
      style={{ padding: 14, marginBottom: 10, transition: 'border-color 0.15s' }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)'}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => e.currentTarget.style.borderColor = 'var(--bg-border)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, flex: 1, marginRight: 8, lineHeight: 1.4 }}>
          {task.title}
        </span>
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
      </div>

      {task.description && (
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
          {task.description.slice(0, 80)}{task.description.length > 80 ? '…' : ''}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {task.assignedTo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,var(--amber),#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#0d0d0f', fontWeight: 600 }}>
                {task.assignedTo.name?.[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                {task.assignedTo.name?.split(' ')[0]}
              </span>
            </div>
          )}
          {task.dueDate && (
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
              {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={task.status}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onUpdate(task._id, { status: e.target.value as TaskStatus })}
            style={{ fontSize: 10, padding: '2px 6px', width: 'auto', fontFamily: 'DM Mono, monospace', cursor: 'pointer' }}
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>

          {myRole === 'admin' && (
            <button
              onClick={() => onDelete(task)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= PAGE ================= */

export default function ProjectDetailPage(): ReactElement {
  const params = useParams();
  const id = params.id as string;
  const { user, loading: authLoading } = useAuth() as {
    user: TaskUser | null;
    loading: boolean;
  };
  const router = useRouter();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [myRole, setMyRole]   = useState<Role | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab]         = useState<TabKey>('board');

  const [showTaskModal, setShowTaskModal]     = useState<boolean>(false);
  const [showMemberModal, setShowMemberModal] = useState<boolean>(false);
  const [deleteTask, setDeleteTask]           = useState<Task | null>(null);
  const [saving, setSaving]                   = useState<boolean>(false);

  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: '', description: '', priority: 'medium', dueDate: '', assignedTo: '',
  });

  const [memberForm, setMemberForm] = useState<MemberForm>({ email: '', role: 'member' });

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  const load = async (): Promise<void> => {
    try {
      const [pRes, tRes] = await Promise.all([
        projectsApi.get(id),
        tasksApi.list(id),
      ]);
      const myRoleValue = pRes.project.myRole || 'member';
      setProject({ ...pRes.project, myRole: myRoleValue });
      setMembers(pRes.members);
      setMyRole(myRoleValue);
      setTasks(tRes.tasks);
    } catch {
      toast('Failed to load project', 'error');
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user, id]);

  const createTask = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      await tasksApi.create(id, {
        ...taskForm,
        assignedTo: taskForm.assignedTo || undefined,
        dueDate:    taskForm.dueDate    || undefined,
      });
      toast('Task created');
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', priority: 'medium', dueDate: '', assignedTo: '' });
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (taskId: string, data: Partial<Pick<Task, 'status' | 'priority'>>): Promise<void> => {
    try {
      await tasksApi.update(id, taskId, data);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    }
  };

  const confirmDeleteTask = async (): Promise<void> => {
    if (!deleteTask) return;
    try {
      await tasksApi.delete(id, deleteTask._id);
      toast('Task deleted');
      setDeleteTask(null);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    }
  };

  const addMember = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      await projectsApi.addMember(id, memberForm);
      toast('Member added');
      setShowMemberModal(false);
      setMemberForm({ email: '', role: 'member' });
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (uid: string): Promise<void> => {
    try {
      await projectsApi.removeMember(id, uid);
      toast('Member removed');
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'An error occurred', 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</span>
        </div>
      </div>
    );
  }

  const tasksByStatus = STATUS_COLS.reduce<Record<TaskStatus, Task[]>>(
    (acc, col) => {
      acc[col.key] = tasks.filter((t) => t.status === col.key);
      return acc;
    },
    { todo: [], in_progress: [], done: [] }
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '32px 36px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <Link
              href="/projects"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 16 }}
              onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => e.currentTarget.style.color = 'var(--amber)'}
              onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <ArrowLeft size={13} /> Back to Projects
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: project?.color ?? 'var(--amber)', flexShrink: 0 }} />
                <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {project?.name}
                </h1>
                <span className={`badge badge-${myRole}`}>{myRole}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {myRole === 'admin' && (
                  <>
                    <button className="btn-ghost" onClick={() => setShowMemberModal(true)}>
                      <UserPlus size={13} /> Add Member
                    </button>
                    <button className="btn-primary" onClick={() => setShowTaskModal(true)}>
                      <Plus size={13} /> Add Task
                    </button>
                  </>
                )}
              </div>
            </div>
            {project?.description && (
              <p style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>{project.description}</p>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--bg-border)', paddingBottom: 0 }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '8px 16px',
                  fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: tab === t ? 'var(--amber)' : 'var(--text-muted)',
                  borderBottom: tab === t ? '2px solid var(--amber)' : '2px solid transparent',
                  marginBottom: -1, transition: 'color 0.15s',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Board */}
          {tab === 'board' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
              {STATUS_COLS.map(({ key, label, color }) => (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {tasksByStatus[key].length}
                    </span>
                  </div>
                  {tasksByStatus[key].map((t) => (
                    <TaskCard key={t._id} task={t} myRole={myRole ?? 'member'} onUpdate={updateTask} onDelete={setDeleteTask} />
                  ))}
                  {tasksByStatus[key].length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', border: '1px dashed var(--bg-border)', borderRadius: 8 }}>
                      Empty
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* List */}
          {tab === 'list' && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bg-border)' }}>
                    {['Title', 'Status', 'Priority', 'Assignee', 'Due Date', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => {
                    const isOverdue = !!t.dueDate && t.status !== 'done' && new Date() > new Date(t.dueDate);
                    return (
                      <tr
                        key={t._id}
                        style={{ borderBottom: '1px solid var(--bg-border)' }}
                        onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', maxWidth: 280 }}>{t.title}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`badge badge-${t.status === 'in_progress' ? 'progress' : t.status}`}>
                            {t.status === 'in_progress' ? 'In Progress' : t.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`badge badge-${t.priority}`}>{t.priority}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace' }}>
                          {t.assignedTo?.name ?? '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {myRole === 'admin' && (
                            <button
                              onClick={() => setDeleteTask(t)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = '#f87171'}
                              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                        No tasks yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Members */}
          {tab === 'members' && (
            <div style={{ maxWidth: 600 }}>
              {members.map((m) => (
                <div key={m._id} className="card" style={{ padding: '16px 20px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--amber),#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: 'DM Mono, monospace', color: '#0d0d0f', fontWeight: 600, flexShrink: 0 }}>
                    {m.user?.name?.[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{m.user?.name}</div>
                    <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{m.user?.email}</div>
                  </div>
                  <span className={`badge badge-${m.role}`}>{m.role}</span>
                  {myRole === 'admin' && m.user?._id !== user?._id && (
                    <button
                      onClick={() => removeMember(m.user._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
                      onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = '#f87171'}
                      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Task Modal */}
      {showTaskModal && (
        <Modal title="Create Task" onClose={() => setShowTaskModal(false)}>
          <form onSubmit={createTask}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Title *</label>
              <input required placeholder="Task title" value={taskForm.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaskForm({ ...taskForm, title: e.target.value })} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Description</label>
              <textarea placeholder="Details…" rows={3} value={taskForm.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTaskForm({ ...taskForm, description: e.target.value })} style={{ resize: 'none' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Priority</label>
                <select value={taskForm.priority} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTaskForm({ ...taskForm, priority: e.target.value as TaskPriority })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Due Date</label>
                <input type="date" value={taskForm.dueDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Assign To</label>
              <select value={taskForm.assignedTo} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.user._id} value={m.user._id}>{m.user.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setShowTaskModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Task'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Member Modal */}
      {showMemberModal && (
        <Modal title="Add Member" onClose={() => setShowMemberModal(false)} width={400}>
          <form onSubmit={addMember}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Email Address</label>
              <input type="email" required placeholder="member@company.com" value={memberForm.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMemberForm({ ...memberForm, email: e.target.value })} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Role</label>
              <select value={memberForm.role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMemberForm({ ...memberForm, role: e.target.value === 'admin' ? 'admin' : 'member' })}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setShowMemberModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add Member'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Task confirm */}
      {deleteTask && (
        <Modal title="Delete Task" onClose={() => setDeleteTask(null)} width={400}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTask.title}</strong>? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setDeleteTask(null)}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444' }} onClick={confirmDeleteTask}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}