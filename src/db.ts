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

// ---- In-app notifications ----------------------------------------------
export async function addNotification(env: Env, userEmail: string, type: string, link: string | null = null) {
  await env.DB.prepare(`INSERT INTO notifications (user_email, type, link) VALUES (?1, ?2, ?3)`)
    .bind(userEmail, type, link)
    .run();
}

// In-app notification for every configured admin.
export async function notifyAdminsInApp(env: Env, type: string, link: string | null = null) {
  const admins = env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const a of admins) await addNotification(env, a, type, link);
}

export async function listNotifications(env: Env, userEmail: string, limit = 30) {
  const res = await env.DB.prepare(
    `SELECT id, type, link, read, created_at FROM notifications
      WHERE user_email = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2`
  )
    .bind(userEmail, limit)
    .all();
  return res.results ?? [];
}

export async function countUnreadNotifications(env: Env, userEmail: string): Promise<number> {
  const res = await env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_email = ?1 AND read = 0`)
    .bind(userEmail)
    .first<{ n: number }>();
  return res?.n ?? 0;
}

export async function markNotificationsRead(env: Env, userEmail: string) {
  await env.DB.prepare(`UPDATE notifications SET read = 1 WHERE user_email = ?1 AND read = 0`).bind(userEmail).run();
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

export async function countAudit(env: Env, target: string, action: string): Promise<number> {
  const res = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE target = ?1 AND action = ?2`)
    .bind(target, action)
    .first<{ n: number }>();
  return res?.n ?? 0;
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
  region: string,
  startDate: string | null,
  endDate: string,
  course: string | null = null,
  groupId: string | null = null,
  groupName: string | null = null,
  restoreSnapshotId: number | null = null,
  name: string | null = null
): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO vm_requests (user_email, purpose, preset, storage, os, region, start_date, end_date, course, group_id, group_name, restore_snapshot_id, name)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
  )
    .bind(email, purpose, perf, storage, os, region, startDate, endDate, course, groupId, groupName, restoreSnapshotId, name?.slice(0, 60) ?? null)
    .run();
  return res.meta.last_row_id as number;
}

// ---- Groups (organize VMs) ---------------------------------------------
export interface GroupVm {
  id: number;
  status: string;
  expired_at: string | null;
  aws_instance_id: string | null;
  ssh_key_name: string | null;
  state: string | null;
}

// All requests in a group (admin scope — any owner) for group-level decisions.
export async function listGroupRequests(env: Env, groupId: string): Promise<VmRequestRow[]> {
  const res = await env.DB.prepare(`SELECT * FROM vm_requests WHERE group_id = ?1 ORDER BY id`).bind(groupId).all<VmRequestRow>();
  return res.results ?? [];
}

// Owned VMs in a group, with the bits needed for bulk start/stop/reboot/terminate.
export async function listGroupVms(env: Env, owner: string, groupId: string): Promise<GroupVm[]> {
  const res = await env.DB.prepare(
    `SELECT r.id, r.status, r.expired_at, v.aws_instance_id, v.ssh_key_name, v.state
       FROM vm_requests r LEFT JOIN vms v ON v.request_id = r.id
      WHERE r.group_id = ?1 AND r.user_email = ?2`
  )
    .bind(groupId, owner)
    .all<GroupVm>();
  return res.results ?? [];
}

// Assign a group (id + name) to a set of owned requests. D1 has no array binding,
// so the IN placeholders are built dynamically (ids are integers — safe).
export async function assignGroup(env: Env, owner: string, ids: number[], groupId: string, groupName: string) {
  if (!ids.length) return;
  const ph = ids.map((_, i) => `?${i + 4}`).join(',');
  await env.DB.prepare(
    `UPDATE vm_requests SET group_id = ?1, group_name = ?2 WHERE user_email = ?3 AND id IN (${ph})`
  )
    .bind(groupId, groupName, owner, ...ids)
    .run();
}

export async function renameGroup(env: Env, owner: string, groupId: string, name: string) {
  await env.DB.prepare(`UPDATE vm_requests SET group_name = ?3 WHERE group_id = ?1 AND user_email = ?2`)
    .bind(groupId, owner, name)
    .run();
}

export async function clearGroup(env: Env, owner: string, groupId: string) {
  await env.DB.prepare(`UPDATE vm_requests SET group_id = NULL, group_name = NULL WHERE group_id = ?1 AND user_email = ?2`)
    .bind(groupId, owner)
    .run();
}

