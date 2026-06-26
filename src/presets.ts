// A VM request is composed of three independent choices:
//   performance (OCI shape) × storage (boot volume) × OS (image).
// Prices are approximate on-demand rates for OCI eu-zurich-1 (Zurich), USD.

export interface PerfPreset {
  id: string;
  label: string;
  /** OCI compute shape, e.g. VM.Standard.E4.Flex or VM.Standard.E2.1.Micro. */
  shape: string;
  /** OCPUs for flexible shapes (omit for fixed shapes like E2.1.Micro). */
  ocpus?: number;
  /** Memory (GB) for flexible shapes. */
  memoryGb?: number;
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
  family: 'ubuntu' | 'debian' | 'amazon' | 'rocky' | 'alma' | 'windows' | 'oracle';
  /** OCI platform image OCID (region-specific; refresh via scripts/oci-images.mjs). */
  image: string;
  /** Login user for SSH. For Windows this is the RDP user (opc on OCI). */
  sshUser: string;
  /** How the user connects to the machine. */
  connect: 'ssh' | 'rdp';
  description?: string;
  recommended?: boolean;
  /** Minimum boot volume for this OS (OCI Windows needs ≥ 256 Go). */
  minStorageGb?: number;
  /** Kept for resolving existing requests but hidden from the picker. */
  hidden?: boolean;
}

// Catalogue OCI complet (x86 AMD). `micro` = VM.Standard.E2.1.Micro (Always Free,
// shape fixe, pas de shapeConfig). Les autres = shapes flexibles E4/E5 (OCPU + RAM
// configurables). 1 OCPU = 2 vCPU (threads) sur les shapes AMD. Tarifs PAYG approx. USD :
// E4 ≈ 0.025 $/OCPU·h, E5 ≈ 0.03 $/OCPU·h, mémoire ≈ 0.0015 $/GB·h.
export const PERF: Record<string, PerfPreset> = {
  micro: { id: 'micro', label: 'Micro (gratuit)', shape: 'VM.Standard.E2.1.Micro', vcpu: 1, ramGb: 1, hourlyUsd: 0, description: 'Always Free — 1 OCPU / 1 Go. Tests légers, scripts, apprentissage.' },
  eco: { id: 'eco', label: 'Eco', shape: 'VM.Standard.E5.Flex', ocpus: 1, memoryGb: 8, vcpu: 2, ramGb: 8, hourlyUsd: 0.037, description: '1 OCPU / 8 Go — petits services, dev.' },
  std: { id: 'std', label: 'Standard', shape: 'VM.Standard.E5.Flex', ocpus: 2, memoryGb: 16, vcpu: 4, ramGb: 16, hourlyUsd: 0.074, description: '2 OCPU / 16 Go — la plupart des cours, Windows, conteneurs.', recommended: true },
  perf: { id: 'perf', label: 'Performance', shape: 'VM.Standard.E5.Flex', ocpus: 4, memoryGb: 32, vcpu: 8, ramGb: 32, hourlyUsd: 0.168, description: '4 OCPU / 32 Go — compilation, bases de données, charges soutenues.' },
  pro: { id: 'pro', label: 'Pro', shape: 'VM.Standard.E5.Flex', ocpus: 8, memoryGb: 64, vcpu: 16, ramGb: 64, hourlyUsd: 0.336, description: '8 OCPU / 64 Go — gros builds, data, clusters de test.' },
  max: { id: 'max', label: 'Max', shape: 'VM.Standard.E5.Flex', ocpus: 16, memoryGb: 128, vcpu: 32, ramGb: 128, hourlyUsd: 0.672, description: '16 OCPU / 128 Go — charges intensives ponctuelles.' },
};

// Boot volumes OCI : minimum 50 Go ; les images Windows exigent ≥ 256 Go.
// Tarif block volume ≈ 0.0255 $/GB·mois (balanced 10 VPU/GB).
export const STORAGE: Record<string, StoragePreset> = {
  s50: { id: 's50', label: '50 Go SSD', sizeGb: 50, description: 'Minimum OCI — suffisant pour un OS Linux + outils.', recommended: true },
  s100: { id: 's100', label: '100 Go SSD', sizeGb: 100, description: 'Confortable pour la plupart des cours.' },
  s256: { id: 's256', label: '256 Go SSD', sizeGb: 256, description: 'Requis pour Windows ; large pour Linux.' },
  s500: { id: 's500', label: '500 Go SSD', sizeGb: 500, description: 'Gros volumes de données.' },
  s1000: { id: 's1000', label: '1 To SSD', sizeGb: 1000, description: 'Stockage maximal.' },
};

