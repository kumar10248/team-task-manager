'use client';
import { useEffect, useState, useRef, FormEvent, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, tasksApi } from '@/lib/api';
import type { Project, ProjectMember, Task, TaskStatus, TaskPriority, Comment, ChecklistItem } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Model';
import { BoardSkeleton } from '@/components/Skeletons';
import { formatTimeAgo } from '@/lib/format';
import { triggerConfetti } from '@/lib/confetti';
import {
  Plus, ArrowLeft, Trash2, UserPlus, Pencil,
  MessageSquare, CornerDownLeft, GripVertical,
  Search, X, User, CheckSquare, Download, ExternalLink, Clock
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLS: Array<{ key: TaskStatus; label: string; color: string }> = [
  { key: 'todo',        label: 'To Do',       color: 'var(--text-muted)' },
  { key: 'in_progress', label: 'In Progress',  color: '#818cf8' },
  { key: 'done',        label: 'Done',         color: '#4ade80' },
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const ROLES: Array<'admin' | 'member'> = ['admin', 'member'];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#4ade80',
  medium: '#fbbf24',
  high: '#fb923c',
  urgent: '#f87171',
};

// ─── Task form shape ──────────────────────────────────────────────────────────

interface TaskFormState {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assignedTo: string;
  status: TaskStatus;
  tags: string[];
  checklist: ChecklistItem[];
}

const EMPTY_TASK_FORM: TaskFormState = {
  title: '', description: '', priority: 'medium',
  dueDate: '', assignedTo: '', status: 'todo',
  tags: [], checklist: [],
};

// ─── Field label helper ───────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', fontSize: 12, fontFamily: 'Outfit, sans-serif',
      letterSpacing: '0.06em', color: 'var(--text-secondary)',
      textTransform: 'uppercase', marginBottom: 8, fontWeight: 500
    }}>
      {children}
    </label>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  myRole: 'admin' | 'member';
  currentUserId?: string;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpenComments: (task: Task) => void;
}

