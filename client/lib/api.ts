// lib/api.ts — All API interactions centralized here.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface User {
  _id: string;
  name: string;
  email: string;
  avatar: string | null;
  isClockedIn?: boolean;
  lastClockIn?: string;
  lastClockOut?: string;
  createdAt: string;
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  color: string;
  status: 'active' | 'archived' | 'completed';
  createdBy: User;
  dueDate: string | null;
  createdAt: string;
  myRole?: 'admin' | 'member';
  taskStats?: { todo: number; in_progress: number; done: number; total: number };
}

export interface ProjectMember {
  _id: string;
  project: string;
  user: User;
  role: 'admin' | 'member';
  joinedAt: string;
}

export type TaskStatus   = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ChecklistItem {
  _id?: string;
  title: string;
  completed: boolean;
}

export interface Comment {
  _id: string;
  user: User;
  text: string;
  type?: 'comment' | 'activity';
  createdAt: string;
  editedAt?: string;
}

export interface Task {
  _id: string;
  title: string;
  description: string;
  project: string | { _id: string; name: string; color?: string };
  createdBy: User;
  assignedTo: User | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  tags: string[];
  checklist?: ChecklistItem[];
  comments: Comment[];
  isOverdue?: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined on client
  projectName?: string;
  projectId?: string;
  myRole?: 'admin' | 'member';
}

