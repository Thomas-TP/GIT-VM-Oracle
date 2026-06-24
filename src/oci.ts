import type { Env } from './types';

// Minimal Oracle Cloud Infrastructure (OCI) client for the Worker.
// OCI uses the IETF HTTP Signatures scheme ("Signature version 1", RSA-SHA256) with
// an API signing key — there is no off-the-shelf lib in the Workers runtime, so we
// sign requests ourselves with Web Crypto. Responses are JSON (unlike EC2's XML).
//
// Exports mirror the old src/aws.ts surface so src/index.ts stays almost unchanged.
// Instance lifecycle states are mapped to the AWS-style vocabulary the reconciler
// already speaks ('running' | 'stopped' | 'stopping' | 'pending' | 'terminated' | …).

const enc = new TextEncoder();

// ---- base64 (standard, not url) ----------------------------------------
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function pemToDer(pem: string): Uint8Array {
  // Extract strictly the base64 between the BEGIN/END markers, then drop any
  // non-base64 char (newlines, and stray trailing labels like "OCI_API_KEY").
  const m = pem.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/);
  const b64 = (m ? m[1] : pem).replace(/[^A-Za-z0-9+/=]/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- API signing key (imported once, cached) ---------------------------
let signingKeyPem: string | undefined;
let signingKey: Promise<CryptoKey> | undefined;
function getSigningKey(env: Env): Promise<CryptoKey> {
  if (signingKey && signingKeyPem === env.OCI_PRIVATE_KEY) return signingKey;
  signingKeyPem = env.OCI_PRIVATE_KEY;
  signingKey = crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.OCI_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return signingKey;
}

async function sha256B64(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(body));
  return bytesToB64(new Uint8Array(digest));
}

// Signed OCI request. `host` is the service host; `path` includes the API version
// and any query string. Returns parsed JSON (or null) and throws on non-2xx.
async function ociFetch<T = any>(env: Env, method: string, host: string, path: string, body?: unknown): Promise<T> {
  const m = method.toUpperCase();
  const url = `https://${host}${path}`;
  // OCI accepts x-date in place of Date; we use it because `Date` is a forbidden
  // request header the runtime may strip (which would break the signature).
  const xdate = new Date().toUTCString();
  const keyId = `${env.OCI_TENANCY_OCID}/${env.OCI_USER_OCID}/${env.OCI_FINGERPRINT}`;

  const toSign: Record<string, string> = { '(request-target)': `${m.toLowerCase()} ${path}`, host, 'x-date': xdate };
  let order = ['(request-target)', 'host', 'x-date'];
  const headers: Record<string, string> = { 'x-date': xdate };

  let bodyStr: string | undefined;
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
    bodyStr = body == null ? '' : JSON.stringify(body);
    const sha = await sha256B64(bodyStr);
    const len = String(enc.encode(bodyStr).length);
    Object.assign(toSign, { 'x-content-sha256': sha, 'content-type': 'application/json', 'content-length': len });
    order = [...order, 'x-content-sha256', 'content-type', 'content-length'];
    // content-length / host are set by the runtime; we only add the signed headers it allows.
    Object.assign(headers, { 'x-content-sha256': sha, 'content-type': 'application/json' });
  }

  const signingString = order.map((h) => `${h}: ${toSign[h]}`).join('\n');
  const key = await getSigningKey(env);
  const sig = bytesToB64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingString))));
  headers.authorization = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="${order.join(' ')}",signature="${sig}"`;

  const res = await fetch(url, { method: m, headers, body: bodyStr });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = (json && (json.message || json.code)) || text.slice(0, 300) || String(res.status);
    throw new Error(`OCI ${m} ${path.split('?')[0]} failed: ${res.status} ${msg}`);
  }
  return json as T;
}

const iaasHost = (env: Env) => `iaas.${env.OCI_REGION}.oraclecloud.com`;
const iaas = <T = any>(env: Env, method: string, path: string, body?: unknown) => ociFetch<T>(env, method, iaasHost(env), path, body);
const telemetryHost = (env: Env) => `telemetry.${env.OCI_REGION}.oraclecloud.com`;

// OCI lifecycleState -> AWS-style state the reconciler understands.
function mapState(s: string | undefined): string {
  switch ((s ?? '').toUpperCase()) {
    case 'RUNNING': return 'running';
    case 'STOPPED': return 'stopped';
    case 'STOPPING': return 'stopping';
    case 'STARTING':
    case 'PROVISIONING':
    case 'CREATING_IMAGE': return 'pending';
    case 'TERMINATING': return 'shutting-down';
    case 'TERMINATED': return 'terminated';
    default: return (s ?? 'unknown').toLowerCase();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Equivalent x86 flexible shapes (same shapeConfig: OCPU + memoryInGBs), tried in order
// when a shape is out of host capacity. Mixes AMD (E5/E4/E3) and Intel (Standard3) so a
// launch can succeed even when one CPU family is saturated in the AD.
const X86_FLEX_FALLBACK = ['VM.Standard.E5.Flex', 'VM.Standard.E4.Flex', 'VM.Standard.E3.Flex', 'VM.Standard3.Flex'];
const isCapacityError = (m: string) => /capacity|out of host/i.test(m);

// ---- SSH keys ----------------------------------------------------------
// OCI has no managed key pairs: we generate the pair in-Worker, inject the public
// half into instance metadata (ssh_authorized_keys), and store the private half
// (PKCS#8 PEM — accepted by `ssh -i`) encrypted, exactly like before.
export interface KeyPair {
  keyName: string;
  privateKey: string; // PKCS#8 PEM
  publicKey: string; // OpenSSH "ssh-rsa AAAA… comment"
}

function sshString(bytes: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length, false);
  const out = new Uint8Array(4 + bytes.length);
  out.set(len, 0); out.set(bytes, 4);
  return out;
}
function mpint(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++; // strip leading zeros
  let v = bytes.slice(i);
  if (v.length && v[0] & 0x80) { const p = new Uint8Array(v.length + 1); p.set(v, 1); v = p; } // keep positive
  return sshString(v);
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export async function createKeyPair(env: Env, requestId: number, _keyType: 'ed25519' | 'rsa' = 'rsa'): Promise<KeyPair> {
  const keyName = `vm-portal-req-${requestId}`;
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  // Private key -> PKCS#8 PEM
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  const b64 = bytesToB64(pkcs8).replace(/(.{64})/g, '$1\n');
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${b64}${b64.endsWith('\n') ? '' : '\n'}-----END PRIVATE KEY-----\n`;
  // Public key -> OpenSSH ssh-rsa line (from JWK n/e)
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const e = b64urlToBytes(jwk.e!);
  const n = b64urlToBytes(jwk.n!);
  const wire = concat(sshString(enc.encode('ssh-rsa')), mpint(e), mpint(n));
  const publicKey = `ssh-rsa ${bytesToB64(wire)} ${keyName}`;
  return { keyName, privateKey, publicKey };
}