function TaskCard({ task, myRole, currentUserId, onStatusChange, onEdit, onDelete, onOpenComments }: TaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const isOverdue = !!task.dueDate && task.status !== 'done' && new Date() > new Date(task.dueDate);
  const pColor = PRIORITY_COLORS[task.priority] || 'var(--accent-primary)';
  const isAssignedToMe = currentUserId ? task.assignedTo?._id === currentUserId : true;
  const canUpdateStatus = myRole === 'admin' || isAssignedToMe;

  return (
    <div
      className="glass-panel"
      draggable={canUpdateStatus}
      onDragStart={(e) => {
        if (!canUpdateStatus) return;
        e.dataTransfer.setData('text/plain', task._id);
        e.dataTransfer.setData('source-status', task.status);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      style={{ 
        padding: 16, 
        marginBottom: 16, 
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)', 
        position: 'relative',
        overflow: 'hidden',
        cursor: canUpdateStatus ? (isDragging ? 'grabbing' : 'grab') : 'default',
        opacity: isDragging ? 0.35 : 1,
        transform: isDragging ? 'scale(0.97)' : undefined,
        borderColor: isDragging ? pColor : undefined,
      }}
      onMouseEnter={(e) => {
        if (isDragging) return;
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
        e.currentTarget.style.boxShadow = `0 8px 30px -10px ${pColor}30`;
      }}
      onMouseLeave={(e) => {
        if (isDragging) return;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      }}
    >
      {/* Subtle priority glow line at the left */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: pColor, boxShadow: `0 0 10px ${pColor}` }} />

      {/* Title + priority */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1, marginRight: 8 }}>
          {canUpdateStatus && (
            <span style={{ color: 'var(--text-muted)', opacity: 0.45, cursor: 'grab', display: 'flex', paddingTop: 2 }} title="Drag to move card">
              <GripVertical size={14} />
            </span>
          )}
          <span style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
            {task.title}
          </span>
        </div>
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
      </div>

      {/* Tags chips */}
      {task.tags && task.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {task.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 10,
                background: 'rgba(129, 140, 248, 0.08)',
                color: '#a5b4fc',
                border: '1px solid rgba(129, 140, 248, 0.18)',
                letterSpacing: '0.02em',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {task.description && (
        <p style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
          {task.description.slice(0, 90)}{task.description.length > 90 ? '…' : ''}
        </p>
      )}

      {/* Checklist / Subtasks progress */}
      {task.checklist && task.checklist.length > 0 && (
        (() => {
          const total = task.checklist.length;
          const doneCount = task.checklist.filter((item) => item.completed).length;
          const pct = Math.round((doneCount / total) * 100);
          return (
            <div style={{ marginBottom: 12, padding: '7px 10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, fontSize: 11, fontFamily: 'Outfit, sans-serif' }}>
                <span style={{ color: doneCount === total ? '#4ade80' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <CheckSquare size={12} color={doneCount === total ? '#4ade80' : 'var(--accent-primary)'} />
                  {doneCount}/{total} subtasks
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: doneCount === total ? '#4ade80' : 'var(--accent-primary)', transition: 'width 0.3s' }} />
              </div>
            </div>
          );
        })()
      )}

      {/* Assignee + due date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {task.assignedTo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: '#fff', fontWeight: 600, fontFamily: 'Outfit, sans-serif'
            }}>
              {task.assignedTo.name?.[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>
              {task.assignedTo.name?.split(' ')[0]}
            </span>
          </div>
        )}
        {task.dueDate && (
          <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
            {isOverdue ? '⚠ ' : ''}{new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Status + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
        <select
          value={task.status}
          disabled={!canUpdateStatus}
          onChange={(e) => onStatusChange(task._id, e.target.value as TaskStatus)}
          style={{
            fontSize: 12,
            padding: '4px 8px',
            width: 'auto',
            background: 'rgba(255,255,255,0.03)',
            cursor: canUpdateStatus ? 'pointer' : 'not-allowed',
            opacity: canUpdateStatus ? 1 : 0.6,
          }}
          title={!canUpdateStatus ? 'Only the assignee or an admin can update task status' : ''}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>

        <div style={{ display: 'flex', gap: 6 }}>
          {/* Comment count badge */}
          <button
            onClick={() => onOpenComments(task)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
            title="Comments"
          >
            <MessageSquare size={14} />
            {task.comments?.length > 0 && (
              <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif' }}>{task.comments.length}</span>
            )}
          </button>

          {myRole === 'admin' && (
            <>
              <button
                onClick={() => onEdit(task)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 6, borderRadius: 6, transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(129, 140, 248, 0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                title="Edit task"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onDelete(task)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 6, borderRadius: 6, transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                title="Delete task"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  col: { key: TaskStatus; label: string; color: string };
  tasks: Task[];
  count: number;
  myRole: 'admin' | 'member';
  currentUserId?: string;
  onDropTask: (taskId: string, targetStatus: TaskStatus) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpenComments: (task: Task) => void;
}

function KanbanColumn({
  col,
  tasks,
  count,
  myRole,
  currentUserId,
  onDropTask,
  onStatusChange,
  onEdit,
  onDelete,
  onOpenComments,
}: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className="kanban-column"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) {
          onDropTask(taskId, col.key);
        }
      }}
      style={{
        background: isOver ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.01)',
        borderRadius: 16,
        padding: 16,
        border: isOver ? `2px dashed ${col.color}` : '1px solid rgba(255,255,255,0.03)',
        boxShadow: isOver ? `0 0 24px -4px ${col.color}35` : 'none',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        minHeight: 460,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Column Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '0 4px' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, boxShadow: `0 0 10px ${col.color}` }} />
        <span style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
          {col.label}
        </span>
        <span
          style={{
            fontSize: 12,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 600,
            color: count > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
            marginLeft: 'auto',
            background: isOver ? `${col.color}25` : 'rgba(255,255,255,0.05)',
            padding: '2px 10px',
            borderRadius: 12,
            transition: 'all 0.2s',
          }}
        >
          {count}
        </span>
      </div>

      {/* Task Cards list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {tasks.map((t) => (
          <TaskCard
            key={t._id}
            task={t}
            myRole={myRole}
            currentUserId={currentUserId}
            onStatusChange={onStatusChange}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpenComments={onOpenComments}
          />
        ))}

        {tasks.length === 0 && (
          <div
            style={{
              flex: 1,
              minHeight: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontFamily: 'Outfit, sans-serif',
              color: isOver ? col.color : 'var(--text-muted)',
              border: isOver ? `1px dashed ${col.color}` : '1px dashed rgba(255,255,255,0.05)',
              borderRadius: 12,
              background: isOver ? `${col.color}08` : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            {isOver ? `Drop to move to ${col.label}` : 'No tasks in this stage'}
          </div>
        )}
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
  members?: ProjectMember[];
  onClose: () => void;
  onCommentsUpdate?: (taskId: string, comments: Comment[]) => void;
}

const QUICK_REACTIONS = [
  { label: '👍 Looks good', text: '👍 Looks good!' },
  { label: '🚀 Shipped', text: '🚀 Shipped and verified.' },
  { label: '👀 Reviewing', text: '👀 Taking a look now.' },
  { label: '❤️ Thanks', text: '❤️ Thanks for the update!' },
  { label: '🎉 Great job', text: '🎉 Awesome job on this!' },
];

function CommentsPanel({ task, projectId, currentUserId, myRole, members = [], onClose, onCommentsUpdate }: CommentsPanelProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState<Comment[]>(task.comments || []);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Fetch freshly populated task comments on open
  useEffect(() => {
    let active = true;
    tasksApi
      .get(projectId, task._id)
      .then((res) => {
        if (!active || !res?.task?.comments) return;
        setComments(res.task.comments);
        if (onCommentsUpdate) onCommentsUpdate(task._id, res.task.comments);
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [projectId, task._id, onCommentsUpdate]);

  const scrollToBottom = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [comments.length]);

  const getAuthorInfo = (c: Comment) => {
    if (c.user && typeof c.user === 'object' && c.user.name) {
      const isMe = c.user._id === currentUserId || (user?._id && c.user._id === user._id);
      return {
        id: c.user._id,
        name: c.user.name,
        isMe: !!isMe,
        initial: (c.user.name[0] || 'U').toUpperCase(),
      };
    }

    const rawId = typeof c.user === 'string' ? c.user : c.user?._id;

    if (rawId && (rawId === currentUserId || (user?._id && rawId === user._id))) {
      return {
        id: currentUserId,
        name: user?.name || 'You',
        isMe: true,
        initial: (user?.name?.[0] || 'Y').toUpperCase(),
      };
    }

    if (rawId && members.length > 0) {
      const found = members.find((m) => m.user?._id === rawId);
      if (found?.user?.name) {
        return {
          id: found.user._id,
          name: found.user.name,
          isMe: false,
          initial: (found.user.name[0] || 'U').toUpperCase(),
        };
      }
    }

    if (rawId && task.assignedTo?._id === rawId && task.assignedTo.name) {
      return {
        id: task.assignedTo._id,
        name: task.assignedTo.name,
        isMe: false,
        initial: (task.assignedTo.name[0] || 'U').toUpperCase(),
      };
    }

    if (rawId && task.createdBy?._id === rawId && task.createdBy.name) {
      return {
        id: task.createdBy._id,
        name: task.createdBy.name,
        isMe: false,
        initial: (task.createdBy.name[0] || 'U').toUpperCase(),
      };
    }

    return {
      id: rawId || '',
      name: 'Team Member',
      isMe: false,
      initial: 'U',
    };
  };

  const send = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    // Optimistic addition
    const tempId = `temp-${Date.now()}`;
    const optimisticComment: Comment = {
      _id: tempId,
      user: {
        _id: currentUserId,
        name: user?.name || 'You',
        email: user?.email || '',
        avatar: user?.avatar || null,
        createdAt: new Date().toISOString(),
      },
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    const newComments = [...comments, optimisticComment];
    setComments(newComments);
    if (onCommentsUpdate) onCommentsUpdate(task._id, newComments);
    setText('');
    setSending(true);

    try {
      const res = await tasksApi.addComment(projectId, task._id, { text: trimmed });
      if (res.success && res.comment) {
        const finalComments = newComments.map((c) => (c._id === tempId ? res.comment : c));
        setComments(finalComments);
        if (onCommentsUpdate) onCommentsUpdate(task._id, finalComments);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add comment', 'error');
      // Rollback
      const reverted = comments.filter((c) => c._id !== tempId);
      setComments(reverted);
      if (onCommentsUpdate) onCommentsUpdate(task._id, reverted);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    const prevComments = comments;
    const filtered = comments.filter((c) => c._id !== commentId);
    setComments(filtered);
    if (onCommentsUpdate) onCommentsUpdate(task._id, filtered);
    setConfirmDeleteId(null);

    try {
      await tasksApi.deleteComment(projectId, task._id, commentId);
      toast('Comment deleted');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete comment', 'error');
      setComments(prevComments);
      if (onCommentsUpdate) onCommentsUpdate(task._id, prevComments);
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditText(comment.text);
  };

  const saveEdit = async (commentId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    const prevComments = comments;
    const updated = comments.map((c) =>
      c._id === commentId ? { ...c, text: trimmed, editedAt: new Date().toISOString() } : c
    );
    setComments(updated);
    if (onCommentsUpdate) onCommentsUpdate(task._id, updated);
    setEditingCommentId(null);

    try {
      await tasksApi.updateComment(projectId, task._id, commentId, { text: trimmed });
      toast('Comment updated');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update comment', 'error');
      setComments(prevComments);
      if (onCommentsUpdate) onCommentsUpdate(task._id, prevComments);
    }
  };

  return (
    <Modal title={`Discussion — ${task.title}`} onClose={onClose} width={560}>
      {/* Task preview header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif' }}>
          {task.status === 'done' ? 'Completed task' : 'Active task'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </span>
      </div>

      {/* Comment list */}
      <div style={{ maxHeight: 380, overflowY: 'auto', marginBottom: 20, paddingRight: 6, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px', background: 'rgba(255,255,255,0.015)', borderRadius: 12, border: '1px dashed var(--bg-border)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(129, 140, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <MessageSquare size={22} color="var(--accent-primary)" />
            </div>
            <p style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', marginBottom: 6 }}>
              No comments yet
            </p>
            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, color: 'var(--text-muted)', maxWidth: 300, margin: '0 auto' }}>
              Share updates, discuss blockers, or ask questions with your team.
            </p>
          </div>
        ) : (
          comments.map((c) => {
            const author = getAuthorInfo(c);
            const isMe = author.isMe;
            const canManage = isMe || myRole === 'admin';
            const userInitial = author.initial;

            // System activity & audit trail event
            if (c.type === 'activity') {
              return (
                <div
                  key={c._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderLeft: '2px solid var(--accent-primary)',
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  <Clock size={13} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
                    <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{author.name}</strong>{' '}
                    {c.text}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {formatTimeAgo(c.createdAt)}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={c._id}
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: 14,
                  borderRadius: 12,
                  background: isMe ? 'rgba(129, 140, 248, 0.04)' : 'rgba(255,255,255,0.02)',
                  border: isMe ? '1px solid rgba(129, 140, 248, 0.12)' : '1px solid rgba(255,255,255,0.04)',
                  transition: 'background 0.2s',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: isMe
                      ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    color: '#fff',
                    fontWeight: 600,
                    fontFamily: 'Outfit, sans-serif',
                    boxShadow: isMe ? '0 0 12px rgba(129, 140, 248, 0.3)' : 'none',
                  }}
                >
                  {userInitial}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}>
                        {author.name} {isMe && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--accent-primary)' }}>(you)</span>}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                        {formatTimeAgo(c.createdAt)}
                        {c.editedAt && ' • edited'}
                      </span>
                    </div>

                    {canManage && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isMe && editingCommentId !== c._id && (
                          <button
                            onClick={() => startEditing(c)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 4, transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(129, 140, 248, 0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                            title="Edit comment"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {confirmDeleteId === c._id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button
                              onClick={() => deleteComment(c._id)}
                              style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                            >
                              Delete?
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(c._id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 4, transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                            title="Delete comment"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {editingCommentId === c._id ? (
                    <div style={{ marginTop: 8 }}>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        style={{ width: '100%', resize: 'vertical', fontSize: 13, marginBottom: 8, padding: '8px 12px' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingCommentId(null);
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(c._id);
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingCommentId(null)}>
                          Cancel
                        </button>
                        <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => saveEdit(c._id)}>
                          Save changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="comment-markdown">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'rgba(129, 140, 248, 0.1)',
                                color: '#a5b4fc',
                                padding: '2px 8px',
                                borderRadius: 6,
                                textDecoration: 'none',
                                border: '1px solid rgba(129, 140, 248, 0.25)',
                                fontSize: '0.9em',
                                wordBreak: 'break-all',
                              }}
                            >
                              <ExternalLink size={11} />
                              <span>{children}</span>
                            </a>
                          ),
                        }}
                      >
                        {c.text.replace(/(?<!\(|\[)(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g, '[$1]($1)')}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Quick reaction chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {QUICK_REACTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setText((prev) => (prev ? `${prev} ${item.text}` : item.text))}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20,
              padding: '4px 10px',
              fontSize: 12,
              fontFamily: 'Outfit, sans-serif',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(129, 140, 248, 0.1)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* New comment form */}
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment or markdown note… (⌘ + Enter to send)"
            rows={3}
            maxLength={1000}
            style={{ width: '100%', resize: 'none', fontSize: 13, padding: '12px 14px', lineHeight: 1.5 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {text.length}/1000 • Markdown supported
          </span>
          <button
            type="submit"
            className="btn-primary"
            disabled={sending || !text.trim()}
            style={{ padding: '8px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {sending ? (
              'Sending…'
            ) : (
              <>
                Comment <CornerDownLeft size={13} />
              </>
            )}
          </button>
        </div>
      </form>
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

  // Filters & Search
  const [searchQuery, setSearchQuery]         = useState('');
  const [filterPriority, setFilterPriority]   = useState('');
  const [filterAssignee, setFilterAssignee]   = useState('');
  const [onlyMyTasks, setOnlyMyTasks]         = useState(false);

  const isFiltering = !!(searchQuery.trim() || filterPriority || filterAssignee || onlyMyTasks);

  const resetFilters = () => {
    setSearchQuery('');
    setFilterPriority('');
    setFilterAssignee('');
    setOnlyMyTasks(false);
  };

  // Forms
  const [taskForm, setTaskForm]                   = useState<TaskFormState>(EMPTY_TASK_FORM);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newTagInput, setNewTagInput]             = useState('');
  const [memberForm, setMemberForm]               = useState({ email: '', role: 'member' as 'admin' | 'member' });
  const [saving, setSaving]                       = useState(false);

  useEffect(() => { if (!authLoading && !user) router.push('/login'); }, [user, authLoading, router]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pRes, tRes] = await Promise.all([
        projectsApi.get(id),
        tasksApi.list(id, { limit: 1000 }),
      ]);
      setProject(pRes.project);
      setMembers(pRes.members);
      setMyRole(pRes.project.myRole ?? 'member');
      setTasks(tRes.tasks);
    } catch {
      if (!silent) {
        toast('Failed to load project', 'error');
        router.push('/projects');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, router, toast]);

  useEffect(() => {
    let active = true;
    if (!user) return;

    Promise.all([
      projectsApi.get(id),
      tasksApi.list(id, { limit: 1000 }),
    ])
      .then(([pRes, tRes]) => {
        if (!active) return;
        setProject(pRes.project);
        setMembers(pRes.members);
        setMyRole(pRes.project.myRole ?? 'member');
        setTasks(tRes.tasks);
      })
      .catch(() => {
        if (!active) return;
        toast('Failed to load project', 'error');
        router.push('/projects');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // 30s background revalidation for real-time live updates between teammates
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        tasksApi.list(id, { limit: 1000 })
          .then((tRes) => {
            if (active) setTasks(tRes.tasks);
          })
          .catch(console.error);
      }
    }, 30000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, id, router, toast]);

  const openCreateTask = useCallback(() => {
    setEditingTask(null);
    setTaskForm(EMPTY_TASK_FORM);
    setNewChecklistTitle('');
    setNewTagInput('');
    setShowTaskModal(true);
  }, []);

  const openEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title:       task.title,
      description: task.description ?? '',
      priority:    task.priority,
      dueDate:     task.dueDate ? task.dueDate.slice(0, 10) : '',
      assignedTo:  typeof task.assignedTo === 'object' && task.assignedTo ? task.assignedTo._id : '',
      status:      task.status,
      tags:        task.tags ? [...task.tags] : [],
      checklist:   task.checklist ? task.checklist.map((c) => ({ ...c })) : [],
    });
    setNewChecklistTitle('');
    setNewTagInput('');
    setShowTaskModal(true);
  }, []);

  // Global project keyboard shortcuts (Esc, N)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.key === 'Escape') {
        setShowTaskModal(false);
        setEditingTask(null);
        setShowMemberModal(false);
        setDeleteTaskTarget(null);
        setCommentTask(null);
      } else if (e.key.toLowerCase() === 'n' && !isInput && !showTaskModal && !commentTask && !showMemberModal) {
        if (myRole === 'admin') {
          e.preventDefault();
          openCreateTask();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showTaskModal, commentTask, showMemberModal, myRole, openCreateTask]);

  // ── Task helpers ────────────────────────────────────────────────────────────

  const filteredTasks = tasks.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc  = t.description ? t.description.toLowerCase().includes(q) : false;
      if (!matchTitle && !matchDesc) return false;
    }
    if (onlyMyTasks) {
      const isAssignedToMe = user?._id ? t.assignedTo?._id === user._id : false;
      if (!isAssignedToMe) return false;
    }
    if (filterPriority && t.priority !== filterPriority) {
      return false;
    }
    if (filterAssignee) {
      if (filterAssignee === 'unassigned') {
        if (t.assignedTo) return false;
      } else if (t.assignedTo?._id !== filterAssignee) {
        return false;
      }
    }
    return true;
  });

  /** Recompute task stats locally based on filtered tasks so the board header counts update instantly */
  const tasksByStatus = STATUS_COLS.reduce<Record<string, Task[]>>((acc, col) => {
    acc[col.key] = filteredTasks.filter((t) => t.status === col.key);
    return acc;
  }, {});

  const addChecklistItem = () => {
    const title = newChecklistTitle.trim();
    if (!title) return;
    setTaskForm((prev) => ({
      ...prev,
      checklist: [...prev.checklist, { title, completed: false }],
    }));
    setNewChecklistTitle('');
  };

  const toggleChecklistItem = (idx: number) => {
    setTaskForm((prev) => ({
      ...prev,
      checklist: prev.checklist.map((item, i) =>
        i === idx ? { ...item, completed: !item.completed } : item
      ),
    }));
  };

  const removeChecklistItem = (idx: number) => {
    setTaskForm((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== idx),
    }));
  };

  const addTag = (tag: string) => {
    const clean = tag.trim().toLowerCase().replace(/^#/, '');
    if (!clean) return;
    if (!taskForm.tags.includes(clean)) {
      setTaskForm((prev) => ({ ...prev, tags: [...prev.tags, clean] }));
    }
    setNewTagInput('');
  };

  const removeTag = (tag: string) => {
    setTaskForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const exportTasksCSV = () => {
    if (!tasks || tasks.length === 0) {
      toast('No tasks to export', 'error');
      return;
    }

    const headers = [
      'Title',
      'Status',
      'Priority',
      'Assignee Name',
      'Assignee Email',
      'Due Date',
      'Subtasks Completed',
      'Subtasks Total',
      'Tags',
      'Created Date',
    ];

    const escapeCSV = (val: string | number | boolean | null | undefined): string => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = tasks.map((t) => {
      const assigneeName = typeof t.assignedTo === 'object' && t.assignedTo ? t.assignedTo.name : 'Unassigned';
      const assigneeEmail = typeof t.assignedTo === 'object' && t.assignedTo ? t.assignedTo.email : 'N/A';
      const dueDate = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'None';
      const checklistDone = t.checklist ? t.checklist.filter((c) => c.completed).length : 0;
      const checklistTotal = t.checklist ? t.checklist.length : 0;
      const tagsStr = (t.tags || []).join('; ');
      const createdDate = new Date(t.createdAt).toLocaleDateString();

      return [
        escapeCSV(t.title),
        escapeCSV(t.status),
        escapeCSV(t.priority),
        escapeCSV(assigneeName),
        escapeCSV(assigneeEmail),
        escapeCSV(dueDate),
        escapeCSV(checklistDone),
        escapeCSV(checklistTotal),
        escapeCSV(tagsStr),
        escapeCSV(createdDate),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${(project?.name || 'project').toLowerCase().replace(/\s+/g, '_')}_tasks_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Tasks exported to CSV');
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
        const res = await tasksApi.update(id, editingTask._id, payload);
        toast('Task updated');
        setTasks((prev) => prev.map((t) => (t._id === editingTask._id ? res.task : t)));
      } else {
        const res = await tasksApi.create(id, payload);
        toast('Task created');
        setTasks((prev) => [res.task, ...prev]);
      }
      setShowTaskModal(false);
      setEditingTask(null);
      setTaskForm(EMPTY_TASK_FORM);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    const prevTask = tasks.find((t) => t._id === taskId);
    if (!prevTask || prevTask.status === status) return;

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status } : t)));

    if (status === 'done') {
      toast('Task completed! 🎉');
      triggerConfetti();
    }

    try {
      await tasksApi.update(id, taskId, { status });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update', 'error');
      await load(); // revert
    }
  };

  const confirmDeleteTask = async () => {
    if (!deleteTaskTarget) return;
    const targetId = deleteTaskTarget._id;
    try {
      await tasksApi.delete(id, targetId);
      toast('Task deleted');
      setTasks((prev) => prev.filter((t) => t._id !== targetId));
      setDeleteTaskTarget(null);
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
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Sidebar />
      <BoardSkeleton />
    </div>
  );

  // ── Shared form fields (create & edit task) ─────────────────────────────────

  const TaskModalForm = (
    <form onSubmit={saveTask}>
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Title *</FieldLabel>
        <input required placeholder="Task title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
      </div>

      {/* Description */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Description</FieldLabel>
        <textarea placeholder="Details…" rows={3} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} style={{ resize: 'none' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
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
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Due Date</FieldLabel>
          <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
        </div>
      )}

      {/* Assignee */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Assign To</FieldLabel>
        <select value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}>
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.user._id} value={m.user._id}>{m.user.name}</option>)}
        </select>
      </div>

      {/* Tags / Categories */}
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Tags / Labels</FieldLabel>
        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {['bug', 'feature', 'frontend', 'backend', 'design', 'v1.0'].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addTag(preset)}
              style={{
                fontSize: 11,
                fontFamily: 'Outfit, sans-serif',
                padding: '2px 8px',
                borderRadius: 10,
                background: taskForm.tags.includes(preset) ? 'rgba(129, 140, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: taskForm.tags.includes(preset) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                border: taskForm.tags.includes(preset) ? '1px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
              }}
            >
              + {preset}
            </button>
          ))}
        </div>

        {/* Selected tags */}
        {taskForm.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {taskForm.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 11,
                  background: 'rgba(129, 140, 248, 0.12)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(129, 140, 248, 0.25)',
                }}
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Type custom tag and press Enter…"
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(newTagInput);
              }
            }}
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => addTag(newTagInput)}
            style={{ padding: '0 14px', fontSize: 12 }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Subtasks Checklist */}
      <div style={{ marginBottom: 28, padding: 16, background: 'rgba(255, 255, 255, 0.02)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <FieldLabel>
            Subtask Checklist {taskForm.checklist.length > 0 && `(${taskForm.checklist.filter(c => c.completed).length}/${taskForm.checklist.length})`}
          </FieldLabel>
          {taskForm.checklist.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
              {Math.round((taskForm.checklist.filter(c => c.completed).length / taskForm.checklist.length) * 100)}% done
            </span>
          )}
        </div>

        {/* Existing subtasks */}
        {taskForm.checklist.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {taskForm.checklist.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => toggleChecklistItem(idx)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: 'Outfit, sans-serif',
                    color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: item.completed ? 'line-through' : 'none',
                  }}
                >
                  {item.title}
                </span>
                <button
                  type="button"
                  onClick={() => removeChecklistItem(idx)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
                  title="Remove subtask"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Add subtask checklist item…"
            value={newChecklistTitle}
            onChange={(e) => setNewChecklistTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addChecklistItem();
              }
            }}
            style={{ flex: 1, fontSize: 13 }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={addChecklistItem}
            style={{ padding: '0 14px', fontSize: 12 }}
          >
            + Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" onClick={() => { setShowTaskModal(false); setEditingTask(null); }} style={{ padding: '10px 20px' }}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '10px 24px' }}>
          {saving ? (editingTask ? 'Saving…' : 'Creating…') : (editingTask ? 'Save Changes' : 'Create Task')}
        </button>
      </div>
    </form>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '40px 48px', overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        
        {/* Subtle background glow */}
        <div style={{ position:'absolute', top:'-10%', left:'50%', transform:'translateX(-50%)', width:'60vw', height:'40vw', background:`radial-gradient(circle, ${project?.color || 'var(--accent-primary)'}20 0%, transparent 60%)`, filter:'blur(80px)', zIndex:-1, pointerEvents:'none' }} />

        <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ── Header ── */}
          <div style={{ marginBottom: 40 }}>
            <Link href="/projects" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 20, transition: 'color 0.2s' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')}>
              <ArrowLeft size={14} /> Back to Projects
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: project?.color ?? 'var(--accent-primary)', flexShrink: 0, boxShadow: `0 0 15px ${project?.color ?? 'var(--accent-primary)'}` }} />
                <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{project?.name}</h1>
                <span className={`badge badge-${myRole}`} style={{ fontSize: 13 }}>{myRole}</span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn-ghost"
                  onClick={exportTasksCSV}
                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                  title="Export all project tasks to CSV"
                >
                  <Download size={15} /> Export CSV
                </button>
                {myRole === 'admin' && (
                  <>
                    <button className="btn-ghost" onClick={() => setShowMemberModal(true)} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UserPlus size={16} /> Add Member
                    </button>
                    <button className="btn-primary" onClick={openCreateTask} style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Plus size={16} /> Add Task
                    </button>
                  </>
                )}
              </div>
            </div>
            {project?.description && (
              <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'Outfit, sans-serif', lineHeight: 1.6, maxWidth: 800 }}>{project.description}</p>
            )}
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 32 }}>
            {(['board', 'list', 'members'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '12px 20px',
                fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (tab !== t) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { if (tab !== t) e.currentTarget.style.color = 'var(--text-muted)' }}>
                {t}
              </button>
            ))}
          </div>

          {/* ── Search & Filter Bar (shown on Board & List tabs) ── */}
          {(tab === 'board' || tab === 'list') && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 24,
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.015)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 14,
                backdropFilter: 'blur(16px)',
              }}
            >
              {/* Search input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  padding: '6px 12px',
                  minWidth: 220,
                  flex: '1 1 220px',
                  maxWidth: 340,
                }}
              >
                <Search size={15} color="var(--text-muted)" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks by title or details…"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 13,
                    fontFamily: 'Outfit, sans-serif',
                    color: 'var(--text-primary)',
                    width: '100%',
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Only My Tasks toggle */}
              <button
                type="button"
                onClick={() => setOnlyMyTasks((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: onlyMyTasks ? 'rgba(129, 140, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: onlyMyTasks ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.06)',
                  color: onlyMyTasks ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: onlyMyTasks ? '0 0 12px rgba(129, 140, 248, 0.25)' : 'none',
                }}
              >
                <User size={13} color={onlyMyTasks ? 'var(--accent-primary)' : 'currentColor'} />
                My Tasks
              </button>

              {/* Priority filter */}
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  background: filterPriority ? 'rgba(129, 140, 248, 0.1)' : 'rgba(255,255,255,0.03)',
                  border: filterPriority ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  color: filterPriority ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  outline: 'none',
                  width: 'auto',
                }}
              >
                <option value="" style={{ background: '#0a0a0f', color: '#fff' }}>All Priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} style={{ background: '#0a0a0f', color: '#fff' }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)} Priority
                  </option>
                ))}
              </select>

              {/* Assignee filter */}
              {members.length > 0 && (
                <select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                    background: filterAssignee ? 'rgba(129, 140, 248, 0.1)' : 'rgba(255,255,255,0.03)',
                    border: filterAssignee ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    color: filterAssignee ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    outline: 'none',
                    width: 'auto',
                  }}
                >
                  <option value="" style={{ background: '#0a0a0f', color: '#fff' }}>All Assignees</option>
                  <option value="unassigned" style={{ background: '#0a0a0f', color: '#fff' }}>Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user._id} value={m.user._id} style={{ background: '#0a0a0f', color: '#fff' }}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Clear filters & match count */}
              {isFiltering && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                    Showing {filteredTasks.length} of {tasks.length}
                  </span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'Outfit, sans-serif',
                      color: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 6,
                    }}
                  >
                    <X size={12} /> Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ Board view ══ */}
          {tab === 'board' && (
            <div className="kanban-board-container">
              {STATUS_COLS.map((col) => (
                <KanbanColumn
                  key={col.key}
                  col={col}
                  tasks={tasksByStatus[col.key] || []}
                  count={tasksByStatus[col.key]?.length ?? 0}
                  myRole={myRole}
                  currentUserId={user?._id}
                  onDropTask={handleStatusChange}
                  onStatusChange={handleStatusChange}
                  onEdit={openEditTask}
                  onDelete={setDeleteTaskTarget}
                  onOpenComments={setCommentTask}
                />
              ))}
            </div>
          )}

          {/* ══ List view ══ */}
          {tab === 'list' && (
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['Task', 'Status', 'Priority', 'Assignee', 'Due Date', 'Comments', ''].map((h, i) => (
                      <th key={h || `actions-${i}`} style={{ padding: '16px 20px', textAlign: 'left', fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '60px', textAlign: 'center', fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
                        {isFiltering ? (
                          <span>
                            No tasks match your filters.{' '}
                            <button
                              type="button"
                              onClick={resetFilters}
                              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Clear filters
                            </button>
                          </span>
                        ) : (
                          'No tasks yet. Create one to get started.'
                        )}
                      </td>
                    </tr>
                  ) : filteredTasks.map((t) => {
                    const isOverdue = !!t.dueDate && t.status !== 'done' && new Date() > new Date(t.dueDate);
                    const isAssignedToMe = user?._id ? t.assignedTo?._id === user._id : true;
                    const canUpdateStatus = myRole === 'admin' || isAssignedToMe;
                    return (
                      <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '16px 20px', fontSize: 14, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: 'var(--text-primary)', maxWidth: 300 }}>{t.title}</td>
                        <td style={{ padding: '16px 20px' }}>
                          <select
                            value={t.status}
                            disabled={!canUpdateStatus}
                            onChange={(e) => handleStatusChange(t._id, e.target.value as TaskStatus)}
                            style={{
                              fontSize: 12,
                              padding: '6px 12px',
                              width: 'auto',
                              background: 'rgba(255,255,255,0.03)',
                              cursor: canUpdateStatus ? 'pointer' : 'not-allowed',
                              opacity: canUpdateStatus ? 1 : 0.6,
                            }}
                            title={!canUpdateStatus ? 'Only the assignee or an admin can update task status' : ''}
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </select>
                        </td>
                        <td style={{ padding: '16px 20px' }}><span className={`badge badge-${t.priority}`}>{t.priority}</span></td>
                        <td style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif' }}>
                          {t.assignedTo?.name ?? '—'}
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: 13, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <button onClick={() => setCommentTask(t)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                            <MessageSquare size={16} />
                            {t.comments?.length > 0 && <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif' }}>{t.comments.length}</span>}
                          </button>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {myRole === 'admin' && (
                              <>
                                <button onClick={() => openEditTask(t)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 6, borderRadius: 6, transition: 'all 0.2s' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(129, 140, 248, 0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                                  <Pencil size={16} />
                                </button>
                                <button onClick={() => setDeleteTaskTarget(t)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 6, borderRadius: 6, transition: 'all 0.2s' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
                                  <Trash2 size={16} />
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
            <div style={{ maxWidth: 800 }}>
              {members.map((m) => (
                <div key={m._id} style={{ 
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12,
                  padding: '16px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                >
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 600, flexShrink: 0 }}>
                      {m.user?.name?.[0]?.toUpperCase()}
                    </div>
                    {/* Status Dot */}
                    <span style={{ position:'absolute', bottom:-2, right:-2, width:12, height:12, borderRadius:'50%', background: m.user?.isClockedIn ? '#4ade80' : 'var(--text-muted)', border:'2px solid #0a0a0f', boxShadow: m.user?.isClockedIn ? '0 0 8px #4ade80' : 'none' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>{m.user?.name}</div>
                    <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>{m.user?.email}</div>
                    <div style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)', marginTop: 4 }}>
                      {m.user?.isClockedIn 
                        ? `Clocked in at ${m.user?.lastClockIn ? new Date(m.user.lastClockIn).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown'}` 
                        : m.user?.lastClockOut 
                          ? `Clocked out at ${new Date(m.user.lastClockOut).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
                          : 'Offline'}
                    </div>
                  </div>

                  <span className={`badge badge-${m.role}`} style={{ fontSize: 13 }}>{m.role}</span>

                  {myRole === 'admin' && m.user?._id !== user?._id && (
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={() => setEditingMember({ ...m })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 8, borderRadius: 8, transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        title="Change role"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => removeMember(m.user._id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 8, borderRadius: 8, transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        title="Remove member"
                      >
                        <Trash2 size={16} />
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

      {/* ══ Comments Modal ══ */}
      {commentTask && (
        <CommentsPanel
          task={commentTask}
          projectId={id}
          currentUserId={user?._id || ''}
          myRole={myRole}
          members={members}
          onClose={() => setCommentTask(null)}
          onCommentsUpdate={(taskId, newComments) => {
            setTasks((prev) =>
              prev.map((t) => (t._id === taskId ? { ...t, comments: newComments } : t))
            );
          }}
        />
      )}

      {/* ══ Add Member Modal ══ */}
      {showMemberModal && (
        <Modal title="Add Member" onClose={() => setShowMemberModal(false)} width={420}>
          <form onSubmit={addMember}>
            <div style={{ marginBottom: 20 }}>
              <FieldLabel>Email Address</FieldLabel>
              <input type="email" required placeholder="member@company.com" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} />
            </div>
            <div style={{ marginBottom: 32 }}>
              <FieldLabel>Role</FieldLabel>
              <select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as 'admin' | 'member' })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setShowMemberModal(false)} style={{ padding: '10px 20px' }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '10px 24px' }}>{saving ? 'Adding…' : 'Add Member'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ Edit Member Role Modal ══ */}
      {editingMember && (
        <Modal title="Edit Role" onClose={() => setEditingMember(null)} width={400}>
          <form onSubmit={saveRoleChange}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#fff', fontWeight: 600, fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
                {editingMember.user?.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>{editingMember.user?.name}</div>
                <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>{editingMember.user?.email}</div>
              </div>
            </div>
            <div style={{ marginBottom: 32 }}>
              <FieldLabel>New Role</FieldLabel>
              <select
                value={editingMember.role}
                onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value as 'admin' | 'member' })}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setEditingMember(null)} style={{ padding: '10px 20px' }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '10px 24px' }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </Modal>
      )}
      
      {/* ══ Delete Task Target Modal ══ */}
      {deleteTaskTarget && (
        <Modal title="Delete Task" onClose={() => setDeleteTaskTarget(null)} width={420}>
          <p style={{ color:'var(--text-secondary)', fontSize: 14, fontFamily: 'Outfit, sans-serif', marginBottom: 28, lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color:'var(--text-primary)' }}>{deleteTaskTarget.title}</strong>? This action cannot be undone.
          </p>
          <div style={{ display:'flex', gap: 12, justifyContent:'flex-end' }}>
            <button className="btn-ghost" onClick={() => setDeleteTaskTarget(null)} style={{ padding: '10px 20px' }}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444', padding: '10px 24px' }} onClick={confirmDeleteTask}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}