export interface DashboardData {
  totalTasks: number;
  tasksByStatus: { todo: number; in_progress: number; done: number };
  tasksByPriority: Array<{ _id: string; count: number }>;
  tasksPerUser: Array<{ userId: string; name: string; email: string; count: number }>;
  overdueCount: number;
  overdueTasks: Task[];
  recentTasks: Task[];
  projectSummaries: Array<Project & { taskStats: { todo: number; in_progress: number; done: number; total: number }; myRole: 'admin' | 'member' }>;
  teamAttendance?: User[];
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

interface ApiError extends Error {
  status?: number;
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE_URL}/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error: ApiError = new Error((data as { message?: string }).message ?? `Request failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data as T;
}

const get   = <T>(path: string, opts?: RequestInit) => request<T>(path, { method: 'GET', ...opts });
const post  = <T>(path: string, body: unknown, opts?: RequestInit) => request<T>(path, { method: 'POST',  body: JSON.stringify(body), ...opts });
const patch = <T>(path: string, body: unknown, opts?: RequestInit) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...opts });
const del   = <T>(path: string, opts?: RequestInit) => request<T>(path, { method: 'DELETE', ...opts });

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse { success: boolean; token: string; user: User }

export const authApi = {
  signup:         (d: { name: string; email: string; password: string }) => post<AuthResponse>('/auth/signup', d),
  login:          (d: { email: string; password: string })               => post<AuthResponse>('/auth/login', d),
  getMe:          ()                                                      => get<{ success: boolean; user: User }>('/auth/me'),
  updateMe:       (d: Partial<Pick<User, 'name' | 'avatar'>>)            => patch<{ success: boolean; user: User }>('/auth/me', d),
  changePassword: (d: { currentPassword: string; newPassword: string }) => post<AuthResponse>('/auth/change-password', d),
  clockIn:        ()                                                      => post<{ success: boolean; user: User }>('/auth/clock-in', {}),
  clockOut:       ()                                                      => post<{ success: boolean; user: User }>('/auth/clock-out', {}),
};

// ─── Projects ────────────────────────────────────────────────────────────────

export interface CreateProjectPayload { name: string; description?: string; color?: string; dueDate?: string }
export interface ProjectListResponse  { success: boolean; projects: Project[] }
export interface ProjectResponse      { success: boolean; project: Project; members: ProjectMember[]; taskStats?: unknown }

export const projectsApi = {
  list:             ()                                    => get<ProjectListResponse>('/projects'),
  create:           (d: CreateProjectPayload)             => post<{ success: boolean; project: Project }>('/projects', d),
  get:              (id: string)                          => get<ProjectResponse>(`/projects/${id}`),
  update:           (id: string, d: Partial<CreateProjectPayload & { status: string }>) => patch<{ success: boolean; project: Project }>(`/projects/${id}`, d),
  archive:          (id: string)                          => patch<{ success: boolean; project: Project }>(`/projects/${id}`, { status: 'archived' }),
  restore:          (id: string)                          => patch<{ success: boolean; project: Project }>(`/projects/${id}`, { status: 'active' }),
  complete:         (id: string)                          => patch<{ success: boolean; project: Project }>(`/projects/${id}`, { status: 'completed' }),
  delete:           (id: string)                          => del<{ success: boolean; message: string }>(`/projects/${id}`),
  addMember:        (pid: string, d: { email: string; role: 'admin' | 'member' }) => post<{ success: boolean; member: ProjectMember }>(`/projects/${pid}/members`, d),
  updateMemberRole: (pid: string, uid: string, d: { role: 'admin' | 'member' })  => patch<{ success: boolean; member: ProjectMember }>(`/projects/${pid}/members/${uid}`, d),
  removeMember:     (pid: string, uid: string)            => del<{ success: boolean; message: string }>(`/projects/${pid}/members/${uid}`),
};

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assignedTo?: string;
  priority?: TaskPriority;
  dueDate?: string;
  tags?: string[];
  checklist?: ChecklistItem[];
}

export interface TaskListResponse { success: boolean; tasks: Task[]; pagination: { total: number; page: number; limit: number; pages: number } }
export interface TaskResponse     { success: boolean; task: Task }

export interface TaskFilterParams {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  page?: number;
  limit?: number;
}

export const tasksApi = {
  list: (pid: string, params: TaskFilterParams = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return get<TaskListResponse>(`/projects/${pid}/tasks${qs ? `?${qs}` : ''}`);
  },
  myTasks: (params: { status?: TaskStatus; priority?: TaskPriority } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return get<{ success: boolean; tasks: Task[] }>(`/projects/my-tasks${qs ? `?${qs}` : ''}`);
  },
  create:        (pid: string, d: CreateTaskPayload)                => post<TaskResponse>(`/projects/${pid}/tasks`, d),
  get:           (pid: string, tid: string)                         => get<TaskResponse>(`/projects/${pid}/tasks/${tid}`),
  update:        (pid: string, tid: string, d: Partial<CreateTaskPayload & { status: TaskStatus; checklist: ChecklistItem[] }>) => patch<TaskResponse>(`/projects/${pid}/tasks/${tid}`, d),
  delete:        (pid: string, tid: string)                         => del<{ success: boolean; message: string }>(`/projects/${pid}/tasks/${tid}`),
  addComment:    (pid: string, tid: string, d: { text: string })    => post<{ success: boolean; comment: Comment }>(`/projects/${pid}/tasks/${tid}/comments`, d),
  updateComment: (pid: string, tid: string, cid: string, d: { text: string }) => patch<{ success: boolean; comment: Comment }>(`/projects/${pid}/tasks/${tid}/comments/${cid}`, d),
  deleteComment: (pid: string, tid: string, cid: string)            => del<{ success: boolean; message: string }>(`/projects/${pid}/tasks/${tid}/comments/${cid}`),
};

export interface AttendanceLog {
  _id: string;
  user: User;
  clockIn: string;
  clockOut: string;
  durationMinutes: number;
  autoClockedOut?: boolean;
}

export const dashboardApi = {
  get:        ()          => get<{ success: boolean; dashboard: DashboardData }>('/dashboard'),
  getProject: (pid: string) => get<{ success: boolean; stats: unknown }>(`/dashboard/project/${pid}`),
  getAttendanceLogs: ()     => get<{ success: boolean; logs: AttendanceLog[] }>('/dashboard/attendance-logs'),
};

// ─── Notifications ─────────────────────────────────────────────────────────────

export interface Notification {
  _id: string;
  type: 'mention' | 'assignment' | 'status' | 'comment' | 'system';
  text: string;
  isRead: boolean;
  createdAt: string;
  sender?: { _id: string; name: string; avatar: string | null };
  project?: string;
  task?: string;
}

export const notificationsApi = {
  list:       () => get<{ success: boolean; notifications: Notification[] }>('/notifications'),
  markAsRead: (notificationIds?: string[]) => patch<{ success: boolean }>('/notifications/read', { notificationIds }),
};

// ─── Meetings ─────────────────────────────────────────────────────────────────

export interface AgendaItem {
  _id?: string;
  title: string;
  completed: boolean;
}

export interface Meeting {
  _id: string;
  title: string;
  description?: string;
  project?: { _id: string; name: string; color?: string } | null;
  createdBy: User;
  participants: User[];
  startTime: string;
  endTime: string;
  meetLink: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  agenda?: AgendaItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeetingPayload {
  title: string;
  description?: string;
  project?: string | null;
  participants?: string[];
  startTime: string;
  endTime: string;
  meetLink?: string;
  agenda?: Array<{ title: string; completed?: boolean }>;
}

export const meetingsApi = {
  list:   (params: { projectId?: string; status?: string; scope?: 'upcoming' | 'past' | 'all' } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return get<{ success: boolean; meetings: Meeting[] }>(`/meetings${qs ? `?${qs}` : ''}`);
  },
  getTeammates: () => get<{ success: boolean; teammates: User[] }>('/meetings/teammates'),
  get:    (id: string) => get<{ success: boolean; meeting: Meeting }>(`/meetings/${id}`),
  create: (d: CreateMeetingPayload) => post<{ success: boolean; meeting: Meeting }>('/meetings', d),
  update: (id: string, d: Partial<CreateMeetingPayload & { status: string; agenda: AgendaItem[] }>) => patch<{ success: boolean; meeting: Meeting }>(`/meetings/${id}`, d),
  delete: (id: string) => del<{ success: boolean; message: string }>(`/meetings/${id}`),
};

// ─── Token helpers ────────────────────────────────────────────────────────────

export const tokenHelpers = {
  set:   (t: string) => localStorage.setItem('token', t),
  clear: ()          => localStorage.removeItem('token'),
  get:   getToken,
};
