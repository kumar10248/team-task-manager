'use client';
import { useEffect, useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, tasksApi } from '@/lib/api';
import type { Project, ProjectMember, Task, TaskStatus, TaskPriority } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Model';
import {
  Plus, ArrowLeft, Trash2, UserPlus, Pencil,
  MessageSquare, Send, X, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLS: Array<{ key: TaskStatus; label: string; color: string }> = [
  { key: 'todo',        label: 'To Do',       color: 'var(--text-muted)' },
  { key: 'in_progress', label: 'In Progress',  color: '#60a5fa' },
  { key: 'done',        label: 'Done',         color: '#4ade80' },
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const ROLES: Array<'admin' | 'member'> = ['admin', 'member'];

// ─── Task form shape ──────────────────────────────────────────────────────────

interface TaskFormState {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assignedTo: string;
  status: TaskStatus;
}

const EMPTY_TASK_FORM: TaskFormState = {
  title: '', description: '', priority: 'medium',
  dueDate: '', assignedTo: '', status: 'todo',
};

// ─── Field label helper ───────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace',
      letterSpacing: '0.08em', color: 'var(--text-muted)',
      textTransform: 'uppercase', marginBottom: 8,
    }}>
      {children}
    </label>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  myRole: 'admin' | 'member';
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpenComments: (task: Task) => void;
}

