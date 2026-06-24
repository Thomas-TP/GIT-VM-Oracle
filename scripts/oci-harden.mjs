// Lock down the subnet's default security list EGRESS to an allowlist (the real,
// un-bypassable network barrier — a sudo/admin user inside the VM can undo in-VM
// rules but not this). Blocks torrents/P2P and arbitrary outbound; forces filtered
// DNS (Cloudflare for Families). Ingress (SSH 22 / RDP 3389) is left intact.
//
// Re-run is idempotent (it sets the rules to a known-good state).
// Needs OCI_SECURITY_LIST_ID (printed by oci-setup.mjs) in the env, plus OCI_* creds.
import { iaas } from './_oci.mjs';

const SL = process.env.OCI_SECURITY_LIST_ID;
if (!SL) { console.error('Set OCI_SECURITY_LIST_ID (see oci-setup.mjs output).'); process.exit(1); }

const tcp = (min, max, dst = '0.0.0.0/0', description = '') => ({
  protocol: '6', destination: dst, destinationType: 'CIDR_BLOCK', isStateless: false,
  tcpOptions: { destinationPortRange: { min, max } }, description,
});
const udp = (min, max, dst = '0.0.0.0/0', description = '') => ({
  protocol: '17', destination: dst, destinationType: 'CIDR_BLOCK', isStateless: false,
  udpOptions: { destinationPortRange: { min, max } }, description,
});

const egress = [
  // OCI infrastructure (metadata 169.254.169.254, iSCSI boot volume, internal NTP).
  // CRITICAL — removing this can break the instance. Link-local only, not the internet.
  { protocol: 'all', destination: '169.254.0.0/16', destinationType: 'CIDR_BLOCK', isStateless: false, description: 'OCI link-local (metadata/iSCSI/NTP) — required' },
  tcp(80, 80, '0.0.0.0/0', 'HTTP'),
  tcp(443, 443, '0.0.0.0/0', 'HTTPS'),
  tcp(22, 22, '0.0.0.0/0', 'SSH/git out'),
  // Filtered DNS — Cloudflare for Families only (blocks adult + malware).
  tcp(53, 53, '1.1.1.3/32', 'DNS Cloudflare for Families'),
  tcp(53, 53, '1.0.0.3/32', 'DNS Cloudflare for Families'),
  udp(53, 53, '1.1.1.3/32', 'DNS Cloudflare for Families'),
  udp(53, 53, '1.0.0.3/32', 'DNS Cloudflare for Families'),
  udp(123, 123, '0.0.0.0/0', 'NTP'),
];

const ingress = [
  { protocol: '6', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK', isStateless: false, tcpOptions: { destinationPortRange: { min: 22, max: 22 } }, description: 'SSH' },
  { protocol: '6', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK', isStateless: false, tcpOptions: { destinationPortRange: { min: 3389, max: 3389 } }, description: 'RDP' },
  { protocol: '1', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK', isStateless: false, icmpOptions: { type: 3, code: 4 }, description: 'Path MTU' },
];

await iaas('PUT', `/20160918/securityLists/${SL}`, { egressSecurityRules: egress, ingressSecurityRules: ingress });
console.log('Hardened security list', SL);
console.log('  egress: 169.254/16(all), 80, 443, 22, DNS->Cloudflare(1.1.1.3/1.0.0.3), NTP 123 — default-deny otherwise');
console.log('  ingress: 22 (SSH), 3389 (RDP), ICMP PMTU');
