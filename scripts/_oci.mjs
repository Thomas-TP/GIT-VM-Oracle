// Shared OCI REST helper for the one-off Node scripts (setup, images, harden, budget, e2e).
// Implements OCI request signing (HTTP Signature draft-cavage, RSA-SHA256) with node:crypto.
// Credentials come from the environment — never hard-coded, never committed:
//   OCI_TENANCY, OCI_USER, OCI_FINGERPRINT, OCI_REGION,
//   OCI_PRIVATE_KEY (PEM string)  OR  OCI_PRIVATE_KEY_FILE (path to the PEM),
//   OCI_COMPARTMENT (optional; defaults to the tenancy = root compartment).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TENANCY = req('OCI_TENANCY');
export const USER = req('OCI_USER');
export const FINGERPRINT = req('OCI_FINGERPRINT');
export const REGION = process.env.OCI_REGION || 'eu-zurich-1';
export const COMPARTMENT = process.env.OCI_COMPARTMENT || TENANCY;

const KEY_ID = `${TENANCY}/${USER}/${FINGERPRINT}`;
const PEM = process.env.OCI_PRIVATE_KEY || fs.readFileSync(require_(process.env.OCI_PRIVATE_KEY_FILE, 'OCI_PRIVATE_KEY_FILE'), 'utf8');
const PRIVATE_KEY = crypto.createPrivateKey({ key: PEM, format: 'pem' });

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
function require_(v, name) {
  if (!v) throw new Error(`Missing env OCI_PRIVATE_KEY or ${name}`);
  return v;
}

// Service hosts (region-scoped).
export const HOSTS = {
  iaas: `iaas.${REGION}.oraclecloud.com`, // Compute + Networking + Block Volume (Core Services)
  identity: `identity.${REGION}.oraclecloud.com`, // IAM (availability domains, compartments)
  telemetry: `telemetry.${REGION}.oraclecloud.com`, // Monitoring (metrics)
  budgets: `budgets.${REGION}.oci.oraclecloud.com`, // Cost Management (budgets + alert rules)
};

// Signed request. `urlString` must be absolute. Returns { ok, status, json, text }.
export async function ociFetch(method, urlString, body) {
  const url = new URL(urlString);
  const m = method.toUpperCase();
  const target = `${m.toLowerCase()} ${url.pathname}${url.search}`;
  const date = new Date().toUTCString();

  const toSign = { '(request-target)': target, host: url.host, date };
  let order = ['(request-target)', 'host', 'date'];
  const headers = { Date: date };

  let bodyStr;
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
    bodyStr = body == null ? '' : JSON.stringify(body);
    const sha = crypto.createHash('sha256').update(bodyStr, 'utf8').digest('base64');
    const len = String(Buffer.byteLength(bodyStr, 'utf8'));
    Object.assign(toSign, { 'x-content-sha256': sha, 'content-type': 'application/json', 'content-length': len });
    order = [...order, 'x-content-sha256', 'content-type', 'content-length'];
    Object.assign(headers, { 'x-content-sha256': sha, 'content-type': 'application/json', 'content-length': len });
  }

  const signingString = order.map((h) => `${h}: ${toSign[h]}`).join('\n');
  const signature = crypto.sign('sha256', Buffer.from(signingString, 'utf8'), PRIVATE_KEY).toString('base64');
  headers.Authorization = `Signature version="1",keyId="${KEY_ID}",algorithm="rsa-sha256",headers="${order.join(' ')}",signature="${signature}"`;

  const res = await fetch(urlString, { method: m, headers, body: bodyStr });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = (json && (json.message || json.code)) || text.slice(0, 300);
    throw new Error(`OCI ${m} ${url.pathname} -> ${res.status}: ${msg}`);
  }
  return { ok: res.ok, status: res.status, json, text };
}

// Convenience wrappers per service. `path` includes the API version (e.g. /20160918/instances).
export const iaas = (method, path, body) => ociFetch(method, `https://${HOSTS.iaas}${path}`, body);
export const identity = (method, path, body) => ociFetch(method, `https://${HOSTS.identity}${path}`, body);
export const telemetry = (method, path, body) => ociFetch(method, `https://${HOSTS.telemetry}${path}`, body);
export const budgets = (method, path, body) => ociFetch(method, `https://${HOSTS.budgets}${path}`, body);

// List availability domains (Identity API). May be blocked if the API user lacks
// `inspect availability-domains`.
export async function listAvailabilityDomains() {
  const r = await identity('GET', `/20160101/availabilityDomains?compartmentId=${encodeURIComponent(COMPARTMENT)}`);
  return r.json ?? [];
}

// Discover the AD name without Identity: the Limits service exposes AD-scoped
// compute limit values which carry the availabilityDomain. Robust fallback when
// the API user only has compute/network/limits (not identity) permissions.
export async function discoverAvailabilityDomain() {
  try {
    const ads = await listAvailabilityDomains();
    if (ads.length) return ads[0].name;
  } catch { /* identity blocked — fall back to limits */ }
  const r = await ociFetch(
    'GET',
    `https://limits.${REGION}.oci.oraclecloud.com/20190729/limitValues?compartmentId=${encodeURIComponent(TENANCY)}&serviceName=compute&limit=200`
  );
  const name = (r.json ?? []).map((v) => v.availabilityDomain).find(Boolean);
  if (!name) throw new Error('Could not discover an availability domain (grant inspect availability-domains, or set OCI_AVAILABILITY_DOMAIN).');
  return name;
}

// Run directly (`node scripts/_oci.mjs`) to validate signing + report which services
// the API user is authorized for. Prints each status; never throws.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cid = encodeURIComponent(COMPARTMENT);
  const probes = [
    ['iaas    vcns                 ', () => iaas('GET', `/20160918/vcns?compartmentId=${cid}`)],
    ['iaas    instances           ', () => iaas('GET', `/20160918/instances?compartmentId=${cid}`)],
    ['iaas    images (Ubuntu)      ', () => iaas('GET', `/20160918/images?compartmentId=${cid}&operatingSystem=${encodeURIComponent('Canonical Ubuntu')}&limit=1`)],
    ['identity availabilityDomains ', () => identity('GET', `/20160101/availabilityDomains?compartmentId=${cid}`)],
    ['monitoring summarizeMetrics  ', () => telemetry('POST', `/20180401/metrics/actions/summarizeMetricsData?compartmentId=${cid}`, { namespace: 'oci_computeagent', query: 'CpuUtilization[1m].max()' })],
    ['budgets  list                ', () => budgets('GET', `/20190111/budgets?compartmentId=${encodeURIComponent(TENANCY)}`)],
  ];
  (async () => {
    console.log(`Region=${REGION}  Compartment=${COMPARTMENT.slice(0, 28)}…`);
    for (const [name, fn] of probes) {
      try {
        const r = await fn();
        const n = Array.isArray(r.json) ? `(${r.json.length} items)` : Array.isArray(r.json?.items) ? `(${r.json.items.length} items)` : 'ok';
        console.log(`  OK  ${r.status}  ${name} ${n}`);
      } catch (e) {
        console.log(`  -   ${name} ${e.message.split('->').slice(-1)[0].trim()}`);
      }
    }
  })();
}
