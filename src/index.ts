import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, SessionUser } from './types';
import { signToken, verifyToken, randomToken, encryptSecret, decryptSecret } from './crypto';
import { authorizeUrl, exchangeCode, userFromIdToken } from './oidc';
import {
  PERF,
  STORAGE,
  OS,
  isValidPerf,
  isValidStorage,
  isValidOs,
  STORAGE_USD_GB_MONTH,
} from './presets';
import { reportError } from './sentry';
import {
  upsertUser,
  audit,
  countAudit,
  createRequest,
  countRecentRequests,
  listRequestsForUser,
  listRequestsByStatus,
  getRequest,
  getRequestDetail,
  countByStatus,
  setRequestStatus,
  createVm,
  updateVm,
  getVmByRequest,
  getKeyForRequest,
  getPasswordForRequest,
  listActiveVms,
  listScheduledVms,
  setSchedule,
  setSchedulePaused,
  listExpired,
  listExpiringSoon,
  markExpired,
  requestExtension,
  approveExtension,
  rejectExtension,
  listUsers,
  setUserRole,
  addComment,
  listComments,
  listAudit,
  metrics,
} from './db';
import {
  createKeyPair,
  launchInstance,
  describeInstance,
  terminateInstance,
  deleteKeyPair,
  startInstance,
  stopInstance,
  rebootInstance,
  listManagedInstances,
} from './aws';
import {
  notifyAdminsNewRequest,
  notifyUserApproved,
  notifyUserRejected,
  notifyUserReady,
  notifyUserExpiring,
  notifyUserExpired,
  notifyAdminsExtension,
  notifyUserExtensionApproved,
  notifyUserExtensionRejected,
} from './email';

type Vars = { Variables: { user: SessionUser }; Bindings: Env };

const SESSION_TTL = 8 * 60 * 60;
const OIDC_TTL = 10 * 60;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const app = new Hono<Vars>();

function redirectUri(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin + '/auth/callback';
}
async function loadUser(c: any): Promise<SessionUser | null> {
  return await verifyToken<SessionUser>(c.env.SESSION_SECRET, getCookie(c, 'sess'));
}

const apiAuth = async (c: any, next: any) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};
const apiAdmin = async (c: any, next: any) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  c.set('user', user);
  await next();
};

// Strong random password for Windows (RDP). Guarantees one of each class and
// avoids characters that are awkward to quote in PowerShell / RDP clients.
function generateWindowsPassword(length = 18): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#_-+='];
  const all = sets.join('');
  const rand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map((s) => s[rand(s.length)]); // one from each class
  while (chars.length < length) chars.push(all[rand(all.length)]);
  // Fisher–Yates shuffle so the guaranteed chars aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// Create the SSH key + EC2 instance for a request. Shared by approve + retry.
// Windows VMs additionally get an Administrator password set via UserData and
// stored encrypted (no SSH; the user connects over RDP).
async function provisionRequest(env: Env, req: any): Promise<string> {
  const perf = PERF[req.preset];
  const os = OS[req.os ?? ''];
  const storage = STORAGE[req.storage ?? ''];
  if (!perf || !os || !storage) throw new Error('invalid preset composition');

  const isWindows = os.connect === 'rdp';
  let userData: string | undefined;
  let encPassword: string | null = null;
  if (isWindows) {
    const password = generateWindowsPassword();
    // EC2Launch v2 runs this on first boot; single-quoted so the password is literal.
    userData = `<powershell>\nnet user Administrator '${password}'\n</powershell>\n<persist>false</persist>`;
    encPassword = await encryptSecret(env.SESSION_SECRET, password);
  }

  const kp = await createKeyPair(env, req.id, isWindows ? 'rsa' : 'ed25519');
  const encKey = await encryptSecret(env.SESSION_SECRET, kp.privateKey);
  const { instanceId } = await launchInstance(env, {
    requestId: req.id,
    keyName: kp.keyName,
    instanceType: perf.instanceType,
    amiId: os.ami,
    sizeGb: storage.sizeGb,
    userData,
  });
  await createVm(env, req.id, instanceId, kp.keyName, encKey, os.sshUser, os.connect, encPassword);
  return instanceId;
}

