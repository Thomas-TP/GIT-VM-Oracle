export type Role = 'member' | 'admin';

export interface User {
  email: string;
  name: string;
  role: Role;
}

export interface PerfPreset {
  id: string;
  label: string;
  instanceType: string;
  vcpu: number;
  ramGb: number;
  hourlyUsd: number;
  description?: string;
  recommended?: boolean;
  hidden?: boolean;
}
export interface StoragePreset {
  id: string;
  label: string;
  sizeGb: number;
  description?: string;
  recommended?: boolean;
  hidden?: boolean;
}
export type OsFamily = 'ubuntu' | 'debian' | 'amazon' | 'rocky' | 'alma' | 'windows';
export interface OsPreset {
  id: string;
  label: string;
  family: OsFamily;
  ami: string;
  sshUser: string;
  connect: 'ssh' | 'rdp';
  description?: string;
  recommended?: boolean;
  minStorageGb?: number;
  hidden?: boolean;
}

export interface PresetCatalog {
  perf: PerfPreset[];
  storage: StoragePreset[];
  os: OsPreset[];
  storageUsdGbMonth: number;
  region: string;
}

export type Status =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'provisioning'
  | 'active'
  | 'stopped'
  | 'failed'
  | 'terminated'
  | 'expired';

export interface AdminUser {
  email: string;
  name: string | null;
  role: Role;
  created_at: string;
}
export interface Comment {
  id: number;
  author: string;
  body: string;
  created_at: string;
}
export interface Metrics {
  total: number;
  successRate: number;
  failed: number;
  avgProvisionSeconds: number;
}
export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}

export interface VmRequest {
  id: number;
  user_email: string;
  purpose: string;
  preset: string; // performance preset id
  storage: string | null;
  os: string | null;
  region: string;
  status: Status;
  admin_note: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
  start_date: string | null;
  end_date: string | null;
  expired_at: string | null;
  ext_requested_end?: string | null;
  ext_requested_at?: string | null;
  schedule_enabled?: number;
  schedule_start?: string | null;
  schedule_stop?: string | null;
  schedule_days?: string | null;
  schedule_paused?: number;
  public_ip?: string | null;
  ssh_key_name?: string | null;
  ssh_user?: string | null;
  aws_instance_id?: string | null;
  vm_state?: string | null;
  has_key?: number;
  connect_method?: string | null;
  has_password?: number;
}
