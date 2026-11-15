// lib/api.ts — All API interactions centralized here.

const RAW_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://team-task-manager-5ywl.onrender.com').trim();
// Strip trailing slash and trailing /api to prevent double /api/api
const BASE_URL = RAW_BASE_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '');

// ─── Domain types ─────────────────────────────────────────────────────────────

export type ProjectAddPrivacy = 'anyone' | 'nobody' | 'request';

export interface User {
  _id: string;
  name: string;
  email: string;
  avatar: string | null;
  isClockedIn?: boolean;
  lastClockIn?: string;
  lastClockOut?: string;
  projectAddPrivacy?: ProjectAddPrivacy;
  isSuperAdmin?: boolean;
  createdAt: string;
}

export interface ProjectInvitation {
  _id: string;
  project: { _id: string; name: string; color?: string; description?: string };
  user: User;
  invitedBy: User;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'declined';
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
  tags?: string[];
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
  assignedTo: User | User[] | null;
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
  const t = localStorage.getItem('token');
  if (!t || t === 'null' || t === 'undefined') return null;
  return t;
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

  // Ensure clean path and avoid duplicate /api prefix
  const cleanPath = path.startsWith('/api/')
    ? path.replace(/^\/api/, '')
    : path.startsWith('/')
    ? path
    : `/${path}`;

