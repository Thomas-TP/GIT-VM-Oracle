export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // Public config (wrangler.jsonc vars)
  ALLOWED_EMAIL_DOMAINS: string; // comma-separated, e.g. "satom.ch,git.swiss"
  ADMIN_EMAILS: string; // comma-separated
  ENTRA_TENANT_ID: string;
  ENTRA_CLIENT_ID: string;

  AWS_REGION: string;
  AWS_AMI_ID: string;
  AWS_SUBNET_ID: string;
  AWS_SECURITY_GROUP_ID: string;
  AWS_KEY_NAME: string;
  AWS_EXPORT_BUCKET?: string; // S3 bucket for one-click snapshot disk exports (.vmdk/.vdi)
  AWS_EXPORT_PROFILE?: string; // IAM instance profile name for the export helper

  APP_URL: string;
  GRAFANA_URL?: string; // optional: link shown in the admin Monitoring tab
  MAIL_ENABLED: string; // "true" | "false"
  SCHEDULED_STOP: string; // "true" | "false" — stop running VMs at 19:00 UTC
  SENTRY_DSN?: string; // optional error reporting
  EMAILJS_PUBLIC_KEY: string;
  EMAILJS_SERVICE_ID: string;
  EMAILJS_TEMPLATE_ID: string;

  // Secrets (wrangler secret put ...)
  ENTRA_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  EMAILJS_PRIVATE_KEY: string;
  GRAFANA_TOKEN?: string; // bearer token for the /api/monitoring/* endpoints (Grafana)
}

export interface SessionUser {
  email: string;
  name: string;
  role: 'member' | 'admin';
}

export interface VmRequestRow {
  id: number;
  user_email: string;
  name: string | null;
  purpose: string;
  preset: string; // performance preset id (eco/std/perf/pro)
  storage: string | null;
  os: string | null;
  region: string;
  status: string;
  course: string | null;
  course_ready_at: string | null;
  group_id: string | null;
  group_name: string | null;
  snapshot_on_delete: number;
  admin_note: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
  start_date: string | null;
  end_date: string | null;
  expired_at: string | null;
  ext_requested_end: string | null;
  ext_requested_at: string | null;
  // auto start/stop schedule (Europe/Zurich)
  schedule_enabled?: number;
  schedule_start?: string | null;
  schedule_stop?: string | null;
  schedule_days?: string | null;
  // joined from vms (nullable)
  public_ip?: string | null;
  ssh_key_name?: string | null;
  ssh_user?: string | null;
}