// ---- Snapshots ----------------------------------------------------------
export interface SnapshotRow {
  id: number;
  request_id: number | null;
  user_email: string;
  aws_snapshot_id: string | null;
  description: string | null;
  root_device: string | null;
  architecture: string | null;
  size_gb: number | null;
  status: string;
  ova_status: string | null;
  ova_url: string | null;
  os: string | null;
  created_at: string;
  completed_at: string | null;
  export_status: string | null;
  export_format: string | null;
  export_key: string | null;
  export_url: string | null;
  export_instance_id: string | null;
  export_started_at: string | null;
}

export async function createSnapshotRow(
  env: Env,
  requestId: number,
  owner: string,
  awsSnapshotId: string,
  description: string,
  rootDevice: string | null,
  architecture: string | null,
  os: string | null = null
): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO snapshots (request_id, user_email, aws_snapshot_id, description, root_device, architecture, os)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(requestId, owner, awsSnapshotId, description.slice(0, 255), rootDevice, architecture, os)
    .run();
  return res.meta.last_row_id as number;
}

export async function listSnapshotsForRequest(env: Env, requestId: number): Promise<SnapshotRow[]> {
  const res = await env.DB.prepare(`SELECT * FROM snapshots WHERE request_id = ?1 ORDER BY created_at DESC`).bind(requestId).all<SnapshotRow>();
  return res.results ?? [];
}

export async function listSnapshotsForUser(env: Env, owner: string): Promise<SnapshotRow[]> {
  const res = await env.DB.prepare(`SELECT * FROM snapshots WHERE user_email = ?1 ORDER BY created_at DESC LIMIT 100`).bind(owner).all<SnapshotRow>();
  return res.results ?? [];
}

export async function getSnapshot(env: Env, id: number, owner: string): Promise<SnapshotRow | null> {
  return await env.DB.prepare(`SELECT * FROM snapshots WHERE id = ?1 AND user_email = ?2`).bind(id, owner).first<SnapshotRow>();
}

export async function updateSnapshotStatus(env: Env, awsSnapshotId: string, status: string, sizeGb?: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE snapshots SET status = ?2, size_gb = COALESCE(?3, size_gb),
            completed_at = CASE WHEN ?2 = 'completed' THEN datetime('now') ELSE completed_at END
       WHERE aws_snapshot_id = ?1`
  )
    .bind(awsSnapshotId, status, sizeGb ?? null)
    .run();
}

// Snapshots still being created (for the reconciler to poll).
export async function listPendingSnapshots(env: Env): Promise<{ id: number; aws_snapshot_id: string }[]> {
  const res = await env.DB.prepare(`SELECT id, aws_snapshot_id FROM snapshots WHERE status = 'pending' AND aws_snapshot_id IS NOT NULL`).all<{ id: number; aws_snapshot_id: string }>();
  return res.results ?? [];
}

export async function setSnapshotOnDelete(env: Env, owner: string, id: number, enabled: boolean): Promise<void> {
  await env.DB.prepare(`UPDATE vm_requests SET snapshot_on_delete = ?3 WHERE id = ?1 AND user_email = ?2`).bind(id, owner, enabled ? 1 : 0).run();
}

// ---- snapshot → local-disk export, per target (VMware / VirtualBox) ----
export interface SnapshotExportRow {
  id: number;
  snapshot_id: number;
  user_email: string;
  target: string;
  status: string;
  s3_key: string | null;
  url: string | null;
  instance_id: string | null;
  started_at: string;
}

export async function createExport(env: Env, snapshotId: number, owner: string, target: string, s3Key: string, instanceId: string): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO snapshot_exports (snapshot_id, user_email, target, status, s3_key, instance_id) VALUES (?1, ?2, ?3, 'running', ?4, ?5)`
  ).bind(snapshotId, owner, target, s3Key, instanceId).run();
  return res.meta.last_row_id as number;
}

export async function getRunningExport(env: Env, snapshotId: number, target: string): Promise<SnapshotExportRow | null> {
  return await env.DB.prepare(`SELECT * FROM snapshot_exports WHERE snapshot_id = ?1 AND target = ?2 AND status = 'running'`).bind(snapshotId, target).first<SnapshotExportRow>();
}