// OCI keeps no server-side key pair, so there is nothing to delete.
export async function deleteKeyPair(_env: Env, _keyName: string): Promise<void> {
  /* no-op */
}

// ---- Launch ------------------------------------------------------------
export interface LaunchResult { instanceId: string; }
export interface LaunchParams {
  requestId: number;
  shape: string; // e.g. VM.Standard.E4.Flex or VM.Standard.E2.1.Micro
  ocpus?: number; // Flex shapes only
  memoryGb?: number; // Flex shapes only
  imageId?: string; // boot from a platform image
  bootVolumeId?: string; // restore: boot from an existing volume (mutually exclusive with imageId)
  sizeGb: number; // boot volume size (GB)
  sshPublicKey?: string; // OpenSSH public key for metadata
  userData?: string; // cloud-init (Linux) / cloudbase-init (Windows) — base64-encoded here
  nameTag?: string | null;
}

export async function launchInstance(env: Env, p: LaunchParams): Promise<LaunchResult> {
  if (!env.OCI_SUBNET_ID || !env.OCI_AVAILABILITY_DOMAIN) {
    throw new Error('OCI network config missing (subnet / availability domain)');
  }
  const metadata: Record<string, string> = {};
  if (p.sshPublicKey) metadata.ssh_authorized_keys = p.sshPublicKey;
  if (p.userData) metadata.user_data = btoa(unescape(encodeURIComponent(p.userData)));

  const sourceDetails = p.bootVolumeId
    ? { sourceType: 'bootVolume', bootVolumeId: p.bootVolumeId }
    : { sourceType: 'image', imageId: p.imageId, bootVolumeSizeInGBs: p.sizeGb };

  const body: Record<string, unknown> = {
    compartmentId: env.OCI_COMPARTMENT_OCID,
    availabilityDomain: env.OCI_AVAILABILITY_DOMAIN,
    displayName: (p.nameTag && p.nameTag.trim()) ? p.nameTag.trim().slice(0, 255) : `vm-portal-req-${p.requestId}`,
    sourceDetails,
    createVnicDetails: { subnetId: env.OCI_SUBNET_ID, assignPublicIp: true },
    metadata,
    freeformTags: { 'managed-by': 'git-vm-oracle', 'request-id': String(p.requestId) },
  };
  // shapeConfig is only valid for flexible shapes (those advertising OCPU/memory).
  if (p.ocpus) body.shapeConfig = { ocpus: p.ocpus, memoryInGBs: p.memoryGb ?? p.ocpus * 8 };

  // "Out of host capacity" is common on trial accounts: for flexible x86 shapes, fall back
  // through equivalent shapes (same OCPU/memory) until one has capacity. Capacity rejections
  // create no instance (no cost); only the first successful launch is created.
  const shapes = p.ocpus ? [p.shape, ...X86_FLEX_FALLBACK.filter((s) => s !== p.shape)] : [p.shape];
  let lastErr: any;
  for (const shape of shapes) {
    try {
      const r = await iaas<{ id: string }>(env, 'POST', '/20160918/instances', { ...body, shape });
      if (!r?.id) throw new Error('LaunchInstance: no instance id in response');
      return { instanceId: r.id };
    } catch (e: any) {
      lastErr = e;
      if (!isCapacityError(e.message)) throw e; // not a capacity issue → fail fast
    }
  }
  throw lastErr ?? new Error('LaunchInstance: no shape with available capacity');
}

