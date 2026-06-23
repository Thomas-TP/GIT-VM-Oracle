// One-off: grant the Worker user (Claude) CloudWatch read for idle auto-stop.
// Run locally with the AWS creds in env:
//   $env:AWS_ACCESS_KEY_ID='...'; $env:AWS_SECRET_ACCESS_KEY='...'; node scripts/aws-iam-cloudwatch.mjs
import { AwsClient } from 'aws4fetch';

const USER = process.env.AWS_WORKER_USER || 'Claude';
const iam = new AwsClient({ accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, region: 'us-east-1', service: 'iam' });

const policy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Action: ['cloudwatch:GetMetricStatistics'], Resource: '*' }],
});
const body = new URLSearchParams({ Version: '2010-05-08', Action: 'PutUserPolicy', UserName: USER, PolicyName: 'gitvm-idle-cloudwatch', PolicyDocument: policy }).toString();
const r = await iam.fetch('https://iam.amazonaws.com/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
console.log(r.ok ? `✅ CloudWatch read accordé au user ${USER}` : `ERR ${r.status}: ${(await r.text()).slice(0, 300)}`);