// ---- OIDC (browser redirects) ------------------------------------------
app.get('/auth/login', async (c) => {
  const state = randomToken();
  const nonce = randomToken();
  const oidc = await signToken(c.env.SESSION_SECRET, { state, nonce }, OIDC_TTL);
  setCookie(c, 'oidc', oidc, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: OIDC_TTL });
  return c.redirect(authorizeUrl(c.env, redirectUri(c), state, nonce));
});

app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const err = c.req.query('error_description');
  if (err) return c.text(`Login error: ${err}`, 400);
  if (!code || !state) return c.text('Missing code/state', 400);
  const oidc = await verifyToken<{ state: string; nonce: string }>(c.env.SESSION_SECRET, getCookie(c, 'oidc'));
  if (!oidc || oidc.state !== state) return c.text('Invalid state', 400);
  deleteCookie(c, 'oidc', { path: '/' });
  try {
    const idToken = await exchangeCode(c.env, code, redirectUri(c));
    const base = userFromIdToken(c.env, idToken, oidc.nonce);
    const user = await upsertUser(c.env, base);
    const sess = await signToken(c.env.SESSION_SECRET, user, SESSION_TTL);
    setCookie(c, 'sess', sess, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL });
    await audit(c.env, user.email, 'auth.login');
    return c.redirect('/');
  } catch (e: any) {
    return c.text(`Auth failed: ${e.message}`, 403);
  }
});

app.post('/auth/logout', async (c) => {
  deleteCookie(c, 'sess', { path: '/' });
  return c.body(null, 204);
});

// ---- API ----------------------------------------------------------------
app.get('/healthz', (c) => c.json({ ok: true }));

app.get('/api/me', async (c) => {
  const user = await loadUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ user });
});

app.get('/api/presets', (c) =>
  c.json({
    perf: Object.values(PERF),
    storage: Object.values(STORAGE),
    os: Object.values(OS),
    storageUsdGbMonth: STORAGE_USD_GB_MONTH,
    region: c.env.AWS_REGION,
  })
);

app.get('/api/requests', apiAuth, async (c) => {
  const rows = await listRequestsForUser(c.env, c.get('user').email);
  return c.json({ requests: rows });
});

app.post('/api/requests', apiAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const perf = String(body.perf ?? '');
  const storage = String(body.storage ?? '');
  const os = String(body.os ?? '');
  const purpose = String(body.purpose ?? '').trim();
  if (!isValidPerf(perf) || !isValidStorage(storage) || !isValidOs(os) || !purpose) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  // Some OS need a minimum root disk (Windows ≥ 30 Go).
  const osDef = OS[os];
  const storageDef = STORAGE[storage];
  if (osDef.minStorageGb && storageDef.sizeGb < osDef.minStorageGb) {
    return c.json({ error: 'storage_too_small' }, 400);
  }
  // Lifecycle dates: end date is MANDATORY ("aucune machine sans date de fin").
  const now = Date.now();
  const end = body.endDate ? new Date(String(body.endDate)) : null;
  const start = body.startDate ? new Date(String(body.startDate)) : null;
  if (!end || isNaN(end.getTime()) || end.getTime() <= now) {
    return c.json({ error: 'invalid_end_date' }, 400);
  }
  if (start && (isNaN(start.getTime()) || start.getTime() >= end.getTime())) {
    return c.json({ error: 'invalid_start_date' }, 400);
  }
  // Rate limit: max 5 requests per hour per user.
  if ((await countRecentRequests(c.env, user.email, 60)) >= 5) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const id = await createRequest(
    c.env, user.email, purpose, perf, storage, os, c.env.AWS_REGION,
    start ? start.toISOString() : null, end.toISOString()
  );
  await audit(c.env, user.email, 'request.create', `req:${id}`, `${perf}/${storage}/${os} end:${end.toISOString()}`);
  c.executionCtx.waitUntil(notifyAdminsNewRequest(c.env, id, user.email, PERF[perf].label));
  return c.json({ id }, 201);
});