export async function listExportsForRequest(env: Env, requestId: number): Promise<SnapshotExportRow[]> {
  const res = await env.DB.prepare(
    `SELECT e.* FROM snapshot_exports e JOIN snapshots s ON s.id = e.snapshot_id WHERE s.request_id = ?1`
  ).bind(requestId).all<SnapshotExportRow>();
  return res.results ?? [];
}

export async function setExportStatus(env: Env, id: number, status: 'ready' | 'error', url: string | null = null): Promise<void> {
  await env.DB.prepare(`UPDATE snapshot_exports SET status = ?2, url = COALESCE(?3, url) WHERE id = ?1`).bind(id, status, url).run();
}

export async function listRunningExports(env: Env): Promise<SnapshotExportRow[]> {
  const res = await env.DB.prepare(`SELECT * FROM snapshot_exports WHERE status = 'running'`).all<SnapshotExportRow>();
  return res.results ?? [];
}

// Hard-delete a request the user wants gone from their list (terminal states only).
export async function deleteRequest(env: Env, owner: string, id: number): Promise<boolean> {
  const r = await env.DB.prepare(`SELECT status, expired_at FROM vm_requests WHERE id = ?1 AND user_email = ?2`)
    .bind(id, owner)
    .first<{ status: string; expired_at: string | null }>();
  if (!r) return false;
  const terminal = r.status === 'terminated' || r.status === 'rejected' || r.status === 'failed' || !!r.expired_at;
  if (!terminal) return false;
  await env.DB.prepare(`DELETE FROM vms WHERE request_id = ?1`).bind(id).run();
  await env.DB.prepare(`DELETE FROM vm_requests WHERE id = ?1`).bind(id).run();
  return true;
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
    `SELECT r.*, v.public_ip AS public_ip, v.ssh_key_name AS ssh_key_name,
            v.state AS vm_state, v.connect_method AS connect_method
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
  // "expired" is derived from expired_at; filtering by it (or by 'active') honors that.
  // Enriched with the joined vms row so the admin console can show live VM details.
  const eff = `(CASE WHEN r.expired_at IS NOT NULL THEN 'expired' ELSE r.status END)`;
  const cols = `r.*, v.public_ip AS public_ip, v.ssh_key_name AS ssh_key_name,
                v.ssh_user AS ssh_user, v.aws_instance_id AS aws_instance_id,
                v.state AS vm_state, v.connect_method AS connect_method`;
  const stmt = status
    ? env.DB.prepare(
        `SELECT ${cols} FROM vm_requests r LEFT JOIN vms v ON v.request_id = r.id
          WHERE ${eff} = ?1 ORDER BY r.created_at DESC`
      ).bind(status)
    : env.DB.prepare(
        `SELECT ${cols} FROM vm_requests r LEFT JOIN vms v ON v.request_id = r.id
          ORDER BY r.created_at DESC`
      );
  const res = await stmt.all<VmRequestRow>();
  return res.results ?? [];
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}

// Recent audit log entries for the admin console (most recent first).
export async function listAudit(env: Env, limit = 100, action?: string): Promise<AuditEntry[]> {
  const lim = Math.min(Math.max(limit, 1), 500);
  const stmt = action
    ? env.DB.prepare(
        `SELECT id, actor, action, target, detail, created_at FROM audit_log
          WHERE action = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2`
      ).bind(action, lim)
    : env.DB.prepare(
        `SELECT id, actor, action, target, detail, created_at FROM audit_log
          ORDER BY created_at DESC, id DESC LIMIT ?1`
      ).bind(lim);
  const res = await stmt.all<AuditEntry>();
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
  connect_method?: string | null;
  has_password?: number;
}

export async function getRequestDetail(env: Env, id: number): Promise<RequestDetail | null> {
  return await env.DB.prepare(
    `SELECT r.*, v.public_ip AS public_ip, v.ssh_key_name AS ssh_key_name,
            v.ssh_user AS ssh_user, v.aws_instance_id AS aws_instance_id, v.state AS vm_state,
            v.connect_method AS connect_method,
            (v.ssh_private_key IS NOT NULL) AS has_key,
            (v.admin_password IS NOT NULL) AS has_password
       FROM vm_requests r
       LEFT JOIN vms v ON v.request_id = r.id
      WHERE r.id = ?1`
  )
    .bind(id)
    .first<RequestDetail>();
}

// Owner/admin Windows password retrieval. Returns the encrypted password + the
// request owner so the caller can enforce access (mirrors getKeyForRequest).
export async function getPasswordForRequest(
  env: Env,
  requestId: number
): Promise<{ user_email: string; admin_password: string | null; ssh_user: string | null } | null> {
  return await env.DB.prepare(
    `SELECT r.user_email, v.admin_password, v.ssh_user
       FROM vm_requests r JOIN vms v ON v.request_id = r.id
      WHERE r.id = ?1`
  )
    .bind(requestId)
    .first();
}

// ---- Monitoring aggregates (for Grafana) -------------------------------
export async function requestsPerDay(env: Env, days = 30) {
  const res = await env.DB.prepare(
    `SELECT date(created_at) AS day, COUNT(*) AS count FROM vm_requests
      WHERE created_at >= datetime('now', ?1) GROUP BY day ORDER BY day`
  )
    .bind(`-${days} days`)
    .all();
  return res.results ?? [];
}

export async function countByOs(env: Env) {
  const res = await env.DB.prepare(
    `SELECT COALESCE(os, '?') AS os, COUNT(*) AS count FROM vm_requests GROUP BY os ORDER BY count DESC`
  ).all();
  return res.results ?? [];
}

export async function countByUser(env: Env) {
  const res = await env.DB.prepare(
    `SELECT user_email, COUNT(*) AS count FROM vm_requests GROUP BY user_email ORDER BY count DESC`
  ).all();
  return res.results ?? [];
}

// Active (non-expired) requests with their preset/storage ids — for cost rollup.
export async function listActiveForCost(env: Env): Promise<{ preset: string; storage: string | null }[]> {
  const res = await env.DB.prepare(
    `SELECT preset, storage FROM vm_requests WHERE status = 'active' AND expired_at IS NULL`
  ).all<{ preset: string; storage: string | null }>();
  return res.results ?? [];
}

export async function countByStatus(env: Env): Promise<Record<string, number>> {
  // Bucket expired VMs separately (derived from expired_at) so "active" excludes them.
  const res = await env.DB.prepare(
    `SELECT CASE WHEN expired_at IS NOT NULL THEN 'expired' ELSE status END AS status,
            COUNT(*) AS n
       FROM vm_requests GROUP BY 1`
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
  sshUser: string,
  connectMethod: 'ssh' | 'rdp' = 'ssh',
  encryptedAdminPassword: string | null = null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO vms (request_id, aws_instance_id, state, ssh_key_name, ssh_private_key, ssh_user, connect_method, admin_password)
     VALUES (?1, ?2, 'pending', ?3, ?4, ?5, ?6, ?7)`
  )
    .bind(requestId, instanceId, keyName, encryptedPrivateKey, sshUser, connectMethod, encryptedAdminPassword)
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

