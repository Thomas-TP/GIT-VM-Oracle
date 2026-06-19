import { AwsClient } from 'aws4fetch';

const region = process.env.AWS_REGION || 'eu-central-2';
const ec2c = new AwsClient({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region,
  service: 'ec2',
});
async function ec2(params) {
  const body = new URLSearchParams({ Version: '2016-11-15', ...params }).toString();
  const r = await ec2c.fetch(`https://ec2.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { ok: r.ok, text: await r.text() };
}
const all = (t, tag) => [...t.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))].map((m) => m[1]);

async function latest(owner, namePattern) {
  const r = await ec2({
    Action: 'DescribeImages',
    'Owner.1': owner,
    'Filter.1.Name': 'name',
    'Filter.1.Value.1': namePattern,
    'Filter.2.Name': 'state',
    'Filter.2.Value.1': 'available',
    'Filter.3.Name': 'architecture',
    'Filter.3.Value.1': 'x86_64',
  });
  if (!r.ok) return 'ERR ' + (r.text.match(/<Message>([^<]+)/)?.[1] ?? '');
  const ids = all(r.text, 'imageId');
  const dates = all(r.text, 'creationDate');
  const z = ids.map((id, i) => ({ id, date: dates[i] })).sort((a, b) => (a.date < b.date ? 1 : -1));
  return `${z[0]?.id}  (${z[0]?.date})`;
}

console.log('ubuntu-24.04 ', await latest('099720109477', 'ubuntu/images/hvm-ssd*/ubuntu-noble-24.04-amd64-server-*'));
console.log('ubuntu-22.04 ', await latest('099720109477', 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*'));
console.log('debian-12    ', await latest('136693071363', 'debian-12-amd64-*'));
console.log('al2023       ', await latest('137112412989', 'al2023-ami-2023.*-kernel-6.1-x86_64'));