app.get('/api/requests/:id', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequestDetail(c.env, id);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  return c.json({ request: r });
});

app.get('/api/requests/:id/key', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const row = await getKeyForRequest(c.env, id);
  if (!row || !row.ssh_private_key) return c.json({ error: 'no_key' }, 404);
  if (row.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  const pem = await decryptSecret(c.env.SESSION_SECRET, row.ssh_private_key);
  await audit(c.env, user.email, 'key.download', `req:${id}`);
  return new Response(pem, {
    headers: {
      'Content-Type': 'application/x-pem-file',
      'Content-Disposition': `attachment; filename="${row.ssh_key_name}.pem"`,
    },
  });
});

// Windows RDP password — revealed only to the owner or an admin (audited).
app.get('/api/requests/:id/password', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const row = await getPasswordForRequest(c.env, id);
  if (!row || !row.admin_password) return c.json({ error: 'no_password' }, 404);
  if (row.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  const password = await decryptSecret(c.env.SESSION_SECRET, row.admin_password);
  await audit(c.env, user.email, 'password.reveal', `req:${id}`);
  return c.json({ user: row.ssh_user ?? 'Administrator', password });
});

app.post('/api/requests/:id/terminate', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequest(c.env, id);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);

  const vm: any = await getVmByRequest(c.env, id);
  try {
    if (vm?.aws_instance_id) await terminateInstance(c.env, vm.aws_instance_id);
    if (vm?.ssh_key_name) await deleteKeyPair(c.env, vm.ssh_key_name);
    if (vm) await updateVm(c.env, id, 'terminated');
    await setRequestStatus(c.env, id, 'terminated');
    await audit(c.env, user.email, 'vm.terminate', `req:${id}`, vm?.aws_instance_id ?? '');
    return c.json({ ok: true });
  } catch (e: any) {
    await audit(c.env, user.email, 'vm.terminate.failed', `req:${id}`, e.message);
    return c.json({ error: e.message }, 500);
  }
});

async function authorizeVm(c: any, id: number): Promise<{ r: any; vm: any } | null> {
  const user = c.get('user');
  const r = await getRequest(c.env, id);
  if (!r) return null;
  if (r.user_email !== user.email && user.role !== 'admin') return null;
  const vm: any = await getVmByRequest(c.env, id);
  return { r, vm };
}

