// Discover OCI platform image OCIDs (per OS family, latest version, x86_64) for presets.ts.
// Region-specific — re-run when images age out (the OCID changes with each new build).
// Usage (PowerShell):
//   $env:OCI_TENANCY=...; $env:OCI_USER=...; $env:OCI_FINGERPRINT=...;
//   $env:OCI_REGION="eu-zurich-1"; $env:OCI_PRIVATE_KEY_FILE="...key.pem"; node scripts/oci-images.mjs
import { iaas, TENANCY, REGION } from './_oci.mjs';

const cid = process.env.OCI_COMPARTMENT || TENANCY; // platform images live in the root/tenancy compartment

// Families we want in the catalog (one entry each). The launch shape is x86 (E-Flex),
// so we skip aarch64 (ARM) image builds.
const FAMILIES = [
  { key: 'ubuntu2404', os: 'Canonical Ubuntu', version: '24.04', label: 'Ubuntu 24.04 LTS', sshUser: 'ubuntu', connect: 'ssh' },
  { key: 'oracle9', os: 'Oracle Linux', version: '9', label: 'Oracle Linux 9', sshUser: 'opc', connect: 'ssh' },
  { key: 'oracle8', os: 'Oracle Linux', version: '8', label: 'Oracle Linux 8', sshUser: 'opc', connect: 'ssh' },
  { key: 'windows2022', os: 'Windows', version: 'Server 2022 Standard', label: 'Windows Server 2022', sshUser: 'opc', connect: 'rdp' },
];

const isX86 = (img) => !/aarch64|\barm\b/i.test(img.displayName || '');

async function latest(os, version) {
  const q = new URLSearchParams({
    compartmentId: cid, operatingSystem: os, sortBy: 'TIMECREATED', sortOrder: 'DESC', limit: '50',
  });
  if (version) q.set('operatingSystemVersion', version);
  const r = await iaas('GET', `/20160918/images?${q.toString()}`);
  const imgs = (r.json ?? []).filter(isX86);
  return imgs[0]; // newest first (TIMECREATED DESC)
}

console.log(`Region ${REGION} — platform images (x86_64, latest per family):\n`);
for (const f of FAMILIES) {
  try {
    const img = await latest(f.os, f.version);
    if (!img) { console.log(`  [${f.key}] ${f.label}: (none found for ${f.os} ${f.version})`); continue; }
    console.log(`  [${f.key}] ${f.label}`);
    console.log(`     image:   ${img.id}`);
    console.log(`     display: ${img.displayName}`);
    console.log(`     sshUser=${f.sshUser} connect=${f.connect}\n`);
  } catch (e) {
    console.log(`  [${f.key}] ${f.label}: ERR ${e.message}\n`);
  }
}