// Images plateforme OCI : OCID concrets eu-zurich-1, découverts via DescribeImages
// (scripts/oci-images.mjs). Relancer ce script pour les rafraîchir quand elles périment.
// Une seule entrée par famille (pas de doublon de version). Debian/Rocky/Alma ne sont
// pas des images plateforme OCI (uniquement Marketplace) → non incluses.
export const OS: Record<string, OsPreset> = {
  ubuntu2404: { id: 'ubuntu2404', label: 'Ubuntu 24.04 LTS', family: 'ubuntu', image: 'ocid1.image.oc1.eu-zurich-1.aaaaaaaaignjzveoer62n236fcgyvotv774g5227cgcjvgqtugfrfx5srvha', sshUser: 'ubuntu', connect: 'ssh', description: 'La distribution Linux la plus répandue. Idéale pour débuter.', recommended: true },
  oracle9: { id: 'oracle9', label: 'Oracle Linux 9', family: 'oracle', image: 'ocid1.image.oc1.eu-zurich-1.aaaaaaaaj4hbqrxfogjhixt4ojtzhwp7pqphzrv2jqo7cfkzegvgk7zxtzda', sshUser: 'opc', connect: 'ssh', description: 'Base RHEL d’Oracle, optimisée pour OCD (dnf/yum). Support long terme.' },
  windows2022: { id: 'windows2022', label: 'Windows Server 2022', family: 'windows', image: 'ocid1.image.oc1.eu-zurich-1.aaaaaaaanrw7bmj2aeab2zvviznxrfvt4w5uxm2j6bmgikmbpp5j5iwbrclq', sshUser: 'opc', connect: 'rdp', minStorageGb: 256, description: 'Édition serveur : rôles, services, Active Directory, IIS. Accès RDP (utilisateur opc).' },
};

// Bundles d'outils par cours, préinstallés sur la VM via cloud-init au premier
// démarrage. MULTI-DISTRO : le header détecte apt / dnf / yum (Ubuntu/Debian ET
// Amazon Linux / Rocky / Alma) et expose `pm` qui installe chaque paquet
// individuellement, tolérant (on passe les noms apt ET dnf, le mauvais est ignoré).
// Les gros outils cloud/devops passent par leurs installeurs officiels (binaires,
// distro-agnostiques). Windows = Chocolatey (buildWindowsCourseInstall).
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
  'if command -v apt-get >/dev/null 2>&1; then',
  '  export DEBIAN_FRONTEND=noninteractive; apt-get update -y || true',
  '  pm() { for p in "$@"; do apt-get install -y "$p" || true; done; }',
  'elif command -v dnf >/dev/null 2>&1; then',
  '  dnf install -y dnf-plugins-core || true',
  '  pm() { for p in "$@"; do dnf install -y "$p" || true; done; }',
  'elif command -v yum >/dev/null 2>&1; then',
  '  pm() { for p in "$@"; do yum install -y "$p" || true; done; }',
  'else',
  '  pm() { :; }',
  'fi',
].join('\n');

// Cross-distro installers (apt & dnf systems, x86_64).
const DOCKER = 'curl -fsSL https://get.docker.com | sh || true';
const KUBECTL = 'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && install -m 0755 kubectl /usr/local/bin/kubectl || true';
const HELM = 'curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash || true';
const MINIKUBE = 'curl -Lo /usr/local/bin/minikube https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && chmod +x /usr/local/bin/minikube || true';
const TERRAFORM = 'pm unzip; curl -fsSL https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_amd64.zip -o /tmp/tf.zip && unzip -o /tmp/tf.zip -d /usr/local/bin/ || true';
const AWSCLI = 'pm unzip; curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/aws.zip && unzip -q /tmp/aws.zip -d /tmp && /tmp/aws/install || true';
const GCLOUD = 'curl -sSL https://sdk.cloud.google.com | bash || true';
const NODE = 'if command -v apt-get >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y nodejs; else curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - && (dnf install -y nodejs || yum install -y nodejs); fi || true';
const AZURE = 'if command -v apt-get >/dev/null 2>&1; then curl -sL https://aka.ms/InstallAzureCLIDeb | bash; else rpm --import https://packages.microsoft.com/keys/microsoft.asc && dnf install -y https://packages.microsoft.com/config/rhel/9/packages-microsoft-prod.rpm && dnf install -y azure-cli; fi || true';
const pip = (pkgs: string) => `python3 -m pip install --break-system-packages ${pkgs} 2>/dev/null || python3 -m pip install ${pkgs} || true`;