// Remove the VM row (used by reset before re-provisioning a fresh instance).
export async function deleteVm(env: Env, requestId: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM vms WHERE request_id = ?1`).bind(requestId).run();
}

// Clear the course-ready marker (reset re-runs the course install).
export async function clearCourseReady(env: Env, requestId: number): Promise<void> {
  await env.DB.prepare(`UPDATE vm_requests SET course_ready_at = NULL WHERE id = ?1`).bind(requestId).run();
}

export interface ActiveVm {
  id: number;
  status: string;
  user_email: string;
  aws_instance_id: string | null;
  ssh_user: string | null;
  state: string | null;
  connect_method: string | null;
  schedule_enabled: number;
}

// Requests that have (or are getting) a live instance — for reconcile / scheduled stop.
export async function listActiveVms(env: Env): Promise<ActiveVm[]> {
  const res = await env.DB.prepare(
    `SELECT r.id, r.status, r.user_email, v.aws_instance_id, v.ssh_user, v.state, v.connect_method,
            r.schedule_enabled
       FROM vm_requests r JOIN vms v ON v.request_id = r.id
      WHERE r.status IN ('provisioning', 'active')`
  ).all<ActiveVm>();
  return res.results ?? [];
}

export interface ScheduledVm {
  id: number;
  user_email: string;
  aws_instance_id: string | null;
  state: string | null;
  schedule_start: string | null;
  schedule_stop: string | null;
  schedule_days: string | null;
}

// Active VMs with an enabled auto start/stop schedule — for the reconciler to enforce.
// Paused VMs (manually stopped by the user) are excluded until resumed.
export async function listScheduledVms(env: Env): Promise<ScheduledVm[]> {
  const res = await env.DB.prepare(
    `SELECT r.id, r.user_email, v.aws_instance_id, v.state,
            r.schedule_start, r.schedule_stop, r.schedule_days
       FROM vm_requests r JOIN vms v ON v.request_id = r.id
      WHERE r.status = 'active' AND r.expired_at IS NULL AND r.schedule_enabled = 1
        AND r.schedule_paused = 0 AND v.aws_instance_id IS NOT NULL`
  ).all<ScheduledVm>();
  return res.results ?? [];
}

export async function setSchedule(
  env: Env,
  id: number,
  enabled: boolean,
  start: string | null,
  stop: string | null,
  days: string | null
): Promise<void> {
  // Saving a schedule clears any manual pause.
  await env.DB.prepare(
    `UPDATE vm_requests
        SET schedule_enabled = ?2, schedule_start = ?3, schedule_stop = ?4, schedule_days = ?5,
            schedule_paused = 0
      WHERE id = ?1`
  )
    .bind(id, enabled ? 1 : 0, start, stop, days)
    .run();
}

// Pause/resume the schedule (manual stop pauses; manual start or resume clears it).
export async function setSchedulePaused(env: Env, id: number, paused: boolean): Promise<void> {
  await env.DB.prepare(`UPDATE vm_requests SET schedule_paused = ?2 WHERE id = ?1`)
    .bind(id, paused ? 1 : 0)
    .run();
}

export interface ExpirableVm {
  id: number;
  user_email: string;
  end_date: string;
  aws_instance_id: string | null;
  state: string | null;
  ssh_key_name: string | null;
  snapshot_on_delete: number;
}

// Active VMs whose end_date has passed and not yet processed — to TERMINATE (ADR 0008,
// supersede ADR 0004). The key name lets the reconciler delete the AWS key pair too.
export async function listExpired(env: Env): Promise<ExpirableVm[]> {
  const res = await env.DB.prepare(
    `SELECT r.id, r.user_email, r.end_date, v.aws_instance_id, v.state, v.ssh_key_name, r.snapshot_on_delete
       FROM vm_requests r JOIN vms v ON v.request_id = r.id
      WHERE r.status = 'active' AND r.expired_at IS NULL AND r.end_date IS NOT NULL
        AND datetime(r.end_date) <= datetime('now')`
  ).all<ExpirableVm>();
  return res.results ?? [];
}

// Active VMs expiring within the next 24h — for the heads-up email (sent once).
export async function listExpiringSoon(
  env: Env
): Promise<{ id: number; user_email: string; end_date: string }[]> {
  const res = await env.DB.prepare(
    `SELECT r.id, r.user_email, r.end_date
       FROM vm_requests r
      WHERE r.status = 'active' AND r.expired_at IS NULL AND r.end_date IS NOT NULL
        AND datetime(r.end_date) > datetime('now')
        AND datetime(r.end_date) <= datetime('now', '+24 hours')`
  ).all<{ id: number; user_email: string; end_date: string }>();
  return res.results ?? [];
}

// Mark a request as expired (VM stopped, not destroyed). Status stays 'active' so
// the CHECK constraint is untouched; "expired" is derived from expired_at everywhere.
export async function markExpired(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE vm_requests SET expired_at = datetime('now') WHERE id = ?1`)
    .bind(id)
    .run();
}

// Marks course tools as installed (called back by the VM's cloud-init). Once only.
export async function setCourseReady(env: Env, id: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE vm_requests SET course_ready_at = datetime('now') WHERE id = ?1 AND course_ready_at IS NULL`
  )
    .bind(id)
    .run();
}

// ---- Extension requests (user asks, admin approves) --------------------
export async function requestExtension(env: Env, id: number, until: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE vm_requests SET ext_requested_end = ?2, ext_requested_at = datetime('now') WHERE id = ?1`
  )
    .bind(id, until)
    .run();
}

// Approve: apply the requested end date and clear the pending request.
export async function approveExtension(env: Env, id: number): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT ext_requested_end FROM vm_requests WHERE id = ?1`)
    .bind(id)
    .first<{ ext_requested_end: string | null }>();
  if (!row?.ext_requested_end) return null;
  await env.DB.prepare(
    `UPDATE vm_requests SET end_date = ext_requested_end, ext_requested_end = NULL, ext_requested_at = NULL WHERE id = ?1`
  )
    .bind(id)
    .run();
  return row.ext_requested_end;
}

export async function rejectExtension(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE vm_requests SET ext_requested_end = NULL, ext_requested_at = NULL WHERE id = ?1`)
    .bind(id)
    .run();
}