function TaskCard({ task, myRole, onStatusChange, onEdit, onDelete, onOpenComments }: TaskCardProps) {
  const isOverdue = !!task.dueDate && task.status !== 'done' && new Date() > new Date(task.dueDate);

  return (
    <div
      className="card"
      style={{ padding: 14, marginBottom: 10, transition: 'border-color 0.15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(245,158,11,0.25)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--bg-border)')}
    >
      {/* Title + priority */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, flex: 1, marginRight: 8, lineHeight: 1.4 }}>
          {task.title}
        </span>
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
      </div>

      {/* Description */}
      {task.description && (
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
          {task.description.slice(0, 90)}{task.description.length > 90 ? '…' : ''}
        </p>
      )}

      {/* Assignee + due date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {task.assignedTo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--amber),#d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: '#0d0d0f', fontWeight: 600,
            }}>
              {task.assignedTo.name?.[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
              {task.assignedTo.name?.split(' ')[0]}
            </span>
          </div>
        )}
        {task.dueDate && (
          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
            {isOverdue ? '⚠ ' : ''}{new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Status + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--bg-border)', paddingTop: 10 }}>
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task._id, e.target.value as TaskStatus)}
          style={{ fontSize: 10, padding: '3px 6px', width: 'auto', fontFamily: 'DM Mono, monospace', cursor: 'pointer' }}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>

        <div style={{ display: 'flex', gap: 6 }}>
          {/* Comment count badge */}
          <button
            onClick={() => onOpenComments(task)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', borderRadius: 4 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#60a5fa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            title="Comments"
          >
            <MessageSquare size={13} />
            {task.comments?.length > 0 && (
              <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace' }}>{task.comments.length}</span>
            )}
          </button>

          {myRole === 'admin' && (
            <>
              <button
                onClick={() => onEdit(task)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                title="Edit task"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(task)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                title="Delete task"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Comments panel (modal) ───────────────────────────────────────────────────

interface CommentsPanelProps {
  task: Task;
  projectId: string;
  currentUserId: string;
  myRole: 'admin' | 'member';
  onClose: () => void;
  onRefresh: () => void;
}

function CommentsPanel({ task, projectId, currentUserId, myRole, onClose, onRefresh }: CommentsPanelProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await tasksApi.addComment(projectId, task._id, { text: text.trim() });
      setText('');
      onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add comment', 'error');
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await tasksApi.deleteComment(projectId, task._id, commentId);
      onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete comment', 'error');
    }
  };

  return (
    <Modal title={`Comments — ${task.title}`} onClose={onClose} width={520}>
      {/* Comment list */}
      <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 20 }}>
        {task.comments?.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
            No comments yet. Be the first.
          </div>
        ) : (
          task.comments?.map((c) => (
            <div key={c._id} style={{
              display: 'flex', gap: 12, padding: '12px 0',
              borderBottom: '1px solid var(--bg-border)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,var(--amber),#d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#0d0d0f', fontWeight: 600,
              }}>
                {c.user?.name?.[0]?.toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{c.user?.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                      {new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {(c.user?._id === currentUserId || myRole === 'admin') && (
                      <button
                        onClick={() => deleteComment(c._id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.text}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New comment form */}
      <form onSubmit={send} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          style={{ flex: 1, resize: 'none', fontSize: 13 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e as unknown as FormEvent); }}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={sending || !text.trim()}
          style={{ padding: '8px 14px', flexShrink: 0 }}
        >
          <Send size={13} />
        </button>
      </form>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginTop: 6 }}>
        ⌘ / Ctrl + Enter to send
      </p>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast  = useToast();

  const [project, setProject]   = useState<Project | null>(null);
  const [members, setMembers]   = useState<ProjectMember[]>([]);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [myRole, setMyRole]     = useState<'admin' | 'member'>('member');
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'board' | 'list' | 'members'>('board');

  // Modals
  const [showTaskModal, setShowTaskModal]       = useState(false);
  const [showMemberModal, setShowMemberModal]   = useState(false);
  const [editingTask, setEditingTask]           = useState<Task | null>(null);   // null = create, Task = edit
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);
  const [commentTask, setCommentTask]           = useState<Task | null>(null);
  const [editingMember, setEditingMember]       = useState<ProjectMember | null>(null);

  // Forms
  const [taskForm, setTaskForm]     = useState<TaskFormState>(EMPTY_TASK_FORM);
  const [memberForm, setMemberForm] = useState({ email: '', role: 'member' as 'admin' | 'member' });
  const [saving, setSaving]         = useState(false);

  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [user, authLoading, router]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        projectsApi.get(id),
        tasksApi.list(id),
      ]);
      setProject(pRes.project);
      setMembers(pRes.members);
      setMyRole(pRes.project.myRole ?? 'member');
      setTasks(tRes.tasks);
    } catch {
      toast('Failed to load project', 'error');
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) load(); }, [user, id]);

  // ── Task helpers ────────────────────────────────────────────────────────────

  /** Recompute task stats locally so the board header counts update instantly */
  const tasksByStatus = STATUS_COLS.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col.key] = tasks.filter((t) => t.status === col.key);
    return acc;
  }, {});

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskForm(EMPTY_TASK_FORM);
    setShowTaskModal(true);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title:       task.title,
      description: task.description ?? '',
      priority:    task.priority,
      dueDate:     task.dueDate ? task.dueDate.slice(0, 10) : '',
      assignedTo:  typeof task.assignedTo === 'object' && task.assignedTo ? task.assignedTo._id : '',
      status:      task.status,
    });
    setShowTaskModal(true);
  };

  const saveTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...taskForm,
      assignedTo: taskForm.assignedTo || undefined,
      dueDate:    taskForm.dueDate    || undefined,
    };
    try {
      if (editingTask) {
        await tasksApi.update(id, editingTask._id, payload);
        toast('Task updated');
      } else {
        await tasksApi.create(id, payload);
        toast('Task created');
      }
      setShowTaskModal(false);
      setEditingTask(null);
      setTaskForm(EMPTY_TASK_FORM);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    // Optimistic update
    setTasks((prev) => prev.map((t) => t._id === taskId ? { ...t, status } : t));
    try {
      await tasksApi.update(id, taskId, { status });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update', 'error');
      await load(); // revert
    }
  };

  const confirmDeleteTask = async () => {
    if (!deleteTaskTarget) return;
    try {
      await tasksApi.delete(id, deleteTaskTarget._id);
      toast('Task deleted');
      setDeleteTaskTarget(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete', 'error');
    }
  };

  // ── Member helpers ──────────────────────────────────────────────────────────

  const addMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await projectsApi.addMember(id, memberForm);
      toast('Member added');
      setShowMemberModal(false);
      setMemberForm({ email: '', role: 'member' });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add member', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveRoleChange = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingMember) return;
    setSaving(true);
    try {
      await projectsApi.updateMemberRole(id, editingMember.user._id, { role: editingMember.role });
      toast('Role updated');
      setEditingMember(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update role', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (uid: string) => {
    try {
      await projectsApi.removeMember(id, uid);
      toast('Member removed');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove', 'error');
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    </div>
  );

  // ── Shared form fields (create & edit task) ─────────────────────────────────

  const TaskModalForm = (
    <form onSubmit={saveTask}>
      {/* Title */}
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Title *</FieldLabel>
        <input required placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
      </div>

      {/* Description */}
      <div style={{ marginBottom: 18 }}>
        <FieldLabel>Description</FieldLabel>
        <textarea placeholder="Details…" rows={3} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} style={{ resize: 'none' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
        {/* Priority */}
        <div>
          <FieldLabel>Priority</FieldLabel>
          <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as TaskPriority })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Status (only when editing) */}
        {editingTask ? (
          <div>
            <FieldLabel>Status</FieldLabel>
            <select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as TaskStatus })}>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        ) : (
          <div>
            <FieldLabel>Due Date</FieldLabel>
            <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
          </div>
        )}
      </div>

      {/* Due date when editing (3rd row) */}
      {editingTask && (
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Due Date</FieldLabel>
          <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
        </div>
      )}

      {/* Assignee */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Assign To</FieldLabel>
        <select value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}>
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.user._id} value={m.user._id}>{m.user.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" onClick={() => { setShowTaskModal(false); setEditingTask(null); }}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? (editingTask ? 'Saving…' : 'Creating…') : (editingTask ? 'Save Changes' : 'Create Task')}
        </button>
      </div>
    </form>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '32px 36px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── Header ── */}
          <div style={{ marginBottom: 28 }}>
            <Link href="/projects" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 16 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--amber)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')}>
              <ArrowLeft size={13} /> Back to Projects
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: project?.color ?? 'var(--amber)', flexShrink: 0 }} />
                <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 600, color: 'var(--text-primary)' }}>{project?.name}</h1>
                <span className={`badge badge-${myRole}`}>{myRole}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {myRole === 'admin' && (
                  <>
                    <button className="btn-ghost" onClick={() => setShowMemberModal(true)}>
                      <UserPlus size={13} /> Add Member
                    </button>
                    <button className="btn-primary" onClick={openCreateTask}>
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

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--bg-border)', marginBottom: 24 }}>
            {(['board', 'list', 'members'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '8px 16px',
                fontFamily: 'DM Mono, monospace', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
                color: tab === t ? 'var(--amber)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--amber)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}>{t}</button>
            ))}
          </div>

          {/* ══ Board view ══ */}
          {tab === 'board' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1, alignItems: 'start' }}>
              {STATUS_COLS.map(({ key, label, color }) => (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{label}</span>
                    {/* ← live count, updates when tasks change */}
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginLeft: 'auto',
                      background: 'var(--bg-elevated)', padding: '1px 7px', borderRadius: 10, border: '1px solid var(--bg-border)' }}>
                      {tasksByStatus[key]?.length ?? 0}
                    </span>
                  </div>

                  {tasksByStatus[key]?.map((t) => (
                    <TaskCard
                      key={t._id}
                      task={t}
                      myRole={myRole}
                      onStatusChange={handleStatusChange}
                      onEdit={openEditTask}
                      onDelete={setDeleteTaskTarget}
                      onOpenComments={setCommentTask}
                    />
                  ))}

                  {tasksByStatus[key]?.length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', border: '1px dashed var(--bg-border)', borderRadius: 8 }}>
                      Empty
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ══ List view ══ */}
          {tab === 'list' && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bg-border)' }}>
                    {['Title', 'Status', 'Priority', 'Assignee', 'Due Date', 'Comments', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>No tasks yet.</td></tr>
                  ) : tasks.map((t) => {
                    const isOverdue = !!t.dueDate && t.status !== 'done' && new Date() > new Date(t.dueDate);
                    return (
                      <tr key={t._id} style={{ borderBottom: '1px solid var(--bg-border)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', maxWidth: 240 }}>{t.title}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <select value={t.status} onChange={(e) => handleStatusChange(t._id, e.target.value as TaskStatus)}
                            style={{ fontSize: 10, padding: '3px 6px', width: 'auto', fontFamily: 'DM Mono, monospace', cursor: 'pointer' }}>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px 16px' }}><span className={`badge badge-${t.priority}`}>{t.priority}</span></td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace' }}>
                          {t.assignedTo?.name ?? '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'DM Mono, monospace', color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button onClick={() => setCommentTask(t)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#60a5fa')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
                            <MessageSquare size={13} />
                            {t.comments?.length > 0 && <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace' }}>{t.comments.length}</span>}
                          </button>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {myRole === 'admin' && (
                              <>
                                <button onClick={() => openEditTask(t)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
                                  <Pencil size={14} />
                                </button>
                                <button onClick={() => setDeleteTaskTarget(t)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ Members view ══ */}
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
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setEditingMember({ ...m })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title="Change role"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => removeMember(m.user._id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title="Remove member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ══ Create / Edit Task Modal ══ */}
      {showTaskModal && (
        <Modal
          title={editingTask ? `Edit — ${editingTask.title}` : 'Create Task'}
          onClose={() => { setShowTaskModal(false); setEditingTask(null); }}
        >
          {TaskModalForm}
        </Modal>
      )}

      {/* ══ Add Member Modal ══ */}
      {showMemberModal && (
        <Modal title="Add Member" onClose={() => setShowMemberModal(false)} width={400}>
          <form onSubmit={addMember}>
            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Email Address</FieldLabel>
              <input type="email" required placeholder="member@company.com" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <FieldLabel>Role</FieldLabel>
              <select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as 'admin' | 'member' })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setShowMemberModal(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add Member'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ Edit Member Role Modal ══ */}
      {editingMember && (
        <Modal title="Edit Role" onClose={() => setEditingMember(null)} width={380}>
          <form onSubmit={saveRoleChange}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', marginBottom: 20, borderBottom: '1px solid var(--bg-border)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--amber),#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#0d0d0f', fontWeight: 600, flexShrink: 0 }}>
                {editingMember.user?.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{editingMember.user?.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{editingMember.user?.email}</div>
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <FieldLabel>New Role</FieldLabel>
              <select
                value={editingMember.role}
                onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value as 'admin' | 'member' })}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setEditingMember(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Role'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ Delete Task Confirm ══ */}
      {deleteTaskTarget && (
        <Modal title="Delete Task" onClose={() => setDeleteTaskTarget(null)} width={400}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            Delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTaskTarget.title}</strong>? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setDeleteTaskTarget(null)}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444' }} onClick={confirmDeleteTask}>Delete</button>
          </div>
        </Modal>
      )}

      {/* ══ Comments Modal ══ */}
      {commentTask && user && (
        <CommentsPanel
          task={tasks.find((t) => t._id === commentTask._id) ?? commentTask}
          projectId={id}
          currentUserId={user._id}
          myRole={myRole}
          onClose={() => setCommentTask(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}