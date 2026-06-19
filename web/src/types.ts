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
}
export interface StoragePreset {
  id: string;
  label: string;
  sizeGb: number;
}
export interface OsPreset {
  id: string;
  label: string;
  ami: string;
  sshUser: string;
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
  | 'failed'
  | 'terminated';

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
  public_ip?: string | null;
  ssh_key_name?: string | null;
  ssh_user?: string | null;
  aws_instance_id?: string | null;
  vm_state?: string | null;
  has_key?: number;
}
