import type { PresetCatalog, User, VmRequest, Status, AdminUser, Comment, Metrics, AuditEntry } from './types';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => req<{ user: User }>('/api/me').then((r) => r.user),
  presets: () => req<PresetCatalog>('/api/presets'),

  listRequests: () => req<{ requests: VmRequest[] }>('/api/requests').then((r) => r.requests),
  createRequest: (
    perf: string,
    storage: string,
    os: string,
    purpose: string,
    startDate: string | null,
    endDate: string
  ) =>
    req<{ id: number }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify({ perf, storage, os, purpose, startDate, endDate }),
    }),
  getRequest: (id: number) => req<{ request: VmRequest }>(`/api/requests/${id}`).then((r) => r.request),
  requestExtension: (id: number, until: string) =>
    req<{ ok: true }>(`/api/requests/${id}/extend`, { method: 'POST', body: JSON.stringify({ until }) }),
  approveExtension: (id: number) => req<{ ok: true }>(`/api/admin/requests/${id}/extend/approve`, { method: 'POST' }),
  rejectExtension: (id: number) => req<{ ok: true }>(`/api/admin/requests/${id}/extend/reject`, { method: 'POST' }),
  terminate: (id: number) => req<{ ok: true }>(`/api/requests/${id}/terminate`, { method: 'POST' }),
  start: (id: number) => req<{ ok: true }>(`/api/requests/${id}/start`, { method: 'POST' }),
  stop: (id: number) => req<{ ok: true }>(`/api/requests/${id}/stop`, { method: 'POST' }),
  reboot: (id: number) => req<{ ok: true }>(`/api/requests/${id}/reboot`, { method: 'POST' }),
  live: (id: number) =>
    req<{ state: string; publicIp: string | null; launchTime: string | null }>(`/api/requests/${id}/live`),
  keyUrl: (id: number) => `/api/requests/${id}/key`,
  password: (id: number) => req<{ user: string; password: string }>(`/api/requests/${id}/password`),
  setSchedule: (
    id: number,
    payload: { enabled: boolean; start?: string; stop?: string; days?: number[] }
  ) => req<{ ok: true }>(`/api/requests/${id}/schedule`, { method: 'POST', body: JSON.stringify(payload) }),
  resumeSchedule: (id: number) => req<{ ok: true }>(`/api/requests/${id}/schedule/resume`, { method: 'POST' }),

  adminList: (status?: Status | '') =>
    req<{ requests: VmRequest[] }>(`/api/admin/requests${status ? `?status=${status}` : ''}`).then(
      (r) => r.requests
    ),
  adminStats: () => req<{ stats: Record<string, number> }>('/api/admin/stats').then((r) => r.stats),
  adminMetrics: () => req<{ metrics: Metrics }>('/api/admin/metrics').then((r) => r.metrics),
  adminUsers: () => req<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users),
  adminAudit: (limit = 150) =>
    req<{ entries: AuditEntry[] }>(`/api/admin/audit?limit=${limit}`).then((r) => r.entries),
  setUserRole: (email: string, role: 'admin' | 'member') =>
    req<{ ok: true }>(`/api/admin/users/${encodeURIComponent(email)}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  csvUrl: '/api/admin/requests.csv',
  approve: (id: number) => req<{ ok: true }>(`/api/admin/requests/${id}/approve`, { method: 'POST' }),
  reject: (id: number, note: string) =>
    req<{ ok: true }>(`/api/admin/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  comments: (id: number) => req<{ comments: Comment[] }>(`/api/requests/${id}/comments`).then((r) => r.comments),
  addComment: (id: number, body: string) =>
    req<{ ok: true }>(`/api/requests/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),

  logout: () => req<void>('/auth/logout', { method: 'POST' }),
};

export { ApiError };
