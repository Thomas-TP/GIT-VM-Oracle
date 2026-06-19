import type { Env, SessionUser, VmRequestRow } from './types';

export function isAdmin(env: Env, email: string): boolean {
  return env.ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function upsertUser(env: Env, user: Omit<SessionUser, 'role'>): Promise<SessionUser> {
  // env ADMIN_EMAILS are permanent bootstrap admins; DB-promoted admins persist.
  const existing = await env.DB.prepare(`SELECT role FROM users WHERE email = ?1`)
    .bind(user.email)
    .first<{ role: string }>();
  const role: SessionUser['role'] =
    isAdmin(env, user.email) || existing?.role === 'admin' ? 'admin' : 'member';
  await env.DB.prepare(
    `INSERT INTO users (email, name, role) VALUES (?1, ?2, ?3)
     ON CONFLICT(email) DO UPDATE SET name = ?2, role = ?3`
  )
    .bind(user.email, user.name, role)
    .run();
  return { ...user, role };
}

export async function listUsers(env: Env) {
  const res = await env.DB.prepare(
    `SELECT email, name, role, created_at FROM users ORDER BY role DESC, email`
  ).all();
  return res.results ?? [];
}

export async function setUserRole(env: Env, email: string, role: 'member' | 'admin') {
  await env.DB.prepare(`UPDATE users SET role = ?2 WHERE email = ?1`).bind(email, role).run();
}

export async function addComment(env: Env, requestId: number, author: string, body: string) {
  await env.DB.prepare(
    `INSERT INTO request_comments (request_id, author, body) VALUES (?1, ?2, ?3)`
  )
    .bind(requestId, author, body)
    .run();
}

export async function listComments(env: Env, requestId: number) {
  const res = await env.DB.prepare(
    `SELECT id, author, body, created_at FROM request_comments WHERE request_id = ?1 ORDER BY created_at`
  )
    .bind(requestId)
    .all();
  return res.results ?? [];
}

export async function metrics(env: Env) {
  const counts = await countByStatus(env);
  const succeeded = (counts.active ?? 0) + (counts.terminated ?? 0);
  const failed = counts.failed ?? 0;
  const successRate = succeeded + failed > 0 ? succeeded / (succeeded + failed) : 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // avg provisioning time = approve -> active, from the audit log
  const avg = await env.DB.prepare(
    `SELECT AVG((julianday(a2.created_at) - julianday(a1.created_at)) * 86400) AS s
       FROM audit_log a1 JOIN audit_log a2 ON a1.target = a2.target
      WHERE a1.action = 'request.approve' AND a2.action = 'vm.active'`
  ).first<{ s: number | null }>();
  return { total, successRate, failed, avgProvisionSeconds: Math.round(avg?.s ?? 0) };
}

export async function audit(env: Env, actor: string, action: string, target?: string, detail?: string) {
  await env.DB.prepare(`INSERT INTO audit_log (actor, action, target, detail) VALUES (?1, ?2, ?3, ?4)`)
    .bind(actor, action, target ?? null, detail ?? null)
    .run();
}

export async function createRequest(
  env: Env,
  email: string,
  purpose: string,
  perf: string,
  storage: string,
  os: string,
  region: string
): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO vm_requests (user_email, purpose, preset, storage, os, region)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(email, purpose, perf, storage, os, region)
    .run();
  return res.meta.last_row_id as number;
}

