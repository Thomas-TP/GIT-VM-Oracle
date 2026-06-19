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
  estimateMonthlyUsd,
  STORAGE_USD_GB_MONTH,
} from './presets';
import {
  upsertUser,
  audit,
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
  listActiveVms,
  listUsers,
  setUserRole,
  addComment,
  listComments,
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
} from './email';

type Vars = { Variables: { user: SessionUser }; Bindings: Env };

const SESSION_TTL = 8 * 60 * 60;
const OIDC_TTL = 10 * 60;

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
  // Rate limit: max 5 requests per hour per user.
  if ((await countRecentRequests(c.env, user.email, 60)) >= 5) {
    return c.json({ error: 'rate_limited' }, 429);
  }
  const id = await createRequest(c.env, user.email, purpose, perf, storage, os, c.env.AWS_REGION);
  await audit(c.env, user.email, 'request.create', `req:${id}`, `${perf}/${storage}/${os}`);
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
  try {
    await startInstance(c.env, ctx.vm.aws_instance_id);
    await updateVm(c.env, id, 'pending');
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
  const cols = ['id', 'user_email', 'preset', 'storage', 'os', 'region', 'status', 'created_at', 'decided_by', 'decided_at'];
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
    const perf = PERF[req.preset];
    const os = OS[req.os ?? ''];
    const storage = STORAGE[req.storage ?? ''];
    if (!perf || !os || !storage) throw new Error('invalid preset composition');

    const kp = await createKeyPair(c.env, id);
    const encKey = await encryptSecret(c.env.SESSION_SECRET, kp.privateKey);
    const { instanceId } = await launchInstance(c.env, {
      requestId: id,
      keyName: kp.keyName,
      instanceType: perf.instanceType,
      amiId: os.ami,
      sizeGb: storage.sizeGb,
    });
    await createVm(c.env, id, instanceId, kp.keyName, encKey, os.sshUser);
    await audit(c.env, admin.email, 'vm.launch', `req:${id}`, instanceId);
    c.executionCtx.waitUntil(notifyUserApproved(c.env, req.user_email, id));
    return c.json({ ok: true, status: 'provisioning' });
  } catch (e: any) {
    await setRequestStatus(c.env, id, 'failed', undefined, `provisioning: ${e.message}`);
    await audit(c.env, 'system', 'vm.launch.failed', `req:${id}`, e.message);
    return c.json({ error: e.message }, 500);
  }
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
          await notifyUserReady(env, row.user_email, row.id, s.publicIp, row.ssh_user ?? 'ubuntu');
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

// Stop all running portal VMs (off-hours cost guardrail). Users can restart them.
async function scheduledStop(env: Env): Promise<void> {
  if (env.SCHEDULED_STOP !== 'true') return;
  const rows = await listActiveVms(env);
  for (const row of rows) {
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

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 19 * * *') ctx.waitUntil(scheduledStop(env));
    else ctx.waitUntil(reconcile(env));
  },
} satisfies ExportedHandler<Env>;
