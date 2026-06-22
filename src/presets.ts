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
  description?: string;
  recommended?: boolean;
  /** Kept for resolving existing requests but hidden from the picker. */
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
export interface OsPreset {
  id: string;
  label: string;
  /** Distribution family — drives the icon/colour in the picker. */
  family: 'ubuntu' | 'debian' | 'amazon' | 'rocky' | 'alma' | 'windows';
  ami: string;
  /** Login user for SSH. For Windows this is the RDP user (Administrator). */
  sshUser: string;
  /** How the user connects to the machine. */
  connect: 'ssh' | 'rdp';
  description?: string;
  recommended?: boolean;
  /** Minimum root disk for this OS (Windows needs ≥ 30 Go). */
  minStorageGb?: number;
  /** Kept for resolving existing requests but hidden from the picker. */
  hidden?: boolean;
}

// Free-Tier only: the AWS account is restricted to free-tier-eligible instance
// types (verified via scripts/aws-freetier.mjs). x86_64 only (our AMIs are x86_64,
// so the t4g/ARM free types are excluded). Legacy ids are kept hidden and remapped
// to a free-tier type so existing requests still provision.
export const PERF: Record<string, PerfPreset> = {
  micro: { id: 'micro', label: 'Micro', instanceType: 't3.micro', vcpu: 2, ramGb: 1, hourlyUsd: 0.0136, description: 'Free Tier — tests légers, scripts, apprentissage.' },
  small: { id: 'small', label: 'Small', instanceType: 't3.small', vcpu: 2, ramGb: 2, hourlyUsd: 0.0272, description: 'Free Tier — petits services, dev, la plupart des cours.', recommended: true },
  flex: { id: 'flex', label: 'Flex', instanceType: 'c7i-flex.large', vcpu: 2, ramGb: 4, hourlyUsd: 0.0907, description: 'Free Tier — 4 Go, plus confortable (Windows, conteneurs).' },
  // Legacy (hidden) — remappés vers un type Free Tier pour les demandes existantes.
  eco: { id: 'eco', label: 'Eco', instanceType: 't3.small', vcpu: 2, ramGb: 2, hourlyUsd: 0.0272, hidden: true },
  std: { id: 'std', label: 'Standard', instanceType: 't3.small', vcpu: 2, ramGb: 2, hourlyUsd: 0.0272, hidden: true },
  perf: { id: 'perf', label: 'Performance', instanceType: 'c7i-flex.large', vcpu: 2, ramGb: 4, hourlyUsd: 0.0907, hidden: true },
  pro: { id: 'pro', label: 'Pro', instanceType: 'c7i-flex.large', vcpu: 2, ramGb: 4, hourlyUsd: 0.0907, hidden: true },
  max: { id: 'max', label: 'Max', instanceType: 'c7i-flex.large', vcpu: 2, ramGb: 4, hourlyUsd: 0.0907, hidden: true },
};

// Free-Tier EBS = 30 Go. On reste ≤ 30 Go ; les tailles supérieures (payantes) sont
// conservées masquées pour résoudre les demandes existantes.
export const STORAGE: Record<string, StoragePreset> = {
  s20: { id: 's20', label: '20 Go SSD', sizeGb: 20, description: 'Free Tier — suffisant pour un OS Linux + outils.' },
  s30: { id: 's30', label: '30 Go SSD', sizeGb: 30, description: 'Free Tier — maximum gratuit, requis pour Windows.', recommended: true },
  s50: { id: 's50', label: '50 Go SSD', sizeGb: 50, hidden: true },
  s100: { id: 's100', label: '100 Go SSD', sizeGb: 100, hidden: true },
  s250: { id: 's250', label: '250 Go SSD', sizeGb: 250, hidden: true },
  s500: { id: 's500', label: '500 Go SSD', sizeGb: 500, hidden: true },
};

