'use client';
import { useEffect, useState, useRef, useMemo, FormEvent, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, tasksApi, meetingsApi, getPersonalizedMeetLink, cyclesApi, modulesApi } from '@/lib/api';
import type { Project, ProjectMember, Task, TaskStatus, TaskPriority, Comment, ChecklistItem, Meeting, User as ApiUser, Cycle, Module, CycleStatus, ModuleStatus } from '@/lib/api';
import { useTimer } from '@/lib/timer-context';
import { useToast } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Modal from '@/components/Model';
import { BoardSkeleton } from '@/components/Skeletons';
import { formatTimeAgo } from '@/lib/format';
import { triggerConfetti } from '@/lib/confetti';
import {
  Plus, ArrowLeft, ArrowRight, Trash2, UserPlus, Pencil,
  MessageSquare, CornerDownLeft, GripVertical,
  Search, X, User, Users, CheckSquare, Download, ExternalLink, Clock,
  Video, Calendar, Copy, Check, ChevronDown, ChevronUp, Lock,
  Zap, Package, Flag, AlertCircle, ArrowUpRight, Play, CheckCircle2, PauseCircle, Layers
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLS: Array<{ key: TaskStatus; label: string; color: string }> = [
  { key: 'backlog',     label: 'Backlog',     color: '#94a3b8' },
  { key: 'todo',        label: 'To Do',       color: '#cbd5e1' },
  { key: 'in_progress', label: 'In Progress',  color: '#818cf8' },
  { key: 'in_review',   label: 'In Review',   color: '#38bdf8' },
  { key: 'done',        label: 'Done',         color: '#4ade80' },
  { key: 'canceled',    label: 'Canceled',    color: '#64748b' },
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const ROLES: Array<'admin' | 'member'> = ['admin', 'member'];
const DEFAULT_TAG_PRESETS = ['bug', 'feature', 'frontend', 'backend', 'design', 'v1.0'];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#4ade80',
  medium: '#fbbf24',
  high: '#fb923c',
  urgent: '#f87171',
};

function formatMinutes(min?: number): string {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ─── Task helper ──────────────────────────────────────────────────────────────

function getTaskAssignees(task: Task): ApiUser[] {
  if (!task.assignedTo) return [];
  if (Array.isArray(task.assignedTo)) return task.assignedTo.filter(Boolean) as unknown as ApiUser[];
  if (typeof task.assignedTo === 'object') return [task.assignedTo as unknown as ApiUser];
  return [];
}

// ─── Task form shape ──────────────────────────────────────────────────────────

interface TaskFormState {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assignedTo: string[];
  status: TaskStatus;
  tags: string[];
  checklist: ChecklistItem[];
  estimatedHours?: number;
  cycle?: string;
  module?: string;
}

const EMPTY_TASK_FORM: TaskFormState = {
  title: '', description: '', priority: 'medium',
  dueDate: '', assignedTo: [], status: 'todo',
  tags: [], checklist: [], estimatedHours: 0,
  cycle: '', module: '',
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
  onUpdateChecklist?: (taskId: string, checklist: ChecklistItem[]) => void;
}

function TaskCard({ task, myRole, currentUserId, onStatusChange, onEdit, onDelete, onOpenComments, onUpdateChecklist }: TaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const isOverdue = !!task.dueDate && task.status !== 'done' && new Date() > new Date(task.dueDate);
  const pColor = PRIORITY_COLORS[task.priority] || 'var(--accent-primary)';
  const assignees = getTaskAssignees(task);
  const isAssignedToMe = currentUserId ? (assignees.length === 0 || assignees.some((u) => u._id === currentUserId)) : true;
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
          <span
            onClick={() => onOpenComments(task)}
            style={{ fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4, cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            title="Click to view details & subtasks"
          >
            {task.title}
          </span>
        </div>
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
      </div>

      {/* Agile Sprints & Feature Modules badges */}
      {(task.cycle || task.module) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {task.cycle && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'rgba(234, 179, 8, 0.1)',
                color: '#facc15',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Assigned Sprint Cycle"
            >
              <span>⚡</span>
              {typeof task.cycle === 'object' && task.cycle ? task.cycle.name : 'Cycle'}
            </span>
          )}
          {task.module && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'rgba(168, 85, 247, 0.1)',
                color: '#c084fc',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Feature Module"
            >
              <span>📦</span>
              {typeof task.module === 'object' && task.module ? task.module.name : 'Module'}
            </span>
          )}
        </div>
      )}

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

      {/* Checklist / Subtasks progress & list */}
      {task.checklist && task.checklist.length > 0 && (
        (() => {
          const total = task.checklist.length;
          const doneCount = task.checklist.filter((item) => item.completed).length;
          const pct = Math.round((doneCount / total) * 100);
          return (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.04)' }}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowChecklist((prev) => !prev);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showChecklist ? 8 : 5, fontSize: 11, fontFamily: 'Outfit, sans-serif', cursor: 'pointer', userSelect: 'none' }}
                title="Click to expand/collapse subtasks"
              >
                <span style={{ color: doneCount === total ? '#4ade80' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                  <CheckSquare size={12} color={doneCount === total ? '#4ade80' : 'var(--accent-primary)'} />
                  {doneCount}/{total} subtasks
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                  <span>{pct}%</span>
                  {showChecklist ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
              </div>
              <div style={{ height: 3, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: doneCount === total ? '#4ade80' : 'var(--accent-primary)', transition: 'width 0.3s' }} />
              </div>

              {/* Expanded subtask items */}
              {showChecklist && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  {task.checklist.map((item, idx) => (
                    <label
                      key={item._id || idx}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        fontFamily: 'Outfit, sans-serif',
                        color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                        cursor: canUpdateStatus ? 'pointer' : 'default',
                        textDecoration: item.completed ? 'line-through' : 'none',
                        transition: 'color 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        disabled={!canUpdateStatus}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (!canUpdateStatus) return;
                          const nextChecklist = task.checklist!.map((c, i) =>
                            i === idx ? { ...c, completed: !c.completed } : c
                          );
                          onUpdateChecklist?.(task._id, nextChecklist);
                        }}
                        style={{
                          width: 14,
                          height: 14,
                          cursor: canUpdateStatus ? 'pointer' : 'default',
                          accentColor: 'var(--accent-primary)',
                        }}
                      />
                      <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.3 }}>
                        {item.title}
                      </span>
                    </label>
                  ))}

                  {/* Quick add subtask for assignee or admin */}
                  {canUpdateStatus && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Add subtask…"
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = newSubtaskTitle.trim();
                            if (!val) return;
                            const nextChecklist = [...(task.checklist || []), { title: val, completed: false }];
                            onUpdateChecklist?.(task._id, nextChecklist);
                            setNewSubtaskTitle('');
                          }
                        }}
                        style={{
                          flex: 1,
                          fontSize: 11,
                          padding: '4px 8px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = newSubtaskTitle.trim();
                          if (!val) return;
                          const nextChecklist = [...(task.checklist || []), { title: val, completed: false }];
                          onUpdateChecklist?.(task._id, nextChecklist);
                          setNewSubtaskTitle('');
                        }}
                        style={{
                          background: 'rgba(129, 140, 248, 0.15)',
                          border: '1px solid rgba(129, 140, 248, 0.3)',
                          borderRadius: 6,
                          color: '#a5b4fc',
                          fontSize: 11,
                          padding: '0 8px',
                          cursor: 'pointer',
                        }}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()
      )}

      {/* Assignees + due date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {assignees.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {assignees.slice(0, 3).map((u, i) => (
                <div
                  key={u._id || i}
                  title={u.name}
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#fff', fontWeight: 600, fontFamily: 'Outfit, sans-serif',
                    marginLeft: i > 0 ? -8 : 0,
                    border: '2px solid rgba(15, 23, 42, 0.9)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    overflow: 'hidden',
                  }}
                >
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    u.name?.[0]?.toUpperCase()
                  )}
                </div>
              ))}
              {assignees.length > 3 && (
                <div
                  title={assignees.slice(3).map((u) => u.name).join(', ')}
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'Outfit, sans-serif',
                    marginLeft: -8,
                    border: '2px solid rgba(15, 23, 42, 0.9)',
                  }}
                >
                  +{assignees.length - 3}
                </div>
              )}
            </div>
            <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>
              {assignees.length === 1
                ? assignees[0].name.split(' ')[0]
                : `${assignees.length} assigned`}
            </span>
          </div>
        )}
        {task.dueDate && (
          <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: isOverdue ? '#f87171' : 'var(--text-muted)' }}>
            {isOverdue ? '⚠ ' : ''}{new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
        {Boolean((task.loggedMinutes && task.loggedMinutes > 0) || (task.estimatedHours && task.estimatedHours > 0)) && (
          <span
            onClick={() => onOpenComments(task)}
            style={{
              fontSize: 11,
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 500,
              padding: '2px 7px',
              borderRadius: 6,
              background: 'rgba(56, 189, 248, 0.08)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
            title={`Time Logged: ${formatMinutes(task.loggedMinutes || 0)}${task.estimatedHours ? ` / Estimated: ${task.estimatedHours}h` : ''}`}
          >
            <Clock size={11} />
            {formatMinutes(task.loggedMinutes || 0)}{task.estimatedHours ? ` / ${task.estimatedHours}h` : ''}
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
          <option value="backlog">Backlog</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
          <option value="canceled">Canceled</option>
        </select>

        <div style={{ display: 'flex', gap: 6 }}>
          {/* Subtasks button */}
          <button
            onClick={() => onOpenComments(task)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
            title="Subtasks & details"
          >
            <CheckSquare size={14} color={task.checklist && task.checklist.length > 0 ? 'var(--accent-primary)' : 'var(--text-muted)'} />
            {task.checklist && task.checklist.length > 0 && (
              <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif' }}>
                {task.checklist.filter(c => c.completed).length}/{task.checklist.length}
              </span>
            )}
          </button>

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
  onUpdateChecklist?: (taskId: string, checklist: ChecklistItem[]) => void;
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
  onUpdateChecklist,
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
            onUpdateChecklist={onUpdateChecklist}
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
  cycles?: Cycle[];
  modules?: Module[];
  onClose: () => void;
  onCommentsUpdate?: (taskId: string, comments: Comment[]) => void;
  onChecklistUpdate?: (taskId: string, checklist: ChecklistItem[]) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  onTaskUpdate?: (updatedTask: Task) => void;
}

const QUICK_REACTIONS = [
  { label: '👍 Looks good', text: '👍 Looks good!' },
  { label: '🚀 Shipped', text: '🚀 Shipped and verified.' },
  { label: '👀 Reviewing', text: '👀 Taking a look now.' },
  { label: '❤️ Thanks', text: '❤️ Thanks for the update!' },
  { label: '🎉 Great job', text: '🎉 Awesome job on this!' },
];

function CommentsPanel({
  task,
  projectId,
  currentUserId,
  myRole,
  members = [],
  cycles = [],
  modules = [],
  onClose,
  onCommentsUpdate,
  onChecklistUpdate,
  onStatusChange,
  onTaskUpdate,
}: CommentsPanelProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState<Comment[]>(task.comments || []);
  const [taskChecklist, setTaskChecklist] = useState<ChecklistItem[]>(task.checklist || []);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Agile & Time Logging State
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(task.status);
  const [taskCycle, setTaskCycle] = useState<string>(
    typeof task.cycle === 'object' && task.cycle ? task.cycle._id : (typeof task.cycle === 'string' ? task.cycle : '')
  );
  const [taskModule, setTaskModule] = useState<string>(
    typeof task.module === 'object' && task.module ? task.module._id : (typeof task.module === 'string' ? task.module : '')
  );
  const [timeLogs, setTimeLogs] = useState(task.timeLogs || []);
  const [loggedMinutes, setLoggedMinutes] = useState(task.loggedMinutes || 0);
  const [estimatedHours, setEstimatedHours] = useState(task.estimatedHours || 0);

  const handleCycleUpdate = async (newCycleId: string) => {
    setTaskCycle(newCycleId);
    try {
      const res = await tasksApi.update(projectId, task._id, { cycle: newCycleId || null });
      toast('Sprint cycle updated', 'success');
      if (onTaskUpdate && res.task) onTaskUpdate(res.task);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update cycle', 'error');
    }
  };

  const handleModuleUpdate = async (newModuleId: string) => {
    setTaskModule(newModuleId);
    try {
      const res = await tasksApi.update(projectId, task._id, { module: newModuleId || null });
      toast('Feature module updated', 'success');
      if (onTaskUpdate && res.task) onTaskUpdate(res.task);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update module', 'error');
    }
  };

  // Global Persistent Timer Hook
  const {
    activeTimer,
    elapsedSeconds,
    startTimer,
    stopAndLog,
    cancelTimer,
    formatStopwatch,
  } = useTimer();

  const isCurrentTaskTiming = activeTimer?.taskId === task._id;

  // Manual Time Log State
  const [showLogForm, setShowLogForm] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [submittingTime, setSubmittingTime] = useState(false);
  const [showLogsList, setShowLogsList] = useState(false);

  const assignees = getTaskAssignees(task);
  const isAssignedToMe = currentUserId
    ? (assignees.length === 0 || assignees.some((u) => u._id === currentUserId))
    : true;
  const canManageChecklist = myRole === 'admin' || isAssignedToMe;

  // Listen for real-time time-logged events (e.g. from the floating widget or other controls)
  useEffect(() => {
    const handleTimeLogged = (e: any) => {
      if (e.detail?.taskId === task._id && e.detail?.updatedTask) {
        const updated = e.detail.updatedTask;
        if (updated.timeLogs) setTimeLogs(updated.timeLogs);
        if (typeof updated.loggedMinutes === 'number') setLoggedMinutes(updated.loggedMinutes);
        if (updated.comments) {
          setComments(updated.comments);
          if (onCommentsUpdate) onCommentsUpdate(task._id, updated.comments);
        }
        if (onTaskUpdate) onTaskUpdate(updated);
      }
    };
    window.addEventListener('taskforge:timelogged', handleTimeLogged);
    return () => window.removeEventListener('taskforge:timelogged', handleTimeLogged);
  }, [task._id, onCommentsUpdate, onTaskUpdate]);

  // Fetch freshly populated task comments and checklist on open
  useEffect(() => {
    let active = true;
    tasksApi
      .get(projectId, task._id)
      .then((res) => {
        if (!active) return;
        if (res?.task) {
          if (res.task.comments) {
            setComments(res.task.comments);
            if (onCommentsUpdate) onCommentsUpdate(task._id, res.task.comments);
          }
          if (res.task.checklist) {
            setTaskChecklist(res.task.checklist);
            if (onChecklistUpdate) onChecklistUpdate(task._id, res.task.checklist);
          }
          if (res.task.timeLogs) setTimeLogs(res.task.timeLogs);
          if (typeof res.task.loggedMinutes === 'number') setLoggedMinutes(res.task.loggedMinutes);
          if (typeof res.task.estimatedHours === 'number') setEstimatedHours(res.task.estimatedHours);
          if (res.task.status) setTaskStatus(res.task.status);
          if (onTaskUpdate) onTaskUpdate(res.task);
        }
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [projectId, task._id, onCommentsUpdate, onChecklistUpdate, onTaskUpdate]);

  const handleStatusUpdate = async (newStatus: TaskStatus) => {
    setTaskStatus(newStatus);
    if (onStatusChange) onStatusChange(task._id, newStatus);
    try {
      const res = await tasksApi.update(projectId, task._id, { status: newStatus });
      if (res.success && res.task) {
        if (onTaskUpdate) onTaskUpdate(res.task);
        toast(`Task moved to ${STATUS_COLS.find((c) => c.key === newStatus)?.label || newStatus}`);
      }
    } catch {
      toast('Failed to update status', 'error');
    }
  };

  const handleLogManualTime = async (mins: number, note: string) => {
    if (mins <= 0) return;
    try {
      setSubmittingTime(true);
      const res = await tasksApi.logTime(projectId, task._id, { minutes: mins, description: note });
      if (res.success && res.task) {
        toast(`Logged ${formatMinutes(mins)} to task! ⏱️`, 'success');
        setTimeLogs(res.task.timeLogs || []);
        setLoggedMinutes(res.task.loggedMinutes || 0);
        if (res.task.comments) {
          setComments(res.task.comments);
          if (onCommentsUpdate) onCommentsUpdate(task._id, res.task.comments);
        }
        if (onTaskUpdate) onTaskUpdate(res.task);
        setManualMinutes('');
        setManualDesc('');
        setShowLogForm(false);
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to log time', 'error');
    } finally {
      setSubmittingTime(false);
    }
  };

  const handleStopAndLogTimer = async () => {
    setSubmittingTime(true);
    await stopAndLog();
    setSubmittingTime(false);
  };

  const handleToggleChecklist = async (idx: number) => {
    const updated = taskChecklist.map((item, i) =>
      i === idx ? { ...item, completed: !item.completed } : item
    );
    setTaskChecklist(updated);
    if (onChecklistUpdate) onChecklistUpdate(task._id, updated);
    try {
      await tasksApi.update(projectId, task._id, { checklist: updated });
      const completedCount = updated.filter((c) => c.completed).length;
      if (completedCount === updated.length && updated.length > 0) {
        toast('All subtasks completed! 🎉', 'success');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update subtask', 'error');
    }
  };

  const handleAddChecklist = async () => {
    const trimmed = newChecklistText.trim();
    if (!trimmed) return;
    const updated = [...taskChecklist, { title: trimmed, completed: false }];
    setTaskChecklist(updated);
    setNewChecklistText('');
    if (onChecklistUpdate) onChecklistUpdate(task._id, updated);
    try {
      await tasksApi.update(projectId, task._id, { checklist: updated });
      toast('Subtask added', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to add subtask', 'error');
    }
  };

  const handleRemoveChecklist = async (idx: number) => {
    const updated = taskChecklist.filter((_, i) => i !== idx);
    setTaskChecklist(updated);
    if (onChecklistUpdate) onChecklistUpdate(task._id, updated);
    try {
      await tasksApi.update(projectId, task._id, { checklist: updated });
      toast('Subtask removed', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to remove subtask', 'error');
    }
  };

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
        avatar: (isMe && user?.avatar) ? user.avatar : (c.user.avatar || null),
      };
    }

    const rawId = typeof c.user === 'string' ? c.user : c.user?._id;

    if (rawId && (rawId === currentUserId || (user?._id && rawId === user._id))) {
      return {
        id: currentUserId,
        name: user?.name || 'You',
        isMe: true,
        initial: (user?.name?.[0] || 'Y').toUpperCase(),
        avatar: user?.avatar || null,
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
          avatar: found.user.avatar || null,
        };
      }
    }

    const assignedUser = assignees.find((u) => u._id === rawId);
    if (assignedUser && assignedUser.name) {
      return {
        id: assignedUser._id,
        name: assignedUser.name,
        isMe: false,
        initial: (assignedUser.name[0] || 'U').toUpperCase(),
        avatar: assignedUser.avatar || null,
      };
    }

    if (rawId && task.createdBy?._id === rawId && task.createdBy.name) {
      return {
        id: task.createdBy._id,
        name: task.createdBy.name,
        isMe: false,
        initial: (task.createdBy.name[0] || 'U').toUpperCase(),
        avatar: task.createdBy.avatar || null,
      };
    }

    return {
      id: rawId || '',
      name: 'Team Member',
      isMe: false,
      initial: 'U',
      avatar: null,
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
    <Modal title={`Task Details & Discussion — ${task.title}`} onClose={onClose} width={580}>
      {/* Task preview header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge badge-${task.priority}`}>{task.priority}</span>
          <select
            value={taskStatus}
            disabled={!canManageChecklist}
            onChange={(e) => handleStatusUpdate(e.target.value as TaskStatus)}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-primary)',
              fontFamily: 'Outfit, sans-serif',
              cursor: canManageChecklist ? 'pointer' : 'not-allowed',
            }}
          >
            <option value="backlog">Backlog</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          {task.dueDate && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
              Due: {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </span>
        </div>
      </div>

      {/* Agile Sprint & Feature Module Quick Selectors */}
      {(cycles.length > 0 || modules.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '10px 14px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.04)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
            <Zap size={13} color="#facc15" />
            <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', fontWeight: 500 }}>Sprint:</span>
            {myRole === 'admin' ? (
              <select
                value={taskCycle}
                onChange={(e) => handleCycleUpdate(e.target.value)}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: taskCycle ? '#facc15' : 'var(--text-muted)',
                  fontFamily: 'Outfit, sans-serif',
                  cursor: 'pointer',
                  flex: 1,
                }}
              >
                <option value="">No Sprint (Backlog)</option>
                {cycles.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.status === 'current' ? '⚡ Active' : c.status})
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 11, color: taskCycle ? '#facc15' : 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', fontWeight: 500 }}>
                {cycles.find((c) => c._id === taskCycle)?.name || 'Backlog'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200 }}>
            <Package size={13} color="#c084fc" />
            <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', fontWeight: 500 }}>Module:</span>
            {myRole === 'admin' ? (
              <select
                value={taskModule}
                onChange={(e) => handleModuleUpdate(e.target.value)}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: taskModule ? '#c084fc' : 'var(--text-muted)',
                  fontFamily: 'Outfit, sans-serif',
                  cursor: 'pointer',
                  flex: 1,
                }}
              >
                <option value="">No Module</option>
                {modules.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 11, color: taskModule ? '#c084fc' : 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', fontWeight: 500 }}>
                {modules.find((m) => m._id === taskModule)?.name || 'None'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Task description if present */}
      {task.description && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.04)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.5, margin: 0 }}>
            {task.description}
          </p>
        </div>
      )}

      {/* Time Tracking Section */}
      <div style={{ marginBottom: 18, padding: 14, background: 'rgba(255, 255, 255, 0.025)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="#38bdf8" />
            Time Tracking
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500 }}>
              {formatMinutes(loggedMinutes)}
              {estimatedHours > 0 ? ` / ${estimatedHours}h` : ''}
            </span>
            {estimatedHours > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                ({Math.round((loggedMinutes / (estimatedHours * 60)) * 100)}%)
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {estimatedHours > 0 && (
          <div style={{ height: 4, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.round((loggedMinutes / (estimatedHours * 60)) * 100))}%`,
                background: loggedMinutes > estimatedHours * 60 ? '#f87171' : 'linear-gradient(90deg, #38bdf8, #818cf8)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}

        {/* Actions row: Live stopwatch & Manual Log Time button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          {/* Stopwatch Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isCurrentTaskTiming ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '4px 10px', borderRadius: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#f87171', fontWeight: 600 }}>
                  {formatStopwatch(elapsedSeconds)}
                </span>
                <button
                  type="button"
                  onClick={handleStopAndLogTimer}
                  disabled={submittingTime}
                  style={{
                    background: '#ef4444',
                    border: 'none',
                    color: '#fff',
                    fontSize: 11,
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {submittingTime ? 'Logging…' : 'Stop & Log'}
                </button>
                <button
                  type="button"
                  onClick={cancelTimer}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
                >
                  Cancel
                </button>
              </div>
            ) : activeTimer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                  Timing &quot;{activeTimer.taskTitle.slice(0, 15)}…&quot; ({formatStopwatch(elapsedSeconds)})
                </span>
                <button
                  type="button"
                  onClick={() => startTimer(task, projectId)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    color: '#38bdf8',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'Outfit, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  Switch timer to this task
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startTimer(task, projectId)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  color: '#38bdf8',
                  padding: '5px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Clock size={13} /> Start Timer
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowLogForm((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'Outfit, sans-serif',
                cursor: 'pointer',
              }}
            >
              <Plus size={13} /> {showLogForm ? 'Hide Log' : 'Manual Log'}
            </button>
            {timeLogs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLogsList((prev) => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontFamily: 'Outfit, sans-serif',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {timeLogs.length} logs {showLogsList ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
          </div>
        </div>

        {/* Manual Log Inputs Form */}
        {showLogForm && (
          <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 255, 255, 0.02)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.04)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {[15, 30, 45, 60, 120].map((quickMins) => (
                <button
                  key={quickMins}
                  type="button"
                  onClick={() => setManualMinutes(quickMins.toString())}
                  style={{
                    background: manualMinutes === quickMins.toString() ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    border: manualMinutes === quickMins.toString() ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.06)',
                    color: manualMinutes === quickMins.toString() ? '#38bdf8' : 'var(--text-secondary)',
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'Outfit, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  +{formatMinutes(quickMins)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                min={1}
                placeholder="Minutes (e.g. 45)"
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                style={{ width: 130, fontSize: 12, padding: '6px 10px' }}
              />
              <input
                type="text"
                placeholder="Work description / note…"
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={submittingTime || !manualMinutes || parseInt(manualMinutes, 10) <= 0}
                onClick={() => handleLogManualTime(parseInt(manualMinutes, 10), manualDesc.trim())}
                style={{ fontSize: 12, padding: '0 12px' }}
              >
                {submittingTime ? 'Logging…' : 'Log'}
              </button>
            </div>
          </div>
        )}

        {/* Time Logs History List */}
        {showLogsList && timeLogs.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
            {timeLogs.map((tl: any, i: number) => {
              const tlUser = typeof tl.user === 'object' ? tl.user : members.find((m) => m.user._id === tl.user)?.user;
              const name = tlUser?.name || 'Member';
              return (
                <div
                  key={tl._id || i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.015)',
                    border: '1px solid rgba(255, 255, 255, 0.03)',
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{name}</span>
                    {tl.description && (
                      <span style={{ color: 'var(--text-secondary)' }}>— {tl.description}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>{formatMinutes(tl.minutes)}</span>
                    <span style={{ fontSize: 11 }}>{new Date(tl.loggedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subtasks Checklist Section */}
      <div style={{ marginBottom: 20, padding: 14, background: 'rgba(255, 255, 255, 0.025)', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckSquare size={14} color="var(--accent-primary)" />
            Subtask Checklist {taskChecklist.length > 0 && `(${taskChecklist.filter(c => c.completed).length}/${taskChecklist.length})`}
          </span>
          {taskChecklist.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
              {Math.round((taskChecklist.filter(c => c.completed).length / taskChecklist.length) * 100)}% done
            </span>
          )}
        </div>

        {/* Progress bar */}
        {taskChecklist.length > 0 && (
          <div style={{ height: 4, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
            <div
              style={{
                height: '100%',
                width: `${Math.round((taskChecklist.filter(c => c.completed).length / taskChecklist.length) * 100)}%`,
                background: taskChecklist.every(c => c.completed) ? '#4ade80' : 'var(--accent-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}

        {/* Existing subtasks */}
        {taskChecklist.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: canManageChecklist ? 10 : 0 }}>
            {taskChecklist.map((item, idx) => (
              <div
                key={item._id || idx}
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
                  disabled={!canManageChecklist}
                  onChange={() => handleToggleChecklist(idx)}
                  style={{ width: 16, height: 16, cursor: canManageChecklist ? 'pointer' : 'default', accentColor: 'var(--accent-primary)' }}
                />
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: 'Outfit, sans-serif',
                    color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: item.completed ? 'line-through' : 'none',
                    lineHeight: 1.4,
                  }}
                >
                  {item.title}
                </span>
                {canManageChecklist && (
                  <button
                    type="button"
                    onClick={() => handleRemoveChecklist(idx)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
                    title="Remove subtask"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', marginBottom: canManageChecklist ? 10 : 0 }}>
            No subtasks yet. {canManageChecklist ? 'Add your first subtask checklist item below:' : ''}
          </p>
        )}

        {/* Add subtask input */}
        {canManageChecklist && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Add subtask checklist item…"
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddChecklist();
                }
              }}
              style={{ flex: 1, fontSize: 12, padding: '7px 10px' }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleAddChecklist}
              style={{ padding: '0 12px', fontSize: 12 }}
            >
              + Add
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingTop: 4 }}>
        <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageSquare size={14} color="var(--accent-primary)" />
          Discussion
        </span>
      </div>

      {/* Comment list */}
      <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 20, paddingRight: 6, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  {author.avatar ? (
                    <img
                      src={author.avatar}
                      alt={author.name}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        flexShrink: 0,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'rgba(129, 140, 248, 0.2)',
                        color: 'var(--accent-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {userInitial}
                    </div>
                  )}
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
                    <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{author.name}</strong>{' '}
                    {c.text}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    <Clock size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                    <span>{formatTimeAgo(c.createdAt)}</span>
                  </div>
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
                    overflow: 'hidden',
                  }}
                >
                  {author.avatar ? (
                    <img
                      src={author.avatar}
                      alt={author.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    userInitial
                  )}
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
  const [projectTags, setProjectTags] = useState<string[]>([]);
  const [members, setMembers]   = useState<ProjectMember[]>([]);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [myRole, setMyRole]     = useState<'admin' | 'member'>('member');
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'board' | 'list' | 'calendar' | 'cycles' | 'modules' | 'meetings' | 'members'>('board');
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());

  // Cycles (Sprints) State
  const [cycles, setCycles]                                   = useState<Cycle[]>([]);
  const [loadingCycles, setLoadingCycles]                     = useState(false);
  const [showCycleModal, setShowCycleModal]                   = useState(false);
  const [editingCycle, setEditingCycle]                       = useState<Cycle | null>(null);
  const [cycleName, setCycleName]                             = useState('');
  const [cycleDescription, setCycleDescription]               = useState('');
  const [cycleStartDate, setCycleStartDate]                   = useState('');
  const [cycleEndDate, setCycleEndDate]                       = useState('');
  const [cycleStatus, setCycleStatus]                         = useState<CycleStatus>('upcoming');
  const [submittingCycle, setSubmittingCycle]                 = useState(false);
  const [deleteCycleTarget, setDeleteCycleTarget]             = useState<Cycle | null>(null);

  // Rollover Cycle State
  const [rolloverModalCycle, setRolloverModalCycle]           = useState<Cycle | null>(null);
  const [rolloverTargetCycleId, setRolloverTargetCycleId]     = useState<string>('');
  const [submittingRollover, setSubmittingRollover]           = useState(false);

  // Feature Modules State
  const [modules, setModules]                                 = useState<Module[]>([]);
  const [loadingModules, setLoadingModules]                   = useState(false);
  const [showModuleModal, setShowModuleModal]                 = useState(false);
  const [editingModule, setEditingModule]                     = useState<Module | null>(null);
  const [moduleName, setModuleName]                           = useState('');
  const [moduleDescription, setModuleDescription]             = useState('');
  const [moduleStatus, setModuleStatus]                       = useState<ModuleStatus>('planned');
  const [moduleStartDate, setModuleStartDate]                 = useState('');
  const [moduleTargetDate, setModuleTargetDate]               = useState('');
  const [moduleLead, setModuleLead]                           = useState('');
  const [submittingModule, setSubmittingModule]               = useState(false);
  const [deleteModuleTarget, setDeleteModuleTarget]           = useState<Module | null>(null);

  // Project Meetings Tab State
  const [projectMeetings, setProjectMeetings]                 = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings]                 = useState(false);
  const [showProjectMeetingModal, setShowProjectMeetingModal] = useState(false);
  const [meetingTitle, setMeetingTitle]                       = useState('');
  const [meetingStartTime, setMeetingStartTime]               = useState('');
  const [meetingDuration, setMeetingDuration]                 = useState(30);
  const [meetingMeetLink, setMeetingMeetLink]                 = useState('');
  const [meetingAgenda, setMeetingAgenda]                     = useState<string[]>(['Sprint sync & blockers']);
  const [submittingMeeting, setSubmittingMeeting]             = useState(false);
  const [copiedMeetingId, setCopiedMeetingId]                 = useState<string | null>(null);

  // Modals
  const [showTaskModal, setShowTaskModal]       = useState(false);
  const [showMemberModal, setShowMemberModal]   = useState(false);
  const [editingTask, setEditingTask]           = useState<Task | null>(null);   // null = create, Task = edit
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);
  const [commentTask, setCommentTask]           = useState<Task | null>(null);
  const [editingMember, setEditingMember]       = useState<ProjectMember | null>(null);
  const [isTagDeleteMode, setIsTagDeleteMode]   = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery]         = useState('');
  const [filterPriority, setFilterPriority]   = useState('');
  const [filterAssignee, setFilterAssignee]   = useState('');
  const [filterCycle, setFilterCycle]         = useState('');
  const [filterModule, setFilterModule]       = useState('');
  const [onlyMyTasks, setOnlyMyTasks]         = useState(false);

  const isFiltering = !!(searchQuery.trim() || filterPriority || filterAssignee || filterCycle || filterModule || onlyMyTasks);

  const resetFilters = () => {
    setSearchQuery('');
    setFilterPriority('');
    setFilterAssignee('');
    setFilterCycle('');
    setFilterModule('');
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
      const [pRes, tRes, cRes, mRes] = await Promise.all([
        projectsApi.get(id),
        tasksApi.list(id, { limit: 1000 }),
        cyclesApi.list(id).catch(() => ({ success: false, cycles: [] })),
        modulesApi.list(id).catch(() => ({ success: false, modules: [] })),
      ]);
      setProject(pRes.project);
      if (pRes.project?.tags) setProjectTags(pRes.project.tags);
      setMembers(pRes.members);
      setMyRole(pRes.project.myRole ?? 'member');
      setTasks(tRes.tasks);
      if (cRes.success && cRes.cycles) setCycles(cRes.cycles);
      if (mRes.success && mRes.modules) setModules(mRes.modules);
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
      cyclesApi.list(id).catch(() => ({ success: false, cycles: [] })),
      modulesApi.list(id).catch(() => ({ success: false, modules: [] })),
    ])
      .then(([pRes, tRes, cRes, mRes]) => {
        if (!active) return;
        setProject(pRes.project);
        if (pRes.project?.tags) setProjectTags(pRes.project.tags);
        setMembers(pRes.members);
        setMyRole(pRes.project.myRole ?? 'member');
        setTasks(tRes.tasks);
        if (cRes.success && cRes.cycles) setCycles(cRes.cycles);
        if (mRes.success && mRes.modules) setModules(mRes.modules);
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
        cyclesApi.list(id)
          .then((cRes) => {
            if (active && cRes.cycles) setCycles(cRes.cycles);
          })
          .catch(console.error);
        modulesApi.list(id)
          .then((mRes) => {
            if (active && mRes.modules) setModules(mRes.modules);
          })
          .catch(console.error);
      }
    }, 30000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, id, router, toast]);

  // Listen for global real-time time logged events to update task cards & stats instantly
  useEffect(() => {
    const handleGlobalTimeLogged = (e: any) => {
      if (e.detail?.taskId && e.detail?.updatedTask) {
        setTasks((prev) =>
          prev.map((t) => (t._id === e.detail.taskId ? e.detail.updatedTask : t))
        );
      }
    };
    window.addEventListener('taskforge:timelogged', handleGlobalTimeLogged);
    return () => window.removeEventListener('taskforge:timelogged', handleGlobalTimeLogged);
  }, []);

  // Load project meetings
  useEffect(() => {
    if (tab !== 'meetings' && tab !== 'calendar') return;
    let active = true;
    meetingsApi.list({ projectId: id })
      .then((res) => {
        if (active) setProjectMeetings(res.meetings || []);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoadingMeetings(false);
      });

    return () => {
      active = false;
    };
  }, [tab, id]);

  const openScheduleProjectMeeting = () => {
    const nextStart = new Date(Date.now() + 15 * 60000);
    nextStart.setMinutes(Math.ceil(nextStart.getMinutes() / 5) * 5, 0, 0);
    const localIso = new Date(nextStart.getTime() - nextStart.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setMeetingTitle(`${project?.name || 'Project'} Sync`);
    setMeetingStartTime(localIso);
    setMeetingDuration(30);
    setMeetingMeetLink('');
    setMeetingAgenda(['Review task progress & blockers', 'Next priorities']);
    setShowProjectMeetingModal(true);
  };

  const handleCreateProjectMeeting = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingTitle.trim() || !meetingStartTime) return;
    try {
      setSubmittingMeeting(true);
      const start = new Date(meetingStartTime);
      const end = new Date(start.getTime() + meetingDuration * 60000);
      const slug = (project?.name || 'project').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 16);
      const link = meetingMeetLink.trim() || `https://p2p.mirotalk.com/join?room=taskforge-${slug}-${Date.now().toString(36)}&notify=0`;
      const participants = members.map((m) => m.user?._id).filter(Boolean);

      const res = await meetingsApi.create({
        title: meetingTitle.trim(),
        project: id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        meetLink: link,
        participants,
        agenda: meetingAgenda.filter((a) => a.trim()).map((title) => ({ title, completed: false })),
      });

      if (res.success) {
        toast('Project meeting scheduled! Teammates notified.', 'success');
        setProjectMeetings((prev) => [res.meeting, ...prev]);
        setShowProjectMeetingModal(false);
      }
    } catch (err) {
      console.error(err);
      toast('Failed to schedule meeting', 'error');
    } finally {
      setSubmittingMeeting(false);
    }
  };

  const handleDeleteProjectMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to cancel this meeting?')) return;
    try {
      await meetingsApi.delete(meetingId);
      setProjectMeetings((prev) => prev.filter((m) => m._id !== meetingId));
      toast('Meeting cancelled', 'success');
    } catch (err) {
      console.error(err);
      toast('Failed to delete meeting', 'error');
    }
  };

  const copyProjectMeetingLink = (m: Meeting) => {
    navigator.clipboard.writeText(m.meetLink);
    setCopiedMeetingId(m._id);
    toast('Meeting link copied!', 'success');
    setTimeout(() => setCopiedMeetingId(null), 2000);
  };

  // ── Cycle (Sprint) Actions ──────────────────────────────────────────────────
  const openCreateCycle = () => {
    setEditingCycle(null);
    setCycleName('');
    setCycleDescription('');
    const today = new Date();
    const twoWeeks = new Date(today.getTime() + 14 * 86400000);
    setCycleStartDate(today.toISOString().slice(0, 10));
    setCycleEndDate(twoWeeks.toISOString().slice(0, 10));
    setCycleStatus('upcoming');
    setShowCycleModal(true);
  };

  const openEditCycle = (c: Cycle) => {
    setEditingCycle(c);
    setCycleName(c.name);
    setCycleDescription(c.description || '');
    setCycleStartDate(c.startDate ? c.startDate.slice(0, 10) : '');
    setCycleEndDate(c.endDate ? c.endDate.slice(0, 10) : '');
    setCycleStatus(c.status);
    setShowCycleModal(true);
  };

  const setCyclePresetDuration = (days: number) => {
    const start = cycleStartDate ? new Date(cycleStartDate) : new Date();
    const end = new Date(start.getTime() + days * 86400000);
    setCycleEndDate(end.toISOString().slice(0, 10));
  };

  const saveCycle = async (e: FormEvent) => {
    e.preventDefault();
    if (!cycleName.trim() || !cycleStartDate || !cycleEndDate) return;
    try {
      setSubmittingCycle(true);
      const payload = {
        name: cycleName.trim(),
        description: cycleDescription.trim(),
        startDate: cycleStartDate,
        endDate: cycleEndDate,
        status: cycleStatus,
      };

      if (editingCycle) {
        const res = await cyclesApi.update(id, editingCycle._id, payload);
        if (res.success) {
          toast('Sprint cycle updated', 'success');
          setCycles((prev) => prev.map((c) => (c._id === editingCycle._id ? res.cycle : c)));
          setShowCycleModal(false);
          await load(true);
        }
      } else {
        const res = await cyclesApi.create(id, payload);
        if (res.success) {
          toast('Sprint cycle created', 'success');
          setCycles((prev) => [res.cycle, ...prev]);
          setShowCycleModal(false);
          await load(true);
        }
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to save sprint cycle', 'error');
    } finally {
      setSubmittingCycle(false);
    }
  };

  const handleStartSprintNow = async (cycleId: string) => {
    try {
      const res = await cyclesApi.update(id, cycleId, { status: 'current' });
      if (res.success) {
        toast('Sprint is now active! ⚡', 'success');
        await load(true);
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to start sprint', 'error');
    }
  };

  const openCompleteAndRolloverModal = (cycle: Cycle) => {
    setRolloverModalCycle(cycle);
    // Find next upcoming cycle if any
    const upcoming = cycles.find((c) => c._id !== cycle._id && (c.status === 'upcoming' || c.status === 'draft'));
    setRolloverTargetCycleId(upcoming ? upcoming._id : 'backlog');
  };

  const handleCompleteSprintWithRollover = async () => {
    if (!rolloverModalCycle) return;
    try {
      setSubmittingRollover(true);
      const targetId = rolloverTargetCycleId === 'backlog' ? null : rolloverTargetCycleId;
      const res = await cyclesApi.update(id, rolloverModalCycle._id, {
        status: 'completed',
        rolloverToCycleId: targetId,
      });

      if (res.success) {
        toast(
          res.rolloverCount && res.rolloverCount > 0
            ? `Sprint completed! Rolled over ${res.rolloverCount} unfinished tasks.`
            : 'Sprint completed! 🎉',
          'success'
        );
        triggerConfetti();
        setRolloverModalCycle(null);
        await load(true);
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to complete sprint', 'error');
    } finally {
      setSubmittingRollover(false);
    }
  };

  const confirmDeleteCycle = async () => {
    if (!deleteCycleTarget) return;
    try {
      await cyclesApi.delete(id, deleteCycleTarget._id);
      toast('Sprint cycle deleted', 'success');
      setCycles((prev) => prev.filter((c) => c._id !== deleteCycleTarget._id));
      setDeleteCycleTarget(null);
      await load(true);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to delete cycle', 'error');
    }
  };

  // ── Feature Module Actions ──────────────────────────────────────────────────
  const openCreateModule = () => {
    setEditingModule(null);
    setModuleName('');
    setModuleDescription('');
    setModuleStatus('planned');
    setModuleStartDate('');
    setModuleTargetDate('');
    setModuleLead('');
    setShowModuleModal(true);
  };

  const openEditModule = (m: Module) => {
    setEditingModule(m);
    setModuleName(m.name);
    setModuleDescription(m.description || '');
    setModuleStatus(m.status);
    setModuleStartDate(m.startDate ? m.startDate.slice(0, 10) : '');
    setModuleTargetDate(m.targetDate ? m.targetDate.slice(0, 10) : '');
    const leadId = typeof m.lead === 'object' && m.lead ? m.lead._id : (m.lead || '');
    setModuleLead(leadId);
    setShowModuleModal(true);
  };

  const saveModule = async (e: FormEvent) => {
    e.preventDefault();
    if (!moduleName.trim()) return;
    try {
      setSubmittingModule(true);
      const payload = {
        name: moduleName.trim(),
        description: moduleDescription.trim(),
        status: moduleStatus,
        startDate: moduleStartDate || null,
        targetDate: moduleTargetDate || null,
        lead: moduleLead || null,
      };

      if (editingModule) {
        const res = await modulesApi.update(id, editingModule._id, payload);
        if (res.success) {
          toast('Feature module updated', 'success');
          setModules((prev) => prev.map((m) => (m._id === editingModule._id ? res.module : m)));
          setShowModuleModal(false);
          await load(true);
        }
      } else {
        const res = await modulesApi.create(id, payload);
        if (res.success) {
          toast('Feature module created', 'success');
          setModules((prev) => [res.module, ...prev]);
          setShowModuleModal(false);
          await load(true);
        }
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to save feature module', 'error');
    } finally {
      setSubmittingModule(false);
    }
  };

  const confirmDeleteModule = async () => {
    if (!deleteModuleTarget) return;
    try {
      await modulesApi.delete(id, deleteModuleTarget._id);
      toast('Feature module deleted', 'success');
      setModules((prev) => prev.filter((m) => m._id !== deleteModuleTarget._id));
      setDeleteModuleTarget(null);
      await load(true);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to delete module', 'error');
    }
  };

  const openCreateTask = useCallback((defaultDueDate?: string | React.MouseEvent) => {
    setEditingTask(null);
    setTaskForm({
      ...EMPTY_TASK_FORM,
      dueDate: typeof defaultDueDate === 'string' ? defaultDueDate : '',
    });
    setNewChecklistTitle('');
    setNewTagInput('');
    setIsTagDeleteMode(false);
    setShowTaskModal(true);
  }, []);

  const openEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskForm({
      title:          task.title,
      description:    task.description ?? '',
      priority:       task.priority,
      dueDate:        task.dueDate ? task.dueDate.slice(0, 10) : '',
      assignedTo:     getTaskAssignees(task).map((u) => u._id),
      status:         task.status,
      tags:           task.tags ? [...task.tags] : [],
      checklist:      task.checklist ? task.checklist.map((c) => ({ ...c })) : [],
      estimatedHours: task.estimatedHours ?? 0,
      cycle:          typeof task.cycle === 'object' && task.cycle ? task.cycle._id : (typeof task.cycle === 'string' ? task.cycle : ''),
      module:         typeof task.module === 'object' && task.module ? task.module._id : (typeof task.module === 'string' ? task.module : ''),
    });
    setNewChecklistTitle('');
    setNewTagInput('');
    setIsTagDeleteMode(false);
    setShowTaskModal(true);
  }, []);

  // Global project keyboard shortcuts (Esc, N)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.key === 'Escape') {
        setIsTagDeleteMode(false);
      setShowTaskModal(false);
        setIsTagDeleteMode(false);
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
      const assignees = getTaskAssignees(t);
      const isAssignedToMe = user?._id ? assignees.some((u) => u._id === user._id) : false;
      if (!isAssignedToMe) return false;
    }
    if (filterPriority && t.priority !== filterPriority) {
      return false;
    }
    if (filterAssignee) {
      const assignees = getTaskAssignees(t);
      if (filterAssignee === 'unassigned') {
        if (assignees.length > 0) return false;
      } else if (!assignees.some((u) => u._id === filterAssignee)) {
        return false;
      }
    }
    if (filterCycle) {
      if (filterCycle === 'unassigned') {
        if (t.cycle) return false;
      } else {
        const cId = typeof t.cycle === 'object' && t.cycle ? t.cycle._id : t.cycle;
        if (cId !== filterCycle) return false;
      }
    }
    if (filterModule) {
      if (filterModule === 'unassigned') {
        if (t.module) return false;
      } else {
        const mId = typeof t.module === 'object' && t.module ? t.module._id : t.module;
        if (mId !== filterModule) return false;
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

  // Unique available tags for THIS specific project (case-insensitive deduplication)
  const availableTags = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    const pushUnique = (raw: string) => {
      if (!raw) return;
      const clean = raw.trim().replace(/^#/, '');
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(clean);
      }
    };

    DEFAULT_TAG_PRESETS.forEach(pushUnique);
    projectTags.forEach(pushUnique);
    (project?.tags || []).forEach(pushUnique);

    return list;
  }, [projectTags, project?.tags]);

  const addTag = async (tag: string) => {
    const clean = tag.trim().replace(/^#/, '');
    if (!clean) return;
    const lower = clean.toLowerCase();

    // 1. Add to current taskForm.tags if not already present (case-insensitive check)
    const isAlreadySelected = taskForm.tags.some((t) => t.trim().toLowerCase() === lower);
    if (!isAlreadySelected) {
      setTaskForm((prev) => ({ ...prev, tags: [...prev.tags, clean] }));
    }

    // 2. If it's a unique custom tag not yet in this project's tags, save to DB for this project
    const isAlreadyInProject = projectTags.some((t) => t.trim().toLowerCase() === lower);
    if (!isAlreadyInProject) {
      setProjectTags((prev) => [...prev, clean]);
      try {
        const res = await projectsApi.addTag(id, clean);
        if (res.success && res.tags) {
          setProjectTags(res.tags);
        }
      } catch (err) {
        console.error('Failed to save custom tag to project:', err);
      }
    }

    setNewTagInput('');
  };

  const toggleTag = (tag: string) => {
    const lower = tag.trim().toLowerCase();
    const isSelected = taskForm.tags.some((t) => t.trim().toLowerCase() === lower);
    if (isSelected) {
      removeTag(tag);
    } else {
      addTag(tag);
    }
  };

  const removeTag = (tag: string) => {
    const lower = tag.trim().toLowerCase();
    setTaskForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t.trim().toLowerCase() !== lower),
    }));
  };

  const handleDeleteTaglineFromDb = async (tag: string) => {
    const clean = tag.trim().replace(/^#/, '');
    if (!clean) return;
    if (!confirm(`Are you sure you want to permanently delete tagline "${clean}" from this project's database?`)) {
      return;
    }

    try {
      const res = await projectsApi.deleteTag(id, clean);
      if (res.success) {
        toast(`Tagline "${clean}" deleted from database`, 'success');
        const lower = clean.toLowerCase();

        // 1. Remove from projectTags state
        setProjectTags((prev) => prev.filter((t) => t.trim().toLowerCase() !== lower));

        // 2. Also remove from project.tags if present
        if (project?.tags) {
          setProject((prev) =>
            prev ? { ...prev, tags: (prev.tags || []).filter((t) => t.trim().toLowerCase() !== lower) } : null
          );
        }

        // 3. Remove from current task form if selected
        setTaskForm((prev) => ({
          ...prev,
          tags: prev.tags.filter((t) => t.trim().toLowerCase() !== lower),
        }));

        // 4. Remove from loaded tasks in state so cards update immediately
        setTasks((prev) =>
          prev.map((t) => ({
            ...t,
            tags: (t.tags || []).filter((tg) => tg.trim().toLowerCase() !== lower),
          }))
        );
      }
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Failed to delete tagline', 'error');
    }
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
      const assignees = getTaskAssignees(t);
      const assigneeName = assignees.length > 0 ? assignees.map((u) => u.name).join('; ') : 'Unassigned';
      const assigneeEmail = assignees.length > 0 ? assignees.map((u) => u.email).join('; ') : 'N/A';
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
      assignedTo: taskForm.assignedTo.length > 0 ? taskForm.assignedTo : undefined,
      dueDate:    taskForm.dueDate    || undefined,
      cycle:      taskForm.cycle      || null,
      module:     taskForm.module     || null,
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
      if (taskForm.tags && taskForm.tags.length > 0) {
        setProjectTags((prev) => {
          const list = [...prev];
          taskForm.tags.forEach((t) => {
            const clean = t.trim().replace(/^#/, '');
            if (!list.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
              list.push(clean);
            }
          });
          return list;
        });
      }
      setIsTagDeleteMode(false);
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

  const handleChecklistUpdate = async (taskId: string, newChecklist: ChecklistItem[]) => {
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t._id === taskId ? { ...t, checklist: newChecklist } : t))
    );
    if (commentTask && commentTask._id === taskId) {
      setCommentTask((prev) => prev ? { ...prev, checklist: newChecklist } : null);
    }
    try {
      await tasksApi.update(id, taskId, { checklist: newChecklist });
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to update subtasks', 'error');
      load(true);
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
      const res = await projectsApi.addMember(id, memberForm);
      if (res.requiresApproval) {
        toast(res.message || 'Invitation request sent! They will be added once they accept.', 'success');
      } else {
        toast('Member added successfully', 'success');
      }
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
    const ownerId = typeof project?.createdBy === 'object' ? project?.createdBy?._id : project?.createdBy;
    if (editingMember.user?._id === ownerId && editingMember.role !== 'admin') {
      toast('The project creator/owner cannot be demoted', 'error');
      return;
    }
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
    const ownerId = typeof project?.createdBy === 'object' ? project?.createdBy?._id : project?.createdBy;
    if (uid === ownerId) {
      toast('The project creator/owner cannot be removed from the project', 'error');
      return;
    }
    try {
      await projectsApi.removeMember(id, uid);
      toast('Member removed');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove', 'error');
    }
  };

  // ── Project Calendar View State & Computations ──
  const calYear = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();

  const prevMonth = () => setCalendarDate(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(calYear, calMonth + 1, 1));
  const gotoToday = () => setCalendarDate(new Date());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    filteredTasks.forEach((t) => {
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map[key]) map[key] = [];
        map[key].push(t);
      }
    });
    return map;
  }, [filteredTasks]);

  const meetingsByDate = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    projectMeetings.forEach((m) => {
      if (m.startTime) {
        const d = new Date(m.startTime);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!map[key]) map[key] = [];
        map[key].push(m);
      }
    });
    return map;
  }, [projectMeetings]);

  const calendarCells = useMemo(() => {
    const cells: Array<{
      dayNumber: number;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Leading days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = calMonth === 0 ? 11 : calMonth - 1;
      const prevY = calMonth === 0 ? calYear - 1 : calYear;
      const key = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateKey: key,
        isCurrentMonth: false,
        isToday: key === todayKey,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateKey: key,
        isCurrentMonth: true,
        isToday: key === todayKey,
      });
    }

    // Trailing days
    const totalSlots = cells.length % 7 === 0 ? cells.length : cells.length + (7 - (cells.length % 7));
    const finalSlots = totalSlots < 35 ? 35 : totalSlots;
    const needed = finalSlots - cells.length;

    for (let d = 1; d <= needed; d++) {
      const nextM = calMonth === 11 ? 0 : calMonth + 1;
      const nextY = calMonth === 11 ? calYear + 1 : calYear;
      const key = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNumber: d,
        dateKey: key,
        isCurrentMonth: false,
        isToday: key === todayKey,
      });
    }

    return cells;
  }, [calYear, calMonth]);

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', flex: 1, background: 'var(--bg-base)' }}>
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

        {/* Status */}
        <div>
          <FieldLabel>Status</FieldLabel>
          <select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as TaskStatus })}>
            <option value="backlog">Backlog</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Estimated Hours */}
        <div>
          <FieldLabel>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} color="var(--accent-primary)" /> Estimated Hours
            </span>
          </FieldLabel>
          <input
            type="number"
            min={0}
            step={0.5}
            placeholder="e.g. 4"
            value={taskForm.estimatedHours !== undefined && taskForm.estimatedHours > 0 ? taskForm.estimatedHours : ''}
            onChange={(e) => setTaskForm({ ...taskForm, estimatedHours: parseFloat(e.target.value) || 0 })}
          />
        </div>

        {/* Due Date */}
        <div>
          <FieldLabel>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} color="var(--accent-primary)" /> Due Date
            </span>
          </FieldLabel>
          <input
            type="date"
            value={taskForm.dueDate}
            onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {}
            }}
            style={{ colorScheme: 'dark', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Sprint Cycle */}
        <div>
          <FieldLabel>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Zap size={13} color="#facc15" /> Sprint Cycle
            </span>
          </FieldLabel>
          <select
            value={taskForm.cycle || ''}
            onChange={(e) => setTaskForm({ ...taskForm, cycle: e.target.value })}
          >
            <option value="">No Cycle (Backlog)</option>
            {cycles.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.status === 'current' ? '⚡ Active' : c.status})
              </option>
            ))}
          </select>
        </div>

        {/* Feature Module */}
        <div>
          <FieldLabel>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Package size={13} color="#c084fc" /> Feature Module
            </span>
          </FieldLabel>
          <select
            value={taskForm.module || ''}
            onChange={(e) => setTaskForm({ ...taskForm, module: e.target.value })}
          >
            <option value="">No Module</option>
            {modules.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name} ({m.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Assignees (Multi-Member Selector) */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <FieldLabel>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Users size={13} color="var(--accent-primary)" />
              Assign Members ({taskForm.assignedTo.length} selected)
            </span>
          </FieldLabel>
          <div style={{ display: 'flex', gap: 10 }}>
            {taskForm.assignedTo.length < members.length && (
              <button
                type="button"
                onClick={() => setTaskForm((prev) => ({ ...prev, assignedTo: members.map((m) => m.user._id) }))}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  fontFamily: 'Outfit, sans-serif',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Select All
              </button>
            )}
            {taskForm.assignedTo.length > 0 && (
              <button
                type="button"
                onClick={() => setTaskForm((prev) => ({ ...prev, assignedTo: [] }))}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  fontFamily: 'Outfit, sans-serif',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Selected chips */}
        {taskForm.assignedTo.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {taskForm.assignedTo.map((userId) => {
              const member = members.find((m) => m.user._id === userId);
              const name = member?.user.name || 'Member';
              return (
                <span
                  key={userId}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px 3px 6px',
                    borderRadius: 20,
                    background: 'rgba(129, 140, 248, 0.15)',
                    border: '1px solid rgba(129, 140, 248, 0.3)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#fff',
                      overflow: 'hidden',
                    }}
                  >
                    {member?.user?.avatar ? (
                      <img src={member.user.avatar} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      name[0]?.toUpperCase()
                    )}
                  </span>
                  {name}
                  <button
                    type="button"
                    onClick={() =>
                      setTaskForm((prev) => ({
                        ...prev,
                        assignedTo: prev.assignedTo.filter((id) => id !== userId),
                      }))
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: 0,
                      marginLeft: 2,
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Members Selection List */}
        <div
          style={{
            maxHeight: 160,
            overflowY: 'auto',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--bg-border)',
            borderRadius: 8,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {members.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              No members in this project yet
            </div>
          ) : (
            members.map((m) => {
              const isSelected = taskForm.assignedTo.includes(m.user._id);
              return (
                <label
                  key={m.user._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(129, 140, 248, 0.1)' : 'transparent',
                    border: isSelected ? '1px solid rgba(129, 140, 248, 0.25)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setTaskForm((prev) => ({
                          ...prev,
                          assignedTo: isSelected
                            ? prev.assignedTo.filter((id) => id !== m.user._id)
                            : [...prev.assignedTo, m.user._id],
                        }));
                      }}
                      style={{ width: 14, height: 14, cursor: 'pointer', margin: 0, accentColor: 'var(--accent-primary)' }}
                    />
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#fff',
                        overflow: 'hidden',
                      }}
                    >
                      {m.user?.avatar ? (
                        <img src={m.user.avatar} alt={m.user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        m.user.name?.[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {m.user.name}
                        {m.user._id === user?._id && (
                          <span style={{ fontSize: 10, color: 'var(--accent-primary)', marginLeft: 6, fontWeight: 400 }}>
                            (You)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.user.email}</div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'Outfit, sans-serif',
                    }}
                  >
                    {m.role}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Tags / Categories */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <FieldLabel>Tags / Labels</FieldLabel>
          <button
            type="button"
            onClick={() => setIsTagDeleteMode((prev) => !prev)}
            style={{
              background: isTagDeleteMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.04)',
              border: isTagDeleteMode ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: isTagDeleteMode ? '#f87171' : 'var(--text-secondary)',
              fontSize: 11,
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 500,
              padding: '3px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.2s ease',
            }}
            title={isTagDeleteMode ? 'Done deleting taglines' : 'Enable delete tagline mode'}
          >
            {isTagDeleteMode ? (
              <>
                <Check size={12} color="#f87171" />
                Done
              </>
            ) : (
              <>
                <Trash2 size={11} color="var(--text-muted)" />
                Remove / Delete Tagline
              </>
            )}
          </button>
        </div>

        {/* Delete Mode Banner */}
        {isTagDeleteMode && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'Outfit, sans-serif',
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 6,
              padding: '6px 10px',
              marginBottom: 10,
            }}
          >
            <Trash2 size={12} />
            <span>Click <strong>Delete</strong> next to any tagline below to permanently remove it from the database.</span>
          </div>
        )}

        {/* Available Tags / Project Presets (Case-Insensitive, Project-Specific) */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {availableTags.map((preset) => {
            const isSelected = taskForm.tags.some(
              (t) => t.trim().toLowerCase() === preset.trim().toLowerCase()
            );

            if (isTagDeleteMode) {
              return (
                <div
                  key={preset}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: 12,
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px dashed rgba(239, 68, 68, 0.4)',
                    padding: '2px 4px 2px 10px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'Outfit, sans-serif',
                      color: 'var(--text-secondary)',
                      marginRight: 6,
                    }}
                  >
                    #{preset}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteTaglineFromDb(preset)}
                    title={`Permanently delete tagline "${preset}" from database`}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      cursor: 'pointer',
                      padding: '2px 8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ef4444';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                      e.currentTarget.style.color = '#f87171';
                    }}
                  >
                    <Trash2 size={10} />
                    Delete
                  </button>
                </div>
              );
            }

            return (
              <button
                key={preset}
                type="button"
                onClick={() => toggleTag(preset)}
                title={isSelected ? 'Click to deselect tag' : 'Click to select tag for this task'}
                style={{
                  fontSize: 11,
                  fontFamily: 'Outfit, sans-serif',
                  padding: '3px 10px',
                  borderRadius: 12,
                  background: isSelected ? 'rgba(129, 140, 248, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                  color: isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: isSelected
                    ? '1px solid var(--accent-primary)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700 }}>{isSelected ? '✓' : '+'}</span>
                {preset}
              </button>
            );
          })}
        </div>

        {/* Selected tags */}
        {taskForm.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
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
                  background: 'rgba(129, 140, 248, 0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(129, 140, 248, 0.3)',
                }}
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', padding: 0, display: 'flex' }}
                  title="Remove tag"
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
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', flex: 1, background: 'var(--bg-base)', position: 'relative' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, width: '100%', padding: '40px 48px', overflow: 'auto', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        
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
                <span className={`badge badge-${myRole}`} style={{ fontSize: 13 }}>
                  {project && (typeof project.createdBy === 'object' ? project.createdBy?._id : project.createdBy) === user?._id ? 'Owner' : myRole}
                </span>
                {project?.hasActiveSubscription === false && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <Lock size={12} /> Subscription Inactive
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {project?.hasActiveSubscription === false && myRole === 'admin' && (
                  <Link href="/billing" style={{ textDecoration: 'none' }}>
                    <button className="btn-primary" style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                      <Lock size={14} /> Upgrade to Unlock
                    </button>
                  </Link>
                )}
                {project?.hasActiveSubscription !== false && (
                  <button
                    className="btn-ghost"
                    onClick={exportTasksCSV}
                    style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                    title="Export all project tasks to CSV"
                  >
                    <Download size={15} /> Export CSV
                  </button>
                )}
                {myRole === 'admin' && project?.hasActiveSubscription !== false && (
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
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 32, overflowX: 'auto', paddingBottom: 1 }}>
            {(['board', 'list', 'calendar', 'cycles', 'modules', 'meetings', 'members'] as const).map((t) => {
              const activeCount = t === 'cycles'
                ? cycles.filter(c => c.status === 'current').length
                : t === 'modules'
                ? modules.filter(m => m.status === 'in_progress').length
                : null;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '12px 18px',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
                    borderBottom: tab === t ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    marginBottom: -1,
                    transition: 'all 0.2s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { if (tab !== t) e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={(e) => { if (tab !== t) e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  {t === 'cycles' && <Zap size={13} color={tab === t ? '#facc15' : 'currentColor'} />}
                  {t === 'modules' && <Package size={13} color={tab === t ? '#c084fc' : 'currentColor'} />}
                  <span>{t}</span>
                  {activeCount !== null && activeCount > 0 && (
                    <span style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: t === 'cycles' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                      color: t === 'cycles' ? '#facc15' : '#c084fc',
                      fontWeight: 600
                    }}>
                      {activeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Search & Filter Bar (shown on Board, List & Calendar tabs) ── */}
          {(tab === 'board' || tab === 'list' || tab === 'calendar') && (
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
                {user?.avatar ? (
                  <img src={user.avatar} alt="Me" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <User size={13} color={onlyMyTasks ? 'var(--accent-primary)' : 'currentColor'} />
                )}
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

              {/* Sprint Cycle filter */}
              {cycles.length > 0 && (
                <select
                  value={filterCycle}
                  onChange={(e) => setFilterCycle(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                    background: filterCycle ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: filterCycle ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    color: filterCycle ? '#facc15' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    outline: 'none',
                    width: 'auto',
                  }}
                >
                  <option value="" style={{ background: '#0a0a0f', color: '#fff' }}>All Sprints</option>
                  <option value="unassigned" style={{ background: '#0a0a0f', color: '#fff' }}>No Sprint (Backlog)</option>
                  {cycles.map((c) => (
                    <option key={c._id} value={c._id} style={{ background: '#0a0a0f', color: '#fff' }}>
                      ⚡ {c.name} ({c.status === 'current' ? 'Active' : c.status})
                    </option>
                  ))}
                </select>
              )}

              {/* Feature Module filter */}
              {modules.length > 0 && (
                <select
                  value={filterModule}
                  onChange={(e) => setFilterModule(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                    background: filterModule ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: filterModule ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    color: filterModule ? '#c084fc' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    outline: 'none',
                    width: 'auto',
                  }}
                >
                  <option value="" style={{ background: '#0a0a0f', color: '#fff' }}>All Modules</option>
                  <option value="unassigned" style={{ background: '#0a0a0f', color: '#fff' }}>No Module</option>
                  {modules.map((m) => (
                    <option key={m._id} value={m._id} style={{ background: '#0a0a0f', color: '#fff' }}>
                      📦 {m.name}
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

          {/* ══ Masked / Locked Banner for Inactive Subscriptions ══ */}
          {project?.hasActiveSubscription === false && (
            <div style={{
              marginBottom: 24,
              padding: '28px 24px',
              borderRadius: 16,
              background: 'rgba(239, 68, 68, 0.05)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap',
              boxShadow: '0 8px 30px -10px rgba(239, 68, 68, 0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Lock size={20} color="#f87171" />
                </div>
                <div>
                  <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', margin: 0 }}>
                    Project Data Masked & Locked
                  </h4>
                  <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', maxWidth: 640 }}>
                    {myRole === 'admin'
                      ? 'This project requires an active subscription from a project admin or owner. Task descriptions and editing capabilities are masked until upgraded.'
                      : 'This project is currently locked because neither the project owner nor any administrator has an active subscription. Please ask the project administrator to renew.'}
                  </p>
                </div>
              </div>
              {myRole === 'admin' && (
                <Link href="/billing" style={{ textDecoration: 'none' }}>
                  <button className="btn-primary" style={{ padding: '10px 22px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #ef4444, #dc2626)', whiteSpace: 'nowrap' }}>
                    Upgrade Subscription <ArrowRight size={14} />
                  </button>
                </Link>
              )}
            </div>
          )}

          {/* ══ Board view ══ */}
          {tab === 'board' && (
            <div
              className="kanban-board-container"
              style={project?.hasActiveSubscription === false ? { filter: 'blur(5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' } : undefined}
            >
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
                  onUpdateChecklist={handleChecklistUpdate}
                />
              ))}
            </div>
          )}

          {/* ══ List view ══ */}
          {tab === 'list' && (
            <div
              className="glass-panel"
              style={{
                overflow: 'hidden',
                ...(project?.hasActiveSubscription === false ? { filter: 'blur(5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' } : {}),
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {['Task', 'Subtasks', 'Status', 'Priority', 'Assignee', 'Time Logged', 'Due Date', 'Discussion', ''].map((h, i) => (
                      <th key={h || `actions-${i}`} style={{ padding: '16px 20px', textAlign: 'left', fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '60px', textAlign: 'center', fontSize: 14, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)' }}>
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
                    const isOverdue = !!t.dueDate && t.status !== 'done' && t.status !== 'canceled' && new Date() > new Date(t.dueDate);
                    const assignees = getTaskAssignees(t);
                    const isAssignedToMe = user?._id ? (assignees.length === 0 || assignees.some((u) => u._id === user._id)) : true;
                    const canUpdateStatus = myRole === 'admin' || isAssignedToMe;
                    return (
                      <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '16px 20px', fontSize: 14, fontFamily: 'Outfit, sans-serif', fontWeight: 500, color: 'var(--text-primary)', maxWidth: 300 }}>
                          <span
                            onClick={() => setCommentTask(t)}
                            style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                            title="Click to view details & subtasks"
                          >
                            {t.title}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          {t.checklist && t.checklist.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setCommentTask(t)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: t.checklist.every((c) => c.completed) ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                                border: t.checklist.every((c) => c.completed) ? '1px solid rgba(74, 222, 128, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
                                color: t.checklist.every((c) => c.completed) ? '#4ade80' : 'var(--text-secondary)',
                                padding: '4px 8px',
                                borderRadius: 8,
                                fontSize: 12,
                                fontFamily: 'Outfit, sans-serif',
                                cursor: 'pointer',
                              }}
                              title="View and check off subtasks"
                            >
                              <CheckSquare size={13} color={t.checklist.every((c) => c.completed) ? '#4ade80' : 'var(--accent-primary)'} />
                              <span>{t.checklist.filter((c) => c.completed).length}/{t.checklist.length}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCommentTask(t)}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              title="Add subtask"
                            >
                              <Plus size={11} /> Add
                            </button>
                          )}
                        </td>
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
                            <option value="backlog">Backlog</option>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="in_review">In Review</option>
                            <option value="done">Done</option>
                            <option value="canceled">Canceled</option>
                          </select>
                        </td>
                        <td style={{ padding: '16px 20px' }}><span className={`badge badge-${t.priority}`}>{t.priority}</span></td>
                        <td style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif' }}>
                          {(() => {
                            if (assignees.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                            if (assignees.length === 1) return assignees[0].name;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={assignees.map((u) => u.name).join(', ')}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  {assignees.slice(0, 3).map((u, i) => (
                                    <div
                                      key={u._id || i}
                                      style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 9, color: '#fff', fontWeight: 600,
                                        marginLeft: i > 0 ? -6 : 0,
                                        border: '1.5px solid rgba(15, 23, 42, 0.9)',
                                        overflow: 'hidden',
                                      }}
                                    >
                                      {u.avatar ? (
                                        <img src={u.avatar} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        u.name?.[0]?.toUpperCase()
                                      )}
                                    </div>
                                  ))}
                                  {assignees.length > 3 && (
                                    <div
                                      style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 8, color: 'var(--text-secondary)', fontWeight: 600,
                                        marginLeft: -6,
                                        border: '1.5px solid rgba(15, 23, 42, 0.9)',
                                      }}
                                    >
                                      +{assignees.length - 3}
                                    </div>
                                  )}
                                </div>
                                <span>{assignees.length} assigned</span>
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '16px 20px', fontSize: 12, fontFamily: 'Outfit, sans-serif' }}>
                          {((t.loggedMinutes && t.loggedMinutes > 0) || (t.estimatedHours && t.estimatedHours > 0)) ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.08)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                              <Clock size={11} />
                              {formatMinutes(t.loggedMinutes || 0)}{t.estimatedHours ? ` / ${t.estimatedHours}h` : ''}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
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

          {/* ══ Calendar view ══ */}
          {tab === 'calendar' && (
            <div
              className="glass-panel"
              style={{
                padding: 24,
                overflow: 'hidden',
                ...(project?.hasActiveSubscription === false ? { filter: 'blur(5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' } : {}),
              }}
            >
              {/* Calendar Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
                    {monthNames[calMonth]} {calYear}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 4 }}>
                    <button
                      type="button"
                      onClick={prevMonth}
                      style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Previous Month"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={gotoToday}
                      style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'Outfit, sans-serif', fontWeight: 500, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={nextMonth}
                      style={{ background: 'none', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Next Month"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                      Tasks Due
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Video size={12} color="#38bdf8" />
                      Video Syncs
                    </span>
                  </div>

                  {myRole === 'admin' && project?.hasActiveSubscription !== false && (
                    <button
                      className="btn-primary"
                      onClick={() => openCreateTask()}
                      style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                    >
                      <Plus size={14} /> Add Task
                    </button>
                  )}
                </div>
              </div>

              {/* Day of Week Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div
                    key={day}
                    style={{
                      textAlign: 'center',
                      padding: '8px 0',
                      fontSize: 12,
                      fontFamily: 'Outfit, sans-serif',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {calendarCells.map((cell, idx) => {
                  const dayTasks = tasksByDate[cell.dateKey] || [];
                  const dayMeetings = meetingsByDate[cell.dateKey] || [];

                  return (
                    <div
                      key={`${cell.dateKey}-${idx}`}
                      style={{
                        minHeight: 120,
                        background: cell.isCurrentMonth
                          ? (cell.isToday ? 'rgba(129, 140, 248, 0.04)' : 'rgba(255, 255, 255, 0.015)')
                          : 'rgba(255, 255, 255, 0.005)',
                        border: cell.isToday
                          ? '1px solid var(--accent-primary)'
                          : '1px solid rgba(255, 255, 255, 0.04)',
                        borderRadius: 12,
                        padding: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        opacity: cell.isCurrentMonth ? 1 : 0.45,
                        transition: 'all 0.2s',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = cell.isToday ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)';
                        const addBtn = e.currentTarget.querySelector('.cal-quick-add') as HTMLElement | null;
                        if (addBtn) addBtn.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = cell.isToday ? 'var(--accent-primary)' : 'rgba(255,255,255,0.04)';
                        const addBtn = e.currentTarget.querySelector('.cal-quick-add') as HTMLElement | null;
                        if (addBtn) addBtn.style.opacity = '0';
                      }}
                    >
                      {/* Cell Day Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontFamily: 'Outfit, sans-serif',
                            fontWeight: cell.isToday ? 700 : 500,
                            color: cell.isToday ? 'var(--accent-primary)' : (cell.isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)'),
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: cell.isToday ? 'rgba(129, 140, 248, 0.2)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {cell.dayNumber}
                        </span>

                        {myRole === 'admin' && project?.hasActiveSubscription !== false && (
                          <button
                            type="button"
                            className="cal-quick-add"
                            onClick={() => openCreateTask(cell.dateKey)}
                            title={`Add task due on ${cell.dateKey}`}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0,
                              transition: 'opacity 0.15s',
                              padding: 0,
                            }}
                          >
                            <Plus size={11} />
                          </button>
                        )}
                      </div>

                      {/* Day Meetings */}
                      {dayMeetings.map((m) => (
                        <div
                          key={m._id}
                          onClick={() => {
                            if (m.meetLink) {
                              const pLink = user?.name ? getPersonalizedMeetLink(m.meetLink, user.name) : m.meetLink;
                              window.open(pLink, '_blank');
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 6px',
                            borderRadius: 6,
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                            fontSize: 11,
                            fontFamily: 'Outfit, sans-serif',
                            color: '#38bdf8',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                          title={`Meeting: ${m.title} (${new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) - Click to Join`}
                        >
                          <Video size={11} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{m.title}</span>
                          <span style={{ fontSize: 9, opacity: 0.8, flexShrink: 0 }}>
                            {new Date(m.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}

                      {/* Day Tasks */}
                      {dayTasks.map((t) => {
                        const pColor = PRIORITY_COLORS[t.priority] || 'var(--accent-primary)';
                        const isDone = t.status === 'done';
                        return (
                          <div
                            key={t._id}
                            onClick={() => setCommentTask(t)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '3px 6px',
                              borderRadius: 6,
                              background: isDone ? 'rgba(74, 222, 128, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                              border: isDone ? '1px solid rgba(74, 222, 128, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)',
                              fontSize: 11,
                              fontFamily: 'Outfit, sans-serif',
                              color: isDone ? '#4ade80' : 'var(--text-primary)',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = pColor;
                              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = isDone ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 255, 255, 0.06)';
                              e.currentTarget.style.background = isDone ? 'rgba(74, 222, 128, 0.08)' : 'rgba(255, 255, 255, 0.03)';
                            }}
                            title={`${t.title} [${t.status}] - Click to view details & log time`}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: pColor,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                flex: 1,
                                textDecoration: isDone ? 'line-through' : 'none',
                                opacity: isDone ? 0.75 : 1,
                              }}
                            >
                              {t.title}
                            </span>
                            {((t.loggedMinutes && t.loggedMinutes > 0) || (t.estimatedHours && t.estimatedHours > 0)) && (
                              <Clock size={10} color="#38bdf8" style={{ flexShrink: 0 }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ Cycles (Sprints) view ══ */}
          {tab === 'cycles' && (
            <div style={{ maxWidth: 1100, ...(project?.hasActiveSubscription === false ? { filter: 'blur(5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' } : {}) }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Zap size={22} color="#facc15" />
                    Sprint Cycles
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginTop: 4 }}>
                    Timeboxed sprint iterations to prioritize, track burndown velocity, and ship deliverables on schedule.
                  </p>
                </div>
                {myRole === 'admin' && project?.hasActiveSubscription !== false && (
                  <button
                    onClick={openCreateCycle}
                    className="btn-primary"
                    style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'linear-gradient(135deg, #eab308, #ca8a04)' }}
                  >
                    <Plus size={16} /> New Sprint Cycle
                  </button>
                )}
              </div>

              {/* Active Sprint Hero Card */}
              {(() => {
                const activeCycle = cycles.find((c) => c.status === 'current');
                if (!activeCycle) return null;
                const total = activeCycle.totalTasks || 0;
                const completed = activeCycle.completedTasks || 0;
                const inProgress = activeCycle.inProgressTasks || 0;
                const todo = activeCycle.todoTasks || 0;
                const pct = activeCycle.progressPct || 0;

                const startDateStr = new Date(activeCycle.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const endDateStr = new Date(activeCycle.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const daysRemaining = Math.ceil((new Date(activeCycle.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                return (
                  <div
                    className="glass-panel"
                    style={{
                      padding: 24,
                      marginBottom: 32,
                      borderRadius: 16,
                      background: 'radial-gradient(circle at top right, rgba(234, 179, 8, 0.08), rgba(255, 255, 255, 0.015))',
                      border: '1px solid rgba(234, 179, 8, 0.35)',
                      boxShadow: '0 12px 36px -12px rgba(234, 179, 8, 0.2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'Outfit, sans-serif',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              padding: '3px 9px',
                              borderRadius: 20,
                              background: 'rgba(234, 179, 8, 0.2)',
                              color: '#facc15',
                              border: '1px solid rgba(234, 179, 8, 0.4)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#facc15', boxShadow: '0 0 8px #facc15' }} />
                            Current Active Sprint
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                            {startDateStr} — {endDateStr}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: 'Outfit, sans-serif',
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: daysRemaining >= 0 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: daysRemaining >= 0 ? '#4ade80' : '#f87171',
                              border: `1px solid ${daysRemaining >= 0 ? 'rgba(74, 222, 128, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                              fontWeight: 500,
                            }}
                          >
                            {daysRemaining > 0 ? `${daysRemaining} days remaining` : daysRemaining === 0 ? 'Ends today' : `${Math.abs(daysRemaining)} days overdue`}
                          </span>
                        </div>
                        <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                          {activeCycle.name}
                        </h4>
                        {activeCycle.description && (
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', margin: 0, maxWidth: 680, lineHeight: 1.5 }}>
                            {activeCycle.description}
                          </p>
                        )}
                      </div>

                      {/* Active Sprint Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterCycle(activeCycle._id);
                            setTab('board');
                          }}
                          className="btn-ghost"
                          style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          View on Board <ArrowRight size={13} />
                        </button>
                        {myRole === 'admin' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditCycle(activeCycle)}
                              className="btn-ghost"
                              style={{ fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => openCompleteAndRolloverModal(activeCycle)}
                              className="btn-primary"
                              style={{
                                fontSize: 12,
                                padding: '7px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                              }}
                            >
                              <CheckCircle2 size={13} /> Complete & Rollover
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Burndown & Progress Section */}
                    <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, fontFamily: 'Outfit, sans-serif' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                          Sprint Progress: <strong style={{ color: 'var(--text-primary)' }}>{pct}%</strong>
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {completed} of {total} tasks completed
                        </span>
                      </div>

                      <div style={{ height: 8, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #4ade80, #10b981)', transition: 'width 0.4s ease' }} title={`Done: ${completed}`} />
                        <div style={{ width: `${total > 0 ? (inProgress / total) * 100 : 0}%`, background: '#818cf8', transition: 'width 0.4s ease' }} title={`In Progress: ${inProgress}`} />
                        <div style={{ width: `${total > 0 ? (todo / total) * 100 : 0}%`, background: 'rgba(255,255,255,0.1)', transition: 'width 0.4s ease' }} title={`To Do: ${todo}`} />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 12, fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                          <strong>{completed}</strong> Completed
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8' }} />
                          <strong>{inProgress}</strong> In Progress
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                          <strong>{todo}</strong> To Do
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Upcoming Cycles Section */}
              {(() => {
                const upcoming = cycles.filter((c) => c.status === 'upcoming' || c.status === 'draft');
                return (
                  <div style={{ marginBottom: 36 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', margin: 0 }}>
                        Upcoming Sprints ({upcoming.length})
                      </h4>
                    </div>

                    {upcoming.length === 0 ? (
                      <div
                        className="glass-panel"
                        style={{
                          padding: 24,
                          textAlign: 'center',
                          borderRadius: 12,
                          color: 'var(--text-muted)',
                          fontSize: 13,
                          fontFamily: 'Outfit, sans-serif',
                        }}
                      >
                        No upcoming sprints planned.{' '}
                        {myRole === 'admin' && (
                          <button
                            type="button"
                            onClick={openCreateCycle}
                            style={{ background: 'none', border: 'none', color: '#facc15', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                          >
                            Plan next sprint
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                        {upcoming.map((c) => {
                          const start = new Date(c.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                          const end = new Date(c.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                          return (
                            <div
                              key={c._id}
                              className="glass-panel"
                              style={{
                                padding: 20,
                                borderRadius: 14,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s',
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontFamily: 'Outfit, sans-serif',
                                      fontWeight: 600,
                                      textTransform: 'uppercase',
                                      padding: '2px 8px',
                                      borderRadius: 10,
                                      background: c.status === 'upcoming' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                      color: c.status === 'upcoming' ? '#38bdf8' : 'var(--text-muted)',
                                      border: `1px solid ${c.status === 'upcoming' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.1)'}`,
                                    }}
                                  >
                                    {c.status}
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                                    {c.totalTasks || 0} tasks
                                  </span>
                                </div>
                                <h5 style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                                  {c.name}
                                </h5>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <Calendar size={12} /> {start} — {end}
                                </p>
                                {c.description && (
                                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', margin: '0 0 14px', lineHeight: 1.4 }}>
                                    {c.description}
                                  </p>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFilterCycle(c._id);
                                    setTab('board');
                                  }}
                                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                  View tasks <ArrowRight size={12} />
                                </button>
                                {myRole === 'admin' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleStartSprintNow(c._id)}
                                      title="Start sprint now"
                                      style={{
                                        background: 'rgba(234, 179, 8, 0.15)',
                                        border: '1px solid rgba(234, 179, 8, 0.3)',
                                        color: '#facc15',
                                        borderRadius: 6,
                                        padding: '4px 8px',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                      }}
                                    >
                                      <Zap size={11} /> Start
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openEditCycle(c)}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                      title="Edit sprint"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteCycleTarget(c)}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                      title="Delete sprint"
                                      onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Completed Sprints Section */}
              {(() => {
                const completedCycles = cycles.filter((c) => c.status === 'completed');
                if (completedCycles.length === 0) return null;
                return (
                  <div style={{ marginBottom: 36 }}>
                    <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', marginBottom: 16 }}>
                      Past Completed Sprints ({completedCycles.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {completedCycles.map((c) => {
                        const start = new Date(c.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        const end = new Date(c.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                        const pct = c.progressPct || 0;
                        return (
                          <div
                            key={c._id}
                            className="glass-panel"
                            style={{
                              padding: '14px 20px',
                              borderRadius: 12,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 16,
                              flexWrap: 'wrap',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                              <CheckCircle2 size={18} color="#4ade80" />
                              <div>
                                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {c.name}
                                </span>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', marginTop: 2 }}>
                                  {start} — {end} • {c.completedTasks || 0} of {c.totalTasks || 0} tasks done ({pct}%)
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 100, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: '#4ade80' }} />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterCycle(c._id);
                                  setTab('board');
                                }}
                                className="btn-ghost"
                                style={{ fontSize: 12, padding: '5px 10px' }}
                              >
                                View tasks
                              </button>
                              {myRole === 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteCycleTarget(c)}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                  title="Delete cycle"
                                  onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* No cycles at all empty state */}
              {cycles.length === 0 && (
                <div
                  className="glass-panel"
                  style={{
                    padding: 48,
                    textAlign: 'center',
                    borderRadius: 16,
                    maxWidth: 500,
                    margin: '32px auto',
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <Zap size={26} color="#facc15" />
                  </div>
                  <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    No Sprint Cycles Yet
                  </h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.5, margin: '0 0 20px' }}>
                    Organize your team work into timeboxed sprint cycles (1 week, 2 weeks, or custom) to track deliverables, calculate team velocity, and prevent sprint creep.
                  </p>
                  {myRole === 'admin' && project?.hasActiveSubscription !== false && (
                    <button
                      type="button"
                      onClick={openCreateCycle}
                      className="btn-primary"
                      style={{ padding: '10px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #eab308, #ca8a04)' }}
                    >
                      <Plus size={15} /> Create First Sprint Cycle
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ Feature Modules View ══ */}
          {tab === 'modules' && (
            <div style={{ maxWidth: 1100, ...(project?.hasActiveSubscription === false ? { filter: 'blur(5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' } : {}) }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Package size={22} color="#c084fc" />
                    Feature Modules & Epics
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginTop: 4 }}>
                    Group related tasks into functional milestones, designate module leads, and track cross-sprint feature progress.
                  </p>
                </div>
                {myRole === 'admin' && project?.hasActiveSubscription !== false && (
                  <button
                    onClick={openCreateModule}
                    className="btn-primary"
                    style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
                  >
                    <Plus size={16} /> New Feature Module
                  </button>
                )}
              </div>

              {/* Modules Grid */}
              {modules.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                  {modules.map((m) => {
                    const total = m.totalTasks || 0;
                    const completed = m.completedTasks || 0;
                    const pct = m.progressPct || 0;
                    const leadObj = typeof m.lead === 'object' && m.lead ? m.lead : null;

                    const statusColors: Record<ModuleStatus, { bg: string; text: string; border: string }> = {
                      planned: { bg: 'rgba(148, 163, 184, 0.1)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' },
                      in_progress: { bg: 'rgba(129, 140, 248, 0.1)', text: '#a5b4fc', border: 'rgba(129, 140, 248, 0.25)' },
                      paused: { bg: 'rgba(251, 191, 36, 0.1)', text: '#fbbf24', border: 'rgba(251, 191, 36, 0.25)' },
                      completed: { bg: 'rgba(74, 222, 128, 0.1)', text: '#4ade80', border: 'rgba(74, 222, 128, 0.25)' },
                      canceled: { bg: 'rgba(239, 68, 68, 0.1)', text: '#f87171', border: 'rgba(239, 68, 68, 0.25)' },
                    };
                    const sc = statusColors[m.status] || statusColors.planned;

                    return (
                      <div
                        key={m._id}
                        className="glass-panel"
                        style={{
                          padding: 22,
                          borderRadius: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div>
                          {/* Top Badges */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: 'Outfit, sans-serif',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                padding: '3px 9px',
                                borderRadius: 12,
                                background: sc.bg,
                                color: sc.text,
                                border: `1px solid ${sc.border}`,
                                letterSpacing: '0.04em',
                              }}
                            >
                              {m.status.replace('_', ' ')}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                              {total} {total === 1 ? 'task' : 'tasks'}
                            </span>
                          </div>

                          {/* Title & Description */}
                          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                            {m.name}
                          </h4>
                          {m.description && (
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', margin: '0 0 14px', lineHeight: 1.5 }}>
                              {m.description}
                            </p>
                          )}

                          {/* Lead Assignee */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lead:</span>
                            {leadObj ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {leadObj.avatar ? (
                                  <img src={leadObj.avatar} alt={leadObj.name} style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                    {leadObj.name?.[0]?.toUpperCase() || 'U'}
                                  </span>
                                )}
                                <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500 }}>
                                  {leadObj.name}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                None assigned
                              </span>
                            )}
                          </div>

                          {/* Timeline Dates */}
                          {m.targetDate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'Outfit, sans-serif', color: 'var(--text-muted)', marginBottom: 16 }}>
                              <Flag size={12} color="#c084fc" />
                              <span>Target: {new Date(m.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                          )}
                        </div>

                        {/* Progress bar & Card Actions */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, fontFamily: 'Outfit, sans-serif' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{completed} of {total} done</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pct}%</span>
                          </div>
                          <div style={{ height: 6, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: pct === 100 ? '#4ade80' : 'linear-gradient(90deg, #c084fc, #a855f7)',
                                transition: 'width 0.3s ease',
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setFilterModule(m._id);
                                setTab('board');
                              }}
                              style={{ background: 'none', border: 'none', color: '#c084fc', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                            >
                              View tasks <ArrowRight size={12} />
                            </button>
                            {myRole === 'admin' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => openEditModule(m)}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                  title="Edit module"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteModuleTarget(m)}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                                  title="Delete module"
                                  onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="glass-panel"
                  style={{
                    padding: 48,
                    textAlign: 'center',
                    borderRadius: 16,
                    maxWidth: 500,
                    margin: '32px auto',
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'rgba(168, 85, 247, 0.1)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <Package size={26} color="#c084fc" />
                  </div>
                  <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    No Feature Modules Yet
                  </h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.5, margin: '0 0 20px' }}>
                    Break down your project into high-level feature modules (like 'User Auth', 'Payments', 'Analytics') to group tasks and track major milestone deliverables.
                  </p>
                  {myRole === 'admin' && project?.hasActiveSubscription !== false && (
                    <button
                      type="button"
                      onClick={openCreateModule}
                      className="btn-primary"
                      style={{ padding: '10px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
                    >
                      <Plus size={15} /> Create First Feature Module
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══ Members view ══ */}
          {tab === 'members' && (
            <div style={{ maxWidth: 800 }}>
              {members.map((m) => {
                const ownerId = typeof project?.createdBy === 'object' ? project?.createdBy?._id : project?.createdBy;
                const isMemberOwner = Boolean(ownerId && m.user?._id === ownerId);
                const isCurrentUserOwner = Boolean(ownerId && user?._id && ownerId === user._id);
                const isSelf = m.user?._id === user?._id;
                // Only project owner can manage other admins. Non-owner admins can only manage members.
                // The project creator/owner can never be edited or removed by anyone!
                const canManageMember = myRole === 'admin' && !isSelf && !isMemberOwner && (isCurrentUserOwner || m.role !== 'admin');

                return (
                  <div key={m._id} style={{ 
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12,
                    padding: '16px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                  >
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: 'Outfit, sans-serif', color: '#fff', fontWeight: 600, flexShrink: 0, overflow: 'hidden' }}>
                        {m.user?.avatar ? (
                          <img src={m.user.avatar} alt={m.user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          m.user?.name?.[0]?.toUpperCase()
                        )}
                      </div>
                      {/* Status Dot */}
                      <span style={{ position:'absolute', bottom:-2, right:-2, width:12, height:12, borderRadius:'50%', background: m.user?.isClockedIn ? '#4ade80' : 'var(--text-muted)', border:'2px solid #0a0a0f', boxShadow: m.user?.isClockedIn ? '0 0 8px #4ade80' : 'none' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)', fontWeight: 500 }}>{m.user?.name}</div>
                        {isMemberOwner && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            padding: '2px 8px',
                            borderRadius: 12,
                            background: 'rgba(251, 191, 36, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(251, 191, 36, 0.35)',
                          }}>
                            Owner
                          </span>
                        )}
                      </div>
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

                    {canManageMember && (
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
                );
              })}
            </div>
          )}

          {/* ══ Meetings view ══ */}
          {tab === 'meetings' && (
            <div style={{ maxWidth: 1000, ...(project?.hasActiveSubscription === false ? { filter: 'blur(5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                  <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--text-primary)', margin: 0 }}>Project Video Syncs</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'Outfit, sans-serif', marginTop: 4 }}>
                    Schedule video calls, share instant rooms, and review agendas for this project.
                  </p>
                </div>
                {project?.hasActiveSubscription !== false && (
                  <button
                    onClick={openScheduleProjectMeeting}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 13 }}
                  >
                    <Plus size={16} /> Schedule Sync
                  </button>
                )}
              </div>

              {loadingMeetings ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {[1, 2].map((i) => (
                    <div key={i} className="glass-panel" style={{ height: 180, opacity: 0.5, animation: 'pulse 1.5s infinite' }} />
                  ))}
                </div>
              ) : projectMeetings.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(129, 140, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Video size={22} color="var(--accent-primary)" />
                  </div>
                  <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: 'var(--text-primary)', marginBottom: 6 }}>No meetings scheduled yet</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 360, margin: '0 auto 20px' }}>
                    Keep everyone aligned on deliverables by setting up a quick standup or review call.
                  </p>
                  <button onClick={openScheduleProjectMeeting} className="btn-primary" style={{ padding: '9px 20px', fontSize: 13 }}>
                    Schedule First Sync
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                  {projectMeetings.map((m) => {
                    const start = new Date(m.startTime);
                    const end = new Date(m.endTime);
                    const durMin = Math.round((end.getTime() - start.getTime()) / 60000);
                    const isHost = m.createdBy?._id === user?._id || myRole === 'admin';
                    const isOngoing = m.status === 'ongoing';

                    return (
                      <div
                        key={m._id}
                        className="glass-panel"
                        style={{
                          padding: 20,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                          borderColor: isOngoing ? 'rgba(34, 197, 94, 0.4)' : undefined,
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                color: isOngoing ? '#4ade80' : m.status === 'completed' ? 'var(--text-muted)' : '#818cf8',
                                background: isOngoing ? '#22c55e15' : 'rgba(255,255,255,0.04)',
                                padding: '3px 8px',
                                borderRadius: 6,
                              }}
                            >
                              ● {m.status}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{durMin}m duration</span>
                          </div>

                          <h4 style={{ fontFamily: 'Fraunces, serif', fontSize: 17, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
                            {m.title}
                          </h4>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                              <Calendar size={13} />
                              <span>{start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                              <span>•</span>
                              <Clock size={13} />
                              <span>{start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {m.participants && m.participants.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                {m.participants.slice(0, 3).map((p, idx) => (
                                  <div
                                    key={p._id || idx}
                                    title={p.name}
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: '50%',
                                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                      color: '#fff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 9,
                                      fontWeight: 600,
                                      marginLeft: idx > 0 ? -6 : 0,
                                      border: '1.5px solid #0f111a',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {p.avatar ? (
                                      <img src={p.avatar} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      p.name?.[0]?.toUpperCase()
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {m.agenda && m.agenda.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                                Agenda ({m.agenda.filter(a => a.completed).length}/{m.agenda.length})
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {m.agenda.slice(0, 3).map((a, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: a.completed ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                                    <span style={{ color: a.completed ? '#4ade80' : 'var(--text-muted)' }}>•</span>
                                    <span style={{ textDecoration: a.completed ? 'line-through' : 'none' }}>{a.title}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              onClick={() => copyProjectMeetingLink(m)}
                              style={{ background: 'none', border: 'none', color: copiedMeetingId === m._id ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer', padding: 6 }}
                              title="Copy link"
                            >
                              {copiedMeetingId === m._id ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                            {isHost && (
                              <button
                                onClick={() => handleDeleteProjectMeeting(m._id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}
                                title="Cancel meeting"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>

                          <a
                            href={getPersonalizedMeetLink(m.meetLink, user?.name, user?.avatar)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 14px',
                              background: isOngoing ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                              borderRadius: 8,
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 500,
                              textDecoration: 'none',
                              boxShadow: isOngoing ? '0 0 15px rgba(34, 197, 94, 0.4)' : '0 0 10px var(--accent-glow)',
                            }}
                          >
                            <Video size={13} /> Join Call
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
          cycles={cycles}
          modules={modules}
          onClose={() => setCommentTask(null)}
          onCommentsUpdate={(taskId, newComments) => {
            setTasks((prev) =>
              prev.map((t) => (t._id === taskId ? { ...t, comments: newComments } : t))
            );
          }}
          onChecklistUpdate={handleChecklistUpdate}
          onStatusChange={handleStatusChange}
          onTaskUpdate={(updatedTask) => {
            setTasks((prev) => prev.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
            setCommentTask(updatedTask);
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
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#fff', fontWeight: 600, fontFamily: 'Outfit, sans-serif', flexShrink: 0, overflow: 'hidden' }}>
                {editingMember.user?.avatar ? (
                  <img src={editingMember.user.avatar} alt={editingMember.user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  editingMember.user?.name?.[0]?.toUpperCase()
                )}
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

      {/* ══ Schedule Project Meeting Modal ══ */}
      {showProjectMeetingModal && (
        <Modal
          title={`Schedule Sync — ${project?.name || 'Project'}`}
          onClose={() => setShowProjectMeetingModal(false)}
          width={520}
        >
          <form onSubmit={handleCreateProjectMeeting}>
            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Meeting Title *</FieldLabel>
              <input
                type="text"
                required
                placeholder="e.g. Sprint Review & Blockers"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14, marginBottom: 18 }}>
              <div>
                <FieldLabel>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={13} color="var(--accent-primary)" /> Start Date & Time *
                  </span>
                </FieldLabel>
                <input
                  type="datetime-local"
                  required
                  value={meetingStartTime}
                  onChange={(e) => setMeetingStartTime(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {}
                  }}
                  style={{ colorScheme: 'dark', cursor: 'pointer' }}
                />
              </div>

              <div>
                <FieldLabel>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} color="var(--accent-primary)" /> Duration
                  </span>
                </FieldLabel>
                <select
                  value={meetingDuration}
                  onChange={(e) => setMeetingDuration(Number(e.target.value))}
                >
                  <option value={15}>15 mins</option>
                  <option value={30}>30 mins</option>
                  <option value={45}>45 mins</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Video Call Link</FieldLabel>
              <input
                type="url"
                placeholder="Leave blank for instant WebRTC room (no login) or paste Google Meet link"
                value={meetingMeetLink}
                onChange={(e) => setMeetingMeetLink(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <FieldLabel>Agenda Topics</FieldLabel>
              {meetingAgenda.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder={`Topic #${idx + 1}`}
                    value={item}
                    onChange={(e) => {
                      const updated = [...meetingAgenda];
                      updated[idx] = e.target.value;
                      setMeetingAgenda(updated);
                    }}
                  />
                  {meetingAgenda.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMeetingAgenda(meetingAgenda.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 8 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setMeetingAgenda([...meetingAgenda, ''])}
                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                + Add another topic
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowProjectMeetingModal(false)}
                style={{ padding: '10px 20px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submittingMeeting}
                style={{ padding: '10px 24px' }}
              >
                {submittingMeeting ? 'Scheduling…' : 'Schedule Sync'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ Create / Edit Sprint Cycle Modal ══ */}
      {showCycleModal && (
        <Modal
          title={editingCycle ? `Edit Sprint — ${editingCycle.name}` : 'New Sprint Cycle'}
          onClose={() => setShowCycleModal(false)}
          width={500}
        >
          <form onSubmit={saveCycle}>
            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Sprint Name *</FieldLabel>
              <input
                type="text"
                required
                placeholder="e.g. Sprint 1 - Core Deliverables"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Description</FieldLabel>
              <textarea
                placeholder="Key sprint deliverables, milestones, and velocity goals…"
                rows={3}
                value={cycleDescription}
                onChange={(e) => setCycleDescription(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            {/* Quick Presets */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <FieldLabel>Duration Presets</FieldLabel>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setCyclePresetDuration(7)}
                    style={{
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.25)',
                      color: '#facc15',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: 'Outfit, sans-serif',
                      cursor: 'pointer',
                    }}
                  >
                    1 Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setCyclePresetDuration(14)}
                    style={{
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.25)',
                      color: '#facc15',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: 'Outfit, sans-serif',
                      cursor: 'pointer',
                    }}
                  >
                    2 Weeks
                  </button>
                  <button
                    type="button"
                    onClick={() => setCyclePresetDuration(30)}
                    style={{
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.25)',
                      color: '#facc15',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: 'Outfit, sans-serif',
                      cursor: 'pointer',
                    }}
                  >
                    1 Month
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <FieldLabel>Start Date *</FieldLabel>
                  <input
                    type="date"
                    required
                    value={cycleStartDate}
                    onChange={(e) => setCycleStartDate(e.target.value)}
                    style={{ colorScheme: 'dark', cursor: 'pointer' }}
                  />
                </div>
                <div>
                  <FieldLabel>End Date *</FieldLabel>
                  <input
                    type="date"
                    required
                    value={cycleEndDate}
                    onChange={(e) => setCycleEndDate(e.target.value)}
                    style={{ colorScheme: 'dark', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <FieldLabel>Sprint Status</FieldLabel>
              <select
                value={cycleStatus}
                onChange={(e) => setCycleStatus(e.target.value as CycleStatus)}
              >
                <option value="upcoming">Upcoming (Planned)</option>
                <option value="current">Current (Active Now)</option>
                <option value="draft">Draft</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowCycleModal(false)}
                style={{ padding: '10px 20px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submittingCycle}
                style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #eab308, #ca8a04)' }}
              >
                {submittingCycle ? 'Saving…' : editingCycle ? 'Update Sprint' : 'Create Sprint'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ Complete Sprint & Rollover Modal ══ */}
      {rolloverModalCycle && (
        <Modal
          title={`Complete Sprint — ${rolloverModalCycle.name}`}
          onClose={() => setRolloverModalCycle(null)}
          width={480}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                borderRadius: 12,
                marginBottom: 20,
              }}
            >
              <AlertCircle size={20} color="#facc15" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontFamily: 'Outfit, sans-serif', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Marking this sprint as <strong>Completed</strong> will calculate its final burndown velocity.
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel>Where to rollover incomplete tasks?</FieldLabel>
              <select
                value={rolloverTargetCycleId}
                onChange={(e) => setRolloverTargetCycleId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="backlog">Move back to Product Backlog (No sprint)</option>
                {cycles
                  .filter((c) => c._id !== rolloverModalCycle._id && c.status !== 'completed')
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      ⚡ Rollover into "{c.name}" ({c.status})
                    </option>
                  ))}
              </select>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif', marginBottom: 24, lineHeight: 1.4 }}>
              Tasks that are already marked as <strong>Done</strong> will stay in this sprint for historical reporting. Only incomplete tasks will be moved.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setRolloverModalCycle(null)}
                style={{ padding: '10px 20px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteSprintWithRollover}
                disabled={submittingRollover}
                className="btn-primary"
                style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {submittingRollover ? 'Completing…' : 'Complete & Rollover Tasks'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ Delete Cycle Target Modal ══ */}
      {deleteCycleTarget && (
        <Modal title="Delete Sprint Cycle" onClose={() => setDeleteCycleTarget(null)} width={420}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'Outfit, sans-serif', marginBottom: 28, lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteCycleTarget.name}</strong>? Tasks assigned to this sprint will be returned to the backlog.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setDeleteCycleTarget(null)} style={{ padding: '10px 20px' }}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444', padding: '10px 24px' }} onClick={confirmDeleteCycle}>Delete Sprint</button>
          </div>
        </Modal>
      )}

      {/* ══ Create / Edit Feature Module Modal ══ */}
      {showModuleModal && (
        <Modal
          title={editingModule ? `Edit Feature Module — ${editingModule.name}` : 'New Feature Module'}
          onClose={() => setShowModuleModal(false)}
          width={520}
        >
          <form onSubmit={saveModule}>
            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Module / Milestone Name *</FieldLabel>
              <input
                type="text"
                required
                placeholder="e.g. Payment Gateway & Invoicing"
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <FieldLabel>Description</FieldLabel>
              <textarea
                placeholder="Goals, deliverables, and technical scope of this module…"
                rows={3}
                value={moduleDescription}
                onChange={(e) => setModuleDescription(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <FieldLabel>Status</FieldLabel>
                <select
                  value={moduleStatus}
                  onChange={(e) => setModuleStatus(e.target.value as ModuleStatus)}
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>

              <div>
                <FieldLabel>Module Lead</FieldLabel>
                <select
                  value={moduleLead}
                  onChange={(e) => setModuleLead(e.target.value)}
                >
                  <option value="">No lead assigned</option>
                  {members.map((m) => (
                    <option key={m.user._id} value={m.user._id}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <input
                  type="date"
                  value={moduleStartDate}
                  onChange={(e) => setModuleStartDate(e.target.value)}
                  style={{ colorScheme: 'dark', cursor: 'pointer' }}
                />
              </div>

              <div>
                <FieldLabel>Target / Deadline Date</FieldLabel>
                <input
                  type="date"
                  value={moduleTargetDate}
                  onChange={(e) => setModuleTargetDate(e.target.value)}
                  style={{ colorScheme: 'dark', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowModuleModal(false)}
                style={{ padding: '10px 20px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submittingModule}
                style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
              >
                {submittingModule ? 'Saving…' : editingModule ? 'Update Module' : 'Create Module'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ Delete Module Target Modal ══ */}
      {deleteModuleTarget && (
        <Modal title="Delete Feature Module" onClose={() => setDeleteModuleTarget(null)} width={420}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'Outfit, sans-serif', marginBottom: 28, lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteModuleTarget.name}</strong>? Tasks assigned to this module will remain intact but will be detached from this module.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setDeleteModuleTarget(null)} style={{ padding: '10px 20px' }}>Cancel</button>
            <button className="btn-primary" style={{ background: '#ef4444', padding: '10px 24px' }} onClick={confirmDeleteModule}>Delete Module</button>
          </div>
        </Modal>
      )}
    </div>
  );
}