export interface InstanceStatus { state: string; publicIp?: string; launchTime?: string; }

// Primary VNIC public IP (two hops: attachments -> vnic).
async function primaryPublicIp(env: Env, instanceId: string): Promise<string | undefined> {
  const atts = await iaas<any[]>(env, 'GET', `/20160918/vnicAttachments?compartmentId=${encodeURIComponent(env.OCI_COMPARTMENT_OCID)}&instanceId=${encodeURIComponent(instanceId)}`);
  const att = (atts ?? []).find((a) => a.lifecycleState === 'ATTACHED' && a.vnicId) ?? (atts ?? [])[0];
  if (!att?.vnicId) return undefined;
  const vnic = await iaas<{ publicIp?: string }>(env, 'GET', `/20160918/vnics/${att.vnicId}`);
  return vnic?.publicIp ?? undefined;
}

export async function describeInstance(env: Env, instanceId: string): Promise<InstanceStatus> {
  const inst = await iaas<{ lifecycleState: string; timeCreated?: string }>(env, 'GET', `/20160918/instances/${instanceId}`);
  const state = mapState(inst?.lifecycleState);
  let publicIp: string | undefined;
  if (state === 'running') {
    try { publicIp = await primaryPublicIp(env, instanceId); } catch { /* IP not ready yet */ }
  }
  return { state, publicIp, launchTime: inst?.timeCreated };
}

async function instanceAction(env: Env, instanceId: string, action: string): Promise<void> {
  await iaas(env, 'POST', `/20160918/instances/${instanceId}?action=${action}`, '');
}
export const startInstance = (env: Env, id: string) => instanceAction(env, id, 'START');
export const stopInstance = (env: Env, id: string) => instanceAction(env, id, 'SOFTSTOP');
export const rebootInstance = (env: Env, id: string) => instanceAction(env, id, 'SOFTRESET');

export async function terminateInstance(env: Env, instanceId: string): Promise<void> {
  await iaas(env, 'DELETE', `/20160918/instances/${instanceId}?preserveBootVolume=false`);
}

// Managed instances -> { instanceId: state } (for reconciliation / drift detection).
export async function listManagedInstances(env: Env): Promise<Record<string, string>> {
  const list = await iaas<any[]>(env, 'GET', `/20160918/instances?compartmentId=${encodeURIComponent(env.OCI_COMPARTMENT_OCID)}&limit=1000`);
  const out: Record<string, string> = {};
  for (const i of list ?? []) {
    if (i?.freeformTags?.['managed-by'] === 'git-vm-oracle' && i.lifecycleState !== 'TERMINATED') {
      out[i.id] = mapState(i.lifecycleState);
    }
  }
  return out;
}

// ---- Boot volume backups (snapshots) -----------------------------------
export interface RootVolume { volumeId?: string; rootDevice?: string; architecture?: string; sizeGb?: number; }

// The instance's boot volume (OCI equivalent of the EBS root volume).
export async function describeRootVolume(env: Env, instanceId: string): Promise<RootVolume> {
  const atts = await iaas<any[]>(env, 'GET', `/20160918/bootVolumeAttachments?availabilityDomain=${encodeURIComponent(env.OCI_AVAILABILITY_DOMAIN)}&compartmentId=${encodeURIComponent(env.OCI_COMPARTMENT_OCID)}&instanceId=${encodeURIComponent(instanceId)}`);
  const att = (atts ?? [])[0];
  if (!att?.bootVolumeId) return {};
  let sizeGb: number | undefined;
  try {
    const bv = await iaas<{ sizeInGBs?: number }>(env, 'GET', `/20160918/bootVolumes/${att.bootVolumeId}`);
    sizeGb = bv?.sizeInGBs;
  } catch { /* size optional */ }
  return { volumeId: att.bootVolumeId, sizeGb };
}

export async function createSnapshot(env: Env, bootVolumeId: string, description: string): Promise<string> {
  const r = await iaas<{ id: string }>(env, 'POST', '/20160918/bootVolumeBackups', {
    bootVolumeId, displayName: description.slice(0, 255), type: 'FULL',
    freeformTags: { 'managed-by': 'git-vm-oracle' },
  });
  if (!r?.id) throw new Error('CreateBootVolumeBackup: no id');
  return r.id;
}