app.post('/api/requests/:id/start', apiAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const ctx = await authorizeVm(c, id);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  if (!ctx.vm?.aws_instance_id) return c.json({ error: 'no_instance' }, 400);
  // An expired VM cannot be restarted by the user (needs an extension / re-approval).
  if (ctx.r.expired_at) return c.json({ error: 'expired' }, 409);
  try {
    await startInstance(c.env, ctx.vm.aws_instance_id);
    await updateVm(c.env, id, 'pending');
    // Manual start resumes the schedule.
    if (ctx.r.schedule_enabled) await setSchedulePaused(c.env, id, false);
    await audit(c.env, c.get('user').email, 'vm.start', `req:${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/requests/:id/stop', apiAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const ctx = await authorizeVm(c, id);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  if (!ctx.vm?.aws_instance_id) return c.json({ error: 'no_instance' }, 400);
  try {
    await stopInstance(c.env, ctx.vm.aws_instance_id);
    await updateVm(c.env, id, 'stopping');
    // Manual stop pauses the schedule so it doesn't auto-restart the VM.
    if (ctx.r.schedule_enabled) await setSchedulePaused(c.env, id, true);
    await audit(c.env, c.get('user').email, 'vm.stop', `req:${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/requests/:id/reboot', apiAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const ctx = await authorizeVm(c, id);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  if (!ctx.vm?.aws_instance_id) return c.json({ error: 'no_instance' }, 400);
  try {
    await rebootInstance(c.env, ctx.vm.aws_instance_id);
    await audit(c.env, c.get('user').email, 'vm.reboot', `req:${id}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Request an extension of the VM lifetime (owner/admin). Must be done BEFORE
// the end date (expiry deletes the VM). An admin then approves/rejects.
app.post('/api/requests/:id/extend', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequest(c.env, id);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  if (r.status !== 'active' || r.expired_at) return c.json({ error: 'not_extendable' }, 409);
  const body = await c.req.json().catch(() => ({}));
  const until = body.until ? new Date(String(body.until)) : null;
  const currentEnd = r.end_date ? new Date(r.end_date) : null;
  if (!until || isNaN(until.getTime()) || until.getTime() <= Date.now()) return c.json({ error: 'invalid_date' }, 400);
  if (currentEnd && until.getTime() <= currentEnd.getTime()) return c.json({ error: 'must_be_later' }, 400);
  await requestExtension(c.env, id, until.toISOString());
  await audit(c.env, user.email, 'extension.request', `req:${id}`, until.toISOString());
  c.executionCtx.waitUntil(notifyAdminsExtension(c.env, id, r.user_email, until.toISOString()));
  return c.json({ ok: true });
});

// Configure the per-VM auto start/stop schedule (owner/admin). Times are 'HH:MM'
// local Europe/Zurich; days are ISO weekdays (1=Mon..7=Sun). Enforced by the cron.
app.post('/api/requests/:id/schedule', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequest(c.env, id);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const enabled = !!body.enabled;
  if (enabled) {
    const start = String(body.start ?? '');
    const stop = String(body.stop ?? '');
    const days = Array.isArray(body.days)
      ? [...new Set(body.days.map(Number).filter((d: number) => Number.isInteger(d) && d >= 1 && d <= 7))]
      : [];
    if (!HHMM.test(start) || !HHMM.test(stop) || start === stop || days.length === 0) {
      return c.json({ error: 'invalid_schedule' }, 400);
    }
    await setSchedule(c.env, id, true, start, stop, (days as number[]).sort((a, b) => a - b).join(','));
    await audit(c.env, user.email, 'schedule.set', `req:${id}`, `${start}-${stop} d:${days.join('')}`);
  } else {
    await setSchedule(c.env, id, false, null, null, null);
    await audit(c.env, user.email, 'schedule.off', `req:${id}`);
  }
  return c.json({ ok: true });
});

// Resume a paused schedule (clears the manual-stop pause). The reconciler will
// then start the VM at the next start boundary.
app.post('/api/requests/:id/schedule/resume', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequest(c.env, id);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  await setSchedulePaused(c.env, id, false);
  await audit(c.env, user.email, 'schedule.resume', `req:${id}`);
  return c.json({ ok: true });
});

// Live AWS state (state + public IP + uptime) — used by the detail page.
app.get('/api/requests/:id/live', apiAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const ctx = await authorizeVm(c, id);
  if (!ctx) return c.json({ error: 'not_found' }, 404);
  if (!ctx.vm?.aws_instance_id) return c.json({ state: 'none' });
  try {
    const s = await describeInstance(c.env, ctx.vm.aws_instance_id);
    await updateVm(c.env, id, s.state, s.publicIp);
    return c.json({ state: s.state, publicIp: s.publicIp ?? null, launchTime: s.launchTime ?? null });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ---- Comments (owner + admins) -----------------------------------------
app.get('/api/requests/:id/comments', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequest(c.env, id);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  return c.json({ comments: await listComments(c.env, id) });
});

app.post('/api/requests/:id/comments', apiAuth, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequest(c.env, id);
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.user_email !== user.email && user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.body ?? '').trim().slice(0, 2000);
  if (!text) return c.json({ error: 'empty' }, 400);
  await addComment(c.env, id, user.email, text);
  await audit(c.env, user.email, 'comment.add', `req:${id}`);
  return c.json({ ok: true }, 201);
});

// ---- Admin API ----------------------------------------------------------
app.get('/api/admin/requests', apiAdmin, async (c) => {
  const status = c.req.query('status');
  const rows = await listRequestsByStatus(c.env, status || undefined);
  return c.json({ requests: rows });
});

app.get('/api/admin/stats', apiAdmin, async (c) => {
  return c.json({ stats: await countByStatus(c.env) });
});

app.get('/api/admin/metrics', apiAdmin, async (c) => {
  return c.json({ metrics: await metrics(c.env) });
});

app.get('/api/admin/users', apiAdmin, async (c) => {
  return c.json({ users: await listUsers(c.env) });
});

app.get('/api/admin/audit', apiAdmin, async (c) => {
  const limit = Number(c.req.query('limit') ?? '100');
  const action = c.req.query('action') || undefined;
  return c.json({ entries: await listAudit(c.env, isNaN(limit) ? 100 : limit, action) });
});

app.post('/api/admin/users/:email/role', apiAdmin, async (c) => {
  const admin = c.get('user');
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  const body = await c.req.json().catch(() => ({}));
  const role = body.role === 'admin' ? 'admin' : 'member';
  await setUserRole(c.env, email, role);
  await audit(c.env, admin.email, 'user.role', email, role);
  return c.json({ ok: true });
});

app.get('/api/admin/requests.csv', apiAdmin, async (c) => {
  const rows = await listRequestsByStatus(c.env);
  const cols = ['id', 'user_email', 'preset', 'storage', 'os', 'region', 'status', 'start_date', 'end_date', 'expired_at', 'created_at', 'decided_by', 'decided_at'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r: any) => cols.map((k) => esc(r[k])).join(','))].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="vm-requests.csv"',
    },
  });
});

app.post('/api/admin/requests/:id/approve', apiAdmin, async (c) => {
  const admin = c.get('user');
  const id = Number(c.req.param('id'));
  const req = await getRequest(c.env, id);
  if (!req || req.status !== 'pending') return c.json({ error: 'not_pending' }, 409);

  await setRequestStatus(c.env, id, 'provisioning', admin.email);
  await audit(c.env, admin.email, 'request.approve', `req:${id}`);
  try {
    const instanceId = await provisionRequest(c.env, req);
    await audit(c.env, admin.email, 'vm.launch', `req:${id}`, instanceId);
    c.executionCtx.waitUntil(notifyUserApproved(c.env, req.user_email, id));
    return c.json({ ok: true, status: 'provisioning' });
  } catch (e: any) {
    await setRequestStatus(c.env, id, 'failed', undefined, `provisioning: ${e.message}`);
    await audit(c.env, 'system', 'vm.launch.failed', `req:${id}`, e.message);
    return c.json({ error: e.message }, 500);
  }
});

app.post('/api/admin/requests/:id/extend/approve', apiAdmin, async (c) => {
  const admin = c.get('user');
  const id = Number(c.req.param('id'));
  const until = await approveExtension(c.env, id);
  if (!until) return c.json({ error: 'no_request' }, 409);
  await audit(c.env, admin.email, 'extension.approve', `req:${id}`, until);
  const r = await getRequest(c.env, id);
  if (r) c.executionCtx.waitUntil(notifyUserExtensionApproved(c.env, r.user_email, id, until));
  return c.json({ ok: true });
});

app.post('/api/admin/requests/:id/extend/reject', apiAdmin, async (c) => {
  const admin = c.get('user');
  const id = Number(c.req.param('id'));
  const r = await getRequest(c.env, id);
  if (!r || !r.ext_requested_end) return c.json({ error: 'no_request' }, 409);
  await rejectExtension(c.env, id);
  await audit(c.env, admin.email, 'extension.reject', `req:${id}`);
  c.executionCtx.waitUntil(notifyUserExtensionRejected(c.env, r.user_email, id));
  return c.json({ ok: true });
});

app.post('/api/admin/requests/:id/reject', apiAdmin, async (c) => {
  const admin = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const note = String(body.note ?? '').trim();
  const req = await getRequest(c.env, id);
  if (!req || req.status !== 'pending') return c.json({ error: 'not_pending' }, 409);
  await setRequestStatus(c.env, id, 'rejected', admin.email, note);
  await audit(c.env, admin.email, 'request.reject', `req:${id}`, note);
  c.executionCtx.waitUntil(notifyUserRejected(c.env, req.user_email, id, note));
  return c.json({ ok: true });
});

// ---- Static assets (React SPA) -----------------------------------------
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

// ---- Scheduled: reconcile state + scheduled stop ------------------------
// Reconcile DB against AWS: promote provisioning->active, sync running/stopped
// state, and detect drift (instances terminated outside the portal).
async function reconcile(env: Env): Promise<void> {
  let managed: Record<string, string> = {};
  try {
    managed = await listManagedInstances(env);
  } catch {
    /* AWS unreachable this tick — skip */
  }
  const rows = await listActiveVms(env);
  for (const row of rows) {
    if (!row.aws_instance_id) continue;
    try {
      const awsState = managed[row.aws_instance_id];

      // Drift: instance gone (terminated/replaced outside the portal)
      if (!awsState || awsState === 'terminated' || awsState === 'shutting-down') {
        await updateVm(env, row.id, 'terminated');
        await setRequestStatus(env, row.id, 'terminated');
        await audit(env, 'system', 'vm.drift.terminated', `req:${row.id}`, row.aws_instance_id);
        continue;
      }

      // Provisioning -> active once running with a public IP
      if (row.status === 'provisioning') {
        const s = await describeInstance(env, row.aws_instance_id);
        if (s.state === 'running' && s.publicIp) {
          await updateVm(env, row.id, 'running', s.publicIp);
          await setRequestStatus(env, row.id, 'active');
          await audit(env, 'system', 'vm.active', `req:${row.id}`, s.publicIp);
          await notifyUserReady(env, row.user_email, row.id, s.publicIp, row.ssh_user ?? 'ubuntu', row.connect_method === 'rdp' ? 'rdp' : 'ssh');
        } else {
          await updateVm(env, row.id, s.state);
        }
        continue;
      }

      // Active: keep DB state in sync; refresh IP when it comes back up
      if (awsState !== row.state) {
        if (awsState === 'running') {
          const s = await describeInstance(env, row.aws_instance_id);
          await updateVm(env, row.id, 'running', s.publicIp);
        } else {
          await updateVm(env, row.id, awsState);
        }
      }
    } catch (e: any) {
      await audit(env, 'system', 'vm.reconcile.error', `req:${row.id}`, e.message);
    }
  }
}

// Current weekday (1=Mon..7=Sun) and minutes-of-day in Europe/Zurich (DST-aware).
function zurichNow(): { day: number; minutes: number } {
  const z = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Zurich' }));
  return { day: z.getDay() === 0 ? 7 : z.getDay(), minutes: z.getHours() * 60 + z.getMinutes() };
}
function parseHHMM(s: string | null): number | null {
  const m = s ? /^(\d{2}):(\d{2})$/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// Minute inside [start, stop) — supports windows that wrap past midnight.
function inWindow(minutes: number, startM: number, stopM: number): boolean {
  if (startM === stopM) return false;
  return startM < stopM ? minutes >= startM && minutes < stopM : minutes >= startM || minutes < stopM;
}

// Enforce per-VM auto start/stop schedules (Europe/Zurich). Desired-state: inside the
// window on a selected weekday → the VM should run; otherwise → it should be stopped.
async function applySchedules(env: Env): Promise<void> {
  const { day, minutes } = zurichNow();
  for (const row of await listScheduledVms(env)) {
    if (!row.aws_instance_id) continue;
    const startM = parseHHMM(row.schedule_start);
    const stopM = parseHHMM(row.schedule_stop);
    if (startM === null || stopM === null) continue;
    const days = (row.schedule_days ?? '').split(',').map(Number);
    const shouldRun = days.includes(day) && inWindow(minutes, startM, stopM);
    try {
      if (shouldRun && row.state === 'stopped') {
        await startInstance(env, row.aws_instance_id);
        await updateVm(env, row.id, 'pending');
        await audit(env, 'system', 'vm.schedule.start', `req:${row.id}`);
      } else if (!shouldRun && row.state === 'running') {
        await stopInstance(env, row.aws_instance_id);
        await updateVm(env, row.id, 'stopping');
        await audit(env, 'system', 'vm.schedule.stop', `req:${row.id}`);
      }
    } catch (e: any) {
      await audit(env, 'system', 'vm.schedule.error', `req:${row.id}`, e.message);
    }
  }
}

// Stop all running portal VMs (off-hours cost guardrail). Users can restart them.
// VMs with their own enabled schedule are skipped (their schedule is authoritative).
async function scheduledStop(env: Env): Promise<void> {
  if (env.SCHEDULED_STOP !== 'true') return;
  const rows = await listActiveVms(env);
  for (const row of rows) {
    if (row.schedule_enabled) continue;
    if (row.status === 'active' && row.state === 'running' && row.aws_instance_id) {
      try {
        await stopInstance(env, row.aws_instance_id);
        await updateVm(env, row.id, 'stopping');
        await audit(env, 'system', 'vm.scheduled_stop', `req:${row.id}`);
      } catch (e: any) {
        await audit(env, 'system', 'vm.scheduled_stop.error', `req:${row.id}`, e.message);
      }
    }
  }
}

// Auto-retry provisioning for failed requests that never got an instance (max 3).
async function retryFailed(env: Env): Promise<void> {
  const failed = await listRequestsByStatus(env, 'failed');
  for (const req of failed) {
    const vm = await getVmByRequest(env, req.id);
    if (vm) continue; // an instance already exists
    if ((await countAudit(env, `req:${req.id}`, 'vm.launch.failed')) >= 3) continue;
    try {
      await setRequestStatus(env, req.id, 'provisioning');
      const instanceId = await provisionRequest(env, req);
      await audit(env, 'system', 'vm.launch.retry', `req:${req.id}`, instanceId);
    } catch (e: any) {
      await setRequestStatus(env, req.id, 'failed', undefined, `retry: ${e.message}`);
      await audit(env, 'system', 'vm.launch.failed', `req:${req.id}`, e.message);
    }
  }
}

// Lifecycle: at end_date, TERMINATE the VM (instance + SSH key destroyed) and mark it
// 'expired'. ADR 0008 supersedes ADR 0004 (auto-suppression demandée par le client).
// A one-time heads-up email is sent 24h before the deadline so users can back up.
async function enforceExpiry(env: Env): Promise<void> {
  for (const row of await listExpired(env)) {
    try {
      if (row.aws_instance_id) await terminateInstance(env, row.aws_instance_id);
      if (row.ssh_key_name) await deleteKeyPair(env, row.ssh_key_name);
      await updateVm(env, row.id, 'terminated');
      await markExpired(env, row.id);
      await setRequestStatus(env, row.id, 'terminated');
      await audit(env, 'system', 'vm.expired.terminated', `req:${row.id}`, row.aws_instance_id ?? '');
      await notifyUserExpired(env, row.user_email, row.id);
    } catch (e: any) {
      await audit(env, 'system', 'vm.expire.error', `req:${row.id}`, e.message);
    }
  }
  for (const row of await listExpiringSoon(env)) {
    if ((await countAudit(env, `req:${row.id}`, 'vm.expiring.notified')) > 0) continue;
    try {
      await notifyUserExpiring(env, row.user_email, row.id, row.end_date);
      await audit(env, 'system', 'vm.expiring.notified', `req:${row.id}`);
    } catch (e: any) {
      await audit(env, 'system', 'vm.expiring.error', `req:${row.id}`, e.message);
    }
  }
}

app.onError((err, c) => {
  reportError(c.env.SENTRY_DSN, err, c.executionCtx, { path: c.req.path });
  return c.json({ error: 'internal' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 19 * * *') {
      ctx.waitUntil(scheduledStop(env));
    } else {
      ctx.waitUntil(
        (async () => {
          await reconcile(env);
          await applySchedules(env);
          await retryFailed(env);
          await enforceExpiry(env);
        })()
      );
    }
  },
} satisfies ExportedHandler<Env>;
