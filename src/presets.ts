// A VM request is composed of three independent choices:
//   performance (instance type) × storage (disk) × OS (AMI).
// Prices are approximate on-demand rates for eu-central-2 (Zurich), USD.

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

export const PERF: Record<string, PerfPreset> = {
  eco: { id: 'eco', label: 'Eco · 2 vCPU / 2 Go', instanceType: 't3.small', vcpu: 2, ramGb: 2, hourlyUsd: 0.027 },
  std: { id: 'std', label: 'Standard · 2 vCPU / 4 Go', instanceType: 't3.medium', vcpu: 2, ramGb: 4, hourlyUsd: 0.054 },
  perf: { id: 'perf', label: 'Performance · 2 vCPU / 8 Go', instanceType: 't3.large', vcpu: 2, ramGb: 8, hourlyUsd: 0.107 },
  pro: { id: 'pro', label: 'Pro · 4 vCPU / 16 Go', instanceType: 't3.xlarge', vcpu: 4, ramGb: 16, hourlyUsd: 0.214 },
};

export const STORAGE: Record<string, StoragePreset> = {
  s20: { id: 's20', label: '20 Go SSD', sizeGb: 20 },
  s50: { id: 's50', label: '50 Go SSD', sizeGb: 50 },
  s100: { id: 's100', label: '100 Go SSD', sizeGb: 100 },
  s250: { id: 's250', label: '250 Go SSD', sizeGb: 250 },
};

export const OS: Record<string, OsPreset> = {
  ubuntu2404: { id: 'ubuntu2404', label: 'Ubuntu 24.04 LTS', ami: 'ami-06d105ac7e7acb6bf', sshUser: 'ubuntu' },
  ubuntu2204: { id: 'ubuntu2204', label: 'Ubuntu 22.04 LTS', ami: 'ami-0fd7f34c2a7d8427b', sshUser: 'ubuntu' },
  debian12: { id: 'debian12', label: 'Debian 12', ami: 'ami-09632a90fa7faa421', sshUser: 'admin' },
};

export const STORAGE_USD_GB_MONTH = 0.0952; // gp3, eu-central-2 (approx)
const HOURS_PER_MONTH = 730;

export const isValidPerf = (id: string) => Object.prototype.hasOwnProperty.call(PERF, id);
export const isValidStorage = (id: string) => Object.prototype.hasOwnProperty.call(STORAGE, id);
export const isValidOs = (id: string) => Object.prototype.hasOwnProperty.call(OS, id);

// Approximate monthly cost if the VM runs 24/7.
export function estimateMonthlyUsd(perfId: string, storageId: string): number {
  const p = PERF[perfId];
  const s = STORAGE[storageId];
  if (!p || !s) return 0;
  return p.hourlyUsd * HOURS_PER_MONTH + s.sizeGb * STORAGE_USD_GB_MONTH;
}