export const COURSES: Record<string, CoursePreset> = {
  cloud: {
    id: 'cloud',
    label: 'Cloud & DevOps',
    description: 'Azure CLI, AWS CLI, Google Cloud CLI, Terraform, kubectl, Docker, Helm, Ansible.',
    tools: ['Azure CLI', 'AWS CLI', 'gcloud', 'Terraform', 'kubectl', 'Docker', 'Helm', 'Ansible'],
    install: [
      'pm git curl unzip ca-certificates python3 python3-pip',
      DOCKER, AZURE, AWSCLI, GCLOUD, TERRAFORM, KUBECTL, HELM,
      `pm ansible; command -v ansible >/dev/null 2>&1 || ${pip('ansible')}`,
    ].join('\n'),
  },
  web: {
    id: 'web',
    label: 'Développement Web',
    description: 'Node.js LTS, npm, Git, Nginx, Python 3, build-essential.',
    tools: ['Node.js LTS', 'npm', 'Git', 'Nginx', 'Python 3', 'build-essential'],
    install: [
      'pm git nginx python3 python3-pip build-essential gcc gcc-c++ make',
      NODE,
    ].join('\n'),
  },
  data: {
    id: 'data',
    label: 'Data Science & IA',
    description: 'Python 3, Jupyter, NumPy, pandas, matplotlib, scikit-learn, R.',
    tools: ['Python 3', 'Jupyter', 'NumPy', 'pandas', 'matplotlib', 'scikit-learn', 'R'],
    install: [
      'pm python3 python3-pip python3-venv r-base R',
      pip('jupyter numpy pandas matplotlib scikit-learn seaborn'),
    ].join('\n'),
  },
  containers: {
    id: 'containers',
    label: 'Conteneurs & Kubernetes',
    description: 'Docker, kubectl, minikube, Helm, k9s.',
    tools: ['Docker', 'kubectl', 'minikube', 'Helm', 'k9s'],
    install: [DOCKER, KUBECTL, MINIKUBE, HELM].join('\n'),
  },
  cyber: {
    id: 'cyber',
    label: 'Cybersécurité',
    description: 'nmap, tshark, hydra, john, tcpdump, nikto, net-tools, whois, dnsutils.',
    tools: ['nmap', 'tshark', 'hydra', 'john', 'tcpdump', 'nikto', 'net-tools', 'whois'],
    install: ['pm nmap tshark wireshark-cli hydra john tcpdump nikto net-tools whois dnsutils bind-utils'].join('\n'),
  },
  db: {
    id: 'db',
    label: 'Bases de données',
    description: 'PostgreSQL, MariaDB (MySQL), Redis, SQLite.',
    tools: ['PostgreSQL', 'MariaDB', 'Redis', 'SQLite'],
    install: ['pm postgresql postgresql-server mariadb-server mariadb redis redis-server sqlite sqlite3'].join('\n'),
  },
  sysadmin: {
    id: 'sysadmin',
    label: 'Système & Réseau',
    description: 'net-tools, tcpdump, nmap, htop, tmux, rsync, iperf3, traceroute, vim.',
    tools: ['net-tools', 'tcpdump', 'nmap', 'htop', 'tmux', 'rsync', 'iperf3', 'traceroute'],
    install: ['pm net-tools tcpdump nmap htop tmux rsync openssh-client openssh-clients iperf3 traceroute vim'].join('\n'),
  },
  cpp: {
    id: 'cpp',
    label: 'Programmation C / C++',
    description: 'gcc, g++, gdb, make, cmake, valgrind, build-essential.',
    tools: ['gcc', 'g++', 'gdb', 'make', 'cmake', 'valgrind'],
    install: ['pm build-essential gcc gcc-c++ make gdb cmake valgrind'].join('\n'),
  },
  java: {
    id: 'java',
    label: 'Java',
    description: 'OpenJDK 17, Maven, Gradle.',
    tools: ['OpenJDK 17', 'Maven', 'Gradle'],
    install: ['pm openjdk-17-jdk java-17-openjdk java-17-openjdk-devel maven gradle'].join('\n'),
  },
  python: {
    id: 'python',
    label: 'Python',
    description: 'Python 3, pip, venv, pipx, IPython, Jupyter.',
    tools: ['Python 3', 'pip', 'venv', 'pipx', 'IPython', 'Jupyter'],
    install: [
      'pm python3 python3-pip python3-venv pipx',
      pip('ipython jupyter'),
    ].join('\n'),
  },
};

export const isValidCourse = (id: string) => id === '' || Object.prototype.hasOwnProperty.call(COURSES, id);
// Accept a comma-separated list of course ids (or empty). Used by multi-select.
export const isValidCourses = (csv: string) =>
  (csv ?? '').split(',').map((s) => s.trim()).filter(Boolean).every((id) => Object.prototype.hasOwnProperty.call(COURSES, id));

// cloud-init user-data installing the tools of one OR several courses (CSV ids). Linux.
// undefined if no valid course. Header runs once, then each course's install block.
export function buildCourseUserData(courses: string | null | undefined): string | undefined {
  const ids = (courses ?? '').split(',').map((s) => s.trim()).filter((id) => COURSES[id]);
  if (!ids.length) return undefined;
  const installs = ids.map((id) => COURSES[id].install).join('\n');
  return `${COURSE_SCRIPT_HEADER}\n${installs}\n`;
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

// PowerShell that installs Chocolatey then the tools of one OR several courses (CSV ids).
// Windows. undefined if none. Packages from all selected courses are merged + de-duplicated.
export function buildWindowsCourseInstall(courses: string | null | undefined): string | undefined {
  const ids = (courses ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const pkgs = [...new Set(ids.flatMap((id) => (COURSE_WIN[id] ?? '').split(' ').filter(Boolean)))].join(' ');
  if (!pkgs) return undefined;
  return [
    "Set-ExecutionPolicy Bypass -Scope Process -Force",
    "[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072",
    "iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))",
    `choco install -y --no-progress ${pkgs}`,
  ].join('\n');
}

export const STORAGE_USD_GB_MONTH = 0.0255; // OCI block volume, balanced 10 VPU/GB (approx)
export const HOURS_PER_MONTH = 730;

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
