import { AwsClient } from 'aws4fetch';

const region = process.env.AWS_REGION || 'eu-central-2';
const ec2c = new AwsClient({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region,
  service: 'ec2',
});
const AMI = process.env.AWS_AMI_ID;
const SUBNET = process.env.AWS_SUBNET_ID;
const SG = process.env.AWS_SECURITY_GROUP_ID;

async function ec2(params) {
  const body = new URLSearchParams({ Version: '2016-11-15', ...params }).toString();
  const r = await ec2c.fetch(`https://ec2.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return { ok: r.ok, text: await r.text() };
}
const ex = (t, tag) => t.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1];
const msg = (t) => t.match(/<Message>([^<]+)<\/Message>/)?.[1] || t.slice(0, 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEY = 'vm-portal-e2e';
let instanceId;
try {
  // resolve root device name (mirrors aws.ts)
  const img = await ec2({ Action: 'DescribeImages', 'ImageId.1': AMI });
  const rootDev = ex(img.text, 'rootDeviceName') ?? '/dev/sda1';
  console.log('AMI', AMI, 'rootDevice', rootDev);

  await ec2({ Action: 'DeleteKeyPair', KeyName: KEY });
  const kp = await ec2({ Action: 'CreateKeyPair', KeyName: KEY, KeyType: 'ed25519' });
  console.log('keypair:', kp.ok ? 'ok' : 'ERR ' + msg(kp.text));

  const run = await ec2({
    Action: 'RunInstances',
    ImageId: AMI,
    InstanceType: 't3.micro',
    MinCount: '1',
    MaxCount: '1',
    KeyName: KEY,
    'NetworkInterface.1.DeviceIndex': '0',
    'NetworkInterface.1.SubnetId': SUBNET,
    'NetworkInterface.1.AssociatePublicIpAddress': 'true',
    'NetworkInterface.1.SecurityGroupId.1': SG,
    'BlockDeviceMapping.1.DeviceName': rootDev,
    'BlockDeviceMapping.1.Ebs.VolumeSize': '20',
    'BlockDeviceMapping.1.Ebs.VolumeType': 'gp3',
    'BlockDeviceMapping.1.Ebs.DeleteOnTermination': 'true',
    'TagSpecification.1.ResourceType': 'instance',
    'TagSpecification.1.Tag.1.Key': 'managed-by',
    'TagSpecification.1.Tag.1.Value': 'git-vm-portal',
  });
  instanceId = ex(run.text, 'instanceId');
  console.log('launch:', instanceId ? instanceId : 'ERR ' + msg(run.text));
  if (!instanceId) process.exit(1);

  for (let i = 0; i < 18; i++) {
    await sleep(5000);
    const d = await ec2({ Action: 'DescribeInstances', 'InstanceId.1': instanceId });
    const state = d.text.match(/<instanceState>[\s\S]*?<name>([^<]+)<\/name>/)?.[1];
    const ip = ex(d.text, 'ipAddress');
    console.log(`  t+${(i + 1) * 5}s state=${state} ip=${ip ?? '-'}`);
    if (state === 'running' && ip) {
      console.log('RESULT: running with public IP', ip);
      break;
    }
  }
} finally {
  if (instanceId) {
    const term = await ec2({ Action: 'TerminateInstances', 'InstanceId.1': instanceId });
    console.log('terminate:', term.ok ? 'OK' : 'ERR ' + msg(term.text));
  }
  await ec2({ Action: 'DeleteKeyPair', KeyName: KEY });
  console.log('cleanup done');
}