// All AMIs are concrete eu-central-2 IDs verified via DescribeImages
// (scripts/aws-amis.mjs). Run that script to refresh them when they age out.
export const OS: Record<string, OsPreset> = {
  ubuntu2404: { id: 'ubuntu2404', label: 'Ubuntu 24.04 LTS', family: 'ubuntu', ami: 'ami-06d105ac7e7acb6bf', sshUser: 'ubuntu', connect: 'ssh', description: 'La distribution Linux la plus répandue. Idéale pour débuter.', recommended: true },
  debian12: { id: 'debian12', label: 'Debian 12 (Bookworm)', family: 'debian', ami: 'ami-09632a90fa7faa421', sshUser: 'admin', connect: 'ssh', description: 'Stable et légère, la référence des serveurs.' },
  al2023: { id: 'al2023', label: 'Amazon Linux 2023', family: 'amazon', ami: 'ami-0255eb7098bd657ae', sshUser: 'ec2-user', connect: 'ssh', description: 'Optimisée pour AWS, base RHEL, support long terme.' },
  rocky9: { id: 'rocky9', label: 'Rocky Linux 9', family: 'rocky', ami: 'ami-03326408f81d44297', sshUser: 'rocky', connect: 'ssh', description: 'Compatible RHEL, parfaite pour l’entreprise (dnf/yum).' },
  alma9: { id: 'alma9', label: 'AlmaLinux 9', family: 'alma', ami: 'ami-03668eab0636b8430', sshUser: 'ec2-user', connect: 'ssh', description: 'Clone RHEL communautaire, stable et pérenne.' },
  windows2022: { id: 'windows2022', label: 'Windows Server 2022', family: 'windows', ami: 'ami-0cbe390e7c8ac76e2', sshUser: 'Administrator', connect: 'rdp', minStorageGb: 30, description: 'Édition serveur : rôles, services, Active Directory, IIS. Accès RDP.' },
  // « Poste de travail » : Windows Server 2025 avec expérience Bureau (GUI complet via RDP).
  // EC2 ne propose pas de Windows 10/11 client (licence) ; le Full Base = bureau Windows utilisable.
  windowsDesktop: { id: 'windowsDesktop', label: 'Windows · Poste de travail', family: 'windows', ami: 'ami-09b747e7c8f4d2cd6', sshUser: 'Administrator', connect: 'rdp', minStorageGb: 30, description: 'Bureau Windows complet (Windows Server 2025, expérience Bureau) pour usage utilisateur. Accès RDP.' },
  // Hidden: kept so existing requests still resolve, removed from the picker
  // (Ubuntu 24.04 is the single Ubuntu choice now).
  ubuntu2204: { id: 'ubuntu2204', label: 'Ubuntu 22.04 LTS', family: 'ubuntu', ami: 'ami-0fd7f34c2a7d8427b', sshUser: 'ubuntu', connect: 'ssh', hidden: true },
};

// Bundles d'outils par cours, préinstallés sur la VM (Linux) via cloud-init au
// premier démarrage. Optimisé Ubuntu/Debian (apt) + installeurs officiels
// (distro-agnostiques) pour les outils cloud. `install` = corps bash exécuté
// après COURSE_SCRIPT_HEADER. Tout est tolérant aux erreurs (|| true).
export interface CoursePreset {
  id: string;
  label: string;
  description: string;
  tools: string[];
  install: string;
}

export const COURSE_SCRIPT_HEADER = [
  '#!/bin/bash',
  'set -x',
  'export DEBIAN_FRONTEND=noninteractive',
  'apt-get update -y || true',
  'APT="apt-get install -y"',
].join('\n');

const PIP = 'pip3 install --break-system-packages';

