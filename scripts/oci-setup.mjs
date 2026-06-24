// One-off: create the OCI network the portal launches VMs into, in the root (tenancy)
// compartment. Idempotent — re-running reuses resources found by display name.
// Creates: VCN + Internet Gateway + default route (0.0.0.0/0 -> IG) + default security
// list (ingress SSH 22 + RDP 3389, egress all) + a regional PUBLIC subnet.
// Prints the OCIDs to paste into wrangler.jsonc (OCI_SUBNET_ID, OCI_AVAILABILITY_DOMAIN, ...).
//
// Usage (PowerShell): set OCI_* env (see _oci.mjs) then `node scripts/oci-setup.mjs`.
import { iaas, COMPARTMENT, REGION, discoverAvailabilityDomain } from './_oci.mjs';

const NAME = 'git-vm-oracle';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findByName(kind, extraQs = '') {
  const r = await iaas('GET', `/20160918/${kind}?compartmentId=${encodeURIComponent(COMPARTMENT)}${extraQs}`);
  return (r.json ?? []).find((x) => x.displayName === `${NAME}-${kind.replace(/s$/, '')}` && x.lifecycleState !== 'TERMINATED');
}
async function waitAvailable(kind, id) {
  for (let i = 0; i < 30; i++) {
    const r = await iaas('GET', `/20160918/${kind}/${id}`);
    if (r.json?.lifecycleState === 'AVAILABLE') return r.json;
    await sleep(2000);
  }
  throw new Error(`${kind}/${id} not AVAILABLE in time`);
}

// 1. VCN
let vcn = await findByName('vcns');
if (!vcn) {
  const r = await iaas('POST', '/20160918/vcns', {
    compartmentId: COMPARTMENT, cidrBlocks: ['10.0.0.0/16'], displayName: `${NAME}-vcn`, dnsLabel: 'gitvmoracle',
  });
  vcn = r.json;
  console.log('VCN created', vcn.id);
} else {
  console.log('VCN exists ', vcn.id);
}
vcn = await waitAvailable('vcns', vcn.id);
const routeTableId = vcn.defaultRouteTableId;
const securityListId = vcn.defaultSecurityListId;

// 2. Internet Gateway
let ig = await findByName('internetGateways', `&vcnId=${encodeURIComponent(vcn.id)}`);
if (!ig) {
  const r = await iaas('POST', '/20160918/internetGateways', {
    compartmentId: COMPARTMENT, vcnId: vcn.id, isEnabled: true, displayName: `${NAME}-internetGateway`,
  });
  ig = r.json;
  console.log('IG created ', ig.id);
} else {
  console.log('IG exists  ', ig.id);
}
await waitAvailable('internetGateways', ig.id);

// 3. Default route table -> 0.0.0.0/0 via IG
await iaas('PUT', `/20160918/routeTables/${routeTableId}`, {
  routeRules: [{ destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK', networkEntityId: ig.id }],
});
console.log('Route set  0.0.0.0/0 -> IG');

// 4. Default security list: ingress SSH + RDP + ICMP PMTU; egress all (hardened later)
await iaas('PUT', `/20160918/securityLists/${securityListId}`, {
  ingressSecurityRules: [
    { protocol: '6', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK', tcpOptions: { destinationPortRange: { min: 22, max: 22 } }, description: 'SSH' },
    { protocol: '6', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK', tcpOptions: { destinationPortRange: { min: 3389, max: 3389 } }, description: 'RDP' },
    { protocol: '1', source: '0.0.0.0/0', sourceType: 'CIDR_BLOCK', icmpOptions: { type: 3, code: 4 }, description: 'Path MTU' },
  ],
  egressSecurityRules: [
    { destination: '0.0.0.0/0', destinationType: 'CIDR_BLOCK', protocol: 'all', description: 'all (default; run oci-harden to lock down)' },
  ],
});
console.log('SecList set ingress 22/3389, egress all');

// 5. Regional PUBLIC subnet (no availabilityDomain = regional)
let subnet = await findByName('subnets', `&vcnId=${encodeURIComponent(vcn.id)}`);
if (!subnet) {
  const r = await iaas('POST', '/20160918/subnets', {
    compartmentId: COMPARTMENT, vcnId: vcn.id, cidrBlock: '10.0.1.0/24', displayName: `${NAME}-subnet`,
    dnsLabel: 'public', routeTableId, securityListIds: [securityListId], prohibitPublicIpOnVnic: false,
  });
  subnet = r.json;
  console.log('Subnet created', subnet.id);
} else {
  console.log('Subnet exists ', subnet.id);
}
subnet = await waitAvailable('subnets', subnet.id);

// 6. Availability domain (for the launch var)
let ad = '(set OCI_AVAILABILITY_DOMAIN manually)';
try { ad = await discoverAvailabilityDomain(); } catch (e) { console.log('AD discovery:', e.message); }

console.log('\n=== Paste into wrangler.jsonc vars ===');
console.log(JSON.stringify({
  OCI_REGION: REGION,
  OCI_COMPARTMENT_OCID: COMPARTMENT,
  OCI_SUBNET_ID: subnet.id,
  OCI_AVAILABILITY_DOMAIN: ad,
  OCI_VCN_ID: vcn.id,
  OCI_SECURITY_LIST_ID: securityListId,
}, null, 2));
