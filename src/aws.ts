import { AwsClient } from 'aws4fetch';
import type { Env } from './types';

// Minimal EC2 client. EC2 uses the AWS "query" protocol (form-encoded params,
// XML responses). We extract only the few fields we need with regex — the
// response shapes for these actions are stable and simple.

function client(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: 'ec2',
  });
}

async function ec2(env: Env, params: Record<string, string>): Promise<string> {
  const body = new URLSearchParams({ Version: '2016-11-15', ...params }).toString();
  const res = await client(env).fetch(`https://ec2.${env.AWS_REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    const msg = text.match(/<Message>([^<]+)<\/Message>/)?.[1] ?? `${res.status}`;
    throw new Error(`EC2 ${params.Action} failed: ${msg}`);
  }
  return text;
}

function extract(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1];
}

export interface KeyPair {
  keyName: string;
  privateKey: string; // PEM / OpenSSH private key material
}

// Generate a fresh SSH key pair for one VM. AWS keeps the public half and
// returns the private key once — we store it (encrypted) and hand it to the user.
// Windows AMIs reject ed25519 key pairs (RunInstances fails) — they require RSA.
// Linux keeps ed25519 (smaller, modern). The caller picks based on the OS.
export async function createKeyPair(
  env: Env,
  requestId: number,
  keyType: 'ed25519' | 'rsa' = 'ed25519'
): Promise<KeyPair> {
  const keyName = `vm-portal-req-${requestId}`;
  // Delete any leftover with the same name (idempotent re-provision).
  await ec2(env, { Action: 'DeleteKeyPair', KeyName: keyName }).catch(() => {});
  const xml = await ec2(env, { Action: 'CreateKeyPair', KeyName: keyName, KeyType: keyType });
  const privateKey = extract(xml, 'keyMaterial');
  if (!privateKey) throw new Error('CreateKeyPair: no keyMaterial in response');
  return { keyName, privateKey };
}

export async function deleteKeyPair(env: Env, keyName: string): Promise<void> {
  await ec2(env, { Action: 'DeleteKeyPair', KeyName: keyName }).catch(() => {});
}

export interface LaunchResult {
  instanceId: string;
}

export interface LaunchParams {
  requestId: number;
  keyName: string;
  instanceType: string;
  amiId: string;
  sizeGb: number;
  /** Cloud-init / EC2Launch bootstrap script (raw text, base64-encoded here). */
  userData?: string;
  /** User-chosen VM name -> EC2 Name tag (falls back to vm-portal-req-<id>). */
  nameTag?: string | null;
}

// The root volume device name depends on the AMI (Ubuntu /dev/sda1, Debian /dev/xvda…).
async function rootDeviceName(env: Env, amiId: string): Promise<string> {
  const xml = await ec2(env, { Action: 'DescribeImages', 'ImageId.1': amiId });
  return extract(xml, 'rootDeviceName') ?? '/dev/sda1';
}

export async function launchInstance(env: Env, p: LaunchParams): Promise<LaunchResult> {
  if (!env.AWS_SUBNET_ID || !env.AWS_SECURITY_GROUP_ID) {
    throw new Error('AWS network config missing (subnet / security group)');
  }
  const rootDev = await rootDeviceName(env, p.amiId);

  const params: Record<string, string> = {
    Action: 'RunInstances',
    ImageId: p.amiId,
    InstanceType: p.instanceType,
    MinCount: '1',
    MaxCount: '1',
    KeyName: p.keyName,
    'NetworkInterface.1.DeviceIndex': '0',
    'NetworkInterface.1.SubnetId': env.AWS_SUBNET_ID,
    'NetworkInterface.1.AssociatePublicIpAddress': 'true',
    'NetworkInterface.1.SecurityGroupId.1': env.AWS_SECURITY_GROUP_ID,
    'BlockDeviceMapping.1.DeviceName': rootDev,
    'BlockDeviceMapping.1.Ebs.VolumeSize': String(p.sizeGb),
    'BlockDeviceMapping.1.Ebs.VolumeType': 'gp3',
    'BlockDeviceMapping.1.Ebs.DeleteOnTermination': 'true',
    'TagSpecification.1.ResourceType': 'instance',
    'TagSpecification.1.Tag.1.Key': 'Name',
    'TagSpecification.1.Tag.1.Value': (p.nameTag && p.nameTag.trim()) ? p.nameTag.trim().slice(0, 255) : `vm-portal-req-${p.requestId}`,
    'TagSpecification.1.Tag.2.Key': 'managed-by',
    'TagSpecification.1.Tag.2.Value': 'git-vm-portal',
    'TagSpecification.1.Tag.3.Key': 'request-id',
    'TagSpecification.1.Tag.3.Value': String(p.requestId),
  };

  // UserData must be base64-encoded. Used for Windows to set the admin password.
  if (p.userData) {
    params.UserData = btoa(unescape(encodeURIComponent(p.userData)));
  }

  const xml = await ec2(env, params);
  const instanceId = extract(xml, 'instanceId');
  if (!instanceId) throw new Error('RunInstances: no instanceId in response');
  return { instanceId };
}

export interface InstanceStatus {
  state: string;
  publicIp?: string;
  launchTime?: string;
}

export async function describeInstance(env: Env, instanceId: string): Promise<InstanceStatus> {
  const xml = await ec2(env, { Action: 'DescribeInstances', 'InstanceId.1': instanceId });
  const state = xml.match(/<instanceState>[\s\S]*?<name>([^<]+)<\/name>/)?.[1] ?? 'unknown';
  const publicIp = extract(xml, 'ipAddress');
  const launchTime = extract(xml, 'launchTime');
  return { state, publicIp, launchTime };
}

export async function terminateInstance(env: Env, instanceId: string): Promise<void> {
  await ec2(env, { Action: 'TerminateInstances', 'InstanceId.1': instanceId });
}

export async function startInstance(env: Env, instanceId: string): Promise<void> {
  await ec2(env, { Action: 'StartInstances', 'InstanceId.1': instanceId });
}

export async function stopInstance(env: Env, instanceId: string): Promise<void> {
  await ec2(env, { Action: 'StopInstances', 'InstanceId.1': instanceId });
}

export async function rebootInstance(env: Env, instanceId: string): Promise<void> {
  await ec2(env, { Action: 'RebootInstances', 'InstanceId.1': instanceId });
}

// ---- Snapshots (EBS) ----------------------------------------------------
export interface RootVolume {
  volumeId?: string;
  rootDevice?: string;
  architecture?: string;
  sizeGb?: number;
}
// Root EBS volume of an instance + its device name / architecture (for snapshot + restore).
export async function describeRootVolume(env: Env, instanceId: string): Promise<RootVolume> {
  const xml = await ec2(env, { Action: 'DescribeInstances', 'InstanceId.1': instanceId });
  const rootDevice = extract(xml, 'rootDeviceName');
  const architecture = extract(xml, 'architecture');
  let volumeId: string | undefined;
  const re = /<deviceName>([^<]+)<\/deviceName>[\s\S]*?<volumeId>([^<]+)<\/volumeId>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] === rootDevice) { volumeId = m[2]; break; }
    if (!volumeId) volumeId = m[2];
  }
  return { volumeId, rootDevice, architecture };
}

export async function createSnapshot(env: Env, volumeId: string, description: string): Promise<string> {
  const xml = await ec2(env, {
    Action: 'CreateSnapshot',
    VolumeId: volumeId,
    Description: description.slice(0, 255),
    'TagSpecification.1.ResourceType': 'snapshot',
    'TagSpecification.1.Tag.1.Key': 'managed-by',
    'TagSpecification.1.Tag.1.Value': 'git-vm-portal',
  });
  const id = extract(xml, 'snapshotId');
  if (!id) throw new Error('CreateSnapshot: no snapshotId');
  return id;
}

// state: pending | completed | error ; plus volumeSize when available.
export async function describeSnapshot(env: Env, snapshotId: string): Promise<{ state: string; sizeGb?: number }> {
  const xml = await ec2(env, { Action: 'DescribeSnapshots', 'SnapshotId.1': snapshotId });
  const state = extract(xml, 'status') ?? 'pending';
  const sz = extract(xml, 'volumeSize');
  return { state, sizeGb: sz ? Number(sz) : undefined };
}

export async function deleteSnapshot(env: Env, snapshotId: string): Promise<void> {
  await ec2(env, { Action: 'DeleteSnapshot', SnapshotId: snapshotId }).catch(() => {});
}

// Register an AMI from a snapshot so a new VM can be launched from it (restore).
export async function registerImageFromSnapshot(
  env: Env,
  name: string,
  snapshotId: string,
  rootDevice: string,
  architecture: string
): Promise<string> {
  const xml = await ec2(env, {
    Action: 'RegisterImage',
    Name: name.slice(0, 127),
    Architecture: architecture || 'x86_64',
    RootDeviceName: rootDevice || '/dev/sda1',
    VirtualizationType: 'hvm',
    EnaSupport: 'true',
    'BlockDeviceMapping.1.DeviceName': rootDevice || '/dev/sda1',
    'BlockDeviceMapping.1.Ebs.SnapshotId': snapshotId,
    'BlockDeviceMapping.1.Ebs.DeleteOnTermination': 'true',
    'BlockDeviceMapping.1.Ebs.VolumeType': 'gp3',
  });
  const id = extract(xml, 'imageId');
  if (!id) throw new Error('RegisterImage: no imageId');
  return id;
}

// ---- snapshot → local-disk export (ephemeral helper instance) ----

function s3(env: Env): AwsClient {
  return new AwsClient({ accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, region: env.AWS_REGION, service: 's3' });
}
const s3Url = (env: Env, bucket: string, key: string) =>
  `https://${bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

// True once the helper has uploaded the converted disk.
export async function s3ObjectExists(env: Env, bucket: string, key: string): Promise<boolean> {
  const res = await s3(env).fetch(s3Url(env, bucket, key), { method: 'HEAD' });
  return res.ok;
}

// Presigned GET URL so the user can download the disk without AWS credentials.
export async function s3PresignGet(env: Env, bucket: string, key: string, expiresSec = 604800): Promise<string> {
  const signed = await s3(env).sign(`${s3Url(env, bucket, key)}?X-Amz-Expires=${expiresSec}`, { method: 'GET', aws: { signQuery: true } });
  return signed.url;
}

// Latest Amazon Linux 2023 AMI (the helper runtime: has aws-cli + qemu-img in repos).
export async function latestAmazonLinux2023Ami(env: Env): Promise<string> {
  const xml = await ec2(env, {
    Action: 'DescribeImages',
    'Owner.1': 'amazon',
    'Filter.1.Name': 'name', 'Filter.1.Value.1': 'al2023-ami-2023.*-x86_64',
    'Filter.2.Name': 'state', 'Filter.2.Value.1': 'available',
    'Filter.3.Name': 'architecture', 'Filter.3.Value.1': 'x86_64',
  });
  const re = /<imageId>([^<]+)<\/imageId>[\s\S]*?<creationDate>([^<]+)<\/creationDate>/g;
  let m: RegExpExecArray | null;
  let best: { id: string; date: string } | null = null;
  while ((m = re.exec(xml))) if (!best || m[2] > best.date) best = { id: m[1], date: m[2] };
  if (!best) throw new Error('no Amazon Linux 2023 AMI found');
  return best.id;
}

export interface ExportHelperParams {
  snapshotId: string;
  profileName: string;
  userData: string;
  rootSizeGb: number;
}

// Launch the throwaway converter instance. Self-terminates (shutdown behavior = terminate).
export async function runExportHelper(env: Env, p: ExportHelperParams): Promise<string> {
  if (!env.AWS_SUBNET_ID || !env.AWS_SECURITY_GROUP_ID) throw new Error('AWS network config missing (subnet / security group)');
  const ami = await latestAmazonLinux2023Ami(env);
  const params: Record<string, string> = {
    Action: 'RunInstances',
    ImageId: ami,
    InstanceType: 't3.medium',
    MinCount: '1',
    MaxCount: '1',
    'NetworkInterface.1.DeviceIndex': '0',
    'NetworkInterface.1.SubnetId': env.AWS_SUBNET_ID,
    'NetworkInterface.1.AssociatePublicIpAddress': 'true',
    'NetworkInterface.1.SecurityGroupId.1': env.AWS_SECURITY_GROUP_ID,
    'IamInstanceProfile.Name': p.profileName,
    InstanceInitiatedShutdownBehavior: 'terminate',
    UserData: btoa(unescape(encodeURIComponent(p.userData))),
    'BlockDeviceMapping.1.DeviceName': '/dev/xvda',
    'BlockDeviceMapping.1.Ebs.VolumeSize': String(Math.max(16, Math.ceil(p.rootSizeGb))),
    'BlockDeviceMapping.1.Ebs.VolumeType': 'gp3',
    'BlockDeviceMapping.1.Ebs.DeleteOnTermination': 'true',
    'TagSpecification.1.ResourceType': 'instance',
    'TagSpecification.1.Tag.1.Key': 'Name',
    'TagSpecification.1.Tag.1.Value': `gitvm-export-${p.snapshotId}`,
    'TagSpecification.1.Tag.2.Key': 'managed-by',
    'TagSpecification.1.Tag.2.Value': 'git-vm-portal-export',
  };
  const xml = await ec2(env, params);
  const id = extract(xml, 'instanceId');
  if (!id) throw new Error('RunInstances(export): no instanceId');
  return id;
}

// Running export helpers -> {id, launchTime} (reaper: kill any that overran).
export async function listExportHelpers(env: Env): Promise<{ id: string; launchTime: string }[]> {
  const xml = await ec2(env, {
    Action: 'DescribeInstances',
    'Filter.1.Name': 'tag:managed-by', 'Filter.1.Value.1': 'git-vm-portal-export',
    'Filter.2.Name': 'instance-state-name', 'Filter.2.Value.1': 'running', 'Filter.2.Value.2': 'pending',
  });
  const out: { id: string; launchTime: string }[] = [];
  const re = /<instanceId>([^<]+)<\/instanceId>[\s\S]*?<launchTime>([^<]+)<\/launchTime>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ id: m[1], launchTime: m[2] });
  return out;
}

// List instances managed by the portal -> { instanceId: state } (for reconciliation).
export async function listManagedInstances(env: Env): Promise<Record<string, string>> {
  const xml = await ec2(env, {
    Action: 'DescribeInstances',
    'Filter.1.Name': 'tag:managed-by',
    'Filter.1.Value.1': 'git-vm-portal',
  });
  const out: Record<string, string> = {};
  const re = /<instanceId>([^<]+)<\/instanceId>[\s\S]*?<instanceState>[\s\S]*?<name>([^<]+)<\/name>/g;
  let m;
  while ((m = re.exec(xml))) out[m[1]] = m[2];
  return out;
}
