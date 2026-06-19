import type { PresetCatalog, User, VmRequest, Status } from './types';

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
  createRequest: (perf: string, storage: string, os: string, purpose: string) =>
    req<{ id: number }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify({ perf, storage, os, purpose }),
    }),
  getRequest: (id: number) => req<{ request: VmRequest }>(`/api/requests/${id}`).then((r) => r.request),
  terminate: (id: number) => req<{ ok: true }>(`/api/requests/${id}/terminate`, { method: 'POST' }),
  keyUrl: (id: number) => `/api/requests/${id}/key`,

  adminList: (status?: Status | '') =>
    req<{ requests: VmRequest[] }>(`/api/admin/requests${status ? `?status=${status}` : ''}`).then(
      (r) => r.requests
    ),
  adminStats: () => req<{ stats: Record<string, number> }>('/api/admin/stats').then((r) => r.stats),
  approve: (id: number) => req<{ ok: true }>(`/api/admin/requests/${id}/approve`, { method: 'POST' }),
  reject: (id: number, note: string) =>
    req<{ ok: true }>(`/api/admin/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  logout: () => req<void>('/auth/logout', { method: 'POST' }),
};

export { ApiError };