  const res = await fetch(`${BASE_URL}/api${cleanPath}`, {
    ...options,
    headers,
    credentials: 'include', // Ensures HTTP-only cookies are sent and received
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error: ApiError = new Error((data as { message?: string }).message ?? `Request failed: ${res.status}`);
    error.status = res.status;
    if (res.status === 401 && typeof window !== 'undefined') {
      const isAuthPage = window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/signup');
      if (!isAuthPage) {
        tokenHelpers.clear();
      }
    }
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
  logout:         ()                                                      => post<{ success: boolean; message: string }>('/auth/logout', {}),
  forgotPassword: (d: { email: string })                                 => post<{ success: boolean; message: string }>('/auth/forgot-password', d),
  resetPassword:  (d: { email: string; code: string; newPassword: string }) => post<{ success: boolean; message: string }>('/auth/reset-password', d),
  getMe:          ()                                                      => get<{
    success: boolean;
    user: User;
    subscription?: Subscription;
    isCoveredByAdmin?: boolean;
    coveringAdminName?: string | null;
    ownedProjectsCount?: number;
  }>('/auth/me'),
  updateMe:       (d: Partial<Pick<User, 'name' | 'avatar' | 'projectAddPrivacy'>>) => patch<{ success: boolean; user: User }>('/auth/me', d),
  uploadAvatar:   (image: string)                                         => post<{ success: boolean; message: string; avatar: string; user: User; isCloudinary: boolean }>('/auth/avatar', { image }),
  deleteAvatar:   ()                                                      => del<{ success: boolean; message: string; user: User }>('/auth/avatar'),
  changePassword: (d: { currentPassword: string; newPassword: string }) => post<AuthResponse>('/auth/change-password', d),
  clockIn:        ()                                                      => post<{ success: boolean; user: User }>('/auth/clock-in', {}),
  clockOut:       ()                                                      => post<{ success: boolean; user: User }>('/auth/clock-out', {}),
};

// ─── Projects ────────────────────────────────────────────────────────────────

export interface CreateProjectPayload { name: string; description?: string; color?: string; dueDate?: string }
export interface ProjectListResponse  { success: boolean; projects: Project[] }
export interface ProjectResponse      { success: boolean; project: Project; members: ProjectMember[]; taskStats?: unknown }

export const projectsApi = {
  list:              ()                                    => get<ProjectListResponse>('/projects'),
  create:            (d: CreateProjectPayload)             => post<{ success: boolean; project: Project }>('/projects', d),
  get:               (id: string)                          => get<ProjectResponse>(`/projects/${id}`),
  update:            (id: string, d: Partial<CreateProjectPayload & { status: string }>) => patch<{ success: boolean; project: Project }>(`/projects/${id}`, d),
  archive:           (id: string)                          => patch<{ success: boolean; project: Project }>(`/projects/${id}`, { status: 'archived' }),
  restore:           (id: string)                          => patch<{ success: boolean; project: Project }>(`/projects/${id}`, { status: 'active' }),
  complete:          (id: string)                          => patch<{ success: boolean; project: Project }>(`/projects/${id}`, { status: 'completed' }),
  delete:            (id: string)                          => del<{ success: boolean; message: string }>(`/projects/${id}`),
  addMember:         (pid: string, d: { email: string; role: 'admin' | 'member' }) => post<{ success: boolean; member?: ProjectMember; requiresApproval?: boolean; message?: string }>(`/projects/${pid}/members`, d),
  updateMemberRole:  (pid: string, uid: string, d: { role: 'admin' | 'member' })  => patch<{ success: boolean; member: ProjectMember }>(`/projects/${pid}/members/${uid}`, d),
  removeMember:      (pid: string, uid: string)            => del<{ success: boolean; message: string }>(`/projects/${pid}/members/${uid}`),
  getInvitations:    ()                                    => get<{ success: boolean; invitations: ProjectInvitation[] }>('/projects/invitations'),
  acceptInvitation:  (id: string)                          => post<{ success: boolean; message: string; project: string }>(`/projects/invitations/${id}/accept`, {}),
  declineInvitation: (id: string)                          => post<{ success: boolean; message: string }>(`/projects/invitations/${id}/decline`, {}),
  getTags:           (id: string)                          => get<{ success: boolean; tags: string[] }>(`/projects/${id}/tags`),
  addTag:            (id: string, tag: string)             => post<{ success: boolean; tag: string; tags: string[] }>(`/projects/${id}/tags`, { tag }),
  deleteTag:         (id: string, tag: string)             => del<{ success: boolean; tags: string[] }>(`/projects/${id}/tags/${encodeURIComponent(tag)}`),
};

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assignedTo?: string | string[];
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
  assignedTo?: string | string[];
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
  type: 'mention' | 'assignment' | 'status' | 'comment' | 'system' | 'invitation';
  text: string;
  isRead: boolean;
  createdAt: string;
  sender?: { _id: string; name: string; avatar: string | null };
  project?: string | { _id: string; name: string; color?: string };
  task?: string;
  invitation?: string | { _id: string; status: 'pending' | 'accepted' | 'declined'; role: string; project?: { _id: string; name: string } };
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

/**
 * Appends or injects the user's TaskForge account display name and avatar URL into the meeting link
 * so WebRTC conference platforms (MiroTalk, Jitsi, etc.) pre-fill their name and profile photo automatically,
 * and sets `notify=0` so MiroTalk suppresses the automatic "Share the room" QR popup modal.
 */
export function getPersonalizedMeetLink(meetLink: string, userName?: string, userAvatar?: string | null): string {
  if (!meetLink) return meetLink;
  try {
    const url = new URL(meetLink);
    if (url.hostname.includes('mirotalk')) {
      if (url.pathname.startsWith('/join/')) {
        const roomName = url.pathname.replace('/join/', '');
        const nameParam = userName ? `&name=${encodeURIComponent(userName)}` : '';
        const avatarParam = userAvatar ? `&avatar=${encodeURIComponent(userAvatar)}` : '';
        return `https://${url.hostname}/join?room=${encodeURIComponent(roomName)}${nameParam}${avatarParam}&notify=0`;
      }
      if (userName) {
        url.searchParams.set('name', userName);
      }
      if (userAvatar) {
        url.searchParams.set('avatar', userAvatar);
      }
      // notify=0 tells MiroTalk client to skip the "Share the room" QR code modal on join
      url.searchParams.set('notify', '0');
      return url.toString();
    }
    if (url.hostname.includes('jit.si')) {
      const hashParts: string[] = [];
      if (userName) {
        hashParts.push(`userInfo.displayName=${encodeURIComponent(JSON.stringify(userName))}`);
      }
      if (userAvatar) {
        hashParts.push(`userInfo.avatarURL=${encodeURIComponent(JSON.stringify(userAvatar))}`);
      }
      if (hashParts.length > 0) {
        return `${meetLink}#${hashParts.join('&')}`;
      }
      return meetLink;
    }

    // Generic WebRTC / custom video room
    if (userName) url.searchParams.set('name', userName);
    if (userAvatar) url.searchParams.set('avatar', userAvatar);
    return url.toString();
  } catch {
    const sep = meetLink.includes('?') ? '&' : '?';
    const namePart = userName ? `name=${encodeURIComponent(userName)}&` : '';
    const avatarPart = userAvatar ? `avatar=${encodeURIComponent(userAvatar)}&` : '';
    return `${meetLink}${sep}${namePart}${avatarPart}notify=0`;
  }
}

// ─── Subscriptions & Billing ──────────────────────────────────────────────────

export interface SubscriptionPaymentHistory {
  paymentId: string;
  orderId: string;
  amount: number;
  plan: string;
  paidAt: string;
  gateway?: string;
  method?: string;
  paymentMethod?: string;
}

export interface Subscription {
  _id: string;
  user: string;
  plan: 'free' | 'standard' | 'pro';
  status: 'active' | 'trialing' | 'expired' | 'cancelled' | 'pending';
  amount: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  daysRemaining: number;
  isActive: boolean;
  cancelAtPeriodEnd: boolean;
  isLifetime?: boolean;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  history: SubscriptionPaymentHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanDetails {
  id: 'free' | 'standard' | 'pro';
  name: string;
  price: number;
  amountInPaise?: number;
  currency?: string;
  interval: string;
  features: string[];
  maxProjects: number;
  maxMembers: number;
}

export interface SubscriptionResponse {
  success: boolean;
  subscription: Subscription;
  plans: Record<string, PlanDetails>;
  razorpayKeyId: string;
  isConfigured: boolean;
  isCoveredByAdmin?: boolean;
  coveringAdminName?: string | null;
  ownedProjectsCount?: number;
}

export interface CreateOrderResponse {
  success: boolean;
  orderId: string;
  amount: number;
  amountInPaise: number;
  currency: string;
  plan: PlanDetails;
  razorpayKeyId: string;
  isLiveConfigured: boolean;
  message?: string;
}

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  config?: {
    display?: {
      blocks?: Record<string, {
        name?: string;
        instruments?: Array<{
          method?: string;
          flows?: string[];
          banks?: string[];
          wallets?: string[];
        }>;
      }>;
      sequence?: string[];
      preferences?: {
        show_default_blocks?: boolean;
      };
    };
  };
  method?: {
    upi?: boolean;
    card?: boolean;
    netbanking?: boolean;
    wallet?: boolean;
  };
  handler: (response: RazorpayResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
}

export interface RazorpayInstance {
  open: () => void;
  on: (event: string, callback: unknown) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export interface RazorpayStandardOrderResponse {
  success: boolean;
  order_id: string;
  orderId?: string;
  amount: number;
  currency: string;
  key_id?: string;
  receipt?: string;
  message?: string;
}

export interface RazorpayStandardVerifyResponse {
  success: boolean;
  isPaid: boolean;
  message: string;
  order_id?: string;
  payment_id?: string;
  subscription?: Subscription;
}

export const razorpayApi = {
  createOrder: (data: { amount: number; currency?: string; receipt?: string; plan?: string; notes?: Record<string, string> }) =>
    post<RazorpayStandardOrderResponse>('/create-order', data),
  verifyPayment: (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    plan?: string;
  }) => post<RazorpayStandardVerifyResponse>('/verify-payment', data),
};

export const subscriptionApi = {
  get: () => get<SubscriptionResponse>('/subscriptions'),
  createOrder: (plan: 'standard' | 'pro') =>
    post<CreateOrderResponse>('/subscriptions/create-order', { plan }),
  verifyPayment: (data: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    plan: 'standard' | 'pro';
  }) => post<{ success: boolean; message: string; subscription: Subscription }>('/subscriptions/verify-payment', data),
  cancel: () =>
    post<{ success: boolean; message: string; subscription: Subscription }>('/subscriptions/cancel', {}),
  resetTrial: () =>
    post<{ success: boolean; message: string; subscription: Subscription }>('/subscriptions/reset-trial', {}),
  expireTrial: () =>
    post<{ success: boolean; message: string; subscription: Subscription }>('/subscriptions/expire-trial', {}),
};

// ─── Super Admin Control Panel ────────────────────────────────────────────────

export interface AdminMetrics {
  totalUsers: number;
  totalProjects: number;
  totalTasks: number;
  totalMeetings: number;
  estimatedMRR: number;
  subscriptions: {
    total: number;
    active: number;
    activeStandard: number;
    activePro: number;
    trialing: number;
    expired: number;
    lifetime: number;
  };
  recentPayments: Array<{
    paymentId?: string;
    orderId?: string;
    amount: number;
    plan: string;
    paidAt: string;
    gateway?: string;
    method?: string;
    userId: string;
  }>;
}

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  avatar: string | null;
  isSuperAdmin: boolean;
  isClockedIn: boolean;
  createdAt: string;
  subscription: Subscription;
  ownedProjectsCount: number;
  memberProjectsCount: number;
}

export interface AdminProject {
  _id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  createdBy: User;
  createdAt: string;
  memberCount: number;
  taskStats: { total: number; done: number };
}

export const adminApi = {
  getMetrics: () => get<{ success: boolean; metrics: AdminMetrics }>('/admin/metrics'),
  getUsers: (params: { search?: string; status?: string; plan?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return get<{ success: boolean; users: AdminUser[]; totalCount: number; page: number; limit: number }>(`/admin/users${qs ? `?${qs}` : ''}`);
  },
  updateSubscription: (
    userId: string,
    data: {
      action: 'grant_lifetime' | 'extend_trial' | 'set_plan' | 'expire' | 'reset_trial';
      plan?: 'free' | 'standard' | 'pro';
      days?: number;
    }
  ) => patch<{ success: boolean; message: string; subscription: Subscription }>(`/admin/users/${userId}/subscription`, data),
  toggleSuperAdmin: (userId: string, isSuperAdmin: boolean) =>
    patch<{ success: boolean; message: string; user: User }>(`/admin/users/${userId}/role`, { isSuperAdmin }),
  getProjects: () => get<{ success: boolean; projects: AdminProject[] }>('/admin/projects'),
};

// ─── Token helpers ────────────────────────────────────────────────────────────

export const tokenHelpers = {
  set: (t: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', t);
      document.cookie = `token=${t}; path=/; max-age=86400; SameSite=Lax`;
    }
  },
  clear: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    }
  },
  get: getToken,
};
