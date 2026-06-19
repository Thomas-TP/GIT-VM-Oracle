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

  APP_URL: string;
  MAIL_ENABLED: string; // "true" | "false"
  EMAILJS_PUBLIC_KEY: string;
  EMAILJS_SERVICE_ID: string;
  EMAILJS_TEMPLATE_ID: string;

  // Secrets (wrangler secret put ...)
  ENTRA_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  EMAILJS_PRIVATE_KEY: string;
}

export interface SessionUser {
  email: string;
  name: string;
  role: 'member' | 'admin';
}

export interface VmRequestRow {
  id: number;
  user_email: string;
  purpose: string;
  preset: string; // performance preset id (eco/std/perf/pro)
  storage: string | null;
  os: string | null;
  region: string;
  status: string;
  admin_note: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
  // joined from vms (nullable)
  public_ip?: string | null;
  ssh_key_name?: string | null;
  ssh_user?: string | null;
}