// state: pending | completed | error ; sizeGb when available.
export async function describeSnapshot(env: Env, backupId: string): Promise<{ state: string; sizeGb?: number }> {
  const b = await iaas<{ lifecycleState: string; sizeInGBs?: number }>(env, 'GET', `/20160918/bootVolumeBackups/${backupId}`);
  const ls = (b?.lifecycleState ?? '').toUpperCase();
  const state = ls === 'AVAILABLE' ? 'completed' : ls === 'FAULTY' ? 'error' : 'pending';
  return { state, sizeGb: b?.sizeInGBs };
}

export async function deleteSnapshot(env: Env, backupId: string): Promise<void> {
  await iaas(env, 'DELETE', `/20160918/bootVolumeBackups/${backupId}`).catch(() => {});
}

// Restore: create a boot volume from a backup and return its OCID (launch with it).
// Replaces AWS RegisterImage. Polls until the volume is AVAILABLE (bounded).
export async function registerImageFromSnapshot(
  env: Env, name: string, backupId: string, _rootDevice: string, _architecture: string
): Promise<string> {
  const created = await iaas<{ id: string }>(env, 'POST', '/20160918/bootVolumes', {
    compartmentId: env.OCI_COMPARTMENT_OCID,
    availabilityDomain: env.OCI_AVAILABILITY_DOMAIN,
    displayName: name.slice(0, 255),
    sourceDetails: { type: 'bootVolumeBackup', id: backupId },
  });
  if (!created?.id) throw new Error('CreateBootVolume(from backup): no id');
  for (let i = 0; i < 30; i++) {
    const bv = await iaas<{ lifecycleState: string }>(env, 'GET', `/20160918/bootVolumes/${created.id}`);
    if (bv?.lifecycleState === 'AVAILABLE') return created.id;
    if (bv?.lifecycleState === 'FAULTY') throw new Error('restore boot volume FAULTY');
    await sleep(3000);
  }
  throw new Error('restore boot volume not ready in time');
}

// ---- Monitoring (idle CPU) ---------------------------------------------
// Max CpuUtilization (%) over the last `minutes` from OCI Monitoring, plus the
// datapoint count. null = no data. Mirrors the old CloudWatch helper.
export async function maxCpuOverWindow(env: Env, instanceId: string, minutes: number): Promise<{ max: number; datapoints: number } | null> {
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60_000);
  const path = `/20180401/metrics/actions/summarizeMetricsData?compartmentId=${encodeURIComponent(env.OCI_COMPARTMENT_OCID)}`;
  const body = {
    namespace: 'oci_computeagent',
    query: `CpuUtilization[5m]{resourceId = "${instanceId}"}.max()`,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
  const res = await ociFetch<any[]>(env, 'POST', telemetryHost(env), path, body);
  const points = (res ?? []).flatMap((m) => m.aggregatedDatapoints ?? []).map((d: any) => Number(d.value)).filter((n: number) => !isNaN(n));
  if (!points.length) return null;
  return { max: Math.max(...points), datapoints: points.length };
}

// ---- Cost (real billed amount, OCI Usage/Cost API) ---------------------
export interface CostSummary {
  currency: string;
  total: number;
  byDay: { day: string; amount: number }[];
  byService: { service: string; amount: number }[];
}

// Real billed cost over [startISO, endISO) grouped by day & service (one signed call).
export async function getCostSummary(env: Env, startISO: string, endISO: string): Promise<CostSummary> {
  const body = {
    tenantId: env.OCI_TENANCY_OCID,
    timeUsageStarted: startISO,
    timeUsageEnded: endISO,
    granularity: 'DAILY',
    queryType: 'COST',
    groupBy: ['service'],
  };
  const res = await ociFetch<{ items?: any[] }>(env, 'POST', `usageapi.${env.OCI_REGION}.oci.oraclecloud.com`, '/20200107/usage', body);
  const items = res?.items ?? [];
  let currency = 'USD';
  let total = 0;
  const days = new Map<string, number>();
  const svcs = new Map<string, number>();
  for (const it of items) {
    const amt = Number(it.computedAmount ?? 0) || 0;
    if (it.currency) currency = it.currency;
    total += amt;
    const day = String(it.timeUsageStarted ?? '').slice(0, 10);
    if (day) days.set(day, (days.get(day) ?? 0) + amt);
    const svc = it.service || 'Autre';
    svcs.set(svc, (svcs.get(svc) ?? 0) + amt);
  }
  return {
    currency,
    total,
    byDay: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, amount]) => ({ day, amount })),
    byService: [...svcs.entries()].filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]).map(([service, amount]) => ({ service, amount })),
  };
}