export const COURSES: Record<string, CoursePreset> = {
  cloud: {
    id: 'cloud',
    label: 'Cloud & DevOps',
    description: 'Azure CLI, AWS CLI, Google Cloud CLI, Terraform, kubectl, Docker, Helm, Ansible.',
    tools: ['Azure CLI', 'AWS CLI', 'gcloud', 'Terraform', 'kubectl', 'Docker', 'Helm', 'Ansible'],
    install: [
      '$APT git curl unzip apt-transport-https ca-certificates gnupg lsb-release || true',
      'curl -fsSL https://get.docker.com | sh || true',
      'curl -sL https://aka.ms/InstallAzureCLIDeb | bash || true',
      'curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/aws.zip && unzip -q /tmp/aws.zip -d /tmp && /tmp/aws/install || true',
      'curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp.gpg && echo "deb [signed-by=/usr/share/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" > /etc/apt/sources.list.d/hashicorp.list && apt-get update -y && $APT terraform || true',
      'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && install -m 0755 kubectl /usr/local/bin/kubectl || true',
      'curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash || true',
      '$APT ansible || true',
    ].join('\n'),
  },
  web: {
    id: 'web',
    label: 'Développement Web',
    description: 'Node.js LTS, npm, Git, Nginx, Python 3, build-essential.',
    tools: ['Node.js LTS', 'npm', 'Git', 'Nginx', 'Python 3', 'build-essential'],
    install: [
      '$APT git build-essential nginx python3 python3-pip || true',
      'curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && $APT nodejs || true',
    ].join('\n'),
  },
  data: {
    id: 'data',
    label: 'Data Science & IA',
    description: 'Python 3, Jupyter, NumPy, pandas, matplotlib, scikit-learn, R.',
    tools: ['Python 3', 'Jupyter', 'NumPy', 'pandas', 'matplotlib', 'scikit-learn', 'R'],
    install: [
      '$APT python3 python3-pip python3-venv r-base || true',
      `${PIP} jupyter numpy pandas matplotlib scikit-learn seaborn || pip3 install jupyter numpy pandas matplotlib scikit-learn seaborn || true`,
    ].join('\n'),
  },
  containers: {
    id: 'containers',
    label: 'Conteneurs & Kubernetes',
    description: 'Docker, kubectl, minikube, Helm, k9s.',
    tools: ['Docker', 'kubectl', 'minikube', 'Helm', 'k9s'],
    install: [
      'curl -fsSL https://get.docker.com | sh || true',
      'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && install -m 0755 kubectl /usr/local/bin/kubectl || true',
      'curl -Lo /usr/local/bin/minikube https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && chmod +x /usr/local/bin/minikube || true',
      'curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash || true',
    ].join('\n'),
  },
  cyber: {
    id: 'cyber',
    label: 'Cybersécurité',
    description: 'nmap, tshark, hydra, john, tcpdump, nikto, net-tools, whois, dnsutils.',
    tools: ['nmap', 'tshark', 'hydra', 'john', 'tcpdump', 'nikto', 'net-tools', 'whois'],
    install: ['$APT nmap tshark hydra john tcpdump nikto net-tools whois dnsutils || true'].join('\n'),
  },
  db: {
    id: 'db',
    label: 'Bases de données',
    description: 'PostgreSQL, MariaDB (MySQL), Redis, SQLite.',
    tools: ['PostgreSQL', 'MariaDB', 'Redis', 'SQLite'],
    install: ['$APT postgresql mariadb-server redis-server sqlite3 || true'].join('\n'),
  },
  sysadmin: {
    id: 'sysadmin',
    label: 'Système & Réseau',
    description: 'net-tools, tcpdump, nmap, htop, tmux, rsync, iperf3, traceroute, vim.',
    tools: ['net-tools', 'tcpdump', 'nmap', 'htop', 'tmux', 'rsync', 'iperf3', 'traceroute'],
    install: ['$APT net-tools tcpdump nmap htop tmux rsync openssh-client iperf3 traceroute vim || true'].join('\n'),
  },
  cpp: {
    id: 'cpp',
    label: 'Programmation C / C++',
    description: 'gcc, g++, gdb, make, cmake, valgrind, build-essential.',
    tools: ['gcc', 'g++', 'gdb', 'make', 'cmake', 'valgrind'],
    install: ['$APT build-essential gdb cmake valgrind || true'].join('\n'),
  },
  java: {
    id: 'java',
    label: 'Java',
    description: 'OpenJDK 17, Maven, Gradle.',
    tools: ['OpenJDK 17', 'Maven', 'Gradle'],
    install: ['$APT openjdk-17-jdk maven gradle || true'].join('\n'),
  },
  python: {
    id: 'python',
    label: 'Python',
    description: 'Python 3, pip, venv, pipx, IPython, Jupyter.',
    tools: ['Python 3', 'pip', 'venv', 'pipx', 'IPython', 'Jupyter'],
    install: [
      '$APT python3 python3-pip python3-venv pipx || true',
      `${PIP} ipython jupyter || pip3 install ipython jupyter || true`,
    ].join('\n'),
  },
};

export const isValidCourse = (id: string) => id === '' || Object.prototype.hasOwnProperty.call(COURSES, id);

// cloud-init user-data installing a course's tools (Linux only). undefined if no course.
export function buildCourseUserData(courseId: string | null | undefined): string | undefined {
  if (!courseId) return undefined;
  const c = COURSES[courseId];
  if (!c) return undefined;
  return `${COURSE_SCRIPT_HEADER}\n${c.install}\n`;
}

// Windows (Chocolatey) package mapping per course — best effort equivalents.
const COURSE_WIN: Record<string, string> = {
  cloud: 'git azure-cli awscli gcloudsdk terraform kubernetes-cli kubernetes-helm docker-cli docker-engine',
  web: 'git nodejs-lts nginx python',
  data: 'python r.project',
  containers: 'docker-cli docker-engine kubernetes-cli minikube kubernetes-helm',
  cyber: 'nmap wireshark',
  db: 'postgresql sqlite',
  sysadmin: 'nmap wireshark putty sysinternals',
  cpp: 'mingw cmake',
  java: 'temurin17 maven gradle',
  python: 'python',
};

// PowerShell that installs Chocolatey then the course's tools (Windows). undefined if none.
export function buildWindowsCourseInstall(courseId: string | null | undefined): string | undefined {
  const pkgs = courseId ? COURSE_WIN[courseId] : undefined;
  if (!pkgs) return undefined;
  return [
    "Set-ExecutionPolicy Bypass -Scope Process -Force",
    "[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072",
    "iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))",
    `choco install -y --no-progress ${pkgs}`,
  ].join('\n');
}

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