// Rate limiting: how many requests this user created in the last N minutes.
export async function countRecentRequests(env: Env, email: string, minutes: number): Promise<number> {
  const res = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM vm_requests WHERE user_email = ?1 AND created_at >= datetime('now', ?2)`
  )
    .bind(email, `-${minutes} minutes`)
    .first<{ n: number }>();
  return res?.n ?? 0;
}

export async function listRequestsForUser(env: Env, email: string): Promise<VmRequestRow[]> {
  const res = await env.DB.prepare(
    `SELECT r.*, v.public_ip AS public_ip, v.ssh_key_name AS ssh_key_name
       FROM vm_requests r
       LEFT JOIN vms v ON v.request_id = r.id
      WHERE r.user_email = ?1
      ORDER BY r.created_at DESC`
  )
    .bind(email)
    .all<VmRequestRow>();
  return res.results ?? [];
}

export async function listRequestsByStatus(env: Env, status?: string): Promise<VmRequestRow[]> {
  const stmt = status
    ? env.DB.prepare(`SELECT * FROM vm_requests WHERE status = ?1 ORDER BY created_at DESC`).bind(status)
    : env.DB.prepare(`SELECT * FROM vm_requests ORDER BY created_at DESC`);
  const res = await stmt.all<VmRequestRow>();
  return res.results ?? [];
}

export async function getRequest(env: Env, id: number): Promise<VmRequestRow | null> {
  return await env.DB.prepare(`SELECT * FROM vm_requests WHERE id = ?1`).bind(id).first<VmRequestRow>();
}

export async function setRequestStatus(
  env: Env,
  id: number,
  status: string,
  decidedBy?: string,
  note?: string
) {
  await env.DB.prepare(
    `UPDATE vm_requests
       SET status = ?2,
           decided_by = COALESCE(?3, decided_by),
           admin_note = COALESCE(?4, admin_note),
           decided_at = CASE WHEN ?3 IS NOT NULL THEN datetime('now') ELSE decided_at END
     WHERE id = ?1`
  )
    .bind(id, status, decidedBy ?? null, note ?? null)
    .run();
}

export interface RequestDetail extends VmRequestRow {
  aws_instance_id?: string | null;
  vm_state?: string | null;
  has_key?: number;
}

export async function getRequestDetail(env: Env, id: number): Promise<RequestDetail | null> {
  return await env.DB.prepare(
    `SELECT r.*, v.public_ip AS public_ip, v.ssh_key_name AS ssh_key_name,
            v.ssh_user AS ssh_user, v.aws_instance_id AS aws_instance_id, v.state AS vm_state,
            (v.ssh_private_key IS NOT NULL) AS has_key
       FROM vm_requests r
       LEFT JOIN vms v ON v.request_id = r.id
      WHERE r.id = ?1`
  )
    .bind(id)
    .first<RequestDetail>();
}

export async function countByStatus(env: Env): Promise<Record<string, number>> {
  const res = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM vm_requests GROUP BY status`
  ).all<{ status: string; n: number }>();
  const out: Record<string, number> = {};
  for (const row of res.results ?? []) out[row.status] = row.n;
  return out;
}

export async function createVm(
  env: Env,
  requestId: number,
  instanceId: string,
  keyName: string,
  encryptedPrivateKey: string,
  sshUser: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO vms (request_id, aws_instance_id, state, ssh_key_name, ssh_private_key, ssh_user)
     VALUES (?1, ?2, 'pending', ?3, ?4, ?5)`
  )
    .bind(requestId, instanceId, keyName, encryptedPrivateKey, sshUser)
    .run();
}

// Owner/admin SSH key retrieval. Returns the encrypted key + the request owner
// so the caller can enforce access.
export async function getKeyForRequest(
  env: Env,
  requestId: number
): Promise<{ user_email: string; ssh_key_name: string; ssh_private_key: string } | null> {
  return await env.DB.prepare(
    `SELECT r.user_email, v.ssh_key_name, v.ssh_private_key
       FROM vm_requests r JOIN vms v ON v.request_id = r.id
      WHERE r.id = ?1`
  )
    .bind(requestId)
    .first();
}

export async function updateVm(env: Env, requestId: number, state: string, publicIp?: string) {
  await env.DB.prepare(
    `UPDATE vms SET state = ?2, public_ip = COALESCE(?3, public_ip) WHERE request_id = ?1`
  )
    .bind(requestId, state, publicIp ?? null)
    .run();
}

export async function getVmByRequest(env: Env, requestId: number) {
  return await env.DB.prepare(`SELECT * FROM vms WHERE request_id = ?1`).bind(requestId).first();
}

export interface ActiveVm {
  id: number;
  status: string;
  user_email: string;
  aws_instance_id: string | null;
  ssh_user: string | null;
  state: string | null;
}

// Requests that have (or are getting) a live instance — for reconcile / scheduled stop.
export async function listActiveVms(env: Env): Promise<ActiveVm[]> {
  const res = await env.DB.prepare(
    `SELECT r.id, r.status, r.user_email, v.aws_instance_id, v.ssh_user, v.state
       FROM vm_requests r JOIN vms v ON v.request_id = r.id
      WHERE r.status IN ('provisioning', 'active')`
  ).all<ActiveVm>();
  return res.results ?? [];
}
